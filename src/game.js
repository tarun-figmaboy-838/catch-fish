(function (PopoGame) {
'use strict';
const { assets, preloadBackground, clock, ease, Effects, WaterScene, surfaceWave, PAN_OVERLAP, spawnFish, spawnSchool, refreshShadows, LOCATIONS, LEVELS, schoolFor, Popo, Winch, Net, TUCK, opening, startLevels, settleCorner, dropNet, Cancelled, STAGE_W, STAGE_H, SCENE_SHIFT, raftAnchor, state, PHASE, resetProgress, newToken, isCurrent } = PopoGame;

const HINT_REPEAT = 7;    // seconds of idling between hints once one has been shown
const NET_CLEARANCE = 40; // the net's bottom edge hangs this far above the water
const SCHOOL_TOP = 55;    // the school keeps this far below the surface
const SCHOOL_MARGIN = 26; // and this far inside the net's footprint
const TICK_GAP = 90;      // ms between measurement ticks while dragging

// The title banner: its water surface, sand line, the open water the decorative fish swim
// in, where the hooked fish splashes, and sparkle points along the logo's snowy edges.
const TITLE = {
  waterline: 610,
  seabed: 860,
  area: { left: 60, right: 1612, top: 680, bottom: 905 },
  // the play button floats in the middle of the banner's water; five shape fish circle it,
  // and a few more swim back and forth on the far left and right, clear of the orbit
  play: { x: 836, y: 772, r: 112 },
  orbit: { fish: ['triangle', 'square', 'pentagon', 'hexagon', 'circle'], rx: 270, ry: 92, speed: 0.55 },
  sides: [
    { fish: ['rhombus', 'oval'], area: { left: 60, right: 500, top: 690, bottom: 900 } },
    { fish: ['rectangle', 'semicircle'], area: { left: 1172, right: 1612, top: 690, bottom: 900 } },
  ],
  splash: { left: 790, right: 980, y: 588 },
  twinkles: [[884, 118], [1092, 86], [1360, 62], [1598, 142], [1588, 300], [962, 334]],
};

class Game {
  constructor({ stage, ui, audio }) {
    this.stage = stage;
    this.ui = ui;
    this.audio = audio;
    this.popo = new Popo();
    this.winch = new Winch();
    this.net = new Net();
    this.fx = new Effects();
    this.water = new WaterScene(document.getElementById('water'));
    this.titleFx = new Effects();
    this.titleFx.setWaterline(TITLE.waterline);
    this.titleFish = [];
    this.playAnim = { hover: 0, hoverTarget: 0, press: 0, burst: 0, angle: 0, bubbleIn: 0.3 };
    this.titleFade = 0;
    this.titleSplashIn = 0.8;
    this.raftRippleIn = 1;
    this.dialogue = null;
    this.leapers = [];
    this.poof = null;
    this.ambient = [];
    this.hop = null;
    this.waterQuality = 1;
    this.frameAvg = 1 / 60;
    this.slowFor = 0;
    this.surfaceColors = [];
    this.transition = null;
    this.fishArea = null;
    this.hint = null;
    this.hintShown = false;
    this.drag = null;
    this.lastTick = { value: null, at: 0 };
    this.lastFrame = 0;
    this.running = false;
    ui.setScale(stage.scale);
    this.applyLocation();
  }

  // --- lifecycle ------------------------------------------------------------
  // The world renders behind the start screen as soon as the art is ready.
  showIdleScene() {
    if (state.phase === PHASE.TITLE && !this.titleFish.length) {
      const orbit = spawnFish(TITLE.orbit.fish, TITLE.sides[0].area, 0.46);
      orbit.forEach((f, i) => { f.orbit = (i / orbit.length) * Math.PI * 2; });
      const sides = TITLE.sides.flatMap((side) => spawnFish(side.fish, side.area, 0.46).map((f) => Object.assign(f, { zone: side.area })));
      this.titleFish = [...orbit, ...sides];
    }
    if (!this.running) {
      this.running = true;
      this.lastFrame = performance.now();
      requestAnimationFrame((t) => this.loop(t));
    }
  }

  start() {
    this.titleFade = 1;
    this.audio.init();
    this.audio.resume();
    this.audio.startMusic();
    this.reset();
    this.ui.hideStart();
    this.ui.showHud();
    opening(this);
    this.showIdleScene();
  }

  restart() {
    this.reset();
    opening(this);
  }

  playAgain() {
    this.reset();
    startLevels(this);
  }

  // Cancels every sequence and clears the scene back to the first location, ready to play.
  reset() {
    newToken();
    clock.cancelAll();
    this.fx.clearTransient();
    this.audio.stopEffects();
    this.audio.stopVoice();
    this.audio.setTravel(false);
    this.transition = null;
    this.ui.showPause(false);
    this.ui.showComplete(false);
    this.ui.hideHand();
    this.ui.showHandle(false);
    this.ui.setDrop('hidden');
    const muted = state.muted;
    resetProgress();
    state.muted = muted;
    this.audio.resume();
    this.popo = new Popo();
    this.winch = new Winch();
    this.net = new Net();
    this.net.textScale = this.labelScale();
    // until Popo lets it down, the net hangs wound up in a bundle under the boom's pulley
    this.net.visible = true;
    this.net.furl = 1;
    this.winch.setRopeOut(-TUCK);
    this.ambient = [];
    this.leapers = [];
    this.hop = null;
    this.poof = null;
    this.hint = null;
    this.drag = null;
    this.endLine();
    this.ui.setInstruction('');
    this.ui.el.hud.inert = false;
    this.applyLocation();
    this.prepareLevel(0);
  }

  dispose() {
    this.running = false;
    newToken();
    clock.cancelAll();
    this.audio.setTravel(false);
    this.transition = null;
    this.fx.clearTransient();
    this.audio.stopEffects();
    this.audio.stopMusic();
    this.endLine();
    this.ui.hideHand();
    this.ui.showHandle(false);
    state.phase = PHASE.TITLE;
  }

  applyLocation() {
    const loc = LOCATIONS[state.locationIndex];
    this.setWaterline(this.locationWaterline(state.locationIndex));
    this.fx.setLocation(loc.background);
    if (state.locationIndex + 1 < LOCATIONS.length) preloadBackground(LOCATIONS[state.locationIndex + 1].background);
  }

  locationWaterline(index) {
    return LOCATIONS[index].waterline + SCENE_SHIFT;
  }

  setWaterline(y) {
    this.waterline = y;
    this.fx.setWaterline(y);
    const a = raftAnchor(y);
    this.popo.setAnchor(a.x, a.y);
    // where the net's ring hangs at rest, with the raft still
    this.netRest = { x: a.x + this.winch.hang.x, y: a.y + this.winch.hang.y };
    this.area = { left: 40, right: STAGE_W - 40, top: y + SCHOOL_TOP, bottom: STAGE_H - 30 };
  }

  // --- levels -----------------------------------------------------------------
  // Sets up a level's net under the boom and the water its school keeps to. Returns the
  // frame the net had before, so a transition can morph from it.
  prepareLevel(index) {
    state.level = index;
    const level = LEVELS[index];
    const net = this.net;
    const before = net.points.map((p) => ({ ...p }));
    net.setLevel(level, this.waterline - NET_CLEARANCE - this.netRest.y);
    // the corner stays clear of the raft and inside the stage
    const limits = net.limits;
    limits.left = Math.max(limits.left, this.popo.raftEnds().right + 60 - this.netRest.x);
    limits.right = Math.min(limits.right, STAGE_W - 48 - this.netRest.x);
    const span = net.innerSpan();
    const top = this.waterline + SCHOOL_TOP;
    this.fishArea = {
      left: this.netRest.x + span.left + SCHOOL_MARGIN, right: this.netRest.x + span.right - SCHOOL_MARGIN,
      top, bottom: top + (span.bottom - span.top) - 40,
    };
    this.hintShown = false;
    return before;
  }

  spawnSchool() {
    const level = LEVELS[state.level];
    state.fish = spawnSchool(schoolFor(level), this.fishArea, level.rare);
    this.ambient = refreshShadows(this.ambient, 4, this.area);
  }

  // The first school swims in on the narrator's cue (or straight away on Play Again).
  fishIn() {
    if (state.fish.length) return;
    this.spawnSchool();
    this.audio.play('bloop');
  }

  beginPuzzle() {
    const level = LEVELS[state.level];
    state.phase = PHASE.PUZZLE_READY;
    state.idleTime = 0;
    state.misses = 0;
    this.net.locked = false;
    this.lastTick = { value: this.net.liveValue(), at: 0 };
    this.popo.idle();
    this.ui.showHandle(true);
    this.ui.setDrop('on');
    this.wasRight = false;
    this.ui.setInstruction(level.prompt);
    this.speak(level.prompt);
  }

  // Reads a line aloud (when it has a recording) for children who can't read it yet. Returns
  // the recording's length in seconds, so text changes can wait for it.
  speak(text) {
    return this.dialogue ? 0 : this.audio.speak('narrator', text);
  }

  // How far the ring must drop for the net's bottom edge (its higher corner, on a tilted net)
  // to pass under the whole school.
  catchDepth() {
    return this.fishArea.bottom + 14 - (this.netRest.y + this.net.innerSpan().bottom);
  }

  // The net breaking the surface: splashes under its bottom corners and in the middle.
  netSplash() {
    const [, , c, d] = this.net.points.map((p) => this.net.toStage(p));
    for (const x of [d.x + 20, (c.x + d.x) / 2, c.x - 20]) this.fx.splash(x, this.waterline, false);
    this.fx.ripple((c.x + d.x) / 2, this.waterline + 4, 1.4);
    this.audio.play('splashSmall');
  }

  // Fish just under the descending frame slow down and keep under it.
  herdFish() {
    const bottom = this.net.ring().y + this.net.bottom();
    const centerX = this.net.ring().x;
    for (const f of state.fish) {
      if (f.gone || f.caught) continue;
      if (f.y - bottom < 110 && f.y - bottom > -40) f.herd(centerX);
    }
  }

  announceComplete() {
    const detail = { levels: LEVELS.length, fish: state.caught };
    window.dispatchEvent(new CustomEvent('popo:complete', { detail }));
    if (window.parent !== window) window.parent.postMessage({ type: 'popo:complete', ...detail }, '*');
  }

  // --- input ----------------------------------------------------------------
  onDragStart(point) {
    if (state.paused || state.phase !== PHASE.PUZZLE_READY || this.net.settling) return;
    state.phase = PHASE.DRAGGING;
    this.stopHint();
    const handle = this.net.points[this.net.movable];
    const local = this.net.toNet(point);
    // the corner keeps its offset from the pointer, so it never jumps under the finger
    this.drag = { dx: handle.x - local.x, dy: handle.y - local.y };
    this.audio.play('grab');
  }

  onDragMove(point) {
    if (state.phase !== PHASE.DRAGGING) return;
    const local = this.net.toNet(point);
    this.net.moveHandle({ x: local.x + this.drag.dx, y: local.y + this.drag.dy });
    this.tickMeasure();
  }

  // A soft tick as the shown measurement changes, throttled so a fast drag doesn't rattle.
  tickMeasure() {
    const value = this.net.liveValue();
    const now = performance.now();
    if (value === this.lastTick.value) return;
    this.lastTick.value = value;
    if (now - this.lastTick.at < TICK_GAP) return;
    this.lastTick.at = now;
    this.audio.play('tick');
  }

  // Let go near its place, the corner settles onto it; the child still presses Drop Net.
  onDragEnd() {
    if (state.phase !== PHASE.DRAGGING) return;
    this.drag = null;
    state.phase = PHASE.PUZZLE_READY;
    state.idleTime = 0;
    if (this.net.withinReach) settleCorner(this);
  }

  onNudge(dx, dy) {
    if (state.paused || state.phase !== PHASE.PUZZLE_READY || this.net.settling) return;
    this.stopHint();
    state.idleTime = 0;
    const p = this.net.points[this.net.movable];
    this.net.moveHandle({ x: p.x + dx, y: p.y + dy });
    this.tickMeasure();
  }

  // Drop Net, right or wrong: a wrong net goes down all the same (see dropNet).
  onDrop() {
    if (state.paused || state.phase !== PHASE.PUZZLE_READY || this.net.settling) return;
    this.stopHint();
    this.audio.play('ui');
    dropNet(this);
  }

  // Tapping the water is just for fun: bubbles, a soft bloop, and curious fish come to look.
  onWaterTap(point) {
    if (state.phase === PHASE.TITLE) {
      this.onTitleTap(point);
      return;
    }
    if (state.paused || state.phase === PHASE.GAME_COMPLETE || point.y < this.waterline) return;
    this.fx.puff(point.x, point.y, 0, 5, true);
    if (point.y < this.waterline + 40) this.fx.ripple(point.x, this.waterline, 0.6);
    this.audio.play('bloop');
    for (const f of state.fish) {
      if (f.gone || f.offstage) continue;
      if (Math.hypot(f.x - point.x, f.y - point.y) < 300) f.lookAt(point);
    }
    this.fishReacts(point);
  }

  puffFrom(fish, count, big = false) {
    this.fx.puff(fish.x + fish.dir * fish.w * 0.42 * fish.scale, fish.y + fish.h * 0.1 * fish.scale, fish.dir, count, big);
  }

  // The fish nearest a tap does something silly: a somersault and a giggle, a burst of
  // bubbles, or a quick dart away. Never the same trick twice running, and not too often.
  fishReacts(point) {
    const now = performance.now();
    let near = null;
    let best = 230;
    for (const f of [...state.fish, ...this.ambient]) {
      if (f.gone || f.offstage || f.frozen || f.entering || !f.flip) continue;
      const d = Math.hypot(f.x - point.x, f.y - point.y);
      if (d < best && (f.reactedAt || 0) < now - 1200) { best = d; near = f; }
    }
    if (!near) return;
    near.reactedAt = now;
    const tricks = ['flip', 'bubbles', 'dart'].filter((t) => t !== this.lastTrick);
    const trick = tricks[Math.floor(Math.random() * tricks.length)];
    this.lastTrick = trick;
    if (trick === 'flip') {
      near.flip();
      this.audio.play('giggle');
    } else if (trick === 'bubbles') {
      near.wiggle();
      this.puffFrom(near, 8, true);
      this.audio.play('bubbles');
    } else {
      near.startle(point);
      this.audio.play('puff');
    }
  }

  onTitleTap(point) {
    if (point.y < TITLE.waterline) {
      this.titleFx.sparkle(point.x, point.y, 8);
      return;
    }
    this.titleFx.puff(point.x, point.y, 0, 5, true);
    for (const f of this.titleFish) {
      if (Math.hypot(f.x - point.x, f.y - point.y) < 320) { f.wiggle(); f.puffs += 2; }
    }
  }

  onPlayHover(on) {
    if (state.phase !== PHASE.TITLE) return;
    this.playAnim.hoverTarget = on ? 1 : 0;
    if (on) this.audio.play('bloop');
  }

  onPlayPress() {
    if (state.phase !== PHASE.TITLE) return;
    this.playAnim.press = 1;
  }

  // Play: the button pops, bubbles and sparkles burst out, the fish scatter, the game begins.
  pressPlay() {
    if (state.phase !== PHASE.TITLE || !assets.title) return;
    const { x, y, r } = TITLE.play;
    this.audio.init();
    this.audio.resume();
    this.playAnim.burst = 0.001;
    this.playAnim.press = 1;
    for (let i = 0; i < 10; i += 1) {
      const a = (i / 10) * Math.PI * 2;
      this.titleFx.puff(x + Math.cos(a) * r, y + Math.sin(a) * r * 0.8, Math.cos(a), 2, true);
    }
    this.titleFx.sparkle(x, y - r * 0.4, 14);
    for (const f of this.titleFish) {
      if (f.zone) f.startle({ x, y });
      else f.wiggle();
    }
    this.audio.play('splashSmall');
    this.audio.play('cheer');
    this.start();
  }

  togglePause() {
    if (state.phase === PHASE.TITLE || state.phase === PHASE.GAME_COMPLETE) return;
    state.paused = !state.paused;
    if (state.paused && state.phase === PHASE.DRAGGING) {
      this.drag = null;
      state.phase = PHASE.PUZZLE_READY;
    }
    this.ui.showPause(state.paused);
    this.ui.el.hud.inert = state.paused; // nothing behind the pause card can be pressed
    this.ui.el.hits.inert = state.paused;
    if (!state.paused) this.ui.el.pause.focus({ preventScroll: true });
    if (state.paused) this.audio.suspend();
    else this.audio.resume();
    if (!state.paused) this.lastFrame = performance.now();
  }

  toggleSound() {
    state.muted = !state.muted;
    this.audio.setMuted(state.muted);
    this.ui.setSound(state.muted);
    try { localStorage.setItem('popo-muted', state.muted ? '1' : '0'); } catch (e) { /* storage may be unavailable */ }
  }

  resize() {
    this.stage.resize();
    this.ui.setScale(this.stage.scale);
    this.net.textScale = this.labelScale();
    // keep the bubble, the corner and the hint on their marks even while paused
    if (this.dialogue && this.dialogue.who !== 'narrator') this.placeSpeech();
    this.placeHandle();
    this.ui.showRotateHint(this.stage.portrait);
    this.syncWaterCanvas();
  }

  // The net's labels are drawn in stage pixels; on a small screen the stage shrinks, so they
  // grow to stay about 14 CSS pixels or more.
  labelScale() {
    return Math.max(1, 0.64 / this.stage.scale);
  }

  // The painting is STAGE_W pixels wide, so the water pass never renders more pixels than
  // that; on big or Retina screens the browser scales it up. waterQuality drops on slow devices.
  syncWaterCanvas() {
    const c = this.stage.canvas;
    const k = Math.min(1, STAGE_W / c.width) * this.waterQuality;
    this.water.resize(Math.round(c.width * k), Math.round(c.height * k), c.style.width, c.style.height);
  }

  watchFrameRate(dt) {
    this.frameAvg = this.frameAvg * 0.97 + dt * 0.03;
    this.slowFor = this.frameAvg > 0.026 ? this.slowFor + dt : 0;
    if (this.slowFor > 2 && this.waterQuality > 0.6) {
      this.waterQuality = 0.6;
      this.slowFor = 0;
    }
  }

  // --- hints ------------------------------------------------------------------
  // Left alone for a while: on the first net the hand shows the drag once, along the way to
  // where the corner belongs; later nets swell their measurements instead, so the child
  // reasons rather than copies. Once the frame is right, the hand taps on Drop Net. Any touch
  // cancels a hint.
  updateHint(dt) {
    if (state.phase !== PHASE.PUZZLE_READY) return;
    if (this.hint) {
      if (this.hint.drag) this.advanceHand(dt);
      else if ((this.hint.t += dt) > 2.4) { this.stopHint(); state.idleTime = 0; }
      return;
    }
    state.idleTime += dt;
    const ready = this.net.check().ok;
    const delay = this.hintShown ? HINT_REPEAT : ready ? 4 : LEVELS[state.level].hintDelay;
    if (state.idleTime > delay) this.showHint(ready);
  }

  showHint(ready) {
    const drag = !ready && state.level === 0;
    this.hint = { t: 0, drag };
    this.ui.pulseInstruction();
    this.audio.play('hint');
    if (ready) {
      const d = this.ui.dropPoint();
      this.ui.moveHand(d.x - 8, d.y - 6);
      this.ui.showHand(false);
    } else if (drag) {
      this.ui.showHand(true);
    } else {
      this.net.hintPulse = 2.4;
    }
    if (!ready && !this.hintShown) this.speak(LEVELS[state.level].prompt);
    this.hintShown = true;
  }

  advanceHand(dt) {
    const h = this.hint;
    h.t += dt;
    const from = this.net.handle();
    const to = this.net.toStage(this.net.target);
    const k = ease.inOut(Math.min(1, Math.max(0, (h.t - 0.5) / 1.2)));
    this.ui.moveHand(from.x + (to.x - from.x) * k + 6, from.y + (to.y - from.y) * k + 6);
    if (h.t > 2.1) this.ui.fadeHand();
    if (h.t > 2.4) {
      this.stopHint();
      state.idleTime = 0;
    }
  }

  stopHint() {
    if (!this.hint) return;
    this.hint = null;
    this.net.hintPulse = 0;
    this.ui.hideHand();
  }

  placeHandle() {
    const h = this.net.handle();
    this.ui.placeHandle(h.x, h.y);
  }

  // --- travel -----------------------------------------------------------------
  async prepareTransition(nextIndex, token) {
    await preloadBackground(LOCATIONS[nextIndex].background);
    if (isCurrent(token)) this.transition = { from: state.locationIndex, to: nextIndex, k: 0 };
  }

  finishTransition(nextIndex) {
    this.transition = null;
    state.locationIndex = nextIndex;
    this.applyLocation();
  }

  // --- loop -------------------------------------------------------------------
  loop(now) {
    if (!this.running) return;
    const dt = Math.min(0.1, Math.max(0, (now - this.lastFrame) / 1000));
    this.lastFrame = now;
    try {
      if (!state.paused && !document.hidden) this.update(dt);
      this.draw();
    } finally {
      requestAnimationFrame((t) => this.loop(t));
    }
  }

  // Shows one story line word by word, with comic pauses after punctuation and a boing on
  // *stressed* words. A line's cue fires when its word appears (or when a tap skips ahead).
  // Resolves once the line has been on screen long enough to read.
  say(line, token) {
    return new Promise((resolve, reject) => {
      if (this.dialogue) this.endLine();
      const words = line.text.split(' ').map((raw) => ({ text: raw.replace(/\*/g, ''), em: raw.includes('*') }));
      const narrator = line.who === 'narrator';
      this.dialogue = {
        words, who: line.who, cue: line.cue, cueDone: false, token, resolve, reject, settled: false,
        next: 0, wait: 0, held: 0,
        pace: narrator ? 0.21 : 0.17,
        hold: (narrator ? 1000 : 700) + line.text.length * (narrator ? 26 : 22),
      };
      this.ui.showLine(line.who, words);
      this.placeSpeech();
      const voiced = this.audio.speak(line.who, line.text);
      if (voiced) this.paceToVoice(this.dialogue, voiced);
      else if (narrator) this.audio.play('narrate');
    });
  }

  // Spreads the words over the recording by length, with a beat after punctuation, so each
  // word appears as it's spoken. The bubble stays up a moment after the voice finishes.
  paceToVoice(d, seconds) {
    const weight = (w) => Math.max(2, w.text.replace(/[^a-z0-9']/gi, '').length)
      + (w.text.endsWith('…') ? 5 : /[.!?]$/.test(w.text) ? 3 : w.text.endsWith(',') ? 2 : 0);
    const total = d.words.reduce((sum, w) => sum + weight(w), 0);
    let at = 0;
    d.times = d.words.map((w) => {
      const t = (at / total) * seconds * 0.88;
      at += weight(w);
      return t;
    });
    d.elapsed = 0;
    d.voiced = true;
    // after the voice ends, the line stays long enough for a young reader to finish it
    d.hold = (seconds - d.times[d.times.length - 1]) * 1000 + Math.max(1200, d.words.length * 170);
  }

  placeSpeech() {
    const head = this.popo.headTop();
    this.ui.placeSpeech(head.x + 36, head.y + 16);
  }

  endLine(cancelled = true) {
    const dialogue = this.dialogue;
    this.dialogue = null;
    this.ui.hideLines();
    if (dialogue && dialogue.voiced && cancelled) this.audio.stopVoice();
    if (dialogue) {
      if (cancelled) dialogue.reject(new Cancelled());
      else dialogue.resolve();
    }
  }

  revealWord(d, quiet) {
    const i = d.next;
    const word = d.words[i];
    this.ui.revealWord(i, word.em);
    const cued = d.cue && !d.cueDone && d.cue.word <= i;
    if (!quiet && !cued) {
      try { this.audio.play(word.em ? 'boing' : d.who === 'popo' ? 'talk' : 'word'); }
      catch (e) { /* Optional audio must not stall dialogue. */ }
    }
    if (cued) {
      d.cueDone = true;
      this.storyCue(d.cue.do);
    }
    d.next += 1;
    const last = word.text.slice(-1);
    d.wait += d.pace + (word.text.endsWith('…') ? 0.45 : '.!?'.includes(last) ? 0.3 : last === ',' ? 0.15 : 0) + (word.em ? 0.08 : 0);
  }

  skipDialogue() {
    const d = this.dialogue;
    if (!d || d.settled) return false;
    if (d.next < d.words.length) {
      while (d.next < d.words.length) this.revealWord(d, true);
    } else if (d.held >= 600) {
      d.held = d.hold;
    }
    return true;
  }

  updateDialogue(dt) {
    const d = this.dialogue;
    if (!d) return;
    if (!isCurrent(d.token)) {
      this.endLine();
      return;
    }
    if (d.next < d.words.length) {
      if (d.voiced) {
        d.elapsed += dt;
        while (d.next < d.words.length && d.elapsed >= d.times[d.next]) this.revealWord(d, true);
      } else {
        d.wait -= dt;
        while (d.wait <= 0 && d.next < d.words.length) this.revealWord(d, false);
      }
    } else {
      d.held += dt * 1000;
      if (d.held >= d.hold) {
        this.endLine(false);
        return;
      }
    }
    if (d.who !== 'narrator') this.placeSpeech();
  }

  // Moments in the scene that a story line can trigger on one of its words.
  storyCue(name) {
    if (name === 'hop') {
      this.hop = { t: 0 };
      this.audio.play('boing');
    } else if (name === 'fishIn') {
      this.fishIn();
    }
  }

  updateStoryFx(dt) {
    if (!this.hop) return;
    // a happy hop: up out of the water, then a splash down
    this.hop.t += dt;
    const k = this.hop.t / 0.5;
    if (k < 1) {
      this.popo.dip = -18 * Math.sin(Math.PI * k);
    } else {
      this.popo.dip = 0;
      this.hop = null;
      const raft = this.popo.raftEnds();
      this.fx.splash((raft.left + raft.right) / 2, this.waterline, false);
      this.fx.ripple(raft.right, this.waterline + 4, 0.8);
      this.audio.play('splashSmall');
    }
  }

  // A cartoon cloud: soft white puffs burst outward and fade, hiding a quick costume change.
  drawPoof(ctx) {
    const p = this.poof;
    if (!p) return;
    const k = Math.min(1, p.t / 0.6);
    const grow = 1 - (1 - k) ** 3;
    ctx.save();
    ctx.globalAlpha = k < 0.35 ? 1 : 1 - (k - 0.35) / 0.65;
    const puffs = [];
    for (let i = 0; i < 11; i += 1) {
      const a = (i / 11) * Math.PI * 2 + 0.3;
      const d = 30 + grow * (i % 2 ? 84 : 62);
      const r = (i % 3 === 0 ? 44 : 34) * (0.75 + grow * 0.45);
      puffs.push([p.x + Math.cos(a) * d * 1.15, p.y + Math.sin(a) * d * 0.75, r]);
    }
    puffs.push([p.x, p.y, 46 * (1 - grow * 0.6)]);
    // outline first, then shade, then the white faces, so the puffs merge into one cloud
    ctx.fillStyle = '#9fc4e4';
    for (const [x, y, r] of puffs) { ctx.beginPath(); ctx.arc(x, y, r + 3, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = '#d6eaf8';
    for (const [x, y, r] of puffs) { ctx.beginPath(); ctx.arc(x + 3, y + 5, r, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = '#ffffff';
    for (const [x, y, r] of puffs) { ctx.beginPath(); ctx.arc(x - 2, y - 3, r * 0.92, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
  }

  // The raft sits on the animated surface: it rises, falls and tilts with the waves under its
  // two ends, and sends out a small ripple now and then.
  rideWaves(dt) {
    const popo = this.popo;
    const ends = popo.raftEnds();
    const shift = popo.travelShift + popo.lean;
    const left = ends.left + shift;
    const right = ends.right + shift;
    if (this.water.ok) {
      const amp = this.fx.reduced ? 0.35 : 1;
      const t = this.fx.t;
      const yl = -surfaceWave(left, t) * amp;
      const yr = -surfaceWave(right, t) * amp;
      const yc = -surfaceWave((left + right) / 2, t) * amp;
      popo.waveY = (yl + yr + 2 * yc) / 4;
      popo.waveAngle = Math.atan2(yr - yl, right - left) * 0.85;
    } else {
      popo.waveY = Math.sin(popo.bobT * 1.65) * 2.4 * (this.fx.reduced ? 0.2 : 1);
      popo.waveAngle = 0;
    }
    this.raftRippleIn -= dt;
    if (this.raftRippleIn <= 0 && state.phase !== PHASE.TITLE) {
      this.raftRippleIn = 1.4 + Math.random() * 1.4;
      this.fx.ripple(Math.random() < 0.5 ? left + 8 : right - 8, this.waterline + 4, 0.55);
    }
  }

  // Average colour of the painted water just below the surface, for the water over the raft.
  surfaceColor() {
    const index = LOCATIONS[state.locationIndex].background;
    if (this.surfaceColors[index]) return this.surfaceColors[index];
    const img = assets.backgrounds[index];
    if (!img) return null;
    let colour = [40, 170, 240];
    try {
      const c = document.createElement('canvas');
      c.width = 400;
      c.height = 16;
      const cx = c.getContext('2d');
      cx.drawImage(img, 500, this.waterline - SCENE_SHIFT + 8, 800, 32, 0, 0, 400, 16);
      const d = cx.getImageData(0, 0, 400, 16).data;
      const sum = [0, 0, 0];
      for (let i = 0; i < d.length; i += 4) { sum[0] += d[i]; sum[1] += d[i + 1]; sum[2] += d[i + 2]; }
      colour = sum.map((v) => Math.round(v / (d.length / 4)));
    } catch (e) { /* a tainted canvas keeps the default colour */ }
    this.surfaceColors[index] = colour;
    return colour;
  }

  // Water lapping over the bottom of the raft, following the same waves, so the raft sits in
  // the water rather than on top of it. Fades out at both ends into the painted surface.
  drawRaftWater(ctx) {
    const colour = this.surfaceColor();
    if (!colour) return;
    const popo = this.popo;
    const ends = popo.raftEnds();
    const shift = popo.travelShift + popo.lean;
    const x0 = Math.floor(ends.left + shift - 34);
    const x1 = Math.ceil(ends.right + shift + 34);
    const top = Math.floor(this.waterline - 16);
    const w = x1 - x0;
    const h = 60;
    const c = this.raftWaterCanvas || (this.raftWaterCanvas = document.createElement('canvas'));
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    const g = c.getContext('2d');
    g.clearRect(0, 0, w, h);
    const t = this.fx.t;
    const amp = this.water.ok ? (this.fx.reduced ? 0.35 : 1) : 0;
    const lap = this.fx.reduced ? 0.4 : 1.6;
    const edge = (x) => this.waterline - surfaceWave(x, t) * amp + lap * Math.sin(x * 0.08 + t * 2.6) - top;
    g.beginPath();
    g.moveTo(0, h);
    for (let x = 0; x <= w; x += 5) g.lineTo(x, edge(x0 + x));
    g.lineTo(w, h);
    g.closePath();
    const [r, gr, b] = colour;
    const fill = g.createLinearGradient(0, 10, 0, h);
    fill.addColorStop(0, `rgba(${r}, ${gr}, ${b}, 0.88)`);
    fill.addColorStop(0.45, `rgba(${r}, ${gr}, ${b}, 0.62)`);
    fill.addColorStop(1, `rgba(${r}, ${gr}, ${b}, 0)`);
    g.fillStyle = fill;
    g.fill();
    g.beginPath();
    for (let x = 0; x <= w; x += 5) {
      const y = edge(x0 + x);
      if (x === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.lineCap = 'round';
    g.strokeStyle = 'rgba(255, 255, 255, 0.16)';
    g.lineWidth = 7;
    g.stroke();
    g.strokeStyle = 'rgba(255, 255, 255, 0.72)';
    g.lineWidth = 2.2;
    g.stroke();
    g.globalCompositeOperation = 'destination-in';
    const fade = g.createLinearGradient(0, 0, w, 0);
    fade.addColorStop(0, 'rgba(0, 0, 0, 0)');
    fade.addColorStop(0.13, 'rgba(0, 0, 0, 1)');
    fade.addColorStop(0.87, 'rgba(0, 0, 0, 1)');
    fade.addColorStop(1, 'rgba(0, 0, 0, 0)');
    g.fillStyle = fade;
    g.fillRect(0, 0, w, h);
    g.globalCompositeOperation = 'source-over';
    ctx.drawImage(c, x0, top);
  }

  // Fish, bubbles and splashes for the title banner. Also runs while it fades out after Play.
  updateTitle(dt) {
    this.titleFx.update(dt);
    const pa = this.playAnim;
    const { x: px, y: py } = TITLE.play;
    pa.hover += (pa.hoverTarget - pa.hover) * Math.min(1, dt * 10);
    pa.press = Math.max(0, pa.press - dt * 4);
    if (pa.burst > 0) pa.burst += dt;
    pa.bubbleIn -= dt;
    if (pa.bubbleIn <= 0) {
      pa.bubbleIn = 0.28 + Math.random() * 0.3;
      this.titleFx.puff(px + (Math.random() - 0.5) * 150, py + 70, 0, 1);
    }
    pa.angle += dt * TITLE.orbit.speed * (1 + pa.burst * 4);
    const sideFish = this.titleFish.filter((f) => f.zone);
    for (const f of this.titleFish) {
      if (f.zone) {
        f.update(dt, f.zone, sideFish);
      } else {
        // a 3D orbit: the far side runs behind the button, smaller and dimmer, and each fish
        // turns edge-on at the sides instead of flipping
        const a = pa.angle + f.orbit;
        const spread = 1 + pa.burst * 2.4;
        f.x = px + Math.cos(a) * TITLE.orbit.rx * spread;
        f.y = py + Math.sin(a) * TITLE.orbit.ry * spread + Math.sin(a * 2 + f.orbit) * 8;
        const facing = -Math.sin(a);
        f.dir = Math.sign(facing || 1) * Math.max(0.12, Math.abs(facing));
        f.scale = 0.82 + 0.26 * (Math.sin(a) + 1) / 2;
        f.depth = Math.sin(a);
        f.bobPhase += dt * 2.2;
        f.breath -= dt;
        if (f.wiggleT >= 0) { f.wiggleT += dt; if (f.wiggleT > 0.45) f.wiggleT = -1; }
      }
      if (f.breath <= 0) {
        f.breath = 1.4 + Math.random() * 2.4;
        f.puffs += 1 + Math.floor(Math.random() * 3);
      }
      if (f.puffs > 0) {
        this.titleFx.puff(f.x + Math.sign(f.dir) * f.w * 0.42 * f.scale, f.y + f.h * 0.1, Math.sign(f.dir), f.puffs);
        f.puffs = 0;
      }
    }
    this.titleSplashIn -= dt;
    if (this.titleSplashIn <= 0) {
      this.titleSplashIn = 0.9 + Math.random() * 1.1;
      const s = TITLE.splash;
      this.titleFx.splash(s.left + Math.random() * (s.right - s.left), s.y, false);
    }
    if (state.phase !== PHASE.TITLE) this.titleFade = Math.max(0, this.titleFade - dt / 0.7);
  }

  update(dt) {
    if (state.phase === PHASE.TITLE || this.titleFade > 0) this.updateTitle(dt);
    clock.update(dt);
    this.popo.update(dt);
    this.fx.update(dt);
    this.popo.waterResponse = this.fx.raftResponse(this.popo.anchor.x);
    this.rideWaves(dt);
    if (this.poof && (this.poof.t += dt) > 0.6) this.poof = null;
    this.updateDialogue(dt);
    this.updateStoryFx(dt);
    this.watchFrameRate(dt);

    // the net hangs from the boom, so it rides the waves with the raft; Popo's wheel follows
    // the drum
    const { popo, winch, net } = this;
    net.origin = popo.transformPoint(winch.hang.x, winch.hang.y);
    net.drop = winch.ropeOut;
    net.ropePhase = winch.ropeOut;
    popo.setMachine(winch);
    // hanging on its sling, the net sways a touch while it waits (easing into it, never with a
    // jump); it holds still for a drag
    const idle = state.phase === PHASE.PUZZLE_READY || state.phase === PHASE.CORRECT;
    if (idle && !this.fx.reduced) net.swing += (Math.sin(this.fx.t * 0.9) * 0.008 - net.swing) * Math.min(1, dt * 2);
    else if (state.phase === PHASE.DRAGGING) net.swing *= Math.max(0, 1 - dt * 6);
    net.update(dt);
    // Drop Net glows, with a chime, while the frame is right
    if (state.phase === PHASE.PUZZLE_READY || state.phase === PHASE.DRAGGING) {
      const right = net.check().ok;
      if (right && !this.wasRight) this.audio.play('ready');
      this.wasRight = right;
      this.ui.setDrop(right ? 'ready' : 'on');
    }

    for (const f of state.fish) {
      if (f.gone) continue;
      if (f.caught) {
        // netted fish hang in the mesh, swaying a touch with the net
        const p = net.toStage(f.caught);
        f.x = p.x;
        f.y = p.y;
        f.update(dt, this.fishArea, state.fish);
        continue;
      }
      f.update(dt, this.fishArea, state.fish);
      if (f.offstage) continue;
      if (f.breath <= 0 && !f.frozen) {
        f.breath = 1.6 + Math.random() * 2.6;
        f.puffs += 1 + Math.floor(Math.random() * 3);
      }
      if (f.puffs > 0) {
        this.puffFrom(f, f.puffs);
        f.puffs = 0;
      }
      if (f.trail > 0 && Math.random() < dt * 14) {
        this.fx.puff(f.x - f.dir * f.w * 0.45, f.y + (Math.random() - 0.5) * f.h * 0.3, -f.dir * 0.4, 1);
      }
      // the prize fish leave a glint now and then
      if (f.rare && Math.random() < dt * 0.6) this.fx.sparkle(f.x - f.dir * f.w * 0.3, f.y + (Math.random() - 0.5) * f.h * 0.5, 1);
    }
    if (this.ambient.some((f) => f.gone)) this.ambient = this.ambient.filter((f) => !f.gone);
    for (const f of this.ambient) f.update(dt, this.area);
    if (state.phase === PHASE.PUZZLE_READY || state.phase === PHASE.DRAGGING) this.placeHandle();
    this.updateHint(dt);
  }

  // The painting goes through the per-pixel water pass (src/water.js); without WebGL it is
  // drawn plainly. Returns the ambient drift the underwater effects follow during a row.
  drawBackground(ctx) {
    const index = LOCATIONS[state.locationIndex].background;
    const current = assets.backgrounds[index];
    if (!current) { preloadBackground(index); return 0; }
    const k = this.transition ? this.transition.k : 0;
    const next = this.transition ? assets.backgrounds[LOCATIONS[this.transition.to].background] : null;
    if (this.water.ok) {
      this.syncWaterCanvas();
      const drawn = this.water.render({
        from: current, to: next, mix: k, time: this.fx.t, waterline: this.waterline, shift: SCENE_SHIFT,
        plants: this.fx.plantsFor(index), amplitude: this.fx.reduced ? 0.35 : 1,
      });
      if (drawn) {
        this.water.show(true);
        return -Math.sin(k * Math.PI) * 18;
      }
    }
    this.water.show(false);
    this.drawPaintingPlain(ctx, current, next, k);
    return 0;
  }

  // Fallback for browsers without WebGL: the painting drawn plainly below a band of sky;
  // during a row the two paintings slide with depth parallax and a feathered seam.
  drawPaintingPlain(ctx, current, next, k) {
    const sky = ctx.createLinearGradient(0, 0, 0, SCENE_SHIFT);
    sky.addColorStop(0, '#1e78d8');
    sky.addColorStop(1, '#3a95ea');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, STAGE_W, SCENE_SHIFT + 1);
    ctx.save();
    ctx.translate(0, SCENE_SHIFT);
    if (next) this.drawParallaxPlain(ctx, current, next, k);
    else ctx.drawImage(current, 0, 0, STAGE_W, STAGE_H);
    ctx.restore();
  }

  featheredCopy(img) {
    if (this.featheredSource === img) return this.feathered;
    const c = document.createElement('canvas');
    c.width = STAGE_W;
    c.height = STAGE_H;
    const cx = c.getContext('2d');
    cx.drawImage(img, 0, 0, STAGE_W, STAGE_H);
    const mask = cx.createLinearGradient(0, 0, PAN_OVERLAP, 0);
    mask.addColorStop(0, 'rgba(0, 0, 0, 0)');
    mask.addColorStop(1, 'rgba(0, 0, 0, 1)');
    cx.globalCompositeOperation = 'destination-in';
    cx.fillStyle = mask;
    cx.fillRect(0, 0, PAN_OVERLAP, STAGE_H);
    cx.fillStyle = '#000';
    cx.fillRect(PAN_OVERLAP, 0, STAGE_W - PAN_OVERLAP, STAGE_H);
    this.feathered = c;
    this.featheredSource = img;
    return c;
  }

  drawParallaxPlain(ctx, current, next, k) {
    const pan = STAGE_W - PAN_OVERLAP;
    const ox = -k * pan;
    ctx.drawImage(current, ox, 0, STAGE_W, STAGE_H);
    ctx.save();
    ctx.translate(ox + STAGE_W * 2, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(current, 0, 0, STAGE_W, STAGE_H);
    ctx.restore();
    const smooth = (a, b, x) => { const v = Math.min(1, Math.max(0, (x - a) / (b - a))); return v * v * (3 - 2 * v); };
    ctx.globalAlpha = smooth(0, 0.07, k);
    ctx.drawImage(this.featheredCopy(next), ox + pan, 0, STAGE_W, STAGE_H);
    ctx.globalAlpha = smooth(0.93, 1, k);
    if (ctx.globalAlpha > 0) ctx.drawImage(next, 0, 0, STAGE_W, STAGE_H);
    ctx.globalAlpha = 1;
  }

  // The play button floats in the water: a gentle bob and sway, a breathing warm glow behind
  // it, an occasional shine across its face, a grow on hover and a squash when pressed.
  drawPlayButton(ctx, alpha) {
    const img = assets.play;
    if (!img) return;
    const pa = this.playAnim;
    const t = this.titleFx.t;
    const { x, y, r } = TITLE.play;
    const still = this.fx.reduced;
    const bob = still ? 0 : Math.sin(t * 1.6) * 7;
    const sway = still ? 0 : Math.sin(t * 1.1) * 0.035;
    const breathe = still ? 1 : 1 + Math.sin(t * 2.4) * 0.025;
    const squash = 1 - pa.press * 0.12;
    const pop = pa.burst > 0 ? 1 + Math.sin(Math.min(1, pa.burst / 0.35) * Math.PI) * 0.18 : 1;
    const s = breathe * (1 + pa.hover * 0.07) * pop;
    const cy = y + bob;
    this.ui.placePlay(x, cy, r * s);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.globalCompositeOperation = 'screen';
    const glow = ctx.createRadialGradient(x, cy, r * 0.6, x, cy, r * 1.9);
    glow.addColorStop(0, `rgba(255, 210, 110, ${0.42 + 0.16 * Math.sin(t * 2.4) + pa.hover * 0.15})`);
    glow.addColorStop(1, 'rgba(255, 210, 110, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(x - r * 2, cy - r * 2, r * 4, r * 4);
    ctx.globalCompositeOperation = 'source-over';
    ctx.translate(x, cy);
    ctx.rotate(sway);
    ctx.scale(s * (1 + pa.press * 0.06), s * squash);
    const w = img.width * (r * 2 / img.height);
    ctx.drawImage(img, -w / 2, -r, w, r * 2);
    // shine: a soft diagonal band sweeping across the disc every few seconds
    const sweep = (t % 3.4) / 1.1;
    if (sweep < 1 && !still) {
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.93, 0, Math.PI * 2);
      ctx.clip();
      const sx = -r * 1.6 + sweep * r * 3.2;
      const band = ctx.createLinearGradient(sx - r * 0.35, -r, sx + r * 0.35, r);
      band.addColorStop(0, 'rgba(255, 255, 255, 0)');
      band.addColorStop(0.5, 'rgba(255, 255, 255, 0.38)');
      band.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = band;
      ctx.fillRect(-r, -r, r * 2, r * 2);
    }
    ctx.restore();
  }

  drawTitle(ctx, alpha) {
    const t = this.fx.t;
    if (alpha >= 1) {
      // the banner runs through the water pass, with the surface band kept still because the
      // raft and the leaping fish sit on it; without WebGL it is drawn plainly
      this.syncWaterCanvas();
      const drawn = this.water.ok && this.water.render({
        from: assets.title, to: null, mix: 0, time: this.titleFx.t, waterline: TITLE.waterline,
        plants: [], amplitude: this.fx.reduced ? 0.35 : 1, surface: 0, seabed: TITLE.seabed,
      });
      this.water.show(Boolean(drawn));
      if (!drawn) ctx.drawImage(assets.title, 0, 0, STAGE_W, STAGE_H);
    } else {
      ctx.globalAlpha = alpha;
      ctx.drawImage(assets.title, 0, 0, STAGE_W, STAGE_H);
      ctx.globalAlpha = 1;
    }
    ctx.save();
    ctx.globalAlpha = alpha;
    this.titleFx.drawWater(ctx, 0, this.titleFish);
    ctx.restore();
    const behind = this.titleFish.filter((f) => f.zone || f.depth < 0);
    const inFront = this.titleFish.filter((f) => !f.zone && f.depth >= 0);
    for (const f of behind) {
      f.alpha = alpha * (f.zone ? 1 : 0.72 + 0.28 * (1 + f.depth));
      f.draw(ctx);
    }
    this.drawPlayButton(ctx, alpha);
    for (const f of inFront) {
      f.alpha = alpha;
      f.draw(ctx);
    }
    ctx.save();
    ctx.globalAlpha = alpha;
    this.titleFx.drawFront(ctx);
    // a warm, breathing sun glow in the corner and twinkles on the logo's snowy rim
    ctx.globalCompositeOperation = 'screen';
    const sun = ctx.createRadialGradient(1650, 18, 10, 1650, 18, 300);
    sun.addColorStop(0, `rgba(255, 250, 220, ${(0.32 + Math.sin(t * 0.9) * 0.08) * alpha})`);
    sun.addColorStop(1, 'rgba(255, 250, 220, 0)');
    ctx.fillStyle = sun;
    ctx.fillRect(1350, 0, STAGE_W - 1350, 320);
    ctx.globalCompositeOperation = 'source-over';
    TITLE.twinkles.forEach(([x, y], i) => {
      const k = Math.max(0, Math.sin(t * 1.3 + i * 1.7)) ** 4;
      if (k < 0.02) return;
      const r = 4 + k * 9;
      ctx.fillStyle = `rgba(255, 255, 255, ${k * alpha})`;
      ctx.beginPath();
      ctx.moveTo(x, y - r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.quadraticCurveTo(x, y, x, y + r);
      ctx.quadraticCurveTo(x, y, x - r, y);
      ctx.quadraticCurveTo(x, y, x, y - r);
      ctx.fill();
    });
    ctx.restore();
  }

  draw() {
    const ctx = this.stage.begin();
    ctx.clearRect(0, 0, STAGE_W, STAGE_H);
    if (state.phase === PHASE.TITLE) {
      this.drawTitle(ctx, 1);
      return;
    }
    const offset = this.drawBackground(ctx);
    this.fx.drawWater(ctx, offset, state.fish);
    for (const f of this.ambient) f.draw(ctx);
    for (const f of state.fish) if (!f.flying) f.draw(ctx);
    for (const f of this.leapers) f.draw(ctx);
    this.fx.drawSplashLayer(ctx, false);
    // the net hangs over the fish; its lifting rope comes down from the boom's end pulley
    const { popo, winch } = this;
    this.net.draw(ctx, { waterline: this.waterline, pulley: popo.transformPoint(winch.exit.x, winch.exit.y) });
    // the raft, the machine on it and Popo at its wheel ride the waves as one; Popo is drawn
    // after the machine so his wheel's shaft meets the axle (rowing, he paddles behind it)
    const onRaft = (part) => {
      ctx.save();
      popo.applyTransform(ctx);
      ctx.translate(popo.anchor.x, popo.anchor.y);
      part();
      ctx.restore();
    };
    if (popo.rowing) {
      popo.draw(ctx);
      onRaft(() => winch.draw(ctx));
    } else {
      onRaft(() => { popo.drawRaftProp(ctx); winch.draw(ctx); });
      popo.draw(ctx);
    }
    // netted fish hop over the deck into the bucket
    for (const f of state.fish) if (f.flying) {
      ctx.save();
      if (f.landing) {
        const mouth = popo.bucketPoint();
        ctx.beginPath(); ctx.rect(0,0,STAGE_W,mouth.y+4); ctx.clip();
      }
      f.draw(ctx); ctx.restore();
    }
    this.drawRaftWater(ctx);
    this.drawPoof(ctx);
    this.fx.drawFront(ctx);
    if (this.titleFade > 0) this.drawTitle(ctx, this.titleFade);
  }
}

Object.assign(PopoGame, { Game });
})(window.PopoGame = window.PopoGame || {});
