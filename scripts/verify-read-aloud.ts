// Isolated HTTP/browser verification. Boots only via `dev`; never modifies the
// owner's database. --live additionally checks both configured Voxtral voices.
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:net'
import Database from 'better-sqlite3'
import { chromium } from 'playwright'
import { buildNarration } from '../lib/narration/manifest'

const run = promisify(execFile)
function wav() {
  const rate=16000, samples=rate*3, b=Buffer.alloc(44+samples*2)
  b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16)
  b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(rate,24);b.writeUInt32LE(rate*2,28)
  b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(samples*2,40)
  for(let i=0;i<samples;i++)b.writeInt16LE(Math.round(Math.sin(i*2*Math.PI*220/rate)*100),44+i*2)
  return b
}
async function freePort() { const s=createServer();await new Promise<void>(r=>s.listen(0,'127.0.0.1',r));const port=(s.address() as {port:number}).port;await new Promise<void>(r=>s.close(()=>r()));return port }

async function main() {
  const dir=await mkdtemp(join(tmpdir(),'pylot-reader-verify-'))
  const dbPath=join(dir,'pylot.db')
  const owner=new Database('data/pylot.db',{readonly:true})
  await owner.backup(dbPath);owner.close()
  const scratch=new Database(dbPath)
  // A known profile/theme, without assuming the auth implementation's user ID.
  scratch.prepare("UPDATE users SET settings=?").run(JSON.stringify({theme:'cyber',profile:{background:'js'},reader:{voice:'a',speed:1}}))
  const port=await freePort(), base=`http://localhost:${port}`
  // A separate launcher root/name preserves an owner's running dev server.
  await writeFile(join(dir,'.devserver.json'), JSON.stringify({default:'reader-verification',targets:{
    'reader-verification':{dir:process.cwd(),cmd:'npm run dev',port,health_path:'/',env:{
      PYLOT_DB_PATH:dbPath,PYLOT_DIST_DIR:'.next-verify-tts',PYLOT_TTS_CACHE_DIR:join(dir,'cache'),
    }},
  }}))
  let started=false
  const browser=await chromium.launch({headless:true})
  try {
    const env={...process.env,PYLOT_DB_PATH:dbPath,PYLOT_DIST_DIR:'.next-verify-tts',PYLOT_TTS_CACHE_DIR:join(dir,'cache')}
    await run('dev',['start','reader-verification','--port',String(port),'--detach','--json','--yes','-C',dir],{env,timeout:120000})
    started=true
    const page=await browser.newPage({viewport:{width:1440,height:1000}})
    const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message))
    await page.addInitScript(()=>{
      const NativeAudio=window.Audio
      window.Audio=function(src?:string){const a=new NativeAudio(src);(window as unknown as {testAudio:HTMLAudioElement}).testAudio=a;return a} as unknown as typeof Audio
    })
    let requests=0, failNext=false, delayNext=false
    const fixture=wav()
    await page.route('**/api/tts',async route=>{
      requests++
      if(failNext){failNext=false;await route.fulfill({status:502,json:{error:'Fixture provider failure. Try again.'}});return}
      if(delayNext){delayNext=false;await new Promise(r=>setTimeout(r,500))}
      await route.fulfill({status:200,contentType:'audio/wav',body:fixture}).catch(()=>{})
    })
    async function openLesson() {
      await page.goto(`${base}/learn/py-basics/00-hello`)
      const toggle=page.getByTestId('briefing-toggle')
      if(await toggle.getAttribute('aria-expanded')==='false') await toggle.click()
      await page.getByTestId('tts-play').waitFor()
    }
    async function state(value:string) { await page.waitForFunction(v=>document.querySelector('[data-testid="lesson-reader"]')?.getAttribute('data-status')===v,value) }
    const audioState=()=>page.evaluate(()=>{const a=(window as unknown as {testAudio:HTMLAudioElement}).testAudio;return {time:a.currentTime,paused:a.paused,rate:a.playbackRate}})
    await openLesson()
    assert.equal(await page.locator('pre [data-narration-id]').count(),0)
    assert.equal(await page.locator('.tts-active').count(),0)
    const segments=await page.locator('[data-narration-id]').count();assert.ok(segments>5)
    await page.getByTestId('tts-play').click();await state('playing')
    await page.waitForFunction(()=>(window as unknown as {testAudio:HTMLAudioElement}).testAudio.currentTime>0.25)
    await page.getByTestId('tts-play').click();await state('paused')
    const paused=await audioState();await page.waitForTimeout(150)
    assert.equal((await audioState()).time,paused.time)
    await page.getByTestId('tts-play').click();await state('playing')
    assert.ok((await audioState()).time>=paused.time)
    await page.getByTestId('tts-speed').selectOption('1.5');assert.equal((await audioState()).rate,1.5)
    await page.getByTestId('tts-play').click();await state('paused')
    await page.getByTestId('tts-next').click();await state('paused')
    assert.match(await page.getByTestId('tts-status').innerText(),/Sentence 2/)
    // The second sentence spans several chunks. Seek within the real fixture
    // audio, then verify that pause freezes the same chunk and speed keeps it.
    assert.ok(await page.locator('.tts-active [data-chunk-end]').count() > 1)
    await page.getByTestId('tts-play').click();await state('playing')
    await page.evaluate(()=>{(window as unknown as {testAudio:HTMLAudioElement}).testAudio.currentTime=1.8})
    await page.waitForFunction(()=>Number(document.querySelector('.tts-chunk-active')?.getAttribute('data-chunk-index'))>0)
    await page.getByTestId('tts-play').click();await state('paused')
    const chunk=await page.locator('.tts-chunk-active').getAttribute('data-chunk-index')
    await page.waitForTimeout(200)
    assert.equal(await page.locator('.tts-chunk-active').getAttribute('data-chunk-index'),chunk)
    await page.getByTestId('tts-speed').selectOption('0.75')
    assert.equal(await page.locator('.tts-chunk-active').getAttribute('data-chunk-index'),chunk)
    await page.getByTestId('tts-speed').selectOption('1.5')
    await page.screenshot({path:join(dir,'word-chunks.png')})
    await page.getByTestId('tts-previous').click();assert.match(await page.getByTestId('tts-status').innerText(),/Sentence 1/)
    await page.getByTestId('tts-voice').selectOption('b');await state('paused')
    await page.waitForFunction(async()=>{const s=await fetch('/api/settings').then(r=>r.json());return s.reader.voice==='b'&&s.reader.speed===1.5})
    await openLesson();assert.equal(await page.getByTestId('tts-voice').inputValue(),'b');assert.equal(await page.getByTestId('tts-speed').inputValue(),'1.5')
    failNext=true
    await page.getByTestId('tts-play').click();await state('error')
    await page.getByTestId('tts-play').click();await state('playing')
    await page.getByTestId('tts-restart').click();await state('playing')
    await page.screenshot({path:join(dir,'cyber.png')})
    await page.getByTestId('tts-play').click();await state('paused')
    await page.evaluate(async()=>{await fetch('/api/settings',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({theme:'primary'})})})
    await openLesson();delayNext=true
    await page.getByTestId('tts-play').click();await state('loading')
    await page.getByTestId('tts-voice').selectOption('a');await state('paused')
    await page.waitForTimeout(650);assert.equal((await audioState()).paused,true)
    await page.getByTestId('tts-play').click();await state('playing')
    await page.screenshot({path:join(dir,'primary.png')})
    const highlight=await page.locator('.tts-active').evaluate(el=>getComputedStyle(el).backgroundColor)
    assert.notEqual(highlight,'rgba(0, 0, 0, 0)')
    await page.getByTestId('tts-play').click();await state('paused')
    // Finish the last sentence naturally, then verify restart after ended.
    for (let i = 1; i < segments; i++) await page.getByTestId('tts-next').click()
    await page.getByTestId('tts-play').click();await state('playing');await state('ended')
    assert.equal(await page.locator('.tts-active').count(),0)
    assert.equal(await page.locator('.tts-chunk-active').count(),0)
    await page.getByTestId('tts-play').click();await state('playing')
    assert.match(await page.getByTestId('tts-status').innerText(),/Sentence 1/)
    await page.getByTestId('tts-play').click();await state('paused')
    // Fresh document has no in-memory clips. Navigating away during generation
    // must never start late audio in the old page.
    await openLesson();delayNext=true
    await page.getByTestId('tts-play').click();await state('loading')
    await page.goto(`${base}/learn`);await page.waitForTimeout(600)
    assert.equal(await page.locator('.tts-active').count(),0)
    assert.deepEqual(errors,[])
    console.log(`PASS browser controls, exact pause/resume, persistence, retry, cancellation, both themes (${requests} fixture requests)`)

    const mdx=await readFile('content/py-basics/00-hello/lesson.mdx','utf8')
    const manifest=buildNarration(mdx,'js')
    const body={chapter:'py-basics',lesson:'00-hello',revision:manifest.revision,segmentId:manifest.segments[0].id,voice:'a'}
    const post=(data:unknown,origin=base)=>fetch(`${base}/api/tts`,{method:'POST',headers:{'Content-Type':'application/json',Origin:origin},body:JSON.stringify(data)})
    assert.equal((await post(body,'https://foreign.example')).status,403)
    assert.equal((await post({...body,text:'arbitrary text'})).status,400)
    assert.equal((await post({...body,voice:'unknown'})).status,400)
    assert.equal((await post({...body,revision:'0'.repeat(64)})).status,409)
    assert.equal((await post({...body,segmentId:'not-a-segment'})).status,400)
    assert.equal((await post({...body,lesson:'../00-hello'})).status,404)
    assert.equal((await post({...body,segmentId:'x'.repeat(3000)})).status,413)
    assert.equal((await fetch(`${base}/api/tts`,{method:'POST',headers:{Origin:base},body:'{'})).status,400)
    // Make all lessons locked in this scratch DB without touching attempts.
    scratch.prepare('DELETE FROM progress').run()
    assert.equal((await post({...body,chapter:'py-structure',lesson:'00-modules-imports'})).status,403)
    console.log('PASS endpoint origin, schema, revision, segment, size and lesson-access checks')

    if(process.argv.includes('--live')) {
      await page.unroute('**/api/tts')
      for(const voice of ['a','b']) {
        const r=await post({...body,voice});assert.equal(r.status,200,await r.clone().text().then(s=>s.slice(0,150)))
        const bytes=Buffer.from(await r.arrayBuffer());assert.ok(bytes.length>100)
        await writeFile(join(dir,`live-${voice}.mp3`),bytes)
        await page.goto(base)
        const decoded=await page.evaluate(async b64=>{
          const bytes=Uint8Array.from(atob(b64),c=>c.charCodeAt(0))
          const context=new AudioContext();const audio=await context.decodeAudioData(bytes.buffer)
          const duration=audio.duration;await context.close();return duration
        },bytes.toString('base64'))
        assert.ok(decoded>0)
        const before=scratch.prepare('SELECT count(*) AS n FROM ai_speech_usage').get() as {n:number}
        assert.equal((await post({...body,voice})).status,200)
        assert.deepEqual(scratch.prepare('SELECT count(*) AS n FROM ai_speech_usage').get(),before)
        console.log(`PASS live voice ${voice.toUpperCase()}: ${bytes.length} bytes, ${decoded.toFixed(2)} seconds, replay adds no charge`)
      }
    }
    console.log(`Artifacts and scratch DB: ${dir}`)
  } finally {
    await browser.close();scratch.close()
    if(started) await run('dev',['kill','reader-verification','--json','-C',dir]).catch(e=>console.error('Server cleanup:',e.message))
  }
}
main().catch(e=>{console.error(e);process.exitCode=1})
