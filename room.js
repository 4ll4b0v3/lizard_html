'use strict';
// =====================================================================================
//  room.js — tile grid "Room" (stand-in for Room + Room.Tile). Tiles are 20x20 px.
// =====================================================================================
const T = { AIR: 0, SOLID: 1, POLE: 2, PLATFORM: 3 };   // PLATFORM = one-way floor (RW "Floor" terrain)

class Room {
  constructor(w, h) {
    this.w = w; this.h = h; this.pixelW = w * TILE; this.pixelH = h * TILE;
    this.tiles = new Uint8Array(w * h);
    this.gravity = 1;
    this.objects = [];
    this.aimap = null;
    this.time = 0;
  }
  get(x, y) { return (x < 0 || y < 0 || x >= this.w || y >= this.h) ? T.SOLID : this.tiles[y * this.w + x]; }
  set(x, y, t) { if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.tiles[y * this.w + x] = t; }
  rect(x0, y0, x1, y1, t) { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) this.set(x, y, t); }
  tileOf(p) { return { x: Math.floor(p.x / TILE), y: Math.floor(p.y / TILE) }; }
  terrainAt(p) { return this.get(Math.floor(p.x / TILE), Math.floor(p.y / TILE)); }
  middleOfTile(t) { return new V(t.x * TILE + TILE / 2, t.y * TILE + TILE / 2); }

  visualContact(a, b) {
    const d = a.dist(b), steps = Math.max(1, Math.ceil(d / 8));
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      if (this.get(Math.floor((a.x + (b.x - a.x) * t) / TILE), Math.floor((a.y + (b.y - a.y) * t) / TILE)) === T.SOLID) return false;
    }
    return true;
  }

  // push a circle out of solid tiles (used for tail / head / loose body parts)
  pushOut(pos, rad) {
    let hit = false;
    const x0 = Math.floor((pos.x - rad) / TILE), x1 = Math.floor((pos.x + rad) / TILE);
    const y0 = Math.floor((pos.y - rad) / TILE), y1 = Math.floor((pos.y + rad) / TILE);
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
      if (this.get(tx, ty) !== T.SOLID) continue;
      const minX = tx * TILE, maxX = minX + TILE, minY = ty * TILE, maxY = minY + TILE;
      const dx = pos.x - clamp(pos.x, minX, maxX), dy = pos.y - clamp(pos.y, minY, maxY), d2 = dx * dx + dy * dy;
      if (d2 >= rad * rad) continue;
      hit = true;
      if (d2 > 1e-9) { const d = Math.sqrt(d2); pos.x += dx / d * (rad - d); pos.y += dy / d * (rad - d); }
      else {
        const l = pos.x - minX, r = maxX - pos.x, b = pos.y - minY, t = maxY - pos.y, m = Math.min(l, r, b, t);
        if (m === l) pos.x = minX - rad; else if (m === r) pos.x = maxX + rad; else if (m === b) pos.y = minY - rad; else pos.y = maxY + rad;
      }
    }
    return hit;
  }

  // first body chunk (not owned by `ignore`) hit by the segment a->b widened by rad; returns { chunk, point }
  traceChunks(a, b, rad, ignore) {
    const d = b.sub(a), len2 = Math.max(d.x * d.x + d.y * d.y, 1e-9); let best = null, bt = 2;
    for (const o of this.objects) {
      if (o === ignore || !o.bodyChunks || !o.bodyChunks.length || o.slated) continue;
      for (const ch of o.bodyChunks) {
        const t = clamp(((ch.pos.x - a.x) * d.x + (ch.pos.y - a.y) * d.y) / len2, 0, 1);
        const cp = new V(a.x + d.x * t, a.y + d.y * t), R = ch.rad + rad;
        if (cp.dist(ch.pos) >= R) continue;
        const te = clamp(t - Math.sqrt(R * R - cp.dist(ch.pos) ** 2) / Math.sqrt(len2), 0, 1);   // where the segment enters the circle
        if (te < bt) { bt = te; best = { chunk: ch, point: new V(a.x + d.x * te, a.y + d.y * te) }; }
      }
    }
    return best;
  }

  addObject(o) { o.room = this; this.objects.push(o); }
  noise(pos, strength, source) { for (const o of this.objects) if (o.hearNoise) o.hearNoise(pos, strength, source); }

  update() {
    this.time++;
    for (const o of this.objects.slice()) if (!o.slated) o.update();
    this.objects = this.objects.filter(o => !o.slated);
    // creature <-> creature chunk overlap -> Collide() callbacks (RW does this in Room.Update)
    const cs = this.objects.filter(o => o.bodyChunks && o.bodyChunks.length && o.collide);
    for (let i = 0; i < cs.length; i++) for (let j = i + 1; j < cs.length; j++) {
      const a = cs[i], b = cs[j];
      if (a.collisionLayer !== b.collisionLayer) continue;
      for (const ca of a.bodyChunks) for (const cb of b.bodyChunks) {
        const dx = ca.pos.x - cb.pos.x, dy = ca.pos.y - cb.pos.y, r = ca.rad + cb.rad;
        if (dx * dx + dy * dy < r * r) {
          a.collide(b, ca.index, cb.index); b.collide(a, cb.index, ca.index);
          // chunks of different creatures are solid to each other (otherwise a lizard parks its head on top of its prey and the bite point overshoots it);
          // a carried object is held by the carrier and not pushed
          if (a.grabbedBy.some(g => g.grabber === b) || b.grabbedBy.some(g => g.grabber === a)) continue;
          const d = Math.hypot(dx, dy) || 0.001, nx = dx / d, ny = dy / d, over = r - d, ma = ca.mass, mb = cb.mass, f = ma + mb;
          ca.pos.x += nx * over * (mb / f); ca.pos.y += ny * over * (mb / f); cb.pos.x -= nx * over * (ma / f); cb.pos.y -= ny * over * (ma / f);
          ca.vel.x += nx * over * (mb / f) * 0.5; ca.vel.y += ny * over * (mb / f) * 0.5; cb.vel.x -= nx * over * (ma / f) * 0.5; cb.vel.y -= ny * over * (ma / f) * 0.5;
        }
      }
    }
  }
}
