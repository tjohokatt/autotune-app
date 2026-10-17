// Reads text aloud with the browser's built-in voices (speechSynthesis).
// Runs on the device; nothing is sent anywhere by the app.

/**
 * Pick the best voice for a list of preferred languages, e.g. ['sv-FI', 'sv-SE'].
 * Exact tag match first (in preference order), then same base language ("sv").
 */
export function pickVoice(voices, voiceLangs) {
  const norm = (tag) => tag.replace('_', '-').toLowerCase();
  for (const lang of voiceLangs) {
    const exact = voices.find((v) => norm(v.lang) === norm(lang));
    if (exact) return exact;
  }
  const base = norm(voiceLangs[0]).split('-')[0];
  return voices.find((v) => norm(v.lang).split('-')[0] === base) ?? null;
}

export function speechSupported() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

/** Voices load asynchronously in Chrome; wait briefly for them. */
export function loadVoices(timeoutMs = 1500) {
  const synth = window.speechSynthesis;
  const now = synth.getVoices();
  if (now.length) return Promise.resolve(now);
  return new Promise((resolve) => {
    const done = () => resolve(synth.getVoices());
    synth.addEventListener('voiceschanged', done, { once: true });
    setTimeout(done, timeoutMs);
  });
}

/** Speak text in a dialect's voice. Resolves when finished or cancelled. */
export async function speak(text, dialect, { onStart, onEnd } = {}) {
  const synth = window.speechSynthesis;
  synth.cancel();
  const voice = pickVoice(await loadVoices(), dialect.speech.voiceLangs);
  if (!voice) return false;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.voice = voice;
  utterance.lang = voice.lang;
  utterance.rate = dialect.speech.rate;
  utterance.pitch = dialect.speech.pitch;
  return new Promise((resolve) => {
    utterance.onstart = () => onStart?.();
    utterance.onend = utterance.onerror = () => {
      onEnd?.();
      resolve(true);
    };
    synth.speak(utterance);
  });
}

export function stopSpeaking() {
  if (speechSupported()) window.speechSynthesis.cancel();
}
