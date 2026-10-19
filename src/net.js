(function (PopoGame) {
'use strict';

// The fishing net: a rope frame of four corners hung from one lifting ring, with a soft mesh
// inside. Three corners are fixed and the child drags the fourth until the frame is a
// parallelogram. Positions are in net coordinates, measured from the ring, so lowering the
// net or the raft bobbing never changes the shape.

const TAU = Math.PI * 2;
const CORNERS = ['A', 'B', 'C', 'D']; // top-left, top-right, bottom-right, bottom-left

// --- geometry -----------------------------------------------------------------
// Corners A, B, C, D in order around the frame make a parallelogram exactly when A + C = B + D.
// So the place for the movable corner follows from the other three: for D, D = A + C - B.
function targetOf(points, movable) {
  const before = points[(movable + 3) % 4];
  const after = points[(movable + 1) % 4];
  const opposite = points[(movable + 2) % 4];
  return { x: before.x + after.x - opposite.x, y: before.y + after.y - opposite.y };
}

function isParallelogram(p, tolerance = 0.5) {
  return Math.abs(p[0].x + p[2].x - p[1].x - p[3].x) <= tolerance
    && Math.abs(p[0].y + p[2].y - p[1].y - p[3].y) <= tolerance;
}

function cross(o, a, b) {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

function segmentsCross(p1, p2, p3, p4) {
  const d1 = cross(p3, p4, p1);
  const d2 = cross(p3, p4, p2);
  const d3 = cross(p1, p2, p3);
  const d4 = cross(p1, p2, p4);
  return (d1 > 0) !== (d2 > 0) && (d3 > 0) !== (d4 > 0);
}

// No bow ties: the frame's opposite edges never cross each other.
function isSimpleQuad(p) {
  return !segmentsCross(p[0], p[1], p[2], p[3]) && !segmentsCross(p[1], p[2], p[3], p[0]);
}

function area(p) {
  let sum = 0;
  for (let i = 0; i < p.length; i += 1) {
    const a = p[i];
    const b = p[(i + 1) % p.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

function insideConvex(p, q) {
  let sign = 0;
  for (let i = 0; i < q.length; i += 1) {
    const c = cross(q[i], q[(i + 1) % q.length], p);
    if (c === 0) continue;
    if (sign === 0) sign = Math.sign(c);
    else if (Math.sign(c) !== sign) return false;
  }
  return true;
}

function lerp(a, b, t) {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

// A parallelogram centred under the ring: `top` is the ring-to-top-edge distance and `lean`
// how far the top edge sits to the right of the bottom edge.
function parallelogram({ width, height, lean, top }) {
  const w = width / 2;
  const l = lean / 2;
  return [
    { x: -w + l, y: top }, { x: w + l, y: top },
    { x: w - l, y: top + height }, { x: -w - l, y: top + height },
  ];
}

// The starting frame of a level: the solved parallelogram with one corner moved off its place.
function levelFrame(level, top) {
  const solved = parallelogram({ width: level.width, height: level.height, lean: level.lean, top });
  const movable = CORNERS.indexOf(level.corner);
  const points = solved.map((p) => ({ ...p }));
  points[movable] = { x: solved[movable].x + level.start.x, y: solved[movable].y + level.start.y };
  return { solved, points, movable, target: targetOf(points, movable) };
}

// How close the child must bring the corner: a share of the net's shorter side, so it stays
// in proportion on every screen (the stage scales as one), scaled per level.
function magnetRadius(level) {
  return Math.min(level.width, level.height) * 0.22 * (level.magnet || 1);
}

// --- the net ------------------------------------------------------------------
const ROPE = { outline: '#5a3a14', body: '#d39a52', light: '#f6d28e', dark: '#a06c2c' };
const ROPE_WET = { outline: '#2b3a4f', body: '#9a8a74', light: '#cfc3ad', dark: '#6f6454' };

class Net {
  constructor() {
    this.origin = { x: 0, y: 0 }; // where the ring hangs at rest, on the stage
    this.drop = 0;                 // how far the winch has lowered it
    this.swing = 0;                // pendulum angle about the ring (rowing, settling)
    this.points = parallelogram({ width: 480, height: 200, lean: 60, top: 110 });
    this.movable = 1;
    this.target = { ...this.points[1] };
    this.magnet = 44;
    this.locked = true;
    this.visible = false;
    this.alpha = 1;
    this.time = 0;
    this.near = 0;        // how close the corner is to its place, smoothed, for the glow
    this.wobble = 0;      // a shake of the corner when it is let go away from its place
    this.flash = 0;       // the frame lights up when the shape comes right
    this.pairs = null;    // the opposite-sides highlight, 0..1
    this.ropePhase = 0;   // rope twist marks slide as rope pays out
    this.reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  // bottom: the deepest net-coordinate the frame's bottom edge may reach (just above the water)
  setLevel(level, bottom) {
    const frame = levelFrame(level, bottom - level.height);
    this.solved = frame.solved;
    this.start = frame.points.map((p) => ({ ...p }));
    this.points = frame.points;
    this.movable = frame.movable;
    this.target = frame.target;
    this.magnet = magnetRadius(level);
    this.locked = false;
    this.flash = 0;
    this.pairs = null;
    const xs = this.solved.map((p) => p.x);
    const ys = this.solved.map((p) => p.y);
    // the corner may roam around the frame, but not into the water or up to the boom
    this.limits = {
      left: Math.min(...xs) - level.width * 0.4, right: Math.max(...xs) + level.width * 0.4,
      top: Math.min(...ys) - level.height * 0.55, bottom: bottom + 12,
    };
  }

  ring() {
    return { x: this.origin.x, y: this.origin.y + this.drop };
  }

  toStage(p) {
    const r = this.ring();
    if (!this.swing) return { x: r.x + p.x, y: r.y + p.y };
    const c = Math.cos(this.swing);
    const s = Math.sin(this.swing);
    return { x: r.x + p.x * c - p.y * s, y: r.y + p.x * s + p.y * c };
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
    const h = this.points[this.movable];
    return Math.hypot(h.x - this.target.x, h.y - this.target.y);
  }

  get withinReach() {
    return this.distance() <= this.magnet;
  }

  bottom() {
    return Math.max(...this.points.map((p) => p.y));
  }

  // The net's footprint everything in it must share: between the inner ends of its slanted
  // sides, so a fish there is inside the frame whichever way it leans.
  innerSpan() {
    const [a, b, c, d] = this.solved;
    return { left: Math.max(a.x, d.x), right: Math.min(b.x, c.x) };
  }

  contains(stagePoint) {
    return insideConvex(this.toNet(stagePoint), this.points);
  }

  // Moves the corner toward a wanted net point: kept inside its limits, never folding the
  // frame into a bow tie, and drawn toward its place once it comes near (the magnet).
  moveHandle(want) {
    const l = this.limits;
    const p = { x: Math.min(l.right, Math.max(l.left, want.x)), y: Math.min(l.bottom, Math.max(l.top, want.y)) };
    const d = Math.hypot(p.x - this.target.x, p.y - this.target.y);
    if (d < this.magnet) {
      const pull = (1 - d / this.magnet) ** 2 * 0.7;
      p.x += (this.target.x - p.x) * pull;
      p.y += (this.target.y - p.y) * pull;
    }
    const trial = this.points.map((q, i) => (i === this.movable ? p : q));
    if (!isSimpleQuad(trial)) return false;
    this.points[this.movable] = p;
    return true;
  }

  setHandle(p) {
    this.points[this.movable] = { x: p.x, y: p.y };
  }

  solve() {
    this.showSolved();
    this.flash = 1;
  }

  // The frame as a parallelogram, held still (how every net first arrives).
  showSolved() {
    this.points = this.solved.map((p) => ({ ...p }));
    this.locked = true;
  }

  showPairs() {
    this.pairs = 0.0001;
  }

  // Whether a pair of opposite sides is parallel (within a few degrees): pair 0 is the top
  // and bottom, pair 1 the left and right.
  pairParallel(pair) {
    const p = this.points;
    const [a, b, c, d] = pair === 0 ? [p[0], p[1], p[3], p[2]] : [p[1], p[2], p[0], p[3]];
    const turn = Math.atan2(b.y - a.y, b.x - a.x) - Math.atan2(d.y - c.y, d.x - c.x);
    return Math.abs(Math.atan2(Math.sin(turn), Math.cos(turn))) < 0.07;
  }

  update(dt) {
    this.time += dt;
    const want = this.locked ? 0 : Math.max(0, 1 - this.distance() / (this.magnet * 1.6));
    this.near += (want - this.near) * Math.min(1, dt * 10);
    if (this.wobble > 0) this.wobble = Math.max(0, this.wobble - dt / 0.45);
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt / 0.7);
    if (this.pairs) {
      this.pairs += dt / 0.9;
      if (this.pairs >= 1) this.pairs = null;
    }
  }

  // --- drawing --------------------------------------------------------------------
  draw(ctx, { waterline, pulley }) {
    if (!this.visible) return;
    const r = this.ring();
    const reach = Math.max(...this.points.map((p) => Math.hypot(p.x, p.y))) + 24;
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
    const rope = wet ? ROPE_WET : ROPE;
    const corners = this.points.map((p) => this.toStage(p));
    ctx.save();
    ctx.globalAlpha = this.alpha * (wet ? 0.9 : 1);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // the lifting rope down from the boom's pulley to the ring's shackle
    this.strokeRope(ctx, [{ x: pulley.x, y: pulley.y }, { x: ring.x, y: ring.y + 4 }], rope, 4.5);
    ctx.save();
    if (wet) ctx.filter = 'saturate(0.6) brightness(0.85)';
    PopoGame.drawRing(ctx, ring.x, ring.y);
    ctx.restore();

    // the sling: two ropes from the ring to the top corners carry the whole frame
    const knot = { x: ring.x, y: ring.y + PopoGame.RING_DEPTH - 4 };
    this.strokeRope(ctx, [corners[0], knot, corners[1]], rope, 4.5);

    if (!wet) {
      ctx.save();
      ctx.globalAlpha *= 0.18;
      ctx.translate(5, 8);
      ctx.lineWidth = 14;
      ctx.strokeStyle = '#061a33';
      this.framePath(ctx, corners);
      ctx.stroke();
      ctx.restore();
    }
    this.drawGenerated(ctx, wet);
    if (this.flash > 0) {
      // the frame lights up as the shape comes right
      ctx.save();
      ctx.globalAlpha *= this.flash * 0.7;
      ctx.lineWidth = 26;
      ctx.strokeStyle = '#fff1b0';
      this.framePath(ctx, corners);
      ctx.stroke();
      ctx.restore();
    }
    this.drawPairs(ctx, corners);
    if (!this.locked || this.pairs || this.flash > 0) this.drawMarks(ctx, corners);
    this.drawCorners(ctx, corners, wet);
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
      const map = (u,v) => lerp(lerp(p[0],p[1],u),lerp(p[3],p[2],u),v);
      // Registration is on the rope centreline; retain the outer floats and weights.
      const source = { x: 63, y: 110, w: 1645, h: 630 };
      const u0=-source.x/source.w, u1=(img.width-source.x)/source.w;
      const v0=-source.y/source.h, v1=(img.height-source.y)/source.h;
      const bounds=[map(u0,v0),map(u1,v0),map(u1,v1),map(u0,v1)];
      const left=Math.floor(Math.min(...bounds.map(q=>q.x)))-3;
      const top=Math.floor(Math.min(...bounds.map(q=>q.y)))-3;
      const width=Math.ceil(Math.max(...bounds.map(q=>q.x))-left)+3;
      const height=Math.ceil(Math.max(...bounds.map(q=>q.y))-top)+3;
      const canvas=this.textureCanvas || (this.textureCanvas=document.createElement('canvas'));
      canvas.width=width*2; canvas.height=height*2;
      const g=canvas.getContext('2d'); g.scale(2,2); g.translate(-left,-top);
      const triangle=(a,b,c) => {
        const q=[a,b,c].map(([u,v])=>map(u,v));
        const src=[a,b,c].map(([u,v])=>({x:source.x+u*source.w,y:source.y+v*source.h}));
        const [s0,s1,s2]=src, [d0,d1,d2]=q;
        const ax=s1.x-s0.x, ay=s1.y-s0.y, bx=s2.x-s0.x, by=s2.y-s0.y;
        const det=ax*by-ay*bx;
        const A=((d1.x-d0.x)*by-(d2.x-d0.x)*ay)/det;
        const B=((d1.y-d0.y)*by-(d2.y-d0.y)*ay)/det;
        const C=((d2.x-d0.x)*ax-(d1.x-d0.x)*bx)/det;
        const D=((d2.y-d0.y)*ax-(d1.y-d0.y)*bx)/det;
        const mid={x:(d0.x+d1.x+d2.x)/3,y:(d0.y+d1.y+d2.y)/3};
        g.save(); g.beginPath();
        q.forEach((point,i)=>{
          const dx=point.x-mid.x,dy=point.y-mid.y,k=0.35/(Math.hypot(dx,dy)||1);
          const x=point.x+dx*k,y=point.y+dy*k;
          if(i)g.lineTo(x,y);else g.moveTo(x,y);
        });
        g.closePath(); g.clip();
        g.transform(A,B,C,D,d0.x-A*s0.x-C*s0.y,d0.y-B*s0.x-D*s0.y);
        g.drawImage(img,0,0); g.restore();
      };
      for(let y=0;y<6;y++)for(let x=0;x<12;x++){
        const u=u0+(u1-u0)*x/12,v=v0+(v1-v0)*y/6;
        const r=u0+(u1-u0)*(x+1)/12,b=v0+(v1-v0)*(y+1)/6;
        triangle([u,v],[r,v],[r,b]); triangle([u,v],[r,b],[u,b]);
      }
      this.textureBounds={left,top,width,height};
    }
    const r=this.ring(), b=this.textureBounds;
    ctx.save(); ctx.translate(r.x,r.y); ctx.rotate(this.swing);
    if(wet)ctx.filter='saturate(.7) brightness(.88)';
    ctx.drawImage(this.textureCanvas,b.left,b.top,b.width,b.height);ctx.restore();
  }

  // Parallel marks on the sides, as in a geometry book: one chevron on the top and bottom,
  // two on the left and right. Faint until a pair is parallel, then bright green.
  drawMarks(ctx, c) {
    const edge = (i, j, count, lit) => {
      const a = c[i];
      const b = c[j];
      const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const ux = (b.x - a.x) / len;
      const uy = (b.y - a.y) / len;
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      for (let pass = 0; pass < 2; pass += 1) {
        if (pass) {
          ctx.lineWidth = lit ? 2.5 : 1.6;
          ctx.strokeStyle = lit ? '#8dffa6' : 'rgba(255, 255, 255, 0.6)';
        } else {
          ctx.lineWidth = lit ? 4.5 : 3;
          ctx.strokeStyle = lit ? '#2b5a2c' : 'rgba(40, 30, 10, 0.45)';
        }
        ctx.beginPath();
        for (let k = 0; k < count; k += 1) {
          const o = (k - (count - 1) / 2) * 9;
          const px = mx + ux * o;
          const py = my + uy * o;
          ctx.moveTo(px - ux * 7 - uy * 7, py - uy * 7 + ux * 7);
          ctx.lineTo(px + ux * 5, py + uy * 5);
          ctx.lineTo(px - ux * 7 + uy * 7, py - uy * 7 - ux * 7);
        }
        ctx.stroke();
      }
    };
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const top = this.pairParallel(0);
    const side = this.pairParallel(1);
    edge(0, 1, 1, top);
    edge(3, 2, 1, top);
    edge(1, 2, 2, side);
    edge(0, 3, 2, side);
    ctx.restore();
  }

  framePath(ctx, c) {
    ctx.beginPath();
    c.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.closePath();
  }

  // A twisted rope: dark edge, body, then light and dark twists sliding along it.
  strokeRope(ctx, pts, rope, width) {
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (const p of pts.slice(1)) ctx.lineTo(p.x, p.y);
    ctx.lineWidth = width + 4;
    ctx.strokeStyle = rope.outline;
    ctx.stroke();
    ctx.lineWidth = width;
    ctx.strokeStyle = rope.body;
    ctx.stroke();
    if (width < 4) return;
    ctx.save();
    ctx.setLineDash([width * 0.8, width * 0.8]);
    ctx.lineDashOffset = -this.ropePhase;
    ctx.lineWidth = width * 0.5;
    ctx.strokeStyle = rope.light;
    ctx.stroke();
    ctx.lineDashOffset = -this.ropePhase + width * 0.8;
    ctx.lineWidth = width * 0.3;
    ctx.strokeStyle = rope.dark;
    ctx.stroke();
    ctx.restore();
  }

  // After the shape comes right: top and bottom light up together, then left and right, to
  // show the two pairs of parallel sides.
  drawPairs(ctx, c) {
    if (!this.pairs) return;
    const k = this.pairs;
    const pair = k < 0.5 ? [[0, 1], [2, 3]] : [[1, 2], [3, 0]];
    const local = k < 0.5 ? k / 0.5 : (k - 0.5) / 0.5;
    const glow = Math.sin(local * Math.PI);
    ctx.save();
    ctx.globalAlpha *= glow * 0.85;
    ctx.lineWidth = 22;
    ctx.strokeStyle = '#8ff7a8';
    ctx.beginPath();
    for (const [i, j] of pair) {
      ctx.moveTo(c[i].x, c[i].y);
      ctx.lineTo(c[j].x, c[j].y);
    }
    ctx.stroke();
    ctx.lineWidth = 8;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
    ctx.restore();
  }

  // Fixed corners are quiet metal eyelets; the one that moves is a big bright knob.
  drawCorners(ctx, c, wet) {
    c.forEach((corner, i) => {
      const handle = i === this.movable && !this.locked;
      const p = handle && this.wobble ? { x: corner.x + Math.sin(this.time * 45) * 3 * this.wobble, y: corner.y } : corner;
      if (handle) {
        this.drawHandle(ctx, p);
        return;
      }
      ctx.beginPath();
      ctx.arc(p.x, p.y, 9, 0, TAU);
      ctx.lineWidth = 7;
      ctx.strokeStyle = '#2f3845';
      ctx.stroke();
      ctx.lineWidth = 4;
      ctx.strokeStyle = wet ? '#8a94a3' : '#aeb8c6';
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(p.x, p.y, 9, Math.PI * 1.1, Math.PI * 1.6);
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
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
}

Object.assign(PopoGame, { Net, isParallelogram, isSimpleQuad, area });
})(window.PopoGame = window.PopoGame || {});
