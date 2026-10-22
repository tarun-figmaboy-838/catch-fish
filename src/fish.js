(function (PopoGame) {
'use strict';
const { assets, STAGE_W } = PopoGame;

const TAU = Math.PI * 2;
const STRIPS = 10; // a fish is drawn in vertical strips so its body can ripple as it swims

// The natural cartoon fish of the levels.
function fishArt(key) {
  const natural = assets.naturalFish;
  return { img: natural.img, box: natural.boxes[key], scale: natural.scale };
}

class Fish {
  constructor(key, x, y, dir, sizeScale = 1) {
    const art = fishArt(key);
    this.key = key;
    this.img = art.img;
    this.box = art.box;
    this.w = (this.box[2] - this.box[0]) * art.scale * sizeScale;
    this.h = (this.box[3] - this.box[1]) * art.scale * sizeScale;
    this.x = x;
    this.y = y;
    this.dir = dir;
    this.speed = 0;
    this.lane = null;      // the lane it swims in (see Sea); a leaping fish has none
    this.depth = 0;        // where in its lane it likes to swim, above or below the middle
    this.lag = 0;          // how far behind the middle of its gap it likes to keep (see Sea.steer)
    this.lagPhase = Math.random() * TAU;
    this.puffs = 0;
    this.reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // a slow, gentle float about its depth (Sea.stock keeps it inside its lane)
    this.driftPhase = Math.random() * TAU;
    this.driftAmp = 3;
    this.driftFreq = 0.12 + Math.random() * 0.12;
    this.baseY = y;
    this.bobPhase = Math.random() * TAU;
    this.swimPhase = Math.random() * TAU;
    this.frozen = false;
    this.wiggleT = -1;
    this.flipT = -1;
    this.scale = 1;
    this.alpha = 1;
    this.gone = false;
    this.waiting = false;  // a newcomer out of sight at its lane's start, until there's room to swim in
    this.caught = null;    // where it hangs in the net: its place in the frame ({ u, v }, see Net.uvOf)
    this.leaving = false;  // swimming on out of the sea for good (the golden school takes over)
    this.rare = false;     // the final level's prize fish: a golden shimmer and sparkles
    this.breath = 2 + Math.random() * 4;
    this.pitch = 0;
    this.lastY = y;
  }

  wiggle(subtle = false) {
    this.subtleWiggle = subtle;
    this.wiggleT = 0;
  }

  // a cheeky somersault with a little hop, swimming on all the while
  flip() {
    this.flipT = 0;
  }

  // Something interesting nearby (a tap in the water): a puff of bubbles. It keeps its lane.
  lookAt() {
    if (!this.frozen) this.puffs += 1;
  }

  // Startled by a splash: a shiver and a burst of bubbles. It keeps its lane and its place.
  startle() {
    if (this.frozen) return;
    this.wiggle(true);
    this.puffs += 2;
  }

  // The golden school is coming: it swims on along its lane and out of the sea, and is gone
  // once out of sight (one still waiting to swim in never comes).
  swimAway() {
    if (this.gone || this.caught) return;
    this.leaving = true;
    if (this.waiting) this.gone = true;
  }

  // Netted: it hangs where the net found it, rises with the net and slides into its bag.
  catchAt(place) {
    this.caught = place;
    this.frozen = true;
    this.wiggle();
    this.puffs += 3;
  }

  // Swims along its lane at the speed the Sea gives it, looping round just out of sight at the
  // ends of `area` (or, leaving, out of it), and floats gently about its lane's depth.
  update(dt, area) {
    this.bobPhase += dt * 2.2;
    // the tail beats faster the faster it swims, and just stirs once netted
    this.swimPhase += dt * (this.frozen ? 2.5 : 4.5 + this.speed / 22);
    this.breath -= dt;
    // nose follows the vertical motion a little, smoothed so the body never jitters
    const vy = (this.y - this.lastY) / Math.max(dt, 0.001);
    this.lastY = this.y;
    const want = this.frozen ? 0 : Math.max(-0.09, Math.min(0.09, vy / 900));
    this.pitch += (want - this.pitch) * Math.min(1, dt * 3);
    if (this.flipT >= 0 && (this.flipT += dt) > 0.6) this.flipT = -1;
    if (this.wiggleT >= 0) {
      this.wiggleT += dt;
      if (this.wiggleT > (this.subtleWiggle ? 0.16 : 0.45)) this.wiggleT = -1;
    }
    if (this.frozen || this.waiting) return;
    this.driftPhase += dt * this.driftFreq * TAU;
    const lane = this.lane;
    this.dir = lane.dir;
    this.x += this.dir * this.speed * dt;
    const past = this.dir > 0 ? this.x > area.right : this.x < area.left;
    if (past && this.leaving) this.gone = true;
    else if (past) this.x -= this.dir * (area.right - area.left);
    // a new lane depth (the next net reaches a little higher or lower) is glided to
    this.baseY += (lane.y + this.depth - this.baseY) * Math.min(1, dt * 0.8);
    this.y = this.baseY + Math.sin(this.driftPhase) * this.driftAmp;
  }

  draw(ctx) {
    if (this.gone || this.waiting) return;
    const bob = this.frozen && this.subtleWiggle ? 0 : Math.sin(this.bobPhase) * 2;
    let rot = 0;
    if (this.wiggleT >= 0) {
      const t = this.wiggleT;
      if (this.subtleWiggle) {
        rot = Math.sin(t / 0.16 * Math.PI * 2) * 0.045 * (1 - t / 0.16);
      } else {
        rot = Math.sin(t * 38) * 0.14 * Math.max(0, 1 - t / 0.45);
      }
    }
    if (this.flipT >= 0) {
      const p = this.flipT / 0.6;
      rot += this.dir * -(p * p * (3 - 2 * p)) * TAU;
    }
    const hop = this.flipT >= 0 ? -Math.sin((this.flipT / 0.6) * Math.PI) * 22 : 0;
    ctx.save();
    ctx.globalAlpha = this.alpha;
    ctx.translate(this.x, this.y + bob + hop);
    if (this.rare) {
      const r = Math.max(this.w, this.h) * 0.7 * this.scale;
      const glow = ctx.createRadialGradient(0, 0, r * 0.3, 0, 0, r);
      glow.addColorStop(0, `rgba(255, 225, 120, ${0.3 + Math.sin(this.bobPhase * 1.4) * 0.12})`);
      glow.addColorStop(1, 'rgba(255, 225, 120, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, TAU);
      ctx.fill();
    }
    ctx.rotate(rot + this.pitch * this.dir);
    ctx.scale(this.dir * this.scale, this.scale);
    const [x0, y0, x1, y1] = this.box;
    if (this.reduced || this.frozen || this.flying) {
      ctx.drawImage(this.img, x0, y0, x1 - x0, y1 - y0, -this.w / 2, -this.h / 2, this.w, this.h);
    } else {
      // a swimming ripple runs from head to tail: the tail and fins swing, the face barely moves
      // (the art faces right, so the tail is the left of the sprite)
      const sw = (x1 - x0) / STRIPS;
      const dw = this.w / STRIPS;
      for (let i = 0; i < STRIPS; i += 1) {
        const u = (i + 0.5) / STRIPS;
        const wave = Math.sin(this.swimPhase - u * 2.4) * (1 - u) ** 1.6 * this.h * 0.09;
        ctx.drawImage(this.img, x0 + i * sw, y0, sw, y1 - y0, -this.w / 2 + i * dw, -this.h / 2 + wave, dw + 0.7, this.h);
      }
    }
    ctx.restore();
  }
}

// --- the school ---------------------------------------------------------------------------
// The school swims in two lanes across the water the lowered net reaches: one above the other,
// a fish-height or more apart, swimming opposite ways at their own pace, so no two fish ever
// overlap or meet head on. In a lane each fish keeps its own loose, slowly changing spacing and
// its own depth, easing a touch faster or slower to hold its place, so the school never lines
// up in rows, and none catches up with another, stops or turns back; they loop round just out
// of sight at the ends of the sea and float gently. The pace rises a little level by level, so
// timing the net stays a game.
const SCHOOL_SIZE = [0.78, 0.88]; // a touch smaller than the leaping fish, so two lanes fit
const RUSH = 3;                   // seconds a whole new school takes to rush in and settle
const LANE_SHARE = [0.9, 1.12];   // the two lanes' paces, as shares of the level's

class Sea {
  constructor() {
    this.lanes = LANE_SHARE.map((share, i) => ({ dir: i ? -1 : 1, share, y: 0, speed: 0, phase: Math.random() * TAU, rush: 0 }));
    this.t = 0;
  }

  // Lays the lanes over `area` (keeping their fish, who glide to the new depths) at `pace`
  // pixels a second, and fills the school up to `keys.length` with newcomers of the kinds not
  // already swimming, each queued out of sight at the start of the emptier lane to swim in
  // when there's room (see steer). Nothing ever appears in view. `keep` is the school so far.
  stock(keep, area, keys, { rare = false, pace = 50 } = {}) {
    const band = area.bottom - area.top;
    this.lanes.forEach((lane, i) => {
      lane.y = area.top + band * (i + 0.5) / this.lanes.length;
      lane.speed = pace * lane.share;
    });
    const room = band / this.lanes.length;
    const school = keep.filter((f) => !f.gone && !f.caught && !f.leaving);
    const present = new Set(school.map((f) => f.key));
    const pool = [...keys.filter((k) => !present.has(k)), ...keys.filter((k) => present.has(k))];
    for (let n = 0; school.length < keys.length; n += 1) {
      const lane = this.lanes.map((l) => ({ l, count: school.filter((f) => f.lane === l).length }))
        .sort((a, b) => a.count - b.count || Math.random() - 0.5)[0].l;
      const start = lane.dir > 0 ? area.left : area.right;
      const f = new Fish(pool[n % pool.length], start, lane.y, lane.dir, SCHOOL_SIZE[0] + Math.random() * (SCHOOL_SIZE[1] - SCHOOL_SIZE[0]));
      f.lane = lane;
      f.rare = rare;
      f.speed = lane.speed;
      f.waiting = true;
      f.queued = (this.queued = (this.queued || 0) + 1);
      school.push(f);
    }
    // a whole new school (the first, or the golden one) rushes in: its lanes swim fast for a
    // moment, newcomers following on quickly, then ease to their pace; every fish in a lane
    // speeds and slows together, so none gains on another
    const newcomers = school.length - keep.filter((f) => !f.gone && !f.caught && !f.leaving).length;
    if (newcomers > school.length / 2) for (const lane of this.lanes) lane.rush = RUSH;
    // each fish floats at its own depth inside its lane, never into the next
    for (const f of school) {
      f.driftAmp = Math.max(0.5, Math.min(4, (room - f.h) / 2 - 1));
      const slack = Math.max(0, (room - f.h) / 2 - f.driftAmp - 3);
      if (f.depthShare === undefined) f.depthShare = Math.random() * 2 - 1;
      if (!f.lagBase) f.lagBase = (Math.random() * 2 - 1) * 0.3;
      f.depth = f.depthShare * slack;
    }
    return school;
  }

  // Each frame: every fish's speed eases toward its lane's pace (which breathes a little, the
  // same for the whole lane), a touch faster when it lags further behind the middle of its gap
  // than it likes and a touch slower when it runs ahead of that, and never closer than a body's
  // length to the fish ahead. How far behind it likes to be drifts slowly, fish by fish (the
  // lane's average kept at zero, so the spacing can always settle), so the gaps breathe.
  steer(fish, area, dt) {
    this.t += dt;
    const span = area.right - area.left;
    for (const lane of this.lanes) {
      const rush = lane.rush > 0 ? Math.min(1, lane.rush / (RUSH * 0.6)) : 0;
      lane.rush = Math.max(0, lane.rush - dt);
      const pace = lane.speed * (1 + 0.08 * Math.sin(this.t * 0.45 + lane.phase)) * (1 + 2.6 * rush * rush * (3 - 2 * rush));
      const along = (f) => (((f.x - area.left) * lane.dir) % span + span) % span;
      // fish leaving the sea still hold their places until they're out of sight
      const members = fish.filter((f) => f.lane === lane && !f.gone && !f.caught && !f.frozen && !f.waiting)
        .sort((a, b) => along(a) - along(b));
      const queue = fish.filter((f) => f.lane === lane && f.waiting && !f.gone).sort((a, b) => a.queued - b.queued);
      // the next newcomer swims in, out of sight at the lane's start, once the last fish in is a
      // body and a gap clear of it and the next to loop round is too; until then that next fish
      // holds back a little, so the gap opens however full the lane is
      let holdBack = null;
      if (queue.length) {
        const clear = queue[0].w + 30;
        const first = members.length ? along(members[0]) : span;
        const last = members.length ? span - along(members[members.length - 1]) : span;
        if (first >= clear && last >= clear) {
          queue[0].waiting = false;
          queue[0].speed = pace;
          members.unshift(queue[0]);
        } else if (members.length) {
          holdBack = members[members.length - 1];
        }
      }
      const n = members.length;
      // a crowded lane has less room to be loose in: the spacing keeps a body and a gap clear
      const widest = Math.max(0, ...members.map((f) => f.w));
      const loose = Math.max(0, Math.min(1, (span / n - widest - 40) / (0.9 * span / n)));
      const lags = members.map((f) => loose * (f.lagBase + 0.15 * Math.sin(this.t * 0.11 + f.lagPhase)));
      const mean = lags.reduce((sum, l) => sum + l, 0) / (n || 1);
      members.forEach((f, i) => {
        let want = pace;
        if (n > 1) {
          const next = members[(i + 1) % n];
          const ahead = (along(next) - along(f) + span) % span;
          const behind = (along(f) - along(members[(i - 1 + n) % n]) + span) % span;
          const even = span / n;
          const off = ahead - behind - 2 * (lags[i] - mean) * even;
          want = pace * (1 + Math.max(-0.3, Math.min(0.3, off / (2 * even))));
          if (ahead < (f.w + next.w) / 2 + 30) want = Math.min(want, pace * 0.5);
        }
        if (f === holdBack) want = Math.min(want, pace * 0.6);
        f.speed += (want - f.speed) * Math.min(1, dt * 1.2);
      });
    }
  }
}

// Background life in the gameplay water: soft, translucent fish shadows. They swim straight
// across at their own depth and pace, wag their tails and wrap around off-screen.
const SHADOW = { w: 128, h: 64, frames: 8 };
let shadowSheet = null;

function shadowPath(ctx, wag) {
  const c = Math.cos(wag);
  const s = Math.sin(wag);
  const tail = (x, y) => [-34 + (x + 34) * c - y * s, (x + 34) * s + y * c];
  ctx.beginPath();
  ctx.moveTo(46, 0);
  ctx.bezierCurveTo(40, -17, 8, -23, -18, -14);
  ctx.bezierCurveTo(-28, -10, -34, -5, -36, 0);
  ctx.bezierCurveTo(-34, 5, -28, 10, -18, 14);
  ctx.bezierCurveTo(8, 23, 40, 17, 46, 0);
  ctx.closePath();
  const pts = [[-34, 0], [-58, -19], [-51, 0], [-58, 19]].map(([x, y]) => tail(x, y));
  ctx.moveTo(...pts[0]);
  for (const p of pts.slice(1)) ctx.lineTo(...p);
  ctx.closePath();
  ctx.moveTo(-4, -19);
  ctx.quadraticCurveTo(6, -33, 18, -18);
  ctx.closePath();
}

// Eight tail positions, drawn once. Each silhouette is drawn far off the canvas and only its
// blurred shadow lands in the cell, which gives soft edges in every browser.
function shadowSprites() {
  if (shadowSheet) return shadowSheet;
  const c = document.createElement('canvas');
  c.width = SHADOW.w * SHADOW.frames;
  c.height = SHADOW.h;
  const ctx = c.getContext('2d');
  for (let i = 0; i < SHADOW.frames; i += 1) {
    ctx.save();
    ctx.translate(i * SHADOW.w + SHADOW.w / 2 + 4 - 4000, SHADOW.h / 2);
    ctx.shadowColor = 'rgb(6, 40, 96)';
    ctx.shadowBlur = 5;
    ctx.shadowOffsetX = 4000;
    ctx.fillStyle = '#000';
    shadowPath(ctx, Math.sin((i / SHADOW.frames) * TAU) * 0.3);
    ctx.fill();
    ctx.restore();
  }
  shadowSheet = c;
  return c;
}

class ShadowFish {
  constructor(area, dir, fromEdge = false) {
    this.dir = dir;
    this.depth = Math.random();
    this.size = 0.5 + (1 - this.depth) * 0.6;
    this.speed = (22 + Math.random() * 30) * (1.2 - this.depth * 0.5);
    this.wag = Math.random() * SHADOW.frames;
    this.phase = Math.random() * TAU;
    this.fade = 1;
    this.leaving = false;
    this.gone = false;
    this.place(area, !fromEdge);
  }

  get w() {
    return SHADOW.w * this.size;
  }

  place(area, anywhere) {
    this.baseY = area.top + 30 + Math.random() * (area.bottom - area.top - 60);
    this.x = anywhere ? area.left + Math.random() * (area.right - area.left) : (this.dir > 0 ? -this.w : STAGE_W + this.w);
  }

  leave() {
    this.leaving = true;
    this.speed = Math.max(this.speed, 80);
  }

  update(dt, area) {
    this.x += this.dir * this.speed * dt;
    this.phase += dt * 0.9;
    this.wag += dt * (5 + this.speed / 12);
    this.y = this.baseY + Math.sin(this.phase) * 6;
    if ((this.dir > 0 && this.x > STAGE_W + this.w) || (this.dir < 0 && this.x < -this.w)) {
      if (this.leaving) {
        this.gone = true;
        return;
      }
      this.place(area, false);
    }
  }

  draw(ctx) {
    const sheet = shadowSprites();
    const frame = Math.floor(this.wag) % SHADOW.frames;
    ctx.save();
    ctx.globalAlpha = (0.2 + (1 - this.depth) * 0.22) * this.fade;
    ctx.translate(this.x, this.y + Math.sin(this.phase * 2.3) * 1.5);
    ctx.scale(this.dir * this.size, this.size);
    ctx.drawImage(sheet, frame * SHADOW.w, 0, SHADOW.w, SHADOW.h, -SHADOW.w / 2, -SHADOW.h / 2, SHADOW.w, SHADOW.h);
    ctx.restore();
  }
}

// Keeps the shadows already swimming, sends any extra away and brings newcomers in from the
// edges, so the set changes between levels without anything popping in or out.
function refreshShadows(current, count, area) {
  const live = current.filter((s) => !s.leaving && !s.gone);
  const staying = live.slice(0, count);
  for (const s of live.slice(count)) s.leave();
  const fresh = Array.from({ length: count - staying.length }, (_, i) =>
    new ShadowFish(area, (staying.length + i) % 2 ? 1 : -1, current.length > 0));
  // far shadows first, so nearer ones swim over them
  return [...current.filter((s) => s.leaving && !s.gone), ...staying, ...fresh].sort((a, b) => b.depth - a.depth);
}

Object.assign(PopoGame, { Fish, Sea, refreshShadows });
})(window.PopoGame = window.PopoGame || {});
