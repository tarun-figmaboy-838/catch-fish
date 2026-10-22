(function (PopoGame) {
'use strict';
const { geo, drawRope, drawPulleyWrap, drawRing, ROPE_WIDTH, RING_KNOT, RING_BAR } = PopoGame;
const { sub, add, times, dot, length, distance, midpoint, lerp, normalize, parallel, angleAt, intersection, isValidQuad, insideConvex, rotate } = geo;

// The fishing net: a rope frame of four corners A, B, C, D (top-left, clockwise) hung from one
// lifting ring, with a mesh inside. Three corners are fixed and the child drags the fourth
// until the frame has the property the level asks for. Positions are in net coordinates,
// measured from the ring, so lowering the net or the raft bobbing never changes the shape;
// the whole stage scales to the screen, so metres and degrees stay the same everywhere.

const TAU = Math.PI * 2;
const CORNERS = 'ABCD';
const corner = (letter) => CORNERS.indexOf(letter);
const side = (name) => [corner(name[0]), corner(name[1])];
// The corner the child moves never stretches freely: it slides along a track (see setLevel)
// and clicks from stop to stop, STOP stage pixels apart. One stop is its exact place, so the
// frame is right exactly there, and only there do the numbers on the net match.
const STOP = 20;
const TRACK_STOPS = 12; // at most this many stops each way from its place
// a hair of rounding for "exactly": a stop either has the property or misses it by a step
const EXACT = { parallel: 1e-3, metres: 0.01, degrees: 0.1 };
const tenths = (m) => Math.round(m * 10) / 10;
// The loaded bag hangs below the open frame by this much, keeping the hauled catch
// clear of the water. Its mouth and toe gather around a broad rounded belly.
const POUCH = { depth: 0.3, most: 45 };
const NECK = 0.012; // above this (a share down the net) the floats fold away as the bag closes
const TOE = 1.01;   // and below this the weights

// The closed bag's half-width down its length (t from mouth to toe), as a share of the net's
// width: a potli. A short neck gathered narrow enough to go up into the ring's bottom bar, round
// shoulders that fill out quickly below it, the full loaded belly and a rounded bottom.
const BAG_NECK = 0.06; // the gathered neck's length, as a share of the bag's
function bagRadius(t) {
  const s = Math.max(0, (t - BAG_NECK) / (1 - BAG_NECK));
  return 0.02 + 0.33 * Math.sin(Math.PI * s ** 0.75) ** 0.6;
}
const GLOW = '#8ff7a8';
// Wound up, the net gathers under its ring: a tenth as wide and under half as long, hanging
// from the knot where the sling meets.
const GATHER = { x: 0.9, y: 0.55 };
const KNOT = RING_KNOT;
// the outline of a torn hole, as shares of its full size, all the way round
const RAGGED = [1, 0.62, 0.9, 0.7, 1, 0.58, 0.86, 0.66, 0.97, 0.6, 0.92, 0.72, 1, 0.64, 0.84, 0.7];
const INK = 'rgba(12, 40, 70, 0.9)';
const FONT = (px) => `700 ${px}px Fredoka, "Arial Rounded MT Bold", sans-serif`;

// A level's solved parallelogram with its top edge at y 0: width, height and either the lean
// (how far the top edge sits right of the bottom) or the angle at A, optionally turned.
function parallelogram(level) {
  const lean = level.angleA ? -level.height / Math.tan(level.angleA * Math.PI / 180) : level.lean;
  const w = level.width / 2;
  const l = lean / 2;
  const h = level.height;
  const points = [{ x: -w + l, y: 0 }, { x: w + l, y: 0 }, { x: w - l, y: h }, { x: -w - l, y: h }];
  return level.rotate ? rotate(points, level.rotate, { x: 0, y: h / 2 }) : points;
}

class Net {
  constructor() {
    this.origin = { x: 0, y: 0 }; // where the ring hangs at rest, on the stage
    this.drop = 0;                 // how far the winch has lowered it
    this.swing = 0;                // pendulum angle about the ring (rowing, settling)
    this.level = null;
    this.points = [{ x: -220, y: 110 }, { x: 220, y: 110 }, { x: 220, y: 310 }, { x: -220, y: 310 }];
    this.solved = this.points.map((p) => ({ ...p }));
    this.start = this.points.map((p) => ({ ...p }));
    this.movable = 1;
    this.target = { ...this.points[1] };
    this.nearby = 44;     // how close to its place counts as near it (see check)
    this.along = null;
    this.scale = 70;      // stage pixels per metre shown
    this.locked = true;
    this.visible = false;
    this.alpha = 1;
    this.time = 0;
    this.wobble = 0;      // a shake of the corner after a wrong check
    this.flash = 0;       // the frame lights up when the shape comes right
    this.glow = null;     // the property highlight: steps played one after another
    this.hintPulse = 0;   // the measurements swell for a moment as a hint
    this.touched = false; // the child has moved the corner this level
    this.textScale = 1;   // labels grow on small screens so they stay readable (see Game.resize)
    this.ropePhase = 0;   // rope twists slide as rope pays out
    this.furl = 0;        // 0 open, 1 wound up into a bundle under the ring (between nets)
    this.pouch = 0;       // 0 open, 1 closed into a bag around its catch
    this.track = { min: 0, max: 0 }; // the stops the corner can reach, counted from its place
    this.stopAt = 0;      // the stop it is at
    this.drawn = null;    // where the corner is drawn while it glides onto its new stop
    this.arrowGap = 70;   // how far the slide arrows sit from the knob (Game.resize fits it)
    this.sharpRes = 2;    // texture pixels per stage pixel once the shape holds still (Game.resize)
    this.textureRes = 0;
    this.tear = 0;        // 0 whole, 1 torn open by a catch a wrong net couldn't hold
    this.burst = null;    // bits of mesh flying off as it tears: { t } seconds
    this.reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  // bottom: the deepest net-coordinate the frame may reach (just above the water); clear: the
  // net-coordinate x range the corner must keep inside (off the raft, on the stage).
  setLevel(level, bottom, clear = {}) {
    const shape = parallelogram(level);
    const lowest = Math.max(...shape.map((p) => p.y));
    this.level = level;
    this.solved = shape.map((p) => ({ x: p.x, y: p.y - lowest + bottom }));
    this.movable = corner(level.corner);
    this.target = this.solved[this.movable];
    // the track runs through the corner's place along the side or diagonal the level names
    const [i, j] = side(level.along);
    this.along = { base: this.target, dir: normalize(sub(this.solved[j], this.solved[i])) };
    const [name, metres] = Object.entries(level.metres || { AB: 6 })[0];
    this.scale = length(this.sideOf(name, this.solved)) / metres;
    this.nearby = Math.min(level.width, level.height) * 0.22;
    this.locked = false;
    this.touched = false;
    this.flash = 0;
    this.glow = null;
    this.pouch = 0;
    this.drawn = null;
    const xs = this.solved.map((p) => p.x);
    const ys = this.solved.map((p) => p.y);
    // the corner stays near the frame, out of the water, clear of the ring, the raft and the edge
    this.limits = {
      left: Math.max(Math.min(...xs) - level.width * 0.4, clear.left ?? -Infinity),
      right: Math.min(Math.max(...xs) + level.width * 0.4, clear.right ?? Infinity),
      top: Math.max(24, Math.min(...ys) - level.height * 0.55), bottom: bottom + 40,
    };
    // the stops it can reach: on from its place each way while the frame stays a simple, roomy
    // quadrilateral inside the limits
    this.points = this.solved.map((p) => ({ ...p }));
    const reach = (step) => {
      let k = 0;
      while (Math.abs(k) < TRACK_STOPS && this.fits(this.stop(k + step))) k += step;
      return k;
    };
    this.track = { min: reach(-1), max: reach(1) };
    this.stopAt = Math.max(this.track.min, Math.min(this.track.max, level.start));
    this.points[this.movable] = this.stop(this.stopAt);
    this.start = this.points.map((p) => ({ ...p }));
  }

  // The point `k` stops from the corner's place along its track.
  stop(k) {
    return add(this.along.base, times(this.along.dir, k * STOP));
  }

  fits(p) {
    const l = this.limits;
    if (p.x < l.left || p.x > l.right || p.y < l.top || p.y > l.bottom) return false;
    return isValidQuad(this.points.map((q, i) => (i === this.movable ? p : q)));
  }

  ring() {
    return { x: this.origin.x, y: this.origin.y + this.drop };
  }

  toStage(p) {
    const r = this.ring();
    const q = this.furl ? this.gathered(p) : p;
    if (!this.swing) return { x: r.x + q.x, y: r.y + q.y };
    const c = Math.cos(this.swing);
    const s = Math.sin(this.swing);
    return { x: r.x + q.x * c - q.y * s, y: r.y + q.x * s + q.y * c };
  }

  // Where a point of the frame is drawn as the net winds up. Only the drawing gathers: the
  // frame keeps its shape, and the net is never wound up while catching, so toNet ignores it.
  gathered(p) {
    return { x: p.x * (1 - GATHER.x * this.furl), y: KNOT + (p.y - KNOT) * (1 - GATHER.y * this.furl) };
  }

  // --- the mesh and the bag ------------------------------------------------------------
  // The frame as drawn: the moving corner where it is gliding, the rest where they are.
  framed() {
    const p = this.points.map((q) => ({ ...q }));
    if (this.drawn) p[this.movable] = { ...this.drawn };
    return p;
  }

  // A point of the mesh by its place in the frame (u across from AD to BC, v down from AB to
  // DC; outside 0 to 1 for the floats and weights beyond the rope), in net coordinates.
  // The whole sheet folds into a cinched, rounded pouch as the lifting rope tightens.
  meshPoint(u, v, p = this.framed()) {
    const [a, b, c, d] = p;
    const q = lerp(lerp(a, b, u), lerp(d, c, u), v);
    if (!this.pouch) return q;
    // The mouth drawn up into the ring's bottom bar (net 0, KNOT), the broad loaded belly and
    // rounded toe below it, hanging plumb from the ring whichever way the open frame leaned,
    // as deep as the open net and its sag. The same surface carries texture, eyelets and fish,
    // so nothing detaches when the flat net becomes a pouch.
    const t = Math.max(0, Math.min(1, v));
    const width = (distance(a, b) + distance(d, c)) / 2;
    const depth = Math.max(c.y, d.y) + this.sagDepth(p) - midpoint(a, b).y;
    const radius = width * bagRadius(t);
    const across = 2 * u - 1;
    const bag = {
      x: across * radius,
      y: KNOT + depth * v + 14 * (1 - across * across) * Math.sin(Math.PI * t),
    };
    return lerp(q, bag, this.pouch);
  }

  // How far the closed bag's belly hangs below the frame's bottom edge.
  sagDepth(p = this.points) {
    const h = distance(midpoint(p[0], p[1]), midpoint(p[3], p[2]));
    return Math.min(POUCH.most, h * POUCH.depth);
  }

  // A net point's place in the open frame (the inverse of meshPoint with no bag), found by a
  // few steps of Newton's method; a netted fish keeps it, so it rides down into the bag.
  uvOf(point) {
    const [a, b, c, d] = this.points;
    let u = 0.5;
    let v = 0.5;
    for (let n = 0; n < 8; n += 1) {
      const e = sub(point, lerp(lerp(a, b, u), lerp(d, c, u), v));
      const du = sub(lerp(b, c, v), lerp(a, d, v));
      const dv = sub(lerp(d, c, u), lerp(a, b, u));
      const det = du.x * dv.y - du.y * dv.x;
      if (!det) break;
      u += (e.x * dv.y - e.y * dv.x) / det;
      v += (du.x * e.y - du.y * e.x) / det;
    }
    return { u, v };
  }

  // Where a netted fish hangs: as the net closes it slides down into the belly with the others.
  catchPoint({ u, v }) {
    const k = this.pouch;
    return this.meshPoint(0.5 + (u - 0.5) * (1 - 0.42 * k), v + (0.52 + 0.23 * v - v) * k);
  }

  // The hole the catch tears: low in the mesh (in the bag's belly, once closed; the frame
  // holds), growing with the tear.
  tearHole() {
    const [a, b, c, d] = this.points;
    const centre = this.meshPoint(0.5, this.pouch ? 0.85 : 0.75);
    const rx = distance(midpoint(a, d), midpoint(b, c)) * 0.34 * (1 - 0.3 * this.pouch) * this.tear;
    const ry = distance(midpoint(a, b), midpoint(d, c)) * 0.3 * this.tear;
    const outline = RAGGED.map((k, i) => {
      const t = (i / RAGGED.length) * TAU;
      return { x: centre.x + Math.cos(t) * rx * k, y: centre.y + Math.sin(t) * ry * k };
    });
    return { centre, outline };
  }

  toNet(p) {
    const r = this.ring();
    const x = p.x - r.x;
    const y = p.y - r.y;
    if (!this.swing) return { x, y };
    const c = Math.cos(-this.swing);
    const s = Math.sin(-this.swing);
    return { x: x * c - y * s, y: x * s + y * c };
  }

  handle() {
    return this.toStage(this.points[this.movable]);
  }

  distance() {
    return distance(this.points[this.movable], this.target);
  }

  // The net's lowest point: its frame's lower corner, or the bottom of the bag hanging from
  // the ring.
  bottom() {
    const open = Math.max(...this.points.map((p) => p.y));
    if (!this.pouch) return open;
    const bag = KNOT + open + this.sagDepth() - (this.points[0].y + this.points[1].y) / 2;
    return open + (bag - open) * this.pouch;
  }

  // The net's footprint everything in it must share: between the inner ends of its slanted
  // sides and below the lower of its top corners down to the higher of its bottom corners,
  // so a fish there is inside the frame whichever way it leans or tilts.
  innerSpan() {
    const [a, b, c, d] = this.solved;
    return { left: Math.max(a.x, d.x), right: Math.min(b.x, c.x), top: Math.max(a.y, b.y), bottom: Math.min(c.y, d.y) };
  }

  contains(stagePoint) {
    return insideConvex(this.toNet(stagePoint), this.points);
  }

  // Moves the corner to the stop on its track nearest a wanted net point. Every stop is alike,
  // so nothing pulls it toward its place; it glides onto the new stop rather than jumping.
  // Returns whether it moved.
  moveHandle(want) {
    return this.toStop(Math.round(dot(sub(want, this.along.base), this.along.dir) / STOP));
  }

  // One stop on (or back) along the track: the arrow keys.
  stepHandle(steps) {
    return this.toStop(this.stopAt + steps);
  }

  toStop(k) {
    const stop = Math.max(this.track.min, Math.min(this.track.max, k));
    if (stop === this.stopAt) return false;
    this.drawn = this.cornerDrawn();
    this.stopAt = stop;
    this.points[this.movable] = this.stop(stop);
    this.touched = true;
    return true;
  }

  // Where the moving corner is drawn: gliding onto its stop, or on it.
  cornerDrawn() {
    return this.drawn ? { ...this.drawn } : { ...this.points[this.movable] };
  }

  setHandle(p) {
    this.points[this.movable] = { x: p.x, y: p.y };
    this.drawn = null;
  }

  // The frame as its solved parallelogram, held still.
  showSolved() {
    this.points = this.solved.map((p) => ({ ...p }));
    this.locked = true;
  }

  solve(at) {
    this.setHandle(at);
    this.locked = true;
    this.flash = 1;
  }

  // --- measurements ------------------------------------------------------------
  sideOf(name, points = this.points) {
    const [i, j] = side(name);
    return sub(points[j], points[i]);
  }

  metres(name) {
    return length(this.sideOf(name)) / this.scale;
  }

  angle(letter) {
    const i = corner(letter);
    return angleAt(this.points[(i + 3) % 4], this.points[i], this.points[(i + 1) % 4]);
  }

  // Where the diagonals cross and the four half-diagonals in metres.
  halves() {
    const [a, b, c, d] = this.points;
    const o = intersection(a, c, b, d) || midpoint(a, c);
    return { o, AO: distance(a, o) / this.scale, OC: distance(o, c) / this.scale, BO: distance(b, o) / this.scale, OD: distance(o, d) / this.scale };
  }

  // --- what the labels show: tenths of a metre and whole degrees ---------------------
  metresShown(name) {
    return tenths(this.metres(name));
  }

  degreesShown(letter) {
    return Math.round(this.angle(letter));
  }

  // A side's slope: how many degrees it rises from level, left to right (falling is negative),
  // whole degrees from -89 to 90. Two sides are parallel exactly when their slopes match.
  slopeShown(name) {
    const v = this.sideOf(name);
    let a = Math.atan2(-v.y, v.x) * 180 / Math.PI;
    while (a > 90) a -= 180;
    while (a <= -90) a += 180;
    return Math.round(a) || 0;
  }

  halvesShown() {
    const h = this.halves();
    return { AO: tenths(h.AO), OC: tenths(h.OC), BO: tenths(h.BO), OD: tenths(h.OD) };
  }

  pairParallel(sides) {
    return parallel(this.sideOf(sides[0]), this.sideOf(sides[1]), EXACT.parallel);
  }

  // Whether the frame has the level's property. The track's stops make it exact: the one stop
  // that is the corner's place has it, every other stop misses by at least a step the labels
  // show (tests/geometry.py checks every stop), so the numbers on the net match exactly when
  // Drop Net will say the frame is right. `snap` is where it locks: that same place.
  check() {
    const L = this.level;
    if (!isValidQuad(this.points)) return { ok: false };
    const near = (a, b, tol) => Math.abs(a - b) <= tol;
    let ok;
    switch (L.type) {
      case 'parallel': ok = this.pairParallel(L.sides); break;
      case 'length': ok = near(this.metres(L.side), L.metres[L.reference], EXACT.metres); break;
      case 'sides': ok = near(this.metres('CD'), L.metres.AB, EXACT.metres) && near(this.metres('BC'), this.metres('AD'), EXACT.metres); break;
      case 'angle': ok = near(this.angle(L.vertex), L.degrees, EXACT.degrees); break;
      case 'supplementary': ok = near(L.degrees + this.angle(L.vertex), 180, EXACT.degrees); break;
      case 'diagonals': { const h = this.halves(); ok = near(h.AO, h.OC, EXACT.metres) && near(h.BO, h.OD, EXACT.metres); break; }
      default: ok = near(this.metres('AB'), this.metres('CD'), EXACT.metres) && near(this.metres('BC'), this.metres('AD'), EXACT.metres);
    }
    return { ok, snap: this.target };
  }

  // What lights up after a correct check, step by step.
  glowFor(level) {
    const both = [{ sides: ['AB', 'CD'] }, { sides: ['BC', 'AD'] }];
    switch (level.type) {
      case 'parallel': return level.sides[0] === 'AB' ? [{ sides: level.sides }] : both;
      case 'length': return [{ sides: [level.reference, level.side] }];
      case 'sides': return both;
      case 'angle': case 'supplementary': return [{ angles: [level.reference, level.vertex] }];
      case 'diagonals': return [{ halves: 'AC' }, { halves: 'BD' }];
      default: return [...both, { angles: ['A', 'C'] }, { diagonals: true }];
    }
  }

  showGlow(steps, each = 0.8) {
    this.glow = { steps, each, t: 0 };
  }

  glowLength(level) {
    return this.glowFor(level).length * (level.type === 'parallelogram' ? 0.5 : 0.8);
  }

  update(dt) {
    this.time += dt;
    if (this.wobble > 0) this.wobble = Math.max(0, this.wobble - dt / 0.45);
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt / 0.7);
    if (this.hintPulse > 0) this.hintPulse = Math.max(0, this.hintPulse - dt);
    if (this.glow && (this.glow.t += dt) >= this.glow.steps.length * this.glow.each) this.glow = null;
    if (this.burst && (this.burst.t += dt) > 0.7) this.burst = null;
    // the moving corner glides onto its stop in a few frames: a quick click, not a jump
    if (this.drawn) {
      const p = this.points[this.movable];
      this.drawn = this.reduced ? null : lerp(this.drawn, p, Math.min(1, dt * 30));
      if (this.drawn && distance(this.drawn, p) < 0.3) this.drawn = null;
    }
  }

  // --- drawing --------------------------------------------------------------------
  draw(ctx, { waterline, pulley }) {
    if (!this.visible) return;
    const r = this.ring();
    const reach = Math.max(...this.points.map((p) => length(p))) + 80 + this.sagDepth() * this.pouch;
    const top = Math.min(pulley.hub.y - 30, r.y - reach);
    const bottom = r.y + reach;
    if (bottom < waterline) {
      this.drawAll(ctx, r, pulley, false);
    } else if (top > waterline) {
      this.drawAll(ctx, r, pulley, true);
    } else {
      // across the surface: the dry part above the waterline, the wet part below it
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, top - 10, PopoGame.STAGE_W, waterline - top + 10);
      ctx.clip();
      this.drawAll(ctx, r, pulley, false);
      ctx.restore();
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, waterline, PopoGame.STAGE_W, bottom - waterline + 10);
      ctx.clip();
      this.drawAll(ctx, r, pulley, true);
      ctx.restore();
    }
  }

  drawAll(ctx, ring, pulley, wet) {
    const frame = this.framed();
    const corners = [[0, 0], [1, 0], [1, 1], [0, 1]].map(([u, v]) => this.toStage(this.meshPoint(u, v, frame)));
    const showing = !this.furl && (!this.locked || this.glow);
    ctx.save();
    ctx.globalAlpha = this.alpha * (wet ? 0.9 : 1);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (wet) ctx.filter = 'saturate(0.6) brightness(0.85)';
    // the lifting rope comes round the boom's end pulley and drops into the ring's socket; the
    // sling that carries the whole frame comes up from the top corners behind the ring and is
    // lashed to its bottom bar with two turns, which hide the legs' ends. The machine's painted
    // rope, tiled.
    drawPulleyWrap(ctx, pulley.hub, pulley.exit, this.ropePhase);
    drawRope(ctx, pulley.exit, { x: ring.x, y: ring.y + 6 }, ROPE_WIDTH, this.ropePhase);
    // the sling's legs come down to the top corners; closing into a bag, the mouth rises into
    // the ring and they shorten away to nothing
    const knot = { x: ring.x, y: ring.y + KNOT };
    drawRope(ctx, knot, corners[0], 5);
    drawRope(ctx, knot, corners[1], 5);
    ctx.filter = 'none';

    this.drawBagVolume(ctx, frame, wet);
    this.drawGenerated(ctx, wet, frame);
    // the ring over the mesh, so a closed bag's gathered mouth goes up into it and hangs from
    // its bar (an open net hangs well below it)
    if (wet) ctx.filter = 'saturate(0.6) brightness(0.85)';
    drawRing(ctx, ring.x, ring.y);
    // the turns stay on the bar, so their ends look tucked round behind it
    ctx.save();
    ctx.beginPath();
    ctx.rect(ring.x - 12, ring.y + RING_BAR.top, 24, RING_BAR.bottom - RING_BAR.top);
    ctx.clip();
    for (const dx of [-3, 3]) {
      drawRope(ctx, { x: ring.x + dx - 1.5, y: ring.y + RING_BAR.top - 2 }, { x: ring.x + dx + 1.5, y: ring.y + RING_BAR.bottom + 2 }, 4.5);
    }
    ctx.restore();
    ctx.filter = 'none';
    if (!this.locked && !this.furl) this.drawArrows(ctx, corners[this.movable]);
    if (this.flash > 0) {
      ctx.save();
      ctx.globalAlpha *= this.flash * 0.7;
      ctx.lineWidth = 26;
      ctx.strokeStyle = '#fff1b0';
      this.framePath(ctx, corners);
      ctx.stroke();
      ctx.restore();
    }
    if (showing) this.drawMeasurements(ctx, corners);
    if (this.glow) this.drawGlow(ctx, corners);
    if (this.furl < 1) {
      // the eyelets fold away into the bundle as the net winds up
      ctx.save();
      ctx.globalAlpha *= (1 - this.furl) * (1 - this.pouch);
      this.drawCorners(ctx, corners, wet);
      ctx.restore();
    }
    if (showing) this.drawLabels(ctx, corners);
    ctx.restore();
  }

  // Transparent depth over the catch, beneath the front mesh. Curved folds and a
  // bound neck give the bag volume without an opaque sticker hiding the fish.
  drawBagVolume(ctx, frame, wet) {
    if (this.pouch <= 0) return;
    ctx.save();
    ctx.globalAlpha *= this.pouch * (1 - this.furl);
    const point = (u, v) => this.toStage(this.meshPoint(u, v, frame));
    // from below the folded-away floats down
    const below = (k) => NECK + (1 - NECK) * k;
    ctx.beginPath();
    for (let i = 0; i <= 32; i += 1) {
      const q = point(0, below(i / 32));
      if (!i) ctx.moveTo(q.x, q.y); else ctx.lineTo(q.x, q.y);
    }
    for (let i = 32; i >= 0; i -= 1) {
      const q = point(1, below(i / 32));
      ctx.lineTo(q.x, q.y);
    }
    ctx.closePath();
    // Keep the tear visibly open through every layer.
    if (this.tear) {
      this.tearHole().outline.forEach((q, i) => {
        const p = this.toStage(q);
        if (i) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y);
      });
      ctx.closePath();
    }
    ctx.clip('evenodd');
    const left = point(0, 0.5), right = point(1, 0.5);
    const shade = ctx.createLinearGradient(left.x, left.y, right.x, right.y);
    shade.addColorStop(0, 'rgba(36, 48, 32, .32)');
    shade.addColorStop(0.3, 'rgba(233, 211, 144, .04)');
    shade.addColorStop(0.58, 'rgba(255, 238, 176, .10)');
    shade.addColorStop(1, 'rgba(30, 49, 36, .38)');
    ctx.fillStyle = shade;
    ctx.fillRect(0, 0, PopoGame.STAGE_W, PopoGame.STAGE_H);
    for (const u of [0.12, 0.27, 0.73, 0.88]) {
      ctx.beginPath();
      for (let i = 0; i <= 24; i += 1) {
        const q = point(u, below(i / 24));
        if (!i) ctx.moveTo(q.x, q.y); else ctx.lineTo(q.x, q.y);
      }
      ctx.strokeStyle = wet ? 'rgba(35, 58, 49, .18)' : 'rgba(78, 57, 26, .18)';
      ctx.lineWidth = 5;
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255, 226, 158, .30)';
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }
    ctx.restore();
  }

  // Two little arrows beside the knob show which ways it slides along its track (each fades out
  // at the end of the track); the track itself isn't drawn.
  drawArrows(ctx, knob) {
    const from = this.toStage(this.stop(this.track.min));
    const to = this.toStage(this.stop(this.track.max));
    const k = this.textScale;
    ctx.save();
    ctx.lineCap = 'round';
    const dir = normalize(sub(to, from));
    const nudge = this.reduced ? 0 : Math.sin(this.time * 4) * 3;
    for (const [sign, open] of [[1, this.stopAt < this.track.max], [-1, this.stopAt > this.track.min]]) {
      if (!open) continue;
      const at = add(knob, times(dir, sign * (this.arrowGap + nudge)));
      const tip = add(at, times(dir, sign * 9 * k));
      const back = times(dir, -sign * 9 * k);
      const across = { x: -dir.y * 10 * k, y: dir.x * 10 * k };
      ctx.beginPath();
      ctx.moveTo(at.x + back.x + across.x, at.y + back.y + across.y);
      ctx.lineTo(tip.x, tip.y);
      ctx.lineTo(at.x + back.x - across.x, at.y + back.y - across.y);
      ctx.lineJoin = 'round';
      ctx.lineWidth = 7 * k;
      ctx.strokeStyle = INK;
      ctx.stroke();
      ctx.lineWidth = 3.5 * k;
      ctx.strokeStyle = '#ffd84a';
      ctx.stroke();
    }
    ctx.restore();
  }

  // Where the two slide arrows sit beside the knob at `knob` (a stage point), each null at its
  // end of the track; their tap targets go there (Game.placeHandle).
  arrowPoints(knob) {
    if (this.locked || this.furl) return { back: null, on: null };
    const dir = normalize(sub(this.toStage(this.stop(this.track.max)), this.toStage(this.stop(this.track.min))));
    const at = (sign) => add(knob, times(dir, sign * this.arrowGap));
    return { back: this.stopAt > this.track.min ? at(-1) : null, on: this.stopAt < this.track.max ? at(1) : null };
  }

  // The generated net texture (assets/generated/net.png) warped onto the frame: the rope
  // frame of the picture lands on the corners and the floats and weights outside it come
  // along; closed into a bag, the mesh follows meshPoint. Drawn in net coordinates and cached
  // per shape, so bobbing, swinging and lowering never rebuild it; only a drag or the bag
  // closing does.
  // A shape that is changing (a drag, the bag closing) is drawn at one texture pixel per stage
  // pixel, quick to rebuild every frame; once it has held still for two frames it is redrawn at
  // the screen's full sharpness (sharpRes, set by Game.resize). The open net is a flat warp and
  // needs few rows of triangles; the bag's curves get more.
  drawGenerated(ctx, wet, frame) {
    const key = JSON.stringify(frame) + this.pouch;
    const changed = this.textureKey !== key;
    if (changed) {
      this.stillFrames = 0;
    } else if (this.textureRes < this.sharpRes && (this.stillFrames = (this.stillFrames || 0) + 1) >= 2) {
      this.textureKey = null;
    }
    if (this.textureKey !== key) {
      const res = changed ? 1 : this.sharpRes;
      this.textureRes = res;
      this.textureKey = key;
      const rows = this.pouch ? 18 : 6;
      const img = PopoGame.assets.netPolished;
      const map = (u, v) => this.meshPoint(u, v, frame);
      // registration is on the rope centreline; the outer floats and weights come along
      const source = { x: 63, y: 110, w: 1645, h: 630 };
      const u0 = -source.x / source.w;
      const u1 = (img.width - source.x) / source.w;
      const v0 = -source.y / source.h;
      const v1 = (img.height - source.y) / source.h;
      const bounds = [];
      for (let y = 0; y <= rows; y += 1) for (let x = 0; x <= 12; x += 1) bounds.push(map(u0 + (u1 - u0) * x / 12, v0 + (v1 - v0) * y / rows));
      const left = Math.floor(Math.min(...bounds.map((q) => q.x))) - 3;
      const top = Math.floor(Math.min(...bounds.map((q) => q.y))) - 3;
      const width = Math.ceil(Math.max(...bounds.map((q) => q.x)) - left) + 3;
      const height = Math.ceil(Math.max(...bounds.map((q) => q.y)) - top) + 3;
      const canvas = this.textureCanvas || (this.textureCanvas = document.createElement('canvas'));
      canvas.width = Math.ceil(width * res);
      canvas.height = Math.ceil(height * res);
      const g = canvas.getContext('2d');
      g.scale(res, res);
      g.translate(-left, -top);
      const triangle = (a, b, c) => {
        const q = [a, b, c].map(([u, v]) => map(u, v));
        const src = [a, b, c].map(([u, v]) => ({ x: source.x + u * source.w, y: source.y + v * source.h }));
        const [s0, s1, s2] = src;
        const [d0, d1, d2] = q;
        const ax = s1.x - s0.x;
        const ay = s1.y - s0.y;
        const bx = s2.x - s0.x;
        const by = s2.y - s0.y;
        const det = ax * by - ay * bx;
        const A = ((d1.x - d0.x) * by - (d2.x - d0.x) * ay) / det;
        const B = ((d1.y - d0.y) * by - (d2.y - d0.y) * ay) / det;
        const C = ((d2.x - d0.x) * ax - (d1.x - d0.x) * bx) / det;
        const D = ((d2.y - d0.y) * ax - (d1.y - d0.y) * bx) / det;
        const mid = { x: (d0.x + d1.x + d2.x) / 3, y: (d0.y + d1.y + d2.y) / 3 };
        g.save();
        g.beginPath();
        q.forEach((point, i) => {
          // each triangle grows a hair past its edges so no seams show between them
          const dx = point.x - mid.x;
          const dy = point.y - mid.y;
          const k = 0.35 / (Math.hypot(dx, dy) || 1);
          if (i) g.lineTo(point.x + dx * k, point.y + dy * k); else g.moveTo(point.x + dx * k, point.y + dy * k);
        });
        g.closePath();
        g.clip();
        g.transform(A, B, C, D, d0.x - A * s0.x - C * s0.y, d0.y - B * s0.x - D * s0.y);
        g.drawImage(img, 0, 0);
        g.restore();
      };
      for (let y = 0; y < rows; y += 1) {
        for (let x = 0; x < 12; x += 1) {
          const u = u0 + (u1 - u0) * x / 12;
          const v = v0 + (v1 - v0) * y / rows;
          const r = u0 + (u1 - u0) * (x + 1) / 12;
          const b = v0 + (v1 - v0) * (y + 1) / rows;
          triangle([u, v], [r, v], [r, b]);
          triangle([u, v], [r, b], [u, b]);
        }
      }
      this.textureBounds = { left, top, width, height };
    }
    const r = this.ring();
    const b = this.textureBounds;
    ctx.save();
    ctx.translate(r.x, r.y);
    ctx.rotate(this.swing);
    if (this.furl) {
      // gathered as in gathered(): narrowed about the ring, shortened toward the knot
      ctx.translate(0, KNOT);
      ctx.scale(1 - GATHER.x * this.furl, 1 - GATHER.y * this.furl);
      ctx.translate(0, -KNOT);
    }
    if (wet) ctx.filter = 'saturate(.7) brightness(.88)';
    if (!this.tear) {
      this.paintMesh(ctx, frame, b);
      ctx.restore();
      return;
    }
    // torn: the mesh is drawn everywhere but the hole (the box and the hole's outline, filled
    // even-odd), and broken strands hang into it
    const hole = this.tearHole();
    ctx.save();
    ctx.beginPath();
    ctx.rect(b.left, b.top, b.width, b.height);
    hole.outline.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
    ctx.closePath();
    ctx.clip('evenodd');
    this.paintMesh(ctx, frame, b);
    ctx.restore();
    // frayed ends all round the edge, drooping, each dark-edged so it reads over sea and sky
    ctx.lineCap = 'round';
    ctx.beginPath();
    hole.outline.forEach((q, i) => {
      const end = lerp(q, hole.centre, i % 2 ? 0.16 : 0.3);
      ctx.moveTo(q.x, q.y);
      ctx.quadraticCurveTo((q.x + end.x) / 2, (q.y + end.y) / 2 + 5, end.x, end.y + 10);
    });
    ctx.lineWidth = 4.6;
    ctx.strokeStyle = '#5a3a14';
    ctx.stroke();
    ctx.lineWidth = 2.4;
    ctx.strokeStyle = '#e0b060';
    ctx.stroke();
    if (this.burst) {
      // bits flung out as it tears, falling and fading
      const t = this.burst.t;
      ctx.globalAlpha *= 1 - t / 0.7;
      ctx.beginPath();
      for (let i = 0; i < 12; i += 1) {
        const a = (i / 12) * TAU + i;
        const v = 160 + (i % 4) * 35;
        const x = hole.centre.x + Math.cos(a) * v * t;
        const y = hole.centre.y + Math.sin(a) * v * t + 520 * t * t;
        const spin = a + t * 9;
        ctx.moveTo(x - Math.cos(spin) * 7, y - Math.sin(spin) * 7);
        ctx.lineTo(x + Math.cos(spin) * 7, y + Math.sin(spin) * 7);
      }
      ctx.lineWidth = 4.6;
      ctx.strokeStyle = '#5a3a14';
      ctx.stroke();
      ctx.lineWidth = 2.4;
      ctx.strokeStyle = '#e0b060';
      ctx.stroke();
    }
    ctx.restore();
  }

  // The warped texture, in net coordinates. Closing into a bag, the floats along the top rope
  // would be squeezed into the gathered mouth and fan out above it like spikes, and the weights
  // along the bottom would hang from the toe in a tassel, so both fold away as it closes: the
  // bag's body is drawn whole and the bands above and below it fade out.
  paintMesh(ctx, frame, b) {
    const image = () => ctx.drawImage(this.textureCanvas, b.left, b.top, b.width, b.height);
    if (!this.pouch) { image(); return; }
    // the bag's body lies between its mouth (below the floats) and its toe (above the weights)
    const edge = (v) => {
      const line = [];
      for (let i = 0; i <= 12; i += 1) line.push(this.meshPoint(i / 12, v, frame));
      return line;
    };
    const neck = edge(NECK);
    const toe = edge(TOE);
    const right = b.left + b.width;
    const body = () => {
      ctx.moveTo(b.left, neck[0].y);
      neck.forEach((q) => ctx.lineTo(q.x, q.y));
      ctx.lineTo(right, neck[neck.length - 1].y);
      ctx.lineTo(right, toe[toe.length - 1].y);
      for (let i = toe.length - 1; i >= 0; i -= 1) ctx.lineTo(toe[i].x, toe[i].y);
      ctx.lineTo(b.left, toe[0].y);
      ctx.closePath();
    };
    ctx.save();
    ctx.beginPath();
    body();
    ctx.clip();
    image();
    ctx.restore();
    if (this.pouch >= 1) return;
    // the floats above and the weights below fade as the bag closes
    ctx.save();
    ctx.globalAlpha *= (1 - this.pouch) ** 2;
    ctx.beginPath();
    ctx.rect(b.left, b.top, b.width, b.height);
    body();
    ctx.clip('evenodd');
    image();
    ctx.restore();
  }


  framePath(ctx, c) {
    ctx.beginPath();
    c.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.closePath();
  }

  // Only what the level is about is shown: parallel ticks, side lengths, angle arcs or the
  // diagonals with their halves. Reference values stay fixed; the rest update as the corner moves.
  // The labels are gathered first and laid out together (see placeLabels), so none covers another
  // however crowded the net or small the screen.
  drawMeasurements(ctx, c) {
    this.labelQueue = [];
    this.measure(ctx, c);
    const labels = this.labelQueue;
    this.labelQueue = null;
    this.placeLabels(labels);
    for (const l of labels) this.text(ctx, l.string, l.x, l.y, l.px, l.colour, l.live);
  }

  // Nudges overlapping labels apart, each pair along the way they overlap least, a few rounds.
  placeLabels(labels) {
    const k = this.textScale;
    const half = (l) => ({ w: (l.string.length * l.px * 0.55 * k) / 2 + 4, h: (l.px * 1.15 * k) / 2 });
    for (let round = 0; round < 16; round += 1) {
      let moved = false;
      for (let i = 0; i < labels.length; i += 1) {
        for (let j = i + 1; j < labels.length; j += 1) {
          const a = labels[i];
          const b = labels[j];
          const ha = half(a);
          const hb = half(b);
          const ox = ha.w + hb.w - Math.abs(a.x - b.x);
          const oy = ha.h + hb.h - Math.abs(a.y - b.y);
          if (ox <= 0 || oy <= 0) continue;
          moved = true;
          if (oy < ox) {
            const d = (oy / 2 + 1) * (b.y >= a.y ? 1 : -1);
            a.y -= d;
            b.y += d;
          } else {
            const d = (ox / 2 + 1) * (b.x >= a.x ? 1 : -1);
            a.x -= d;
            b.x += d;
          }
        }
      }
      if (!moved) break;
    }
  }

  measure(ctx, c) {
    const L = this.level;
    if (!L) return;
    const m = (name) => `${this.metresShown(name).toFixed(1)} m`;
    const deg = (letter) => `${this.degreesShown(letter)}°`;
    const slope = (name) => `${this.slopeShown(name)}°`.replace('-', '−');
    switch (L.type) {
      case 'parallel':
        // the parallel marks say which sides; their slopes, side by side, say whether they are
        // (the marks never light up by themselves: the numbers tell, and Drop Net decides)
        this.drawSideHighlight(ctx, c, L.sides);
        this.drawTicks(ctx, c, L.sides, false, L.sides[0] === 'AB' ? 1 : 2);
        for (const name of L.sides) this.drawLength(ctx, c, name, slope(name), name.includes(L.corner));
        break;
      case 'length':
        this.drawLength(ctx, c, L.reference, `${L.metres[L.reference]} m`);
        this.drawLength(ctx, c, L.side, m(L.side), true);
        break;
      case 'sides':
        this.drawLength(ctx, c, 'AB', `${L.metres.AB} m`);
        this.drawLength(ctx, c, 'AD', `${L.metres.AD} m`);
        this.drawLength(ctx, c, 'CD', m('CD'), true);
        this.drawLength(ctx, c, 'BC', m('BC'), true);
        break;
      case 'angle':
        this.drawAngle(ctx, c, L.reference, `${L.degrees}°`);
        this.drawAngle(ctx, c, L.vertex, deg(L.vertex), true);
        break;
      case 'supplementary': {
        this.drawAngle(ctx, c, L.reference, `${L.degrees}°`);
        this.drawAngle(ctx, c, L.vertex, deg(L.vertex), true);
        // the relation appears once the child starts, and completes when the check passes
        const solvedB = this.locked ? 180 - L.degrees : '?';
        if (this.touched || this.hintPulse > 0 || this.locked) {
          const at = midpoint(c[0], c[1]);
          this.text(ctx, `${L.degrees}° + ${solvedB}° = 180°`, at.x, at.y - 56, 24, this.locked ? GLOW : '#fff');
        }
        break;
      }
      case 'diagonals':
        this.drawDiagonals(ctx, c, true);
        break;
      default: {
        // the whole parallelogram: its sides, its opposite angles and its diagonals, as the
        // level's hint says ("sides, angles, diagonals")
        this.drawDiagonals(ctx, c, false);
        const mine = ['AB', 'BC', 'CD', 'AD'].filter((name) => name.includes(L.corner));
        for (const name of ['AB', 'BC', 'CD', 'AD']) this.drawLength(ctx, c, name, m(name), mine.includes(name));
        this.drawAngle(ctx, c, 'A', deg('A'), true);
        this.drawAngle(ctx, c, 'C', deg('C'), true);
      }
    }
  }

  // A side's label sits just inside its midpoint, clear of the water, the sling and the mast;
  // on a side the moving corner pulls, it sits a little toward the fixed end, clear of the knob.
  drawLength(ctx, c, name, value, live = false) {
    const [i, j] = side(name);
    const mid = lerp(c[i], c[j], this.clearOfKnob(i, j));
    const centre = midpoint(midpoint(c[0], c[1]), midpoint(c[2], c[3]));
    const at = add(mid, times(normalize(sub(centre, mid)), 30 * this.textScale));
    this.text(ctx, `${name} ${value}`, at.x, at.y, live ? 26 : 22, live ? '#ffd84a' : '#fff', live);
  }

  // A soft band along the sides a parallel level is about.
  drawSideHighlight(ctx, c, sides) {
    ctx.save();
    ctx.lineWidth = 18;
    ctx.strokeStyle = 'rgba(255, 240, 150, 0.28)';
    ctx.beginPath();
    for (const name of sides) {
      const [i, j] = side(name);
      ctx.moveTo(c[i].x, c[i].y);
      ctx.lineTo(c[j].x, c[j].y);
    }
    ctx.stroke();
    ctx.restore();
  }

  // Parallel marks as in a geometry book: chevrons on the pair of sides, faint until the
  // sides are parallel, then bright green.
  drawTicks(ctx, c, sides, lit, count) {
    ctx.save();
    for (const name of sides) {
      const [i, j] = side(name);
      const u = normalize(sub(c[j], c[i]));
      const mid = midpoint(c[i], c[j]);
      for (let pass = 0; pass < 2; pass += 1) {
        ctx.lineWidth = pass ? (lit ? 2.5 : 1.6) : (lit ? 4.5 : 3);
        ctx.strokeStyle = pass ? (lit ? GLOW : 'rgba(255, 255, 255, 0.6)') : (lit ? '#2b5a2c' : 'rgba(40, 30, 10, 0.45)');
        ctx.beginPath();
        for (let k = 0; k < count; k += 1) {
          const o = (k - (count - 1) / 2) * 9;
          const px = mid.x + u.x * o;
          const py = mid.y + u.y * o;
          ctx.moveTo(px - u.x * 7 - u.y * 7, py - u.y * 7 + u.x * 7);
          ctx.lineTo(px + u.x * 5, py + u.y * 5);
          ctx.lineTo(px - u.x * 7 + u.y * 7, py - u.y * 7 - u.x * 7);
        }
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  // Where along side i-j its label sits: the middle, or toward the fixed end when the moving
  // corner is one end of it.
  clearOfKnob(i, j) {
    if (this.locked) return 0.5;
    return j === this.movable ? 0.4 : i === this.movable ? 0.6 : 0.5;
  }

  // A small interior arc at a corner with its degrees along the bisector.
  drawAngle(ctx, c, letter, value, live = false, fill = null) {
    const i = corner(letter);
    const v = c[i];
    const a1 = Math.atan2(c[(i + 3) % 4].y - v.y, c[(i + 3) % 4].x - v.x);
    const a2 = Math.atan2(c[(i + 1) % 4].y - v.y, c[(i + 1) % 4].x - v.x);
    let sweep = a2 - a1;
    sweep = Math.atan2(Math.sin(sweep), Math.cos(sweep)); // the interior angle, never the reflex one
    const radius = 40;
    ctx.save();
    if (fill) {
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.moveTo(v.x, v.y);
      ctx.arc(v.x, v.y, radius + 14, a1, a1 + sweep, sweep < 0);
      ctx.closePath();
      ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(v.x, v.y, radius, a1, a1 + sweep, sweep < 0);
    ctx.lineWidth = 6;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.lineWidth = 3;
    ctx.strokeStyle = live ? '#ffd84a' : '#fff';
    ctx.stroke();
    ctx.restore();
    const mid = a1 + sweep / 2;
    this.text(ctx, value, v.x + Math.cos(mid) * 72, v.y + Math.sin(mid) * 72, live ? 28 : 24, live ? '#ffd84a' : '#fff', live);
  }

  // The diagonals as thin ropes, the point O where they cross, and the four halves measured.
  drawDiagonals(ctx, c, labels) {
    const [a, b, cc, d] = c;
    const o = intersection(a, cc, b, d) || midpoint(a, cc);
    ctx.save();
    ctx.lineWidth = 5;
    ctx.strokeStyle = '#4a2c0f';
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(cc.x, cc.y);
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(d.x, d.y);
    ctx.stroke();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#e2b85c';
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(o.x, o.y, 9, 0, TAU);
    ctx.fillStyle = '#ffd84a';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#4a2c0f';
    ctx.stroke();
    ctx.restore();
    const k = this.textScale;
    // O sits in the gap between the two upper halves' labels, just under the crossing
    this.text(ctx, 'O', o.x, o.y + 24 * k, 22, '#fff');
    if (!labels) return;
    const h = this.halvesShown();
    // each half's label sits beside its middle (toward O on the moving corner's half, clear of
    // the knob), out on the side away from O's other halves
    const put = (from, to, name, value, sign, along = 0.5) => {
      const mid = lerp(from, to, along);
      const u = normalize(sub(to, from));
      this.text(ctx, `${name} ${value.toFixed(1)} m`, mid.x - u.y * 30 * k * sign, mid.y + u.x * 30 * k * sign, 22, '#ffd84a', true);
    };
    const toward = (end) => (end === this.movable && !this.locked ? 0.38 : 0.5);
    put(a, o, 'AO', h.AO, 1, 1 - toward(0));
    put(o, cc, 'OC', h.OC, 1, toward(2));
    put(b, o, 'BO', h.BO, -1, 1 - toward(1));
    put(o, d, 'OD', h.OD, -1, toward(3));
  }

  // The property highlight: sides, angles or diagonal halves light up, one step at a time.
  drawGlow(ctx, c) {
    const g = this.glow;
    const index = Math.min(g.steps.length - 1, Math.floor(g.t / g.each));
    const local = (g.t - index * g.each) / g.each;
    const step = g.steps[index];
    ctx.save();
    ctx.globalAlpha *= Math.sin(local * Math.PI) * 0.9;
    if (step.sides) {
      ctx.lineWidth = 22;
      ctx.strokeStyle = GLOW;
      ctx.beginPath();
      for (const name of step.sides) {
        const [i, j] = side(name);
        ctx.moveTo(c[i].x, c[i].y);
        ctx.lineTo(c[j].x, c[j].y);
      }
      ctx.stroke();
      ctx.lineWidth = 8;
      ctx.strokeStyle = '#fff';
      ctx.stroke();
    }
    if (step.angles) {
      for (const letter of step.angles) this.drawAngle(ctx, c, letter, `${this.degreesShown(letter)}°`, false, 'rgba(143, 247, 168, 0.55)');
    }
    if (step.halves || step.diagonals) {
      const [a, b, cc, d] = c;
      const o = intersection(a, cc, b, d) || midpoint(a, cc);
      ctx.lineWidth = 14;
      ctx.strokeStyle = GLOW;
      ctx.beginPath();
      if (step.halves !== 'BD') { ctx.moveTo(a.x, a.y); ctx.lineTo(cc.x, cc.y); }
      if (step.halves !== 'AC') { ctx.moveTo(b.x, b.y); ctx.lineTo(d.x, d.y); }
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(o.x, o.y, 16, 0, TAU);
      ctx.fillStyle = '#fff';
      ctx.fill();
      if (step.halves) this.drawDiagonals(ctx, c, true);
    }
    ctx.restore();
  }

  // Fixed corners are brass eyelets, plain to see but still; the one that moves is a big
  // bright knob.
  drawCorners(ctx, c, wet) {
    c.forEach((point, i) => {
      const handle = i === this.movable && !this.locked;
      const p = handle && this.wobble ? { x: point.x + Math.sin(this.time * 45) * 3 * this.wobble, y: point.y } : point;
      if (handle) {
        this.drawHandle(ctx, p);
        return;
      }
      ctx.beginPath();
      ctx.arc(p.x, p.y, 12, 0, TAU);
      ctx.fillStyle = wet ? '#b9a470' : '#f4c76b';
      ctx.fill();
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = '#4a2c0f';
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4.5, 0, TAU);
      ctx.fillStyle = '#4a2c0f';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(p.x, p.y, 9, Math.PI * 1.1, Math.PI * 1.6);
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.stroke();
    });
  }

  // The one corner that moves: a big knob with a breathing halo. It looks the same wherever it
  // is, so it never gives away its place.
  drawHandle(ctx, p) {
    const pulse = this.reduced ? 0.5 : (Math.sin(this.time * 3.2) + 1) / 2;
    const r = 34 + pulse * 12;
    const g = ctx.createRadialGradient(p.x, p.y, 10, p.x, p.y, r);
    g.addColorStop(0, `rgba(255, 214, 90, ${0.6 + pulse * 0.25})`);
    g.addColorStop(1, 'rgba(255, 214, 90, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, TAU);
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = `rgba(255, 255, 255, ${0.55 + pulse * 0.4})`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 24 + pulse * 4, 0, TAU);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(p.x, p.y, 16, 0, TAU);
    ctx.fillStyle = '#ffd84a';
    ctx.fill();
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = '#4a2c0f';
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(p.x - 5, p.y - 5, 5, 0, TAU);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.fill();
  }

  // Small lettered discs beside the corners: the top ones out toward the sky, the bottom ones
  // straight below their weights (further out at the knob).
  drawLabels(ctx, c) {
    const centre = midpoint(midpoint(c[0], c[1]), midpoint(c[2], c[3]));
    const k = this.textScale;
    c.forEach((p, i) => {
      const gap = (i === this.movable && !this.locked ? 52 : 34) * k;
      const out = normalize(sub(p, centre));
      const dir = normalize({ x: out.x * 0.35, y: i >= 2 ? 1 : -1 });
      const at = add(p, times(dir, gap));
      ctx.beginPath();
      ctx.arc(at.x, at.y, 14 * k, 0, TAU);
      ctx.fillStyle = '#fff8e8';
      ctx.fill();
      ctx.lineWidth = 2.5 * k;
      ctx.strokeStyle = '#3b1d00';
      ctx.stroke();
      ctx.font = FONT(19 * k);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#3b1d00';
      ctx.fillText(CORNERS[i], at.x, at.y + k);
    });
  }

  // Readable on any background: white (or coloured) text with a dark edge. Live values swell
  // a little while a hint is on.
  text(ctx, string, x, y, px, colour, live = false) {
    if (this.labelQueue) {
      this.labelQueue.push({ string, x, y, px, colour, live });
      return;
    }
    const swell = (live && this.hintPulse > 0 && !this.reduced ? 1 + 0.15 * Math.abs(Math.sin(this.time * 8)) : 1) * this.textScale;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(swell, swell);
    ctx.font = FONT(px);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 5;
    ctx.strokeStyle = INK;
    ctx.strokeText(string, 0, 0);
    ctx.fillStyle = colour;
    ctx.fillText(string, 0, 0);
    ctx.restore();
  }
}

Object.assign(PopoGame, { Net });
})(window.PopoGame = window.PopoGame || {});
