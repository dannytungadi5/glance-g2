# Glance — Telegram, sekilas saja, di kacamata Even G2

Heads Up: Even Realities Hackathon 2026 (dibangun setelah kickoff 23 Nov).
Track utama: Messaging & News · Track kedua: Crypto & DeFi (watchbot) · Kandidat Best Telegram Integration.

## Konsep
Glance menyaring Telegram, bukan meneruskannya. Hanya pesan dari chat/orang/kata kunci VIP
yang tampil di G2, satu kartu per pesan. Gestur: tap = lewati/kirim, double-tap = draft balasan
AI, tahan = balas suara (PCM mic G2 -> WAV -> STT -> konfirmasi -> kirim), swipe atas = aksi
pintar kontekstual (jadwal -> ingatkan, link -> ringkas), swipe bawah = digest channel.

## Arsitektur
```
G2 <--BLE--> Even Hub app (WebView) --> plugin ini (Vite + TS + even_hub_sdk 0.0.16)
                                          |
                                    ?api=http://server:8787   (opsional; default mock lokal)
                                          |
                                   server.mjs (node, zero-dep)
                                     - BOT_TOKEN       -> Telegram Bot API (DM masuk -> antrean, balasan -> sendMessage)
                                     - GEMINI_API_KEY  -> /api/stt transkripsi WAV (free tier); tanpa key: mock
```
API key tidak pernah ada di kacamata/plugin (aturan hackathon). Isi pesan hanya di memori.

## Menjalankan
```
npm install
node server.mjs &                 # opsional; mock-over-HTTP
npm run dev
npx evenhub-simulator 'http://localhost:5173/?api=http://127.0.0.1:8787'
```
Tes otomatis end-to-end (simulator + backend + semua gestur, simpan screenshot ke shots/):
`./run-sim-test.sh` — di Linux headless butuh Xvfb + webkit2gtk-4.1 + proot (lihat skrip).

## UX (576x288 monokrom hijau, font fixed by hardware)
Hierarki lewat brightness 0-4: isi paling terang, header sedang, hint gestur redup.
State lengkap: antrean, konfirmasi (dengan kutipan pesan asli), rekam suara, aksi pintar,
digest (dengan loading), kosong, dan error kirim (bisa coba lagi).

## Privasi & keamanan
- Isi pesan tidak disimpan (in-memory saja di backend).
- Watchbot read-only, "bukan saran finansial".
- Balasan dari kacamata SELALU lewat layar konfirmasi sebelum terkirim.

## Status
Teruji di simulator resmi 0.9.5 via automation API: antrean, balas draft, suara->STT->kirim
(HTTP end-to-end), aksi pintar, digest, error path. 0 error console.
Menyusul: video demo, repo publik, submit (menunggu ACC pemilik).
