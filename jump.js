'use strict';
// =====================================================================================
//  jump.js — port of LizardJumpModule.cs (the cyan lizard's pathfinding-driven jumps).
//  A "JumpFinder" throws random ballistic test jumps from a tile on the lizard's planned
//  path and keeps the one that lands on a tile closer to the goal. Not ported: smoke,
//  JumpLight / ShockWave / LizardBubble effects, charge sounds, the Spear gas leak, safari.
//  PathingCell costs come from the Pather's cost-to-destination field (one generation).
// =====================================================================================
const EIGHT = [{ x: -1, y: 0 }, { x: -1, y: 1 }, { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 1, y: 0 }, { x: 1, y: -1 }, { x: 0, y: -1 }, { x: -1, y: -1 }];

// tiles crossed by the segment a->b (pixel positions)
function rayTracedTiles(a, b) {
  const out = []; let x = Math.floor(a.x / TILE), y = Math.floor(a.y / TILE); const ex = Math.floor(b.x / TILE), ey = Math.floor(b.y / TILE);
  out.push({ x, y });
  const dx = b.x - a.x, dy = b.y - a.y, sx = Math.sign(dx), sy = Math.sign(dy);
  let tx = dx === 0 ? Infinity : ((sx > 0 ? (x + 1) * TILE - a.x : a.x - x * TILE) / Math.abs(dx));
  let ty = dy === 0 ? Infinity : ((sy > 0 ? (y + 1) * TILE - a.y : a.y - y * TILE) / Math.abs(dy));
  const stx = dx === 0 ? Infinity : TILE / Math.abs(dx), sty = dy === 0 ? Infinity : TILE / Math.abs(dy);
  for (let n = 0; n < 200 && (x !== ex || y !== ey); n++) {
    if (tx < ty) { x += sx; tx += stx; } else { y += sy; ty += sty; }
    out.push({ x, y });
  }
  return out;
}

class JumpFinder {
  constructor(room, owner, startPos, chainJump) {
    this.room = room; this.owner = owner; this.startPos = { x: startPos.x, y: startPos.y }; this.chainJump = chainJump;
    this.slated = false; this.fade = 0; this.bestJump = null; this.currentJump = null; this.landingDirection = null;
    this.pos = new V(); this.lastPos = new V(); this.vel = new V(); this.hasVenturedAwayFromTerrain = false;
    this.startCell = { x: startPos.x, y: startPos.y };
    this.newTest();
  }
  get beneficialMovement() {
    const o = this.owner, b = this.bestJump;
    if (!b || !b.goalCell) return false;
    const dest = o.lizard.AI.pather.destination, g = b.goalCell;
    return Math.hypot(this.startPos.x - g.x, this.startPos.y - g.y) > 5 && (!dest || Math.hypot(dest.x - g.x, dest.y - g.y) > 3) &&
      !o.pathWeightComparison(g, o.lizardCell) && !o.pathWeightComparison(g, this.startCell);
  }
  update() {
    const o = this.owner;
    if (o.inStandardRunMode) {
      this.fade++;
      if (!o.pathWeightComparison(o.lizardCell, this.startCell)) this.fade += 10;
      if (this.fade > 40) this.destroy();
    }
    for (let n = Math.max(1, Math.floor(100 / Math.max(1, o.jumpFinders.length))); n >= 0; n--) this.iterate();
    if (o.actOnJump !== this || !this.bestJump.goalCell) return;
    const am = this.room.aimap, goal = this.bestJump.goalCell;
    let best = goal;
    for (const d of EIGHT) { const c = { x: goal.x + d.x, y: goal.y + d.y }; if (o.pathWeightComparison(best, c)) best = c; }
    if (best !== goal) this.landingDirection = C.dirVec(this.room.middleOfTile(goal), this.room.middleOfTile(best));
  }
  iterate() {
    const room = this.room, am = room.aimap, o = this.owner, P = o.lizard.lizardParams;
    this.lastPos.copy(this.pos); this.pos.iadd(this.vel); this.vel.imul(0.999); this.vel.y -= 0.9;
    const tiles = rayTracedTiles(this.lastPos, this.pos), perp = C.perp(C.dirVec(this.lastPos, this.pos));
    const dest = o.lizard.AI.pather.destination, sp = this.startPos;
    for (const t of tiles) {
      if (am.solid(t.x, t.y) || t.y < 0 || am.narrowAt(t.x, t.y)) { this.newTest(); return; }
      const tType = room.get(t.x, t.y);
      if (!this.hasVenturedAwayFromTerrain && am.proxAt(t.x, t.y) > 1 && tType !== T.POLE) this.hasVenturedAwayFromTerrain = true;
      if (this.hasVenturedAwayFromTerrain && am.accessible(t.x, t.y, P) && (am.proxAt(t.x, t.y) === 1 || tType === T.POLE) &&
          Math.hypot(sp.x - t.x, sp.y - t.y) > clamp(Math.trunc(this.currentJump.initVel.mag / 3), 5, 20) && (!dest || Math.hypot(dest.x - t.x, dest.y - t.y) > 3)) {
        const cell = { x: t.x, y: t.y };
        if (o.pathWeightComparison(this.bestJump.goalCell, cell)) {
          const best = Object.assign({}, this.currentJump); best.goalCell = cell; this.bestJump = best;
          const m = room.middleOfTile(cell), dir = C.dirVec(this.lastPos, this.pos);
          best.grabWhenLanding = room.terrainAt(m.add(C.perp(dir).mul(15)).add(dir.mul(20))) !== T.SOLID;   // (the C# loop tests the same point three times)
        }
      }
      const w = lerpMap(this.currentJump.tick, 5, 20, 10, 20), mt = room.middleOfTile(t);
      if ((!am.solid(sp.x, sp.y + 1) && am.solid(t.x, t.y + 1)) || room.terrainAt(mt.add(perp.mul(w))) === T.SOLID || room.terrainAt(mt.sub(perp.mul(w))) === T.SOLID) { this.newTest(); return; }
    }
    this.currentJump.tick++;
    if (this.currentJump.tick > 700) this.newTest();
  }
  newTest() {
    const o = this.owner, L = o.lizard, room = this.room;
    let num = rnd() * Math.pow(L.AI.runSpeed, 0.5);
    if (room.aimap.proxAt(this.startPos.x, this.startPos.y) > 1) num *= 0.5;
    if (this.chainJump) num *= 0.5;
    let spd = lerp(14, 50, num);
    if (L.grasps[0]) spd *= 0.75;
    // (C# also scales by Lerp(1, ClampedHealth, ..) — health is always 1 here)
    const initVel = C.degToVec((45 * Math.pow(rnd(), 0.75) + 135 * Math.pow(rnd(), 2)) * (rnd() < 0.5 ? -1 : 1)).mul(spd);
    this.currentJump = { goalCell: null, tick: 0, startPos: room.middleOfTile(this.startPos), initVel, power: num, grabWhenLanding: false };
    this.pos = room.middleOfTile(this.startPos); this.lastPos = this.pos.clone(); this.vel = initVel.clone();
    this.hasVenturedAwayFromTerrain = false;
    if (!this.bestJump) this.bestJump = this.currentJump;
  }
  destroy() { this.slated = true; }
}

class LizardJumpModule {
  constructor(lizard) {
    this.lizard = lizard; this.jumpFinders = []; this.actOnJump = null; this.lizardCell = null; this.addDelay = 0; this.jumpCounter = 0; this.spin = 0; this.futurePath = [];
  }
  get room() { return this.lizard.room; }
  get jumpToPoint() { return this.room.middleOfTile(this.actOnJump.bestJump.goalCell); }
  get inStandardRunMode() { return !this.actOnJump && this.lizard.animation !== LAnim.PrepareToJump && this.lizard.animation !== LAnim.Jumping; }
  get canChainJump() { return this.lizard.breed === 'cyan' && !this.lizard.grasps[0]; }
  get noRunBehavior() { return !!this.actOnJump && this.lizard.animation === LAnim.Jumping && this.jumpCounter < this.actOnJump.bestJump.tick; }

  // PathWeightComparison: is cell B strictly closer to the goal than A? (a cell off the path counts as infinitely far)
  cost(c) { const p = this.lizard.AI.pather; return c && p.toDest && p.acc(c.x, c.y) ? p.toDest[p.idx(c.x, c.y)] : Infinity; }
  pathWeightComparison(A, B) {
    if (!A) return !!B;
    if (!B) return false;
    const cb = this.cost(B); if (!isFinite(cb)) return false;
    return cb < this.cost(A);
  }

  update() {
    const L = this.lizard;
    if (!this.room || L.dead) return;
    if (!L.Consious && (L.animation === LAnim.PrepareToJump || L.animation === LAnim.Jumping)) L.enterAnimation(LAnim.Standard, true);
    this.jumpFinders = this.jumpFinders.filter(f => !f.slated);
    for (const f of this.jumpFinders.slice()) f.update();
    if (L.animation === LAnim.Jumping) this.jumpingUpdate();
    else if (this.inStandardRunMode) this.runningUpdate();
    if (this.actOnJump && L.animation !== LAnim.PrepareToJump && L.animation !== LAnim.Jumping) {
      this.actOnJump.fade++;
      if (this.actOnJump.fade > 40) this.actOnJump = null;
    }
  }

  jumpingUpdate() {
    const L = this.lizard, room = this.room, P = L.lizardParams, bc = L.bodyChunks, am = room.aimap;
    this.jumpCounter++;
    let flag = false;
    if (!this.actOnJump) flag = true;
    else {
      const b = this.actOnJump.bestJump;
      if (this.jumpCounter > b.tick + 5) {     // missed the goal: grab any terrain
        for (const c of bc) if (am.accessiblePos(c.pos, P)) { bc[0].vel.imul(0.5); L.inAllowedTerrainCounter++; }
      } else {
        L.inAllowedTerrainCounter = 0;
        const ld = this.actOnJump.landingDirection;
        if (this.jumpCounter > b.tick - 30 && ld) { bc[0].vel.iadd(ld.mul(3)); bc[2].vel.isub(ld.mul(3)); }
        else if (this.spin === 0) {
          const d = C.dirVec(bc[1].pos, this.jumpToPoint).mul(lerpMap(this.jumpCounter, 10, 60, 2, 0));
          bc[0].vel.iadd(d); bc[2].vel.isub(d);
        } else if (am.proxAt(Math.floor(bc[1].pos.x / TILE), Math.floor(bc[1].pos.y / TILE)) > 2) {
          const nrm = C.perp(C.dirVec(bc[2].pos, bc[1].pos)).add(C.perp(C.dirVec(bc[1].pos, bc[0].pos))).normalized();
          const v = nrm.mul(this.spin * lerpMap(this.jumpCounter, 20, 60, 3, 0));
          bc[0].vel.iadd(v); bc[2].vel.isub(v);
          const g = L.graphics;
          if (g) {
            g.head.vel.iadd(nrm.mul(this.spin * 50));
            for (let j = 0; j < g.tail.length; j++) g.tail[j].vel.iadd(nrm.mul(this.spin * Math.sin(invLerp(0, g.tail.length - 1, j) * Math.PI) * 15));
          }
        }
      }
      const goal = this.jumpToPoint;
      for (const c of bc) {
        if (!C.distLess(c.pos, goal, 40)) continue;
        if (this.tryChainJump()) return;
        if (b.grabWhenLanding) L.gripPoint = goal.clone();
        flag = true; break;
      }
    }
    if (!flag && this.jumpCounter < this.actOnJump.bestJump.tick + 20) return;
    L.inAllowedTerrainCounter = P.regainFootingCounter + 5;
    if (this.actOnJump && this.actOnJump.bestJump.grabWhenLanding) for (const c of bc) c.vel.imul(0.5);
    this.actOnJump = null;
    L.enterAnimation(LAnim.Standard, true);
  }

  runningUpdate() {
    const L = this.lizard, room = this.room, pather = L.AI.pather;
    for (let i = this.jumpFinders.length - 1; i >= 0; i--) {
      const f = this.jumpFinders[i];
      if (!f.slated && L.coord.x === f.startPos.x && L.coord.y === f.startPos.y && f.beneficialMovement) this.initiateJump(f, false);
    }
    let wc = { x: L.coord.x, y: L.coord.y }; this.futurePath.length = 0; let flag = false;
    for (let i = 0; i < 10; i++) {
      const mc = pather.followPath(wc); if (!mc) break;
      wc = { x: mc.destCoord.x, y: mc.destCoord.y }; this.futurePath.push(wc);
      for (const f of this.jumpFinders) if (f.startPos.x === wc.x && f.startPos.y === wc.y) { f.fade = 0; flag = true; }
    }
    if (isFinite(this.cost(L.coord))) this.lizardCell = { x: L.coord.x, y: L.coord.y };
    if (this.addDelay > 0) this.addDelay--;
    else if (this.jumpFinders.length < (flag ? 1 : 4) && this.futurePath.length > 1) {
      const w = this.futurePath[rndInt(0, this.futurePath.length)];
      if (Math.hypot(w.x - L.coord.x, w.y - L.coord.y) > 2 && !room.aimap.narrowAt(w.x, w.y) && this.pathWeightComparison(this.lizardCell, w)) this.jumpFinders.push(new JumpFinder(room, this, w, false));
    }
  }

  initiateJump(jump, chainJump) {
    const L = this.lizard, room = this.room;
    if (!jump || !jump.bestJump || !jump.bestJump.goalCell) return;
    this.actOnJump = jump;
    L.enterAnimation(LAnim.PrepareToJump, true);
    if (chainJump) L.timeToRemainInAnimation = 10;
    else if (jump.bestJump.power > 0.75) L.timeToRemainInAnimation = 45;
    else if (jump.bestJump.power > 0.25) L.timeToRemainInAnimation = 30;
    else L.timeToRemainInAnimation = 15;
    L.loungeDir = C.dirVec(L.mainBodyChunk.pos, room.middleOfTile(jump.bestJump.goalCell));
    this.jumpCounter = 0;
    for (const f of this.jumpFinders) f.destroy();
    if (this.canChainJump && (this.actOnJump.chainJump || this.actOnJump.bestJump.power > 0.25)) this.jumpFinders.push(new JumpFinder(room, this, jump.bestJump.goalCell, true));
  }

  tryChainJump() {
    if (!this.canChainJump) return false;
    const L = this.lizard, room = this.room;
    for (const f of this.jumpFinders) {
      if (f.slated || !f.chainJump || !f.beneficialMovement) continue;
      for (const c of L.bodyChunks) {
        if (C.distLess(room.middleOfTile(f.startPos), c.pos, 40)) {
          for (const k of L.bodyChunks) k.vel.set(0, 0);
          L.inAllowedTerrainCounter = 1000; L.bodyChunks[1].pos = room.middleOfTile(f.startPos);
          this.initiateJump(f, true); return true;
        }
      }
    }
    return false;
  }

  jump() {
    const L = this.lizard, room = this.room, aj = this.actOnJump;
    if (!aj || !aj.bestJump) return;
    const b = aj.bestJump, vector = room.middleOfTile(aj.startPos), dir = b.initVel.normalized();
    L.bodyChunks.forEach((c, i) => c.pos.copy(vector.add(dir.mul((1 - i) * 8))));
    const v2 = vector.add(b.initVel).sub(L.bodyChunks[1].pos);
    for (const c of L.bodyChunks) { c.pos.iadd(v2); c.vel.copy(b.initVel); }
    L.movementAnimation = null; L.inAllowedTerrainCounter = 0; this.jumpCounter = 0; this.addDelay = 20; L.gripPoint = null;
    if (b.tick > 25 && L.bodyChunks[1].pos.sub(L.bodyChunks[0].pos).normalized().dot(dir) < lerp(-0.9, -0.1, Math.pow((L.AI.excitement + L.AI.runSpeed) / 2, 0.5))) this.spin = sign(b.initVel.x);
    else this.spin = 0;
  }
}
