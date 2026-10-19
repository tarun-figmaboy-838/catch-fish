(function (PopoGame) {
'use strict';
const { assets } = PopoGame;

// Popo's fishing winch: the generated wooden machine (assets/generated/winch.png) drawn
// whole, in the raft's coordinates (measured from the raft anchor) so it rides the waves with
// the raft. It stands on the deck at the front of the raft; its rope runs along the boom to
// the end pulley, and from there the net's lifting rope hangs. Two painted parts are left
// out: the short crank handle, replaced by a long crank arm from the drum's axle into Popo's
// paws (he pumps it, and the drum's coil scrolls as rope pays out), and the hanging rope,
// which the net draws so it can pay out.

const TAU = Math.PI * 2;
// landmarks in image pixels
const IMAGE = {
  size: 1254, foot: [335, 1222], pulley: [1178, 92], exit: [1217, 148],
  coil: { x: 262, y: 928, rx: 58, ry: 65 }, armRoot: [195, 905],
  handle: [[20, 975], [125, 975], [185, 890], [210, 900], [160, 1040], [20, 1045]],
  hangingRope: [1195, 148, 1245, 730],
};
const S = 0.34;                              // image pixels to stage pixels
const FOOT = { x: 185, y: -58 };             // where the pedestal stands on the deck
const ROPE_REST = 50;                        // rope hanging below the pulley with nothing paid out
const DRUM_R = IMAGE.coil.ry * S;

// An image point in raft coordinates.
function at([x, y]) {
  return { x: FOOT.x + (x - IMAGE.foot[0]) * S, y: FOOT.y + (y - IMAGE.foot[1]) * S };
}
const ORIGIN = at([0, 0]);
const EXIT = at(IMAGE.exit);

class Winch {
  constructor() {
    this.ropeOut = 0;  // rope paid out beyond the rest length: how far the net has dropped
    this.angle = 0;    // drum rotation, clockwise positive
    this.working = 0;  // 1 lowering, -1 raising, 0 still (Popo leans on the lever accordingly)
  }

  // Where the lifting rope leaves the pulley, and where the ring hangs at rest.
  get exit() {
    return EXIT;
  }

  get hang() {
    return { x: EXIT.x, y: EXIT.y + ROPE_REST };
  }

  // The drum turns exactly as much as the rope it pays out or takes in.
  setRopeOut(length) {
    this.angle += (length - this.ropeOut) / DRUM_R;
    this.ropeOut = length;
  }

  // How far Popo's paws ride up and down on the arm: one pump per turn of the drum.
  pump() {
    return this.working ? Math.sin(this.angle) * 8 : 0;
  }

  // The crank arm, from the drum's axle to Popo's paws (a raft point). Drawn before Popo, so
  // the arm runs into his paws and the handle sits in them.
  drawArm(ctx, grip) {
    const root = at(IMAGE.armRoot);
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineWidth = 9;
    ctx.strokeStyle = '#6b4a14';
    ctx.beginPath();
    ctx.moveTo(root.x, root.y);
    ctx.lineTo(grip.x, grip.y);
    ctx.stroke();
    ctx.lineWidth = 5;
    ctx.strokeStyle = '#e2b85c';
    ctx.stroke();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(255, 250, 220, 0.7)';
    ctx.beginPath();
    ctx.moveTo(root.x, root.y - 1.5);
    ctx.lineTo(grip.x, grip.y - 1.5);
    ctx.stroke();
    // the handle: a dark grip across the end of the arm
    ctx.lineWidth = 12;
    ctx.strokeStyle = '#2b3138';
    ctx.beginPath();
    ctx.moveTo(grip.x + 2, grip.y - 12);
    ctx.lineTo(grip.x - 6, grip.y + 12);
    ctx.stroke();
    ctx.lineWidth = 6;
    ctx.strokeStyle = '#4b535c';
    ctx.stroke();
    ctx.restore();
  }

  // The machine with its painted handle and hanging rope left out, and the turning coil.
  draw(ctx) {
    const size = IMAGE.size * S;
    const [rx0, ry0, rx1, ry1] = IMAGE.hangingRope;
    ctx.save();
    ctx.beginPath();
    ctx.rect(ORIGIN.x, ORIGIN.y, size, size);
    IMAGE.handle.forEach((p, i) => {
      const q = at(p);
      if (i) ctx.lineTo(q.x, q.y); else ctx.moveTo(q.x, q.y);
    });
    ctx.closePath();
    ctx.rect(ORIGIN.x + rx0 * S, ORIGIN.y + ry0 * S, (rx1 - rx0) * S, (ry1 - ry0) * S);
    ctx.clip('evenodd');
    ctx.drawImage(assets.winchPolished, ORIGIN.x, ORIGIN.y, size, size);
    ctx.restore();
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

// The lifting ring the net hangs from, registered on its shackle (where the rope ends): brass
// to match the machine.
const RING_DEPTH = 26;
function drawRing(ctx, x, y) {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineWidth = 7;
  ctx.strokeStyle = '#5a3a14';
  ctx.beginPath();
  ctx.ellipse(x, y + 14, 10, 12, 0, 0, TAU);
  ctx.stroke();
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#e2b85c';
  ctx.stroke();
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
  ctx.beginPath();
  ctx.ellipse(x, y + 14, 11, 13, 0, Math.PI * 1.15, Math.PI * 1.6);
  ctx.stroke();
  ctx.restore();
}

Object.assign(PopoGame, { Winch, drawRing, RING_DEPTH });
})(window.PopoGame = window.PopoGame || {});
