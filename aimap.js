'use strict';
// =====================================================================================
//  aimap.js — AImap stand-in: per-tile accessibility (Floor / Corridor / Climb ...),
//  narrow-space flag, floor altitude, rough visibility score and fall-risk lookup.
// =====================================================================================
const Acc = { Impassable: 0, Floor: 1, CurvedFloor: 2, Corridor: 3, Climb: 4, Wall: 5, Ceiling: 6, Air: 7, Solid: 8, Sand: 9 };

class AIMap {
  constructor(room) {
    this.room = room;
    const n = room.w * room.h;
    this.acc = new Uint8Array(n); this.narrow = new Uint8Array(n);
    this.floorAlt = new Uint8Array(n); this.vis = new Float32Array(n);
    this.compute();
  }
  i(x, y) { return y * this.room.w + x; }
  inb(x, y) { return x >= 0 && y >= 0 && x < this.room.w && y < this.room.h; }
  solid(x, y) { return this.room.get(x, y) === T.SOLID; }
  support(x, y) { const t = this.room.get(x, y); return t === T.SOLID || t === T.PLATFORM; }

  compute() {
    const r = this.room;
    for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) {
      const i = this.i(x, y), t = r.get(x, y);
      if (t === T.SOLID || t === T.PLATFORM) { this.acc[i] = Acc.Solid; continue; }
      const narrow = (this.solid(x - 1, y) && this.solid(x + 1, y)) || (this.solid(x, y - 1) && this.solid(x, y + 1));
      this.narrow[i] = narrow ? 1 : 0;
      this.acc[i] = t === T.POLE ? Acc.Climb : narrow ? Acc.Corridor : this.support(x, y - 1) ? Acc.Floor
        : (this.solid(x - 1, y) || this.solid(x + 1, y)) ? Acc.Wall : this.solid(x, y + 1) ? Acc.Ceiling : Acc.Air;   // Wall / Ceiling only matter to wall climbers
      let a = 0; while (a < 20 && !this.support(x, y - 1 - a)) a++;
      this.floorAlt[i] = a;
      // crude "visibility": total free ray length in 16 directions (tiles)
      let sum = 0;
      for (let k = 0; k < 16; k++) {
        const dx = Math.cos(k * Math.PI / 8) * 0.5, dy = Math.sin(k * Math.PI / 8) * 0.5;
        let px = x + 0.5, py = y + 0.5, len = 0;
        while (len < 30 && r.get(Math.floor(px), Math.floor(py)) !== T.SOLID) { px += dx; py += dy; len += 0.5; }
        sum += len;
      }
      this.vis[i] = sum;
    }
  }
  // AImap.getTerrainProximity: Chebyshev distance to the nearest solid tile (1 = touching), capped at 8
  proxAt(x, y) {
    for (let r = 1; r < 8; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++)
      if (Math.max(Math.abs(dx), Math.abs(dy)) === r && this.solid(x + dx, y + dy)) return r;
    return 8;
  }
  accAt(x, y) { return this.inb(x, y) ? this.acc[this.i(x, y)] : Acc.Solid; }
  narrowAt(x, y) { return this.inb(x, y) && this.narrow[this.i(x, y)] === 1; }
  floorAltitude(x, y) { return this.inb(x, y) ? this.floorAlt[this.i(x, y)] : 0; }
  visibility(x, y) { return this.inb(x, y) ? this.vis[this.i(x, y)] : 0; }
  accessible(x, y, P) { return this.inb(x, y) && P.tileRes[this.acc[this.i(x, y)]] !== undefined; }
  accessiblePos(p, P) { return this.accessible(Math.floor(p.x / TILE), Math.floor(p.y / TILE), P); }
  // y of the tile you would land on when falling from (x,y); -1 if you'd fall out of the room
  fallRiskY(x, y) { let yy = y; while (!this.support(x, yy - 1)) { yy--; if (yy < 0) return -1; } return yy; }
}
