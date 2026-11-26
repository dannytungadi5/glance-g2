// Backend endpoint tests for server.mjs (mock mode, no keys needed).
// Usage: node test-backend.mjs   (starts its own server on a random port, exits nonzero on failure)
import { spawn } from 'node:child_process'

const PORT = 8800 + Math.floor(Math.random() * 500)
const BASE = `http://127.0.0.1:${PORT}`
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

let passed = 0, failed = 0
function check(name, cond, extra = '') {
  if (cond) { passed++; console.log(`ok   ${name}`) }
  else { failed++; console.log(`FAIL ${name} ${extra}`) }
}

const srv = spawn('node', ['server.mjs'], { env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' })
process.on('exit', () => srv.kill())

for (let i = 0; i < 30; i++) { try { await fetch(BASE + '/api/health'); break } catch { await sleep(300) } }

const j = (r) => r.json()

// health
{
  const r = await fetch(BASE + '/api/health').then(j)
  check('health: ok flag', r.ok === true)
  check('health: mock mode (no telegram)', r.telegram === false)
}

// queue: mock messages, required fields, mode flag
{
  const r = await fetch(BASE + '/api/queue').then(j)
  check('queue: mock mode', r.mode === 'mock')
  check('queue: 5 mock messages', r.messages.length === 5, `got ${r.messages.length}`)
  const m = r.messages[0]
  check('queue: message shape', ['id', 'sender', 'chat', 'time', 'vip', 'kind', 'body'].every(k => k in m))
  check('queue: vip filter flags present', r.messages.some(x => x.vip === true) && r.messages.some(x => x.vip === false))
  check('queue: bodies capped at 300 chars', r.messages.every(x => x.body.length <= 300))
  check('queue: filtered counter present', typeof r.filtered === 'number')
}

// digest
{
  const r = await fetch(BASE + '/api/digest').then(j)
  check('digest: 3 lines', Array.isArray(r.lines) && r.lines.length === 3)
}

// reply: accepted, not delivered in mock mode (no token), never throws
{
  const r = await fetch(BASE + '/api/reply', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: 'm1', text: 'thanks!' }) }).then(j)
  check('reply: ok in mock mode', r.ok === true)
  check('reply: not marked delivered without bot token', r.delivered === false)
}

// stt: mock transcript without keys
{
  const r = await fetch(BASE + '/api/stt', { method: 'POST', headers: { 'content-type': 'application/octet-stream' }, body: Buffer.alloc(2048, 1) }).then(j)
  check('stt: returns text', typeof r.text === 'string' && r.text.length > 0)
  check('stt: mock backend flagged honestly', r.stt === 'mock')
}

// error paths
{
  const r = await fetch(BASE + '/api/nope')
  check('unknown route: 404', r.status === 404)
  const r2 = await fetch(BASE + '/api/reply', { method: 'POST', headers: { 'content-type': 'application/json' }, body: 'not json' })
  check('bad JSON body: 500 with error, no crash', r2.status === 500)
  const r3 = await fetch(BASE + '/api/health').then(j)
  check('server still alive after bad request', r3.ok === true)
}

srv.kill()
console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
