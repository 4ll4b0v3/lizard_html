'use strict';
// =====================================================================================
//  tongue.js — port of LizardTongue.cs (white, blue, cyan and salamander tongues).
//  Not ported: the red "alpha" tongue (MMF option), Zoop / Indigo / Peach variants, spear
//  snatching, WaterDrip particles, sounds (no tongue SFX were supplied).
// =====================================================================================
const TS = { Hidden: 'Hidden', LashingOut: 'LashingOut', Attatched: 'Attatched', AttachedInSmallObject: 'AttachedInSmallObject', Retracting: 'Retracting', StuckInTerrain: 'StuckInTerrain' };

const TONGUE_PARAMS = {
  white:      { range: 540, elasticRange: 0.1,  lashOutSpeed: 30, reelInSpeed: 0.0033333334, chunkDrag: 0,    terrainDrag: 0,    dragElasticity: 0.05, emptyElasticity: 0.01, involuntaryReleaseChance: 0.000125,     voluntaryReleaseChance: 0.05 },
  salamander: { range: 140, elasticRange: 0.55, lashOutSpeed: 16, reelInSpeed: 0.000625,     chunkDrag: 0.01, terrainDrag: 0.01, dragElasticity: 0.1,  emptyElasticity: 0.8,  involuntaryReleaseChance: 0.0025,       voluntaryReleaseChance: 0.0125 },
  blue:       { range: 190, elasticRange: 0,    lashOutSpeed: 26, reelInSpeed: 0,           chunkDrag: 0.04, terrainDrag: 0.04, dragElasticity: 0,    emptyElasticity: 0.07, involuntaryReleaseChance: 0.0033333334, voluntaryReleaseChance: 1, baseDragOnly: true },
  cyan:       { range: 140, elasticRange: 0.55, lashOutSpeed: 16, reelInSpeed: 0.002,        chunkDrag: 0.01, terrainDrag: 0.01, dragElasticity: 0.1,  emptyElasticity: 0.8,  involuntaryReleaseChance: 0.005,        voluntaryReleaseChance: 0.02 },
};

class LizardTongue {
  constructor(lizard) {
    this.lizard = lizard; this.state = TS.Hidden;
    this.attachTerrainChance = 0.5; this.pullAtChunkRatio = 1; this.detatchMinDistanceTerrain = 20; this.detatchMinDistanceCreature = 20; this.totRExtraLimit = 40;
    this.baseDragOnly = false; this.attached = null; this.stuckCounter = 0; this.delay = 0; this.biteInanimate = false;
    this.dist = 0; this.reelIn = 1; this.vel = new V();
    Object.assign(this, TONGUE_PARAMS[lizard.breed]);
    this.totR = this.range * 1.1;
    this.lastPos = new V(); this.pos = new V(); this.graphPos = [new V(), new V()];
  }
  get totRange() { return this.totR * this.reelIn; }
  get elRange() { return this.totR * this.elasticRange * this.reelIn * this.reelIn; }
  get out() { return this.state !== TS.Hidden; }
  get ready() { return this.delay < 1; }
  drag(base) {
    if (this.baseDragOnly) return base * this.dist;
    return Math.max(base * this.dist, (this.dist < this.totRange ? this.dragElasticity : 1) * (this.dist - this.elRange) * invLerp(this.elRange, this.totRange, this.dist));
  }
  get chunkDragAmt() { return this.drag(this.chunkDrag); }
  get terrainDragAmt() { return this.drag(this.terrainDrag); }
  get stretched() { return invLerp(0, this.elRange, this.dist); }
  get superStretched() { return invLerp(this.elRange, this.totRange, this.dist); }
  get combinedStretched() { return invLerp(0, this.totR, this.dist); }
  get stuckToSomething() { return this.state === TS.Attatched || this.state === TS.StuckInTerrain; }

  update() {
    const L = this.lizard, room = L.room, main = L.mainBodyChunk, c0 = L.bodyChunks[0], c1 = L.bodyChunks[1];
    this.graphPos[1].copy(this.graphPos[0]);
    if (!L.Consious && this.state !== TS.Hidden) this.state = TS.Retracting;
    if (this.out) {
      if (this.state !== TS.Retracting && !room.visualContact(c0.pos, this.pos)) this.state = TS.Retracting;
      this.dist = this.pos.dist(main.pos);
      c0.vel.iadd(C.dirVec(c0.pos, this.pos).mul(4)); c1.vel.isub(C.dirVec(c0.pos, this.pos).mul(4));
      if (this.stuckToSomething && (this.reelIn < 0 || C.dirVec(c0.pos, this.pos).dot(C.dirVec(c1.pos, c0.pos)) < -0.5 || this.dist > this.totR + this.totRExtraLimit)) this.retract();
      if (this.state === TS.StuckInTerrain && this.dist < this.detatchMinDistanceTerrain) this.retract();
      if (this.state === TS.Attatched && this.dist < this.detatchMinDistanceCreature) this.retract();
      if (this.stuckToSomething) {
        this.stuckCounter++;
        if (L.AI.doIWantToHoldThisWithMyTongue(this.attached)) { if (rnd() < this.involuntaryReleaseChance && this.dist > this.elasticRange) this.retract(); }
        else if (rnd() < this.voluntaryReleaseChance) this.retract();
        if (L.breed === 'blue' && ((L.JawOpen < 0.1 && rnd() < 0.125) || rnd() < invLerp(20, 120, this.stuckCounter))) this.retract();
      } else this.stuckCounter = 0;
    }
    if (this.state === TS.Hidden) {
      if (this.delay > 0) this.delay--;
      this.lastPos.copy(main.lastPos); this.pos.copy(main.pos); this.graphPos[0].copy(this.pos); this.vel.set(0, 0);
    } else if (this.state === TS.LashingOut) {
      this.lastPos.copy(this.pos); this.pos.iadd(this.vel);
      this.vel.y -= 0.1;                                       // (water: vel *= 0.9 — this room has no water)
      this.graphPos[0].copy(this.pos);
      if (!C.distLess(this.pos, main.pos, this.totRange)) {
        const d = C.dirVec(this.pos, main.pos).mul(this.dist - this.totRange); this.vel.iadd(d); this.pos.iadd(d);
      } else if (!C.distLess(this.pos, main.pos, this.elRange)) this.vel.iadd(C.dirVec(this.pos, main.pos).mul((this.dist - this.elRange) * this.emptyElasticity));
      const rhs = C.dirVec(c1.pos, c0.pos);
      const hit = room.traceChunks(this.lastPos, this.pos, 3, L);
      this.attached = hit ? hit.chunk : null;
      if (this.attached) {
        this.pos.copy(hit.point);
        this.impact(); this.state = TS.Attatched;
        this.attached.vel.iadd(this.vel.mul(0.15 / this.attached.mass));
      } else if (room.terrainAt(this.pos) === T.SOLID) {
        let p = this.lastPos.clone();
        for (let n = 0; n < 1 && room.terrainAt(this.lastPos.lerpTo(this.pos, n)) !== T.SOLID; n += 0.05) p = this.lastPos.lerpTo(this.pos, n);
        this.pos.copy(p);
        this.state = rnd() < this.attachTerrainChance ? TS.StuckInTerrain : TS.Retracting;
        this.impact(); this.vel.set(0, 0);
      } else if (this.vel.normalized().dot(rhs) < 0) this.state = TS.Retracting;   // lashed backwards past the head
      L.JawOpen = clamp(L.JawOpen + 0.4, 0, 1);
    } else if (this.state === TS.Attatched) {
      const a = this.attached;
      if (a.owner.room !== L.room || a.owner.slated) this.retract();
      else {
        this.pos.copy(a.pos); this.vel.copy(a.vel); this.lastPos.copy(a.lastPos);
        this.graphPos[0].copy(this.pos.add(C.dirVec(this.pos, main.pos).mul(Math.max(a.rad - 7.5, 0))));
        this.reelIn -= this.reelInSpeed;
        if (rnd() < 0.5 && !C.distLess(main.pos, this.pos, lerp(this.elRange, this.totRange, 0.75))) this.reelIn = Math.min(this.reelIn + 0.01, 1);
        this.pullAtChunk();
      }
      if (this.attached && rnd() < lerp(0, 0.05, this.attached.owner.graspWiggle || 0)) this.retract();
    } else if (this.state === TS.Retracting || this.state === TS.AttachedInSmallObject) {
      this.lastPos.copy(this.pos); this.pos.iadd(this.vel); this.graphPos[0].copy(this.pos);
      const tgt = main.pos.add(C.dirVec(c1.pos, c0.pos).mul(this.dist * 0.5));
      this.vel = this.vel.lerpTo(C.dirVec(this.pos, tgt).mul((this.pos.dist(tgt) + 5) * 0.5), 0.5);
      if (!C.distLess(this.pos, main.pos, 10)) return;
      this.state = TS.Hidden; this.attached = null;
    } else if (this.state === TS.StuckInTerrain) {
      this.graphPos[0].copy(this.pos); this.vel.set(0, 0);
      const d = C.dirVec(main.pos, this.pos), t = this.terrainDragAmt;
      main.vel.iadd(d.mul(t)); main.pos.iadd(d.mul(t));
      this.reelIn -= this.reelInSpeed;
    }
  }

  lashOut(target) {
    const L = this.lizard, main = L.mainBodyChunk, c0 = L.bodyChunks[0], c1 = L.bodyChunks[1];
    target = new V(target.x, target.y + main.pos.dist(target) * 0.05);
    const lhs = C.dirVec(c1.pos, c0.pos), dir = C.dirVec(c0.pos, target);
    if (!(lhs.dot(dir) > 0.3)) return;
    const f = lerp(invLerp(this.elRange * 0.5, this.totR, main.pos.dist(target)), 1, 0.75);
    this.vel = dir.mul(this.lashOutSpeed * f);
    this.state = TS.LashingOut; this.reelIn = 1; this.delay = 20; this.biteInanimate = false; L.JawOpen = 1;
    if (L.breed !== 'blue') c1.vel.isub(dir.mul(this.lashOutSpeed)); else c1.vel.isub(dir.mul(5));
    const g = L.graphics;
    if (g) for (let i = 0; i < g.tongue.length; i++) {
      let v = this.vel.add(C.degToVec(rnd() * 360).mul(rnd() * this.lashOutSpeed * f * 0.75));
      v = L.breed === 'blue' ? c0.vel.clone() : C.slerp(v, C.dirVec(c0.pos, g.head.pos).mul(this.lashOutSpeed * f), i / g.tongue.length);
      g.tongue[i].vel = v;
    }
  }

  retract() { this.state = TS.Retracting; this.attached = null; }

  pullAtChunk() {
    const L = this.lizard, main = L.mainBodyChunk, a = this.attached;
    const dir = C.dirVec(main.pos, a.pos), m = main.mass / (main.mass + a.mass);
    const v2 = dir.mul(this.chunkDragAmt * (1 - m)); main.vel.iadd(v2); main.pos.iadd(v2);
    const v3 = dir.mul(this.chunkDragAmt * m * this.pullAtChunkRatio); a.vel.isub(v3); a.pos.isub(v3);
  }

  impact() {
    const g = this.lizard.graphics; if (!g) return;
    for (const t of g.tongue) {
      t.pos.iadd(C.degToVec(rnd() * 360).mul(rnd() * 0.5 * this.vel.mag));
      t.vel.iadd(C.degToVec(rnd() * 360).mul(rnd() * 0.5 * this.vel.mag));
    }
  }
}
