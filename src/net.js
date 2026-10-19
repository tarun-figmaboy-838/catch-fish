(function (PopoGame) {
'use strict';
const { geo, drawRope, drawRing, RING_DEPTH } = PopoGame;
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
// child-sized tolerances: about three and a half degrees of parallel, a quarter metre, three
// degrees of angle, and a third of a metre between the halves of a diagonal
const TOLERANCE = { parallel: 0.06, metres: 0.25, degrees: 3, halves: 0.3 };
const GLOW = '#8ff7a8';
// Wound up, the net gathers under its ring: a tenth as wide and under half as long, hanging
// from the knot where the sling meets.
const GATHER = { x: 0.9, y: 0.55 };
const KNOT = RING_DEPTH - 4;
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
    this.magnet = 44;
    this.along = null;
    this.scale = 70;      // stage pixels per metre shown
    this.locked = true;
    this.settling = false;
    this.visible = false;
    this.alpha = 1;
    this.time = 0;
    this.near = 0;        // how close the corner is to its place, smoothed, for the glow
    this.wobble = 0;      // a shake of the corner after a wrong check
    this.flash = 0;       // the frame lights up when the shape comes right
    this.glow = null;     // the property highlight: steps played one after another
    this.hintPulse = 0;   // the measurements swell for a moment as a hint
    this.touched = false; // the child has moved the corner this level
    this.textScale = 1;   // labels grow on small screens so they stay readable (see Game.resize)
    this.ropePhase = 0;   // rope twists slide as rope pays out
    this.furl = 0;        // 0 open, 1 wound up into a bundle under the ring (between nets)
    this.tear = 0;        // 0 whole, 1 torn open by a catch a wrong net couldn't hold
    this.burst = null;    // bits of mesh flying off as it tears: { t } seconds
    this.reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  // bottom: the deepest net-coordinate the frame may reach (just above the water)
  setLevel(level, bottom) {
    const shape = parallelogram(level);
    const lowest = Math.max(...shape.map((p) => p.y));
    this.level = level;
    this.solved = shape.map((p) => ({ x: p.x, y: p.y - lowest + bottom }));
    this.movable = corner(level.corner);
    this.target = this.solved[this.movable];
    this.start = this.solved.map((p) => ({ ...p }));
    this.start[this.movable] = add(this.target, level.start);
    this.points = this.start.map((p) => ({ ...p }));
    const [i, j] = level.along ? side(level.along) : [0, 1];
    this.along = level.along ? { base: this.target, dir: normalize(sub(this.solved[j], this.solved[i])) } : null;
    const [name, metres] = Object.entries(level.metres || { AB: 6 })[0];
    this.scale = length(this.sideOf(name, this.solved)) / metres;
    this.magnet = Math.min(level.width, level.height) * 0.22;
    this.locked = false;
    this.touched = false;
    this.flash = 0;
    this.glow = null;
    const xs = this.solved.map((p) => p.x);
    const ys = this.solved.map((p) => p.y);
    // the corner may roam around the frame, but not into the water or up to the ring
    this.limits = {
      left: Math.min(...xs) - level.width * 0.4, right: Math.max(...xs) + level.width * 0.4,
      top: Math.max(24, Math.min(...ys) - level.height * 0.55), bottom: bottom + 12,
    };
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

  // The hole the catch tears: low in the middle of the mesh (the frame holds), growing with
  // the tear.
  tearHole() {
    const [a, b, c, d] = this.points;
    const centre = lerp(midpoint(midpoint(a, b), midpoint(c, d)), midpoint(c, d), 0.25);
    const rx = distance(midpoint(a, d), midpoint(b, c)) * 0.34 * this.tear;
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

  get withinReach() {
    return this.distance() <= this.magnet;
  }

  bottom() {
    return Math.max(...this.points.map((p) => p.y));
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

  // Moves the corner toward a wanted net point: kept inside its limits (and on its line, when
  // the level has one), never folding the frame into a bow tie or squashing it flat, and
  // drawn toward its place once it comes near (the magnet).
  moveHandle(want) {
    const l = this.limits;
    let p = { x: Math.min(l.right, Math.max(l.left, want.x)), y: Math.min(l.bottom, Math.max(l.top, want.y)) };
    if (this.along) p = add(this.along.base, times(this.along.dir, dot(sub(p, this.along.base), this.along.dir)));
    const d = distance(p, this.target);
    if (d < this.magnet) p = lerp(p, this.target, (1 - d / this.magnet) ** 2 * 0.7);
    const trial = this.points.map((q, i) => (i === this.movable ? p : q));
    if (!isValidQuad(trial)) return false;
    this.points[this.movable] = p;
    this.touched = true;
    return true;
  }

  setHandle(p) {
    this.points[this.movable] = { x: p.x, y: p.y };
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

  pairParallel(sides) {
    return parallel(this.sideOf(sides[0]), this.sideOf(sides[1]), TOLERANCE.parallel);
  }

  // The number a measurement tick listens to: it changes as the shown value changes.
  liveValue() {
    const L = this.level;
    const tenths = (m) => Math.round(m * 10);
    switch (L.type) {
      case 'length': return tenths(this.metres(L.side));
      case 'sides': return tenths(this.metres('BC')) * 1000 + tenths(this.metres('CD'));
      case 'angle': case 'supplementary': return Math.round(this.angle(L.vertex));
      case 'diagonals': { const h = this.halves(); return tenths(h.AO - h.OC) * 1000 + tenths(h.BO - h.OD); }
      default: return Number(this.pairParallel(['AB', 'CD'])) + Number(this.pairParallel(['BC', 'AD'])) * 2;
    }
  }

  // Whether the frame has the level's property, and where the corner settles if it does.
  // The exact parallelogram point is A + C = B + D solved for the corner; a parallel-only
  // level also accepts the corner anywhere along the parallel line, and keeps its length.
  check() {
    const L = this.level;
    const p = this.points;
    const near = (a, b, tol) => Math.abs(a - b) <= tol;
    if (!isValidQuad(p)) return { ok: false };
    let ok;
    let snap = this.target;
    switch (L.type) {
      case 'parallel': {
        ok = this.pairParallel(L.sides);
        if (ok && this.distance() > this.magnet * 2.5) {
          const mine = L.sides.find((name) => name.includes(L.corner));
          const other = L.sides.find((name) => name !== mine);
          const fixed = p[corner(mine.replace(L.corner, ''))];
          const dir = normalize(this.sideOf(other));
          snap = add(fixed, times(dir, dot(sub(p[this.movable], fixed), dir)));
        }
        break;
      }
      case 'length': ok = near(this.metres(L.side), L.metres[L.reference], TOLERANCE.metres); break;
      case 'sides': ok = near(this.metres('CD'), this.metres('AB'), TOLERANCE.metres) && near(this.metres('BC'), this.metres('AD'), TOLERANCE.metres); break;
      case 'angle': ok = near(this.angle(L.vertex), L.degrees, TOLERANCE.degrees); break;
      case 'supplementary': ok = near(this.angle(L.reference) + this.angle(L.vertex), 180, TOLERANCE.degrees); break;
      case 'diagonals': { const h = this.halves(); ok = near(h.AO, h.OC, TOLERANCE.halves) && near(h.BO, h.OD, TOLERANCE.halves); break; }
      default: ok = this.pairParallel(['AB', 'CD']) && this.pairParallel(['BC', 'AD']);
    }
    return { ok, snap };
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
    const want = this.locked ? 0 : Math.max(0, 1 - this.distance() / (this.magnet * 1.6));
    this.near += (want - this.near) * Math.min(1, dt * 10);
    if (this.wobble > 0) this.wobble = Math.max(0, this.wobble - dt / 0.45);
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt / 0.7);
    if (this.hintPulse > 0) this.hintPulse = Math.max(0, this.hintPulse - dt);
    if (this.glow && (this.glow.t += dt) >= this.glow.steps.length * this.glow.each) this.glow = null;
    if (this.burst && (this.burst.t += dt) > 0.7) this.burst = null;
  }

  // --- drawing --------------------------------------------------------------------
  draw(ctx, { waterline, pulley }) {
    if (!this.visible) return;
    const r = this.ring();
    const reach = Math.max(...this.points.map((p) => length(p))) + 80;
    const top = Math.min(pulley.y, r.y - reach);
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
    const corners = this.points.map((p) => this.toStage(p));
    const showing = !this.furl && (!this.locked || this.glow);
    ctx.save();
    ctx.globalAlpha = this.alpha * (wet ? 0.9 : 1);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (wet) ctx.filter = 'saturate(0.6) brightness(0.85)';
    // the lifting rope down from the boom's pulley to the ring, and the sling from the ring
    // to the top corners that carries the whole frame: the machine's painted rope, tiled
    drawRope(ctx, pulley, { x: ring.x, y: ring.y + 4 }, 11, this.ropePhase);
    const knot = { x: ring.x, y: ring.y + KNOT };
    drawRope(ctx, knot, corners[0], 7);
    drawRope(ctx, knot, corners[1], 7);
    drawRing(ctx, ring.x, ring.y);
    ctx.filter = 'none';

    this.drawGenerated(ctx, wet);
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
      ctx.globalAlpha *= 1 - this.furl;
      this.drawCorners(ctx, corners, wet);
      ctx.restore();
    }
    if (showing) this.drawLabels(ctx, corners);
    ctx.restore();
  }

  // The generated net texture (assets/generated/net.png) warped onto the frame: the rope
  // frame of the picture lands on the corners and the floats and weights outside it come
  // along. Drawn in net coordinates and cached per shape, so bobbing, swinging and lowering
  // never rebuild it; only a drag does.
  drawGenerated(ctx, wet) {
    const key = JSON.stringify(this.points);
    if (this.textureKey !== key) {
      this.textureKey = key;
      const img = PopoGame.assets.netPolished;
      const p = this.points;
      const map = (u, v) => lerp(lerp(p[0], p[1], u), lerp(p[3], p[2], u), v);
      // registration is on the rope centreline; the outer floats and weights come along
      const source = { x: 63, y: 110, w: 1645, h: 630 };
      const u0 = -source.x / source.w;
      const u1 = (img.width - source.x) / source.w;
      const v0 = -source.y / source.h;
      const v1 = (img.height - source.y) / source.h;
      const bounds = [map(u0, v0), map(u1, v0), map(u1, v1), map(u0, v1)];
      const left = Math.floor(Math.min(...bounds.map((q) => q.x))) - 3;
      const top = Math.floor(Math.min(...bounds.map((q) => q.y))) - 3;
      const width = Math.ceil(Math.max(...bounds.map((q) => q.x)) - left) + 3;
      const height = Math.ceil(Math.max(...bounds.map((q) => q.y)) - top) + 3;
      const canvas = this.textureCanvas || (this.textureCanvas = document.createElement('canvas'));
      canvas.width = width * 2;
      canvas.height = height * 2;
      const g = canvas.getContext('2d');
      g.scale(2, 2);
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
      for (let y = 0; y < 6; y += 1) {
        for (let x = 0; x < 12; x += 1) {
          const u = u0 + (u1 - u0) * x / 12;
          const v = v0 + (v1 - v0) * y / 6;
          const r = u0 + (u1 - u0) * (x + 1) / 12;
          const b = v0 + (v1 - v0) * (y + 1) / 6;
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
      ctx.drawImage(this.textureCanvas, b.left, b.top, b.width, b.height);
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
    ctx.drawImage(this.textureCanvas, b.left, b.top, b.width, b.height);
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

  framePath(ctx, c) {
    ctx.beginPath();
    c.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.closePath();
  }

  // Only what the level is about is shown: parallel ticks, side lengths, angle arcs or the
  // diagonals with their halves. Reference values stay fixed; the rest update as the corner moves.
  drawMeasurements(ctx, c) {
    const L = this.level;
    if (!L) return;
    const m = (name) => `${this.metres(name).toFixed(1)} m`;
    const deg = (letter) => `${Math.round(this.angle(letter))}°`;
    switch (L.type) {
      case 'parallel':
        this.drawSideHighlight(ctx, c, L.sides);
        this.drawTicks(ctx, c, L.sides, this.pairParallel(L.sides), L.sides[0] === 'AB' ? 1 : 2);
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
        const mine = ['AB', 'BC', 'CD', 'AD'].filter((name) => name.includes(L.corner));
        for (const name of ['AB', 'BC', 'CD', 'AD']) this.drawLength(ctx, c, name, m(name), mine.includes(name));
      }
    }
  }

  // A side's label sits just inside its midpoint, clear of the water, the sling and the mast.
  drawLength(ctx, c, name, value, live = false) {
    const [i, j] = side(name);
    const mid = midpoint(c[i], c[j]);
    const centre = midpoint(midpoint(c[0], c[1]), midpoint(c[2], c[3]));
    const at = add(mid, times(normalize(sub(centre, mid)), 30));
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
    this.text(ctx, 'O', o.x + 18, o.y - 16, 22, '#fff');
    if (!labels) return;
    const h = this.halves();
    const put = (from, to, name, value, sign) => {
      const mid = midpoint(from, to);
      const u = normalize(sub(to, from));
      this.text(ctx, `${name} ${value.toFixed(1)} m`, mid.x - u.y * 30 * sign, mid.y + u.x * 30 * sign, 22, '#ffd84a', true);
    };
    put(a, o, 'AO', h.AO, 1);
    put(o, cc, 'OC', h.OC, 1);
    put(b, o, 'BO', h.BO, -1);
    put(o, d, 'OD', h.OD, -1);
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
      for (const letter of step.angles) this.drawAngle(ctx, c, letter, `${Math.round(this.angle(letter))}°`, false, 'rgba(143, 247, 168, 0.55)');
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

  // The one corner that moves: a big knob with a breathing halo, turning green as it nears
  // its place.
  drawHandle(ctx, p) {
    const pulse = this.reduced ? 0.5 : (Math.sin(this.time * 3.2) + 1) / 2;
    const near = this.near > 0.5;
    const r = 34 + pulse * 12;
    const g = ctx.createRadialGradient(p.x, p.y, 10, p.x, p.y, r);
    g.addColorStop(0, near ? `rgba(120, 255, 160, ${0.7 + pulse * 0.2})` : `rgba(255, 214, 90, ${0.6 + pulse * 0.25})`);
    g.addColorStop(1, near ? 'rgba(120, 255, 160, 0)' : 'rgba(255, 214, 90, 0)');
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
    ctx.fillStyle = near ? '#9cf7b4' : '#ffd84a';
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
