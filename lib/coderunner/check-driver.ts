// The Python driver that executes learner/reference code and evaluates checks.
// ONE source of truth: the Node validator (scripts/validate-content.ts) and the
// browser worker (lib/coderunner/pyodide.worker.ts) both run exactly this code
// inside Pyodide, so "passes in validation" and "passes in the app" can't drift.
//
// Contract: call pylot_run(code_json, checks_json) -> result JSON string:
// {
//   stdout: string, stderr: string,
//   error: { type, message, traceback } | null,   // unexpected top-level error
//   checks: [{ index, type, passed, detail }],
//   workspace: [{ name, type, repr }],
//   passed: boolean
// }
// ai_rubric checks are NOT evaluated here (they are graded by the teacher
// model); they come back with passed=null / detail="ai_rubric: not evaluated".

export const CHECK_DRIVER_PY = String.raw`
import ast as _pylot_ast
import io as _pylot_io
import json as _pylot_json
import sys as _pylot_sys
import traceback as _pylot_tb
import types as _pylot_types

def _pylot_snapshot(ns):
    out = []
    for name, val in ns.items():
        if name.startswith('_') or name == '__name__':
            continue
        if isinstance(val, _pylot_types.ModuleType):
            continue
        try:
            r = repr(val)
        except Exception:
            r = '<unrepresentable>'
        if len(r) > 200:
            r = r[:197] + '...'
        out.append({'name': name, 'type': type(val).__name__, 'repr': r})
    return out

def _pylot_fmt_output(s):
    # human display of an output value: trailing newline is print()'s business,
    # not the learner's; real newlines render as real lines, not '\n' soup
    s = s.rstrip('\n')
    if '\n' in s:
        return '\n' + '\n'.join('    ' + line for line in s.split('\n'))
    return repr(s) if s == '' or s != s.strip() else s

def _pylot_check_stdout(chk, stdout, ns, exc):
    import re
    if chk.get('equals') is not None:
        ok = stdout == chk['equals'] or stdout.rstrip('\n') == chk['equals'].rstrip('\n')
        if ok:
            return True, 'output matched'
        return False, f"expected output: {_pylot_fmt_output(chk['equals'])}\ngot: {_pylot_fmt_output(stdout)}"
    if chk.get('contains') is not None:
        ok = chk['contains'] in stdout
        if ok:
            return True, 'output matched'
        return False, f"expected output to contain: {_pylot_fmt_output(chk['contains'])}\ngot: {_pylot_fmt_output(stdout)}"
    if chk.get('regex') is not None:
        ok = re.search(chk['regex'], stdout) is not None
        if ok:
            return True, 'output matched'
        return False, f"expected output to match /{chk['regex']}/\ngot: {_pylot_fmt_output(stdout)}"
    return False, 'stdout check has no equals/contains/regex'

def _pylot_check_state(chk, stdout, ns, exc):
    try:
        ok = bool(eval(chk['expr'], dict(ns)))
        return ok, f"expression {chk['expr']!r} evaluated to {ok}"
    except Exception as e:
        return False, f"expression {chk['expr']!r} raised {type(e).__name__}: {e}"

def _pylot_check_function(chk, stdout, ns, exc):
    fn = ns.get(chk['name'])
    if not callable(fn):
        return False, f"no function named {chk['name']!r} was defined"
    for case in chk['cases']:
        args = case.get('args', [])
        try:
            got = fn(*args)
        except Exception as e:
            return False, f"{chk['name']}({', '.join(map(repr, args))}) raised {type(e).__name__}: {e}"
        if got != case.get('expected'):
            return False, f"{chk['name']}({', '.join(map(repr, args))}) returned {got!r}, expected {case.get('expected')!r}"
    return True, f"all {len(chk['cases'])} case(s) passed"

def _pylot_check_ast(chk, code):
    try:
        tree = _pylot_ast.parse(code)
    except SyntaxError as e:
        return False, f'code does not parse: {e}'
    present = {type(node).__name__ for node in _pylot_ast.walk(tree)}
    missing = [r for r in chk.get('requires', []) if r not in present]
    banned = [f for f in chk.get('forbids', []) if f in present]
    if missing:
        return False, f"code must use: {', '.join(missing)}"
    if banned:
        return False, f"code must not use: {', '.join(banned)}"
    return True, 'structure ok'

def pylot_run(code_json, checks_json):
    code = _pylot_json.loads(code_json)
    checks = _pylot_json.loads(checks_json)

    ns = {'__name__': '__main__'}
    buf_out, buf_err = _pylot_io.StringIO(), _pylot_io.StringIO()
    old_out, old_err = _pylot_sys.stdout, _pylot_sys.stderr
    _pylot_sys.stdout, _pylot_sys.stderr = buf_out, buf_err
    exc = None
    try:
        exec(compile(code, '<pylot>', 'exec'), ns)
    except BaseException as e:  # noqa: BLE001 - learner code can raise anything
        exc = e
    finally:
        _pylot_sys.stdout, _pylot_sys.stderr = old_out, old_err

    stdout, stderr = buf_out.getvalue(), buf_err.getvalue()
    expects_exception = any(c.get('type') == 'exception' for c in checks)

    results = []
    for i, chk in enumerate(checks):
        t = chk.get('type')
        if t == 'stdout':
            ok, detail = _pylot_check_stdout(chk, stdout, ns, exc)
        elif t == 'state':
            ok, detail = _pylot_check_state(chk, stdout, ns, exc)
        elif t == 'function':
            ok, detail = _pylot_check_function(chk, stdout, ns, exc)
        elif t == 'ast':
            ok, detail = _pylot_check_ast(chk, code)
        elif t == 'exception':
            want = chk.get('raises')
            ok = exc is not None and type(exc).__name__ == want
            got = type(exc).__name__ if exc is not None else 'no exception'
            detail = f'expected {want} to be raised, got {got}'
        elif t == 'ai_rubric':
            results.append({'index': i, 'type': t, 'passed': None,
                            'detail': 'ai_rubric: not evaluated here'})
            continue
        else:
            ok, detail = False, f'unknown check type {t!r}'
        if chk.get('message') and not ok:
            detail = chk['message'] + ' — ' + detail
        results.append({'index': i, 'type': t, 'passed': bool(ok), 'detail': detail})

    error = None
    if exc is not None and not expects_exception:
        error = {
            'type': type(exc).__name__,
            'message': str(exc),
            'traceback': ''.join(_pylot_tb.format_exception(type(exc), exc, exc.__traceback__)),
        }

    # vacuously true with no checks: a free run (dev page) passes iff it ran
    evaluated = [r for r in results if r['passed'] is not None]
    passed = error is None and all(r['passed'] for r in evaluated)

    return _pylot_json.dumps({
        'stdout': stdout,
        'stderr': stderr,
        'error': error,
        'checks': results,
        'workspace': _pylot_snapshot(ns),
        'passed': passed,
    })
`

export type CheckResult = {
  index: number
  type: string
  passed: boolean | null
  detail: string
}

export type RunResult = {
  stdout: string
  stderr: string
  error: { type: string; message: string; traceback: string } | null
  checks: CheckResult[]
  workspace: { name: string; type: string; repr: string }[]
  passed: boolean
}
