# Testing

## 1. Typecheck + production build (no keys)

```
npm install
npm run build        # tsc --noEmit && vite build
```

Result on 26 Nov 2026: passes. `dist/` builds clean, 6 modules, ~92 kB JS (~37 kB gz).

## 2. Backend endpoint suite (no keys)

```
node test-backend.mjs
```

Spawns `server.mjs` in mock mode on a random port and checks 16 things:
health flags, queue shape and VIP flags, 300-char body cap, digest, reply
accepted-without-delivery in mock mode, honest STT backend flagging, 404 on
unknown routes, 500-with-error on malformed JSON, and server survival after a
bad request. Result on 26 Nov 2026: 16 passed, 0 failed.

## 3. Packaged app (.ehpk)

```
npm run build && npx evenhub pack app.json dist
```

Produces the installable G2 package uploaded to GitHub Releases.

## 4. Simulator end-to-end (the real glasses UX)

```
./run-sim-test.sh
```

Starts the backend, the Vite dev server and the official Even Hub simulator
0.9.5 under Xvfb, then drives every gesture through the simulator's automation
API and captures the glasses framebuffer to `shots/`. Exercises: queue walk,
AI draft reply, voice -> STT -> confirm -> send, smart actions, channel digest,
and the send-error retry path. Zero console errors is the pass condition.

Requirements: Linux with Xvfb and webkit2gtk-4.1 (the script notes a proot
fallback). A headless CI container without webkit2gtk cannot run this step;
run it on any desktop Linux. It was last run on the dev machine on 26 Nov 2026
during the hackathon; the captured frames are the ones embedded in the demo
video and on the landing page.

## What is NOT tested

- Real G2 hardware (no device on the team; the hackathon explicitly allows
  simulator-only builds).
- Live Telegram round-trip in CI (needs a bot token and a human DM; demoed in
  the video instead).
- On-device microphone latency for voice replies.
