'use strict';
// =====================================================================================
//  graphics.js — LizardGraphics.Update (ported: limbs, tail, head, bob, blink, depth rotation)
//  plus a procedural canvas renderer replacing the sprite/mesh code in DrawSprites.
// =====================================================================================
const BLACK = [0.07, 0.08, 0.1], WHITE = [1, 1, 1];
const CAMO_PICKUP = [0.17, 0.2, 0.22];   // the colour a white lizard camouflages to (this room's terrain colour)

class LizardGraphics {
  constructor(lizard) {
    this.lizard = lizard; this.owner = lizard; const P = this.P = lizard.lizardParams;
    withSeed(lizard.seed, () => { this.iVars = this.generateIvars(); this.tailColor = this.iVars.tailColor; });
    // limbs: 0,1 front (chunk 0), 2,3 hind (chunk 2); odd limb's pair is limb-1
    this.limbs = [];
    for (let i = 0; i < 4; i++) this.limbs[i] = new LizardLimb(this, lizard.bodyChunks[i >= 2 ? 2 : 0], i, 2.5, 0.7, 0.99, P.limbSpeed, P.limbQuickness, i % 2 === 1 ? this.limbs[i - 1] : null);
    this.tail = [];
    for (let j = 0; j < P.tailSegments; j++) {
      let rad = 8 * P.bodySizeFac; rad *= (P.tailSegments - j) / P.tailSegments;
      let conn = ((j > 0 ? 8 : 16) + rad) / 2; conn *= P.tailLengthFactor * this.iVars.tailLength;
      this.tail[j] = new TailSegment(this, rad, conn, j > 0 ? this.tail[j - 1] : null, 0.85, 1, 0.4, false);
    }
    this.tailLength = this.tail.reduce((s, t) => s + t.connectionRad, 0);
    this.head = new GenericBodyPart(this, 6 * P.headSize, 0.5, 0.99, lizard.bodyChunks[0]);
    this.headConnectionRad = 11 * P.headSize;
    this.bodyLength = this.headConnectionRad * 0.5 + lizard.bodyChunkConnections.reduce((s, c) => s + c.distance, 0);
    this.drawPositions = [0, 1, 2].map(() => [new V(), new V()]);
    this.legsGrabbing = 0; this.frontLegsGrabbing = 0; this.hindLegsGrabbing = 0; this.noGripCounter = 0;
    this.frontBob = 0; this.hindBob = 0; this.depthRotation = 0; this.lastDepthRotation = 0; this.headDepthRotation = 0; this.lastHeadDepthRotation = 0;
    this.blink = Math.random(); this.lastBlink = this.blink; this.breath = Math.random(); this.lastBreath = this.breath;
    this.tailDirection = C.rnv().mul(Math.random()); this.headColorSetter = 0; this.showDominance = 0; this.flicker = 0;
    this.lookPos = lizard.mainBodyChunk.pos.add(new V(100, 0));
    this.effectColor = lizard.effectColor;
    this.useSprites = true; this.voiceVisualization = 0; this.lastVoiceVisualization = 0; this.voiceVisualizationIntensity = 0; this.lastVoiceVisualizationIntensity = 0;
    this.blackLizardLightUpHead = 0; this.whiteCamoColor = [0, 0, 0]; this.whitePickUpColor = CAMO_PICKUP.slice(); this.whiteCamoColorAmount = 1; this.whiteCamoColorAmountDrag = 1;
    this.blackSalamander = withSeed(lizard.seed + 77, () => rnd() < 1 / 3);
    this.tongue = lizard.tongue ? Array.from({ length: P.tongueSegments }, () => new GenericBodyPart(this, 1, 1, 0.9, lizard.mainBodyChunk)) : [];
    this.bodyParts = [...this.limbs, ...this.tail, this.head];
    withSeed(lizard.seed + 1013, () => buildCosmetics(this));   // per-breed cosmetic assignment (cosmetics.js)
    this.cosBy = {}; for (const o of ['Behind', 'BodySurface', 'BehindHead', 'InFront']) this.cosBy[o] = this.cosmetics.filter(c => c.overlap === o);
  }
  get BodyAndTailLength() { return this.bodyLength + this.tailLength; }
  generateIvars() {
    let headSize = C.clampedRandomVariation(0.5, 0.07, 0.5) * 2; if (rnd() < 0.5) headSize = 1;
    const fatness = C.clampedRandomVariation(0.5, 0.12, 0.5) * 2, tailLength = C.clampedRandomVariation(0.5, 0.2, 0.3) * 2, tailFatness = C.clampedRandomVariation(0.45, 0.1, 0.3) * 2;
    let tailColor = 0; if (rnd() > 0.5) tailColor = rnd();
    return { headSize, fatness, tailLength, tailFatness, tailColor };
  }
  bodyChunkDisplayRad(i) { return this.lizard.bodyChunks[i].rad * (1 / this.P.bodyRadFac); }

  reset() {
    const L = this.lizard;
    for (let i = 0; i < 3; i++) { this.drawPositions[i][0].copy(L.bodyChunks[i].pos); this.drawPositions[i][1].copy(L.bodyChunks[i].pos); }
    for (const t of this.tail) t.reset(L.bodyChunks[1].pos);
    for (const l of this.limbs) l.reset(L.bodyChunks[1].pos);
    this.head.reset(L.bodyChunks[0].pos);
  }

  updateLook() {
    const L = this.lizard, ai = L.AI, P = this.P, dp = this.drawPositions;
    const f = ai.focusCreature || ai.mostAttractivePrey;
    if (f) {
      const tgt = f.visual ? f.creature.mainBodyChunk.pos : L.room.middleOfTile(ai.bestGuessTile(f));
      this.lookPos = C.moveTowards(this.lookPos, tgt, lerp(100, 20, P.neckStiffness));
    } else if (rnd() < 1 / P.framesBetweenLookFocusChange)
      this.lookPos = dp[0][0].add(C.dirVec(dp[1][0], dp[0][0]).mul(100)).add(C.degToVec(rnd() * 360).mul(100 * rnd()));
  }

  update() {
    const L = this.lizard, P = this.P, dp = this.drawPositions, room = L.room;
    this.updateLook();
    this.lastVoiceVisualizationIntensity = this.voiceVisualizationIntensity; this.voiceVisualizationIntensity = L.voice.MakingASound ? 1 : 0;
    this.lastVoiceVisualization = this.voiceVisualization; this.voiceVisualization = L.voice.VisualizedIntensity;
    for (let i = 0; i < 3; i++) { dp[i][1].copy(dp[i][0]); dp[i][0].copy(L.bodyChunks[i].pos); }
    if (this.voiceVisualization > 0.2) for (let i = 0; i < 3; i++) dp[i][0].iadd(C.rnv().mul(8 * Math.pow(invLerp(0.2, 1, this.voiceVisualization), 0.5) / (1 + i)));
    const nb = (4 + 7 / P.walkBob) / 2;
    this.frontBob = (this.frontBob * nb + (this.frontLegsGrabbing - 1)) / (nb + 1);
    this.hindBob = (this.hindBob * nb + (this.hindLegsGrabbing - 1)) / (nb + 1);
    dp[0][0].y += this.frontBob * P.walkBob; dp[1][0].y += this.frontBob + this.hindBob * P.walkBob * 0.5; dp[2][0].y += this.hindBob * P.walkBob;
    if (L.animation === LAnim.ShootTongue) {   // draw the body drawn back before the tongue lashes out
      const f = (L.timeInAnimation < Math.floor(L.timeToRemainInAnimation / 2) - 2 ? 2 : -1) * (L.timeInAnimation / P.tongueWarmUp * 10);
      dp[0][0].iadd(C.dirVec(dp[0][0], L.bodyChunks[2].pos).mul(f)); dp[2][0].iadd(C.dirVec(dp[2][0], L.bodyChunks[0].pos).mul(f));
    }
    this.lastBlink = this.blink;
    if (!L.Consious) this.blink = lerp(this.blink - Math.floor(this.blink), 0.25, 0.02);
    else this.blink += lerp(0.0025, 0.07, Math.max(L.AI.excitement, this.showDominance)) + rnd() * 0.001;
    this.lastBreath = this.breath; if (!L.dead) this.breath += 0.0125;
    if (L.Consious && rnd() < 0.05) this.tailDirection = C.degToVec(rnd() * 360).mul(rnd());

    // limbs
    let num8 = 0; this.legsGrabbing = 0; this.frontLegsGrabbing = 0; this.hindLegsGrabbing = 0; let noneGrip = true;
    for (let i = 0; i < 4; i++) {
      const l = this.limbs[i];
      l.update();
      if (l.gripCounter >= P.limbGripDelay) { this.legsGrabbing++; if (i < 2) this.frontLegsGrabbing++; else this.hindLegsGrabbing++; }
      if (l.gripCounter > 0) noneGrip = false;
      const A = l.connection.pos, B = l.connection.rotationChunk.pos;
      let side = ((B.x - A.x) * (l.pos.y - A.y) - (B.y - A.y) * (l.pos.x - A.x)) / Math.max(1e-6, A.dist(B));
      side *= (i > 1 ? 1 : -1);
      if (Math.abs(side) > 10) num8 += sign(side);
      l.flip = lerp(l.flip, side < 0 ? 1 : -1, 0.3);
    }
    num8 = clamp(num8, -1, 1);
    this.lastDepthRotation = this.depthRotation;
    if (!L.Stunned) this.depthRotation = lerp(this.depthRotation, num8, 0.1);
    this.lastHeadDepthRotation = this.headDepthRotation;
    let f2 = C.dirVec(dp[0][0], this.lookPos).dot(C.dirVec(dp[0][0], this.head.pos));
    f2 = invLerp(0, 0.6, Math.abs(f2));
    this.headDepthRotation = lerp(this.headDepthRotation, this.depthRotation * f2, 0.5);
    if (noneGrip) this.noGripCounter++; else this.noGripCounter = 0;

    // tail
    this.tail[0].connectedPoint = dp[2][0];
    const stiffness = lerp(P.tailStiffness, 900, this.showDominance);
    for (let i = this.tail.length - 1; i >= 0; i--) this.updateTailSegment(i, stiffness);

    // head
    const v5 = this.head.pos.sub(this.head.lastPos);
    this.head.update();
    const g = L.grasps[0];
    if (g && g.grabbed.bodyChunks) this.head.pos.copy(g.grabbed.bodyChunks[g.chunkGrabbed].pos);
    else if (L.Consious) {
      let v6 = C.dirVec(dp[0][0], this.lookPos);
      if (L.upcomingConnections.length > 0) v6 = C.slerp(v6, C.dirVec(dp[0][0], room.middleOfTile(L.upcomingConnections[L.upcomingConnections.length - 1].destCoord)), 0.15 + P.neckStiffness * 0.15);
      let n = clamp(-v6.dot(C.dirVec(dp[1][0], dp[0][0])), 0, 1);
      n = 1 - Math.pow(1 - n, 3); n *= 1 - P.neckStiffness;
      if (n > 0) v6 = C.slerp(v6, C.dirVec(dp[1][0], dp[0][0]), n);
      this.head.vel.iadd(v6.mul(lerp(6, 2, P.neckStiffness)));
    }
    if (L.tongue && L.tongue.out) this.head.vel = C.dirVec(dp[0][0], L.tongue.pos).mul(5);
    this.head.connectToPoint(dp[0][0].add(C.dirVec(dp[1][0], dp[0][0]).mul(12 * P.headSize)), this.headConnectionRad, false, 0.2, L.bodyChunks[0].vel, 0.5, 0.1);

    this.updateTongue();

    // white-lizard camouflage / black-lizard head light-up (LizardGraphics.Update)
    if (L.breed === 'white') {
      if (L.dead) this.whiteCamoColorAmount = lerp(this.whiteCamoColorAmount, 0.3, 0.01);
      else {
        if (L.animation === LAnim.ShootTongue) this.whiteCamoColorAmountDrag = 0;
        else if (rnd() < 0.1) this.whiteCamoColorAmountDrag = lerp(this.whiteCamoColorAmountDrag, invLerp(0.65, 0.4, L.AI.runSpeed), rnd());
        this.whiteCamoColorAmount = clamp(lerp(this.whiteCamoColorAmount, this.whiteCamoColorAmountDrag, 0.1 * rnd()), 0.15, 1);
        this.whiteCamoColor = C.lerpCol(this.whiteCamoColor, this.whitePickUpColor, 0.1);
      }
    } else if (L.breed === 'black') {
      if (L.voice.MakingASound || L.bubble > 0) this.blackLizardLightUpHead = Math.min(this.blackLizardLightUpHead + 0.1, 1); else this.blackLizardLightUpHead *= 0.9;
    }
    for (const c of this.cosmetics) c.update();
  }
  updateTongue() {
    const L = this.lizard, tg = L.tongue, dp = this.drawPositions, n = this.tongue.length; if (!tg) return;
    for (let i = 0; i < n; i++) {
      const t = this.tongue[i];
      if (!tg.out) { t.pos.copy(tg.pos); t.lastPos.copy(tg.lastPos); t.vel.set(0, 0); continue; }
      t.update();
      const f = i / (n - 1), mid = Math.abs(i - (n - 1) / 2) / ((n - 1) / 2), f3 = tg.state === TS.Retracting ? 1 : mid;
      const tgt = dp[0][0].add(C.slerp(C.dirVec(dp[0][0], tg.graphPos[0]), C.dirVec(dp[1][0], dp[0][0]), Math.pow(1 - f, 1 + Math.pow(tg.stretched, 2) * 10) * 0.5).mul(dp[0][0].dist(tg.graphPos[0]) * f));
      t.pos = t.pos.lerpTo(tgt, Math.max(tg.stretched * 0.05 + tg.superStretched * 0.2, Math.pow(f3, 3)));
      t.vel.iadd(tgt.sub(t.pos).mul(tg.stretched * 0.2 + tg.superStretched * 0.3));
      const cs = tg.combinedStretched, ss = tg.superStretched;
      if (L.breed === 'blue' || L.breed === 'cyan') t.rad = (2 + lerp(3, 1, mid) * (1 - Math.pow(cs, 0.5))) / (1 + f * 0.5 + (ss + 0.5) * 0.5 * (1 - mid));
      else if (L.breed === 'white') t.rad = (2 + 0.75 * (1 - cs) + lerp(8, 1, mid) * (1 - Math.pow(cs, 0.5))) / (1 + f * 0.5 + (ss + 0.5) * 3 * (1 - mid));
      else if (L.breed === 'salamander') t.rad = (3 + 0.5 * (1 - cs) + lerp(8, 1, mid) * (1 - Math.pow(cs, 0.3))) / (1 + f * 0.5 + (ss + 0.5) * 2 * (1 - mid));
      t.pushOutOfTerrain(L.room);
    }
  }
  drawTongue(ctx, ts) {
    const L = this.lizard, tg = L.tongue; if (!tg || !tg.out) return;
    const dp = this.drawPositions, n = this.tongue.length, black = BLACK;
    const tip = tg.graphPos[1].lerpTo(tg.graphPos[0], ts), last = this.tongue[n - 2].lastPos.lerpTo(this.tongue[n - 2].pos, ts);
    // vertex pairs exactly as the TriangleMesh is laid out: 2 per segment start, 2 per segment end, one tip vertex
    let a = dp[0][1].lerpTo(dp[0][0], ts), w = 8; const pairs = [];
    for (let i = 0; i < n; i++) {
      const p = this.tongue[i].lastPos.lerpTo(this.tongue[i].pos, ts), nrm = C.dirVec(a, p), perp = C.perp(nrm), off = nrm.mul(a.dist(p) / 5), rad = this.tongue[i].rad;
      const sw = perp.mul((w + rad) * 0.5);
      pairs.push([a.sub(sw).add(off), a.add(sw).add(off)]);
      if (i < n - 1) pairs.push([p.sub(perp.mul(rad)).sub(off), p.add(perp.mul(rad)).sub(off)]); else pairs.push([p, p]);
      w = rad; a = p;
    }
    const total = (n - 1) * 4 + 3;
    for (let k = 0; k < pairs.length - 1; k++) {
      const col = L.breed === 'cyan' ? C.lerpCol(this.headColor(ts), black, (2 * k) / (total - 1)) : black;
      ctx.fillStyle = ctx.strokeStyle = C.rgb(col); ctx.lineWidth = 0.5;
      const [l0, r0] = pairs[k], [l1, r1] = pairs[k + 1];
      ctx.beginPath(); ctx.moveTo(l0.x, l0.y); ctx.lineTo(l1.x, l1.y); ctx.lineTo(r1.x, r1.y); ctx.lineTo(r0.x, r0.y); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    // the tip blob (Circle20 stretched from the tongue tip back along the tongue)
    const d = tip.dist(last), mid = tip.lerpTo(last, 0.5), ang = Math.atan2(last.y - tip.y, last.x - tip.x);
    ctx.fillStyle = C.rgb(black); ctx.beginPath(); ctx.ellipse(mid.x, mid.y, Math.max(0.1, d / 2), L.breed === 'blue' ? 2 : 2.5, ang, 0, 7); ctx.fill();
  }
  updateTailSegment(i, stiffness) {
    const L = this.lizard, P = this.P, t = this.tail, dp = this.drawPositions;
    t[i].update();
    t[i].vel.y -= 0.9 * Math.pow(i / (t.length - 1), 3);
    if (!C.distLess(t[i].pos, dp[2][0], 15 * (i + 1))) t[i].pos = L.bodyChunks[2].pos.add(C.dirVec(dp[2][0], t[i].pos).mul(15 * (i + 1) * L.room.gravity));
    let a = dp[1][0];
    if (i === 1) a = dp[2][0]; else if (i > 1) a = t[i - 2].pos;
    a = a.lerpTo(dp[1][0], 0.2);
    const d = Math.max(1e-6, a.dist(t[i].pos));
    t[i].vel.iadd(C.dirVec(a, t[i].pos).mul(stiffness * Math.pow(P.tailStiffnessDecline, i) / d));
    if (i === 0) t[i].vel.iadd(this.tailDirection);
  }

  // ---------------- colours ----------------
  get salamanderColor() { return this.blackSalamander ? C.lerpCol(BLACK, this.effectColor, 0.1) : C.lerpCol([0.9, 0.9, 0.95], this.effectColor, 0.06); }
  get headLightsUpFromNoise() { return this.lizard.breed === 'black'; }
  headColor1() {
    const T = this.lizard.breed;
    if (T === 'white') return C.lerpCol(WHITE, this.whiteCamoColor, this.whiteCamoColorAmount);
    if (this.headLightsUpFromNoise) return C.lerpCol(BLACK, [0.5, 0.5, 0.5], this.blackLizardLightUpHead);
    if (T === 'salamander') return this.salamanderColor;
    return BLACK;
  }
  headColor2() {
    const T = this.lizard.breed;
    if (T === 'white') return C.lerpCol(BLACK, this.whiteCamoColor, this.whiteCamoColorAmount);
    if (this.headLightsUpFromNoise) return C.lerpCol(BLACK, [0.5, 0.5, 0.5], this.blackLizardLightUpHead);
    if (T === 'salamander') return this.salamanderColor;
    return this.effectColor;
  }
  headColor(ts) {
    let a = 1 - Math.pow(0.5 + 0.5 * Math.sin(lerp(this.lastBlink, this.blink, ts) * 2 * Math.PI), 1.5 + this.lizard.AI.excitement * 1.5);
    if (this.headColorSetter !== 0) a = lerp(a, this.headColorSetter > 0 ? 1 : 0, Math.abs(this.headColorSetter));
    a = lerp(a, Math.pow(Math.max(0, lerp(this.lastVoiceVisualization, this.voiceVisualization, ts)), 0.75), lerp(this.lastVoiceVisualizationIntensity, this.voiceVisualizationIntensity, ts));
    return C.lerpCol(this.headColor1(), this.headColor2(), a);
  }
  dynamicBodyColor(f) {
    const T = this.lizard.breed;
    if (T === 'white') return C.lerpCol(WHITE, this.whiteCamoColor, this.whiteCamoColorAmount);
    if (T === 'salamander') return this.salamanderColor;
    return BLACK;
  }
  get baseColor() { return this.dynamicBodyColor(0); }   // ColorBody(): body circles, mesh and limb outlines
  bodyColor(f) {
    const T = this.lizard.breed;
    if (T === 'white') return this.dynamicBodyColor(f);
    if (T === 'salamander') return this.salamanderColor;
    const bt = this.bodyLength / this.BodyAndTailLength;
    if (f < bt || this.tailColor === 0) return BLACK;
    const v = invLerp(bt, 1, f);
    let f2 = clamp01(invLerp(this.P.tailColorationStart, 0.95, v));
    f2 = Math.pow(f2, this.P.tailColorationExponent) * this.tailColor;
    return C.lerpCol(BLACK, this.effectColor, f2);
  }

  headRotation(ts) {
    const L = this.lizard, dp = this.drawPositions, P = this.P;
    return C.aim(dp[0][1].lerpTo(dp[0][0], ts), this.head.lastPos.lerpTo(this.head.pos, ts)) +
      P.jawOpenAngle * (1 - P.jawOpenLowerJawFac) * clamp01(lerp(L.lastJawOpen, L.JawOpen, ts)) * lerp(this.lastHeadDepthRotation, this.headDepthRotation, ts);
  }
  // LizardGraphics.SpinePosition: s = 0 (neck) .. 1 (tail tip)
  spinePosition(s, ts) {
    const L = this.lizard, tail = this.tail, tl = tail.length, tp = i => tail[i].lastPos.lerpTo(tail[i].pos, ts);
    const num = L.bodyChunkConnections[0].distance + L.bodyChunkConnections[1].distance, split = num / (num + this.tailLength);
    let v, a, v2, v3, b, t;
    if (s < split) {
      const n2 = invLerp(0, split, s), n3 = Math.floor(n2 * 4 - 1), n4 = Math.floor(n2 * 4);
      if (n3 < 0) { v = this.bodyPosition(0, ts).lerpTo(this.head.lastPos.lerpTo(this.head.pos, ts), 0.5); a = this.head.rad; }
      else { v = this.bodyPosition(n3, ts); a = this.bodyChunkDisplayRad(n3 < 2 ? 1 : 2) * this.iVars.fatness; }
      v2 = n4 + 1 >= 4 ? tp(0) : this.bodyPosition(n4 + 1, ts);
      v3 = this.bodyPosition(n4, ts); b = this.bodyChunkDisplayRad(n4 < 2 ? 1 : 2);
      t = invLerp(n3 + 1, n4 + 1, n2 * 4);
    } else {
      const n5 = invLerp(split, 1, s), n6 = Math.floor(n5 * tl - 1); let n7 = Math.floor(n5 * tl); if (n7 > tl - 1) n7 = tl - 1;
      if (n6 < 0) { v = this.bodyPosition(3, ts); a = this.bodyChunkDisplayRad(2) * this.iVars.fatness; }
      else { v = tp(n6); a = tail[n6].stretchedRad * this.iVars.fatness * this.iVars.tailFatness; }
      v2 = tp(Math.min(n7 + 1, tl - 1)); v3 = tp(n7); b = tail[n7].stretchedRad;
      t = invLerp(n6 + 1, n7 + 1, n5 * tl);
    }
    let dir = v3.sub(v).lerpTo(v2.sub(v3), t).normalized();
    if (dir.x === 0 && dir.y === 0) dir = tail[tl - 1].pos.sub(tail[tl - 2].pos).normalized();
    const perp = C.perp(dir), rad = lerp(a, b, t);
    let f = lerp(this.lastDepthRotation, this.depthRotation, ts);
    f = Math.pow(Math.abs(f), lerp(1.2, 0.3, Math.pow(s, 0.5))) * sign(f);
    const pos = v.lerpTo(v3, t);
    return { s, pos, outerPos: pos.add(perp.mul(f * rad)), dir, perp, depthRotation: f, rad };
  }

  // ---------------- rendering ----------------
  bodyPosition(p, ts) {
    const dp = this.drawPositions, L = (i) => dp[i][1].lerpTo(dp[i][0], ts);
    const num = p < 2 ? 1 : 2;
    if (p % 2 === 1) return L(num);
    const v = L(num);
    const v2 = num === 1 ? L(2) : this.tail[0].lastPos.lerpTo(this.tail[0].pos, ts);
    const v3 = L(num - 1);
    const n = C.slerp(v.sub(v3), v2.sub(v), 0.35).normalized().mul(-0.5 * v.dist(v3));
    return v.add(n);
  }
  strip(ctx, pts, rads, color, fromI = 0, toI = pts.length - 1) {
    const left = [], right = [];
    for (let i = fromI; i <= toI; i++) {
      const pr = pts[Math.max(i - 1, 0)], nx = pts[Math.min(i + 1, pts.length - 1)];
      const n = C.perp(C.dirVec(pr, nx)).mul(rads[i]);
      left.push(pts[i].add(n)); right.push(pts[i].sub(n));
    }
    ctx.fillStyle = color; ctx.strokeStyle = color; ctx.lineWidth = 0.6;
    ctx.beginPath(); ctx.moveTo(left[0].x, left[0].y);
    for (let i = 1; i < left.length; i++) ctx.lineTo(left[i].x, left[i].y);
    for (let i = right.length - 1; i >= 0; i--) ctx.lineTo(right[i].x, right[i].y);
    ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  circle(ctx, p, r, color) { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(0.1, r), 0, 7); ctx.fill(); }

  drawLimbSprite(ctx, i, ts) {
    const P = this.P, l = this.limbs[i], dp = this.drawPositions;
    const foot = l.lastPos.lerpTo(l.pos, ts);
    const ci = i >= 2 ? 2 : 0;
    let sh = dp[ci][1].lerpTo(dp[ci][0], ts);
    if (i < 2) sh = sh.lerpTo(dp[1][1].lerpTo(dp[1][0], ts), 0.2);
    let val = clamp(Math.trunc(foot.dist(sh) / (4 * P.limbSize)) + 1, 1, 9);
    val += 9 * (2 - Math.trunc(clamp(Math.abs(l.flip) * 3, 0, 2)));
    if (i >= 2) val += 27;
    const nm = n => n + String(val).padStart(2, '0'), rot = C.aim(sh, foot) - 90, sy = sign(l.flip) * P.limbThickness;
    Atlas.draw(ctx, nm('LizardArm_'), foot.x, foot.y, rot, 1, sy, this.baseColor);
    Atlas.draw(ctx, nm('LizardArmColor_'), foot.x, foot.y, rot, 1, sy, this.effectColor);
  }

  drawLimb(ctx, i, ts) {
    if (this.useSprites && Atlas.ready) return this.drawLimbSprite(ctx, i, ts);
    const P = this.P, l = this.limbs[i], dp = this.drawPositions, front = i < 2;
    const foot = l.lastPos.lerpTo(l.pos, ts), ci = front ? 0 : 2;
    let sh = dp[ci][1].lerpTo(dp[ci][0], ts);
    if (front) sh = sh.lerpTo(dp[1][1].lerpTo(dp[1][0], ts), 0.2);
    const L1 = l.jointDist / 2, d = Math.min(sh.dist(foot), 2 * L1 - 0.01), mid = sh.lerpTo(foot, 0.5);
    const dir = C.dirVec(sh, foot); let n = C.perp(dir);
    const fwd = C.dirVec(dp[2][0], dp[0][0]);
    if (front ? n.dot(fwd) > 0 : n.dot(fwd) < 0) n = n.mul(-1);        // front elbows point back, hind knees point forward
    const h = Math.sqrt(Math.max(0, L1 * L1 - (d / 2) * (d / 2))), el = mid.add(n.mul(h));
    const thick = 3.2 * P.limbSize * P.limbThickness;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const path = () => { ctx.beginPath(); ctx.moveTo(sh.x, sh.y); ctx.lineTo(el.x, el.y); ctx.lineTo(foot.x, foot.y); };
    ctx.strokeStyle = C.rgb(BLACK); ctx.lineWidth = thick; path(); ctx.stroke();
    const alpha = i % 2 === 0 ? lerp(1, 0.3, Math.abs(lerp(this.lastDepthRotation, this.depthRotation, ts))) : 1;
    ctx.strokeStyle = C.rgb(this.effectColor, alpha); ctx.lineWidth = thick * 0.38; path(); ctx.stroke();
    this.circle(ctx, foot, thick * 0.6, C.rgb(BLACK));
  }

  draw(ctx, ts) {
    const L = this.lizard, P = this.P, dp = this.drawPositions, iv = this.iVars;
    const col = C.rgb(this.baseColor);
    const dpL = i => dp[i][1].lerpTo(dp[i][0], ts);
    const headPos = this.head.lastPos.lerpTo(this.head.pos, ts);
    for (const c of this.cosBy.Behind) c.draw(ctx, ts);
    // behind-the-body limbs
    this.drawLimb(ctx, 0, ts); this.drawLimb(ctx, 2, ts);
    // body spine: neck, 4 body points, tail
    const breathF = (Math.sin(lerp(this.lastBreath, this.breath, ts) * Math.PI * 2) + 1) * 0.5 * Math.pow(1 - L.AI.runSpeed, 2);
    const neck = dpL(0).lerpTo(headPos, 0.2), bp = [0, 1, 2, 3].map(j => this.bodyPosition(j, ts));
    const brad = [];
    for (let j = 0; j < 4; j++) {
      const ci = j < 2 ? 1 : 2; let r = this.bodyChunkDisplayRad(ci);
      if (j % 2 === 0) r = (r + this.bodyChunkDisplayRad(ci - 1)) / 2;
      r *= 1 + breathF * (3 - j) * 0.1 * (j === 0 ? 0.5 : 1); brad.push(r * iv.fatness);
    }
    const bodyEnd = this.drawPositions[2][1].lerpTo(this.drawPositions[2][0], ts);
    const tp = this.tail.map(t => t.lastPos.lerpTo(t.pos, ts));
    // spine starts at the head so the neck is drawn all the way to it (index 0 = head, 1 = neck, 2..5 = body, 6.. = tail)
    const pts = [headPos.lerpTo(dpL(0), 0.2), neck, ...bp, ...tp], rads = [4, 5, ...brad, ...this.tail.map(t => t.stretchedRad * iv.fatness * iv.tailFatness)];
    pts[5] = bodyEnd;
    this.strip(ctx, pts, rads, col);
    for (let j = 0; j < 4; j++) this.circle(ctx, bp[j], brad[j], col);
    // tail colour gradient
    if (this.tailColor > 0) for (let k = 0; k < this.tail.length - 1; k++) {
      const f = lerp(this.bodyLength / (this.bodyLength + this.tailLength), 1, (k + 1) / this.tail.length);
      this.strip(ctx, pts, rads, C.rgb(this.bodyColor(f)), 6 + k, 7 + k);
    }
    for (const c of this.cosBy.BodySurface) c.draw(ctx, ts);
    // front-side limbs
    this.drawLimb(ctx, 1, ts); this.drawLimb(ctx, 3, ts);
    for (const c of this.cosBy.BehindHead) c.draw(ctx, ts);
    // head
    this.drawHead(ctx, ts, headPos);
    this.drawTongue(ctx, ts);
    for (const c of this.cosBy.InFront) c.draw(ctx, ts);
  }

  drawHeadSprite(ctx, ts, headPos) {
    const L = this.lizard, P = this.P, dp = this.drawPositions, hg = P.headGraphics;
    const num = lerp(this.lastHeadDepthRotation, this.headDepthRotation, ts);
    let jaw = lerp(L.lastJawOpen, L.JawOpen, ts); if (L.JawReadyForBite && L.Consious) jaw += rnd() * 0.2;
    jaw = clamp01(lerp(jaw, lerp(this.lastVoiceVisualization, this.voiceVisualization, ts) + 0.2, lerp(this.lastVoiceVisualizationIntensity, this.voiceVisualizationIntensity, ts) * 0.8));
    jaw = clamp01(jaw) * num;   // jaw opening is only visible from the side, and flips with the facing
    const d0 = dp[0][1].lerpTo(dp[0][0], ts), p = headPos.lerpTo(d0, 0.2);
    const rot = C.aim(d0, headPos), n = C.perp(d0.sub(headPos)).normalized();
    const hs = P.headSize * this.iVars.headSize, v = String(3 - Math.trunc(Math.abs(num) * 3.9));
    const hc = this.headColor(ts), teeth = BLACK;
    const parts = [['LizardJaw', hg[0], hc], ['LizardLowerTeeth', hg[1], teeth], ['LizardUpperTeeth', hg[2], teeth], ['LizardHead', hg[3], hc], ['LizardEyes', hg[4], BLACK]];
    parts.forEach(([nm, g, col], k) => {
      const lowerSide = k <= 1, f = lowerSide ? P.jawOpenLowerJawFac : 1 - P.jawOpenLowerJawFac, dir = lowerSide ? -1 : 1;
      let x = p.x, y = p.y, r = rot;
      if (k > 1) { x += n.x * jaw * P.jawOpenMoveJawsApart * f; y += n.y * jaw * P.jawOpenMoveJawsApart * f; r = rot + P.jawOpenAngle * f * jaw; }
      else { x -= n.x * jaw * P.jawOpenMoveJawsApart * f; y -= n.y * jaw * P.jawOpenMoveJawsApart * f; r = rot - P.jawOpenAngle * f * jaw; }
      Atlas.draw(ctx, nm + v + '.' + g, x, y, r, sign(num) * hs, hs, col);
    });
  }

  drawHead(ctx, ts, headPos) {
    if (this.useSprites && Atlas.ready) return this.drawHeadSprite(ctx, ts, headPos);
    const L = this.lizard, P = this.P, dp = this.drawPositions;
    const hp = headPos.lerpTo(dp[0][1].lerpTo(dp[0][0], ts), 0.2);
    const bodyP = dp[0][1].lerpTo(dp[0][0], ts);
    const ang = C.aim(bodyP, headPos), f = C.degToVec(ang), phi = Math.atan2(f.y, f.x);
    let jaw = lerp(L.lastJawOpen, L.JawOpen, ts);
    if (L.JawReadyForBite && L.Consious) jaw += rnd() * 0.2;
    jaw = clamp01(lerp(jaw, lerp(this.lastVoiceVisualization, this.voiceVisualization, ts) + 0.2, lerp(this.lastVoiceVisualizationIntensity, this.voiceVisualizationIntensity, ts) * 0.8));
    jaw = clamp01(jaw);
    const hs = P.headSize * this.iVars.headSize, depth = lerp(this.lastHeadDepthRotation, this.headDepthRotation, ts);
    const side = depth < 0 ? -1 : 1, hc = C.rgb(this.headColor(ts)), dark = C.rgb(BLACK);
    const up = jaw * P.jawOpenAngle * (1 - P.jawOpenLowerJawFac) * Math.PI / 180, low = jaw * P.jawOpenAngle * P.jawOpenLowerJawFac * Math.PI / 180;
    ctx.save(); ctx.translate(hp.x, hp.y); ctx.rotate(phi); ctx.scale(hs, hs * side);
    const poly = (pts, color) => { ctx.fillStyle = color; ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath(); ctx.fill(); };
    // lower jaw (pivot near the back of the head)
    ctx.save(); ctx.translate(-4, -2); ctx.rotate(-low);
    poly([[0, 0.5], [12, -0.6], [24, 0.2], [27, 1.4], [22, 2.8], [10, 2.6], [0, 2.8]], hc);
    ctx.fillStyle = '#d8d3c6'; for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.moveTo(13 + k * 3.4, 2.6); ctx.lineTo(14.4 + k * 3.4, 2.6); ctx.lineTo(14 + k * 3.4, 4.4); ctx.fill(); }
    ctx.restore();
    // skull / upper jaw
    ctx.save(); ctx.translate(-4, -2); ctx.rotate(up);
    poly([[-3, 0], [-2, 6.5], [6, 9], [16, 7.4], [26, 4.2], [30, 2.6], [29, 1.0], [14, 1.6], [0, 1.6]], hc);
    ctx.fillStyle = '#d8d3c6'; for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.moveTo(14 + k * 3.6, 1.6); ctx.lineTo(15.4 + k * 3.6, 1.6); ctx.lineTo(14.6 + k * 3.6, -0.5); ctx.fill(); }
    // eye
    const e = C.lerpCol([0.05, 0.05, 0.06], [1, 1, 1], 0.0);
    ctx.fillStyle = C.rgb(C.lerpCol(this.effectColor, BLACK, 0.85)); ctx.beginPath(); ctx.arc(14, 6.2, 1.9, 0, 7); ctx.fill();
    ctx.restore(); ctx.restore();
  }
}
