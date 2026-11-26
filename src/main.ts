import {
  waitForEvenAppBridge,
  TextContainerProperty,
  CreateStartUpPageContainer,
  TextContainerUpgrade,
  OsEventTypeList,
} from '@evenrealities/even_hub_sdk'
import { MockBackend, HttpBackend, type GlanceMessage } from './data'

// ---- screens ----
type SmartAction = { kind: 'reminder' | 'summarize'; label: string; detail: string }
type Screen =
  | { name: 'queue' }
  | { name: 'confirm'; msg: GlanceMessage }
  | { name: 'digest' }
  | { name: 'voice'; msg: GlanceMessage }
  | { name: 'action'; msg: GlanceMessage; action: SmartAction }

const params = new URLSearchParams(location.search)
const apiBase = params.get('api')
const LANG = (params.get('lang') || 'en') as 'en' | 'id'
const backend = apiBase ? new HttpBackend(apiBase) : new MockBackend()

// English is the default (judges); Indonesian available via ?lang=id
const T = {
  en: {
    sendQ: 'SEND REPLY?', to: 'to', voice: 'VOICE REPLY', recording: 'Recording. Speak now,\nrelease to transcribe.',
    digest: 'CHANNEL DIGEST', loading: 'Summarizing channels...', done: 'ALL CLEAR',
    emptyA: 'Queue is clear.', emptyB: 'other messages filtered (not VIP).',
    transcribing: '...transcribing', sttFail: '!! STT failed. Retype on your phone or try again.',
    sendFail: '!! Send failed. Try again.',
    footQ: 'tap skip · 2x reply · hold voice · swipe: action / digest',
    footC: 'tap SEND · swipe cancel', footD: 'tap back', footV: 'release to send',
    footA: 'tap run · swipe cancel', footE: 'swipe down digest · 2x exit',
    remind: 'REMIND ME', summarize: 'SUMMARIZE', market: 'MARKET DETAIL',
    remindTxt: (b: string, t: string) => `Remind me about this:\n"${b}"\n\nDetected: around ${t}.`,
    summarizeTxt: 'Link summary, 3 points:\n1. (mock) Main point.\n2. Supporting data.\n3. Conclusion.',
    disclaimer: 'Not financial advice.',
    detailHdr: 'Market detail (read-only):',
  },
  id: {
    sendQ: 'KIRIM BALASAN?', to: 'ke', voice: 'BALAS SUARA', recording: 'Merekam. Bicara sekarang,\nlepas tombol untuk ubah ke teks.',
    digest: 'DIGEST CHANNEL', loading: 'Meringkas channel...', done: 'SELESAI',
    emptyA: 'Antrean bersih.', emptyB: 'pesan lain difilter (bukan VIP).',
    transcribing: '...mengubah suara ke teks', sttFail: '!! STT gagal. Ketik ulang lewat HP atau coba lagi.',
    sendFail: '!! Gagal kirim. Coba lagi.',
    footQ: 'tap lewati · 2x balas · tahan suara · geser: aksi / digest',
    footC: 'tap KIRIM · geser batal', footD: 'tap kembali', footV: 'lepas untuk mengirim',
    footA: 'tap jalankan · geser batal', footE: 'geser bawah digest · 2x keluar',
    remind: 'INGATKAN', summarize: 'RINGKAS', market: 'DETAIL PASAR',
    remindTxt: (b: string, t: string) => `Ingatkan aku soal ini:\n"${b}"\n\nTerdeteksi: sekitar jam ${t}.`,
    summarizeTxt: 'Ringkasan 3 poin dari tautan:\n1. (mock) Poin utama artikel.\n2. Data pendukung.\n3. Kesimpulan.',
    disclaimer: 'Bukan saran finansial.',
    detailHdr: 'Detail pasar (read-only):',
  },
}[LANG]
let pcmChunks: Uint8Array[] = []
let queue: GlanceMessage[] = []
let index = 0
let screen: Screen = { name: 'queue' }
let sending = false

// ---- layout (576x288 monochrome) ----
const W = 576
// UX: one fixed font on device, so hierarchy comes from brightness (textColor
// 0-4), spacing and layout. Body brightest (4), header medium (3), hints dim (1).
const BRIGHT = 4, MID = 3, DIM = 1
function hdr(label: string) {
  return new TextContainerProperty({
    xPosition: 0, yPosition: 0, width: W, height: 30, borderWidth: 0, borderColor: 5,
    paddingLength: 8, containerID: 1, containerName: 'hdr', content: label, isEventCapture: 0,
    textColor: MID,
  })
}
function body(text: string, capture = true) {
  return new TextContainerProperty({
    xPosition: 0, yPosition: 34, width: W, height: 208, borderWidth: 1, borderColor: 5,
    borderRadius: 10, paddingLength: 9, containerID: 2, containerName: 'body', content: text,
    isEventCapture: capture ? 1 : 0, textColor: BRIGHT,
  })
}
function foot(text: string) {
  return new TextContainerProperty({
    xPosition: 0, yPosition: 246, width: W, height: 36, borderWidth: 0, borderColor: 5,
    paddingLength: 8, containerID: 3, containerName: 'foot', content: text, isEventCapture: 0,
    textColor: DIM,
  })
}

const FOOT_QUEUE = T.footQ
const FOOT_CONFIRM = T.footC
const FOOT_DIGEST = T.footD
const FOOT_VOICE = T.footV
const FOOT_ACTION = T.footA

function short(text: string, n: number) {
  const t = text.replace(/\n+/g, ' ').trim()
  return t.length > n ? t.slice(0, n - 1) + '…' : t
}

function view(): { h: string; b: string; f: string } {
  if (screen.name === 'confirm') {
    const m = screen.msg
    const draft = m.draftReply ?? '(tidak ada draft)'
    return {
      h: T.sendQ,
      b: `${T.to} ${m.sender} (${m.chat}):\n"${short(m.body, 70)}"\n\n${draft}`,
      f: FOOT_CONFIRM,
    }
  }
  if (screen.name === 'voice') {
    return {
      h: T.voice,
      b: `${T.to} ${m0(screen)}...\n\n${T.recording}`,
      f: FOOT_VOICE,
    }
  }
  if (screen.name === 'digest') {
    return { h: T.digest, b: digestLines.join('\n\n'), f: FOOT_DIGEST }
  }
  if (screen.name === 'action') {
    return { h: screen.action.label, b: screen.action.detail, f: FOOT_ACTION }
  }
  if (queue.length === 0) {
    return { h: T.done, b: `${T.emptyA}\n\n${backend.filteredCount()} ${T.emptyB}`, f: T.footE }
  }
  const m = queue[index]
  const vip = m.vip ? '*' : ''
  return {
    h: `${index + 1}/${queue.length}  ${vip}${m.sender} · ${m.chat}`,
    b: `${m.time}\n\n${m.body}`,
    f: FOOT_QUEUE,
  }
}
function m0(s: Screen) { return s.name === 'voice' || s.name === 'confirm' || s.name === 'action' ? s.msg.sender : '' }

// ---- bridge ----
const bridge = await waitForEvenAppBridge()
let digestLines: string[] = []

async function render() {
  const v = view()
  await bridge.textContainerUpgrade(new TextContainerUpgrade({ containerID: 1, containerName: 'hdr', content: v.h, textColor: MID }))
  await bridge.textContainerUpgrade(new TextContainerUpgrade({ containerID: 2, containerName: 'body', content: v.b, textColor: BRIGHT }))
  await bridge.textContainerUpgrade(new TextContainerUpgrade({ containerID: 3, containerName: 'foot', content: v.f, textColor: DIM }))
}

async function boot() {
  queue = await backend.fetchQueue()
  digestLines = await backend.fetchDigest()
  const v = view()
  const created = await bridge.createStartUpPageContainer(
    new CreateStartUpPageContainer({ containerTotalNum: 3, textObject: [hdr(v.h), body(v.b), foot(v.f)] }),
  )
  if (created !== 0) console.error('createStartUpPageContainer failed:', created)
}

// ---- actions ----
function next() {
  if (index < queue.length - 1) index++
  else { queue = []; index = 0 }
  screen = { name: 'queue' }
}

async function sendDraft() {
  if (screen.name !== 'confirm' || sending) return
  sending = true
  try {
    await backend.sendReply(screen.msg, screen.msg.draftReply ?? '')
    next()
  } catch {
    // error state: stay on the draft, tell the user, allow retry
    screen.msg.draftReply = `${T.sendFail}\n\n${screen.msg.draftReply}`
  } finally { sending = false }
}

async function openDigest() {
  digestLines = [T.loading]
  screen = { name: 'digest' }
  await render()
  digestLines = await backend.fetchDigest()
  if (screen.name === 'digest') await render()
}

let pressStartedAt = 0

// G2 mic: 16-bit little-endian mono PCM at 16 kHz -> standard WAV
function pcmToWav(chunks: Uint8Array[], rate = 16000): Uint8Array {
  const total = chunks.reduce((n, c) => n + c.length, 0)
  const out = new Uint8Array(44 + total)
  const v = new DataView(out.buffer)
  const writeStr = (o: number, s: string) => { for (let i = 0; i < s.length; i++) out[o + i] = s.charCodeAt(i) }
  writeStr(0, 'RIFF'); v.setUint32(4, 36 + total, true)
  writeStr(8, 'WAVE'); writeStr(12, 'fmt ')
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true)
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true)
  v.setUint16(32, 2, true); v.setUint16(34, 16, true)
  writeStr(36, 'data'); v.setUint32(40, total, true)
  let off = 44
  for (const c of chunks) { out.set(c, off); off += c.length }
  return out
}

// Rule-based contextual action detection (LLM version lives on the backend later).
// Returns null when the message has no useful micro-action.
function detectAction(m: GlanceMessage): SmartAction | null {
  const time = m.body.match(/(?:jam|pukul)\s*(\d{1,2}(?:[.:]\d{2})?)/i)
  const day = /besok|lusa|hari|senin|selasa|rabu|kamis|jum'?at|sabtu|minggu|\d{1,2}[\/\-]\d{1,2}/i.test(m.body)
  if (time && day) {
    return {
      kind: 'reminder',
      label: T.remind,
      detail: T.remindTxt(m.body.slice(0, 90), time[1]),
    }
  }
  if (/https?:\/\/|www\./i.test(m.body)) {
    return {
      kind: 'summarize',
      label: T.summarize,
      detail: T.summarizeTxt,
    }
  }
  return null
}

function watchbotDetail(m: GlanceMessage): string {
  return `${m.body}\n\n---\n${T.detailHdr}\nOdds: 62% (+5)\nVolume 24h: $1.2M\nLiquidity: $340k\n\n${T.disclaimer}`
}

// CLICK_EVENT is 0 and protobuf omits zero fields, so a tap arrives with
// eventType undefined inside its envelope (pattern from official template).
function eventTypeOf(envelope?: { eventType?: OsEventTypeList }): OsEventTypeList | null {
  if (!envelope) return null
  return envelope.eventType ?? OsEventTypeList.CLICK_EVENT
}

bridge.onEvenHubEvent(event => {
  // mic PCM frames while recording
  if (event.audioEvent && screen.name === 'voice') {
    pcmChunks.push(event.audioEvent.audioPcm)
    return
  }
  const sysType = eventTypeOf(event.sysEvent)
  const textType = eventTypeOf(event.textEvent)

  // double-tap: on queue = AI-draft reply (if drafted, else exit app);
  // on any other screen = back to queue
  if (sysType === OsEventTypeList.DOUBLE_CLICK_EVENT || textType === OsEventTypeList.DOUBLE_CLICK_EVENT) {
    if (screen.name === 'queue') {
      if (queue.length && queue[index].draftReply && queue[index].kind !== 'channel' && queue[index].kind !== 'watchbot') {
        screen = { name: 'confirm', msg: queue[index] }; void render(); return
      }
      bridge.shutDownPageContainer(1); return
    }
    screen = { name: 'queue' }; void render(); return
  }

  // long-press pair: voice reply (hold to talk)
  if (sysType === OsEventTypeList.LONG_PRESS_EVENT) {
    if (screen.name === 'queue' && queue.length && queue[index].kind !== 'channel' && queue[index].kind !== 'watchbot') {
      pressStartedAt = Date.now()
      pcmChunks = []
      screen = { name: 'voice', msg: queue[index] }
      void render()
      void bridge.audioControl(true)
    }
    return
  }
  if (sysType === OsEventTypeList.LONG_PRESS_RELEASE_EVENT) {
    if (screen.name === 'voice') {
      const heldMs = Date.now() - pressStartedAt
      if (heldMs < 300) { screen = { name: 'queue' }; void render(); return }
      void bridge.audioControl(false)
      const msg = screen.msg
      const wav = pcmToWav(pcmChunks)
      pcmChunks = []
      // PCM -> backend STT -> transcript becomes the draft for confirmation
      msg.draftReply = T.transcribing
      screen = { name: 'confirm', msg }
      void render()
      backend.transcribe(wav)
        .then(text => { msg.draftReply = text; if (screen.name === 'confirm') void render() })
        .catch(() => { msg.draftReply = T.sttFail; if (screen.name === 'confirm') void render() })
    }
    return
  }

  // scrolls arrive via the capturing container (textEvent)
  if (textType === OsEventTypeList.SCROLL_BOTTOM_EVENT) {
    if (screen.name === 'queue') { void openDigest(); return }
    if (screen.name === 'confirm' || screen.name === 'action') { screen = { name: 'queue' }; void render(); return }
  }
  if (textType === OsEventTypeList.SCROLL_TOP_EVENT) {
    if (screen.name === 'digest') { screen = { name: 'queue' }; void render(); return }
    if (screen.name === 'queue' && queue.length) {
      const m = queue[index]
      if (m.kind === 'watchbot') {
        screen = { name: 'action', msg: m, action: { kind: 'summarize', label: T.market, detail: watchbotDetail(m) } }
        void render(); return
      }
      const act = detectAction(m)
      if (act) { screen = { name: 'action', msg: m, action: act }; void render(); return }
    }
  }

  // taps
  if (sysType === OsEventTypeList.CLICK_EVENT || textType === OsEventTypeList.CLICK_EVENT) {
    if (screen.name === 'queue') { next(); void render(); return }
    if (screen.name === 'confirm') { void sendDraft().then(() => render()); return }
    if (screen.name === 'digest') { screen = { name: 'queue' }; void render(); return }
    if (screen.name === 'action') { next(); void render(); return }
  }
})

await boot()
