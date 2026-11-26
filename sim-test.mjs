const BASE = 'http://127.0.0.1:9898'
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
async function shot(name) {
  const r = await fetch(BASE + '/api/screenshot/glasses')
  const fs = await import('fs')
  fs.writeFileSync('shots/' + name + '.png', Buffer.from(await r.arrayBuffer()))
  console.log('shot', name)
}
async function input(action, wait = 600) {
  await fetch(BASE + '/api/input', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action }) })
  await sleep(wait)
}
for (let i = 0; i < 20; i++) { try { await fetch(BASE + '/api/ping'); break } catch { await sleep(500) } }
await sleep(4000)
await input('click'); await input('click'); await input('click')   // -> m4 Pak Herman (dm)
await input('long_press', 900)
await shot('44-voice-rec')
await input('long_press_release', 3000)
await shot('45-stt-result')
await input('click', 800)          // send the transcribed reply
await shot('46-after-voice-send')
const c = JSON.parse(await (await fetch(BASE + '/api/console')).text())
const errs = c.entries.filter(e => e.level === 'error')
console.log('console errors:', errs.length)
