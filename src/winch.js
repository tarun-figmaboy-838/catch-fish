(function (PopoGame) {
'use strict';
const { assets } = PopoGame;

// Popo's fishing winch: the generated arched machine (assets/generated/winch-arched.png)
// drawn whole at one scale, in the raft's coordinates (measured from the raft anchor) so it
// rides the waves with the raft. It stands on the deck at the front of the raft; its rope
// runs up the mast and along the boom to the end pulley, and from there the net's lifting
// rope hangs. Popo's handwheel (his own sprite) sits on the drum's axle.

const TAU = Math.PI * 2;
// landmarks in image pixels: the end pulley's hub, and where the lifting rope drops off its rim
// (three o'clock, the painted rope's centreline 62 px out from the hub)
const IMAGE = { size: 1254, foot: [256, 1190], hub: [1158, 158], exit: [1220, 158], axle: [79, 930], coil: { x: 194, y: 932, rx: 61, ry: 72 } };
const S = 0.35;                        // image pixels to stage pixels, the same both ways
const FOOT = { x: 170, y: -38 };       // where the pedestal stands on the deck
const ROPE_REST = 47;                  // rope hanging below the pulley with nothing paid out
const TUCK = 38;                       // wound up between nets, the ring is drawn this far up
const ROPE_WIDTH = 6.5;                // the painted rope's thickness, so the drawn rope matches it
const DRUM_R = IMAGE.coil.ry * S;
// A dedicated generated braid, sampled between matching twist phases.
const ROPE_STRIP = { x: 530, y: 170, w: 190, h: 842 };
// The rope's run from the drum up the mast, round the arch and along the boom to the top of
// the end pulley, traced from the painting (image pixels). The painted rope can't move, so the
// braid is drawn over it along this line with its twists running as the rope pays out or winds
// in; the three collars that hold it are cut from the painting and laid back on top.
const ROPE_RUN = [[215,820],[224,796],[233,772],[237,748],[239,724],[244,700],[247,676],[251,652],[257,628],[258,585],[259,542],[259,514],[261,490],[262,466],[265,442],[266,418],[266,394],[273,370],[278,338],[284,304],[290,271],[297,235],[305,197],[322,175],[339,155],[361,139],[384,122],[411,109],[460,98],[491,97],[522,94],[550,93],[577,92],[599,93],[628,95],[652,96],[676,97],[700,99],[724,100],[748,101],[772,102],[796,102],[822,103],[852,105],[878,106],[903,108],[932,111],[956,111],[980,112],[1004,114],[1028,114],[1052,115],[1076,114],[1105,108],[1131,102],[1153,97],[1174,98]];
const COLLARS = [
  [[255, 280], [390, 294], [390, 353], [255, 328]], // high on the mast
  [[240, 540], [388, 549], [388, 606], [240, 592]], // low on the mast
  [[477, 69], [548, 69], [548, 199], [477, 199]],   // on the boom
];

function at([x, y]) {
  return { x: FOOT.x + (x - IMAGE.foot[0]) * S, y: FOOT.y + (y - IMAGE.foot[1]) * S };
}
const ORIGIN = at([0, 0]);
const HUB = at(IMAGE.hub);
const EXIT = at(IMAGE.exit);
const AXLE = at(IMAGE.axle);
const RUN = ROPE_RUN.map(at);
const WRAP_ANGLE = 75 * Math.PI / 180; // the drawn wrap round the pulley, from just under the painted rope's end
const WRAP_LENGTH = WRAP_ANGLE * Math.hypot(EXIT.x - HUB.x, EXIT.y - HUB.y);
let collarLayer = null; // the collars cut from the painting, made once

class Winch {
  constructor() {
    this.ropeOut = 0;  // rope paid out beyond the rest length: how far the net has dropped
    this.angle = 0;    // drum rotation, clockwise positive
    this.working = 0;  // 1 lowering, -1 raising, 0 still
  }

  // The end pulley's hub, where the lifting rope leaves its rim, where the ring hangs at rest,
  // and the axle Popo's wheel turns.
  get hub() {
    return HUB;
  }

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
    this.drawRun(ctx);
  }

  // The run of rope over the painting, moving with the rope: each piece's twists are set by how
  // much rope lies between it and the hanging rope, so they run on unbroken into the wrap
  // round the pulley and down to the ring. Then the collars go back over it.
  drawRun(ctx) {
    let toEnd = 0;
    for (let i = RUN.length - 1; i > 0; i -= 1) toEnd += Math.hypot(RUN[i].x - RUN[i - 1].x, RUN[i].y - RUN[i - 1].y);
    for (let i = 0; i < RUN.length - 1; i += 1) {
      drawRope(ctx, RUN[i], RUN[i + 1], ROPE_WIDTH, this.ropeOut + toEnd + WRAP_LENGTH);
      toEnd -= Math.hypot(RUN[i + 1].x - RUN[i].x, RUN[i + 1].y - RUN[i].y);
    }
    if (!collarLayer) {
      collarLayer = document.createElement('canvas');
      collarLayer.width = collarLayer.height = IMAGE.size;
      const g = collarLayer.getContext('2d');
      g.beginPath();
      for (const outline of COLLARS) {
        outline.forEach(([x, y], j) => (j ? g.lineTo(x, y) : g.moveTo(x, y)));
        g.closePath();
      }
      g.clip();
      g.drawImage(assets.winchPolished, 0, 0);
    }
    ctx.drawImage(collarLayer, ORIGIN.x, ORIGIN.y, IMAGE.size * S, IMAGE.size * S);
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

// The rope round the end pulley: the painted rope stops at about one o'clock on the rim, so the
// same braid carries on round it, in short overlapping runs, to three o'clock, where it drops
// straight down. `hub` and `exit` are on the stage (they turn with the raft); `phase` is the
// lifting rope's, so the twists run on unbroken.
function drawPulleyWrap(ctx, hub, exit, phase) {
  const radius = Math.hypot(exit.x - hub.x, exit.y - hub.y);
  const end = Math.atan2(exit.y - hub.y, exit.x - hub.x);
  const steps = 5;
  const point = (a) => ({ x: hub.x + Math.cos(a) * radius, y: hub.y + Math.sin(a) * radius });
  for (let i = 0; i < steps; i += 1) {
    const a0 = end - WRAP_ANGLE * (1 - i / steps);
    const a1 = end - WRAP_ANGLE * (1 - (i + 1) / steps);
    drawRope(ctx, point(a0), point(a1), ROPE_WIDTH, phase + WRAP_ANGLE * radius * (1 - i / steps));
  }
}

// The lifting ring the net hangs from: the generated brass connector, drawn whole, with the top
// of its socket at y. Its socket is a little wider than the lifting rope, so the rope's end
// disappears into it. The sling's legs come up behind the ring and meet behind its bottom
// bar, at RING_KNOT, where two turns of rope lash them to it (see Net.drawAll).
const CONNECTOR = { w: 1024, h: 1536, socketTop: 156, ringBottom: 1367 }; // image pixels
const RING_DEPTH = 40;  // socket top to ring bottom, drawn
const RING_KNOT = 37;
const RING_BAR = { top: 34, bottom: 40 }; // the ring's bottom bar, below y
function drawRing(ctx, x, y) {
  const k = RING_DEPTH / (CONNECTOR.ringBottom - CONNECTOR.socketTop);
  ctx.drawImage(assets.ropeConnector, x - (CONNECTOR.w * k) / 2, y - CONNECTOR.socketTop * k, CONNECTOR.w * k, CONNECTOR.h * k);
}

Object.assign(PopoGame, { Winch, drawRope, drawPulleyWrap, drawRing, ROPE_WIDTH, RING_KNOT, RING_BAR, TUCK });
})(window.PopoGame = window.PopoGame || {});
