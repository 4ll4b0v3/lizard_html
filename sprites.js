'use strict';
// =====================================================================================
//  sprites.js — Futile-style atlas: rainWorld.png + frame list (rainWorld.json.js).
//  Mirrors FSprite.UpdateLocalVertices: element = {frame, spriteSourceSize, sourceSize}, anchor default 0.5.
//  Sprites in the atlas are white and get tinted at draw time (like FSprite.color).
// =====================================================================================
const Atlas = {
  img: null, ready: false, tints: new Map(),
  load(src) { const i = new Image(); i.onload = () => { this.img = i; this.ready = typeof ATLAS_FRAMES !== 'undefined'; }; i.src = src; },
  el(name) { const f = ATLAS_FRAMES[name + '.png']; return f && { x: f[0], y: f[1], w: f[2], h: f[3], sx: f[4], sy: f[5], W: f[6], H: f[7] }; },
  tinted(name, col) {
    const key = name + '|' + col; let c = this.tints.get(key); if (c) return c;
    const e = this.el(name); c = document.createElement('canvas'); c.width = e.w; c.height = e.h;
    const g = c.getContext('2d'); g.drawImage(this.img, e.x, e.y, e.w, e.h, 0, 0, e.w, e.h);
    g.globalCompositeOperation = 'source-in'; g.fillStyle = col; g.fillRect(0, 0, e.w, e.h);
    if (this.tints.size > 1500) this.tints.clear();
    this.tints.set(key, c); return c;
  },
  // x,y in (y-up) world; rot = Futile rotation (deg, clockwise); anchor default 0.5
  draw(ctx, name, x, y, rot, scaleX, scaleY, rgb, ax = 0.5, ay = 0.5) {
    const e = this.el(name); if (!e) return;
    const cv = this.tinted(name, C.rgb(rgb)), r = rot / RAD2DEG, cs = Math.cos(r), sn = Math.sin(r);
    ctx.save();
    // image-right -> compass 90+rot, image-down -> opposite of compass rot (world is y-up here)
    ctx.transform(cs * scaleX, -sn * scaleX, -sn * scaleY, -cs * scaleY, x, y);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(cv, e.sx - ax * e.W, e.sy - e.H + ay * e.H, e.w, e.h);
    ctx.restore();
  },
};
