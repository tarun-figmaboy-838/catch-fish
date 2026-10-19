(function (PopoGame) {
'use strict';
const { assets } = PopoGame;

const TAU = Math.PI * 2;

// Popo is the generated character (assets/generated/popo.png), seated on the raft's deck
// between the bucket and the winch. Positions are measured from the raft anchor (the raft's
// middle at the waterline). His paws rest forward, toward the winch's crank.
const BODY = { left: -103, bottom: -56, width: 250 };
const IMAGE = { w: 1388, h: 1133, paws: [900, 680], top: [640, 110] };
const K = BODY.width / IMAGE.w;
const HEIGHT = IMAGE.h * K;

// The raft prop (popo-props): cell point (186, 383) sits on the anchor; drawn at 1.3 so the
// deck has room for the winch beside Popo.
const PROP = { scale: 1.3, mid: 186, bottom: 383, left: 5, right: 367, bucket: { x: 78, y: 290 } };
// Where Popo sits while rowing: the paddling frames (tools/build-rowing-cycle.py) register on
// this seat, scaled up to the seated character's height.
const SEAT = { dx: (196 - PROP.mid) * PROP.scale, dy: (338 - PROP.bottom) * PROP.scale };
const ROW_SCALE = 1.2;

// A point of the character image in raft coordinates.
function bodyPoint([x, y]) {
  return { x: BODY.left + x * K, y: BODY.bottom - HEIGHT + y * K };
}
const PAWS = bodyPoint(IMAGE.paws);

let rowTintCache = null;

class Popo {
  constructor() {
    this.anchor = { x: 238, y: 400 };
    this.bobT = Math.random() * TAU;
    this.tilt = 0;
    this.dip = 0;
    this.lean = 0;
    this.squash = 0;
    this.travelShift = 0;
    this.shift = { x: 0, y: 0 }; // the body alone, off its seat: leaning on the winch's lever
    this.reaction = null;
    this.rowing = null;
    this.waterResponse = 0;
    this.waveY = 0;
    this.waveAngle = 0;
    this.reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  setAnchor(x, y) {
    this.anchor.x = x;
    this.anchor.y = y;
  }

  idle() {
    this.rowing = null;
    this.reaction = null;
  }

  // A short take: a bounce of the whole body, with a little squash so it reads as a cartoon.
  react(name, seconds = 0.9) {
    this.reaction = { name, left: seconds, length: seconds };
    this.squash = 0.08;
  }

  update(dt) {
    this.bobT += dt * 1.1;
    if (this.reaction && (this.reaction.left -= dt) <= 0) this.reaction = null;
    if (this.squash) this.squash *= Math.max(0, 1 - dt * 9);
  }

  // waveY and waveAngle come from the animated water surface under the raft (see game.js).
  get bob() {
    return this.waveY + Math.sin(this.bobT * 1.07 + 0.8) * 0.6 * (this.reduced ? 0.2 : 1) + this.dip + this.waterResponse;
  }

  raftEnds() {
    return {
      left: this.anchor.x + (PROP.left - PROP.mid) * PROP.scale,
      right: this.anchor.x + (PROP.right - PROP.mid) * PROP.scale,
    };
  }

  drawRaftProp(ctx) {
    const k = PROP.scale;
    ctx.drawImage(assets.props, 0, 0, 418, 418, this.anchor.x - PROP.mid * k, this.anchor.y - PROP.bottom * k, 418 * k, 418 * k);
  }

  // Tilt pivots on the raft's right end at the waterline, so a lean looks like the raft dipping.
  pivot() {
    return { x: this.raftEnds().right, y: this.anchor.y, angle: this.tilt + this.waveAngle };
  }

  applyTransform(ctx) {
    const { x, y, angle } = this.pivot();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.translate(-x, -y);
    ctx.translate(this.travelShift + this.lean, this.bob);
    // squash and stretch about the raft's middle at the waterline (comic stops and bounces)
    if (this.squash) {
      ctx.translate(this.anchor.x, this.anchor.y);
      ctx.scale(1 + this.squash * 0.6, 1 - this.squash);
      ctx.translate(-this.anchor.x, -this.anchor.y);
    }
  }

  // A point in the raft's coordinates (measured from the anchor), through the raft's motion.
  transformPoint(x, y) {
    const pv = this.pivot();
    const lx = this.anchor.x + x + this.travelShift + this.lean - pv.x;
    const ly = this.anchor.y + y + this.bob - pv.y;
    return { x: pv.x + lx * Math.cos(pv.angle) - ly * Math.sin(pv.angle), y: pv.y + lx * Math.sin(pv.angle) + ly * Math.cos(pv.angle) };
  }

  headTop() {
    const t = bodyPoint(IMAGE.top);
    return this.transformPoint(t.x + this.shift.x, t.y + this.shift.y);
  }

  // Where his paws are, in raft coordinates: the winch's crank arm ends there.
  grip() {
    return { x: PAWS.x + this.shift.x, y: PAWS.y + this.shift.y };
  }

  bucketPoint() {
    return this.transformPoint((PROP.bucket.x - PROP.mid) * PROP.scale, (PROP.bucket.y - PROP.bottom) * PROP.scale);
  }

  // The seated character (the game draws the raft, then the winch's arm, before him); while
  // rowing, the paddling frames with the raft.
  draw(ctx) {
    if (this.rowing) { this.drawRowing(ctx); return; }
    ctx.save();
    this.applyTransform(ctx);
    ctx.translate(this.anchor.x + this.shift.x, this.anchor.y + this.shift.y);
    this.drawBody(ctx);
    ctx.restore();
  }

  // Alive while still: the whole character breathes and sways a little from his seat; a
  // reaction is a quick happy bounce.
  drawBody(ctx) {
    const still = this.reduced;
    const breath = still ? 0 : Math.sin(this.bobT * 2) * 0.012;
    const sway = still ? 0 : Math.sin(this.bobT * 0.8 + 1) * 0.016;
    let bounce = 0;
    if (this.reaction && !still) {
      const k = 1 - this.reaction.left / this.reaction.length;
      bounce = Math.abs(Math.sin(k * Math.PI * 3)) * 0.05 * (1 - k);
    }
    ctx.save();
    ctx.translate(BODY.left + BODY.width / 2, BODY.bottom);
    ctx.rotate(sway);
    ctx.scale(1 - breath - bounce * 0.4, 1 + breath + bounce);
    ctx.drawImage(assets.popoPolished, -BODY.width / 2, -HEIGHT, BODY.width, HEIGHT);
    ctx.restore();
  }

  // --- rowing ---------------------------------------------------------------
  startRowing(cycleMs = 2100) {
    this.reaction = null;
    this.rowRig = this.rowRig || new PopoGame.PaddleRig(null, null, PopoGame.ROWING_RIG);
    this.rowing = { time: 0, cycleMs };
  }

  setRowingTime(time) {
    if (this.rowing) this.rowing.time = time;
  }

  // The blade's place in the stroke, from the paddling rig: it times the splashes.
  paddleTip() {
    if (!this.rowing) return null;
    const d = PopoGame.ROWING_RIG;
    const k = d.worldScale * ROW_SCALE;
    const tip = this.rowRig.bladePoint(this.rowing.time, this.rowing.cycleMs);
    return this.transformPoint(SEAT.dx + (tip.x - d.seat[0]) * k, SEAT.dy + (tip.y - d.seat[1]) * k);
  }

  // Below the waterline the blade is seen through the water: a tinted copy of the frames,
  // made once.
  rowTint() {
    if (rowTintCache) return rowTintCache;
    const img = assets.rowCycle;
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const g = c.getContext('2d');
    g.filter = 'sepia(.25) hue-rotate(140deg) saturate(1.15)';
    g.drawImage(img, 0, 0);
    rowTintCache = c;
    return c;
  }

  // The pre-rendered stroke, crossfading the two frames either side of this moment.
  drawRowing(ctx) {
    const d = PopoGame.ROWING_RIG;
    const c = PopoGame.ROWING_CYCLE;
    const r = this.rowing;
    const at = (((r.time / r.cycleMs) % 1 + 1) % 1) * c.frames;
    const i = Math.floor(at) % c.frames;
    const j = (i + 1) % c.frames;
    const mix = at - Math.floor(at);
    const k = d.worldScale / c.scale * ROW_SCALE;
    const x = this.anchor.x + SEAT.dx - c.seat[0] * k;
    const y = this.anchor.y + SEAT.dy - c.seat[1] * k;
    const drawFigure = (img) => {
      ctx.save();
      this.applyTransform(ctx);
      for (const [f, alpha] of [[i, 1], [j, mix]]) {
        if (alpha <= 0.01) continue;
        ctx.globalAlpha *= alpha;
        ctx.drawImage(img, (f % c.columns) * c.width, Math.floor(f / c.columns) * c.height, c.width, c.height, x, y, c.width * k, c.height * k);
        ctx.globalAlpha /= alpha;
      }
      ctx.restore();
    };
    const waterline = this.anchor.y - 12;
    // the blade enters the water without losing length: its underwater part is seen through it
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, waterline, PopoGame.STAGE_W, PopoGame.STAGE_H);
    ctx.clip();
    ctx.globalAlpha = 0.54;
    drawFigure(this.rowTint());
    ctx.restore();
    ctx.save();
    this.applyTransform(ctx);
    this.drawRaftProp(ctx);
    ctx.restore();
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, PopoGame.STAGE_W, waterline);
    ctx.clip();
    drawFigure(assets.rowCycle);
    ctx.restore();
  }
}

Object.assign(PopoGame, { Popo });
})(window.PopoGame = window.PopoGame || {});
