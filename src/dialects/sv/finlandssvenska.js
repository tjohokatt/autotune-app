export default {
  id: 'finlandssvenska',
  lang: 'sv',
  name: 'Finlandssvenska',
  emoji: '🇫🇮',
  lexicon: {
    hej: 'moi',
    hejdå: 'moi moi',
    ja: 'jå',
    nej: 'nä',
    inte: 'int',
    jättebra: 'hemskt bra',
    kul: 'kiva',
    roligt: 'kiva',
    rolig: 'kiva',
    läsk: 'limsa',
    godis: 'karkki',
    mobil: 'känny',
    mobilen: 'kännyn',
    toalett: 'vessa',
    toaletten: 'vessan',
    mormor: 'mommo',
    farmor: 'mommo',
    morfar: 'moffa',
    farfar: 'moffa',
    okej: 'jå jå',
  },
  rules: [
    // The sj-sound is a plain "sch" and tj/k before soft vowels a "tsch".
    { from: /^(sj|skj|stj)/, to: 'sch' }, // sju → schu
    { from: /^sk(?=[eiyäö])/, to: 'sch' }, // sked → sched
    { from: /^(tj|kj)/, to: 'tsch' }, // tjugo → tschugo
    { from: /^k(?=[eiyäö])/, to: 'tsch' }, // kär → tschär
    { from: /^jätte(?=.)/, to: 'hemskt ' },
  ],
  endings: [', nå', ', vet du', ', int sant', ', nog'],
  // No word accents at all: flat melody, even syllables, measured pace.
  voice: { melody: [0, 0, 0, 0, -1], syllable: [0], beat: [0], flatten: 0.25, shift: 0, tempo: 0.9 },
  speech: { rate: 0.85, pitch: 0.95, voiceLangs: ['sv-FI', 'sv-SE'] },
};
