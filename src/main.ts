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

const apiBase = new URLSearchParams(location.search).get('api')
const backend = apiBase ? new HttpBackend(apiBase) : new MockBackend()
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

const FOOT_QUEUE = 'tap lewati · 2x balas · tahan suara · geser: aksi / digest'
const FOOT_CONFIRM = 'tap KIRIM · geser batal'
const FOOT_DIGEST = 'tap kembali'
const FOOT_VOICE = 'lepas untuk mengirim'
const FOOT_ACTION = 'tap jalankan · geser batal'

function short(text: string, n: number) {
  const t = text.replace(/\n+/g, ' ').trim()
  return t.length > n ? t.slice(0, n - 1) + '…' : t
}

function view(): { h: string; b: string; f: string } {
  if (screen.name === 'confirm') {
    const m = screen.msg
    const draft = m.draftReply ?? '(tidak ada draft)'
    return {
      h: `KIRIM BALASAN?`,
      b: `ke ${m.sender} (${m.chat}):\n"${short(m.body, 70)}"\n\n${draft}`,
      f: FOOT_CONFIRM,
    }
  }
  if (screen.name === 'voice') {
    return {
      h: `BALAS SUARA`,
      b: `ke ${m0(screen)}...\n\nMerekam. Bicara sekarang,\nlepas tombol untuk ubah ke teks.`,
      f: FOOT_VOICE,
    }
  }
  if (screen.name === 'digest') {
    return { h: 'DIGEST CHANNEL', b: digestLines.join('\n\n'), f: FOOT_DIGEST }
  }
  if (screen.name === 'action') {
    return { h: screen.action.label, b: screen.action.detail, f: FOOT_ACTION }
  }
  if (queue.length === 0) {
    return { h: 'SELESAI', b: `Antrean bersih.\n\n${backend.filteredCount()} pesan lain difilter (bukan VIP).`, f: 'geser bawah digest · 2x keluar' }
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
    screen.msg.draftReply = `!! Gagal kirim. Coba lagi.\n\n${screen.msg.draftReply}`
  } finally { sending = false }
}

async function openDigest() {
  digestLines = ['Meringkas channel...']
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
      label: 'INGATKAN',
      detail: `Ingatkan aku soal ini:\n"${m.body.slice(0, 90)}"\n\nTerdeteksi: sekitar jam ${time[1]}.`,
    }
  }
  if (/https?:\/\/|www\./i.test(m.body)) {
    return {
      kind: 'summarize',
      label: 'RINGKAS',
      detail: 'Ringkasan 3 poin dari tautan:\n1. (mock) Poin utama artikel.\n2. Data pendukung.\n3. Kesimpulan.',
    }
  }
  return null
}

function watchbotDetail(m: GlanceMessage): string {
  return `${m.body}\n\n---\nDetail pasar (read-only):\nOdds: 62% (+5)\nVolume 24j: $1,2M\nLikuiditas: $340k\n\nBukan saran finansial.`
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
      msg.draftReply = '...mengubah suara ke teks'
      screen = { name: 'confirm', msg }
      void render()
      backend.transcribe(wav)
        .then(text => { msg.draftReply = text; if (screen.name === 'confirm') void render() })
        .catch(() => { msg.draftReply = '!! STT gagal. Ketik ulang lewat HP atau coba lagi.'; if (screen.name === 'confirm') void render() })
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
        screen = { name: 'action', msg: m, action: { kind: 'summarize', label: 'DETAIL PASAR', detail: watchbotDetail(m) } }
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
