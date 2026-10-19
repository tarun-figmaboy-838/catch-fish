(function (PopoGame) {
'use strict';
const { assets } = PopoGame;

// Popo's fishing winch: the generated arched machine (assets/generated/winch-arched.png)
// drawn whole at one scale, in the raft's coordinates (measured from the raft anchor) so it
// rides the waves with the raft. It stands on the deck at the front of the raft; its rope
// runs up the mast and along the boom to the end pulley, and from there the net's lifting
// rope hangs. Popo's handwheel (his own sprite) sits on the drum's axle.

const TAU = Math.PI * 2;
// landmarks in image pixels
const IMAGE = { size: 1254, foot: [256, 1190], exit: [1205, 190], axle: [79, 930], coil: { x: 194, y: 932, rx: 61, ry: 72 } };
const S = 0.35;                        // image pixels to stage pixels, the same both ways
const FOOT = { x: 170, y: -38 };       // where the pedestal stands on the deck
const ROPE_REST = 36;                  // rope hanging below the pulley with nothing paid out
const TUCK = 30;                       // wound up between nets, the ring is drawn this far up
const DRUM_R = IMAGE.coil.ry * S;
// A dedicated generated braid, sampled between matching twist phases.
const ROPE_STRIP = { x: 530, y: 170, w: 190, h: 842 };

function at([x, y]) {
  return { x: FOOT.x + (x - IMAGE.foot[0]) * S, y: FOOT.y + (y - IMAGE.foot[1]) * S };
}
const ORIGIN = at([0, 0]);
const EXIT = at(IMAGE.exit);
const AXLE = at(IMAGE.axle);

class Winch {
  constructor() {
    this.ropeOut = 0;  // rope paid out beyond the rest length: how far the net has dropped
    this.angle = 0;    // drum rotation, clockwise positive
    this.working = 0;  // 1 lowering, -1 raising, 0 still
  }

  // Where the lifting rope leaves the pulley, where the ring hangs at rest, and the axle
  // Popo's wheel turns.
  get exit() {
    return EXIT;
  }

  get hang() {
    return { x: EXIT.x, y: EXIT.y + ROPE_REST };
  }

  get axle() {
    return AXLE;
  }

  // The drum turns exactly as much as the rope it pays out or takes in.
  setRopeOut(length) {
    this.angle += (length - this.ropeOut) / DRUM_R;
    this.ropeOut = length;
  }

  // Gathering the net into a bundle (or opening it) takes in (or pays out) rope beyond the
  // ring's own travel: the drum, and Popo's wheel with it, turns for that rope too.
  turn(length) {
    this.angle += length / DRUM_R;
  }

  draw(ctx) {
    ctx.drawImage(assets.winchPolished, ORIGIN.x, ORIGIN.y, IMAGE.size * S, IMAGE.size * S);
    this.drawCoil(ctx);
  }

  // Light bands slide across the coil as the drum turns.
  drawCoil(ctx) {
    const c = at([IMAGE.coil.x, IMAGE.coil.y]);
    const rx = IMAGE.coil.rx * S;
    const ry = IMAGE.coil.ry * S;
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(c.x, c.y, rx, ry, 0, 0, TAU);
    ctx.clip();
    ctx.globalAlpha = 0.25;
    ctx.lineWidth = 1.8;
    ctx.strokeStyle = '#fff4d6';
    const spacing = 5;
    const shift = ((-this.angle * DRUM_R) % spacing + spacing) % spacing;
    ctx.beginPath();
    for (let y = c.y - ry - spacing + shift; y < c.y + ry + spacing; y += spacing) {
      ctx.moveTo(c.x - rx, y + 1.5);
      ctx.lineTo(c.x + rx, y - 1.5);
    }
    ctx.stroke();
    ctx.restore();
  }
}

// The generated braid from `from` to `to`, at a constant thickness. Its matched repeat
// `phase` slides the twists so rope visibly pays out and winds in.
function drawRope(ctx, from, to, width, phase = 0) {
  const len = Math.hypot(to.x - from.x, to.y - from.y);
  if (len < 1) return;
  const s = ROPE_STRIP;
  const tile = s.h * (width / 164);
  const paintedWidth = s.w * (width / 164);
  ctx.save();
  ctx.translate(from.x, from.y);
  ctx.rotate(Math.atan2(to.y - from.y, to.x - from.x) - Math.PI / 2);
  ctx.beginPath();
  ctx.rect(-paintedWidth / 2, -1, paintedWidth, len + 2);
  ctx.clip();
  const start = ((phase % tile) + tile) % tile - tile;
  for (let y = start; y < len; y += tile) ctx.drawImage(assets.rope, s.x, s.y, s.w, s.h, -paintedWidth / 2, y, paintedWidth, tile + 0.35);
  ctx.restore();
}

// The lifting ring the net hangs from: the generated brass connector, drawn whole, with the top
// of its socket at y. Its socket is a little wider than the lifting rope, so the rope's end
// disappears into it. The sling's legs come up behind the ring and meet behind its bottom
// bar, at RING_KNOT, where two turns of rope lash them to it (see Net.drawAll).
const CONNECTOR = { w: 1024, h: 1536, socketTop: 156, ringBottom: 1367 }; // image pixels
const RING_DEPTH = 46;  // socket top to ring bottom, drawn
const RING_KNOT = 42;
const RING_BAR = { top: 39, bottom: 46 }; // the ring's bottom bar, below y
function drawRing(ctx, x, y) {
  const k = RING_DEPTH / (CONNECTOR.ringBottom - CONNECTOR.socketTop);
  ctx.drawImage(assets.ropeConnector, x - (CONNECTOR.w * k) / 2, y - CONNECTOR.socketTop * k, CONNECTOR.w * k, CONNECTOR.h * k);
}

Object.assign(PopoGame, { Winch, drawRope, drawRing, RING_KNOT, RING_BAR, TUCK });
})(window.PopoGame = window.PopoGame || {});
