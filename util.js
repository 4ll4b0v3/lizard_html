'use strict';
// =====================================================================================
//  util.js — shared math helpers (Unity Mathf / Vector2 / RWCustom stand-ins).
//  Coordinate convention is the same as Rain World: y points UP, 1 tile = 20 px,
//  angles are degrees measured clockwise from "up" (so degToVec(0) = (0,1)).
// =====================================================================================
const TILE = 20;
const RAD2DEG = 180 / Math.PI;

// ---- random (swappable so per-lizard variations can be seeded like Random.InitState) ----
let _rng = Math.random;
const rnd = () => _rng();
const rndInt = (a, b) => a + Math.floor(rnd() * (b - a)); // [a, b)
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function withSeed(seed, fn) { const old = _rng; _rng = mulberry32(seed); try { return fn(); } finally { _rng = old; } }

// ---- Mathf ----
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const clamp01 = v => clamp(v, 0, 1);
const lerp = (a, b, t) => a + (b - a) * clamp01(t);              // Unity Mathf.Lerp clamps t
const invLerp = (a, b, v) => (a === b ? 0 : clamp01((v - a) / (b - a)));
const lerpMap = (v, a, b, c, d, e = 1) => lerp(c, d, Math.pow(invLerp(a, b, v), e));
const sign = v => (v < 0 ? -1 : 1);                               // Mathf.Sign(0) == 1
const moveTowardsF = (a, b, d) => (Math.abs(b - a) <= d ? b : a + Math.sign(b - a) * d);
const lerpAndTick = (a, b, l, tick) => moveTowardsF(lerp(a, b, l), b, tick);

// ---- Vector2 ----
class V {
  constructor(x = 0, y = 0) { this.x = x; this.y = y; }
  clone() { return new V(this.x, this.y); }
  set(x, y) { this.x = x; this.y = y; return this; }
  copy(o) { this.x = o.x; this.y = o.y; return this; }
  add(o) { return new V(this.x + o.x, this.y + o.y); }
  sub(o) { return new V(this.x - o.x, this.y - o.y); }
  mul(s) { return new V(this.x * s, this.y * s); }
  div(s) { return new V(this.x / s, this.y / s); }
  iadd(o) { this.x += o.x; this.y += o.y; return this; }
  isub(o) { this.x -= o.x; this.y -= o.y; return this; }
  imul(s) { this.x *= s; this.y *= s; return this; }
  get mag() { return Math.hypot(this.x, this.y); }
  normalized() { const m = this.mag; return m > 1e-9 ? new V(this.x / m, this.y / m) : new V(0, 0); }
  dot(o) { return this.x * o.x + this.y * o.y; }
  dist(o) { return Math.hypot(this.x - o.x, this.y - o.y); }
  lerpTo(o, t) { t = clamp01(t); return new V(this.x + (o.x - this.x) * t, this.y + (o.y - this.y) * t); }
  clampMag(m) { const c = this.mag; return c > m ? this.mul(m / c) : this.clone(); }
  isBad() { return !isFinite(this.x) || !isFinite(this.y); }
  static lerp(a, b, t) { return a.lerpTo(b, t); }
}

// ---- RWCustom ----
const C = {
  dirVec(a, b) { const dx = b.x - a.x, dy = b.y - a.y, m = Math.hypot(dx, dy); return m > 1e-9 ? new V(dx / m, dy / m) : new V(0, 1); },
  distLess(a, b, d) { const dx = a.x - b.x, dy = a.y - b.y; return dx * dx + dy * dy < d * d; },
  perp(v) { return new V(-v.y, v.x); },
  aim(a, b) { return Math.atan2(b.x - a.x, b.y - a.y) * RAD2DEG; },
  degToVec(d) { const r = d / RAD2DEG; return new V(Math.sin(r), Math.cos(r)); },
  rotate(v, deg) { const r = deg / RAD2DEG, s = Math.sin(r), c = Math.cos(r); return new V(v.x * c + v.y * s, -v.x * s + v.y * c); },
  rnv() { return C.degToVec(rnd() * 360); },
  slerp(a, b, t) {
    const ma = a.mag, mb = b.mag;
    if (ma < 1e-9 || mb < 1e-9) return a.lerpTo(b, t);
    const aa = Math.atan2(a.y, a.x); let d = Math.atan2(b.y, b.x) - aa;
    while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
    const ang = aa + d * clamp01(t), m = ma + (mb - ma) * clamp01(t);
    return new V(Math.cos(ang) * m, Math.sin(ang) * m);
  },
  moveTowards(a, b, max) { const d = b.sub(a), m = d.mag; return (m <= max || m < 1e-9) ? b.clone() : a.add(d.mul(max / m)); },
  manhattan(a, b) { return Math.abs(a.x - b.x) + Math.abs(a.y - b.y); },
  sameTile(a, b) { return !!a && !!b && a.x === b.x && a.y === b.y; },
  sCurve(x, k) { x = x * 2 - 1; if (x < 0) { x = Math.abs(1 + x); return k * x / (k - x + 1) * 0.5; } k = -1 - k; return 0.5 + k * x / (k - x + 1) * 0.5; },
  randomDeviation(k) { return C.sCurve(rnd() * 0.5, k) * 2 * (rnd() < 0.5 ? 1 : -1); },
  wrappedRandomVariation(f, d, k) { const n = f + C.randomDeviation(k) * d + 1; return n - Math.floor(n); },
  clampedRandomVariation(f, d, k) { return clamp01(f + C.randomDeviation(k) * d); },
  pushFromHalf(v, e) { if (v === 0.5) return 0.5; return v < 0.5 ? lerpMap(v, 0, 0.5, 0, 0.5, e) : lerpMap(v, 1, 0.5, 1, 0.5, e); },
  hsl2rgb(h, s, l) {
    h = ((h % 1) + 1) % 1;
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    const f = t => { t = ((t % 1) + 1) % 1; if (t < 1 / 6) return p + (q - p) * 6 * t; if (t < 0.5) return q; if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6; return p; };
    return [f(h + 1 / 3), f(h), f(h - 1 / 3)];
  },
  lerpCol(a, b, t) { t = clamp01(t); return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; },
  rgb(c, a = 1) { return `rgba(${Math.round(clamp01(c[0]) * 255)},${Math.round(clamp01(c[1]) * 255)},${Math.round(clamp01(c[2]) * 255)},${a})`; },
};

const FOUR = [{ x: -1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 0 }, { x: 0, y: -1 }];
const EIGHT_DIAG_LAST = [...FOUR, { x: -1, y: 1 }, { x: 1, y: 1 }, { x: 1, y: -1 }, { x: -1, y: -1 }];
