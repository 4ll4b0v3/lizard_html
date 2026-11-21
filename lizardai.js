'use strict';
// =====================================================================================
//  lizardai.js — port of LizardAI.cs for the pink lizard.
//  The utility comparer / Tracker / PreyTracker / StuckTracker modules are collapsed into
//  small inline stand-ins (see comments); the behaviours themselves (Idle, Hunt, Frustrated,
//  ReturnPrey) and AggressiveBehavior / IdleSpotScore are ported 1:1.
// =====================================================================================
const Behavior = { Idle: 'Idle', Hunt: 'Hunt', Frustrated: 'Frustrated', ReturnPrey: 'ReturnPrey' };

class StuckTracker {            // stand-in for StuckTracker + MoveBacklog
  constructor(ai) { this.ai = ai; this.positions = []; this.backlog = []; this.counter = 0; }
  update() {
    const L = this.ai.lizard;
    this.positions.push(L.mainBodyChunk.pos.clone()); if (this.positions.length > 40) this.positions.shift();
    const wants = !!L.followingConnection;
    if (this.positions.length >= 31 && wants && this.positions[0].dist(L.mainBodyChunk.pos) < 5) this.counter++;
    else this.counter = Math.max(0, this.counter - 2);
  }
  utility() { return clamp01((this.counter - 20) / 60); }
  reportMove(c) { this.backlog.push(c ? c.key() : ''); if (this.backlog.length > 20) this.backlog.shift(); }
  isMoveInLog(c, n) { const k = c.key(); return this.backlog.slice(-n).includes(k); }
}

class LizardAI {
  constructor(lizard) {
    this.lizard = lizard; this.room = lizard.room;
    this.pather = new Pather(this.room, this.room.aimap, lizard.lizardParams);
    this.stuckTracker = new StuckTracker(this);
    this.yellowAI = lizard.breed === 'yellow' ? new YellowAI(this) : null;
    this.reps = new Map();                // Tracker: Prey -> representation
    this.behavior = Behavior.Idle;
    this.excitement = 0.5; this.panic = 0; this.hunger = 0; this.fear = 0; this.runSpeed = 0; this.currentUtility = 0;
    this.preySmooth = 0; this.frustration = 0;
    this.idleCounter = 0; this.idleSpotWinStreak = 0; this.forbiddenIdleSpot = null; this.idleRestlessness = 0; this.unableToFindComfortablePosition = 0;
    this.focusCreature = null; this.casualAggressionTarget = null; this.attemptBiteFrames = 0;
    this.destination = null;
    this.den = { ...this.room.tileOf(lizard.mainBodyChunk.pos) };
  }

  // ---------------- helpers ----------------
  setDestination(t) { this.destination = { x: t.x, y: t.y }; this.pather.setDestination(t.x, t.y); }
  tile() { return this.lizard.coord; }
  bestGuessTile(rep) { return this.room.tileOf(rep.visual ? rep.creature.mainBodyChunk.pos : rep.lastPos); }
  chanceOfFinding(rep) { return rep.visual ? 1 : Math.max(0, 1 - rep.ticksSinceSeen / 700); }
  repUtility(rep) { return clamp01(rep.intensity * (rep.visual ? 1 : Math.max(0, 1 - rep.ticksSinceSeen / 700))); }
  get mostAttractivePrey() {
    let best = null, bu = 0;
    for (const r of this.reps.values()) { const u = this.repUtility(r) + (r.visual ? 0.01 : 0); if (u > bu) { bu = u; best = r; } }
    return best;
  }
  canSee(prey) {
    const L = this.lizard, P = L.lizardParams, main = L.mainBodyChunk, t = prey.mainBodyChunk;
    if (main.pos.dist(t.pos) > P.visualRadius) return false;
    // like LizardAI.VisualScore: the direction to the target is measured from the middle body chunk, not the head (a target on top of the head is dead ahead)
    const bodyDir = C.dirVec(L.bodyChunks[1].pos, main.pos), to = C.dirVec(L.bodyChunks[1].pos, t.pos);
    if (bodyDir.dot(to) < P.periferalVisionAngle) return false;
    return this.room.visualContact(main.pos, t.pos);
  }
  doIWantToHoldThisWithMyTongue(chunk) {   // DoIWantToHoldThisWithMyTongue: only things we'd go for the kill on
    if (!chunk || chunk.owner.room !== this.lizard.room || (this.unpleasantFallRisk(this.tile()) && this.unpleasantFallRisk(this.room.tileOf(chunk.pos)))) return false;
    return chunk.owner instanceof Prey && !chunk.owner.dead;
  }
  fallRisk(t) { return this.room.aimap.fallRiskY(t.x, t.y) < this.tile().y - 5; }
  unpleasantFallRisk(t) {
    const fy = this.room.aimap.fallRiskY(t.x, t.y);
    return fy < 0 || fy < t.y - 20;
  }

  // ---------------- Tracker (vision + hearing) ----------------
  updateTracker() {
    for (const o of this.room.objects) {
      if (!(o instanceof Prey)) continue;
      let rep = this.reps.get(o);
      if (o.dead && !(this.lizard.grasps[0] && this.lizard.grasps[0].grabbed === o)) { this.reps.delete(o); continue; }
      const vis = !o.dead && this.canSee(o);
      if (vis) {
        const first = !rep, resp = rep && rep.ticksSinceSeen > 60;
        if (!rep) { rep = { creature: o, visual: true, ticksSinceSeen: 0, age: 0, lastPos: o.mainBodyChunk.pos.clone(), intensity: o.hostility }; this.reps.set(o, rep); }
        rep.visual = true; rep.ticksSinceSeen = 0; rep.lastPos.copy(o.mainBodyChunk.pos); rep.intensity = o.hostility;
        if (first || resp) this.creatureSpotted(first, rep);
      } else if (rep) { rep.visual = false; rep.ticksSinceSeen++; }
    }
    for (const [o, rep] of this.reps) { rep.age++; if (rep.ticksSinceSeen > 800 || o.slated) { this.reps.delete(o); if (this.focusCreature === rep) this.focusCreature = null; } }
  }
  heardNoise(pos, strength, source) {
    const L = this.lizard;
    if (!(source instanceof Prey) || source.dead || !L.Consious) return;
    if (pos.dist(L.mainBodyChunk.pos) > strength) return;
    let rep = this.reps.get(source);
    if (!rep) { rep = { creature: source, visual: false, ticksSinceSeen: 0, age: 0, lastPos: pos.clone(), intensity: source.hostility }; this.reps.set(source, rep); }
    if (!rep.visual) { rep.lastPos.copy(pos); rep.ticksSinceSeen = 0; L.enterAnimation(LAnim.HearSound, false); }
  }
  creatureSpotted(firstSpot, rep) {
    const L = this.lizard;
    if (rep.intensity > (firstSpot ? 0.2 : 0.45) && !(L.grasps[0] && L.grasps[0].grabbed === rep.creature))
      L.enterAnimation(firstSpot ? LAnim.PreySpotted : LAnim.PreyReSpotted, false);
  }
  seeCreature(c) {   // LizardAI Collide -> tracker.SeeCreature
    if (!(c instanceof Prey) || c.dead) return;
    if (!this.reps.has(c)) this.reps.set(c, { creature: c, visual: true, ticksSinceSeen: 0, age: 0, lastPos: c.mainBodyChunk.pos.clone(), intensity: c.hostility });
  }
  bitCreature(chunk) {
    const L = this.lizard;
    if (!this.unpleasantFallRisk(this.tile())) L.enterAnimation(LAnim.ShakePrey, true);
  }

  // ---------------- behaviour selection (UtilityComparer collapsed) ----------------
  determineBehavior() {
    const L = this.lizard;
    let b = Behavior.Idle;
    const hunt = 0.6 * this.preySmooth;
    this.currentUtility = hunt;
    if (hunt >= 0.05) b = Behavior.Hunt; else this.currentUtility = 0.05;
    const gr = L.grasps[0];
    if (gr && gr.grabbed instanceof Prey) { b = Behavior.ReturnPrey; this.currentUtility = 1; }
    const best = this.mostAttractivePrey;
    if (b === Behavior.Hunt && best && this.frustration > 0.75 && this.chanceOfFinding(best) > 0.4 && C.distLess(L.mainBodyChunk.pos, this.room.middleOfTile(this.bestGuessTile(best)), 350))
      b = Behavior.Frustrated;
    return b;
  }

  update() {
    const L = this.lizard, P = L.lizardParams, room = this.room;
    L.coord = room.tileOf(L.mainBodyChunk.pos);
    this.pather.update(L.coord);
    this.updateTracker();
    if (this.yellowAI) this.yellowAI.update();
    this.stuckTracker.update();
    if (this.panic > 0) this.panic--;

    const best = this.mostAttractivePrey;
    this.preySmooth = lerp(this.preySmooth, best ? this.repUtility(best) : 0, 0.15);
    this.hunger = this.preySmooth;
    this.excitement = lerp(this.excitement, Math.max(this.hunger, this.fear), 0.1);
    // PreyTracker.frustration: prey known but the pathfinder can't get us any closer
    if (best) {
      const pt = this.bestGuessTile(best), dest = this.pather.destination;
      const stuckBelow = dest && Math.hypot(dest.x - pt.x, dest.y - pt.y) > 3 && C.manhattan(dest, L.coord) < 3;
      this.frustration = clamp01(this.frustration + (stuckBelow ? 0.006 : -0.02));
    } else this.frustration = clamp01(this.frustration - 0.02);

    this.behavior = this.determineBehavior();
    L.JawOpen -= 0.01;
    const b = this.behavior;

    if (b === Behavior.Hunt) {
      if (best) this.aggressiveBehavior(best, 1);
      this.runSpeed = lerp(this.runSpeed, Math.max(this.hunger, 0.3), 0.1);
    if (rnd() < 0.0125) L.voice.makeSound('BloodLust');
    } else if (b === Behavior.Idle) this.idleBehavior();
    else if (b === Behavior.ReturnPrey) {
      this.setDestination(this.den);
      this.runSpeed = lerp(this.runSpeed, Math.pow(Math.max(this.fear, 0.5), 0.5), 0.1);
    } else if (b === Behavior.Frustrated) {
      this.focusCreature = best;
      this.runSpeed = lerp(this.runSpeed, 1, 0.5);
      if (rnd() < 0.1 || (this.destination && C.manhattan(L.coord, this.destination) < 10)) {
        const wc = { x: rndInt(0, room.w), y: rndInt(0, room.h) };
        if (this.pather.reachable(wc.x, wc.y)) { this.setDestination(wc); this.idleRestlessness = rndInt(30, 100); }
      }
      if (rnd() < 0.0125) L.enterAnimation(LAnim.PreyReSpotted, false);
      if (rnd() < 0.0125) L.bodyWiggleCounter = Math.max(L.bodyWiggleCounter, Math.floor(rnd() * 100));
      if (rnd() < 0.0125) L.voice.makeSound('Frustration');
    }
    this.runSpeed = Math.max(this.runSpeed, this.stuckTracker.utility());

    // casual aggression: bite anything edible that comes close
    if (!L.grasps[0] && this.reps.size > 0) {
      const reps = [...this.reps.values()], rep = reps[rndInt(0, reps.length)];
      if (rep.visual && !rep.creature.dead && (!this.casualAggressionTarget || this.casualAggressionTarget.creature.dead ||
          L.mainBodyChunk.pos.dist(rep.creature.mainBodyChunk.pos) < L.mainBodyChunk.pos.dist(this.casualAggressionTarget.creature.mainBodyChunk.pos)))
        this.casualAggressionTarget = rep;
    }
    const cat = this.casualAggressionTarget;
    if (cat && cat.visual && !cat.creature.dead && rnd() < 0.5 && C.distLess(cat.creature.mainBodyChunk.pos, L.mainBodyChunk.pos, P.attemptBiteRadius)) L.attemptBite(cat.creature);
  }

  // ---------------- Idle (ported) ----------------
  idleBehavior() {
    const L = this.lizard, P = L.lizardParams, room = this.room, me = L.coord;
    let flag = true; const num = this.idleCounter; this.idleCounter--;
    if (!this.destination) { this.setDestination(me); this.idleCounter = 0; }
    else if (C.manhattan(me, this.destination) < 5) {
      this.idleCounter -= P.idleCounterSubtractWhenCloseToIdlePos; this.idleRestlessness--;
      flag = this.idleCounter < 1 || this.idleRestlessness > 0;
      if (!flag && !this.comfortableIdlePosition()) { this.unableToFindComfortablePosition++; flag = true; }
      else if (L.bodyChunks.some(c => c.vel.mag > 2)) this.unableToFindComfortablePosition++;
      else this.unableToFindComfortablePosition = 0;
      if (this.unableToFindComfortablePosition > 40) { this.idleCounter = 0; this.unableToFindComfortablePosition = 0; }
      else if (L.isTileSolid(0, 0, -1) && L.isTileSolid(1, 0, -1) && L.isTileSolid(2, 0, -1)) for (const c of L.bodyChunks) c.vel.y -= 0.1;
      if (this.idleRestlessness < 40 && rnd() < 0.0016666667) this.idleRestlessness = rndInt(1, 40);
    }
    if (this.idleSpotScore(this.destination) === Infinity) this.idleCounter = 0;
    if (this.idleCounter < 1) {
      if (num > 0) this.forbiddenIdleSpot = this.destination;
      const wc = { x: rndInt(0, room.w), y: rndInt(0, room.h) };
      if (this.idleSpotScore(wc) < this.idleSpotScore(this.destination)) { this.setDestination(wc); this.idleSpotWinStreak = 0; }
      else { this.idleSpotWinStreak++; if (this.idleSpotWinStreak > 50) { this.idleCounter = rndInt(1000, 4000); this.idleSpotWinStreak = 0; } }
    }
    if (flag) { if (!C.sameTile(this.forbiddenIdleSpot, this.destination)) this.runSpeed = lerp(this.runSpeed, 0.25, 0.5); }
    else this.runSpeed = lerp(this.runSpeed, 0, 0.5);
    if (rnd() < 0.00125) L.voice.makeSound('Boredom');
    this.focusCreature = null;
  }
  idleSpotScore(c) {
    const am = this.room.aimap, P = this.lizard.lizardParams;
    if (!c || !am.accessible(c.x, c.y, P) || !this.pather.reachable(c.x, c.y) || C.sameTile(c, this.forbiddenIdleSpot)) return Infinity;
    let num = 10;
    num /= lerp(am.visibility(c.x, c.y), 1, 0.9995);
    if (am.narrowAt(c.x, c.y)) num += 10;
    // pink-specific part of IdleSpotScore
    num += am.floorAltitude(c.x, c.y) * 2;
    if (am.narrowAt(c.x, c.y)) num -= 15;
    return num;
  }
  comfortableIdlePosition() {
    const L = this.lizard, room = this.room, c0 = L.bodyChunks[0], c1 = L.bodyChunks[1], c2 = L.bodyChunks[2];
    if (room.terrainAt(c0.pos.add(C.dirVec(c1.pos, c0.pos).mul(30))) === T.SOLID) return false;
    return room.tileOf(c0.pos).y === room.tileOf(c2.pos).y;
  }

  // ---------------- AggressiveBehavior (ported) ----------------
  aggressiveBehavior(rep, tongueChance) {
    const L = this.lizard, P = L.lizardParams, room = this.room, A = LAnim;
    this.casualAggressionTarget = null;
    this.setDestination(this.bestGuessTile(rep));
    const prey = rep.creature, main = L.mainBodyChunk;
    if (L.animation === A.PrepareToLounge) L.JawOpen = lerp(L.JawOpen, 0.2, 0.2);
    else if (L.animation === A.Lounge) L.JawOpen += 0.2;
    else if (L.animation === A.ShootTongue) { if (L.tongue.out) L.JawOpen += 0.1; else L.JawOpen = lerp(L.JawOpen, rnd(), 0.2); }
    else if (rep.visual) L.JawOpen = invLerp(400, 90 + P.biteInFront, main.pos.dist(prey.mainBodyChunk.pos));
    else L.JawOpen = lerp(L.JawOpen, invLerp(0.6, 0.9, this.hunger * this.hunger) * 0.7, 0.2);
    this.focusCreature = rep;
    if (!rep.visual) return;
    const me = L.coord, pt = room.tileOf(prey.mainBodyChunk.pos), am = room.aimap;
    if (L.loungeDelay < 1 && rnd() < P.loungeTendensy && !this.unpleasantFallRisk(me) && !this.fallRisk(me) && !this.unpleasantFallRisk(pt) &&
        C.distLess(main.pos, prey.mainBodyChunk.pos, P.loungeDistance) && !am.narrowAt(pt.x, pt.y) && !am.narrowAt(me.x, me.y) && L.legsGripping > 2)
      L.enterAnimation(A.PrepareToLounge, false);
    else if (L.tongue && L.tongue.ready && !L.grasps[0] && C.distLess(main.pos, prey.mainBodyChunk.pos, P.tongueAttackRange) &&
        !C.distLess(main.pos, prey.mainBodyChunk.pos, lerp(P.attemptBiteRadius, P.tongueAttackRange, 0.2)) && rnd() < P.tongueChance * tongueChance)
      L.enterAnimation(A.ShootTongue, false);
    if (rep.age > 120 && L.JawReadyForBite) {
      this.attemptBiteFrames++;
      for (const ch of prey.bodyChunks) if (C.distLess(ch.pos, main.pos, P.attemptBiteRadius)) { L.attemptBite(prey); break; }
    } else {
      if (this.attemptBiteFrames > 5) L.jawsSnapShut(prey.mainBodyChunk.pos);
      this.attemptBiteFrames = 0;
    }
  }
}
