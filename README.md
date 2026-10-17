# Autotune

A browser-based autotune app for singing at home. Sing into the mic and hear your voice pitch-corrected in near real time, in styles from subtle to full robot. Record a take, play it back and download it as a WAV file. Everything runs in the browser: no backend, no accounts, and no audio ever leaves the device.

**Live site:** coming in phase 4 (GitHub Pages: `https://tjohokatt.github.io/autotune-app/`).

The start page lets you choose between **🎤 Autotune** and **🗣️ Dialektförvrängare** (dialect changer): type a sentence, pick Skånska, Göteborgska, Stockholmska, Norrländska or Finlandssvenska, and hear it read aloud by the device's built-in voice. You can also record yourself (up to 10 s): **🎤 Din röst på dialekt** keeps your own voice but gives it the dialect's melody and tempo, and **🤖 Datorn säger det** turns what you said into text on the device (Whisper; the model, ~80 MB, downloads once on first use), rewrites it and reads it aloud.

## Status
- ✅ Phase 1: Tuner. Live pitch detection (YIN in an AudioWorklet) shows the current note and how many cents off it is.
- ✅ Phase 2: Autotune. TD-PSOLA pitch shifting, five styles, live monitoring and settings (key, scale, retune speed, mix, volume).
- ✅ Phase 3: Recording. Record the autotuned voice (up to 5 min), play it back and download it as WAV.
- ⏳ Phase 4: Deploy to GitHub Pages
- ✅ Phase 5: Start page with mode picker (Autotune / Dialektförvrängare)
- ✅ Phase 6: Dialect changer: text rewrite + read-aloud, five Swedish dialects (English later)
- ✅ Phase 7: Karaoke: lyrics in time with a backing track, mixed into the recording

## Karaoke
In autotune, **🎶 Karaoke → ➕ Ny låt** adds a song from your own files:

- **Music:** an mp3/m4a/wav backing track, e.g. a bought instrumental or karaoke version.
- **Lyrics:** an `.lrc` file with times (`[00:12.40]A line`), or plain text with one line per sung line. Plain text opens the **⏱️ Tidsätt texten** editor: play the song and tap **Nu!** as each line starts.
- **Tonart (optional):** e.g. `Am`. It's stored as a `[key:Am]` tag and sets the autotune key and scale when the song is selected.

Songs are stored in the browser (IndexedDB) and never uploaded. No lyrics or music are included in the app, since songs are copyrighted.

Tap **Starta**, then **▶ Spela låten**. The lyrics follow the music, and if you record at the same time, the backing track is mixed into the take. Use headphones: through speakers the mic picks up the music.

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
Recordings capture the autotuned signal before the monitor volume, so a take sounds the same whether live monitoring is on or off. Each finished take is peak-normalized (up to +26 dB, `src/audio/normalize.js`), because phone mics are quiet with auto gain control off. Takes are encoded as 16-bit mono WAV (`src/audio/wav.js`), the same format in every browser. That's about 5–6 MB per minute.

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
