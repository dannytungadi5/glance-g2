// Glance backend. No dependencies (node >= 18).
// Modes:
//   default            mock data (demo / simulator testing)
//   BOT_TOKEN=xxx      live Telegram Bot API: DMs to the bot become queue items,
//                      replies from glasses are sent back via sendMessage.
//   GEMINI_API_KEY=xx  /api/stt transcribes real WAV via Gemini (free tier)
//   WHISPER=1          /api/stt transcribes locally via faster-whisper (stt.py)
//   SAMPLE_WAV=path    demo mode: transcribe this file instead of the posted audio
//                      (the headless simulator has no microphone; the STT pipeline
//                      itself is real)
//   without any of these, /api/stt returns a mock transcript.
// Privacy: message contents are kept in memory only, never written to disk.
import http from 'node:http'
import { execFile } from 'node:child_process'
import { writeFile, unlink } from 'node:fs/promises'

const PORT = process.env.PORT || 8787
const BOT_TOKEN = process.env.BOT_TOKEN || ''
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || ''
const WHISPER = process.env.WHISPER === '1'
const SAMPLE_WAV = process.env.SAMPLE_WAV || ''
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.8-flash'

const mockMessages = [
  { id: 'm1', sender: 'Dina', chat: 'Family', time: '20:12', vip: true, kind: 'group',
    body: 'Lunch at Mom\'s tomorrow at 12 still on? I\'m bringing cake.', draftReply: 'Yes, I\'ll be there before 12.' },
  { id: 'm2', sender: 'Rafi (PM)', chat: 'Product Team', time: '20:05', vip: true, kind: 'group',
    body: 'Fixed the iOS build that was crashing. Please check TestFlight tonight.', draftReply: 'On it, I\'ll check TestFlight tonight.' },
  { id: 'm3', sender: 'Watchbot', chat: 'Alerts', time: '19:58', vip: false, kind: 'watchbot',
    body: 'Polymarket: "BTC above 100k by end of 2026" up to 62% (+5 in 2h). 24h volume: $1.2M.' },
  { id: 'm4', sender: 'Mr. Herman', chat: 'DM', time: '19:40', vip: true, kind: 'dm',
    body: 'The revised contract is in your email. Let me know if anything needs changing.', draftReply: 'Got it, I\'ll review and let you know.' },
  { id: 'm5', sender: 'Crypto News ID', chat: 'Channel', time: '19:22', vip: false, kind: 'channel',
    body: 'Evening brief: funding rates normal, BTC dominance stable, L2 gas fees down this week.' },
]
const mockDigest = [
  'Crypto News ID (14 msgs): sideways market, no major news; L2 gas down.',
  'Builder Community (31 msgs): this week\'s hackathon talk, 2 tutorial links.',
  'Product Team (9 msgs): iOS crash fix merged, release tomorrow.',
]

// live telegram state (in-memory only)
const liveQueue = []           // GlanceMessage items from Telegram
const byId = new Map()         // id -> {chatId}
let tgOffset = 0
let tgMe = null

async function tg(method, body) {
  const r = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body ?? {}),
  })
  const j = await r.json()
  if (!j.ok) throw new Error(`telegram ${method}: ${j.description}`)
  return j.result
}

function toGlance(msg) {
  const from = msg.from || {}
  const sender = [from.first_name, from.last_name].filter(Boolean).join(' ') || from.username || 'Unknown'
  const t = new Date((msg.date || Date.now() / 1000) * 1000)
  const id = `tg-${msg.message_id}`
  byId.set(id, msg.chat.id)
  return {
    id, sender, chat: msg.chat.type === 'private' ? 'DM' : (msg.chat.title || msg.chat.type),
    time: t.toTimeString().slice(0, 5), vip: true, kind: msg.chat.type === 'private' ? 'dm' : 'group',
    body: String(msg.text || '').slice(0, 300),
    draftReply: 'Got it, received. (simple draft — LLM drafts coming)',
  }
}

async function telegramLoop() {
  tgMe = await tg('getMe')
  console.log('telegram bot live as @' + tgMe.username)
  for (;;) {
    try {
      const updates = await tg('getUpdates', { offset: tgOffset, timeout: 25 })
      for (const u of updates) {
        tgOffset = u.update_id + 1
        if (u.message && u.message.text && !u.message.text.startsWith('/')) {
          liveQueue.push(toGlance(u.message))
          if (liveQueue.length > 20) liveQueue.shift()
        }
      }
    } catch (e) { console.error('telegram poll:', e.message); await new Promise(r => setTimeout(r, 5000)) }
  }
}

async function sttGemini(wav) {
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [
        { inline_data: { mime_type: 'audio/wav', data: Buffer.from(wav).toString('base64') } },
        { text: 'Transcribe this speech. Reply with ONLY the transcript text, no quotes.' },
      ] }],
    }),
  })
  const j = await r.json()
  const text = j?.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) throw new Error('gemini: no transcript')
  return text.trim()
}

async function sttWhisper(wav) {
  let file = SAMPLE_WAV
  if (!file) {
    file = `/tmp/glance-stt-${Date.now()}.wav`
    await writeFile(file, wav)
  }
  try {
    const text = await new Promise((resolve, reject) => {
      execFile('python3', ['stt.py', file], { cwd: new URL('.', import.meta.url).pathname, timeout: 60000 }, (err, stdout, stderr) => {
        if (err) return reject(new Error('whisper: ' + (stderr || err.message).slice(0, 200)))
        const t = stdout.trim()
        t ? resolve(t) : reject(new Error('whisper: empty transcript'))
      })
    })
    return text
  } finally {
    if (!SAMPLE_WAV) unlink(file).catch(() => {})
  }
}

function cors(res) {
  res.setHeader('access-control-allow-origin', '*')
  res.setHeader('access-control-allow-methods', 'GET,POST,OPTIONS')
  res.setHeader('access-control-allow-headers', 'content-type')
}

const server = http.createServer(async (req, res) => {
  cors(res)
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end() }
  const json = (code, obj) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)) }
  try {
    if (req.url === '/api/queue' && req.method === 'GET') {
      const messages = BOT_TOKEN ? liveQueue.slice() : mockMessages
      return json(200, { messages, filtered: 3, mode: BOT_TOKEN ? 'telegram' : 'mock' })
    }
    if (req.url === '/api/digest' && req.method === 'GET') return json(200, { lines: mockDigest })
    if (req.url === '/api/reply' && req.method === 'POST') {
      const body = JSON.parse(await readBody(req))
      if (BOT_TOKEN && byId.has(body.id)) await tg('sendMessage', { chat_id: byId.get(body.id), text: body.text })
      console.log(`reply ${body.id}: ${String(body.text).slice(0, 60)}`)
      return json(200, { ok: true, delivered: BOT_TOKEN && byId.has(body.id) })
    }
    if (req.url === '/api/stt' && req.method === 'POST') {
      const wav = await readBody(req, true)
      if (GEMINI_API_KEY && wav.length > 100) return json(200, { text: await sttGemini(wav), stt: 'gemini' })
      if (WHISPER && (wav.length > 100 || SAMPLE_WAV)) return json(200, { text: await sttWhisper(wav), stt: SAMPLE_WAV ? 'whisper-sample' : 'whisper' })
      return json(200, { text: 'OK, I\'ll update you after lunch. (mock STT)', stt: 'mock' })
    }
    if (req.url === '/api/health') return json(200, { ok: true, telegram: !!BOT_TOKEN, gemini: !!GEMINI_API_KEY, whisper: WHISPER })
    json(404, { error: 'not found' })
  } catch (e) { console.error(e); json(500, { error: e.message }) }
})

function readBody(req, raw = false) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', c => chunks.push(c))
    req.on('end', () => resolve(raw ? Buffer.concat(chunks) : Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

server.listen(PORT, () => {
  console.log(`glance backend on :${PORT}  telegram=${!!BOT_TOKEN} gemini=${!!GEMINI_API_KEY}`)
  if (BOT_TOKEN) telegramLoop()
})
