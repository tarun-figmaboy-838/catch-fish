(function (PopoGame) {
'use strict';
const { assets } = PopoGame;

const TAU = Math.PI * 2;

// Popo is the generated operating sheet (assets/generated/popo-operating.png): four poses of
// the seated bear turning his handwheel, in a 2 x 2 grid. Each frame is registered on the
// tip of the wheel's shaft, which sits on the winch's axle, so the wheel never drifts off the
// machine as the poses change. Points are sheet pixels inside the frame.
const CELL = { w: 694, h: 566 };
const FRAMES = [
  { shaft: [657, 355.5], head: [300, 52] },
  { shaft: [616, 355.5], head: [260, 66] },
  { shaft: [661, 293.5], head: [300, 24] },
  { shaft: [616, 293], head: [260, 20] },
];
const S = 0.37; // sheet pixels to stage pixels, the same both ways

// The raft prop (popo-props): cell point (186, 383) sits on the anchor; drawn at 1.2 so the
// deck has room for the winch beside Popo while the net hangs clear of the raft.
const PROP = { scale: 1.2, mid: 186, bottom: 383, left: 5, right: 367, bucket: { x: 78, y: 290 } };
// Where Popo sits while rowing: the paddling frames (tools/build-rowing-cycle.py) register on
// this seat, scaled up to the seated character's height.
const SEAT = { dx: (196 - PROP.mid) * PROP.scale - 65, dy: (338 - PROP.bottom) * PROP.scale };
const ROW_SCALE = 1.1;

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
    this.reaction = null;
    this.rowing = null;
    this.axle = { x: 0, y: 0 };
    this.frame = 0;
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

  // A short take: 'happy' and 'laugh' bounce on the seat, 'think' tilts the head, 'gasp' sits up.
  react(name, seconds = 0.9) {
    this.reaction = { name, left: seconds, length: seconds };
    this.squash = name === 'think' ? 0 : 0.08;
  }

  update(dt) {
    this.bobT += dt * 1.1;
    if (this.reaction && (this.reaction.left -= dt) <= 0) this.reaction = null;
    if (this.squash) this.squash *= Math.max(0, 1 - dt * 9);
  }

  // The wheel's pose follows the drum: one frame per quarter turn.
  setMachine(winch) {
    this.axle = winch.axle;
    this.frame = ((Math.floor(winch.angle / (TAU / 4)) % 4) + 4) % 4;
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

  // Drawn inside the raft's transform, in raft coordinates (or in stage coordinates while
  // rowing, where the transform is applied around it).
  drawRaftProp(ctx, atAnchor = true) {
    const k = PROP.scale;
    const x = atAnchor ? 0 : this.anchor.x;
    const y = atAnchor ? 0 : this.anchor.y;
    ctx.drawImage(assets.props, 0, 0, 418, 418, x - PROP.mid * k, y - PROP.bottom * k, 418 * k, 418 * k);
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
    x *= 1 + this.squash * 0.6;
    y *= 1 - this.squash;
    const lx = this.anchor.x + x + this.travelShift + this.lean - pv.x;
    const ly = this.anchor.y + y + this.bob - pv.y;
    return { x: pv.x + lx * Math.cos(pv.angle) - ly * Math.sin(pv.angle), y: pv.y + lx * Math.sin(pv.angle) + ly * Math.cos(pv.angle) };
  }

  // The frame's top-left corner in raft coordinates: the shaft tip lands on the axle.
  frameOrigin() {
    const f = FRAMES[this.frame];
    return { x: this.axle.x - f.shaft[0] * S, y: this.axle.y - f.shaft[1] * S };
  }

  headTop() {
    if (this.rowing) return this.transformPoint(SEAT.dx, SEAT.dy - 230);
    const o = this.frameOrigin();
    const h = FRAMES[this.frame].head;
    return this.transformPoint(o.x + h[0] * S, o.y + h[1] * S);
  }

  bucketPoint() {
    return this.transformPoint((PROP.bucket.x - PROP.mid) * PROP.scale, (PROP.bucket.y - PROP.bottom) * PROP.scale);
  }

  // The seated character (the game draws the raft and the machine first, so the wheel's shaft
  // meets the axle); while rowing, the paddling frames with the raft.
  draw(ctx) {
    if (this.rowing) { this.drawRowing(ctx); return; }
    ctx.save();
    this.applyTransform(ctx);
    ctx.translate(this.anchor.x, this.anchor.y);
    this.drawBody(ctx);
    ctx.restore();
  }

  // Alive while still: the whole bear breathes from his seat. A reaction bounces him, or
  // tilts his head while he thinks.
  drawBody(ctx) {
    const o = this.frameOrigin();
    const seat = { x: o.x + CELL.w * S / 2, y: o.y + CELL.h * S };
    const still = this.reduced;
    const breath = still ? 0 : Math.sin(this.bobT * 2) * 0.012;
    let bounce = 0;
    let tilt = 0;
    if (this.reaction && !still) {
      const k = 1 - this.reaction.left / this.reaction.length;
      if (this.reaction.name === 'think') tilt = Math.sin(k * Math.PI) * 0.09;
      else bounce = Math.abs(Math.sin(k * Math.PI * 3)) * 0.05 * (1 - k);
    }
    ctx.save();
    ctx.translate(seat.x, seat.y);
    ctx.rotate(tilt);
    ctx.scale(1 - breath - bounce * 0.4, 1 + breath + bounce);
    ctx.translate(-seat.x, -seat.y);
    ctx.drawImage(assets.popoOperating, (this.frame % 2) * CELL.w, this.frame > 1 ? CELL.h : 0, CELL.w, CELL.h, o.x, o.y, CELL.w * S, CELL.h * S);
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

  // The pre-rendered stroke, crossfading the two frames either side of this moment. The two
  // frames are mixed on a scratch canvas first, so the crossfade never shows the raft through
  // the bear.
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
    const blend = this.rowBlend || (this.rowBlend = document.createElement('canvas'));
    if (blend.width !== c.width || blend.height !== c.height) { blend.width = c.width; blend.height = c.height; }
    const drawFigure = (img) => {
      const bg = blend.getContext('2d');
      bg.clearRect(0, 0, c.width, c.height);
      bg.globalCompositeOperation = 'lighter';
      for (const [f, alpha] of [[i, 1 - mix], [j, mix]]) {
        bg.globalAlpha = alpha;
        bg.drawImage(img, (f % c.columns) * c.width, Math.floor(f / c.columns) * c.height, c.width, c.height, 0, 0, c.width, c.height);
      }
      bg.globalAlpha = 1;
      bg.globalCompositeOperation = 'source-over';
      ctx.save();
      this.applyTransform(ctx);
      ctx.drawImage(blend, x, y, c.width * k, c.height * k);
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
    this.drawRaftProp(ctx, false);
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
