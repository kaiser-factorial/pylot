import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkMdx from 'remark-mdx'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { buildNarration, narrateTree, sentenceRanges } from '../lib/narration/manifest'
import { readerPreferences } from '../lib/narration/preferences'
import { audioCacheKey, createAudioService, decodeAudio, isMp3 } from '../lib/narration/audio'
import { createSpeechAccounting } from '../lib/narration/accounting'
import { ensureSpeechSchema } from '../db/speech-schema'
import * as schema from '../db/schema'

const mdx = '# Heading\n\nDr. Smith uses **3.14**. Read [this link](https://example.com) and `x.y`. Next sentence!\n\n- First item. Second item.\n\n> A quote.\n\n```python\nsecret_code()\n```\n\n<LangContrast lang="js">\n\nJS comparison.\n\n</LangContrast>\n'

test('same manifest and rendering pass, inline formatting, headings, lists, quotes and profile filtering', () => {
  const manifest = buildNarration(mdx, 'js')
  const tree = unified().use(remarkParse).use(remarkMdx).parse(mdx)
  assert.deepEqual(narrateTree(tree, 'js'), manifest.segments)
  assert.deepEqual(manifest.segments.map(s => s.text), ['Heading','Dr. Smith uses 3.14.', 'Read this link and x.y.', 'Next sentence!', 'First item.', 'Second item.', 'A quote.', 'JS comparison.'])
  const serialized = JSON.stringify(tree)
  assert.match(serialized, /"type":"strong"/)
  assert.match(serialized, /"type":"link"/)
  assert.match(serialized, /"type":"inlineCode"/)
  assert.equal(buildNarration(mdx, 'none').segments.some(s => s.text.includes('JS comparison')), false)
  assert.notEqual(buildNarration(mdx, 'none').revision, manifest.revision)
  assert.notEqual(buildNarration(mdx + '\nchanged', 'js').revision, manifest.revision)
  assert.deepEqual(buildNarration(mdx, 'js'), manifest)
  assert.equal(manifest.segments.some(s => s.text.includes('secret_code')), false)
})

test('abbreviations, decimals, and long prose stay bounded without losing text', () => {
  const text = 'Use e.g. a decimal 1.25. Then try i.e. this form. ' + 'word '.repeat(1000)
  const ranges = sentenceRanges(text)
  assert.equal(ranges.map(([a,b]) => text.slice(a,b)).join(''), text)
  assert.ok(ranges.every(([a,b]) => b-a <= 2000))
  assert.equal(text.slice(...ranges[0]), 'Use e.g. a decimal 1.25. ')
})

test('reader preferences constrain voices and speeds', () => {
  assert.deepEqual(readerPreferences({voice:'c',speed:99}), {voice:'a',speed:1})
  assert.deepEqual(readerPreferences({voice:'b',speed:1.5}), {voice:'b',speed:1.5})
})

// Header fixture tests transport validation; real MP3 decoding is covered in the
// browser suite with an actual generated audio clip.
const bytes = Buffer.from([0xff,0xfb,0x90,0x00,1,2,3,4,5,6])
const response = () => Response.json({ audio_data: bytes.toString('base64') })
const input = {text:'A sentence.',voiceId:'test-voice',model:'test-model',userId:'one',apiKey:'test-key'}

test('strict audio envelope and cache identity', () => {
  assert.equal(isMp3(bytes),true)
  assert.deepEqual(decodeAudio({audio_data:bytes.toString('base64')}),bytes)
  for(const value of [{audio:'wrong'}, {audio_data:'?bad?'}, {audio_data:Buffer.from('not audio').toString('base64')}]) assert.throws(()=>decodeAudio(value))
  assert.notEqual(audioCacheKey(input), audioCacheKey({...input,voiceId:'different'}))
  assert.notEqual(audioCacheKey(input), audioCacheKey({...input,model:'different'}))
  assert.notEqual(audioCacheKey(input), audioCacheKey({...input,text:'different'}))
})

test('concurrent clips deduplicate, survive service restart, and bypass cap/key on cache hit', async () => {
  const dir = await mkdtemp(join(tmpdir(),'pylot-audio-'))
  let calls=0, reservations=0, settlements=0
  const accounting={reserve:()=>{reservations++; return 'r'},settle:()=>{settlements++}}
  const fetcher: typeof fetch=async()=>{calls++;await new Promise(r=>setTimeout(r,20));return response()}
  try {
    const service=createAudioService(accounting,{cacheDir:dir,fetcher})
    const results=await Promise.all(Array.from({length:5},()=>service(input)))
    results.forEach(b=>assert.deepEqual(b,bytes))
    assert.equal(calls,1);assert.equal(reservations,1);assert.equal(settlements,1)
    const restarted=createAudioService({reserve:()=>null,settle:()=>assert.fail()},{cacheDir:dir,fetcher:async()=>{assert.fail('cache miss')}})
    assert.deepEqual(await restarted({...input,apiKey:undefined}),bytes)
    assert.deepEqual(await readFile(join(dir,`${audioCacheKey(input)}.mp3`)),bytes)
  } finally {await rm(dir,{recursive:true,force:true})}
})

test('budget/config errors make no paid request; failure retry works and ambiguous spend remains reserved', async () => {
  const dir=await mkdtemp(join(tmpdir(),'pylot-audio-'))
  const settled: string[]=[];let calls=0
  const accounting={reserve:()=> 'r',settle:(_id:string,status:string)=>{settled.push(status)}}
  try {
    const denied=createAudioService({...accounting,reserve:()=>null},{cacheDir:dir,fetcher:async()=>{assert.fail()}})
    await assert.rejects(()=>denied(input),/budget/)
    await assert.rejects(()=>denied({...input,apiKey:undefined}),/configured/)
    const service=createAudioService(accounting,{cacheDir:dir,fetcher:async()=>{calls++;if(calls===1)throw new Error('network');return response()}})
    await assert.rejects(()=>service(input),/connection/)
    assert.deepEqual(settled,[])
    await service(input);assert.equal(calls,2);assert.deepEqual(settled,['charged'])
    const deniedProvider=createAudioService(accounting,{cacheDir:dir,fetcher:async()=>new Response('',{status:401})})
    await assert.rejects(()=>deniedProvider({...input,text:'new'}),/speech service/)
    assert.deepEqual(settled,['charged','released'])
    const timeout=createAudioService(accounting,{cacheDir:dir,timeoutMs:10,fetcher:async(_url,options)=>new Promise((_r,reject)=>{
      const timer=setTimeout(()=>reject(new Error('test timeout')),100)
      options?.signal?.addEventListener('abort',()=>{clearTimeout(timer);reject(new Error('aborted'))},{once:true})
    })})
    await assert.rejects(()=>timeout({...input,text:'timeout'}),/connection/)
    assert.deepEqual(settled,['charged','released'])
  } finally {await rm(dir,{recursive:true,force:true})}
})

test('atomic reservations account for all AI kinds, retained old reservations, and definitive releases', () => {
  const sqlite=new Database(':memory:')
  sqlite.exec(`CREATE TABLE users (id TEXT PRIMARY KEY); INSERT INTO users VALUES ('one');
    CREATE TABLE ai_usage (cost_usd REAL, created_at INTEGER, kind TEXT);`)
  ensureSpeechSchema(sqlite);ensureSpeechSchema(sqlite)
  const db=drizzle(sqlite,{schema})
  let cap=0.001
  const accounting=createSpeechAccounting(db,{cap:()=>cap,rate:()=>16})
  const id=accounting.reserve('one','model',50)!
  assert.ok(id);assert.equal(accounting.spent(),0.0008)
  assert.equal(accounting.reserve('one','model',50),null)
  accounting.settle(id,'released');assert.equal(accounting.spent(),0)
  const second=accounting.reserve('one','model',50)!
  sqlite.prepare('UPDATE ai_speech_usage SET created_at=0 WHERE id=?').run(second)
  assert.equal(accounting.spent(),0.0008)
  accounting.settle(second,'charged');assert.equal(accounting.spent(),0)
  for(const kind of ['teacher','rubric','reward']) sqlite.prepare('INSERT INTO ai_usage VALUES (?, ?, ?)').run(0.0001,Date.now(),kind)
  assert.equal(accounting.reserve('one','model',50),null)
  cap=1;assert.ok(accounting.reserve('one','model',50))
  cap=NaN;assert.throws(()=>accounting.reserve('one','model',1))
  sqlite.close()
})

test('word chunks preserve text, balance groups, and follow media position', async () => {
  const {wordChunks, activeChunk} = await import('../lib/narration/chunks')
  for (let count=1; count<=24; count++) {
    const text=Array.from({length:count},(_,i)=>`word${i}`).join('  ')+' '
    const chunks=wordChunks(text)
    assert.equal(chunks.map(c=>text.slice(c.start,c.end)).join(''),text)
    assert.ok(chunks.every(c=>c.until>0&&c.until<=1))
    if(count>=6) assert.ok(chunks.every(c=>text.slice(c.start,c.end).trim().split(/\s+/).length>=3))
    assert.equal(chunks.at(-1)?.until,1)
  }
  assert.deepEqual(wordChunks(''),[])
  assert.equal(activeChunk([],0,1),-1)
  assert.equal(activeChunk([0.4,1],0,NaN),0)
  assert.equal(activeChunk([0.4,1],1,10),0)
  assert.equal(activeChunk([0.4,1],4,10),1)
  assert.equal(activeChunk([0.4,1],10,10),1)
  // Rendered chunks retain the original inline nodes, not flattened text.
  const tree=unified().use(remarkParse).use(remarkMdx).parse('One **two three four five six** and `seven eight`.')
  narrateTree(tree,'js')
  const json=JSON.stringify(tree)
  assert.match(json,/data-chunk-end/)
  assert.match(json,/"type":"strong"/)
  assert.match(json,/"type":"inlineCode"/)
})
