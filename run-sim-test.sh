#!/bin/bash
cd ~/glance-g2
export LD_LIBRARY_PATH=$HOME/local-libs/root/usr/lib/x86_64-linux-gnu:$LD_LIBRARY_PATH
pkill -f "evenhub-simulator" 2>/dev/null; pkill Xvfb 2>/dev/null; pkill -f "vite" 2>/dev/null; sleep 1
node server.mjs >/tmp/glance-server.log 2>&1 &
SRVPID=$!
npm run dev >/tmp/vite-dev.log 2>&1 &
VPID=$!
sleep 3
Xvfb :99 -screen 0 1280x900x24 >/tmp/xvfb.log 2>&1 &
sleep 1
DISPLAY=:99 /tmp/proot -b $HOME/local-libs/root/usr/lib/x86_64-linux-gnu/webkit2gtk-4.1:/usr/lib/x86_64-linux-gnu/webkit2gtk-4.1 node node_modules/@evenrealities/evenhub-simulator/bin/index.js "${SIM_URL:-http://localhost:5173}" --automation-port 9898 >/tmp/sim.log 2>&1 &
SPID=$!
node sim-test.mjs
EC=$?
kill $SPID $VPID $SRVPID 2>/dev/null; pkill -f "evenhub-simulator" 2>/dev/null; pkill Xvfb 2>/dev/null; pkill -f "vite" 2>/dev/null
exit $EC
