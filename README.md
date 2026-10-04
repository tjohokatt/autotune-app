# Autotune

A browser-based autotune app for singing at home. Sing into the mic and see (and later hear) your voice pitch-corrected in near real time. Everything runs in the browser: no backend, no accounts, and no audio ever leaves the device.

**Live site:** coming in phase 4 (GitHub Pages: `https://tjohokatt.github.io/autotune-app/`).

## Status
- ✅ Phase 1: Tuner. Live pitch detection (YIN in an AudioWorklet) shows the current note and how many cents off it is.
- ⏳ Phase 2: Autotune (PSOLA pitch shifting, styles, live monitoring)
- ⏳ Phase 3: Record, play back and download
- ⏳ Phase 4: Deploy to GitHub Pages

## Running locally
Requires Node.js 20+.

```sh
npm install
npm run dev       # HTTPS dev server, also reachable on your LAN
npm test          # unit tests (Vitest)
npm run build     # production build to dist/
npm run preview   # serve the production build
```

Open the `https://localhost:5173/autotune-app/` URL that Vite prints. The certificate is self-signed, so accept the browser warning.

### Testing on a phone
The microphone only works in a secure context, which is why the dev server uses HTTPS.

1. Run `npm run dev` and note the **Network** URL, e.g. `https://192.168.1.23:5173/autotune-app/`.
2. Open it on the phone (same Wi-Fi) and accept the certificate warning (Safari: "Show Details → visit this website"; Chrome: "Advanced → Proceed").
3. Tap **Starta** and allow the microphone.

Use wired headphones once live monitoring arrives in phase 2. Bluetooth adds a lot of latency.

## How it works
```
getUserMedia → MediaStreamSource → AudioWorkletNode("autotune") → destination
                                     └─ YIN pitch detection → { freq, confidence } → UI
```
- The mic is opened with echo cancellation, noise suppression and auto gain **off**, since those filters ruin pitch detection.
- DSP lives in pure functions in `src/dsp/` and is unit-tested with synthetic signals. `src/audio/autotune-worklet.js` only wires them together.
- See [CLAUDE.md](CLAUDE.md) for the full architecture and project conventions.
