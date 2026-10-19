(function (PopoGame) {
'use strict';

// The six nets, the four fishing locations and the story lines.

// waterline: where the water meets the sky in the painting (the stage shifts the painting down,
// see SCENE_SHIFT). Levels move on to the next location as they go.
const LOCATIONS = [
  { name: 'Snowy Bay', background: 0, waterline: 388 },
  { name: 'Iceberg Cove', background: 1, waterline: 390 },
  { name: 'Glacier Pass', background: 2, waterline: 387 },
  { name: 'Northern Waters', background: 3, waterline: 388 },
];

const DRAG = 'Drag the glowing corner to make a *parallelogram*.';
const MAKE = 'Make a *parallelogram*!';

// Each level's solved net is a parallelogram: width and height, and lean (how far its top edge
// sits to the right of its bottom edge). `corner` is the one the child moves (A top-left, B
// top-right, C bottom-right, D bottom-left) and `start` is where it begins, measured from
// where it belongs: clearly wrong, never nearly right. `magnet` scales how close is close
// enough; hints wait `hintDelay` seconds of idling.
const LEVELS = [
  // guided discovery
  { location: 0, fish: 3, corner: 'B', width: 480, height: 200, lean: 60, start: { x: -120, y: 70 },
    hintDelay: 3.5, instruction: DRAG, praise: 'Great! *Opposite sides* are parallel!' },
  // the same idea, leaning the other way
  { location: 1, fish: 4, corner: 'B', width: 460, height: 210, lean: -70, start: { x: 90, y: 85 },
    hintDelay: 5, instruction: DRAG, praise: 'A parallelogram has *two pairs* of parallel sides!' },
  // a different corner
  { location: 1, fish: 5, corner: 'D', width: 500, height: 200, lean: 90, start: { x: 130, y: -80 },
    hintDelay: 5.5, instruction: DRAG, praise: 'Nice! You made a *parallelogram*!' },
  // different proportions: wide and low
  { location: 2, fish: 6, corner: 'C', width: 600, height: 180, lean: -80, start: { x: -110, y: -90 },
    hintDelay: 6, instruction: MAKE, praise: 'Parallelograms can look *different*!' },
  // less guidance: tall, a closer fit asked for, hints only after a long idle
  { location: 2, fish: 7, corner: 'A', width: 420, height: 260, lean: 70, start: { x: -130, y: 90 },
    magnet: 0.75, hintDelay: 7, instruction: MAKE, praise: 'Great! *Opposite sides* are parallel!' },
  // master round
  { location: 3, fish: 8, corner: 'D', width: 580, height: 240, lean: -110, start: { x: 150, y: -100 },
    hintDelay: 8, instruction: MAKE, praise: 'Nice! You made a *parallelogram*!' },
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
  let school = shuffle(NATURAL_FISH).slice(0, level.fish);
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
  // the final screen
  made: 'You made *parallelograms*!',
  lesson: 'Both pairs of opposite sides are *parallel*.',
};

Object.assign(PopoGame, { LOCATIONS, LEVELS, NATURAL_FISH, STORY, shuffle, schoolFor });
})(window.PopoGame = window.PopoGame || {});
