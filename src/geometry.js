(function (PopoGame) {
'use strict';

// Plain 2D geometry on {x, y} points, shared by the net and the level checks.
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y });
const times = (a, k) => ({ x: a.x * k, y: a.y * k });
const dot = (a, b) => a.x * b.x + a.y * b.y;
const cross = (a, b) => a.x * b.y - a.y * b.x;
const length = (a) => Math.hypot(a.x, a.y);
const distance = (a, b) => length(sub(a, b));
const midpoint = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

function normalize(a) {
  const l = length(a) || 1;
  return { x: a.x / l, y: a.y / l };
}

// Two directions are parallel when the sine of the angle between them is small. Comparing
// slopes would blow up on vertical sides; 0.06 is about three and a half degrees.
function parallel(u, v, tolerance = 0.06) {
  return Math.abs(cross(normalize(u), normalize(v))) < tolerance;
}

// The interior angle at `vertex` between its two neighbours, in degrees (0 to 180).
function angleAt(prev, vertex, next) {
  const u = sub(prev, vertex);
  const v = sub(next, vertex);
  const cos = dot(u, v) / ((length(u) * length(v)) || 1);
  return Math.acos(Math.max(-1, Math.min(1, cos))) * 180 / Math.PI;
}

// Where the lines through p1-p2 and p3-p4 cross; null when they are parallel.
function intersection(p1, p2, p3, p4) {
  const d = cross(sub(p2, p1), sub(p4, p3));
  if (Math.abs(d) < 1e-9) return null;
  return lerp(p1, p2, cross(sub(p3, p1), sub(p4, p3)) / d);
}

function area(poly) {
  let sum = 0;
  for (let i = 0; i < poly.length; i += 1) sum += cross(poly[i], poly[(i + 1) % poly.length]);
  return Math.abs(sum) / 2;
}

function segmentsCross(p1, p2, p3, p4) {
  const d1 = cross(sub(p4, p3), sub(p1, p3));
  const d2 = cross(sub(p4, p3), sub(p2, p3));
  const d3 = cross(sub(p2, p1), sub(p3, p1));
  const d4 = cross(sub(p2, p1), sub(p4, p1));
  return (d1 > 0) !== (d2 > 0) && (d3 > 0) !== (d4 > 0);
}

// No bow ties: a quadrilateral's opposite sides never cross each other.
function isSimpleQuad(p) {
  return !segmentsCross(p[0], p[1], p[2], p[3]) && !segmentsCross(p[1], p[2], p[3], p[0]);
}

// A quadrilateral the net can be: no crossed sides and real area.
function isValidQuad(p, minArea = 12000) {
  return isSimpleQuad(p) && area(p) > minArea;
}

function insideConvex(p, q) {
  let sign = 0;
  for (let i = 0; i < q.length; i += 1) {
    const c = cross(sub(q[(i + 1) % q.length], q[i]), sub(p, q[i]));
    if (c === 0) continue;
    if (sign === 0) sign = Math.sign(c);
    else if (Math.sign(c) !== sign) return false;
  }
  return true;
}

// Points turned about a centre by an angle in degrees.
function rotate(points, degrees, centre) {
  const a = degrees * Math.PI / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return points.map((p) => {
    const d = sub(p, centre);
    return { x: centre.x + d.x * c - d.y * s, y: centre.y + d.x * s + d.y * c };
  });
}

Object.assign(PopoGame, {
  geo: { sub, add, times, dot, cross, length, distance, midpoint, lerp, normalize, parallel, angleAt, intersection, area, isSimpleQuad, isValidQuad, insideConvex, rotate },
});
})(window.PopoGame = window.PopoGame || {});
