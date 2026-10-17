// All dialects. Adding one = adding a file and listing it here.
// English dialects go in ./en/ with lang: 'en' and English voiceLangs.

import stockholmska from './sv/stockholmska.js';
import goteborgska from './sv/goteborgska.js';
import skanska from './sv/skanska.js';
import norrlandska from './sv/norrlandska.js';
import finlandssvenska from './sv/finlandssvenska.js';

export const DIALECTS = [skanska, goteborgska, stockholmska, norrlandska, finlandssvenska];

export const LANGUAGES = { sv: 'Svenska', en: 'Engelska' };

export function dialectsFor(lang) {
  return DIALECTS.filter((d) => d.lang === lang);
}

export function getDialect(id) {
  return DIALECTS.find((d) => d.id === id) ?? DIALECTS[0];
}

/** Example sentences per language for the 🎲 button. */
export const EXAMPLES = {
  sv: [
    'Hej! Jag vill ha mycket glass nu.',
    'Det är jättebra väder i dag.',
    'Vad gör du? Jag tittar på en film med min kompis.',
    'Nej, jag vill inte gå och lägga mig.',
    'Kan vi äta korv med bröd sedan?',
    'Min kompis är jättekul och jag gillar henne.',
  ],
};
