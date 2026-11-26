// Data layer. Today: mock backend with realistic Indonesian Telegram traffic.
// Later: real backend (Telegram Bot API / MTProto) behind the same interface.
export interface GlanceMessage {
  id: string
  sender: string
  chat: string
  time: string
  body: string
  vip: boolean
  kind: 'dm' | 'group' | 'channel' | 'watchbot'
  draftReply?: string
}

export interface Backend {
  fetchQueue(): Promise<GlanceMessage[]>
  fetchDigest(): Promise<string[]>
  sendReply(msg: GlanceMessage, text: string): Promise<void>
  transcribe(wav: Uint8Array): Promise<string>
  filteredCount(): number
}

export const MOCK_MESSAGES: GlanceMessage[] = [
  {
    id: 'm1', sender: 'Dina', chat: 'Keluarga', time: '20:12', vip: true, kind: 'group',
    body: 'Besok jadi kan makan di rumah Ibu jam 12? Aku bawa kue.',
    draftReply: 'Jadi, sampai sana sebelum jam 12.',
  },
  {
    id: 'm2', sender: 'Rafi (PM)', chat: 'Tim Produk', time: '20:05', vip: true, kind: 'group',
    body: 'Build iOS yang tadi crash sudah kufix. Tolong cek TestFlight malam ini ya.',
    draftReply: 'Siap, aku cek TestFlight malam ini.',
  },
  {
    id: 'm3', sender: 'Watchbot', chat: 'Alerts', time: '19:58', vip: false, kind: 'watchbot',
    body: 'Polymarket: "BTC di atas 100k akhir 2026" naik ke 62% (+5 dalam 2 jam). Volume 24j: $1,2M.',
  },
  {
    id: 'm4', sender: 'Pak Herman', chat: 'DM', time: '19:40', vip: true, kind: 'dm',
    body: 'Dokumen kontrak revisi sudah saya kirim ke email. Kalau ada yang perlu diubah, kabari saja.',
    draftReply: 'Baik Pak, saya cek emailnya dan kabari kalau ada revisi.',
  },
  {
    id: 'm5', sender: 'Crypto News ID', chat: 'Channel', time: '19:22', vip: false, kind: 'channel',
    body: 'Ringkasan sore: funding rate normal, dominasi BTC stabil, gas fee L2 turun minggu ini.',
  },
]

export const MOCK_DIGEST: string[] = [
  'Crypto News ID (14 pesan): pasar sideways, tidak ada berita besar; gas L2 turun.',
  'Komunitas Builder (31 pesan): bahas hackathon minggu ini, 2 link tutorial.',
  'Tim Produk (9 pesan): fix crash iOS sudah merge, rilis besok.',
]

export class MockBackend implements Backend {
  async fetchQueue() { return MOCK_MESSAGES.slice() }
  async fetchDigest() { return MOCK_DIGEST.slice() }
  async sendReply(_msg: GlanceMessage, _text: string) { /* mock: no-op */ }
  async transcribe(_wav: Uint8Array) { return 'Oke, aku kabari lagi setelah makan siang. (mock STT)' }
  filteredCount() { return 3 }
}

// Real backend over HTTP (server.mjs). Activate with ?api=http://host:8787
export class HttpBackend implements Backend {
  private filtered = 0
  constructor(private base: string) {}
  async fetchQueue() {
    const r = await fetch(`${this.base}/api/queue`)
    if (!r.ok) throw new Error(`queue ${r.status}`)
    const j = await r.json() as { messages: GlanceMessage[]; filtered: number }
    this.filtered = j.filtered
    return j.messages
  }
  async fetchDigest() {
    const r = await fetch(`${this.base}/api/digest`)
    if (!r.ok) throw new Error(`digest ${r.status}`)
    return (await r.json() as { lines: string[] }).lines
  }
  async sendReply(msg: GlanceMessage, text: string) {
    const r = await fetch(`${this.base}/api/reply`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: msg.id, text }),
    })
    if (!r.ok) throw new Error(`reply ${r.status}`)
  }
  async transcribe(wav: Uint8Array) {
    const r = await fetch(`${this.base}/api/stt`, {
      method: 'POST', headers: { 'content-type': 'audio/wav' },
      body: wav as unknown as BodyInit,
    })
    if (!r.ok) throw new Error(`stt ${r.status}`)
    return (await r.json() as { text: string }).text
  }
  filteredCount() { return this.filtered }
}
