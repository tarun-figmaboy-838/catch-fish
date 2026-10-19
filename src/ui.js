(function (PopoGame) {
'use strict';

const $ = (id) => document.getElementById(id);
const NUDGE = 12; // arrow keys move the net's corner this many logical pixels

// Fills an element with text whose *starred* words are highlighted.
function markup(el, text) {
  el.textContent = '';
  text.split(/(\*[^*]+\*)/).forEach((part) => {
    if (!part) return;
    if (part.startsWith('*')) {
      const b = document.createElement('b');
      b.className = 'hl';
      b.textContent = part.slice(1, -1);
      el.appendChild(b);
    } else {
      el.appendChild(document.createTextNode(part));
    }
  });
}

class UI {
  constructor() {
    this.el = {
      hud: $('hud'), hits: $('hits'), handle: $('handle'), hand: $('hand'), start: $('screen-start'), loading: $('loading'), play: $('btn-play'),
      instruction: $('instruction'), instructionText: $('instruction-text'), drop: $('btn-drop'),
      sound: $('btn-sound'), pause: $('btn-pause'),
      pauseOverlay: $('overlay-pause'), resume: $('btn-resume'), restart: $('btn-restart'),
      completeOverlay: $('overlay-complete'), completeTitle: $('complete-title'), completeLesson: $('complete-lesson'), again: $('btn-again'),
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
    if (!on) this.dragId = null;
  }

  // Drop Net, the one action: 'on' while the child solves, 'ready' (glowing) while the frame
  // is right, 'hidden' while the net is down. Set every frame, so it only changes on a change.
  // Once pressed it drops away rather than vanishing.
  setDrop(mode) {
    if (mode === this.dropMode) return;
    const shown = !this.el.drop.hidden;
    this.dropMode = mode;
    const b = this.el.drop;
    clearTimeout(this.dropLeaving);
    b.classList.remove('leave');
    b.classList.toggle('ready', mode === 'ready');
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

  // *word* is highlighted. The panel gives a little boing on every change.
  setInstruction(text) {
    this.el.instruction.classList.toggle('empty', !text);
    if (text === this.instructionShown) return;
    this.instructionShown = text;
    markup(this.el.instructionText, text);
    if (!text) return;
    this.el.instruction.classList.remove('say', 'pulse');
    this.fitInstruction();
    void this.el.instruction.offsetWidth;
    this.el.instruction.classList.add('say');
  }

  // A prompt that wraps is balanced over its lines (in the CSS); its plate then hugs the widest
  // line instead of keeping the full width, so no empty space sits beside the words. Line boxes
  // come scaled by any animation running on the HUD, so they're scaled back.
  fitInstruction() {
    const t = this.el.instructionText;
    t.style.width = '';
    const drawn = t.getBoundingClientRect().width / t.offsetWidth || 1;
    const range = document.createRange();
    range.selectNodeContents(t);
    const lines = [];
    for (const r of range.getClientRects()) {
      if (!r.width) continue;
      const line = lines.find((l) => Math.abs(l.top - r.top) < r.height / 2);
      if (line) {
        line.left = Math.min(line.left, r.left);
        line.right = Math.max(line.right, r.right);
      } else {
        lines.push({ top: r.top, left: r.left, right: r.right });
      }
    }
    if (lines.length < 2) return;
    t.style.width = `${Math.ceil(Math.max(...lines.map((l) => l.right - l.left)) / drawn) + 2}px`;
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

  showComplete(show, title, lesson) {
    this.el.completeOverlay.hidden = !show;
    if (!show) return;
    markup(this.el.completeTitle, title);
    markup(this.el.completeLesson, lesson);
    this.el.again.focus({ preventScroll: true });
  }

  // The final card's lesson line, one property at a time.
  setLesson(text) {
    markup(this.el.completeLesson, text);
    this.pop(this.el.completeLesson);
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
