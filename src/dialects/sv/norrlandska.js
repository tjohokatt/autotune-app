// Two-syllable verbs with a short first vowel drop their final -a
// ("hoppa" → "hopp", "kasta" → "kast"), as in much of Norrland.
const SHORT_A = /^([^aeiouyåäö]*[aeiouyåäö])(bb|dd|ff|gg|kk|ll|mm|nn|pp|rr|ss|tt|st|ck|ng|nk|rt|ft|lt|nt|ld|nd|rk|rm)a$/;

export default {
  id: 'norrlandska',
  lang: 'sv',
  name: 'Norrländska',
  emoji: '🌲',
  lexicon: {
    jag: 'ja',
    ja: 'jo',
    mig: 'mej',
    dig: 'dej',
    sig: 'sej',
    nej: 'nä',
    inte: 'int',
    ingenting: 'inget',
    mycket: 'mycke',
    det: 'dä',
    här: 'hä',
    där: 'dä',
    är: 'ä',
    och: 'å',
    vad: 'va',
    hemma: 'heme',
    // Not verbs: keep the -a.
    mamma: 'mamma',
    pappa: 'pappa',
    'vet du': 'vettu',
    tjej: 'jänta',
    tjejer: 'jäntor',
    flicka: 'jänta',
    flickan: 'jänta',
    flickor: 'jäntor',
    kille: 'pojk',
    pojke: 'pojk',
    pojken: 'pojkn',
    barn: 'onge',
    barnen: 'ongarna',
    unge: 'onge',
    ungar: 'ongar',
    potatis: 'pärer',
    potatisar: 'pärer',
    tokig: 'tokut',
    konstig: 'konstut',
    smutsig: 'skitut',
    lerig: 'lerut',
    jättebra: 'himla bra',
    kallt: 'kallt så in i bängen',
    hej: 'tjenare',
  },
  rules: [
    { from: SHORT_A, to: '$1$2' }, // titta → titt, dricka → drick
    { from: /ade$/, to: 'a' }, // kastade → kasta
    { from: /^jätte(?=.)/, to: 'himla ' },
  ],
  endings: [', vettu', ', du', ', int sant', ', jo'],
  // Calm, low and steady; words fall gently.
  voice: { melody: [0, -1, -1, -2, -2], syllable: [0, -1], beat: [0, -1], flatten: 0.6, shift: -2, tempo: 0.85 },
  speech: { rate: 0.82, pitch: 0.85, voiceLangs: ['sv-SE'] },
};
