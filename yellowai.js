'use strict';
// =====================================================================================
//  yellowai.js — port of YellowAI.cs (yellow lizard pack + communication flicker).
//  Pack leader = most dominant member; members share sightings of prey, which makes both
//  lizards "communicate" (commFlicker drives the antennae). Not ported: safari input, and
//  TravelPreference (the pack-spreading path cost; the Pather has no per-connection cost hook).
// =====================================================================================
class YellowPack {
  constructor(first) { this.members = [{ lizard: first, role: 'Leader' }]; this.packName = 'Pack ' + Math.floor(rnd() * 1000); }
  get packLeader() { return this.members[0].lizard; }
  get leaderDominance() { return this.packLeader.personality.dominance; }
  addLizard(l) { this.members.push({ lizard: l, role: 'Support' }); this.findLeader(); }
  removeLizard(l) { this.members = this.members.filter(m => m.lizard !== l); this.findLeader(); }
  findLeader() {
    if (!this.members.length) return;
    let best = 0, bi = 0;
    this.members.forEach((m, i) => { m.role = 'Support'; if (m.lizard.personality.dominance > best) { best = m.lizard.personality.dominance; bi = i; } });
    const m = this.members[bi]; m.role = 'Leader';
    if (bi > 0) { this.members.splice(bi, 1); this.members.unshift(m); }
  }
}

class YellowAI {
  constructor(AI) {
    this.AI = AI; this.lizard = AI.lizard;
    this.pack = new YellowPack(this.lizard); this.communicating = 0; this.commFlicker = 0;
  }
  update() {
    const L = this.lizard;
    if (this.communicating > 0) this.communicating--;
    const num = invLerp(0, 14, this.communicating);
    if (this.commFlicker < num) this.commFlicker = Math.min(num, this.commFlicker + 0.25); else this.commFlicker = Math.max(num, this.commFlicker - 0.025);
    for (const o of L.room.objects) if (o instanceof Lizard && o !== L && !o.slated && o.AI && o.AI.yellowAI && o.Consious) this.considerOther(o);
    for (const m of this.pack.members.slice()) {
      const ml = m.lizard;
      if (ml.Consious) for (const rep of ml.AI.reps.values()) this.packMemberIsSeeing(ml, rep);
      if (ml.dead) this.pack.removeLizard(ml);
    }
  }
  packMemberIsSeeing(member, rep) {
    if (member === this.lizard || !rep.visual) return;
    const mine = this.AI.reps.get(rep.creature);
    if (!mine) this.receive(member, rep);
    else if (!mine.visual && member.AI.canSee(rep.creature)) this.receive(member, rep);
  }
  receive(member, rep) {
    const AI = this.AI, c = rep.creature;
    const mine = AI.reps.get(c);
    if (mine) { mine.ticksSinceSeen = 0; mine.lastPos.copy(c.mainBodyChunk.pos); } else AI.seeCreature(c);
    const hi = Math.floor(lerp(3, 50, rep.intensity)), roll = () => hi > 3 ? 3 + Math.floor(rnd() * (hi - 3)) : 3;
    this.communicating = Math.max(this.communicating, roll());
    member.AI.yellowAI.communicating = Math.max(member.AI.yellowAI.communicating, roll());
  }
  considerOther(o) {
    const op = o.AI.yellowAI.pack;
    if (op === this.pack) return;
    if (op.leaderDominance > this.pack.leaderDominance) { this.pack.removeLizard(this.lizard); op.addLizard(this.lizard); this.pack = op; }
    else { op.removeLizard(o); this.pack.addLizard(o); o.AI.yellowAI.pack = this.pack; }
  }
}
