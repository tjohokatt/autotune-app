# CLAUDE.md — Autotune App

## What this is
A browser-based autotune app for fun singing at home. Primary user is a child, so the UI must be playful, simple and work great on a phone. The owner (Jakob) is technical and reviews all changes via GitHub pull requests.

## Core requirements
- Sing into the mic (desktop USB mic **or** phone mic) and hear yourself autotuned in near real time.
- Selectable **styles** (presets) — see "Styles" below.
- Record a take, play it back, and download it.
- Runs **100% in the browser**. No backend, no accounts, no analytics, no audio ever leaves the device.
- UI language: **Swedish**. Code, comments, commits and docs: **English**.

## Tech stack
- **Vite + vanilla JavaScript (ES modules)**. No UI framework unless there is a strong reason — discuss in the PR first.
- **Web Audio API** with an **AudioWorklet** for all DSP (never ScriptProcessorNode).
- **Vitest** for unit tests.
- Hosting: **GitHub Pages**, deployed by a GitHub Actions workflow on push to `main`.
  - Vite `base` must be set to `/autotune-app/` (repo name).

## Audio architecture
```
getUserMedia → MediaStreamSource → AudioWorkletNode("autotune")
                                       ├─ pitch detection (YIN or McLeod/MPM)
                                       ├─ target note = snap to key/scale
                                       ├─ smoothing (retune speed, humanize)
                                       └─ pitch shift (PSOLA preferred; granular as fallback)
                                   → effects (optional: reverb, harmony voices)
                                   → GainNode (monitor) → destination
                                   → MediaRecorder / WAV capture for recording
```
- Request the mic with `echoCancellation: false, noiseSuppression: false, autoGainControl: false` — those filters ruin pitch detection.
- Keep latency low: small worklet buffers, no main-thread DSP. Show the measured latency in a debug panel.
- Pitch detection runs on a sliding window; output a "confidence" value and pass audio through unprocessed when confidence is low (breaths, consonants, silence).
- DSP code lives in pure functions under `src/dsp/` so it can be unit-tested outside the worklet. The worklet file only wires them together.
- Worklet ↔ main thread communication: `AudioParam`s for continuous values (retune speed, mix), `port.postMessage` for discrete changes (key, scale, preset) and for sending detected pitch to the UI.

## Styles (presets)
A preset is a plain object, e.g. `{ id, name, retuneMs, humanize, scale, transpose, formantShift, mix, harmonies, reverb }`, defined in `src/presets.js`. Adding a style should only require adding an object.

Initial set:
| id | Swedish name | Character |
|---|---|---|
| `natural` | Naturlig | Slow retune (~80–120 ms), subtle correction |
| `popstar` | Popstjärna | Fast retune (~20 ms), major scale |
| `robot` | Robot | Instant retune (0 ms), chromatic — the hard "T-Pain" effect |
| `chipmunk` | Jordekorre | Robot-ish + transpose +12 semitones |
| `monster` | Monster | Transpose −12, darker formant |
| `choir` | Kör | Natural + harmony voices (third + fifth) — later phase |

## Mobile / browser gotchas
- `getUserMedia` requires a **secure context** (HTTPS or `localhost`). For testing on a phone on the LAN, the dev server runs with HTTPS (`@vitejs/plugin-basic-ssl`) and `--host`.
- iOS Safari: `AudioContext` must be created/resumed from a user tap. Use a big "Starta" button.
- Don't assume a sample rate — read `audioContext.sampleRate` (often 48000 on phones).
- Show a clear tip about **headphones** when live monitoring is on (otherwise feedback).
- Handle denied mic permission with a friendly Swedish message.

## UI guidelines
- Big touch targets (≥ 48 px), high contrast, mobile-first layout, works in portrait.
- Main screen: Start/Stop, style picker (large cards with emoji/icon), a live pitch display (current note + target note, a simple meter or line), record button.
- Settings tucked away: key, scale, retune speed, monitor volume, mix.
- No external fonts or CDNs required at runtime; the app should work offline after first load (PWA is a later nice-to-have).

## Project layout
```
src/
  main.js            UI wiring
  audio/engine.js    AudioContext, mic, node graph
  audio/autotune-worklet.js
  dsp/               pitch detection, scales, pitch shifting (pure, tested)
  presets.js
  ui/                small UI modules
tests/               Vitest tests (synthetic sine/sawtooth signals at known frequencies)
.github/workflows/deploy.yml
```

## Commands
- `npm install`
- `npm run dev` — HTTPS dev server, reachable on LAN
- `npm test` — unit tests
- `npm run build` — production build to `dist/`
- `npm run preview`

## Git workflow (important)
- **Never commit directly to `main`.** Create a branch per change: `feat/…`, `fix/…`, `chore/…`, `docs/…`.
- Small, focused commits with clear messages (Conventional Commits style: `feat: add robot preset`).
- Before opening a PR: `npm test` and `npm run build` must pass.
- Open PRs with `gh pr create`. The PR description must include: what changed, why, how to test it (incl. on phone), and any known limitations.
- Jakob reviews and merges. Don't merge your own PRs.
- Keep `README.md` up to date (what it is, how to run, link to the live site).

## Working style
- For anything non-trivial, propose a short plan first and wait for approval.
- Prefer simple, readable code over clever code; comment the DSP math.
- When unsure about audio quality trade-offs, explain the options briefly and pick a sensible default.
- Don't add dependencies without saying why in the PR.
