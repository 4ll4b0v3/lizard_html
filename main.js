'use strict';
// =====================================================================================
//  main.js — game loop (fixed 40 Hz like Rain World), input, rendering of room + objects.
// =====================================================================================
(function () {
  const canvas = document.getElementById('c'), ctx = canvas.getContext('2d'), hud = document.getElementById('hud');
  let room, prey, lizards, debug = false, paused = false, breed = 'pink';

  function reset() {
    room = buildLevel();
    prey = new Prey(room, room.preySpawn.x, room.preySpawn.y); room.addObject(prey);
    lizards = [];
    spawnLizard(room.lizardSpawn.x, room.lizardSpawn.y);
  }
  function spawnLizard(tx, ty) {
    if (lizards.length >= 6) return;
    const l = new Lizard(room, tx, ty, undefined, breed); room.addObject(l); lizards.push(l);
  }
  reset();
  const sel = document.getElementById('breed');
  for (const k in Breeds) sel.add(new Option(k[0].toUpperCase() + k.slice(1), k));
  sel.onchange = () => { breed = sel.value; sel.blur(); reset(); };

  // ---- input ----
  Atlas.load('assets/atlas_464x512.png');
  const keys = {};
  addEventListener('keydown', e => {
    keys[e.code] = true;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    if (e.target === sel) return;
    if (e.code === 'KeyD') debug = !debug;
    if (e.code === 'KeyT') for (const l of lizards) l.graphics.useSprites = !l.graphics.useSprites;
    if (e.code === 'KeyM') VoiceAudio.setMuted(!VoiceAudio.muted);
    if (e.code === 'KeyP') paused = !paused;
    if (e.code === 'KeyR') reset();
    if (e.code === 'KeyL') { const m = mouseWorld(); spawnLizard(clamp(Math.floor(m.x / TILE), 1, room.w - 2), clamp(Math.floor(m.y / TILE), 1, room.h - 2)); }
  });
  addEventListener('keyup', e => { keys[e.code] = false; });
  let view = { s: 1, ox: 0, oy: 0 }, mouse = { x: 0, y: 0 };
  const mouseWorld = () => new V((mouse.x - view.ox) / view.s, room.pixelH - (mouse.y - view.oy) / view.s);
  canvas.addEventListener('mousemove', e => { const r = canvas.getBoundingClientRect(); mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top; if (prey.dragTarget) prey.dragTarget = mouseWorld(); });
  canvas.addEventListener('mousedown', e => { const m = mouseWorld(); if (m.dist(prey.mainBodyChunk.pos) < 60) { prey.dragTarget = m; prey.respawnLock = true; } });
  addEventListener('mouseup', () => { prey.dragTarget = null; });

  function applyInput() {
    const i = prey.input;
    i.x = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
    i.y = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0);
    i.jump = !!(keys.Space || keys.KeyW || keys.ArrowUp);
  }

  // ---- rendering ----
  function resize() { canvas.width = innerWidth; canvas.height = innerHeight; }
  addEventListener('resize', resize); resize();

  function drawRoom() {
    const g = ctx.createLinearGradient(0, room.pixelH, 0, 0);
    g.addColorStop(0, '#8fa39f'); g.addColorStop(1, '#6f8581');
    ctx.fillStyle = g; ctx.fillRect(0, 0, room.pixelW, room.pixelH);
    for (let y = 0; y < room.h; y++) for (let x = 0; x < room.w; x++) {
      const t = room.get(x, y), px = x * TILE, py = y * TILE;
      if (t === T.SOLID) {
        ctx.fillStyle = '#2b3338'; ctx.fillRect(px, py, TILE + 0.5, TILE + 0.5);
        if (room.get(x, y + 1) !== T.SOLID) { ctx.fillStyle = '#3d494f'; ctx.fillRect(px, py + TILE - 3, TILE + 0.5, 3); }
      } else if (t === T.PLATFORM) { ctx.fillStyle = '#2b3338'; ctx.fillRect(px, py + TILE - 5, TILE + 0.5, 5); }
      else if (t === T.POLE) { ctx.fillStyle = '#2b3338'; ctx.fillRect(px + TILE / 2 - 2, py, 4, TILE + 0.5); }
    }
  }
  function drawDebug(l) {
    const am = room.aimap;
    ctx.globalAlpha = 0.25;
    for (let y = 0; y < room.h; y++) for (let x = 0; x < room.w; x++) if (am.accessible(x, y, l.lizardParams)) { ctx.fillStyle = '#00ffd0'; ctx.fillRect(x * TILE + 7, y * TILE + 7, 6, 6); }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = '#ff0'; ctx.lineWidth = 1;
    for (const c of l.bodyChunks) { ctx.beginPath(); ctx.arc(c.pos.x, c.pos.y, c.rad, 0, 7); ctx.stroke(); }
    for (const lb of l.graphics.limbs) { ctx.strokeStyle = lb.reachingForTerrain ? '#0f0' : '#f60'; ctx.beginPath(); ctx.arc(lb.absoluteHuntPos.x, lb.absoluteHuntPos.y, 3, 0, 7); ctx.stroke(); }
    const d = l.AI.pather.dest; if (d) { ctx.strokeStyle = '#f0f'; ctx.strokeRect(d.x * TILE, d.y * TILE, TILE, TILE); }
    if (l.followingConnection) { const c = l.followingConnection; ctx.strokeStyle = '#fff'; ctx.beginPath(); ctx.moveTo(c.startCoord.x * TILE + 10, c.startCoord.y * TILE + 10); ctx.lineTo(c.destCoord.x * TILE + 10, c.destCoord.y * TILE + 10); ctx.stroke(); }
    ctx.save(); ctx.scale(1, -1); ctx.fillStyle = '#fff'; ctx.font = '11px monospace';
    ctx.fillText(`${l.AI.behavior} anim:${l.animation} run:${l.AI.runSpeed.toFixed(2)} legs:${l.legsGripping}`, l.mainBodyChunk.pos.x - 40, -(l.mainBodyChunk.pos.y + 40));
    ctx.restore();
  }
  function render(ts) {
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#111'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    const s = Math.min(canvas.width / room.pixelW, canvas.height / room.pixelH);
    view = { s, ox: (canvas.width - room.pixelW * s) / 2, oy: (canvas.height - room.pixelH * s) / 2 };
    ctx.setTransform(s, 0, 0, -s, view.ox, view.oy + room.pixelH * s);
    drawRoom();
    for (const l of lizards) l.graphics.draw(ctx, ts);
    prey.draw(ctx);
    if (debug) for (const l of lizards) drawDebug(l);
    hud.textContent = `lizards: ${lizards.length}   ${paused ? '[paused]' : ''}`;
  }

  // ---- loop ----
  let last = performance.now(), acc = 0; const DT = 25;
  function frame(now) {
    acc += Math.min(now - last, 200); last = now;
    while (acc >= DT) { if (!paused) { applyInput(); room.update(); } acc -= DT; }
    render(acc / DT);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
