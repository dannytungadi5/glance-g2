# Glance — Telegram at a glance, on Even G2 glasses

Heads Up: Even Realities Hackathon 2026 (built after the Nov 23 kickoff).
Main track: Messaging & News · Second track: Crypto & DeFi (watchbot) · Best Telegram Integration candidate.

## Concept
Glance filters Telegram instead of forwarding it. Only messages from VIP chats, people, and
keywords reach your G2, one card per message. Gestures: tap = skip/send, double-tap = AI draft
reply, hold = voice reply (G2 mic PCM -> WAV -> STT -> confirm -> send), swipe up = contextual
smart action (schedule -> reminder, link -> summary), swipe down = channel digest.

## Architecture
```
G2 <--BLE--> Even Hub app (WebView) --> this plugin (Vite + TS + even_hub_sdk 0.0.16)
                                          |
                                    ?api=http://server:8787   (optional; local mock by default)
                                          |
                                   server.mjs (node, zero dependencies)
                                     - BOT_TOKEN       -> Telegram Bot API (bot DMs -> queue, replies -> sendMessage)
                                     - GEMINI_API_KEY  -> /api/stt WAV transcription (free tier); mock without it
```
API keys never live in the glasses plugin (hackathon rule). Message contents are in-memory only.

## Run
```
npm install
node server.mjs &                 # optional; mock-over-HTTP
npm run dev
npx evenhub-simulator 'http://localhost:5173/?api=http://127.0.0.1:8787'
```
Automated end-to-end test (simulator + backend + every gesture, screenshots to shots/):
`./run-sim-test.sh` — on headless Linux needs Xvfb + webkit2gtk-4.1 + proot (see script).
App language: English (default); `?lang=id` switches the UI strings to Indonesian.

## Display UX (576x288 green monochrome, font fixed by hardware)
Hierarchy via brightness levels 0-4: content brightest, header mid, gesture hints dim.
Full state coverage: queue, confirm (with original-message quote), voice recording, smart
action, digest (with loading), empty, and send-error (retry without losing the draft).

## Privacy & safety
- Message contents are never persisted (backend memory only).
- Watchbot is read-only: "not financial advice".
- Every reply from the glasses ALWAYS passes a confirmation screen before sending.

## Telegram coverage, honestly
The Bot API cannot read a user's inbox. What reaches the glasses today:
- direct DMs to @GlanceG2_bot (full round-trip: reply from the glasses lands back in that DM)
- any message you forward to the bot (shown with the original author, labeled "Forwarded";
  a reply to a forwarded card goes back to your bot DM, not the original chat)
Full inbox sync needs the Telegram user API and is on the roadmap, not claimed here.

## Status
Submitted to the hackathon (build 52017, under review; editable until Nov 30).
- Build page: https://dorahacks.io/build/52017
- Demo video (2:21, official simulator, live Telegram DM round-trip): https://youtu.be/HZP22OQvlUY
- Landing: https://glance-g2.pages.dev/
- Packaged app (.ehpk): see GitHub Releases
Tested on the official simulator 0.9.5 via its automation API: queue, draft replies,
voice -> STT -> send (HTTP end-to-end), smart actions, digest, error path. Zero console errors.
Backend endpoint suite: `node test-backend.mjs` (16 checks, no keys needed). See TESTING.md.
