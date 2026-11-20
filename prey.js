'use strict';
// =====================================================================================
//  prey.js — a small controllable "slugcat" blob for the lizards to hunt.
//  WASD/arrows move, W/Space jump (and climb poles), drag with the mouse to throw it.
// =====================================================================================
class Prey extends Creature {
  constructor(room, tx, ty) {
    super();
    this.room = room;
    this.spawn = new V(tx * TILE + 10, ty * TILE + 10);
    this.bodyChunks = [new BodyChunk(this, 0, this.spawn, 9, 1)];
    this.hostility = 1;                       // relationship intensity seen by lizards
    this.input = { x: 0, y: 0, jump: false, lastJump: false };
    this.clinging = false; this.deadTimer = 0; this.heldTicks = 0; this.dragTarget = null;
    this.health = 1;
  }
  get graspWiggle() { return this.input.jump || this.input.x !== 0 ? 0.5 : 0; }
  die() { if (!this.dead) { this.dead = true; this.deadTimer = 0; this.clinging = false; } }
  violence(dmg) { this.health -= dmg; if (this.health <= 0) this.die(); }
  respawn() {
    this.dead = false; this.health = 1; this.heldTicks = 0; this.deadTimer = 0;
    for (const g of this.grabbedBy.slice()) g.grabber.releaseGrasp(g.graspUsed);
    const c = this.bodyChunks[0]; c.pos.copy(this.spawn); c.lastPos.copy(this.spawn); c.vel.set(0, 0);
  }
  update() {
    const c = this.bodyChunks[0], inp = this.input;
    if (this.dead) {
      this.deadTimer++; this.g = 0.9; this.goThroughFloors = false;
      if (this.deadTimer > 150) this.respawn();
    } else {
      if (this.grabbedBy.length) { this.heldTicks++; if (this.heldTicks > 240) this.die(); } else this.heldTicks = 0;
      const t = this.room.terrainAt(c.pos), grounded = c.contactPoint.y < 0, onPole = t === T.POLE;
      const jumpPressed = inp.jump && !inp.lastJump;
      if (onPole && (inp.y !== 0)) this.clinging = true;
      if (!onPole) this.clinging = false;
      if (this.grabbedBy.length) { this.clinging = false; }
      this.g = 0.9;
      if (this.clinging) {
        this.g = 0; c.vel.y = lerp(c.vel.y, inp.y * 3.5, 0.4);
        c.vel.x = lerp(c.vel.x, inp.x * 2.5, 0.3);
        if (jumpPressed) { this.clinging = false; c.vel.y = 8; c.vel.x += inp.x * 3; }
      } else if (!this.grabbedBy.length) {
        if (grounded) c.vel.x = lerp(c.vel.x, inp.x * 4.2, 0.35); else c.vel.x += inp.x * 0.45;
        c.vel.x = clamp(c.vel.x, -6, 6);
        if (jumpPressed && grounded) c.vel.y = 11;
      }
      this.goThroughFloors = c.vel.y > 0.5 || inp.y < 0;
      if (this.dragTarget) { this.g = 0; this.clinging = false; c.vel.copy(this.dragTarget.sub(c.pos).mul(0.25).clampMag(30)); }
    }
    inp.lastJump = inp.jump;
    super.update();
  }
  draw(ctx) {
    const c = this.bodyChunks[0], x = c.pos.x, y = c.pos.y;
    ctx.fillStyle = this.dead ? 'rgba(200,200,200,0.45)' : '#f2f2ee';
    ctx.beginPath(); ctx.arc(x, y, c.rad, 0, 7); ctx.fill();
    ctx.fillStyle = '#222'; const f = this.input.x >= 0 ? 1 : -1;
    ctx.beginPath(); ctx.arc(x + 3 * f, y + 2, 1.6, 0, 7); ctx.fill();
  }
}
