// Glance backend. No dependencies (node >= 18).
// Modes:
//   default            mock data (demo / simulator testing)
//   BOT_TOKEN=xxx      live Telegram Bot API: DMs to the bot become queue items,
//                      replies from glasses are sent back via sendMessage.
//   GEMINI_API_KEY=xx  /api/stt transcribes real WAV via Gemini (free tier);
//                      without it, /api/stt returns a mock transcript.
// Privacy: message contents are kept in memory only, never written to disk.
import http from 'node:http'

const PORT = process.env.PORT || 8787
const BOT_TOKEN = process.env.BOT_TOKEN || ''
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || ''
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.8-flash'

const mockMessages = [
  { id: 'm1', sender: 'Dina', chat: 'Keluarga', time: '20:12', vip: true, kind: 'group',
    body: 'Besok jadi kan makan di rumah Ibu jam 12? Aku bawa kue.', draftReply: 'Jadi, sampai sana sebelum jam 12.' },
  { id: 'm2', sender: 'Rafi (PM)', chat: 'Tim Produk', time: '20:05', vip: true, kind: 'group',
    body: 'Build iOS yang tadi crash sudah kufix. Tolong cek TestFlight malam ini ya.', draftReply: 'Siap, aku cek TestFlight malam ini.' },
  { id: 'm3', sender: 'Watchbot', chat: 'Alerts', time: '19:58', vip: false, kind: 'watchbot',
    body: 'Polymarket: "BTC di atas 100k akhir 2026" naik ke 62% (+5 dalam 2 jam). Volume 24j: $1,2M.' },
  { id: 'm4', sender: 'Pak Herman', chat: 'DM', time: '19:40', vip: true, kind: 'dm',
    body: 'Dokumen kontrak revisi sudah saya kirim ke email. Kalau ada yang perlu diubah, kabari saja.', draftReply: 'Baik Pak, saya cek emailnya dan kabari kalau ada revisi.' },
  { id: 'm5', sender: 'Crypto News ID', chat: 'Channel', time: '19:22', vip: false, kind: 'channel',
    body: 'Ringkasan sore: funding rate normal, dominasi BTC stabil, gas fee L2 turun minggu ini.' },
]
const mockDigest = [
  'Crypto News ID (14 pesan): pasar sideways, tidak ada berita besar; gas L2 turun.',
  'Komunitas Builder (31 pesan): bahas hackathon minggu ini, 2 link tutorial.',
  'Tim Produk (9 pesan): fix crash iOS sudah merge, rilis besok.',
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
    draftReply: 'Siap, diterima. (draft sederhana — LLM draft menyusul)',
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
        { text: 'Transkripsikan ucapan Bahasa Indonesia ini. Balas HANYA teks transkripsinya, tanpa tanda kutip.' },
      ] }],
    }),
  })
  const j = await r.json()
  const text = j?.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) throw new Error('gemini: no transcript')
  return text.trim()
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
      return json(200, { text: 'Oke, aku kabari lagi setelah makan siang. (mock STT)', stt: 'mock' })
    }
    if (req.url === '/api/health') return json(200, { ok: true, telegram: !!BOT_TOKEN, gemini: !!GEMINI_API_KEY })
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
