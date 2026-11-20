'use strict';
// =====================================================================================
//  bodyparts.js — BodyPart / GenericBodyPart / TailSegment / Limb / LizardLimb.
//  (BodyPart, Limb, TailSegment source wasn't supplied, so those bases are reconstructed
//   from how LizardLimb / LizardGraphics use them. LizardLimb itself is a straight port.)
// =====================================================================================
class BodyPart {
  constructor(owner, rad, surfaceFriction, airFriction) {
    this.owner = owner; this.rad = rad; this.surfaceFriction = surfaceFriction; this.airFriction = airFriction;
    this.pos = new V(); this.lastPos = new V(); this.vel = new V(); this.terrainContact = false;
  }
  get room() { return this.owner.lizard.room; }
  reset(p) { this.pos.copy(p); this.lastPos.copy(p); this.vel.set(0, 0); }
  update() {
    this.lastPos.copy(this.pos);
    this.pos.iadd(this.vel); this.vel.imul(this.airFriction);
    if (this.vel.isBad() || this.pos.isBad()) { this.vel.set(0, 0); if (this.pos.isBad()) this.pos.copy(this.lastPos); }
  }
  pushOutOfTerrain(room) {
    this.terrainContact = room.pushOut(this.pos, this.rad);
    if (this.terrainContact) this.vel.imul(this.surfaceFriction);
  }
  connectToPoint(p, dist, push, elasticity, hostVel, adaptVel, adaptMove) {
    const d = this.pos.dist(p);
    if (!push && d < dist) return;
    const dir = C.dirVec(this.pos, p), diff = (d - dist) * (1 - elasticity);
    this.pos.iadd(dir.mul(diff)); this.vel.iadd(dir.mul(diff));
    if (adaptVel > 0) this.vel.copy(this.vel.lerpTo(hostVel, adaptVel * 0.2));
    if (adaptMove > 0) this.pos.iadd(hostVel.mul(adaptMove * 0.2));
  }
}
class GenericBodyPart extends BodyPart {
  constructor(owner, rad, sf, af, connection) { super(owner, rad, sf, af); this.connection = connection; this.pos.copy(connection.pos); this.lastPos.copy(connection.pos); }
  update() { super.update(); this.pushOutOfTerrain(this.room); }
}
class TailSegment extends BodyPart {
  constructor(owner, rad, connectionRad, previous, sf, af, affectPrevious, pullIn) {
    super(owner, rad, sf, af); this.connectionRad = connectionRad; this.previous = previous; this.affectPrevious = affectPrevious;
    this.connectedPoint = null;
  }
  get stretchedRad() { return this.rad; }
  update() {
    super.update();
    const target = this.previous ? this.previous.pos : this.connectedPoint;
    if (target) {
      const d = this.pos.dist(target);
      if (d > this.connectionRad) {
        const dir = C.dirVec(this.pos, target), diff = d - this.connectionRad;
        if (this.previous) {
          this.pos.iadd(dir.mul(diff * (1 - this.affectPrevious))); this.vel.iadd(dir.mul(diff * (1 - this.affectPrevious)));
          this.previous.pos.isub(dir.mul(diff * this.affectPrevious)); this.previous.vel.isub(dir.mul(diff * this.affectPrevious));
        } else { this.pos.iadd(dir.mul(diff)); this.vel.iadd(dir.mul(diff)); }
      }
    }
    this.pushOutOfTerrain(this.room);
  }
}

const LimbMode = { Retracted: 0, HuntAbsolutePosition: 1, Dangle: 2 };
class Limb extends BodyPart {
  constructor(owner, connection, num, rad, sf, af, huntSpeed, quickness) {
    super(owner, rad, sf, af);
    this.connection = connection; this.limbNumber = num; this.huntSpeed = huntSpeed; this.defaultHuntSpeed = huntSpeed; this.quickness = quickness;
    this.mode = LimbMode.Retracted; this.absoluteHuntPos = connection.pos.clone(); this.retract = false; this.reachedSnapPosition = false;
    this.pos.copy(connection.pos); this.lastPos.copy(connection.pos);
  }
  get overLappingHuntPos() { return this.pos.dist(this.absoluteHuntPos) < 1.5; }
  reset(p) { this.retract = true; super.reset(p); }
  update() {
    super.update();
    if (this.mode === LimbMode.Retracted) { this.pos.copy(this.connection.pos); this.vel.set(0, 0); this.reachedSnapPosition = true; }
    else if (this.mode === LimbMode.HuntAbsolutePosition) {
      const d = this.pos.dist(this.absoluteHuntPos);
      if (d <= this.huntSpeed) { this.pos.copy(this.absoluteHuntPos); this.vel.set(0, 0); this.reachedSnapPosition = true; }
      else { this.reachedSnapPosition = false; this.vel.copy(this.vel.lerpTo(C.dirVec(this.pos, this.absoluteHuntPos).mul(this.huntSpeed), this.quickness)); }
    } else this.reachedSnapPosition = false;
    this.terrainContact = this.mode === LimbMode.HuntAbsolutePosition && this.reachedSnapPosition;
  }
  // find a spot on terrain near goalPos that is within maxRad of attachedPos
  findGrip(room, attachedPos, goalPos, maxRad) {
    let best = null, bd = Infinity;
    const consider = (px, py) => {
      if (Math.hypot(px - attachedPos.x, py - attachedPos.y) > maxRad) return;
      const d = Math.hypot(px - goalPos.x, py - goalPos.y);
      if (d < bd) { bd = d; best = [px, py]; }
    };
    const gx = Math.floor(goalPos.x / TILE), gy = Math.floor(goalPos.y / TILE);
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
      const tx = gx + dx, ty = gy + dy, t = room.get(tx, ty);
      if (t === T.SOLID) {
        for (const n of FOUR) {
          if (room.get(tx + n.x, ty + n.y) === T.SOLID) continue;
          for (let s = 0; s <= 4; s++) {
            const f = s / 4;
            if (n.x === 0) consider(tx * TILE + f * TILE, n.y > 0 ? (ty + 1) * TILE : ty * TILE);
            else consider(n.x > 0 ? (tx + 1) * TILE : tx * TILE, ty * TILE + f * TILE);
          }
        }
      } else if (t === T.PLATFORM) {
        if (room.get(tx, ty + 1) !== T.SOLID) for (let s = 0; s <= 4; s++) consider(tx * TILE + s * TILE / 4, (ty + 1) * TILE);
      } else if (t === T.POLE) consider(tx * TILE + TILE / 2, clamp(goalPos.y, ty * TILE, ty * TILE + TILE));
    }
    if (best) { this.absoluteHuntPos.set(best[0], best[1]); this.mode = LimbMode.HuntAbsolutePosition; }
  }
}

// ---- LizardLimb: straight port of LizardLimb.cs ----
class LizardLimb extends Limb {
  constructor(owner, connectionChunk, num, rad, sf, af, huntSpeed, quickness, otherLimbInPair) {
    super(owner, connectionChunk, num, rad, sf, af, huntSpeed, quickness);
    this.lizard = owner.lizard; this.otherLimbInPair = otherLimbInPair;
    this.reachingForTerrain = false; this.gripCounter = 0; this.currentlyDisabled = false; this.flip = 0; this.extraLongStep = false;
    this.grabPos = new V();
    this.jointDist = 25 * ((this.lizard.lizardParams.bodySizeFac + 1) / 2);
    this.mode = LimbMode.Retracted;
  }
  get health() { return this.lizard.Consious ? this.lizard.state.limbHealth[this.limbNumber] : 0; }
  get stepLength() { return lerp(-0.5, 0.5, this.lizard.lizardParams.stepLength * this.health); }

  update() {
    const L = this.lizard, P = L.lizardParams, health = this.health, jd = this.jointDist;
    if ((!this.currentlyDisabled && rnd() > health && rnd() < 0.02) || L.Stunned) this.currentlyDisabled = true;
    else if ((this.currentlyDisabled && rnd() < health && rnd() < 0.02) || health === 1) this.currentlyDisabled = false;
    this.huntSpeed = P.limbSpeed * lerp(0.5, 1, health);
    this.quickness = lerp(0.1, P.limbQuickness, health);

    if (this.currentlyDisabled) {
      this.mode = LimbMode.Dangle; this.vel.y -= 0.9; this.retract = false; this.gripCounter = 0; this.reachingForTerrain = false;
    } else {
      if (this.mode === LimbMode.HuntAbsolutePosition) this.huntSpeed = this.defaultHuntSpeed + this.connection.vel.mag;
      let a = C.dirVec(this.connection.rotationChunk.pos, this.connection.pos);
      if (this.connection.index === 2) a = a.mul(-1);
      a = C.dirVec(new V(), a.lerpTo(C.dirVec(this.connection.pos, L.limbsAimFor), 0.4));
      // positive = foot is BEHIND the hip line (see LizardLimb.cs: DistanceToLine)
      const num = -((this.pos.x - this.connection.pos.x) * a.x + (this.pos.y - this.connection.pos.y) * a.y);
      if (!this.reachingForTerrain) {
        this.mode = LimbMode.HuntAbsolutePosition;
        this.absoluteHuntPos = this.pos.lerpTo(this.connection.pos, P.liftFeet).add(a.mul(jd + 1));
        if (this.extraLongStep) {
          if (this.otherLimbInPair.currentlyDisabled) this.extraLongStep = false;
          if (this.otherLimbInPair.gripCounter > P.limbGripDelay) this.extraLongStep = false;
        }
        if (!this.extraLongStep && num < jd * (-this.stepLength)) this.reachingForTerrain = true;
      } else {
        if (!this.overLappingHuntPos) {
          a.iadd(C.perp(a).mul((6 - 12 * (this.limbNumber % 2)) * 0.2));
          a.y -= 0.3 * P.feetDown;
          a.x += (this.limbNumber % 2 === 0 ? -1 : 1) * P.legPairDisplacement * this.flip;
          this.findGrip(this.room, this.connection.pos, this.connection.pos.add(a.mul(50)), jd - 1);
        } else {
          if (num > jd * -0.5 * (P.stepLength + 0.1) && !C.distLess(this.pos, this.connection.pos, jd - 1) && !C.distLess(this.absoluteHuntPos, this.connection.pos, jd)) {
            this.extraLongStep = !!this.otherLimbInPair && P.smoothenLegMovement && this.otherLimbInPair.gripCounter < 1;
            this.reachingForTerrain = false;
          }
          if (L.AI.runSpeed > 0.1 && P.smoothenLegMovement) {
            let all = true;
            for (const l of this.owner.limbs) if (l.gripCounter > this.gripCounter || l.gripCounter === 0) { all = false; break; }
            if (all) this.reachingForTerrain = false;
          }
        }
        if (this.mode === LimbMode.Dangle) this.reachingForTerrain = false;
      }
    }
    if (this.mode === LimbMode.Dangle) {
      const off = C.rotate(new V(30 - 60 * (this.limbNumber % 2), 10), C.aim(this.connection.rotationChunk.pos, this.connection.pos));
      this.vel.iadd(C.dirVec(this.pos, this.connection.pos.add(off)).mul(0.6));
    }
    if (this.retract && this.reachedSnapPosition) { this.mode = LimbMode.HuntAbsolutePosition; this.reachingForTerrain = false; this.retract = false; }
    const o = this.otherLimbInPair;
    if (o && C.distLess(this.pos, o.pos, this.rad * 3)) {
      const d = this.pos.dist(o.pos), v = C.dirVec(this.pos, o.pos).mul((this.rad * 3 - d) * 0.5);
      this.vel.isub(v); o.vel.iadd(v);
    }
    super.update();
    this.connectToPoint(this.connection.pos, jd, false, 0, this.connection.vel, 0, 0);
    if (this.mode === LimbMode.HuntAbsolutePosition && this.reachingForTerrain && (this.reachedSnapPosition || (this.overLappingHuntPos && this.terrainContact))) this.gripCounter++;
    else this.gripCounter = 0;
  }
}
