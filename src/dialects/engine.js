// Rewrites plain Swedish (or later English) text into a dialect.
// Pure functions, no DOM, so the rules can be unit-tested.
//
// A dialect is a plain object (see src/dialects/sv/*.js):
//   id, lang, name, emoji
//   lexicon   { word: replacement } for whole words, matched case-insensitively.
//             Keys may be several words ("korv med bröd"); longest match wins.
//   rules     [{ from: RegExp, to: string }] applied to each word the lexicon
//             didn't replace. Anchor them with ^/$ – they see one word at a time.
//   endings   short tags appended to the text (", typ"); one is picked from
//             the text itself so the result doesn't flicker while typing.
//   speech    { rate, pitch, voiceLangs } for speechSynthesis.

// Letters including åäö and other accented letters; digits count as word chars.
const TOKEN = /[\p{L}\p{N}]+|[^\p{L}\p{N}]+/gu;
const IS_WORD = /^[\p{L}\p{N}]+$/u;

/** Split text into alternating word / non-word tokens (spaces, punctuation). */
export function tokenize(text) {
  return text.match(TOKEN) ?? [];
}

/** Give `replacement` the same capitalization as `original`. */
export function matchCase(original, replacement) {
  if (!replacement) return replacement;
  if (original.length > 1 && original === original.toUpperCase() && original !== original.toLowerCase()) {
    return replacement.toUpperCase();
  }
  if (original[0] !== original[0].toLowerCase()) {
    return replacement[0].toUpperCase() + replacement.slice(1);
  }
  return replacement;
}

/** Small stable string hash, used to pick an ending deterministically. */
export function hashString(text) {
  let h = 0;
  for (const ch of text) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return h;
}

function applyRules(word, rules) {
  let out = word;
  for (const { from, to } of rules) out = out.replace(from, to);
  return out;
}

// Pre-split multi-word lexicon keys once per dialect, longest first.
const phraseCache = new WeakMap();
function phrasesOf(dialect) {
  let phrases = phraseCache.get(dialect);
  if (!phrases) {
    phrases = Object.entries(dialect.lexicon ?? {})
      .map(([key, value]) => ({ words: key.toLowerCase().split(/\s+/), value }))
      .sort((a, b) => b.words.length - a.words.length);
    phraseCache.set(dialect, phrases);
  }
  return phrases;
}

/**
 * Translate text into the dialect. Whitespace and punctuation are kept.
 * Multi-word phrases only match across plain spaces.
 */
export function translate(text, dialect) {
  const tokens = tokenize(text);
  const phrases = phrasesOf(dialect);
  const rules = dialect.rules ?? [];
  const out = [];

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (!IS_WORD.test(token)) {
      out.push(token);
      continue;
    }
    const lower = token.toLowerCase();
    let replaced = false;
    for (const { words, value } of phrases) {
      if (words[0] !== lower) continue;
      // Words sit at i, i+2, i+4… with single-space separators in between.
      const fits = words.every(
        (w, k) => tokens[i + 2 * k]?.toLowerCase() === w && (k === 0 || tokens[i + 2 * k - 1] === ' '),
      );
      if (!fits) continue;
      out.push(matchCase(token, value));
      i += 2 * (words.length - 1);
      replaced = true;
      break;
    }
    if (!replaced) out.push(matchCase(token, applyRules(lower, rules)));
  }

  return addEnding(out.join(''), dialect.endings, text);
}

/** Append one of the dialect's endings before the final punctuation, if any. */
export function addEnding(text, endings, seedText = text) {
  if (!endings?.length || !text.trim()) return text;
  const ending = endings[hashString(seedText.trim()) % endings.length];
  const m = text.match(/^(.*?)(\s*[.!?…]*\s*)$/su);
  return m[1] + ending + m[2];
}
