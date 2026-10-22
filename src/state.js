(function (PopoGame) {
'use strict';

// One phase at a time decides what input is allowed; nothing else does.
const PHASE = {
  TITLE: 'title',
  INTRO: 'intro',
  PUZZLE_READY: 'puzzleReady',
  DRAGGING: 'dragging',
  NET_LOWERING: 'netLowering',
  CATCHING: 'catching',
  NET_RAISING: 'netRaising',
  NET_BREAKING: 'netBreaking',
  LEVEL_COMPLETE: 'levelComplete',
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
  muted: false,
  token: 0,
  idleTime: 0,
  misses: 0, // wrong checks this level; hints come sooner after a couple
};

function resetProgress() {
  state.phase = PHASE.TITLE;
  state.paused = false;
  state.level = 0;
  state.locationIndex = 0;
  state.fish = [];
  state.caught = 0;
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
