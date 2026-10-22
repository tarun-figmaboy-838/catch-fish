(function (PopoGame) {
'use strict';
const { assets, ease, Effects, Fish, NATURAL_FISH, state, PHASE, STAGE_W } = PopoGame;

const TAU = Math.PI * 2;
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const lerp = (a, b, k) => a + (b - a) * k;
const span = (x, a, b) => clamp((x - a) / (b - a));

// The banner, played out on the lake itself. Popo zooms in from the left on his raft
// (sequences' banner); a big fish swims in under the water and leaps for the sky where the logo
// will be; at the top of its leap the logo (the painted "Fishing Frenzy 2", asset/
// fishing-frenzy-2-logo.png, built by tools/build-assets.py) pops in and the fish drops down behind it; two little fish follow it. From
// behind the logo they pop their heads up over it, look about and duck down again. Last, the
// Play button bobs up out of the water.
const LOGO = { x: 1205, y: 290, scale: 0.53 };
// the top of the logo's snow, measured on the art (tools/build-assets.py --logo): [x, y] in its pixels
const LOGO_TOP = [[40, 424], [70, 393], [100, 144], [130, 106], [160, 94], [190, 79], [220, 74], [250, 66], [280, 44],
  [310, 30], [340, 29], [370, 41], [400, 55], [430, 100], [460, 88], [490, 94], [520, 110], [550, 152], [580, 145],
  [610, 145], [640, 35], [670, 20], [700, 11], [730, 7], [760, 23], [790, 51], [820, 142], [850, 149], [880, 80],
  [910, 63], [940, 64], [970, 80], [1000, 90], [1030, 155], [1060, 155], [1090, 165], [1120, 163], [1150, 165],
  [1180, 178], [1210, 215], [1240, 198], [1270, 168], [1300, 160], [1330, 161], [1360, 168], [1390, 171], [1420, 191],
  [1450, 411]];
const PLAY = { x: 836, y: 772, r: 104 };

// Its fish: where each hides behind the logo and peeks out (in the logo's pixels: over its top at
// `at`, where the snow is level, or out past its left end at height `y`), its size, when it sets
// off from the right under the water (seconds after the banner sends them), its leap, and when
// its peeks come round once it's hidden.
const FISH = [
  { side: 'top', at: 1250, size: 1.55, go: 0, leap: 0.8, high: 170, first: 0.45, every: 3.6, kinds: ['red-dots', 'orange-stripes', 'clownfish', 'orange-spots'] },
  { side: 'top', at: 300, size: 1.2, go: 1.0, leap: 0.75, high: 150, first: 1.5, every: 4.3, kinds: ['purple-spots', 'violet-scales', 'pink-stripes', 'purple-stripes'] },
  { side: 'left', y: 487, size: 1.15, go: 1.35, leap: 0.7, high: 120, first: 2.6, every: 3.9, kinds: ['green-spots', 'lime-waves', 'green-dots', 'green-stripes'] },
];
// the logo's left end, measured on the art: [y, x] of its first solid pixel
const LOGO_LEFT = [[375, 127], [400, 61], [425, 39], [450, 11], [475, 7], [500, 19], [525, 24], [550, 56], [575, 72], [600, 152]];
const TILT = 0.22; // a peek over the top is level, nose a little up
const PEEK = { up: 0.22, hold: 1.2, down: 0.18 };
const PEEK_LEN = PEEK.up + PEEK.hold + PEEK.down;
const SWIM = 820;      // their dash in under the water, px/s
const POP = 0.45;      // the logo popping in
const PLAY_RISE = 0.6;
const LEAVE = 0.9;     // the title clearing away after Play
const HOME = 0.6;      // a fish's leap from behind the logo back into the lake

// How far a fish's head is up over the logo, a moment into a peek: popping up with a bounce,
// bobbing as it looks about, ducking back down.
function peekCurve(ph) {
  if (ph < 0) return 0;
  if (ph < PEEK.up) return ease.outBack(ph / PEEK.up);
  if (ph < PEEK.up + PEEK.hold) return 1 + Math.sin((ph - PEEK.up) * 9) * 0.03;
  if (ph < PEEK_LEN) {
    const u = (ph - PEEK.up - PEEK.hold) / PEEK.down;
    return 1 - u * u;
  }
  return 0;
}

class TitleScreen {
  constructor(game) {
    this.game = game;
    this.fx = new Effects(); // sparkles in front of everything
    this.begun = false;
    this.clear();
  }

  clear() {
    this.t = 0;
    this.fishAt = null;
    this.logoAt = null;
    this.playAt = null;
    this.leaveAt = null;
    this.hidden = false;
    this.fish = [];
    this.jolts = [];          // the logo's wobbles: when
    this.button = { hover: 0, hoverTarget: 0, press: 0, burst: 0 };
    this.armPlay(false);
  }

  get reduced() { return this.game.fx.reduced; }

  // On screen: the title, and its logo, fish and button clearing away after Play.
  get visible() {
    if (this.hidden) return false;
    return state.phase === PHASE.TITLE || (this.leaveAt !== null && this.t - this.leaveAt < LEAVE);
  }

  // The first frames: the lake, and the banner played out on it straight away. Browsers only let
  // a page make sound after a tap, so its music and sounds come in with the first tap anywhere
  // (the context is resumed then, see main.js); until then they're skipped, not saved up.
  begin() {
    if (this.begun) return;
    this.begun = true;
    this.armPlay(false); // until its button is up (loading enables it)
    this.game.reset();
    this.go();
  }

  go() {
    const { audio } = this.game;
    this.game.popo.travelShift = -620; // out of sight, to the left, until he rows in
    audio.init();
    audio.resume();
    audio.startMusic();
    PopoGame.banner(this.game);
  }

  // The dev panel's Title button: the banner again from the start.
  replay() {
    this.clear();
    this.begun = true;
    this.game.reset();
    this.game.ui.showStart();
    this.go();
  }

  // The dev panel's jumps leave the title at once.
  dismiss() {
    this.hidden = true;
    this.armPlay(false);
  }

  armPlay(on) {
    this.armed = on;
    const el = this.game.ui && this.game.ui.el.play;
    if (el) el.disabled = !on;
  }

  // The fish set off (the banner calls this as Popo settles); the logo pops in as the big one leaps.
  sendFish() {
    if (this.fishAt !== null) return;
    this.fishAt = this.t;
    const wl = this.game.waterline;
    this.fish = FISH.map((spec, i) => {
      // one of each colour: the kinds the levels have, picked at random
      const kinds = spec.kinds.filter((k) => NATURAL_FISH.includes(k));
      const key = kinds[Math.floor(Math.random() * kinds.length)] || NATURAL_FISH[i];
      const f = new Fish(key, STAGE_W + 140, wl + 150 + i * 30, -1, spec.size);
      const a = { f, spec, i, hide: this.hideSpot(spec, f), from: { x: f.x, y: f.y }, start: spec.go };
      a.out = { x: this.rest(a.hide.hidden.x, 0).x + 150 + i * 30, y: wl };
      a.leapAt = spec.go + (f.x - a.out.x) / SWIM;
      a.hideAt = a.leapAt + spec.leap; // seconds after sendFish
      return a;
    });
    if (this.reduced) {
      this.logoAt = this.t - POP;
      for (const a of this.fish) a.start = a.leapAt = a.hideAt = -99;
    }
  }

  showPlay() {
    this.playAt = this.t;
  }

  // Where a fish hides and where it peeks (its middle, in the logo's pixels). Over the top it
  // lies level, nose a little up: hidden, all of it is under the lowest snow across its width;
  // peeking, the top of its head and its eyes are up over the highest. Past the left end it faces
  // out, hidden behind the plank's end, and peeks out with its head.
  hideSpot(spec, f) {
    const len = f.w / LOGO.scale;
    const thick = f.h / LOGO.scale;
    if (spec.side === 'left') {
      const edge = LOGO_LEFT.filter(([y]) => Math.abs(y - spec.y) <= thick / 2 + 6).map(([, x]) => x);
      return { hidden: { x: Math.max(...edge) + 30 + len / 2, y: spec.y }, peek: { x: Math.min(...edge) - len * 0.4 + len / 2, y: spec.y } };
    }
    const tops = LOGO_TOP.filter(([x]) => Math.abs(x - spec.at) <= len * 0.4).map(([, y]) => y);
    const rise = (len / 2) * Math.sin(TILT) + (thick / 2) * Math.cos(TILT); // its top, over its middle
    return { hidden: { x: spec.at, y: Math.max(...tops) + 25 + rise }, peek: { x: spec.at, y: Math.min(...tops) - thick * 0.48 + rise } };
  }

  // A point on the logo at rest (before it is there, or ignoring its bob).
  rest(lx, ly) {
    const img = assets.logo;
    return { x: LOGO.x + (lx - img.width / 2) * LOGO.scale, y: LOGO.y + (ly - img.height / 2) * LOGO.scale };
  }

  // The logo's middle and size this moment: popping in, a bob, and a squash when tapped.
  logoPose() {
    const t = this.t;
    const a = t - this.logoAt;
    let s = this.reduced ? 1 : ease.outBack(span(a, 0, POP));
    let sx = 1;
    let sy = 1;
    for (const at of this.jolts) {
      const d = t - at;
      if (d < 0 || d > 1) continue;
      const k = 0.05 * Math.exp(-6 * d) * Math.cos(18 * d);
      sx += k;
      sy -= k;
    }
    let y = LOGO.y + (this.reduced ? 0 : Math.sin(t * 1.3) * 4 * span(a, POP, POP + 0.8));
    let rot = 0;
    if (this.leaveAt !== null) {
      const u = span(t - this.leaveAt, 0.05, 0.45);
      s *= u < 0.3 ? 1 + 0.12 * (u / 0.3) : 1.12 * (1 - (u - 0.3) / 0.7) ** 2;
      y -= 60 * u;
      rot = -0.12 * u;
    }
    return { x: LOGO.x, y, s: s * LOGO.scale, sx, sy, rot };
  }

  // A point on the logo (its pixels) on the stage, as the logo is this moment.
  onLogo(lx, ly) {
    const p = this.logoPose();
    const img = assets.logo;
    const dx = (lx - img.width / 2) * p.s * p.sx;
    const dy = (ly - img.height / 2) * p.s * p.sy;
    return { x: p.x + dx * Math.cos(p.rot) - dy * Math.sin(p.rot), y: p.y + dx * Math.sin(p.rot) + dy * Math.cos(p.rot) };
  }

  // How far up a hidden fish's head is this moment (0 hidden, 1 peeking): its own round of
  // peeks, all of them at once when the logo is tapped, and a quick duck when it is tapped.
  peekOf(a, t = this.t) {
    if (!a.hiding) return 0;
    const lt = t - this.fishAt - a.hideAt - a.spec.first;
    let k = lt < 0 ? 0 : peekCurve(lt % a.spec.every);
    if (a.surpriseAt !== undefined) k = Math.max(k, peekCurve(t - a.surpriseAt));
    if (a.duckAt !== undefined && t - a.duckAt < 0.6) k = Math.min(k, Math.max(0, 1 - (t - a.duckAt) / 0.15));
    return this.reduced ? Math.min(1, k) : k;
  }

  // Play: the button bursts, the logo pops away and the fish leap back into the lake.
  leave() {
    if (this.leaveAt !== null) return;
    this.leaveAt = this.t;
    this.armPlay(false);
    const b = this.button;
    b.burst = 0.001;
    b.press = 1;
    const fx = this.game.fx;
    for (let i = 0; i < 10; i += 1) {
      const a = (i / 10) * TAU;
      fx.puff(PLAY.x + Math.cos(a) * PLAY.r, PLAY.y + Math.sin(a) * PLAY.r * 0.8, Math.cos(a), 2, true);
    }
    fx.sparkle(PLAY.x, PLAY.y - PLAY.r * 0.4, 14);
    this.fish.forEach((a, i) => {
      if (!a.hiding) return;
      const from = this.peekPoint(a, Math.max(0.6, this.peekOf(a)));
      const to = { x: from.x + (i - 1) * 150 + 60, y: this.game.waterline + 40 };
      a.f.dir = to.x < from.x ? -1 : 1;
      a.home = { at: this.t + 0.05 + i * 0.07, from, to };
    });
    this.game.audio.play('cheer');
    this.game.audio.play('whoosh');
  }

  // A hidden fish's middle on the stage, k of the way out into its peek.
  peekPoint(a, k) {
    const { hidden, peek } = a.hide;
    return this.onLogo(lerp(hidden.x, peek.x, k), lerp(hidden.y, peek.y, k));
  }

  // --- life ------------------------------------------------------------------------------
  update(dt) {
    if (!this.visible) return;
    const prev = this.t;
    this.t += dt;
    const t = this.t;
    const crossed = (at) => at !== null && prev < at && t >= at;
    this.fx.update(dt);
    const b = this.button;
    b.hover += (b.hoverTarget - b.hover) * Math.min(1, dt * 10);
    b.press = Math.max(0, b.press - dt * 4);
    if (b.burst > 0) b.burst += dt;
    const game = this.game;
    const { audio, popo } = game;
    const wl = game.waterline;
    if (this.fishAt !== null) {
      const ft = t - this.fishAt;
      const before = prev - this.fishAt;
      this.fish.forEach((a, i) => {
        const f = a.f;
        f.bobPhase += dt * 2.2;
        f.swimPhase += dt * (a.hiding ? 5 : 14);
        if (f.wiggleT >= 0 && (f.wiggleT += dt) > (f.subtleWiggle ? 0.16 : 0.45)) f.wiggleT = -1;
        if (before < a.leapAt && ft >= a.leapAt) {
          // out it leaps
          game.fx.splash(a.out.x, wl, i === 0);
          audio.play('leap');
          audio.play('splashSmall');
          if (i === 0) {
            popo.react('happy', 1.2);
            if (!audio.speak('popo', 'Woah!')) audio.play('woah');
          }
        }
        // the logo pops in at the top of the big fish's leap
        if (i === 0 && this.logoAt === null && ft >= a.leapAt + a.spec.leap * 0.45) {
          this.logoAt = t;
          this.fx.sparkle(LOGO.x - 220, LOGO.y - 60, 12);
          this.fx.sparkle(LOGO.x + 220, LOGO.y - 40, 12);
          this.fx.sparkle(LOGO.x, LOGO.y + 80, 10);
          audio.play('poof');
          audio.play('fanfare');
        }
        if (!a.hiding && ft >= a.hideAt) {
          // ...and down behind the logo it goes
          a.hiding = true;
          audio.play('puff');
          if (i === FISH.length - 1) popo.react('laugh', 1.4);
        }
        // a head pops up: a plink, and a look one way then the other
        if (a.hiding && this.leaveAt === null) {
          const k = this.peekOf(a);
          const was = this.peekOf(a, prev);
          if (k > 0.05 && was <= 0.05) {
            audio.play('bloop');
            a.look = (a.look || 1) * -1;
          }
        }
      });
    }
    for (const a of this.fish) {
      if (!a.home || a.splashed) continue;
      if ((t - a.home.at) / HOME >= 0.85) {
        a.splashed = true;
        game.fx.splash(a.home.to.x, wl, a.i === 0);
        audio.play('splashSmall');
      }
    }
    if (this.playAt !== null) {
      if (crossed(this.playAt + 0.35)) {
        for (let i = 0; i < 8; i += 1) {
          const ang = (i / 8) * TAU;
          game.fx.puff(PLAY.x + Math.cos(ang) * PLAY.r, PLAY.y + Math.sin(ang) * PLAY.r * 0.8, Math.cos(ang), 1, true);
        }
        audio.play('bloop');
      }
      if (crossed(this.playAt + 0.5) && this.leaveAt === null) {
        this.fx.sparkle(PLAY.x, PLAY.y - PLAY.r * 0.6, 10);
        this.armPlay(true);
      }
    }
  }

  // --- taps ------------------------------------------------------------------------------
  // A peeking fish ducks with a giggle; the logo wobbles and every fish pops up to see; the sky
  // twinkles. Taps in the water are the game's own (fish come to look). Returns whether the tap
  // was the title's.
  tap(point) {
    const { audio } = this.game;
    audio.init();
    audio.resume();
    if (this.leaveAt !== null) return true;
    for (const a of this.fish) {
      if (this.peekOf(a) < 0.5) continue;
      const p = this.peekPoint(a, 1);
      if (Math.abs(point.x - p.x) < a.f.w / 2 + 8 && Math.abs(point.y - p.y) < a.f.h / 2 + 10) {
        a.duckAt = this.t;
        audio.play('giggle');
        return true;
      }
    }
    if (this.logoAt !== null && assets.logo) {
      const p = this.logoPose();
      const w = assets.logo.width * p.s;
      const h = assets.logo.height * p.s;
      if (Math.abs(point.x - p.x) < w / 2 && Math.abs(point.y - p.y) < h / 2) {
        if (!this.jolts.length || this.t - this.jolts[this.jolts.length - 1] > 0.4) {
          this.jolts.push(this.t);
          audio.play('wobble');
          for (const a of this.fish) if (a.hiding) a.surpriseAt = this.t + 0.08 + a.i * 0.07;
        }
        return true;
      }
    }
    if (point.y >= this.game.waterline) return false;
    this.fx.sparkle(point.x, point.y, 8);
    audio.play('word');
    return true;
  }

  hover(on) {
    if (this.leaveAt !== null) return;
    this.button.hoverTarget = on ? 1 : 0;
    if (on && this.armed) this.game.audio.play('bloop');
  }

  press() {
    this.button.press = 1;
  }

  // --- drawing ---------------------------------------------------------------------------
  // The fish are drawn before the logo: they are behind it.
  draw(ctx) {
    this.drawPlayButton(ctx);
    this.drawFish(ctx);
    if (this.logoAt !== null) this.drawLogo(ctx);
    this.fx.drawFront(ctx);
  }

  drawLogo(ctx) {
    const img = assets.logo;
    if (!img) return;
    const p = this.logoPose();
    if (p.s <= 0.01) return;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.scale(p.s * p.sx, p.s * p.sy);
    ctx.drawImage(this.shine(img), -img.width / 2, -img.height / 2);
    ctx.restore();
  }

  // Every few seconds a band of light sweeps across the logo (drawn into a copy of it, so the
  // light stays on the logo).
  shine(img) {
    const t = this.t - (this.logoAt ?? 0);
    const k = ((t - 1.2) % 4.5) / 1.1;
    if (this.reduced || t < 1.2 || k > 1) return img;
    if (!this.shineCanvas) {
      this.shineCanvas = document.createElement('canvas');
      this.shineCanvas.width = img.width;
      this.shineCanvas.height = img.height;
    }
    const c = this.shineCanvas;
    const g = c.getContext('2d');
    g.globalCompositeOperation = 'source-over';
    g.clearRect(0, 0, c.width, c.height);
    g.drawImage(img, 0, 0);
    g.globalCompositeOperation = 'source-atop';
    const x = -200 + k * (img.width + 400);
    const band = g.createLinearGradient(x - 90, 0, x + 90, img.height * 0.4);
    band.addColorStop(0, 'rgba(255, 255, 255, 0)');
    band.addColorStop(0.5, 'rgba(255, 255, 255, 0.45)');
    band.addColorStop(1, 'rgba(255, 255, 255, 0)');
    g.fillStyle = band;
    g.fillRect(0, 0, c.width, c.height);
    return c;
  }

  // Each fish: dashing in under the water, rising, leaping high and dropping down behind the logo;
  // there, nose up, popping its head up over it now and then (riding the logo's bob); after
  // Play, leaping back into the lake.
  drawFish(ctx) {
    if (this.fishAt === null) return;
    const ft = this.t - this.fishAt;
    const wl = this.game.waterline;
    for (const a of this.fish) {
      const f = a.f;
      if (ft < a.start) continue;
      if (a.home) {
        const k = (this.t - a.home.at) / HOME;
        if (k >= 1) continue;
        const u = clamp(k);
        const { from, to } = a.home;
        f.x = lerp(from.x, to.x, u);
        f.y = lerp(from.y, to.y, u) - 150 * 4 * u * (1 - u);
        f.pitch = clamp(-(1 - 2 * u) * 0.9, -0.8, 0.9);
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, STAGE_W, wl + 30); // into the water
        ctx.clip();
        f.draw(ctx);
        ctx.restore();
        continue;
      }
      if (ft < a.leapAt) {
        // under the water, rising toward the surface at the end
        const k = (ft - a.start) / (a.leapAt - a.start);
        f.x = lerp(a.from.x, a.out.x, k);
        const rise = Math.max(0, (k - 0.55) / 0.45);
        f.y = lerp(a.from.y, wl + 25, rise * rise);
        f.pitch = -0.5 * rise;
      } else if (!a.hiding) {
        // a quadratic arc from the water, high over the logo and down behind it
        const u = clamp((ft - a.leapAt) / a.spec.leap);
        const land = this.rest(a.hide.hidden.x, a.hide.hidden.y);
        const top = this.rest(a.hide.peek.x, a.hide.peek.y).y - a.spec.high;
        const cy = 2 * top - (wl + land.y) / 2;
        f.x = lerp(a.out.x, land.x, u);
        f.y = (1 - u) ** 2 * wl + 2 * u * (1 - u) * cy + u * u * land.y;
        f.pitch = clamp(-(1 - 2 * u) * 1.1, -0.9, 1.2);
      } else {
        const k = this.peekOf(a);
        if (k <= 0.01) continue;
        const p = this.peekPoint(a, k);
        f.x = p.x;
        f.y = p.y;
        if (a.spec.side === 'left') {
          // out past the plank's end, looking at Popo
          f.dir = -1;
          f.pitch = 0.06;
        } else {
          // over the top, a look one way, then the other, halfway through the peek
          const lt = this.t - this.fishAt - a.hideAt - a.spec.first;
          const mid = lt >= 0 && (lt % a.spec.every) > PEEK.up + PEEK.hold / 2;
          f.dir = (a.look || 1) * (mid ? -1 : 1);
          f.pitch = -TILT;
        }
      }
      f.draw(ctx);
    }
  }

  // The play button bobs up out of the depths and floats in the water: a gentle bob and sway, a
  // breathing warm glow, a shine sweeping across now and then, a grow on hover and a squash when
  // pressed. Its invisible hit area (#btn-play) follows it.
  drawPlayButton(ctx) {
    const img = assets.play;
    const ui = this.game.ui;
    if (!img || this.playAt === null) { ui.placePlay(PLAY.x, PLAY.y, 0); return; }
    const b = this.button;
    const t = this.t;
    const rise = this.reduced ? 1 : span(t - this.playAt, 0, PLAY_RISE);
    const gone = this.leaveAt === null ? 0 : span(t - this.leaveAt, 0.25, 0.6);
    if (gone >= 1) { ui.placePlay(PLAY.x, PLAY.y, 0); return; }
    const { x, r } = PLAY;
    const still = this.reduced;
    const bob = still ? 0 : Math.sin(t * 1.6) * 7;
    const sway = still ? 0 : Math.sin(t * 1.1) * 0.035;
    const breathe = still ? 1 : 1 + Math.sin(t * 2.4) * 0.025;
    const squash = 1 - b.press * 0.12;
    const pop = b.burst > 0 ? 1 + Math.sin(Math.min(1, b.burst / 0.35) * Math.PI) * 0.18 : 1;
    const s = breathe * (1 + b.hover * 0.07) * pop * (1 - gone);
    const cy = PLAY.y + bob + (1 - ease.outBack(rise)) * 300;
    ui.placePlay(x, cy, r * s);
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const glow = ctx.createRadialGradient(x, cy, r * 0.6, x, cy, r * 1.9);
    glow.addColorStop(0, `rgba(255, 210, 110, ${(0.42 + 0.16 * Math.sin(t * 2.4) + b.hover * 0.15) * rise * (1 - gone)})`);
    glow.addColorStop(1, 'rgba(255, 210, 110, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(x - r * 2, cy - r * 2, r * 4, r * 4);
    ctx.globalCompositeOperation = 'source-over';
    ctx.translate(x, cy);
    ctx.rotate(sway);
    ctx.scale(s * (1 + b.press * 0.06), s * squash);
    const w = img.width * (r * 2 / img.height);
    ctx.drawImage(img, -w / 2, -r, w, r * 2);
    const sweep = (t % 3.4) / 1.1;
    if (sweep < 1 && !still) {
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.93, 0, TAU);
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
}

Object.assign(PopoGame, { TitleScreen });
})(window.PopoGame = window.PopoGame || {});
