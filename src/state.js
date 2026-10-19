(function (PopoGame) {
'use strict';

// One phase at a time decides what input is allowed; nothing else does.
const PHASE = {
  TITLE: 'title',
  INTRO: 'intro',
  PUZZLE_READY: 'puzzleReady',
  DRAGGING: 'dragging',
  SNAPPING: 'snapping',
  SHAPE_CORRECT: 'shapeCorrect',
  DROP_READY: 'dropReady',
  NET_LOWERING: 'netLowering',
  CATCHING: 'catching',
  NET_RAISING: 'netRaising',
  LEVEL_SUCCESS: 'levelSuccess',
  TRANSITIONING: 'transitioning',
  GAME_COMPLETE: 'gameComplete',
};

const state = {
  phase: PHASE.TITLE,
  paused: false,
  level: 0,
  locationIndex: 0,
  fish: [],
  caught: 0,   // netted so far
  banked: 0,   // of those, already in the bucket (the HUD's tally)
  muted: false,
  token: 0,
  idleTime: 0,
  misses: 0, // corners let go away from their place this level; hints come sooner after a few
};

function resetProgress() {
  state.phase = PHASE.TITLE;
  state.paused = false;
  state.level = 0;
  state.locationIndex = 0;
  state.fish = [];
  state.caught = 0;
  state.banked = 0;
  state.idleTime = 0;
  state.misses = 0;
}

// Every sequence captures a token; bumping it cancels anything still waiting.
function newToken() {
  state.token += 1;
  return state.token;
}

function isCurrent(token) {
  return token === state.token;
}

Object.assign(PopoGame, { PHASE, state, resetProgress, newToken, isCurrent });
})(window.PopoGame = window.PopoGame || {});
