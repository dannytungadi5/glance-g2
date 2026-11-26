#!/bin/bash
# Live Telegram scene: real DM via getUpdates -> glasses queue -> reply -> delivered.
cd ~/glance-g2
export LD_LIBRARY_PATH=$HOME/local-libs/root/usr/lib/x86_64-linux-gnu:$LD_LIBRARY_PATH
pkill -f "evenhub-simulator" 2>/dev/null; pkill Xvfb 2>/dev/null; pkill -f "vite" 2>/dev/null; sleep 1
BOT_TOKEN="$(cat "$1")" WHISPER=1 SAMPLE_WAV=./sample-voice.wav node server.mjs >/tmp/glance-server-live.log 2>&1 &
npm run dev >/tmp/vite-dev.log 2>&1 &
sleep 3
Xvfb :99 -screen 0 1280x900x24 >/tmp/xvfb.log 2>&1 &
sleep 1
DISPLAY=:99 /tmp/proot -b $HOME/local-libs/root/usr/lib/x86_64-linux-gnu/webkit2gtk-4.1:/usr/lib/x86_64-linux-gnu/webkit2gtk-4.1 node node_modules/@evenrealities/evenhub-simulator/bin/index.js "${SIM_URL:-http://localhost:5173/?api=http://127.0.0.1:8787}" --automation-port 9898 >/tmp/sim.log 2>&1 &
