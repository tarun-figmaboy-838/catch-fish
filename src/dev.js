(function (PopoGame) {
'use strict';
// ?dev=1 adds a small panel for jumping straight to any screen of the game while building it.
// Number keys 1–9 and 0 press the buttons in order; ` folds the panel away.
if (new URLSearchParams(location.search).get('dev') !== '1') return;

const { state, PHASE, LEVELS, snapCorner, rowTo, celebrate, newToken } = PopoGame;

function game() {
  return window.popoDebug && window.popoDebug.game;
}

// Leaves the title (as Play would) without starting the opening story.
function begin(g) {
  if (state.phase === PHASE.TITLE) {
    g.titleFade = 0;
    g.audio.init();
    g.audio.resume();
    g.audio.startMusic();
    g.ui.hideStart();
    g.ui.showHud();
  }
  g.reset();
}

// Straight to a level: its waters, its school already swimming and its net in place.
function level(index) {
  const g = game();
  begin(g);
  state.locationIndex = LEVELS[index].location;
  g.applyLocation();
  g.prepareLevel(index);
  g.spawnSchool();
  g.net.visible = true;
  g.beginPuzzle();
}

const JUMPS = [
  ['Title', () => {
    const g = game();
    g.reset();
    g.audio.stopMusic();
    g.ui.showStart();
    g.showIdleScene();
  }],
  ['Intro', () => { const g = game(); begin(g); g.restart(); }],
  ...LEVELS.map((lv, i) => [`L${i + 1}`, () => level(i)]),
  ['Solve', () => {
    const g = game();
    if (state.phase !== PHASE.PUZZLE_READY) level(state.level);
    g.net.setHandle(g.net.target);
    snapCorner(g);
  }],
  ['Drop', () => { const g = game(); if (state.phase === PHASE.DROP_READY) g.onDrop(); }],
  ['Row on', () => {
    const g = game();
    begin(g);
    const from = Math.min(state.locationIndex, 2);
    state.locationIndex = from;
    g.applyLocation();
    g.net.visible = true;
    const token = newToken();
    state.phase = PHASE.TRANSITIONING;
    rowTo(g, from + 1, token).then(() => { g.prepareLevel(state.level); g.spawnSchool(); g.beginPuzzle(); }).catch(() => {});
  }],
  ['Finish', () => { const g = game(); level(LEVELS.length - 1); celebrate(g, newToken()).catch(() => {}); }],
];

const css = document.createElement('style');
css.textContent = `
.dev-panel { position: fixed; left: 8px; bottom: 8px; z-index: 50; display: flex; flex-wrap: wrap; gap: 4px;
  max-width: min(560px, 33vw); padding: 6px; border-radius: 10px; background: rgba(10, 20, 40, 0.82);
  font: 600 12px/1 system-ui, sans-serif; color: #fff; box-shadow: 0 4px 14px rgba(0, 0, 0, 0.35); }
.dev-panel button { font: inherit; padding: 6px 8px; border: 0; border-radius: 6px; background: #2f4f7f; color: #fff; cursor: pointer; }
.dev-panel button:hover { background: #3f6aa8; }
.dev-panel button kbd { opacity: 0.6; font: inherit; margin-right: 4px; }
.dev-panel .dev-tag { padding: 6px 6px 6px 2px; color: #ffd23f; cursor: pointer; }
.dev-panel.folded button { display: none; }
`;
document.head.appendChild(css);

const panel = document.createElement('div');
panel.className = 'dev-panel';
panel.setAttribute('aria-label', 'Developer screen jumps');
const tag = document.createElement('span');
tag.className = 'dev-tag';
tag.textContent = 'DEV';
tag.title = 'Fold or unfold (`)';
tag.addEventListener('click', () => panel.classList.toggle('folded'));
panel.appendChild(tag);
JUMPS.forEach(([label, run], i) => {
  const b = document.createElement('button');
  b.type = 'button';
  b.innerHTML = i < 10 ? `<kbd>${(i + 1) % 10}</kbd>` : '';
  b.appendChild(document.createTextNode(label));
  b.addEventListener('click', (e) => { e.stopPropagation(); if (game()) run(); });
  panel.appendChild(b);
});
document.body.appendChild(panel);

document.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey || e.target.closest('input, textarea')) return;
  if (e.key === '`') { panel.classList.toggle('folded'); return; }
  if (!/^[0-9]$/.test(e.key) || !game()) return;
  const jump = JUMPS[(Number(e.key) + 9) % 10];
  if (jump) jump[1]();
});
})(window.PopoGame = window.PopoGame || {});
