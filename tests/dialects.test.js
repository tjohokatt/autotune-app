import { describe, it, expect } from 'vitest';
import { tokenize, matchCase, translate, addEnding } from '../src/dialects/engine.js';
import { pickVoice } from '../src/dialects/speech.js';
import { DIALECTS, getDialect, dialectsFor } from '../src/dialects/index.js';

const plain = (dialect) => ({ ...dialect, endings: [] });

describe('tokenize', () => {
  it('keeps words with åäö together and preserves punctuation', () => {
    expect(tokenize('Hej, jag är här!')).toEqual(['Hej', ', ', 'jag', ' ', 'är', ' ', 'här', '!']);
  });
});

describe('matchCase', () => {
  it('copies capitalization', () => {
    expect(matchCase('Jag', 'jau')).toBe('Jau');
    expect(matchCase('JAG', 'jau')).toBe('JAU');
    expect(matchCase('jag', 'jau')).toBe('jau');
    expect(matchCase('I', 'jag')).toBe('Jag');
  });
});

describe('translate', () => {
  const skanska = plain(getDialect('skanska'));
  const stockholmska = plain(getDialect('stockholmska'));
  const goteborgska = plain(getDialect('goteborgska'));

  it('replaces whole words and keeps punctuation and case', () => {
    expect(translate('Jag vill ha mycket glass nu!', skanska)).toBe('Jau vill ha möcke glass neu!');
  });

  it('does not replace parts of words', () => {
    // "ut" is in the Skånska lexicon, "utan" is not.
    expect(translate('utan', skanska)).toBe('utan');
  });

  it('matches multi-word phrases', () => {
    expect(translate('Korv med bröd', goteborgska)).toBe('Kôrv me bröd');
  });

  it('applies rules to words the lexicon did not replace', () => {
    expect(translate('rolig', stockholmska)).toBe('roli');
    expect(translate('mig', stockholmska)).toBe('mej');
  });

  it('adds an ending before the final punctuation, deterministically', () => {
    const d = getDialect('stockholmska');
    const a = translate('Det är bra.', d);
    expect(a).toMatch(/^De e nice, \p{L}+\.$/u);
    expect(translate('Det är bra.', d)).toBe(a);
  });

  it('applies each dialect\'s sound rules', () => {
    const say = (text, id) => translate(text, { ...getDialect(id), endings: [] });
    expect(say('Kan du se solen? Den är stor och gul.', 'skanska')).toBe('Kan deu sei solen? Den e stour å geul.');
    expect(say('Som om', 'skanska')).toBe('Som om'); // short vowels stay
    expect(say('Korven är borta', 'goteborgska')).toBe('Kôrven ä bôrta');
    expect(say('Jag tittade', 'stockholmska')).toBe('Ja titta');
    expect(say('Vi ska hoppa och dricka saft med mamma', 'norrlandska')).toBe('Vi ska hopp å drick saft med mamma');
    expect(say('Sju kyrkor och tjugo kor', 'finlandssvenska')).toBe('Schu tschyrkor och tschugo kor');
  });

  it('leaves empty text alone', () => {
    expect(translate('', getDialect('skanska'))).toBe('');
  });
});

describe('addEnding', () => {
  it('handles text without punctuation', () => {
    expect(addEnding('hej', [', ju'])).toBe('hej, ju');
    expect(addEnding('hej?!', [', ju'])).toBe('hej, ju?!');
  });
});

describe('dialect definitions', () => {
  it('have unique ids and the fields the UI needs', () => {
    expect(new Set(DIALECTS.map((d) => d.id)).size).toBe(DIALECTS.length);
    for (const d of DIALECTS) {
      expect(d.name && d.emoji && d.lang).toBeTruthy();
      expect(d.speech.voiceLangs.length).toBeGreaterThan(0);
      for (const key of Object.keys(d.lexicon)) expect(key).toBe(key.toLowerCase());
    }
    expect(dialectsFor('sv').length).toBeGreaterThanOrEqual(5);
  });
});

describe('pickVoice', () => {
  const voices = [{ lang: 'en-US' }, { lang: 'sv-SE' }, { lang: 'sv_FI' }];

  it('prefers an exact language match in order', () => {
    expect(pickVoice(voices, ['sv-FI', 'sv-SE'])).toBe(voices[2]);
    expect(pickVoice(voices, ['sv-SE'])).toBe(voices[1]);
  });

  it('falls back to the same base language, or null', () => {
    expect(pickVoice([{ lang: 'sv-SE' }], ['sv-FI'])).toEqual({ lang: 'sv-SE' });
    expect(pickVoice([{ lang: 'en-US' }], ['sv-SE'])).toBeNull();
  });
});

describe('dialect voice settings', () => {
  it('every dialect has voice settings in a sensible range', () => {
    for (const d of DIALECTS) {
      expect(d.voice.melody.length).toBeGreaterThan(0);
      expect(d.voice.tempo).toBeGreaterThan(0.5);
      expect(d.voice.tempo).toBeLessThan(1.5);
      for (const st of [...d.voice.melody, ...(d.voice.syllable ?? []), ...(d.voice.beat ?? [])]) {
        expect(Math.abs(st)).toBeLessThanOrEqual(6);
      }
    }
  });
});
