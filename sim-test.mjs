const BASE = 'http://127.0.0.1:9898'
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
async function shot(name) {
  const r = await fetch(BASE + '/api/screenshot/glasses')
  const fs = await import('fs')
  fs.writeFileSync('shots/' + name + '.png', Buffer.from(await r.arrayBuffer()))
  console.log('shot', name)
}
async function input(action, wait = 1800) {
  await fetch(BASE + '/api/input', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action }) })
  await sleep(wait)
}
for (let i = 0; i < 20; i++) { try { await fetch(BASE + '/api/ping'); break } catch { await sleep(500) } }
await sleep(4000)
await input('down'); await shot('en-digest')
const c = JSON.parse(await (await fetch(BASE + '/api/console')).text())
console.log('console errors:', c.entries.filter(e => e.level === 'error').length)
