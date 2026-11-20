'use strict';
// =====================================================================================
//  pather.js — stand-in for LizardPather: tile graph with MovementConnections and two
//  Dijkstra fields (cost-to-destination for FollowPath, cost-from-creature for reachability).
// =====================================================================================
class MovementConnection {
  constructor(type, startCoord, destCoord, cost = 1) { this.type = type; this.startCoord = startCoord; this.destCoord = destCoord; this.cost = cost; }
  get StartTile() { return this.startCoord; }
  get DestTile() { return this.destCoord; }
  get destinationCoord() { return this.destCoord; }
  key() { return this.type + this.startCoord.x + ',' + this.startCoord.y + '>' + this.destCoord.x + ',' + this.destCoord.y; }
}

class MinHeap {
  constructor() { this.a = []; }
  push(c, i) { const a = this.a; a.push([c, i]); let k = a.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (a[p][0] <= a[k][0]) break; [a[p], a[k]] = [a[k], a[p]]; k = p; } }
  pop() {
    const a = this.a, top = a[0], last = a.pop();
    if (a.length) { a[0] = last; let k = 0; for (;;) { let l = 2 * k + 1, r = l + 1, m = k; if (l < a.length && a[l][0] < a[m][0]) m = l; if (r < a.length && a[r][0] < a[m][0]) m = r; if (m === k) break; [a[m], a[k]] = [a[k], a[m]]; k = m; } }
    return top;
  }
  get size() { return this.a.length; }
}

class Pather {
  constructor(room, aimap, P) {
    this.room = room; this.am = aimap; this.P = P;
    this.n = room.w * room.h;
    this.wanted = null; this.dest = null; this.toDest = null; this.fromMe = null; this.meKey = '';
    this.destDirty = false;
    this.build();
  }
  idx(x, y) { return y * this.room.w + x; }
  acc(x, y) { return this.am.accessible(x, y, this.P); }

  build() {
    const room = this.room, am = this.am, P = this.P;
    this.out = Array.from({ length: this.n }, () => []);
    this.inn = Array.from({ length: this.n }, () => []);
    const res = (x, y) => P.tileRes[am.accAt(x, y)];
    for (let y = 0; y < room.h; y++) for (let x = 0; x < room.w; x++) {
      if (!this.acc(x, y)) continue;
      const add = (type, nx, ny, cost) => {
        const c = new MovementConnection(type, { x, y }, { x: nx, y: ny }, cost);
        c.si = this.idx(x, y); c.di = this.idx(nx, ny);
        this.out[c.si].push(c); this.inn[c.di].push(c);
      };
      for (const d of FOUR) if (this.acc(x + d.x, y + d.y)) add('Standard', x + d.x, y + d.y, res(x + d.x, y + d.y));
      // wrapping around a corner (floor -> wall -> ceiling) is a diagonal step hugging a solid tile; only wall climbers have such tiles
      for (const d of [{ x: -1, y: -1 }, { x: 1, y: -1 }, { x: -1, y: 1 }, { x: 1, y: 1 }]) {
        const nx = x + d.x, ny = y + d.y, k = am.accAt(nx, ny);
        const wc = a => a === Acc.Wall || a === Acc.Ceiling;
        if ((wc(k) || wc(am.accAt(x, y))) && this.acc(nx, ny) && am.solid(x + d.x, y) !== am.solid(x, y + d.y)) add('Standard', nx, ny, 1.2 * res(nx, ny));
      }
      if (!am.support(x, y - 1)) continue;
      for (const dx of [-1, 1]) {
        if (am.solid(x + dx, y)) {                                   // 1-tile ledge up
          if (!am.solid(x, y + 1) && this.acc(x + dx, y + 1)) add('ReachUp', x + dx, y + 1, 1.2 * res(x + dx, y + 1));
        } else if (!this.acc(x + dx, y) && room.get(x + dx, y) !== T.PLATFORM) { // open edge: step/drop down
          for (let k = 1; k <= 20; k++) {
            const ty = y - k, t = room.get(x + dx, ty);
            if (t === T.SOLID || t === T.PLATFORM) break;
            if (this.acc(x + dx, ty)) { add(k === 1 ? 'ReachDown' : 'DropToFloor', x + dx, ty, k === 1 ? 1.2 * res(x + dx, ty) : 6 + k); break; }
          }
        }
      }
    }
  }

  dijkstra(startI, edges, nextOf) {
    const cost = new Float64Array(this.n).fill(Infinity), h = new MinHeap();
    cost[startI] = 0; h.push(0, startI);
    while (h.size) {
      const [c, i] = h.pop();
      if (c > cost[i]) continue;
      for (const e of edges[i]) { const j = nextOf(e), nc = c + e.cost; if (nc < cost[j]) { cost[j] = nc; h.push(nc, j); } }
    }
    return cost;
  }

  setDestination(x, y) {
    if (this.wanted && this.wanted.x === x && this.wanted.y === y) return;
    this.wanted = { x, y }; this.destDirty = true;
  }
  update(me) {
    if (this.acc(me.x, me.y)) {
      const k = me.x + ',' + me.y;
      if (k !== this.meKey) { this.meKey = k; this.fromMe = this.dijkstra(this.idx(me.x, me.y), this.out, e => e.di); this.destDirty = true; }
    }
    if (this.destDirty) this.applyDest();
  }
  applyDest() {
    this.destDirty = false;
    const w = this.wanted; if (!w) return;
    let snap = null;
    if (this.acc(w.x, w.y) && this.reachable(w.x, w.y)) snap = w;
    else {
      let best = Infinity;
      for (let r = 1; r <= 14 && !snap; r++) {
        for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const x = w.x + dx, y = w.y + dy;
          if (!this.acc(x, y) || !this.reachable(x, y)) continue;
          const d = Math.hypot(dx, dy); if (d < best) { best = d; snap = { x, y }; }
        }
      }
    }
    if (!snap) { this.dest = null; this.toDest = null; return; }
    if (this.dest && this.dest.x === snap.x && this.dest.y === snap.y && this.toDest) return;
    this.dest = snap; this.toDest = this.dijkstra(this.idx(snap.x, snap.y), this.inn, e => e.si);
  }
  reachable(x, y) { if (!this.acc(x, y)) return false; return this.fromMe ? this.fromMe[this.idx(x, y)] < Infinity : true; }
  get destination() { return this.dest; }

  followPath(t) {
    if (!this.toDest || !this.acc(t.x, t.y)) return null;
    const i = this.idx(t.x, t.y); if (this.toDest[i] === Infinity || this.toDest[i] === 0) return null;
    let best = null, bv = Infinity;
    for (const c of this.out[i]) { const v = c.cost + this.toDest[c.di]; if (this.toDest[c.di] < this.toDest[i] && v < bv) { bv = v; best = c; } }
    return best;
  }
  rayTraceInAccessibleTiles(a, b) {
    const steps = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y)) * 2 + 1;
    for (let i = 0; i <= steps; i++) { const f = i / steps; if (!this.acc(Math.round(a.x + (b.x - a.x) * f), Math.round(a.y + (b.y - a.y) * f))) return false; }
    return true;
  }
}
