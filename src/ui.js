(function (PopoGame) {
'use strict';

const $ = (id) => document.getElementById(id);
const NUDGE = 12; // an arrow key's direction, in logical pixels; the corner moves a stop that way
const LONG_LINE = 7; // a sentence of more words than this breaks at its comma

// Text into a parent, with each ∠ drawn: Fredoka has no angle sign and other fonts draw it
// small and low, so it is a little line drawing in the text's colour, sized to its capitals. The
// sign itself stays in the text, unseen, so the line still reads (and copies) as written.
const ANGLE = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M10.5 1.5 2 10.5h9.5"/></svg>';
function appendText(parent, text) {
  text.split(/(∠)/).forEach((bit) => {
    if (!bit) return;
    if (bit !== '∠') { parent.appendChild(document.createTextNode(bit)); return; }
    const angle = document.createElement('span');
    angle.className = 'ang';
    angle.innerHTML = ANGLE;
    const sign = document.createElement('span');
    sign.className = 'ang-sign';
    sign.textContent = bit;
    angle.appendChild(sign);
    parent.appendChild(angle);
  });
}

// A line split into the words it is delivered in. Each word is a list of pieces ({ text, em })
// so a *starred* part keeps its highlight, and `newLine` marks a word that starts a new part of
// the line: after a sentence (or a colon), and at the comma nearest the middle of a long
// sentence. The line stays one line; each new part comes after a beat, with a bounce, so the
// child takes in one idea at a time.
function wordsOf(text) {
  const words = [];
  let word = null;
  text.split(/(\*[^*]+\*)/).forEach((part) => {
    if (!part) return;
    const em = part.length > 2 && part.startsWith('*') && part.endsWith('*');
    (em ? part.slice(1, -1) : part).split(/(\s+)/).forEach((bit) => {
      if (!bit) return;
      if (!bit.trim()) { word = null; return; }
      if (!word) words.push(word = { pieces: [], text: '', em: false, newLine: false });
      word.pieces.push({ text: bit, em });
      word.text += bit;
      word.em = word.em || em;
    });
  });
  words.forEach((w, i) => { if (i && /[.!?:…]$/.test(words[i - 1].text)) w.newLine = true; });
  const starts = words.map((w, i) => (!i || w.newLine ? i : -1)).filter((i) => i >= 0);
  starts.forEach((from, n) => {
    const to = n + 1 < starts.length ? starts[n + 1] : words.length;
    if (to - from <= LONG_LINE) return;
    const middle = (from + to) / 2;
    let best = -1;
    for (let i = from + 1; i < to - 1; i += 1) {
      if (words[i].text.endsWith(',') && (best < 0 || Math.abs(i + 1 - middle) < Math.abs(best + 1 - middle))) best = i;
    }
    if (best >= 0) words[best + 1].newLine = true;
  });
  return words;
}

class UI {
  constructor() {
    this.el = {
      hud: $('hud'), hits: $('hits'), handle: $('handle'), stepBack: $('step-back'), stepOn: $('step-on'), hand: $('hand'), start: $('screen-start'), loading: $('loading'), play: $('btn-play'),
      instruction: $('instruction'), instructionText: $('instruction-text'), instructionSay: $('instruction-say'), drop: $('btn-drop'),
      sound: $('btn-sound'), pause: $('btn-pause'),
      pauseOverlay: $('overlay-pause'), resume: $('btn-resume'), restart: $('btn-restart'),
      again: $('btn-again'), scene: $('scene'), catch: $('catch'), catchCount: $('catch-count'), nets: $('nets'),
      rotate: $('rotate-hint'), speech: $('speech'), caption: $('caption'),
    };
    this.handlers = {};
    this.scale = 1;
    this.dragId = null;
    const h = (name) => (e) => { e.preventDefault(); this.emit(name); };
    this.el.play.addEventListener('click', h('play'));
    this.el.play.addEventListener('pointerenter', () => this.emit('playHover', true));
    this.el.play.addEventListener('pointerleave', () => this.emit('playHover', false));
    this.el.play.addEventListener('pointerdown', () => this.emit('playPress'));
    this.el.sound.addEventListener('click', h('sound'));
    this.el.pause.addEventListener('click', h('pause'));
    this.el.resume.addEventListener('click', h('resume'));
    this.el.restart.addEventListener('click', h('restart'));
    this.el.drop.addEventListener('click', h('drop'));
    this.el.again.addEventListener('click', h('again'));
    this.wireHandle();
    // a dot for each net, filled as it is done
    this.netDots = PopoGame.LEVELS.map(() => this.el.nets.appendChild(document.createElement('i')));
    // the arrows beside the knob: a tap moves the corner one stop that way
    for (const [el, steps] of [[this.el.stepBack, -1], [this.el.stepOn, 1]]) {
      el.addEventListener('click', (e) => { e.preventDefault(); this.emit('step', steps); });
    }
  }

  on(name, fn) {
    this.handlers[name] = fn;
  }

  emit(name, ...args) {
    if (this.handlers[name]) this.handlers[name](...args);
  }

  // --- the net's corner ------------------------------------------------------
  // One pointer at a time, captured so the drag carries on outside the button. The stage
  // rectangle is measured once per drag (and again on resize), not on every move.
  wireHandle() {
    const handle = this.el.handle;
    handle.addEventListener('pointerdown', (e) => {
      if (this.dragId !== null || e.button > 0) return;
      e.preventDefault();
      this.dragId = e.pointerId;
      this.dragRect = this.el.hits.getBoundingClientRect();
      handle.setPointerCapture(e.pointerId);
      handle.focus({ preventScroll: true });
      this.emit('dragStart', this.dragPoint(e));
    });
    handle.addEventListener('pointermove', (e) => {
      if (e.pointerId === this.dragId) this.emit('dragMove', this.dragPoint(e));
    });
    const end = (e) => {
      if (e.pointerId !== this.dragId) return;
      this.dragId = null;
      this.emit('dragEnd', this.dragPoint(e));
    };
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
    handle.addEventListener('keydown', (e) => {
      const step = { ArrowLeft: [-NUDGE, 0], ArrowRight: [NUDGE, 0], ArrowUp: [0, -NUDGE], ArrowDown: [0, NUDGE] }[e.key];
      if (step) {
        e.preventDefault();
        this.emit('nudge', step[0], step[1]);
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this.emit('drop');
      }
    });
  }

  dragPoint(e) {
    const r = this.dragRect;
    return { x: (e.clientX - r.left) / this.scale, y: (e.clientY - r.top) / this.scale };
  }

  placeHandle(x, y) {
    this.el.handle.style.transform = `translate(${(x * this.scale).toFixed(1)}px, ${(y * this.scale).toFixed(1)}px)`;
  }

  showHandle(on) {
    this.el.handle.hidden = !on;
    if (!on) {
      this.dragId = null;
      this.placeSteps(null, null);
    }
  }

  // The tap targets over the two arrows beside the knob (stage points, or null for an arrow
  // at the end of the track, which isn't drawn).
  placeSteps(back, on) {
    for (const [el, p] of [[this.el.stepBack, back], [this.el.stepOn, on]]) {
      el.hidden = !p || this.el.handle.hidden;
      if (p) el.style.transform = `translate(${(p.x * this.scale).toFixed(1)}px, ${(p.y * this.scale).toFixed(1)}px)`;
    }
  }

  // How far the arrows sit from the knob, in CSS pixels: just clear of the knob's own (bigger)
  // target, so a drag that starts on the knob's edge never taps an arrow instead.
  // (The sizes are the CSS's: the knob's target is max(60px, 8.4em), an arrow's 44px.)
  arrowGap() {
    const em = parseFloat(getComputedStyle(this.el.hits).fontSize);
    return Math.max(60, 8.4 * em) / 2 + 22 + 4;
  }

  // Drop Net, the one action: 'on' while the child solves, 'hidden' while the net is down. It
  // looks the same whether the net is right or not. Once pressed it drops away rather than
  // vanishing.
  setDrop(mode) {
    if (mode === this.dropMode) return;
    const shown = !this.el.drop.hidden;
    this.dropMode = mode;
    const b = this.el.drop;
    clearTimeout(this.dropLeaving);
    b.classList.remove('leave');
    if (mode !== 'hidden' || !shown) {
      b.hidden = mode === 'hidden';
      return;
    }
    b.classList.add('leave');
    this.dropLeaving = setTimeout(() => {
      b.hidden = true;
      b.classList.remove('leave');
    }, 260);
  }

  pop(el) {
    el.classList.remove('say');
    void el.offsetWidth;
    el.classList.add('say');
  }

  // The middle of Drop Net, as a stage point, for the hint hand.
  dropPoint() {
    const r = this.el.drop.getBoundingClientRect();
    const h = this.el.hits.getBoundingClientRect();
    return { x: (r.left + r.width / 2 - h.left) / this.scale, y: (r.top + r.height / 2 - h.top) / this.scale };
  }

  // --- story lines -----------------------------------------------------------
  // A story line: Popo's speech bubble, anchored at a stage point, or the narrator's caption.
  // The caption lays its words out hidden, so its plate never changes size. The bubble lays the
  // whole line out once, balanced over its lines, and pins each break there; then it starts
  // small and grows word by word into exactly that shape, with no empty space ahead.
  showLine(who, words) {
    this.hideLines();
    const el = who === 'narrator' ? this.el.caption : this.el.speech;
    const line = el.querySelector('.line');
    line.innerHTML = '';
    this.wordEls = words.map((w, i) => {
      const span = document.createElement('span');
      span.className = w.em ? 'w em' : 'w';
      span.textContent = i < words.length - 1 ? `${w.text} ` : w.text;
      line.appendChild(span);
      return span;
    });
    el.hidden = false;
    if (el === this.el.speech) this.pinBreaks(el, line);
    el.classList.remove('pop', 'bump');
    void el.offsetWidth;
    el.classList.add('pop');
    this.el.hud.classList.add('talking');
    this.lineEl = el;
  }

  // Measures the bubble with every word showing and its lines balanced, then pins a break before
  // each word that starts a new line.
  pinBreaks(el, line) {
    el.classList.add('measuring');
    // a word's middle, not its top: the bigger stressed words sit higher in the same line
    const mids = this.wordEls.map((span) => span.offsetTop + span.offsetHeight / 2);
    const em = parseFloat(getComputedStyle(el).fontSize);
    this.speechBox = { w: el.offsetWidth, h: el.offsetHeight, em };
    el.classList.remove('measuring');
    this.breaks = this.wordEls.map((span, i) => {
      if (!i || mids[i] - mids[i - 1] < em * 0.6) return null;
      const br = document.createElement('br');
      line.insertBefore(br, span);
      return br;
    });
  }

  revealWord(i, bump) {
    const span = this.wordEls && this.wordEls[i];
    if (span) span.classList.add('in');
    if (this.breaks && this.breaks[i]) this.breaks[i].classList.add('in');
    if (bump && this.lineEl === this.el.speech) {
      this.el.speech.classList.remove('pop', 'bump');
      void this.el.speech.offsetWidth;
      this.el.speech.classList.add('bump');
    }
  }

  // (x, y) is where the tail points. The bubble sits above and to the right of it, so it's
  // nudged down or left when it would run off the top or right of the stage.
  placeSpeech(x, y) {
    const b = this.speechBox || { w: 0, h: 0, em: 0 };
    const width = this.el.hits.clientWidth;
    const left = Math.min(x * this.scale, width - b.w + 0.6 * b.em - 4);
    const top = Math.max(y * this.scale, b.h + 14); // clear of the top edge, even as it pops
    this.el.speech.style.left = `${left.toFixed(1)}px`;
    this.el.speech.style.top = `${top.toFixed(1)}px`;
  }

  hideLines() {
    this.el.speech.hidden = true;
    this.el.caption.hidden = true;
    this.el.hud.classList.remove('talking');
    this.lineEl = null;
    this.wordEls = null;
    this.breaks = null;
  }

  // --- screens and HUD ---------------------------------------------------------
  placePlay(x, y, r) {
    const k = this.scale;
    const s = this.el.play.style;
    s.transform = `translate(${((x - r) * k).toFixed(1)}px, ${((y - r) * k).toFixed(1)}px)`;
    s.width = s.height = `${(2 * r * k).toFixed(1)}px`;
  }

  setScale(scale) {
    this.scale = scale;
    if (this.dragId !== null) this.dragRect = this.el.hits.getBoundingClientRect();
    this.fitInstruction();
  }

  setLoading(text) {
    this.el.loading.textContent = text;
    this.el.loading.hidden = !text;
    this.el.play.disabled = Boolean(text);
  }

  hideStart() {
    this.el.start.classList.add('fade-out');
    setTimeout(() => { this.el.start.hidden = true; }, 500);
  }

  showStart() {
    this.el.start.hidden = false;
    this.el.start.classList.remove('fade-out');
    this.el.hud.hidden = true;
  }

  showHud() {
    this.el.hud.hidden = false;
  }

  // --- delivered text ------------------------------------------------------------
  // Lays a line out in `el` as hidden words for the game to show one at a time (Game.deliver).
  // Laid out whole first, the plate is its final size from the start and never changes as the
  // words come. `plate` is what bounces as each new part of the line begins.
  layWords(el, plate, text) {
    const words = wordsOf(text);
    el.textContent = '';
    const spans = words.map((w, i) => {
      if (i) el.appendChild(document.createTextNode(' '));
      const span = document.createElement('span');
      span.className = w.em ? 'w em' : 'w';
      for (const piece of w.pieces) {
        if (!piece.em) { appendText(span, piece.text); continue; }
        const b = document.createElement('b');
        b.className = 'hl';
        appendText(b, piece.text);
        span.appendChild(b);
      }
      el.appendChild(span);
      return span;
    });
    this.delivered = { words, spans, plate };
    return words;
  }

  // The next word pops in (a stressed one with a boing); a word that starts a new sentence
  // gives its plate a little bounce.
  showWord(i) {
    const d = this.delivered;
    if (!d || !d.spans[i]) return;
    d.spans[i].classList.add('in');
    if (i && d.words[i].newLine) {
      d.plate.classList.remove('say', 'pulse', 'bump');
      void d.plate.offsetWidth;
      d.plate.classList.add('bump');
    }
  }

  // A word already showing bounces as it is read again.
  bounceWord(i) {
    const span = this.delivered && this.delivered.spans[i];
    if (!span) return;
    span.classList.remove('beat');
    void span.offsetWidth;
    span.classList.add('beat');
  }

  // The instruction plate: a prompt, praise or hint, its words hidden until the game shows them.
  // Screen readers get the whole line at once. The plate gives a little boing on every change.
  setInstruction(text) {
    const plate = this.el.instruction;
    plate.classList.toggle('empty', !text);
    this.el.instructionSay.textContent = text.replace(/\*/g, '');
    const words = this.layWords(this.el.instructionText, plate, text);
    if (!text) return words;
    plate.classList.remove('say', 'pulse', 'bump');
    this.fitInstruction();
    void plate.offsetWidth;
    plate.classList.add('say');
    return words;
  }

  // The instruction is always one line, never two: one too long for the room between the
  // corner buttons has its words shrunk until it fits. Layout widths ignore the plate's
  // animations, so this holds mid-boing too.
  fitInstruction() {
    const t = this.el.instructionText;
    const plate = this.el.instruction;
    t.style.fontSize = '';
    if (!t.textContent) return;
    const column = parseFloat(getComputedStyle(plate.parentElement).gridTemplateColumns.split(' ')[1]);
    const box = getComputedStyle(plate);
    const room = column - parseFloat(box.paddingLeft) - parseFloat(box.paddingRight) - parseFloat(box.borderLeftWidth) * 2;
    if (t.scrollWidth > room) t.style.fontSize = `${(room / t.scrollWidth).toFixed(3)}em`;
  }

  pulseInstruction() {
    this.el.instruction.classList.remove('pulse', 'say');
    void this.el.instruction.offsetWidth;
    this.el.instruction.classList.add('pulse');
  }

  setSound(muted) {
    this.el.sound.setAttribute('aria-pressed', String(!muted));
    this.el.sound.setAttribute('aria-label', muted ? 'Sound off' : 'Sound on');
    this.el.sound.classList.toggle('muted', muted);
  }

  showPause(show) {
    this.el.pauseOverlay.hidden = !show;
    if (show) this.el.resume.focus();
  }

  // The catch so far, a fish and a number at the top left; it bounces as each fish lands.
  setCatch(n, bounce = false) {
    this.el.catchCount.textContent = String(n);
    this.el.catch.setAttribute('aria-label', `Fish caught: ${n}`);
    if (bounce) this.pop(this.el.catch);
  }

  // The nets: those done filled, the one being fished ringed.
  setNets(done, now) {
    this.netDots.forEach((dot, i) => { dot.className = i < done ? 'done' : i === now ? 'now' : ''; });
  }

  // The end screen's one button, springing in at the bottom right once The End is up.
  showAgain(show) {
    this.el.again.hidden = !show;
    if (show) this.el.again.focus({ preventScroll: true });
  }

  // The end screen moves the scene (the water and the world) under its circle; the curtain,
  // HUD and buttons stay put.
  panScene(x, y) {
    this.el.scene.style.transform = x || y ? `translate(${(x * this.scale).toFixed(1)}px, ${(y * this.scale).toFixed(1)}px)` : '';
  }


  // --- hint hand ---------------------------------------------------------------
  showHand(dragging = false) {
    this.el.hand.hidden = false;
    this.el.hand.classList.toggle('drag', dragging);
    this.el.hand.classList.remove('fade');
  }

  fadeHand() {
    this.el.hand.classList.add('fade');
  }

  hideHand() {
    this.el.hand.hidden = true;
    this.el.hand.classList.remove('fade', 'drag');
  }

  moveHand(x, y) {
    this.el.hand.style.transform = `translate(${(x * this.scale).toFixed(1)}px, ${(y * this.scale).toFixed(1)}px)`;
  }

  showRotateHint(show) {
    this.el.rotate.hidden = !show;
  }
}

Object.assign(PopoGame, { UI });
})(window.PopoGame = window.PopoGame || {});
