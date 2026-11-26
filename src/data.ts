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
    id: 'm1', sender: 'Dina', chat: 'Family', time: '20:12', vip: true, kind: 'group',
    body: 'Lunch at Mom\'s tomorrow at 12 still on? I\'m bringing cake.',
    draftReply: 'Yes, I\'ll be there before 12.',
  },
  {
    id: 'm2', sender: 'Rafi (PM)', chat: 'Product Team', time: '20:05', vip: true, kind: 'group',
    body: 'Fixed the iOS build that was crashing. Please check TestFlight tonight.',
    draftReply: 'On it, I\'ll check TestFlight tonight.',
  },
  {
    id: 'm3', sender: 'Watchbot', chat: 'Alerts', time: '19:58', vip: false, kind: 'watchbot',
    body: 'Polymarket: "BTC above 100k by end of 2026" up to 62% (+5 in 2h). 24h volume: $1.2M.',
  },
  {
    id: 'm4', sender: 'Mr. Herman', chat: 'DM', time: '19:40', vip: true, kind: 'dm',
    body: 'The revised contract is in your email. Let me know if anything needs changing.',
    draftReply: 'Got it, I\'ll review and let you know.',
  },
  {
    id: 'm5', sender: 'Crypto News ID', chat: 'Channel', time: '19:22', vip: false, kind: 'channel',
    body: 'Evening brief: funding rates normal, BTC dominance stable, L2 gas fees down this week.',
  },
]

export const MOCK_DIGEST: string[] = [
  'Crypto News ID (14 msgs): sideways market, no major news; L2 gas down.',
  'Builder Community (31 msgs): this week\'s hackathon talk, 2 tutorial links.',
  'Product Team (9 msgs): iOS crash fix merged, release tomorrow.',
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
