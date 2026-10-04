# Autotune

A browser-based autotune app for singing at home. Sing into the mic and hear your voice pitch-corrected in near real time, in styles from subtle to full robot. Record a take, play it back and download it as a WAV file. Everything runs in the browser: no backend, no accounts, and no audio ever leaves the device.

**Live site:** coming in phase 4 (GitHub Pages: `https://tjohokatt.github.io/autotune-app/`).

## Status
- ✅ Phase 1: Tuner. Live pitch detection (YIN in an AudioWorklet) shows the current note and how many cents off it is.
- ✅ Phase 2: Autotune. TD-PSOLA pitch shifting, five styles, live monitoring and settings (key, scale, retune speed, mix, volume).
- ✅ Phase 3: Recording. Record the autotuned voice (up to 5 min), play it back and download it as WAV.
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

Turn on **🎧 Hör mig själv** only with wired headphones. Without them the speaker feeds back into the mic, and Bluetooth adds 150–250 ms of delay.

## How it works
```
getUserMedia → MediaStreamSource → AudioWorkletNode("autotune") ─┬→ GainNode (monitor) → destination
                                     │                           └→ AudioWorkletNode("recorder") → WAV
                                     ├─ ↓2 → YIN pitch detection → nearest note in key/scale
                                     ├─ retune smoothing (retuneMs, humanize) → shift ratio
                                     ├─ TD-PSOLA pitch shift (+ optional formant shift)
                                     └─ crossfade to dry when no clear pitch (breaths, consonants)
```
Recordings capture the autotuned signal before the monitor volume, so a take sounds the same whether live monitoring is on or off. They are encoded as 16-bit mono WAV (`src/audio/wav.js`), the same format in every browser. That's about 5–6 MB per minute.

Styles are plain objects in `src/presets.js`; adding a style means adding an object.

| Style | Retune | Scale | Transpose | Formants |
|---|---|---|---|---|
| 🌿 Naturlig | 100 ms, 30 % humanize | chromatic | 0 | – |
| 🌟 Popstjärna | 20 ms | major | 0 | – |
| 🤖 Robot | 0 ms | chromatic | 0 | – |
| 🐿️ Jordekorre | 0 ms | chromatic | +12 | ×1.5 |
| 👹 Monster | 20 ms | chromatic | −12 | ×0.75 |

Latency added by the autotune is ~27 ms (two periods of the lowest voice, 75 Hz). The total also depends on the device's audio output; the **Teknisk info** panel shows the measured numbers.

- The mic is opened with echo cancellation, noise suppression and auto gain **off**, since those filters ruin pitch detection.
- DSP lives in pure functions in `src/dsp/` and is unit-tested with synthetic signals. `src/audio/autotune-worklet.js` only wires them together.
- See [CLAUDE.md](CLAUDE.md) for the full architecture and project conventions.
