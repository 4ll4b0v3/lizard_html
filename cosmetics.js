'use strict';
// =====================================================================================
//  cosmetics.js — port of the LizardCosmetics namespace (Template, LizardScale, BodyScales,
//  LongBodyScales, LongShoulderScales, LongHeadScales, AxolotlGills, TailTuft, ShortBodyScales,
//  SpineSpikes, BumpHawk, TailFin, TailGeckoScales, WingScales, Whiskers, Antennae, JumpRings,
//  BodyStripes) plus LizardGraphics' per-breed cosmetic assignment (buildCosmetics).
//  Sprites come from the real atlas (LizardScaleA/B0-6, Circle20, pixel, tinyStar); TriangleMesh
//  cosmetics (whiskers, antennae, stripes) are drawn as canvas quads with the vertex colours.
//  Not ported: SnowAccumulation, MudOverlay, Caramel / Zoop / Indigo / Eel / Basilisk / Blizzard /
//  Peach branches, the LizardAntenna shader (the red overlay is drawn as a plain alpha strip).
// =====================================================================================
const rI = (a, b) => Math.floor(a + rnd() * (b - a));                       // Random.Range(int, int)
const vecToDeg = v => Math.atan2(v.x, v.y) * RAD2DEG;
const lerpMapP = (v, a, b, c, d, p) => lerp(c, d, Math.pow(invLerp(a, b, v), p));   // Custom.LerpMap(v, inL, inH, outL, outH, pow)
const clampedRV3 = (f, d, k) => C.clampedRandomVariation(f, d, k);
const lc = (a, b, t) => C.lerpCol(a, b, t);

class CosmeticTemplate {
  constructor(g) { this.g = g; this.numberOfSprites = 0; this.overlap = 'BehindHead'; }
  update() {} reset() {} draw(ctx, ts) {}
  scaleSprite(ctx, name, x, y, rot, sx, sy, col, ay, alpha = 1) {
    if (alpha < 1) { ctx.save(); ctx.globalAlpha = alpha; Atlas.draw(ctx, name, x, y, rot, sx, sy, col, 0.5, ay); ctx.restore(); }
    else Atlas.draw(ctx, name, x, y, rot, sx, sy, col, 0.5, ay);
  }
}

// a mesh made of MakeLongMesh quads: verts laid out 4 per segment (start pair, end pair), pointy tip = 3rd vertex of last segment
function drawLongMesh(ctx, v, cols, segs, tip) {
  const rgba = c => C.rgb(c, c[3] === undefined ? 1 : c[3]);
  const quad = (a, b, c, d, ca, cb) => {
    const m0 = v[a].lerpTo(v[b], 0.5), m1 = v[c].lerpTo(v[d], 0.5);
    let fill;
    if (m0.dist(m1) > 0.05) { fill = ctx.createLinearGradient(m0.x, m0.y, m1.x, m1.y); fill.addColorStop(0, rgba(ca)); fill.addColorStop(1, rgba(cb)); } else fill = rgba(cb);
    ctx.fillStyle = ctx.strokeStyle = fill; ctx.lineWidth = 0.4;
    ctx.beginPath(); ctx.moveTo(v[a].x, v[a].y); ctx.lineTo(v[b].x, v[b].y); ctx.lineTo(v[d].x, v[d].y); ctx.lineTo(v[c].x, v[c].y); ctx.closePath(); ctx.fill(); ctx.stroke();
  };
  for (let k = 0; k < segs; k++) {
    const b = k * 4;
    if (k < segs - 1 || !tip) {
      quad(b, b + 1, b + 2, b + 3, cols[b], cols[b + 2]);
      if (k < segs - 1) quad(b + 2, b + 3, b + 4, b + 5, cols[b + 2], cols[b + 4]);
    } else {
      ctx.fillStyle = ctx.strokeStyle = rgba(cols[b + 2]); ctx.lineWidth = 0.4;
      ctx.beginPath(); ctx.moveTo(v[b].x, v[b].y); ctx.lineTo(v[b + 1].x, v[b + 1].y); ctx.lineTo(v[b + 2].x, v[b + 2].y); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
  }
}

class LizardScale extends BodyPart {
  constructor(cosmetic) { super(cosmetic.g, 0, 0, 1); this.length = 0; this.width = 0; }
  update() { this.vel.imul(0.9); this.lastPos.copy(this.pos); this.pos.iadd(this.vel); }   // (underwater: vel *= 0.5 — no water here)
}

// ------------------------------------------------------------------------------------- BodyScales
class BodyScales extends CosmeticTemplate {
  constructor(g) { super(g); this.graphic = 0; this.scaleX = 0; this.colored = false; this.scalesPositions = []; }
  generatePatchPattern(startPoint, num, maxLength, lengthExponent) {
    const g = this.g; this.scalesPositions = [];
    const n = lerp(startPoint + 0.1, Math.max(startPoint + 0.2, maxLength), Math.pow(rnd(), lengthExponent));
    for (let i = 0; i < num; i++) {
      const v = C.degToVec(rnd() * 360).mul(rnd());
      this.scalesPositions.push(new V(v.x, lerp(startPoint * g.bodyLength / g.BodyAndTailLength, n * g.bodyLength / g.BodyAndTailLength, (v.y + 1) / 2)));
    }
  }
  generateTwoLines(startPoint, maxLength, lengthExponent, spacingScale) {
    const g = this.g;
    const n = lerp(startPoint + 0.1, Math.max(startPoint + 0.2, maxLength), Math.pow(rnd(), lengthExponent));
    const n2 = n * g.BodyAndTailLength; let n3 = lerp(2, 9, rnd());
    if (g.lizard.breed === 'blue') n3 = 2;
    n3 *= spacingScale;
    let n4 = Math.trunc(n2 / n3); if (n4 < 3) n4 = 3;
    this.scalesPositions = [];
    for (let i = 0; i < n4; i++) {
      const y = lerp(0, n, i / (n4 - 1)), x = 0.6 + 0.4 * Math.sin(i / (n4 - 1) * Math.PI);
      this.scalesPositions.push(new V(x, y), new V(-x, y));
    }
  }
  generateSegments(startPoint, maxLength, lengthExponent) {
    const g = this.g;
    const n = lerp(startPoint + 0.1, Math.max(startPoint + 0.2, maxLength), Math.pow(rnd(), lengthExponent));
    const n2 = n * g.BodyAndTailLength; let n3 = lerp(7, 14, rnd());
    if (g.lizard.breed === 'red') n3 = Math.min(n3, 11) * 0.75;
    const n4 = Math.max(3, Math.trunc(n2 / n3)), n5 = rI(1, 4) * 2;
    this.scalesPositions = [];
    for (let i = 0; i < n4; i++) {
      const y = lerp(0, n, i / (n4 - 1));
      for (let j = 0; j < n5; j++) {
        let x = 0.6 + 0.6 * Math.sin(i / (n4 - 1) * Math.PI);
        x *= lerp(-1, 1, j / (n5 - 1));
        this.scalesPositions.push(new V(x, y));
      }
    }
  }
  getBackPos(i, ts, changeDepth) {
    const p = this.scalesPositions[i], r = this.g.spinePosition(p.y, ts);
    const n = clamp(p.x + r.depthRotation, -1, 1);
    r.outerPos = r.pos.add(r.perp.mul(n * r.rad));
    if (changeDepth) r.depthRotation = n;
    return r;
  }
}

// ------------------------------------------------------------------------------------- LongBodyScales
class LongBodyScales extends BodyScales {
  constructor(g) { super(g); this.scaleObjects = []; this.backwardsFactors = []; this.graphicHeight = 1; this.rigor = 0; }
  update() {
    const g = this.g, P = this.scalesPositions, S = this.scaleObjects;
    for (let i = 0; i < S.length; i++) {
      const bp = this.getBackPos(i, 1, true);
      let a = bp.dir.lerpTo(C.dirVec(bp.pos, bp.outerPos), Math.abs(bp.depthRotation));
      if (P[i].y < 0.2) a = a.sub(C.degToVec(g.headRotation(1)).mul(Math.pow(invLerp(0.2, 0, P[i].y), 2) * 2));
      a = a.lerpTo(bp.dir, Math.pow(this.backwardsFactors[i], lerp(1, 15, g.showDominance))).normalized();
      const target = bp.outerPos.add(a.mul(S[i].length));
      if (!C.distLess(S[i].pos, target, S[i].length / 2)) {
        const d = C.dirVec(S[i].pos, target), dist = S[i].pos.dist(target), h = S[i].length / 2;
        S[i].pos.iadd(d.mul(dist - h)); S[i].vel.iadd(d.mul(dist - h));
      }
      S[i].vel.iadd(target.sub(S[i].pos).clampMag(lerp(10, 20, g.showDominance)).div(lerp(5, 1.5, this.rigor)));
      S[i].vel.imul(lerp(1, 0.8, this.rigor));
      if (g.showDominance > 0) S[i].vel.iadd(C.degToVec(rnd() * 360).mul(lerp(0, 6, g.showDominance)));
      S[i].connectToPoint(bp.outerPos, S[i].length, true, 0, new V(), 0, 0);
      S[i].update();
    }
  }
  reset() { const p = this.g.drawPositions[1][0]; for (const s of this.scaleObjects) s.reset(p); }
  colorA(i, ts) { return this.g.bodyColor(this.scalesPositions[i].y); }
  colorB(i, ts) { return this.g.lizard.breed === 'white' ? this.g.headColor(1) : this.g.effectColor; }
  draw(ctx, ts) {
    const n = this.scalesPositions.length, S = this.scaleObjects, back = [];
    for (let i = 0; i < n; i++) {
      const bp = this.getBackPos(i, ts, true);
      back.push({ x: bp.outerPos.x, y: bp.outerPos.y, rot: C.aim(bp.outerPos, S[i].lastPos.lerpTo(S[i].pos, ts)), sx: S[i].width * sign(bp.depthRotation), sy: S[i].length / this.graphicHeight });
    }
    for (let i = 0; i < n; i++) { const b = back[i]; Atlas.draw(ctx, 'LizardScaleA' + this.graphic, b.x, b.y, b.rot, b.sx, b.sy, this.colorA(i, ts), 0.5, 0.1); }
    if (this.colored) for (let i = 0; i < n; i++) { const b = back[i]; Atlas.draw(ctx, 'LizardScaleB' + this.graphic, b.x, b.y, b.rot, b.sx, b.sy, this.colorB(i, ts), 0.5, 0.1); }
  }
}
function scaleHeight(graphic) { const e = typeof Atlas !== 'undefined' && typeof ATLAS_FRAMES !== 'undefined' ? Atlas.el('LizardScaleA' + graphic) : null; return e ? e.H : 18; }

class LongShoulderScales extends LongBodyScales {
  constructor(g) {
    super(g); const T = g.lizard.breed; this.rigor = 0;
    let num = 0;
    if (T !== 'pink' || rnd() < 1 / 3) num = rI(0, 3);
    else if (T === 'green' || rnd() < 0.5) num = 2;
    if (num === 0) this.generatePatchPattern(0.05, rI(4, 15), 0.9, 2);
    else if (num === 1) this.generateTwoLines(0.07, 1, 1.5, 3);
    else this.generateSegments(0.1, 0.8, 5);
    this.moveScalesTowardsHead();
    const len = this.scalesPositions.length;
    let n2 = lerp(1, 1 / lerp(1, len, Math.pow(rnd(), 2)), 0.5);
    let n3 = lerp(5, 15, rnd()) * n2, b = lerp(n3, 35, Math.pow(rnd(), 0.5)) * n2;
    if (T === 'red') {
      if (len > 8) this.stretchDownOnBack(num === 0 ? 0.3 : 0.5);
      n2 = Math.max(0.5, n2); n3 = Math.max(10, n3) * 1.2; b = Math.max(25, b) * 1.2;
    }
    this.colored = T === 'green' || T === 'red' || rnd() < 0.4;
    this.graphic = rnd() < 0.1 ? rI(0, 7) : rI(3, 6);
    if (T === 'pink' && rnd() < 0.25) this.graphic = 0;
    if (T === 'red') { this.graphic = 0; if (rnd() < 0.3) { this.graphic = 3; this.scaleX = rnd() < 0.5 ? -1 : 1; } }
    this.graphicHeight = scaleHeight(this.graphic);
    let hi = 0, lo = 1;
    for (const p of this.scalesPositions) { if (p.y > hi) hi = p.y; if (p.y < lo) lo = p.y; }
    const pw = lerp(0.1, 0.9, rnd());
    for (let j = 0; j < len; j++) {
      const s = new LizardScale(this); this.scaleObjects.push(s);
      const n6 = Math.pow(invLerp(lo, hi, this.scalesPositions[j].y), pw), k = lerp(Math.sin(n6 * Math.PI), 1, n6 < 0.5 ? 0.5 : 0);
      s.length = lerp(n3, b, k); s.width = lerp(0.8, 1.2, k) * n2;
      this.backwardsFactors.push(this.scalesPositions[j].y * 0.7);
    }
    this.numberOfSprites = this.colored ? len * 2 : len;
  }
  moveScalesTowardsHead() {
    let m = 1; for (const p of this.scalesPositions) if (p.y < m) m = p.y;
    if (m > 0.07) { m -= 0.07; for (const p of this.scalesPositions) p.y -= m; }
  }
  stretchDownOnBack(to) {
    let lo = 1, hi = 0; for (const p of this.scalesPositions) { lo = Math.min(lo, p.y); hi = Math.max(hi, p.y); }
    if (!(hi > to)) for (const p of this.scalesPositions) p.y = lerpMap(p.y, lo, hi, lo, to);
  }
}

class LongHeadScales extends LongBodyScales {
  constructor(g) {
    super(g); const T = g.lizard.breed; this.overlap = 'InFront';
    this.rigor = rnd();
    // GenerateTwoHorns
    const y = lerp(0, 0.07, rnd()), nx = lerp(0.5, 1.5, rnd());
    this.scalesPositions = [new V(-nx, y), new V(nx, y)];
    const num = Math.pow(rnd(), 0.7) * g.lizard.lizardParams.headSize;
    this.colored = rnd() < 0.5 && T !== 'white';
    this.graphic = rI(4, 6);
    if (num < 0.5 && rnd() < 0.5) this.graphic = 6; else if (num > 0.8) this.graphic = 5;
    if (num < 0.2 && T !== 'white') this.colored = true;
    if (T === 'black') this.colored = false;
    this.graphicHeight = scaleHeight(this.graphic);
    const v = rnd(), n2 = Math.pow(rnd(), 0.85);
    for (let i = 0; i < 2; i++) {
      const s = new LizardScale(this); this.scaleObjects.push(s);
      s.length = lerp(5, 35, num); s.width = lerp(0.65, 1.2, v * num); this.backwardsFactors.push(n2);
    }
    this.numberOfSprites = this.colored ? 4 : 2;
  }
  colorA(i, ts) { return this.g.headColor(ts); }
  colorB(i, ts) { return this.g.effectColor; }
}

class AxolotlGills extends LongBodyScales {
  constructor(g) {
    super(g); this.rigor = rnd();
    const num = Math.pow(rnd(), 0.7) * g.lizard.lizardParams.headSize;
    this.colored = true; this.graphic = rI(0, 6); if (this.graphic === 2) this.graphic = rI(0, 6);
    this.graphicHeight = scaleHeight(this.graphic);
    const n2 = rI(2, 8), v = rnd(), n3 = lerp(0.1, 0.9, rnd());
    for (let i = 0; i < n2; i++) {
      const y = lerp(0, 0.07, Math.pow(rnd(), 1.3)), nx = lerp(0.5, 1.5, rnd()), n5 = lerp(0.2, 1, Math.pow(rnd(), 0.5)), n6 = Math.pow(rnd(), 0.5);
      for (let j = 0; j < 2; j++) {
        this.scalesPositions.push(new V(j === 0 ? -nx : nx, y));
        const s = new LizardScale(this); this.scaleObjects.push(s);
        s.length = lerp(5, 35, num * n5); s.width = lerp(0.65, 1.2, v * num); this.backwardsFactors.push(n3 * n6);
      }
    }
    this.numberOfSprites = this.scalesPositions.length * 2;
  }
  colorA(i, ts) { return this.g.headColor(ts); }
  colorB(i, ts) { return this.g.effectColor; }
}

class TailTuft extends LongBodyScales {
  constructor(g) {
    super(g); const T = g.lizard.breed; this.rigor = 0;
    if (rnd() < 1 / 7 || (rnd() < 0.9 && T === 'blue') || T === 'red') {
      if (T === 'blue' || T === 'red') this.generateTwoLines(0, T === 'red' ? 0.3 : 0.7, 1, 3);
      else this.generateTwoLines(0, 0.4, 1.2, 1.3);
    } else this.generatePatchPattern(0, rI(3, 7), 1.6, 1.5);
    this.moveScalesTowardsTail();
    const len = this.scalesPositions.length;
    let num = lerp(1, 1 / lerp(1, len, Math.pow(rnd(), 2)), 0.5);
    if (T === 'red') num = Math.max(num, 0.4) * 1.1;
    const a = lerp(5, 10, rnd()) * num, b = lerp(a, 25, Math.pow(rnd(), 0.5)) * num;
    this.colored = rnd() < 0.8;
    this.graphic = rI(3, 7); if (this.graphic === 3) this.graphic = 1;
    if (rnd() < 1 / 30) this.graphic = rI(0, 7);
    if (rnd() < 0.8 || T === 'red') {
      for (const c of g.cosmetics) {
        if (c instanceof LongBodyScales) { this.graphic = c.graphic; break; }
        if (c instanceof SpineSpikes) { this.graphic = c.graphic; break; }
      }
    }
    this.graphicHeight = scaleHeight(this.graphic);
    let hi = 0, lo = 1;
    for (const p of this.scalesPositions) { if (p.y > hi) hi = p.y; if (p.y < lo) lo = p.y; }
    const n4 = lerp(1, 1.5, rnd());
    for (let k = 0; k < len; k++) {
      const s = new LizardScale(this); this.scaleObjects.push(s);
      const t = invLerp(lo, hi, this.scalesPositions[k].y);
      s.length = lerp(a, b, t); s.width = lerp(0.8, 1.2, t) * num;
      this.backwardsFactors.push(0.3 + 0.7 * invLerp(0.75, 1, this.scalesPositions[k].y));
      this.scalesPositions[k].x *= invLerp(1.05, 0.85, this.scalesPositions[k].y) * n4;
    }
    this.numberOfSprites = this.colored ? len * 2 : len;
  }
  moveScalesTowardsTail() {
    let m = 0; for (const p of this.scalesPositions) if (p.y > m) m = p.y;
    for (const p of this.scalesPositions) p.y += 0.9 - m;
  }
}

// ------------------------------------------------------------------------------------- ShortBodyScales
class ShortBodyScales extends BodyScales {
  constructor(g) {
    super(g); const T = g.lizard.breed;
    let num = rI(0, 3);
    if (T === 'green' && rnd() < 0.7) num = 2; else if (T === 'blue' && rnd() < 0.93) num = 1;
    if (num === 0) this.generatePatchPattern(0.1, rI(4, 15), 0.9, 1.2);
    else if (num === 1) this.generateTwoLines(0.1, 1, 1.5, 1);
    else this.generateSegments(0.1, 0.9, T === 'pink' ? 1.5 : 0.6);
    this.numberOfSprites = this.scalesPositions.length;
  }
  draw(ctx, ts) {
    const col = this.g.headColor(ts);
    for (let i = 0; i < this.scalesPositions.length; i++) {
      const b = this.getBackPos(i, ts, true);
      Atlas.draw(ctx, 'pixel', b.outerPos.x, b.outerPos.y, C.aim(b.dir, b.dir.mul(-1)), 2, 3, col);
    }
  }
}

// ------------------------------------------------------------------------------------- SpineSpikes
class SpineSpikes extends CosmeticTemplate {
  constructor(g) {
    super(g); const T = g.lizard.breed;
    const num = lerp(5, 8, Math.pow(rnd(), 0.7));
    this.spineLength = lerp(0.2, 0.95, rnd()) * g.BodyAndTailLength;
    this.sizeRangeMin = lerp(0.1, 0.5, Math.pow(rnd(), 2));
    this.sizeRangeMax = lerp(this.sizeRangeMin, 1.1, rnd());
    if (rnd() < 0.5) this.sizeRangeMax = 1;
    if (T === 'blue') { this.sizeRangeMin = Math.min(this.sizeRangeMin, 0.3); this.sizeRangeMax = Math.min(this.sizeRangeMax, 0.6); }
    else if (T !== 'green' && rnd() < 0.7) { this.sizeRangeMin *= 0.7; this.sizeRangeMax *= 0.7; }
    else if (T === 'green' && rnd() < 0.7) { this.sizeRangeMin = lerp(this.sizeRangeMin, 1.1, 0.1); this.sizeRangeMax = lerp(this.sizeRangeMax, 1.1, 0.4); }
    this.sizeSkewExponent = lerp(0.1, 0.9, rnd());
    this.bumps = Math.trunc(this.spineLength / num); this.scaleX = 1;
    this.graphic = rI(0, 5); if (this.graphic === 1) this.graphic = 0;
    if (this.graphic === 4) this.graphic = 3;
    else if (this.graphic === 3 && rnd() < 0.5) this.scaleX = -1;
    else if (rnd() < 1 / 15) this.scaleX = -1;
    if (T === 'pink' && rnd() < 0.7) this.graphic = 0; else if (T === 'green' && rnd() < 0.5) this.graphic = 3;
    this.colored = rI(0, 3);
    if (T === 'pink' && rnd() < 0.5) this.colored = 0;
    else if (T === 'green' && rnd() < 0.5) this.colored = 2;
    else if (T === 'green' && rnd() < 0.5) this.colored = 1;
    this.numberOfSprites = this.colored > 0 ? this.bumps * 2 : this.bumps;
  }
  draw(ctx, ts) {
    const g = this.g, n = this.bumps, items = [];
    for (let i = 0; i < n; i++) {
      const n2 = invLerp(0, n - 1, i), f = lerp(0.05, this.spineLength / g.BodyAndTailLength, n2), sp = g.spinePosition(f, ts);
      const rot = C.aim(sp.perp.mul(-sp.depthRotation), sp.perp.mul(sp.depthRotation));
      const s = lerp(this.sizeRangeMin, this.sizeRangeMax, Math.sin(Math.pow(n2, this.sizeSkewExponent) * Math.PI));
      items.push({ sp, f, n2, rot, sx: sign(g.depthRotation) * this.scaleX * s, sy: s * Math.max(0.2, invLerp(0, 0.5, Math.abs(g.depthRotation))) });
    }
    for (const it of items) Atlas.draw(ctx, 'LizardScaleA' + this.graphic, it.sp.outerPos.x, it.sp.outerPos.y, it.rot, it.sx, it.sy, g.bodyColor(it.f), 0.5, 0.15);
    if (this.colored > 0) for (const it of items) {
      const col = this.colored === 1 ? g.effectColor : lc(g.effectColor, g.bodyColor(it.f), Math.pow(it.n2, 0.5));
      Atlas.draw(ctx, 'LizardScaleB' + this.graphic, it.sp.outerPos.x, it.sp.outerPos.y, it.rot, it.sx, it.sy, col, 0.5, 0.15);
    }
  }
}

// ------------------------------------------------------------------------------------- BumpHawk
class BumpHawk extends CosmeticTemplate {
  constructor(g) {
    super(g); this.coloredHawk = rnd() < 0.5; let num;
    if (this.coloredHawk) {
      num = lerp(3, 8, Math.pow(rnd(), 0.7)); this.spineLength = lerp(0.3, 0.7, rnd()) * g.BodyAndTailLength;
      this.sizeRangeMin = lerp(0.1, 0.2, rnd()); this.sizeRangeMax = lerp(this.sizeRangeMin, 0.35, Math.pow(rnd(), 0.5));
    } else {
      num = lerp(6, 12, Math.pow(rnd(), 0.5)); this.spineLength = lerp(0.3, 0.9, rnd()) * g.BodyAndTailLength;
      this.sizeRangeMin = lerp(0.2, 0.3, Math.pow(rnd(), 0.5)); this.sizeRangeMax = lerp(this.sizeRangeMin, 0.5, rnd());
    }
    this.sizeSkewExponent = lerp(0.1, 0.7, rnd());
    this.bumps = Math.trunc(this.spineLength / num); this.numberOfSprites = this.bumps;
  }
  draw(ctx, ts) {
    const g = this.g, n = this.bumps, white = g.lizard.breed === 'white';
    for (let i = 0; i < n; i++) {
      const n2 = invLerp(0, n - 1, i), f = lerp(0.05, this.spineLength / g.BodyAndTailLength, n2), sp = g.spinePosition(f, ts);
      const sc = lerp(this.sizeRangeMin, this.sizeRangeMax, lerp(Math.sin(Math.pow(n2, this.sizeSkewExponent) * Math.PI), 1, n2 < 0.5 ? 0.5 : 0));
      let col = g.bodyColor(f);
      if (this.coloredHawk) col = lc(g.headColor(ts), g.bodyColor(f), n2); else if (white) col = g.dynamicBodyColor(n2);
      Atlas.draw(ctx, 'Circle20', sp.outerPos.x, sp.outerPos.y, 0, sc, sc, col);
    }
  }
}

// ------------------------------------------------------------------------------------- TailFin
class TailFin extends CosmeticTemplate {
  constructor(g) {
    super(g); const T = g.lizard.breed;
    const num = lerp(4, 7, Math.pow(rnd(), 0.7));
    this.spineLength = clampedRV3(0.5, 0.17, 0.5) * g.BodyAndTailLength;
    this.undersideSize = lerp(0.3, 0.9, rnd());
    this.sizeRangeMin = lerp(0.1, 0.3, Math.pow(rnd(), 2)); this.sizeRangeMax = lerp(this.sizeRangeMin, 0.6, rnd());
    this.sizeSkewExponent = lerp(0.5, 1.5, rnd());
    this.graphic = rI(0, 6);
    if (T === 'red') {
      this.graphic = 0;
      for (const c of g.cosmetics) if (c instanceof LongBodyScales) { this.graphic = c.graphic; break; }
      this.sizeRangeMin *= 2; this.sizeRangeMax *= 1.5;
      this.spineLength = clampedRV3(0.3, 0.17, 0.5) * g.BodyAndTailLength;
    }
    this.bumps = Math.trunc(this.spineLength / num);
    this.scaleX = lerp(1, 2, rnd());
    if (this.graphic === 3 && rnd() < 0.5) this.scaleX = -this.scaleX; else if (this.graphic !== 0 && rnd() < 1 / 15) this.scaleX = -this.scaleX;
    this.colored = rnd() > 1 / 3;
    this.numberOfSprites = (this.colored ? this.bumps * 2 : this.bumps) * 2;
  }
  draw(ctx, ts) {
    const g = this.g, n = this.bumps;
    for (let i = 0; i < 2; i++) {
      const items = [];
      for (let k = 0; k < n; k++) {
        const n3 = invLerp(0, n - 1, k), sp = g.spinePosition(lerp(1 - this.spineLength / g.BodyAndTailLength, 1, n3), ts);
        const pos = i === 0 ? sp.outerPos : sp.pos.add(sp.pos.sub(sp.outerPos).mul(0.85));
        const rot = vecToDeg(sp.perp.mul(sp.depthRotation).lerpTo(sp.dir.mul(i !== 1 ? 1 : -1), n3));
        const s = lerp(this.sizeRangeMin, this.sizeRangeMax, Math.sin(Math.pow(n3, this.sizeSkewExponent) * Math.PI));
        items.push({ pos, rot, sx: sign(g.depthRotation) * this.scaleX * s, sy: s * Math.max(0.2, invLerp(0, 0.5, Math.abs(g.depthRotation))) * (i === 1 ? -this.undersideSize : 1), n3 });
      }
      items.forEach((it, k) => {
        const f = lerp(0.05, this.spineLength / g.BodyAndTailLength, invLerp(0, n - 1, k));
        Atlas.draw(ctx, 'LizardScaleA' + this.graphic, it.pos.x, it.pos.y, it.rot, it.sx, it.sy, g.bodyColor(f), 0.5, 0.15);
      });
      if (this.colored) items.forEach(it => this.scaleSprite(ctx, 'LizardScaleB' + this.graphic, it.pos.x, it.pos.y, it.rot, it.sx, it.sy, g.effectColor, 0.15,
        i === 1 ? Math.pow(invLerp(0.3, 1, Math.abs(g.depthRotation)), 0.2) : 1));
    }
  }
}

// ------------------------------------------------------------------------------------- TailGeckoScales
class TailGeckoScales extends CosmeticTemplate {
  constructor(g) {
    super(g); this.bigScales = false;
    this.rows = rI(7, 14); this.lines = rI(3, rI(3, 4));
    if (g.iVars.tailColor > 0.1 && rnd() < lerp(0.7, 0.99, g.iVars.tailColor)) {
      this.bigScales = true;
      for (const c of g.cosmetics) if (c instanceof WingScales) { if (c.scaleLength > 10) this.bigScales = false; break; }
    }
    if (rnd() < 0.5) { this.rows += rI(0, rI(0, 7)); this.lines += rI(0, rI(0, 3)); }
    this.numberOfSprites = this.rows * this.lines;
  }
  draw(ctx, ts) {
    const g = this.g, rows = this.rows, lines = this.lines, dr = lerp(g.lastDepthRotation, g.depthRotation, ts);
    if (this.bigScales) {
      let sp1 = g.spinePosition(0.4, ts);
      for (let i = 0; i < rows; i++) {
        const num = invLerp(0, rows - 1, i), s2 = lerp(0.5, 0.99, Math.pow(num, 0.8)), sp2 = g.spinePosition(s2, ts), a = g.bodyColor(s2);
        for (let j = 0; j < lines; j++) {
          let n3 = (j + (i % 2 === 0 ? 0.5 : 0)) / (lines - 1); n3 = -1 + 2 * n3 + dr;
          if (n3 < -1) n3 += 2; else if (n3 > 1) n3 -= 2;
          const v1 = sp1.pos.add(sp1.perp.mul((sp1.rad + 0.5) * n3)), v2 = sp2.pos.add(sp2.perp.mul((sp2.rad + 0.5) * n3));
          const mid = v1.add(v2).mul(0.5), rot = C.aim(v1, v2);
          const sx = lerpMap(Math.abs(n3), 0.4, 1, sp2.rad * 3.5 / rows, 0) / 10, sy = v1.dist(v2) * 1.1 / 20;
          let col;
          if (g.iVars.tailColor > 0) {
            let n4 = invLerp(0.5, 1, Math.abs(C.dirVec(v2, v1).dot(C.degToVec(-45 + 120 * n3))));
            n4 = lerpMap(Math.abs(n3), 0.5, 1, 0.3, 0) + 0.7 * Math.pow(n4 * Math.pow(g.iVars.tailColor, 0.3), lerp(2, 0.5, num));
            if (num < 0.5) n4 *= lerpMap(num, 0, 0.5, 0.2, 1);
            n4 = Math.pow(n4, lerp(2, 0.5, num));
            col = n4 < 0.5 ? lc(a, g.effectColor, invLerp(0, 0.5, n4)) : lc(g.effectColor, WHITE, invLerp(0.5, 1, n4));
          } else col = lc(a, g.effectColor, lerpMapP(num, 0, 0.8, 0.2, lerpMap(Math.abs(n3), 0.5, 1, 0.8, 0.4), 0.8));
          Atlas.draw(ctx, 'Circle20', mid.x, mid.y, rot, sx, sy, col);
        }
        sp1 = sp2;
      }
      return;
    }
    for (let k = 0; k < rows; k++) {
      const f = invLerp(0, rows - 1, k), n5 = lerp(0.4, 0.95, Math.pow(f, 0.8)), sp = g.spinePosition(n5, ts);
      const col = lc(g.bodyColor(n5), g.effectColor, 0.2 + 0.8 * Math.pow(f, 0.5));
      for (let l = 0; l < lines; l++) {
        let n6 = (l + (k % 2 === 0 ? 0.5 : 0)) / (lines - 1); n6 = -1 + 2 * n6 + dr;
        if (n6 < -1) n6 += 2; else if (n6 > 1) n6 -= 2;
        n6 = sign(n6) * Math.pow(Math.abs(n6), 0.6);
        const p = sp.pos.add(sp.perp.mul((sp.rad + 0.5) * n6));
        Atlas.draw(ctx, 'tinyStar', p.x, p.y, vecToDeg(sp.dir), lerpMap(Math.abs(n6), 0.4, 1, 1, 0), 1, col);
      }
    }
  }
}

// ------------------------------------------------------------------------------------- WingScales
class WingScales extends CosmeticTemplate {
  constructor(g) {
    super(g); this.overlap = 'InFront';
    const cols = rnd() < 0.2 ? 3 : 2; this.cols = cols;
    this.graphic = rnd() < 0.4 ? 0 : rI(0, 5);
    this.graphicLenght = scaleHeight(this.graphic);
    this.sturdy = rnd(); this.posSqueeze = rnd();
    this.scaleLength = lerp(5, 40, Math.pow(rnd(), 0.75 + 1.25 * this.sturdy));
    this.frontDir = lerp(-0.1, 0.2, rnd());
    this.backDir = lerp(Math.max(0, this.frontDir), this.frontDir + cols * 0.2, rnd());
    this.scales = [[], []];
    for (let i = 0; i < 2; i++) for (let j = 0; j < cols; j++) this.scales[i][j] = new GenericBodyPart(g, 2, 0.5, lerp(0.8, 0.999, this.sturdy), g.lizard.bodyChunks[1]);
    this.numberOfSprites = 2 * cols;
  }
  reset() { for (const row of this.scales) for (const s of row) { s.pos.copy(s.connection.pos); s.lastPos.copy(s.connection.pos); s.vel.set(0, 0); } }
  update() {
    const g = this.g, L = g.lizard, cols = this.cols;
    for (let i = 0; i < cols; i++) {
      const num = lerpMap(i, 0, cols - 1, this.frontDir, this.backDir);
      const sp = g.spinePosition(0.025 + (0.025 + 0.15 * i) * this.posSqueeze, 1);
      const f = lerp(g.headDepthRotation, sp.depthRotation, 0.3 + 0.2 * i);
      for (let j = 0; j < 2; j++) {
        const sd = j === 0 ? -1 : 1;
        const v = sp.pos.add(sp.perp.mul(sd * sp.rad * (1 - Math.abs(f))));
        let v2 = sp.perp.mul(sd * (1 - Math.abs(f)));
        v2 = C.slerp(v2, sp.dir.mul(num), Math.abs(num));
        v2 = C.slerp(v2, sp.perp.mul(sign(f)), Math.abs(f) * 0.5);
        const v3 = v.add(v2.mul(this.scaleLength * 1.5)), s = this.scales[j][i];
        s.update();
        s.connectToPoint(v, this.scaleLength * (i > 1 ? 0.6 : 1), false, 0, L.bodyChunks[1].vel, 0.1 + 0.2 * this.sturdy, 0);
        s.vel.iadd(v3.sub(s.pos).mul(lerp(0.1, 0.3, this.sturdy)));
        s.pos.iadd(v3.sub(s.pos).mul(0.6 * Math.pow(this.sturdy, 3)));
      }
    }
    if (L.animation !== LAnim.PrepareToJump || !L.Consious) return;
    for (const row of this.scales) for (const s of row) {
      s.vel.iadd(C.rnv().mul(3 * rnd()).add(C.dirVec(L.bodyChunks[1].pos, L.bodyChunks[0].pos).mul(rnd() * 5)));
      s.pos.iadd(C.rnv().mul(3 * rnd()));
    }
  }
  draw(ctx, ts) {
    const g = this.g;
    for (let j = 0; j < 2; j++) for (let i = 0; i < this.cols; i++) {
      const sp = g.spinePosition(0.025 + (0.025 + 0.15 * i) * this.posSqueeze, ts), s = this.scales[j][i];
      const v = sp.pos.add(sp.perp.mul((j === 0 ? -1 : 1) * sp.rad * (1 - Math.abs(sp.depthRotation)))), v2 = s.lastPos.lerpTo(s.pos, ts);
      Atlas.draw(ctx, 'LizardScaleA' + this.graphic, v.x, v.y, C.aim(v, v2), j === 0 ? -1 : 1, v.dist(v2) / this.graphicLenght, BLACK, 0.5, 0);
    }
  }
}

// ------------------------------------------------------------------------------------- Whiskers
class Whiskers extends CosmeticTemplate {
  constructor(g) {
    super(g); this.overlap = 'InFront';
    const n = this.amount = rI(3, 5);
    this.whiskers = [[], []]; this.dirs = []; this.props = []; this.lightUp = [];
    for (let i = 0; i < n; i++) {
      this.whiskers[0][i] = new GenericBodyPart(g, 1, 0.6, 0.9, g.lizard.mainBodyChunk);
      this.whiskers[1][i] = new GenericBodyPart(g, 1, 0.6, 0.9, g.lizard.mainBodyChunk);
      this.dirs[i] = C.degToVec(lerp(4, 100, rnd()));
      const p = [clampedRV3(0.5, 0.4, 0.5) * 40, lerp(-0.5, 0.8, rnd()), 0, rnd(), lerp(0.6, 1.2, Math.pow(rnd(), 1.6))];
      p[2] = lerp(11, 720, Math.pow(rnd(), 1.5)) / p[0];
      this.props[i] = p; this.lightUp[i] = [[0, 0], [0, 0]];
      if (i > 0) for (let j = 0; j < 5; j++) if (j !== 1) p[j] = lerp(p[j], this.props[i - 1][j], Math.pow(rnd(), 0.3) * 0.6);
    }
    this.numberOfSprites = n * 2;
  }
  reset() { for (let i = 0; i < 2; i++) for (let j = 0; j < this.amount; j++) this.whiskers[i][j].reset(this.anchor(i, j, 1)); }
  whiskerDir(side, m, ts) {
    const g = this.g, d = lerp(g.lastHeadDepthRotation, g.headDepthRotation, ts);
    const v = new V((side === 0 ? -1 : 1) * (1 - Math.abs(d)) * this.dirs[m].x + d * this.props[m][1], this.dirs[m].y).normalized();
    return C.rotate(v, C.aim(g.drawPositions[0][1].lerpTo(g.drawPositions[0][0], ts), g.head.lastPos.lerpTo(g.head.pos, ts)));
  }
  anchor(side, m, ts) {   // MMF anchor
    const g = this.g;
    return g.head.lastPos.lerpTo(g.head.pos, ts).add(C.degToVec(g.headRotation(ts)).mul(2.85 * g.iVars.headSize)).add(this.whiskerDir(side, m, ts));
  }
  update() {
    const g = this.g, L = g.lizard;
    for (let i = 0; i < 2; i++) for (let j = 0; j < this.amount; j++) {
      const w = this.whiskers[i][j], lu = this.lightUp[j][i], tgt = invLerp(0, 0.3, g.blackLizardLightUpHead);
      w.vel.iadd(this.whiskerDir(i, j, 1).mul(this.props[j][2]));
      w.vel.y -= 0.6;
      w.update();
      w.connectToPoint(this.anchor(i, j, 1), this.props[j][0], false, 0, L.mainBodyChunk.vel, 0, 0);
      if (!C.distLess(g.head.pos, w.pos, 200)) w.pos.copy(g.head.pos);
      lu[1] = lu[0];
      if (lu[0] < tgt) lu[0] = lerp(lu[0], tgt, 0.7) + 0.05; else lu[0] -= 0.025;
      lu[0] += lerp(-1, 1, rnd()) * 0.03 * g.blackLizardLightUpHead;
      lu[0] = clamp01(lu[0]);
    }
  }
  draw(ctx, ts) {
    const g = this.g, hr = C.degToVec(g.headRotation(ts)), hc = g.headColor(ts);
    for (let i = 0; i < this.amount; i++) for (let j = 0; j < 2; j++) {
      const w = this.whiskers[j][i], end = w.lastPos.lerpTo(w.pos, ts), anchor = this.anchor(j, i, ts), dir = this.whiskerDir(j, i, ts).add(hr).normalized();
      const verts = [], cols = [], lu = lerp(this.lightUp[i][j][1], this.lightUp[i][j][0], ts);
      let prev = anchor, num = this.props[i][4], num2 = 1;
      for (let k = 0; k < 4; k++) {
        let p6;
        if (k < 3) p6 = anchor.lerpTo(end, (k + 1) / 4).add(dir.mul(num2 * this.props[i][0] * 0.2)); else p6 = end.clone();
        num2 *= 0.7;
        const nrm = p6.sub(prev).normalized(), perp = C.perp(nrm), n3 = p6.dist(prev) / (k === 0 ? 1 : 5), n4 = lerpMap(k, 0, 3, this.props[i][4], 0.5);
        const c = lc(hc, WHITE, (k - 1) / 2 * lu);
        for (let l = k * 4; l < k * 4 + (k === 3 ? 3 : 4); l++) cols[l] = c;
        const w8 = perp.mul((n4 + num) * 0.5);
        verts[k * 4] = prev.sub(w8).add(nrm.mul(n3)); verts[k * 4 + 1] = prev.add(w8).add(nrm.mul(n3));
        if (k < 3) { const w9 = perp.mul(n4); verts[k * 4 + 2] = p6.sub(w9).sub(nrm.mul(n3)); verts[k * 4 + 3] = p6.add(w9).sub(nrm.mul(n3)); }
        else verts[k * 4 + 2] = p6.add(nrm.mul(2.1));
        num = n4; prev = p6;
      }
      drawLongMesh(ctx, verts, cols, 4, true);
    }
  }
}

// ------------------------------------------------------------------------------------- Antennae
class Antennae extends CosmeticTemplate {
  constructor(g) {
    super(g); this.overlap = 'InFront';
    this.length = rnd();
    this.segments = Math.floor(lerp(3, 8, Math.pow(this.length, lerp(1, 6, this.length))));
    this.alpha = this.length * 0.9 + rnd() * 0.1;
    this.antennae = [[], []];
    for (let i = 0; i < this.segments; i++) { this.antennae[0][i] = new GenericBodyPart(g, 1, 0.6, 0.9, g.lizard.mainBodyChunk); this.antennae[1][i] = new GenericBodyPart(g, 1, 0.6, 0.9, g.lizard.mainBodyChunk); }
    const e = g.effectColor; this.redderTint = [lerp(e[0], 1, 0.75), e[1] * 0.5, e[2] * 0.5];
    this.numberOfSprites = 4;
  }
  get comm() { const y = this.g.lizard.AI.yellowAI; return y && y.commFlicker || 0; }
  reset() { for (let i = 0; i < 2; i++) for (let j = 0; j < this.segments; j++) this.antennae[i][j].reset(this.anchor(i, 1)); }
  dir(side, ts) {
    const g = this.g, d = lerp(g.lastHeadDepthRotation, g.headDepthRotation, ts);
    return C.rotate(new V((side === 0 ? -1 : 1) * (1 - Math.abs(d)) * 1.5 + d * 3.5, -1).normalized(), C.aim(g.drawPositions[0][1].lerpTo(g.drawPositions[0][0], ts), g.head.lastPos.lerpTo(g.head.pos, ts)));
  }
  anchor(side, ts) { const g = this.g; return g.drawPositions[0][1].lerpTo(g.drawPositions[0][0], ts).add(this.dir(side, ts).mul(3 * g.iVars.headSize)); }
  update() {
    const g = this.g, L = g.lizard, A = this.antennae, seg = this.segments;
    const num = L.Consious ? this.comm : 0, n2 = lerp(10, 7, this.length);
    for (let i = 0; i < 2; i++) for (let j = 0; j < seg; j++) {
      let a = j / (seg - 1); a = lerp(a, invLerp(0, 5, j), 0.2);
      const s = A[i][j];
      s.vel.iadd(this.dir(i, 1).mul(1 - a + 0.6 * num));
      s.vel.y -= 0.4 * a * (1 - num);
      s.update();
      s.pos.iadd(C.rnv().mul(3 * num));
      let p;
      if (j === 0) {
        s.vel.iadd(this.dir(i, 1).mul(5)); p = g.head.pos;
        s.connectToPoint(this.anchor(i, 1), n2, true, 0, L.mainBodyChunk.vel, 0, 0);
      } else {
        p = j !== 1 ? A[i][j - 2].pos : this.anchor(i, 1);
        const v = C.dirVec(s.pos, A[i][j - 1].pos), d = s.pos.dist(A[i][j - 1].pos), v2 = v.mul((n2 - d) * 0.5);
        s.pos.isub(v2); s.vel.isub(v2); A[i][j - 1].pos.iadd(v2); A[i][j - 1].vel.iadd(v2);
      }
      s.vel.iadd(C.dirVec(p, s.pos).mul(3 * Math.pow(1 - a, 0.3)));
      if (j > 1) A[i][j - 2].vel.iadd(C.dirVec(s.pos, A[i][j - 2].pos).mul(3 * Math.pow(1 - a, 0.3)));
      if (!C.distLess(g.head.pos, s.pos, 200)) s.pos.copy(g.head.pos);
    }
  }
  effectColor(part, tip, ts, flicker) {
    const g = this.g; tip = Math.pow(invLerp(0, 0.6, tip), 0.5);
    if (part === 0) return lc(g.headColor(ts), lc(g.effectColor, BLACK, flicker), tip);
    const c = lc(this.redderTint, WHITE, flicker); return [c[0], c[1], c[2], this.alpha];
  }
  draw(ctx, ts) {
    const g = this.g, L = g.lizard, seg = this.segments, comm = this.comm;
    let flicker = Math.pow(rnd(), 1 - 0.5 * comm) * comm; if (!L.Consious) flicker = 0;
    for (let k = 0; k < 2; k++) for (let i = 0; i < 2; i++) {
      let prev = g.head.lastPos.lerpTo(g.head.pos, ts).lerpTo(this.anchor(i, ts), 0.5), num = 1, num2 = 0;
      const verts = [], cols = [];
      for (let j = 0; j < seg; j++) {
        const n3 = j / (seg - 1), p2 = this.antennae[i][j].lastPos.lerpTo(this.antennae[i][j].pos, ts), nrm = p2.sub(prev).normalized(), perp = C.perp(nrm);
        const n4 = p2.dist(prev) / 5, n5 = lerp(3, 1, Math.pow(n3, 0.8)), v4 = perp.mul((num + n5) * 0.5), v5 = perp.mul(n5);
        verts[j * 4] = prev.sub(v4).add(nrm.mul(n4)); verts[j * 4 + 1] = prev.add(v4).add(nrm.mul(n4));
        cols[j * 4] = cols[j * 4 + 1] = this.effectColor(k, (n3 + num2) / 2, ts, flicker); cols[j * 4 + 2] = this.effectColor(k, n3, ts, flicker);
        if (j < seg - 1) { verts[j * 4 + 2] = p2.sub(v5).sub(nrm.mul(n4)); verts[j * 4 + 3] = p2.add(v5).sub(nrm.mul(n4)); cols[j * 4 + 3] = cols[j * 4 + 2]; }
        else verts[j * 4 + 2] = p2.clone();
        num = n5; prev = p2; num2 = n3;
      }
      drawLongMesh(ctx, verts, cols, seg, true);
    }
  }
}

// ------------------------------------------------------------------------------------- JumpRings
class JumpRings extends CosmeticTemplate {
  constructor(g) { super(g); this.overlap = 'InFront'; this.numberOfSprites = 8; }
  draw(ctx, ts) {
    const g = this.g, L = g.lizard, b = lerp(g.lastDepthRotation, g.depthRotation, ts), a = lerp(g.lastHeadDepthRotation, g.headDepthRotation, ts);
    let color = g.headColor(ts), num = 1;
    if (L.animation === LAnim.PrepareToJump) {
      num = 0.5 + 0.5 * invLerp(L.timeToRemainInAnimation, 0, L.timeInAnimation);
      color = lc(g.headColor(ts), lc(WHITE, g.effectColor, num), rnd());
    }
    const sprites = [[], []];   // part 0 then part 1
    const dp0 = g.drawPositions[0][1].lerpTo(g.drawPositions[0][0], ts), head = g.head.lastPos.lerpTo(g.head.pos, ts), tail0 = g.tail[0].lastPos.lerpTo(g.tail[0].pos, ts);
    for (let i = 0; i < 2; i++) {
      const sp = g.spinePosition(0.06 + 0.12 * i, ts); let dir = sp.dir; const pos = sp.pos;
      if (i === 0) dir = dir.sub(C.dirVec(dp0, head)).normalized();
      const perp = C.perp(dir), n2 = 50 * lerp(a, b, i === 0 ? 0.25 : 0.5);
      for (let j = 0; j < 2; j++) {
        const v3 = C.degToVec(n2 + (j === 0 ? -40 : 40));
        let p = pos.add(perp.mul(sp.rad * v3.x)), v4 = dir;
        v4 = i !== 0 ? v4.add(C.dirVec(p, tail0).mul(2 * Math.abs(v3.y))).normalized() : v4.sub(C.dirVec(p, head).mul(2 * Math.abs(v3.y))).normalized();
        const rot = vecToDeg(v4), t = Math.pow(clamp01(Math.abs(v3.x)), 2);
        sprites[0].push({ x: p.x, y: p.y, rot, sx: v3.y > 0 ? lerp(0.45, 0, t) : 0, sy: 0.55, col: color });
        p = pos.add(perp.mul((sp.rad + 2 * Math.pow(clamp01(Math.abs(v3.x) * Math.abs(v3.y)), 0.5)) * v3.x)).sub(v4.mul((1 - num) * 4));
        sprites[1].push({ x: p.x, y: p.y, rot, sx: v3.y > 0 ? lerp(0.27, 0, t) * num : 0, sy: 0.33 * num, col: BLACK });
      }
    }
    for (const part of sprites) for (const s of part) if (s.sx > 0.001) Atlas.draw(ctx, 'Circle20', s.x, s.y, s.rot, s.sx, s.sy, s.col);
  }
}

// ------------------------------------------------------------------------------------- BodyStripes
class BodyStripes extends CosmeticTemplate {
  constructor(g) {
    super(g);
    const num2 = lerp(0.4, 0.8, rnd()), num3 = num2 * g.BodyAndTailLength;
    const num4 = lerp(5, 12, rnd()) * 1.5; let n5 = Math.trunc(num3 / num4); if (n5 < 3) n5 = 3;
    this.scalesPositions = [];
    for (let i = 0; i < n5; i++) {
      const y = lerp(0, num2, i / (n5 - 1)), x = 0.6 + 0.4 * Math.sin(i / (n5 - 1) * Math.PI);
      this.scalesPositions.push(new V(x, y), new V(-x, y));
    }
    this.numberOfSprites = this.scalesPositions.length;
  }
  getBackPos(i, ts) { return BodyScales.prototype.getBackPos.call(this, i, ts, true); }
  draw(ctx, ts) {
    const g = this.g;
    for (let i = 0; i < this.scalesPositions.length; i++) {
      const bp = this.getBackPos(i, ts), bp2 = this.getBackPos(i % 2 === 0 ? i + 1 : i - 1, ts);
      const d = bp.outerPos.dist(bp2.outerPos), ang = C.aim(bp.outerPos, bp2.outerPos), perp = C.perp(C.degToVec(ang));
      const v2 = bp.outerPos, v3 = v2.add(C.degToVec(ang).mul(d * 0.5));
      const verts = [v2.sub(perp.mul(0.5)), v2.add(perp.mul(0.5)), v3.sub(perp.mul(3)), v3.add(perp.mul(3))];
      const c0 = g.bodyColor(ts), c1 = g.effectColor;   // (sic: BodyColor(timeStacker))
      drawLongMesh(ctx, verts, [c0, c0, c1, c1], 1, false);
    }
  }
}

// ------------------------------------------------------------------------------------- assignment (LizardGraphics ctor)
function buildCosmetics(g) {
  const T = g.lizard.breed, list = g.cosmetics = [];
  const add = c => { list.push(c); return c; };
  if (T === 'cyan') {
    if (rnd() < 0.75) add(new WingScales(g));
    if (!(rnd() < 0.5) || g.iVars.tailColor !== 0) add(new TailGeckoScales(g)); else add(new TailTuft(g));
    add(new JumpRings(g));
  } else if (T !== 'white') {
    let n8 = 0, flag = false, flag2 = false;
    if (rnd() < 1 / 15 || (rnd() < 0.8 && T === 'green') || (rnd() < 0.7 && T === 'black')) { add(new SpineSpikes(g)); n8++; }
    else if (rnd() < 1 / 30) { add(new BumpHawk(g)); n8++; }
    else if ((rnd() < 1 / 21 || (T === 'pink' && rnd() < 0.5) || (T === 'red' && rnd() < 0.9)) && T !== 'salamander') { add(new LongShoulderScales(g)); flag = true; n8++; }
    else if ((rnd() < 0.0625 || (T === 'blue' && rnd() < 0.5)) && T !== 'salamander') { add(new ShortBodyScales(g)); flag2 = true; n8++; }
    else if (T === 'green' && rnd() < 0.5) { add(new ShortBodyScales(g)); flag2 = true; n8++; }
    if (T !== 'salamander') {
      if (rnd() < 1 / 9 || (n8 === 0 && rnd() < 0.7) || (T === 'pink' && rnd() < 0.6) || (T === 'blue' && rnd() < 0.96)) add(new TailTuft(g));
      else if (n8 < 2 && T === 'green' && rnd() < 0.7) {
        if ((rnd() < 0.5) | flag | flag2) add(new TailTuft(g));
        else { add(new LongShoulderScales(g)); flag = true; n8++; }
      }
    }
    if (rnd() < (n8 === 0 ? 0.7 : 0.1) && T !== 'salamander' && T !== 'yellow' && ((!flag && rnd() < 0.9) || rnd() < 1 / 30)) add(new LongHeadScales(g));
    if (T === 'salamander') { add(new AxolotlGills(g)); add(new TailFin(g)); }
    else if (T === 'black') add(new Whiskers(g));
    else if (T === 'yellow') {
      add(new Antennae(g));
      if (n8 === 0 && rnd() < 0.6) { add(new ShortBodyScales(g)); flag2 = true; n8++; }
    } else if (T === 'red') {
      add(new LongShoulderScales(g)); flag = true; n8++;
      add(new SpineSpikes(g)); n8++;
      if (rnd() < 0.5) add(new TailFin(g)); else add(new TailTuft(g));
    }
  } else {
    if (rnd() < 0.4) add(new BumpHawk(g));
    else if (rnd() < 0.4) add(new ShortBodyScales(g));
    else if (rnd() < 0.2) add(new LongShoulderScales(g));
    else if (rnd() < 0.2) add(new LongHeadScales(g));
    if (rnd() < 0.5) add(new TailTuft(g));
  }
  return list;
}
