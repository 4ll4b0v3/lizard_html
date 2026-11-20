'use strict';
// =====================================================================================
//  physics.js — BodyChunk / BodyChunkConnection / PhysicalObject / Creature
//  (BodyChunkConnection lives nested inside PhysicalObject.cs in the game).
//  Terrain collision is a port of BodyChunk.CheckVerticalCollision / CheckHorizontalCollision
//  (slopes and curved terrain left out).
// =====================================================================================
class BodyChunkConnection {
  constructor(chunk1, chunk2, distance, type, elasticity, weightSymmetry) {
    this.chunk1 = chunk1; this.chunk2 = chunk2; this.distance = distance; this.type = type; this.elasticity = elasticity;
    this.weightSymmetry = weightSymmetry === -1 ? chunk2.mass / (chunk1.mass + chunk2.mass) : weightSymmetry;
    this.active = true;
    chunk1.rotationChunk = chunk2; chunk2.rotationChunk = chunk1;
  }
  update() {
    if (!this.active) return;
    const a = this.chunk1, b = this.chunk2, d = a.pos.dist(b.pos);
    if (this.type === 'Normal' || (this.type === 'Pull' && d > this.distance) || (this.type === 'Push' && d < this.distance)) {
      const dir = C.dirVec(a.pos, b.pos);
      const v1 = dir.mul((this.distance - d) * this.weightSymmetry * this.elasticity);
      const v2 = dir.mul((this.distance - d) * (1 - this.weightSymmetry) * this.elasticity);
      a.pos.isub(v1); a.vel.isub(v1); b.pos.iadd(v2); b.vel.iadd(v2);
    }
  }
}

class BodyChunk {
  constructor(owner, index, pos, rad, mass) {
    this.owner = owner; this.index = index; this.pos = pos.clone(); this.lastPos = pos.clone(); this.lastLastPos = pos.clone();
    this.vel = new V(); this.rad = rad; this.mass = mass; this.terrainSqueeze = 1; this.rotationChunk = null;
    this.collideWithTerrain = true; this.goThroughFloors = false; this.loudness = 1; this.setPos = null;
    this.contactPoint = { x: 0, y: 0 }; this.lastContactPoint = { x: 0, y: 0 };
  }
  get terrainRad() { return Math.max(this.rad * this.terrainSqueeze, 1); }
  get rotation() { return this.rotationChunk ? this.pos.sub(this.rotationChunk.pos).normalized() : new V(0, 1); }

  update() {
    const o = this.owner, room = o.room;
    if (this.vel.isBad()) this.vel.set(0, 0);
    this.vel.y -= o.gravity;
    this.vel.imul(o.airFriction);
    this.lastLastPos.copy(this.lastPos); this.lastPos.copy(this.pos);
    if (this.setPos) { this.pos.copy(this.setPos); this.setPos = null; } else this.pos.iadd(this.vel);
    this.lastContactPoint = { x: this.contactPoint.x, y: this.contactPoint.y };
    if (this.collideWithTerrain) {
      this.checkVertical(); this.checkHorizontal();
      if (room.terrainAt(this.pos) === T.SOLID) room.pushOut(this.pos, this.terrainRad);   // safety net
    } else { this.contactPoint.x = 0; this.contactPoint.y = 0; }
    this.pos.x = clamp(this.pos.x, -200, room.pixelW + 200); this.pos.y = clamp(this.pos.y, -200, room.pixelH + 200);
  }

  solidFloor(x, y) {
    const room = this.owner.room, t = room.get(x, y);
    if (t === T.SOLID) return true;
    if (t === T.PLATFORM && !this.goThroughFloors) {
      let m = room.pixelH;
      for (const c of this.owner.bodyChunks) if (c.lastPos.y < m) m = c.lastPos.y;
      return Math.floor(m / TILE) > y;
    }
    return false;
  }

  checkVertical() {
    const o = this.owner, room = o.room, cp = this.contactPoint, R = this.terrainRad;
    cp.y = 0;
    const lastTile = room.tileOf(this.lastPos), lastSolid = room.terrainAt(this.lastPos) === T.SOLID;
    const x0 = Math.floor((this.pos.x - R + 1) / TILE), x1 = Math.floor((this.pos.x + R - 1) / TILE);
    if (this.pos.y > this.lastPos.y) {
      const yMax = Math.floor((this.pos.y + R + 0.01) / TILE), yMin = Math.floor((this.lastPos.y + R) / TILE);
      let done = false;
      for (let i = yMin; i <= yMax && !done; i++) for (let j = x0; j <= x1 && !done; j++) {
        if (room.get(j, i) === T.SOLID && room.get(j, i - 1) !== T.SOLID && (lastTile.y < i || lastSolid)) {
          this.pos.y = i * TILE - R;
          if (this.vel.y > o.impactTreshhold) o.terrainImpact(this.index, { x: 0, y: 1 }, Math.abs(this.vel.y), this.lastContactPoint.y < 1);
          cp.y = 1; this.vel.y = -Math.abs(this.vel.y) * o.bounce;
          if (Math.abs(this.vel.y) < 1 + 9 * (1 - o.bounce)) this.vel.y = 0;
          this.vel.x *= clamp(o.surfaceFriction * 2, 0, 1); done = true;
        }
      }
    } else if (this.pos.y < this.lastPos.y) {
      const yMin = Math.floor((this.pos.y - R - 0.01) / TILE), yMax = Math.floor((this.lastPos.y - R) / TILE);
      let done = false;
      for (let i = yMax; i >= yMin && !done; i--) for (let k = x0; k <= x1 && !done; k++) {
        if (this.solidFloor(k, i) && !this.solidFloor(k, i + 1) && (lastTile.y > i || lastSolid)) {
          this.pos.y = (i + 1) * TILE + R;
          if (this.vel.y < -o.impactTreshhold) o.terrainImpact(this.index, { x: 0, y: -1 }, Math.abs(this.vel.y), this.lastContactPoint.y > -1);
          cp.y = -1; this.vel.y = Math.abs(this.vel.y) * o.bounce;
          if (this.vel.y < o.gravity || this.vel.y < 1 + 9 * (1 - o.bounce)) this.vel.y = 0;
          this.vel.x *= clamp(o.surfaceFriction * 2, 0, 1); done = true;
        }
      }
    }
  }

  checkHorizontal() {
    const o = this.owner, room = o.room, cp = this.contactPoint, R = this.terrainRad;
    cp.x = 0;
    const lastTile = room.tileOf(this.lastPos), lastSolid = room.terrainAt(this.lastPos) === T.SOLID;
    const y0 = Math.floor((this.pos.y - R + 1) / TILE), y1 = Math.floor((this.pos.y + R - 1) / TILE);
    if (this.vel.x > 0) {
      const xMax = Math.floor((this.pos.x + R + 0.01) / TILE), xMin = Math.floor((this.lastPos.x + R) / TILE);
      let done = false;
      for (let i = xMin; i <= xMax && !done; i++) for (let j = y0; j <= y1 && !done; j++) {
        if (room.get(i, j) === T.SOLID && room.get(i - 1, j) !== T.SOLID && (lastTile.x < i || lastSolid)) {
          this.pos.x = i * TILE - R;
          if (this.vel.x > o.impactTreshhold) o.terrainImpact(this.index, { x: 1, y: 0 }, Math.abs(this.vel.x), this.lastContactPoint.x < 1);
          cp.x = 1; this.vel.x = -Math.abs(this.vel.x) * o.bounce;
          if (Math.abs(this.vel.x) < 1 + 9 * (1 - o.bounce)) this.vel.x = 0;
          this.vel.y *= clamp(o.surfaceFriction * 2, 0, 1); done = true;
        }
      }
    } else if (this.vel.x < 0) {
      const xMin = Math.floor((this.pos.x - R - 0.01) / TILE), xMax = Math.floor((this.lastPos.x - R) / TILE);
      let done = false;
      for (let i = xMax; i >= xMin && !done; i--) for (let j = y0; j <= y1 && !done; j++) {
        if (room.get(i, j) === T.SOLID && room.get(i + 1, j) !== T.SOLID && (lastTile.x > i || lastSolid)) {
          this.pos.x = (i + 1) * TILE + R;
          if (this.vel.x < -o.impactTreshhold) o.terrainImpact(this.index, { x: -1, y: 0 }, Math.abs(this.vel.x), this.lastContactPoint.x > -1);
          cp.x = -1; this.vel.x = Math.abs(this.vel.x) * o.bounce;
          if (Math.abs(this.vel.x) < 1 + 9 * (1 - o.bounce)) this.vel.x = 0;
          this.vel.y *= clamp(o.surfaceFriction * 2, 0, 1); done = true;
        }
      }
    }
  }
}

class PhysicalObject {
  constructor() {
    this.room = null; this.slated = false;
    this.bodyChunks = []; this.bodyChunkConnections = []; this.grabbedBy = [];
    this.g = 0.9; this.airFriction = 0.999; this.bounce = 0.1; this.surfaceFriction = 0.5;
    this.impactTreshhold = 1; this.collisionLayer = 1; this.graphics = null;
  }
  get gravity() { return this.g * this.room.gravity; }
  get firstChunk() { return this.bodyChunks[0]; }
  get totalMass() { return this.bodyChunks.reduce((s, c) => s + c.mass, 0); }
  get goThroughFloors() { return this.bodyChunks.every(c => c.goThroughFloors); }
  set goThroughFloors(v) { for (const c of this.bodyChunks) c.goThroughFloors = v; }

  update() {
    for (const c of this.bodyChunks) c.update();
    for (const c of this.bodyChunkConnections) c.update();
    this.grabbedBy = this.grabbedBy.filter(g => !g.discontinued && g.grabber.grasps[g.graspUsed] === g);
  }
  isTileSolid(bChunk, rx, ry) {
    const t = this.room.tileOf(this.bodyChunks[bChunk].pos), tt = this.room.get(t.x + rx, t.y + ry);
    if (tt === T.SOLID) return true;
    return tt === T.PLATFORM && ry < 0 && !this.bodyChunks[bChunk].goThroughFloors;
  }
  weightedPush(A, B, dir, frc) {
    const a = this.bodyChunks[A], b = this.bodyChunks[B], m = b.mass / (a.mass + b.mass);
    a.vel.iadd(dir.mul(frc * m)); b.vel.isub(dir.mul(frc * (1 - m)));
  }
  terrainImpact(chunk, dir, speed, firstContact) {   // PhysicalObject.TerrainImpact: impacts make noise
    if (!firstContact) return;
    const c = this.bodyChunks[chunk], x = speed * c.loudness * lerp(c.mass, 1, 0.5);
    if (speed > 4 && x > 0.5) this.room.noise(c.pos.clone(), lerp(350, lerp(100, 1500, invLerp(0.5, 20, x)), 0.5), this);
  }
  collide() {}
}

class Creature extends PhysicalObject {
  constructor() { super(); this.stun = 0; this.dead = false; this.grasps = [null]; this.newToRoomInvinsibility = 0; }
  get Stunned() { return this.stun >= 10; }
  get Consious() { return !this.Stunned && !this.dead; }
  get mainBodyChunk() { return this.bodyChunks[0]; }
  update() { if (this.newToRoomInvinsibility > 0) this.newToRoomInvinsibility--; if (this.stun > 0) this.stun--; super.update(); }
  stunFor(st) { this.stun = Math.max(this.stun, st); }
  die() { this.dead = true; this.loseAllGrasps(); }
  grab(obj, graspUsed, chunkGrabbed, pacifying = true) {
    if (obj.slated) return false;
    for (const g of obj.grabbedBy) if (g.grabber === this) return false;
    if (obj.grabbedBy.length) return false;
    this.releaseGrasp(graspUsed);
    const g = { grabber: this, grabbed: obj, graspUsed, chunkGrabbed, discontinued: false, pacifying };
    this.grasps[graspUsed] = g; obj.grabbedBy.push(g);
    return true;
  }
  releaseGrasp(i) {
    const g = this.grasps[i]; if (!g) return;
    g.discontinued = true; g.grabbed.grabbedBy = g.grabbed.grabbedBy.filter(x => x !== g); this.grasps[i] = null;
  }
  loseAllGrasps() { for (let i = 0; i < this.grasps.length; i++) this.releaseGrasp(i); }
  violence() {}
}
