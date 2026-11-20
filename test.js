// Headless smoke test: node test.js
const fs = require('fs'), vm = require('vm');
const files = ['util', 'room', 'aimap', 'pather', 'physics', 'bodyparts', 'breeds', 'level', 'prey', 'lizardai', 'graphics', 'lizard'];
const src = files.map(f => fs.readFileSync(__dirname + '/' + f + '.js', 'utf8')).join('\n');
const test = `
const room = buildLevel();
const prey = new Prey(room, 31, 2); room.addObject(prey);
const lz = new Lizard(room, 22, 8, 1234); room.addObject(lz);
const log = { bad: 0, beh: {}, bites: 0, gripSum: 0, minD: 1e9, maxSpeed: 0 };
let heldTicks = 0;
for (let t = 0; t < 6000; t++) {
  prey.input.x = 0; prey.input.y = 0; prey.input.jump = false;
  room.update();
  for (const c of lz.bodyChunks) { if (c.pos.isBad() || c.vel.isBad()) log.bad++; log.maxSpeed = Math.max(log.maxSpeed, c.vel.mag); }
  log.beh[lz.AI.behavior] = (log.beh[lz.AI.behavior] || 0) + 1;
  log.gripSum += lz.legsGripping;
  log.minD = Math.min(log.minD, lz.mainBodyChunk.pos.dist(prey.mainBodyChunk.pos));
  if (lz.grasps[0]) heldTicks++;
  if (t % 500 === 0) console.log(t, lz.AI.behavior, 'anim', lz.animation, 'lz', lz.coord.x + ',' + lz.coord.y, 'prey', room.tileOf(prey.mainBodyChunk.pos).x + ',' + room.tileOf(prey.mainBodyChunk.pos).y, 'dead', prey.dead, 'legs', lz.legsGripping, 'run', lz.AI.runSpeed.toFixed(2));
  // make the prey wander so the lizard has something to chase
  if (t % 300 === 150) { prey.input.x = (t / 300) % 2 ? 1 : -1; }
  if (t % 300 > 150 && t % 300 < 190) { prey.input.x = (t / 300 | 0) % 2 ? 1 : -1; }
}
console.log(JSON.stringify(log), 'avg legs', (log.gripSum / 6000).toFixed(2), 'held ticks', heldTicks);
`;
vm.runInThisContext("'use strict';" + src + test);
