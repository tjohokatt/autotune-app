// Styles. Adding a style = adding an object here.
//
//   retuneMs      how fast the voice is pulled to the note (0 = instant, robotic)
//   humanize      0…1, how much of the singer's own deviation is left in
//   scale         'chromatic' | 'major' | 'minor' | 'pentatonic' (see dsp/scales.js)
//   transpose     semitones added on top of the corrected note
//   formantShift  >1 brighter/smaller ("chipmunk"), <1 darker/bigger ("monster")
//   mix           0…1 corrected vs. original voice
//   harmonies     extra voices [{ steps, gain, pan }]; steps = scale degrees from
//                 the lead's note (2 = third, 4 = fifth, negative = below)
//   doubles       vocal doubling { count, detuneCents, delayMs: [..], gain, pan }
//                 or null. Doubles are copies of the lead, slightly detuned
//                 and late, alternating left/right.
//   reverb        { mix, size } or null; mix 0…1 wet level, size 0…1 small room → hall
//
// pan is −1 (left) … 1 (right). Voices are set relative to the lead (gain 1).
// The overall level is normalised, so adding voices doesn't make it louder.

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
    doubles: null,
    reverb: null,
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
    doubles: null,
    reverb: null,
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
    doubles: null,
    reverb: null,
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
    doubles: null,
    reverb: null,
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
    doubles: null,
    reverb: null,
  },
  {
    // Modern girl-group pop: tight but smooth tuning, stacked doubles,
    // third + fifth harmonies spread left/right, a touch brighter, in a room.
    id: 'popgroup',
    name: 'Popgrupp',
    emoji: '💜',
    retuneMs: 30,
    humanize: 0.1,
    scale: 'major',
    transpose: 0,
    formantShift: 1.08,
    mix: 1,
    harmonies: [
      { steps: 2, gain: 0.45, pan: -0.35 },
      { steps: 4, gain: 0.35, pan: 0.35 },
    ],
    doubles: { count: 2, detuneCents: 9, delayMs: [17, 26], gain: 0.5, pan: 0.7 },
    reverb: { mix: 0.22, size: 0.7 },
  },
];

export const DEFAULT_PRESET_ID = 'popstar';

export function getPreset(id) {
  return PRESETS.find((p) => p.id === id) ?? PRESETS.find((p) => p.id === DEFAULT_PRESET_ID);
}
