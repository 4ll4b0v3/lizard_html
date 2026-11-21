'use strict';
// =====================================================================================
//  lizard.js — port of Lizard.cs (pink-relevant paths: Act, FollowConnection, ActAnimation,
//  EnterAnimation, Bite/AttemptBite, MovementAnimation, GripPointBehavior, CarryObject).
//  Left out: swimming, burrowing, tongue/spit/jump modules, rot, safari control, shortcuts.
// =====================================================================================
const LAnim = { Standard: 0, HearSound: 1, PreyReSpotted: 2, PreySpotted: 3, FightingStance: 4, ThreatSpotted: 5, ThreatReSpotted: 6,
  ShootTongue: 7, Spit: 8, PrepareToJump: 9, Jumping: 10, PrepareToLounge: 11, Lounge: 12, ShakePrey: 13 };
const clampAtOne = d => ({ x: clamp(d.x, -1, 1), y: clamp(d.y, -1, 1) });

class MovementAnimation {
  constructor(parent, connection, step, friction, speed) {
    this.parent = parent; this.connection = connection; this.step = step; this.friction = friction; this.speed = speed; this.finished = false;
    const room = parent.room, ch = parent.bodyChunks, mid = t => room.middleOfTile(t);
    const D = (c, dest, fd) => ({ bodyPart: c.index, destination: dest, finishedDist: fd, maxDistance: c.pos.dist(dest) + 10 });
    const s = connection.startCoord, d = connection.destCoord, t = connection.type;
    if (t === 'ReachOverGap' || t === 'ReachUp' || t === 'ReachDown') {
      this.totalSteps = 2;
      if (step === 1) { this.destinations = [D(ch[0], mid(s).add(mid(d)).mul(0.5), 10)]; return; }
      this.destinations = [D(ch[0], mid(d), 5), D(ch[1], mid(s).add(mid(d)).mul(0.5), 100), D(ch[2], mid(s), 12)];
    } else {   // Standard (and anything unported)
      this.totalSteps = 1;
      this.destinations = [D(ch[0], mid(d), 5), D(ch[2], mid(s), 5)];
    }
  }
  update(speedFac) {
    const p = this.parent;
    this.finished = true; let flag = false;
    for (const d of this.destinations) {
      const chunk = p.bodyChunks[d.bodyPart];
      if (this.finished && !C.distLess(chunk.pos, d.destination, d.finishedDist)) this.finished = false;
      chunk.vel.imul(this.friction);
      let num = this.speed * (d.bodyPart === 0 ? p.bodyForce : 1) * Math.pow(p.AI.runSpeed, 0.2);
      if (C.distLess(chunk.pos, d.destination, num)) num = chunk.pos.dist(d.destination);
      num *= p.bodyDesperation * p.lizardParams.maxMusclePower * 2 * rnd() + 1;
      chunk.vel.iadd(C.dirVec(chunk.pos, d.destination).mul(num * speedFac));
      chunk.vel.iadd(C.degToVec(rnd() * 360).mul(p.bodyDesperation * p.lizardParams.maxMusclePower * 2 * rnd() * this.speed));
      if (!C.distLess(chunk.pos, d.destination, d.maxDistance)) { this.finished = true; flag = true; break; }
    }
    if (this.finished) {
      if (this.step < this.totalSteps && !flag) p.movementAnimation = new MovementAnimation(p, this.connection, this.step + 1, this.friction, this.speed);
      else p.movementAnimation = null;
    }
  }
}

class Lizard extends Creature {
  constructor(room, tx, ty, seed = Math.floor(Math.random() * 1e9), breed = 'pink') {
    super();
    this.room = room; this.seed = seed; this.lizardParams = Breeds[breed]; const P = this.lizardParams;
    this.state = { health: 1, limbHealth: [1, 1, 1, 1], throatHealth: 1 };
    const rad = 8 * P.bodySizeFac * P.bodyRadFac, p0 = room.middleOfTile({ x: tx, y: ty });
    // spawn lying flat along the floor facing a random side; a random 1px offset can start the body vertical,
    // and once the lizard has footing gravity is off, so nothing would ever pull a vertical body back down
    const L = 17 * P.bodyLengthFac * ((P.bodySizeFac + 1) / 2), face = rnd() < 0.5 ? -1 : 1;
    this.bodyChunks = [0, 1, 2].map(i => new BodyChunk(this, i, p0.add(new V((1 - i) * face * L, 0)).add(C.rnv()), rad, P.bodyMass / 3));
    const [c0, c1, c2] = this.bodyChunks;
    this.bodyChunkConnections = [
      new BodyChunkConnection(c0, c1, L, 'Normal', 0.95, 0.5),
      new BodyChunkConnection(c1, c2, L, 'Normal', 0.95, 0.5),
      new BodyChunkConnection(c0, c2, L * (1 + P.bodyStiffnes), 'Push', 1 - lerp(0.9, 0.5, P.bodyStiffnes), 0.5),
    ];
    this.animation = LAnim.Standard; this.g = 0.9; this.airFriction = 0.999; this.bounce = 0.1; this.surfaceFriction = 0.5; this.collisionLayer = 1;
    this.goThroughFloors = true;
    this.coord = { x: tx, y: ty };
    // fields from Lizard.cs
    this.biteDelay = 0; this.jawOpen = 0; this.lastJawOpen = 0; this.jawForcedShut = 0; this.loungeDir = new V(); this.loungeDelay = 0; this.postLoungeStun = 0;
    this.timeInAnimation = 0; this.timeToRemainInAnimation = -1; this.upcomingConnections = []; this.followingConnection = null;
    this.lastFollowingConnection = null; this.commitedToDropConnection = null; this.movementAnimation = null; this.applyGravity = true;
    this.inAllowedTerrainCounter = 0; this.gripPoint = null; this.timeSpentTryingThisMove = 0; this.desperationSmoother = 0;
    this.limbsAimFor = p0.clone(); this.straightenOutNeeded = 0; this.bodyWiggle = 0; this.bwc = 0; this.biteControlReset = false;
    this.narrowUpcoming = false; this.climbUpcoming = false; this.shortcutUpcoming = false; this.grabbedAttackCounter = 0;
    this.voice = new LizardVoice(this);
    this.breed = breed;
    // Lizard ctor: effectColor = standardColor, then per breed a seeded random hue
    const HUE = { /* [hue, hueDev, lightness, lightnessK] */ pink: [0.87, 0.1, 0.5, 0.1], green: [0.32, 0.1, 0.5, 0.1], blue: [0.57, 0.08, 0.5, 0.1], yellow: [0.1, 0.05, 0.5, 0.1], salamander: [0.9, 0.15, 0.4, 0.2], red: [0.0025, 0.02, 0.5, 0.1], cyan: [0.49, 0.04, 0.5, 0.1] }[breed];
    this.effectColor = HUE ? withSeed(seed, () => C.hsl2rgb(C.wrappedRandomVariation(HUE[0], HUE[1], 0.6), 1, C.clampedRandomVariation(HUE[2], 0.15, HUE[3]))) : this.lizardParams.standardColor.slice();
    this.tongue = P.tongue ? new LizardTongue(this) : null;
    // AbstractCreature.Personality (seeded from the creature ID)
    this.personality = withSeed(seed + 5, () => {
      const push = C.pushFromHalf;
      let sympathy = push(rnd(), 1.5), energy = push(rnd(), 1.5), bravery = push(rnd(), 1.5);
      let nervous = lerp(rnd(), lerp(energy, 1 - bravery, 0.5), Math.pow(rnd(), 0.25));
      let aggression = lerp(rnd(), (energy + bravery) / 2 * (1 - sympathy), Math.pow(rnd(), 0.25));
      const dominance = lerp(rnd(), (energy + bravery + aggression) / 3, Math.pow(rnd(), 0.25));
      return { sympathy, energy, bravery, dominance, nervous: push(nervous, 2.5), aggression: push(aggression, 2.5) };
    });
    this.AI = new LizardAI(this);
    this.jumpModule = breed === 'cyan' ? new LizardJumpModule(this) : null;
    this.graphics = new LizardGraphics(this);
    this.graphics.reset();
  }

  // ---- properties ----
  get JawOpen() {
    if (this.grasps[0]) this.jawOpen = 0;
    if (this.tongue && this.tongue.out) this.jawOpen = Math.max(this.jawOpen, 0.5);
    if (this.jawForcedShut > 0) this.jawOpen = Math.min(Math.pow(1 - this.jawForcedShut, 4), this.jawOpen);
    return this.jawOpen;
  }
  set JawOpen(v) { this.jawOpen = this.grasps[0] ? 0 : clamp(v, 0, 1); }
  get JawReadyForBite() { return this.JawOpen > 0.9 && this.biteDelay === 0; }
  get bodyDirection() { return (Math.round((-C.aim(this.bodyChunks[1].pos, this.bodyChunks[0].pos) + 180) / 90) + 1) % 4; }
  get bodyForce() { return clamp(this.desperationSmoother * 0.025, 1, this.lizardParams.maxMusclePower); }
  get bodyDesperation() { return invLerp(120, 400, this.desperationSmoother); }
  get legsGripping() { return this.graphics ? this.graphics.legsGrabbing : 2; }
  get noGripCounter() { return this.graphics ? this.graphics.noGripCounter : 0; }
  get bodyWiggleCounter() { return this.bwc; }
  set bodyWiggleCounter(v) { this.bwc = clamp(Math.round(v), 0, 100); }
  get bodyWiggleFac() { return clamp((this.bwc - this.lizardParams.wiggleDelay) / (50 + this.lizardParams.wiggleDelay), 0, 1); }
  get wallClimber() { return this.lizardParams.wallClimber; }

  // ---- animations ----
  enterAnimation(anim, force) {
    const P = this.lizardParams, A = LAnim;
    if ((!force && anim < this.animation) || this.animation === anim) return;
    this.timeInAnimation = 0; this.animation = anim;
    const focus = this.AI.focusCreature;
    if (anim === A.Standard) this.timeToRemainInAnimation = -1;
    else if (anim === A.HearSound) { this.timeToRemainInAnimation = 40; this.voice.makeSound('Curious'); }
    else if (anim === A.PreySpotted) { this.timeToRemainInAnimation = 30; this.voice.makeSound('SpottedPreyFirstTime'); }
    else if (anim === A.PreyReSpotted) { this.timeToRemainInAnimation = 10; this.voice.makeSound('ReSpottedPrey'); }
    else if (anim === A.PrepareToLounge) {
      this.timeToRemainInAnimation = P.preLoungeCrouch + 5;
      if (focus) this.loungeDir = C.dirVec(this.mainBodyChunk.pos, focus.creature.mainBodyChunk.pos);
    } else if (anim === A.Lounge) {
      this.loungeDelay = P.loungeDelay * (rnd() < P.riskOfDoubleLoungeDelay ? 2 : 1) + P.loungeMaximumFrames;
      if (focus) this.loungeDir = C.slerp(this.loungeDir, C.dirVec(this.mainBodyChunk.pos, focus.creature.mainBodyChunk.pos), P.findLoungeDirection);
      if (C.dirVec(this.bodyChunks[1].pos, this.bodyChunks[0].pos).dot(this.loungeDir) < 0) {
        if (P.canExitLounge || P.canExitLoungeWarmUp) this.enterAnimation(A.Standard, true);
        else this.loungeDir = C.dirVec(this.bodyChunks[1].pos, this.bodyChunks[0].pos);
      }
      if (this.loungeDir.y > 0) this.loungeDir.y += P.loungeJumpyness;
      this.loungeDir.y *= 0.5;
      this.timeToRemainInAnimation = P.loungeMaximumFrames + 5;
    } else if (anim === A.ShootTongue) this.timeToRemainInAnimation = P.tongueWarmUp;
    else if (anim === A.Jumping) { this.timeToRemainInAnimation = -1; this.jumpModule.jump(); this.goThroughFloors = true; }
    else if (anim === A.ShakePrey) {
      this.timeToRemainInAnimation = Math.floor(P.shakePrey + rnd() * P.shakePrey);
    } else if (anim === A.FightingStance) this.timeToRemainInAnimation = rndInt(20, 50);
  }

  actAnimation() {
    const P = this.lizardParams, ai = this.AI, A = LAnim, A0 = this.animation;
    let num = 0;
    if (A0 === A.Standard) num = ai.runSpeed;
    else if (A0 === A.HearSound) { num = 0; this.JawOpen = 0.2; }
    else if (A0 === A.PreySpotted) { num = 0; this.JawOpen = 1; }
    else if (A0 === A.PreyReSpotted) { num = ai.runSpeed * 0.3; this.JawOpen = lerp(this.JawOpen, 1, rnd() * rnd()); }
    else if (A0 === A.FightingStance) { num = 0; this.JawOpen = 1; }
    else if (A0 === A.PrepareToLounge) {
      this.bodyWiggleCounter = 0;
      const f = ai.focusCreature;
      if (!P.canExitLoungeWarmUp || (ai.behavior === Behavior.Hunt && f && f.visual)) {
        num = 0;
        if (f && f.creature) {
          if (this.legsGripping > 0) for (const bc of this.bodyChunks) bc.vel.iadd(C.dirVec(bc.pos, f.creature.mainBodyChunk.pos).mul(P.preLoungeCrouchMovement));
          if (this.timeInAnimation >= P.preLoungeCrouch) this.enterAnimation(A.Lounge, false);
        } else this.enterAnimation(A.Standard, true);
      } else this.enterAnimation(A.Standard, true);
    } else if (A0 === A.Lounge) {
      let endLounge = true;
      if (this.timeInAnimation < P.loungeMaximumFrames) {
        const f = ai.focusCreature;
        endLounge = P.canExitLounge && !(ai.behavior === Behavior.Hunt && f && f.visual);
      }
      if (endLounge) {
        this.jawsSnapShut(this.mainBodyChunk.pos.add(C.dirVec(this.bodyChunks[1].pos, this.mainBodyChunk.pos).mul(10)));
        this.enterAnimation(A.Standard, true); this.postLoungeStun = 40; this.inAllowedTerrainCounter = 0;
      } else {
        num = 0; this.JawOpen += 0.1;
        if (this.timeInAnimation < P.loungePropulsionFrames && this.legsGripping > 0)
          for (let k = 0; k < 3; k++) this.bodyChunks[k].vel.iadd(this.loungeDir.mul(P.loungeSpeed / (k + 1)));
      }
    } else if (A0 === A.ShootTongue) {
      this.bodyWiggleCounter = 0; num = 0.2;
      const f = ai.focusCreature;
      if (ai.behavior !== Behavior.Hunt || !f || !f.visual || C.dirVec(this.bodyChunks[1].pos, this.bodyChunks[0].pos).dot(C.dirVec(this.bodyChunks[0].pos, f.creature.mainBodyChunk.pos)) < 0.3) this.enterAnimation(A.Standard, true);
      if (this.timeInAnimation === Math.floor(this.timeToRemainInAnimation / 2) && f && f.creature) {
        this.JawOpen = 1; this.tongue.lashOut(f.creature.bodyChunks[rndInt(0, f.creature.bodyChunks.length)].pos);
      }
    } else if (A0 === A.PrepareToJump) {
      const aj = this.jumpModule.actOnJump, c = this.bodyChunks, room = this.room;
      if (aj && this.Consious && C.distLess(c[1].pos, aj.bestJump.startPos, 50)) {
        const iv = aj.bestJump.initVel.normalized();
        c[1].vel.imul(0.5); c[1].pos = c[1].pos.lerpTo(aj.bestJump.startPos.sub(iv.mul(this.timeInAnimation * 0.5)), 0.2);
        num = 0; c[0].vel.iadd(iv.mul(1.5)); c[2].vel.isub(iv.mul(2));
        const g = this.graphics;
        if (g) {
          g.head.vel.iadd(C.dirVec(this.mainBodyChunk.pos, room.middleOfTile(aj.bestJump.goalCell)).mul(10));
          const perp = C.perp(C.dirVec(c[0].pos, c[2].pos));
          for (let i = 0; i < g.tail.length; i++) g.tail[i].vel.isub(iv.mul(i).add(perp.mul(this.timeInAnimation % 6 < 3 ? -5 : 5)));
        }
        if (this.timeInAnimation > this.timeToRemainInAnimation - 5) this.enterAnimation(A.Jumping, false);
        this.inAllowedTerrainCounter = P.regainFootingCounter + 10;
      } else this.enterAnimation(A.Standard, true);
    } else if (A0 === A.ShakePrey) {
      num = 0.75;
      if (!this.grasps[0] && rnd() < 0.025) this.enterAnimation(A.Standard, true);
    }
    if (this.tongue && this.tongue.stuckToSomething) {
      if (this.breed === 'white') {     // white lizards hang off their tongue
        this.bodyWiggleCounter += 2; num = 0;
        if (!this.applyGravity) {
          const f = 1 - this.legsGripping / 4;
          for (let l = 0; l < 3; l++) this.bodyChunks[l].vel.imul(f);
          if (this.legsGripping > 0) this.bodyChunks[2].vel.iadd(C.dirVec(this.tongue.pos, this.bodyChunks[2].pos).mul(1.2));
        }
      } else num *= 0.6;
    }
    if (this.postLoungeStun > 0) num *= 0.1;
    return num;
  }

  // ---- biting ----
  attemptBite(creature) {
    const P = this.lizardParams, main = this.mainBodyChunk;
    if (this.grasps[0] || !this.Consious) return;
    if (!this.JawReadyForBite) { this.JawOpen += 0.05; return; }
    let flag = false;
    if (rnd() < P.biteChance && creature) {
      for (const ch of creature.bodyChunks) {
        if (C.distLess(main.pos.add(C.dirVec(this.bodyChunks[1].pos, main.pos).mul(P.biteInFront)), ch.pos, Math.max(8, ch.rad) + P.biteRadBonus)) {
          if (this.tongue && this.tongue.out) { if (this.tongue.state !== TS.StuckInTerrain) this.tongue.retract(); return; }
          flag = true; this.bite(ch); break;
        }
      }
    } else if (!creature) this.bite(null);
    if (this.legsGripping <= 0) return;
    if (flag) { for (let j = 0; j < 3; j++) this.bodyChunks[j].vel.iadd(C.degToVec(rnd() * 360).mul(7)); }
    else if (creature && !(this.tongue && this.tongue.out)) {
      const d = C.dirVec(main.pos, creature.mainBodyChunk.pos);
      main.vel.iadd(d.mul(3 * P.biteHomingSpeed)); this.bodyChunks[1].vel.isub(d.mul(P.biteHomingSpeed)); this.bodyChunks[2].vel.isub(d.mul(P.biteHomingSpeed));
    }
  }
  bite(chunk) {
    const P = this.lizardParams, main = this.mainBodyChunk;
    if (this.grasps[0] && this.grabbedBy.length === 0) return;
    this.biteControlReset = false; this.JawOpen = 0; this.lastJawOpen = 0;
    if (this.tongue && this.tongue.out) this.tongue.retract();
    if (!chunk) { playJaws(); return; }
    chunk.vel.iadd(main.vel.mul(lerp(main.mass, 1.1, 0.5) / Math.max(1, chunk.mass)));
    if (chunk.owner instanceof Prey && !chunk.owner.dead && this.grab(chunk.owner, 0, chunk.index)) {   // prey is always "Eats"
      this.AI.bitCreature(chunk); playBite();
      if (rnd() < P.biteDamageChance) chunk.owner.violence(1.5);
    } else playJaws();
  }
  jawsSnapShut(pos) {
    const P = this.lizardParams, d = C.dirVec(this.mainBodyChunk.pos, pos);
    playJaws(); this.JawOpen = 0; this.lastJawOpen = 0;
    this.mainBodyChunk.vel.iadd(d.mul(8)); this.bodyChunks[1].vel.isub(d.mul(6)); this.bodyChunks[2].vel.isub(d.mul(6));
    this.biteDelay = P.biteDelay; this.jawForcedShut = 1;
  }
  carryObject() {
    const g = this.grasps[0], P = this.lizardParams, main = this.mainBodyChunk;
    if (!g) return;
    if (g.grabbed.dead && g.grabbed.deadTimer > 60) { this.loseAllGrasps(); return; }
    const vec = main.pos.add(C.dirVec(this.bodyChunks[1].pos, main.pos).mul(25 * P.headSize)), ch = g.grabbed.bodyChunks[g.chunkGrabbed];
    const rel = ch.vel.sub(main.vel); ch.vel.copy(main.vel);
    if (rel.mag * ch.mass > 30 || !C.distLess(vec, ch.pos, 70 + ch.rad)) this.loseAllGrasps(); else ch.pos.copy(vec);
  }
  collide(other, myChunk, otherChunk) {
    if (other instanceof Prey) {
      this.AI.seeCreature(other);
      if (this.Consious && !this.grasps[0] && !other.dead) {
        if (this.animation === LAnim.Lounge && myChunk === 0) this.bite(other.bodyChunks[otherChunk]);
        else this.attemptBite(other);
      }
    }
  }
  hearNoise(pos, strength, source) { if (source !== this) this.AI.heardNoise(pos, strength, source); }
  stun(st) { this.stunFor(st); if (this.Stunned) { this.gripPoint = null; this.movementAnimation = null; this.loseAllGrasps(); } }

  // ---- Update ----
  update() {
    const P = this.lizardParams;
    this.lastJawOpen = this.JawOpen;
    if (this.JawOpen > 0.9) { if (this.biteDelay > 0) this.biteDelay--; } else if (this.biteDelay < P.biteDelay) this.biteDelay++;
    this.jawForcedShut = Math.max(0, this.jawForcedShut - 1 / 60);
    this.bodyChunkConnections[2].active = !this.Consious || !this.movementAnimation;
    this.loungeDelay--;
    if (this.tongue) this.tongue.update();
    if (this.Consious) this.act(); else this.applyGravity = true;
    this.voice.update();
    for (let k = 0; k < 2; k++) this.bodyChunkConnections[k].type = (this.movementAnimation && this.movementAnimation.connection.type === 'Standard') ? 'Pull' : 'Normal';
    if (this.tongue && (this.animation === LAnim.ShootTongue || (this.breed !== 'blue' && this.tongue.out))) this.jawOpen += 0.1;
    if (this.animation === LAnim.Lounge || this.postLoungeStun > 0 || (this.jumpModule && this.jumpModule.noRunBehavior)) {
      this.airFriction = 0.999; this.g = 0.9; this.bounce = 0.1; this.surfaceFriction = this.animation === LAnim.Lounge ? 0.5 : 0.4;
      this.goThroughFloors = this.loungeDir.y < 0; this.postLoungeStun--;
    } else if (this.applyGravity) {
      this.airFriction = 0.999; this.g = 0.9; this.bounce = 0.1; this.surfaceFriction = 0.3; this.goThroughFloors = false;
    } else {
      this.airFriction = 0.8; this.g = 0; this.bounce = 0.1; this.surfaceFriction = 0.5; this.goThroughFloors = true;
    }
    if (this.jumpModule) this.jumpModule.update();
    if (this.grasps[0]) this.carryObject();
    super.update();
    this.graphics.update();
  }

  // ---- Act ----
  act() {
    const P = this.lizardParams, room = this.room, ai = this.AI, pather = ai.pather, am = room.aimap, A = LAnim;
    ai.update();
    let flag = false, flag2 = false;
    for (const bc of this.bodyChunks) if (am.accessiblePos(bc.pos, P)) { flag = flag || bc.index === 0; flag2 = flag2 || bc.index > 0; }
    if (((flag || flag2) || this.movementAnimation) && this.inAllowedTerrainCounter < 100) this.inAllowedTerrainCounter++;
    else {
      let f3 = false;
      for (let i = 0; i < 3 && !f3; i++) { const t = room.tileOf(this.bodyChunks[i].pos); for (let j = 0; j < 4 && !f3; j++) if (am.accessible(t.x + FOUR[j].x, t.y + FOUR[j].y, P)) f3 = true; }
      this.inAllowedTerrainCounter = f3 ? Math.max(0, this.inAllowedTerrainCounter - 10) : 0;
    }
    this.applyGravity = this.inAllowedTerrainCounter < P.regainFootingCounter || this.noGripCounter > 10 || !!this.commitedToDropConnection;
    const num4 = this.actAnimation();

    let wc = room.tileOf(this.mainBodyChunk.pos);
    if (!this.movementAnimation && !pather.reachable(wc.x, wc.y)) {
      for (const d of EIGHT_DIAG_LAST) if (pather.reachable(wc.x + d.x, wc.y + d.y)) { wc = { x: wc.x + d.x, y: wc.y + d.y }; break; }
    }
    this.followingConnection = pather.followPath(wc);
    if (this.commitedToDropConnection) { this.followingConnection = this.commitedToDropConnection; this.commitedToDropConnection = null; }
    const fc0 = this.followingConnection, main = this.mainBodyChunk;
    if ((!fc0 || main.pos.dist(room.middleOfTile(fc0.destCoord)) > this.bodyChunks[1].pos.dist(room.middleOfTile(fc0.destCoord))) && this.timeSpentTryingThisMove > 10) {
      this.bodyChunkConnections[0].type = 'Pull'; this.bodyChunkConnections[1].type = 'Pull';
    } else { this.bodyChunkConnections[0].type = 'Normal'; this.bodyChunkConnections[1].type = 'Pull'; }
    for (const bc of this.bodyChunks) { bc.terrainSqueeze = lerpMap(this.timeSpentTryingThisMove, 10, 30, 1, 0.05); }

    if (num4 > 0.1 && (!this.followingConnection || ai.stuckTracker.isMoveInLog(this.followingConnection, Math.floor(lerp(1, 20, num4)))))
      this.timeSpentTryingThisMove = clamp(this.timeSpentTryingThisMove + 1, 0, 600);
    else this.timeSpentTryingThisMove = 0;
    this.desperationSmoother = lerpAndTick(this.desperationSmoother, Math.max(this.timeSpentTryingThisMove + lerp(-300, 0, num4), ai.stuckTracker.utility() * 100), 0.05, 0.5);
    if (this.desperationSmoother > lerp(40, 10, num4)) this.bodyWiggleCounter += 2; else this.bodyWiggleCounter -= 1;
    ai.stuckTracker.reportMove(this.followingConnection);

    this.upcomingConnections.length = 0;
    if (this.followingConnection) {
      const fc = this.followingConnection;
      this.limbsAimFor = room.middleOfTile(fc.destCoord);
      if (fc.type === 'ReachUp' || fc.type === 'ReachOverGap' || fc.type === 'ReachDown') this.movementAnimation = new MovementAnimation(this, fc, 1, 0.99, 0.75);
      let mc = fc; this.narrowUpcoming = false; this.climbUpcoming = false; this.shortcutUpcoming = false;
      for (let k = 0; k < 5; k++) {
        const d = mc.destCoord, s = (x, y) => am.solid(d.x + x, d.y + y);
        if (!this.narrowUpcoming && ((s(0, 1) && s(0, -1)) || (s(1, 0) && s(-1, 0)))) this.narrowUpcoming = true;
        if (!this.climbUpcoming && am.accAt(d.x, d.y) === Acc.Climb) this.climbUpcoming = true;
        this.upcomingConnections.push(mc);
        mc = pather.followPath(mc.destCoord);
        if (mc && this.upcomingConnections.some(u => u.destCoord.x === mc.destCoord.x && u.destCoord.y === mc.destCoord.y)) mc = null;
        if (!mc) break;
      }
    }
    this.timeInAnimation++;
    if (this.timeToRemainInAnimation > -1 && this.timeInAnimation > this.timeToRemainInAnimation) this.enterAnimation(A.Standard, true);

    if (this.jumpModule && !this.gripPoint && this.jumpModule.noRunBehavior) return;
    if (this.gripPoint) this.gripPointBehavior();
    else if (this.movementAnimation) this.movementAnimation.update(num4 * P.baseSpeed * 0.5);
    else if (this.followingConnection) this.followConnection(num4);

    if (!this.followingConnection && !this.movementAnimation) {
      if (!this.applyGravity && !am.accessiblePos(main.pos, P)) {
        const t = room.tileOf(main.pos), n = { x: t.x + FOUR[rndInt(0, 4)].x, y: t.y + FOUR[rndInt(0, 4)].y };
        if (am.accessible(n.x, n.y, P)) this.followingConnection = new MovementConnection('Standard', t, n, 1);
      } else if (flag && !flag2 && this.timeSpentTryingThisMove > 20) {
        const c = this.bodyChunks[1], t = room.tileOf(c.pos);
        for (let k = 0; k < 4; k++) if (am.accessible(t.x + FOUR[k].x, t.y + FOUR[k].y, P)) { c.vel.iadd(C.dirVec(c.pos, room.middleOfTile({ x: t.x + FOUR[k].x, y: t.y + FOUR[k].y }))); break; }
      }
    }
    if (this.bodyDesperation > 0) {
      const v = C.degToVec(rnd() * 360).mul(this.bodyDesperation * P.maxMusclePower * 2 * rnd());
      this.bodyChunks[0].vel.iadd(v.mul(0.5)); this.bodyChunks[1].vel.isub(v); this.bodyChunks[2].vel.iadd(v.mul(0.5));
    }
    this.bodyChunkConnections[2].elasticity = 0.7 + 0.3 / this.bodyForce;

    if (this.animation === A.ShakePrey) {
      this.bodyWiggleCounter = clamp(50 - this.timeInAnimation, 0, 100);
      let v = C.degToVec(rnd() * 360).mul(12 * rnd());
      const g = this.grasps[0];
      if (!g) v = v.mul(0.5);
      else {
        let val = Math.abs(g.grabbed.bodyChunks[g.chunkGrabbed].mass - main.mass * 0.5);
        val = Math.pow(invLerp(main.mass * 0.5, 0, val), 1.5); v = v.mul(val);
        this.bodyWiggleCounter = clamp(Math.floor(this.bodyWiggleCounter * lerp(val, 1, 0.5)), 0, 100);
        if (val === 0 && rnd() < 0.025) { this.bodyWiggleCounter = 0; this.enterAnimation(A.Standard, true); }
      }
      this.bodyChunks[0].vel.isub(v.mul(0.5)); this.bodyChunks[1].vel.iadd(v); this.bodyChunks[2].vel.isub(v.mul(0.5));
    }
    if (this.bodyWiggleFac > 0) {
      this.bodyWiggle += lerp(0.05, 0.15, this.bodyWiggleFac) * lerp(0.5, 0.8, P.wiggleSpeed);
      const s = Math.sin(this.bodyWiggle * 2 * Math.PI);
      const perp = C.perp(C.slerp(C.dirVec(this.bodyChunks[1].pos, this.bodyChunks[0].pos), C.dirVec(this.bodyChunks[2].pos, this.bodyChunks[1].pos), 0.5).normalized());
      const f = (this.bodyWiggleFac + 2) / (Math.pow(1 - P.wiggleSpeed, 2) + 2), v = perp.mul(s * f);
      this.bodyChunks[0].vel.iadd(v); this.bodyChunks[1].vel.isub(v.mul(2)); this.bodyChunks[2].vel.iadd(v);
    }
    if (this.followingConnection) this.lastFollowingConnection = this.followingConnection;
    this.straightenOutNeeded = lerpAndTick(this.straightenOutNeeded, 0, 0.1, 0.05);
  }

  getFrameSpeed(runSpeed) {
    const P = this.lizardParams, room = this.room, am = room.aimap;
    let num = this.legsGripping / 4;
    num = num * (1 - P.noGripSpeed) + P.noGripSpeed;
    if (this.noGripCounter < 1) num = lerp(num, 1 + this.bodyDesperation, this.bodyForce - 1);
    if (num < 0.1 || this.bodyForce > 1.2) this.bodyWiggleCounter++; else this.bodyWiggleCounter--;
    let num2 = P.baseSpeed * num * lerp(runSpeed, 1, this.bodyForce - 1);
    num2 *= lerp(rnd(), 1, (this.state.health - 0.5) * 2);
    let sp = { speed: 0, horizontal: 0, up: 0, down: 0 };
    for (const bc of this.bodyChunks) { const t = room.tileOf(bc.pos), m = P.terrainSpeeds[am.accAt(t.x, t.y)]; sp.speed += m.speed; sp.horizontal += m.horizontal; sp.up += m.up; sp.down += m.down; }
    sp = { speed: sp.speed / 3, horizontal: sp.horizontal / 3, up: sp.up / 3, down: sp.down / 3 };
    num2 *= sp.speed;
    const iv = { x: this.followingConnection.destCoord.x - this.followingConnection.startCoord.x, y: this.followingConnection.destCoord.y - this.followingConnection.startCoord.y };
    if (iv.x !== 0) return num2 * sp.horizontal;
    return iv.y > 0 ? num2 * sp.up : num2 * sp.down;
  }

  followConnection(runSpeed) {
    const P = this.lizardParams, room = this.room, am = room.aimap, fc = this.followingConnection, main = this.mainBodyChunk;
    const [c0, c1, c2] = this.bodyChunks, mid = t => room.middleOfTile(t), midP = p => room.middleOfTile(room.tileOf(p));
    const frameSpeed = this.getFrameSpeed(runSpeed), s = fc.startCoord, d = fc.destCoord;
    if (this.timeSpentTryingThisMove < 20 && this.narrowUpcoming && frameSpeed > 0.2 && this.upcomingConnections.length > 1 && am.narrowAt(this.upcomingConnections[1].destCoord.x, this.upcomingConnections[1].destCoord.y)) {
      const a = clampAtOne({ x: d.x - s.x, y: d.y - s.y }), u = this.upcomingConnections[1], b = clampAtOne({ x: u.destCoord.x - u.startCoord.x, y: u.destCoord.y - u.startCoord.y });
      if (a.x !== b.x && a.y !== b.y) { c0.vel.imul(0.75); c0.vel.iadd(new V(b.x, b.y).mul(2)); runSpeed = Math.min(runSpeed, 0.2); c1.vel.imul(0.75); c2.vel.imul(0.5); }
    }
    if (fc.type === 'Standard' || fc.type === 'ReachUp' || fc.type === 'ReachDown') {
      const dAcc = am.accAt(d.x, d.y), vector = new V();
      if (dAcc === Acc.Climb) {
        const iv = this.upcomingConnections.length <= 0 ? clampAtOne({ x: d.x - s.x, y: d.y - s.y })
          : clampAtOne({ x: this.upcomingConnections[Math.min(2, this.upcomingConnections.length - 1)].destCoord.x - s.x, y: this.upcomingConnections[Math.min(2, this.upcomingConnections.length - 1)].destCoord.y - s.y });
        if (d.y === s.y) vector.y = iv.y * 8;
        else if (d.x === s.x) { if (am.accAt(s.x, s.y) !== Acc.Climb) iv.x = c2.pos.x < midP(main.pos).x ? -1 : 1; vector.x = iv.x * 8; }
        if (this.isTileSolid(0, iv.x, 0)) { iv.x *= -1; vector.x = 0; }
        if (this.isTileSolid(0, 0, iv.y)) { iv.y *= -1; vector.y = 0; }
      } else if (this.noGripCounter === 0 && d.y === s.y && !this.isTileSolid(0, 0, 1) &&
        !this.isTileSolid(0, (d.x < this.coord.x ? -1 : 0) + (d.x > this.coord.x ? 1 : 0), 1)) vector.y = P.floorLeverage;
      if (s.x !== d.x && s.y === d.y) {
        if ((this.isTileSolid(0, 0, -1) && main.pos.y < midP(main.pos).y) || (this.isTileSolid(0, 0, 1) && main.pos.y > midP(main.pos).y)) main.vel.y -= (main.pos.y - midP(main.pos).y) * 0.5;
      } else if (s.y !== d.y && s.x === d.x && ((this.isTileSolid(0, -1, 0) && main.pos.x < midP(main.pos).x) || (this.isTileSolid(0, 1, 0) && main.pos.x > midP(main.pos).x))) main.vel.x -= (main.pos.x - midP(main.pos).x) * 0.5;
      const iv4 = { x: d.x - s.x, y: d.y - s.y };
      if (iv4.y !== 0) {
        for (let i = 0; i < 3; i++) { const bc = this.bodyChunks[i]; if (bc.contactPoint.y !== 0 && !this.isTileSolid(i, 0, bc.contactPoint.y)) { bc.vel.x -= (bc.pos.x - midP(bc.pos).x) * 0.25; vector.x *= 0; } }
      } else if (iv4.x !== 0) {
        for (let j = 0; j < 3; j++) { const bc = this.bodyChunks[j]; if (bc.contactPoint.x !== 0 && !this.isTileSolid(j, bc.contactPoint.x, 0)) { bc.vel.y -= (bc.pos.y - midP(bc.pos).y) * 0.25; vector.y *= 0; } }
      }
      let v2 = mid(d);
      const up = this.upcomingConnections;
      if (up.length > 0 && am.accAt(up[up.length - 1].destCoord.x, up[up.length - 1].destCoord.y) < Acc.Climb) {
        const mt = room.tileOf(main.pos);
        for (let n = up.length - 1; n >= 0; n--) {
          const ud = up[n].destCoord;
          if ((Math.hypot(mt.x - ud.x, mt.y - ud.y) < 2 && room.visualContact(main.pos, mid(ud))) || this.AI.pather.rayTraceInAccessibleTiles(mt, ud)) { v2 = mid(ud); break; }
        }
      }
      v2 = v2.add(vector);
      const p = v2.add(C.dirVec(v2, c0.pos).mul(this.bodyChunkConnections[0].distance));
      c0.vel.iadd(C.dirVec(c0.pos, v2).mul(frameSpeed * this.bodyForce));
      c1.vel.iadd(C.dirVec(c1.pos, p).mul(frameSpeed * this.bodyForce * lerpMap(C.dirVec(c1.pos, v2).dot(C.dirVec(c1.pos, p)), -1, 1, 0.5, 1)));
      if (this.animation === LAnim.Standard && this.AI.runSpeed > 0.1) {
        let n2 = invLerp(0, -1, C.dirVec(c0.pos, v2).dot(C.dirVec(c1.pos, c0.pos)));
        if (n2 > 0.5) this.straightenOutNeeded = lerpAndTick(this.straightenOutNeeded, 1, 0.1, 0.1);
        n2 = lerp(n2, 1, invLerp(20, 40, this.timeSpentTryingThisMove));
        n2 *= Math.max((this.narrowUpcoming || this.shortcutUpcoming) ? 1 : 0.2, this.climbUpcoming ? 0.5 : 0.2, invLerp(5, 20, this.timeSpentTryingThisMove), this.straightenOutNeeded);
        c0.vel.iadd(C.dirVec(c1.pos, v2).mul((n2 * 2 * this.bodyForce + this.bodyDesperation * 2) * frameSpeed));
        const v3 = C.dirVec(c1.pos, v2).mul((n2 * 2 * this.bodyForce + this.bodyDesperation * 2) * 0.5 * lerpMap(this.timeSpentTryingThisMove, 20, 60, 1, 0.5) * frameSpeed);
        c1.vel.isub(v3); c2.vel.isub(v3);
      }
    } else if (fc.type === 'DropToFloor' || fc.type === 'DropToClimb') {
      let flag = true;
      if (Math.abs(this.coord.x - s.x) > 4 && Math.abs(this.coord.x - d.x) > 4) flag = false;
      for (const bc of this.bodyChunks) if (bc.contactPoint.y < 0) flag = false;
      // the head has already tipped over the edge (past the start column, nothing under it): the tail is still resting on the ledge,
      // which keeps contactPoint.y < 0 on the body forever and gravity off, so the lizard hangs there thrashing. Let it fall.
      const hs = room.tileOf(main.pos);
      if (!flag && main.contactPoint.y >= 0 && hs.x !== s.x && hs.y <= s.y && Math.abs(main.pos.x - mid(s).x) > TILE * 0.5) flag = true;
      if (flag) this.commitedToDropConnection = fc;
      c0.vel.y -= 0.01; c2.vel.y += 0.01;
      const dm = mid(d);
      if (Math.abs(main.pos.x - dm.x) < 5) { if (Math.abs(main.vel.x) < 5) main.vel.x *= 0.8; }
      else if (main.pos.x < dm.x) main.vel.x += 0.5; else main.vel.x -= 0.5;
      let f2 = false, f3 = false, f4 = false;
      for (const bc of this.bodyChunks) {
        if (bc.contactPoint.y < 0) f2 = true;
        const ct = room.tileOf(bc.pos);
        if (ct.y >= s.y) {
          f4 = true;
          if (ct.x === s.x) { bc.vel.iadd(C.dirVec(bc.pos, dm).mul(frameSpeed * (bc.index === 0 ? this.bodyForce : 1))); f3 = true; }
          else bc.vel.iadd(C.dirVec(bc.pos, mid(s)).mul(frameSpeed * (bc.index === 0 ? this.bodyForce : 1)));
        }
        if (ct.x === s.x) bc.vel.y--;
      }
      if (f3) return;
      const up = this.upcomingConnections;
      if (up.length > 0) { const dx = d.x - up[up.length - 1].destCoord.x; c0.vel.x -= 0.3 * dx; c2.vel.x += 0.3 * dx; }
      if (main.pos.y <= main.lastPos.y && d.x !== s.x && Math.abs(room.tileOf(main.pos).x - d.x) < 2) {
        const y0 = room.tileOf(main.lastPos).y + 1, y1 = room.tileOf(main.pos).y - 1;
        for (let yy = y0; yy >= y1; yy--) if (yy <= d.y && am.accAt(d.x, yy) === Acc.Floor) { this.gripPoint = mid({ x: d.x, y: yy }); main.vel.y = 0; break; }
      }
      if (f2 && !f4 && !this.gripPoint) this.followingConnection = null;
    }
  }

  gripPointBehavior() {
    const main = this.mainBodyChunk, [, c1, c2] = this.bodyChunks, up = this.upcomingConnections;
    if (main.vel.mag > 10 && this.inAllowedTerrainCounter > 5) { this.gripPoint = null; this.followingConnection = null; }
    else if (!this.applyGravity) { this.movementAnimation = null; this.gripPoint = null; this.followingConnection = null; }
    else {
      if (c1.pos.y < main.pos.y) c1.vel.y += rnd() * 2;
      if (up.length > 0) {
        const dx = clampAtOne({ x: this.coord.x - up[up.length - 1].destCoord.x, y: 0 }).x;
        c1.vel.x += 3 * dx; c2.vel.x += rnd() * 3 * dx;
      } else c1.vel.x += -2 + rnd() * 4;
    }
    main.vel.imul(0);
    if (this.gripPoint) main.vel.isub(main.pos.sub(this.gripPoint));
  }
}
