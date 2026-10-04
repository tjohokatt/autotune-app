// Styles. Adding a style = adding an object here.
//
//   retuneMs      how fast the voice is pulled to the note (0 = instant, robotic)
//   humanize      0…1, how much of the singer's own deviation is left in
//   scale         'chromatic' | 'major' | 'minor' | 'pentatonic' (see dsp/scales.js)
//   transpose     semitones added on top of the corrected note
//   formantShift  >1 brighter/smaller ("chipmunk"), <1 darker/bigger ("monster")
//   mix           0…1 corrected vs. original voice
//   harmonies     extra voices in semitones (later phase, unused for now)
//   reverb        0…1 (later phase, unused for now)

export const PRESETS = [
  {
    id: 'natural',
    name: 'Naturlig',
    emoji: '🌿',
    retuneMs: 100,
    humanize: 0.3,
    scale: 'chromatic',
    transpose: 0,
    formantShift: 1,
    mix: 1,
    harmonies: [],
    reverb: 0,
  },
  {
    id: 'popstar',
    name: 'Popstjärna',
    emoji: '🌟',
    retuneMs: 20,
    humanize: 0,
    scale: 'major',
    transpose: 0,
    formantShift: 1,
    mix: 1,
    harmonies: [],
    reverb: 0,
  },
  {
    id: 'robot',
    name: 'Robot',
    emoji: '🤖',
    retuneMs: 0,
    humanize: 0,
    scale: 'chromatic',
    transpose: 0,
    formantShift: 1,
    mix: 1,
    harmonies: [],
    reverb: 0,
  },
  {
    id: 'chipmunk',
    name: 'Jordekorre',
    emoji: '🐿️',
    retuneMs: 0,
    humanize: 0,
    scale: 'chromatic',
    transpose: 12,
    formantShift: 1.5,
    mix: 1,
    harmonies: [],
    reverb: 0,
  },
  {
    id: 'monster',
    name: 'Monster',
    emoji: '👹',
    retuneMs: 20,
    humanize: 0,
    scale: 'chromatic',
    transpose: -12,
    formantShift: 0.75,
    mix: 1,
    harmonies: [],
    reverb: 0,
  },
];

export const DEFAULT_PRESET_ID = 'popstar';

export function getPreset(id) {
  return PRESETS.find((p) => p.id === id) ?? PRESETS.find((p) => p.id === DEFAULT_PRESET_ID);
}
