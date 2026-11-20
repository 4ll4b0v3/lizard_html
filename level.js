'use strict';
// =====================================================================================
//  level.js — hand-built test room (50 x 26 tiles). y is UP; row 0 is the bottom.
// =====================================================================================
function buildLevel() {
  const r = new Room(50, 26);
  const S = T.SOLID, P = T.POLE, PL = T.PLATFORM, A = T.AIR;
  r.rect(0, 0, 49, 1, S); r.rect(0, 0, 0, 25, S); r.rect(49, 0, 49, 25, S); r.rect(0, 25, 49, 25, S);
  // staircase (1 tile per step) up to a plateau
  r.rect(5, 2, 6, 2, S); r.rect(7, 2, 8, 3, S); r.rect(9, 2, 10, 4, S); r.rect(11, 2, 12, 5, S); r.rect(13, 2, 14, 6, S); r.rect(15, 2, 16, 7, S);
  r.rect(17, 2, 28, 7, S);
  // left pole up to a one-way platform
  r.rect(1, 14, 10, 14, PL); r.rect(3, 2, 3, 15, P);
  // middle pole up to a platform
  r.rect(30, 16, 38, 16, PL); r.rect(33, 2, 33, 17, P);
  // steps -> block with a tunnel
  r.rect(36, 2, 36, 2, S); r.rect(37, 2, 39, 3, S); r.rect(40, 2, 46, 6, S); r.rect(40, 4, 46, 4, A);
  // platform only the prey can reach (tests "unreachable prey" behaviour)
  r.rect(20, 10, 26, 10, PL);
  r.aimap = new AIMap(r);
  r.lizardSpawn = { x: 22, y: 8 }; r.preySpawn = { x: 31, y: 2 };
  return r;
}
