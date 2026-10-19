(function (PopoGame) {
'use strict';

// The eight nets, the four fishing locations and the story lines.

// waterline: where the water meets the sky in the painting (the stage shifts the painting down,
// see SCENE_SHIFT). Levels move on to the next location as they go.
const LOCATIONS = [
  { name: 'Snowy Bay', background: 0, waterline: 388 },
  { name: 'Iceberg Cove', background: 1, waterline: 390 },
  { name: 'Glacier Pass', background: 2, waterline: 387 },
  { name: 'Northern Waters', background: 3, waterline: 388 },
];

// The corners are A top-left, B top-right, C bottom-right and D bottom-left, clockwise. Each
// level's solved net is a parallelogram: `width`, `height` and `lean` (how far the top edge
// sits to the right of the bottom edge), or `angleA` instead of a lean. `corner` is the one
// the child moves and `start` where it begins, measured from its place; `along` keeps that
// corner on the line of the side named, so dragging only changes what the level is about.
// `metres` gives a side's length in metres, which sets the scale of every measurement shown.
// Each level teaches one property; `type` picks the check (see Net.check).
const LEVELS = [
  { title: 'Make it Parallel', type: 'parallel', sides: ['AB', 'CD'], corner: 'B',
    width: 440, height: 200, lean: 50, start: { x: 22, y: -90 }, // slid along AD, so BC stays parallel to AD
    location: 0, fish: 3, hintDelay: 3.5,
    prompt: 'Make *AB* parallel to *CD*.',
    praise: 'Great! AB and CD are parallel.',
    hint: 'Look at AB and CD. Do they run in the same direction?' },
  { title: 'Complete the Parallelogram', type: 'parallel', sides: ['BC', 'AD'], corner: 'C',
    width: 440, height: 210, lean: -60, start: { x: 120, y: 0 }, // slid along DC, so CD stays parallel to AB
    location: 0, fish: 4, hintDelay: 5,
    prompt: 'Make *BC* parallel to *AD*.',
    praise: 'Nice! Both pairs of opposite sides are parallel.',
    hint: 'Look at BC and AD. Do they lean the same way?' },
  { title: 'Match the Opposite Side', type: 'length', side: 'CD', reference: 'AB', metres: { AB: 6 }, corner: 'C', along: 'DC',
    width: 420, height: 200, lean: 50, start: { x: -98, y: 0 }, // CD starts at 4.6 m
    location: 1, fish: 4, hintDelay: 5,
    prompt: 'AB = *6 m*. Make CD = *6 m*.',
    praise: 'Great! Opposite sides can be equal.',
    hint: 'Compare the two opposite side lengths.' },
  { title: 'Use Both Side Properties', type: 'sides', metres: { AB: 8, AD: 5 }, corner: 'C',
    width: 380, height: 230, lean: 60, start: { x: -85, y: -70 },
    location: 1, fish: 5, hintDelay: 6,
    prompt: 'AB = *8 m* and AD = *5 m*. Make the net a parallelogram.',
    praise: 'Perfect! Opposite sides are equal and parallel.',
    hint: 'CD should match AB, and BC should match AD.' },
  { title: 'Match the Opposite Angle', type: 'angle', vertex: 'C', reference: 'A', degrees: 70, corner: 'C', along: 'DC',
    width: 420, height: 210, angleA: 70, start: { x: -110, y: 0 }, // angle C starts near 96 degrees
    location: 2, fish: 5, hintDelay: 6,
    prompt: '∠A = *70°*. Make ∠C = *70°*.',
    praise: 'Yes! Opposite angles are equal.',
    hint: 'Compare angle A with angle C.' },
  { title: 'Make the Adjacent Angle', type: 'supplementary', vertex: 'B', reference: 'A', degrees: 65, corner: 'B', along: 'AB',
    width: 420, height: 210, angleA: 65, start: { x: 104, y: 0 }, // angle B starts near 88 degrees
    location: 2, fish: 6, hintDelay: 6,
    prompt: '∠A = *65°*. Make ∠B supplementary to ∠A.',
    praise: 'Great! Adjacent angles add to 180°.',
    hint: 'Adjacent angles should add to 180°.' },
  { title: 'Balance the Diagonals', type: 'diagonals', metres: { AB: 6 }, corner: 'C',
    width: 440, height: 210, lean: 50, start: { x: 80, y: -65 },
    location: 3, fish: 7, hintDelay: 7,
    prompt: 'Make the diagonals *bisect* each other.',
    praise: 'Great! The diagonals bisect each other.',
    hint: 'Check both halves of each diagonal.' },
  { title: 'Final Catch', type: 'parallelogram', metres: { AB: 6 }, corner: 'D',
    width: 400, height: 210, lean: 30, rotate: -7, start: { x: 80, y: -70 },
    location: 3, fish: 9, hintDelay: 9,
    prompt: 'Make this net a *parallelogram*.',
    praise: 'You made a parallelogram!',
    hint: 'Think about what you learned: sides, angles, diagonals.' },
];

// The fish Popo nets, drawn in assets/sprites/fish-natural.webp (tools/build-assets.py).
const NATURAL_FISH = Object.keys(PopoGame.FISH_NATURAL_ATLAS.boxes);

function shuffle(list) {
  const result = [...list];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// A school of different fish for a level; no two levels in a row share the same mix.
let lastSchool = [];
function schoolFor(level) {
  const school = shuffle(NATURAL_FISH).slice(0, level.fish);
  if (school.every((key) => lastSchool.includes(key))) {
    const fresh = NATURAL_FISH.find((key) => !lastSchool.includes(key));
    if (fresh) school[0] = fresh;
  }
  lastSchool = school;
  return school;
}

// Story lines, delivered word by word. *Stressed* words land bigger with a boing, and a cue
// fires a moment in the scene when its word appears (see Game.storyCue).
const STORY = {
  intro: [
    { who: 'narrator', text: 'Popo *loves* fishing.', cue: { word: 1, do: 'hop' } },
    { who: 'narrator', text: 'And today…' },
    { who: 'narrator', text: 'he wants to catch *all* kinds of fish!', cue: { word: 4, do: 'fishIn' } },
  ],
  // said over the first net, which arrives as a parallelogram before a corner slips
  rule: { who: 'narrator', text: 'A parallelogram has *two pairs* of parallel sides!' },
  drop: 'Drop the *net*!',
  catch: { who: 'popo', text: '*Great* catch!', cue: { word: 0, do: 'hop' } },
  complete: { who: 'popo', text: 'We caught them *all*!', cue: { word: 0, do: 'hop' } },
  // the final card: the title, then the properties one at a time
  title: 'Parallelogram *Pro*!',
  lessons: [
    'Opposite sides are *parallel*.',
    'Opposite sides are *equal*.',
    'Opposite angles are *equal*.',
    'Adjacent angles add to *180°*.',
    'Diagonals *bisect* each other.',
  ],
};

Object.assign(PopoGame, { LOCATIONS, LEVELS, NATURAL_FISH, STORY, shuffle, schoolFor });
})(window.PopoGame = window.PopoGame || {});
