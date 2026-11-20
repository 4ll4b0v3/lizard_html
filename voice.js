'use strict';
// =====================================================================================
//  voice.js — LizardVoice + CreatureVoice (ported) with Web Audio playback.
//  Articulations (volume / pitch curves per emotion) are generated exactly like LizardVoice's constructor.
//  The sample is played once, volume + pitch (playbackRate) are re-driven every tick, and an AnalyserNode
//  stands in for GetSpectrumData in CreatureVoice.IntensityVisualizer.
//  Browsers keep audio locked until the first click/key, so until then (or without clips) the visualized
//  intensity is faked from the volume so the head still shakes.
// =====================================================================================
const Emotion = ['SpottedPreyFirstTime', 'ReSpottedPrey', 'GeneralSmallNoise', 'Curious', 'Dominance', 'Submission', 'PainImpact', 'PainIdle', 'Frustration', 'Fear', 'Boredom', 'BloodLust', 'OutOfShortcut'];
Emotion.forEach((e, i) => { Emotion[e] = i; });

const VoiceAudio = {
  ctx: null, buffers: {}, sfxBuffers: {}, muted: false, master: null,
  init() {
    const unlock = () => {
      if (!this.ctx) {
        try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
        this.master = this.ctx.createGain(); this.master.gain.value = this.muted ? 0 : 0.8; this.master.connect(this.ctx.destination);
        const load = (data, into) => { for (const k of Object.keys(data)) {
          const bin = atob(data[k]), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
          this.ctx.decodeAudioData(u.buffer, b => { into[k] = b; }, () => {});
        } };
        load(typeof VOICE_DATA !== 'undefined' ? VOICE_DATA : {}, this.buffers); load(typeof SFX_DATA !== 'undefined' ? SFX_DATA : {}, this.sfxBuffers);
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
    };
    addEventListener('pointerdown', unlock); addEventListener('keydown', unlock);
  },
  // one-shot effect (room.PlaySound): name = key of SFX_DATA, or an array of keys to pick from
  sfx(name, vol = 1, pitch = 1) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const keys = Array.isArray(name) ? name : [name], buf = this.sfxBuffers[keys[Math.floor(Math.random() * keys.length)]];
    if (!buf) return;
    const n = this.ctx.createBufferSource(), g = this.ctx.createGain(); n.buffer = buf; n.playbackRate.value = pitch; g.gain.value = vol;
    n.connect(g); g.connect(this.master); n.start();
  },
  setMuted(m) { this.muted = m; if (this.master) this.master.gain.value = m ? 0 : 0.8; },
};

class VoiceArticulation {
  constructor(length, maxVolume) {
    this.length = length; this.maxVolume = maxVolume;
    this.modifier = Array.from({ length: 2 + Math.floor(length / 20) }, () => [rnd(), rnd()]);
  }
  returnMod(f, m) {
    const n = this.modifier.length; f *= n - 1;
    const i = Math.floor(f); f -= i;
    return lerp(this.modifier[i][m], this.modifier[Math.min(i + 1, n - 1)][m], f);
  }
}

class LizardVoice {
  constructor(lizard) {
    this.lizard = lizard; this.articulationIndex = -1; this.currentArticulationProgression = 0; this.currentEmotionIntensity = 0;
    this.soundID = null; this.lastSoundID = null; this.vol = 1; this.ptch = 1; this.src = null; this.savedIntensity = 0;
    withSeed(lizard.seed, () => {
      this.clip = 'ABCDE'[rndInt(0, 5)];
      this.myPitch = C.clampedRandomVariation(0.5, 0.2) * 2;       // ClampedRandomVariation(0.5, 0.2, 0.8) * 2
      const num = lerp(0.5, 1.5, rnd()), num2 = lerp(0.7, 1.3, rnd());
      const base = new VoiceArticulation(80, 1);
      this.articulations = Emotion.map((name, i) => {
        let len = 40, vol = 1;
        switch (name) {
          case 'SpottedPreyFirstTime': len = 50; vol = 1; break;
          case 'GeneralSmallNoise': case 'ReSpottedPrey': len = 12; vol = 0.5; break;
          case 'Curious': len = 40; vol = 0.4; break;
          case 'Dominance': len = 40; vol = 0.8; break;
          case 'Submission': len = 20; vol = 0.5; break;
          case 'PainImpact': len = 20; vol = 1; break;
          case 'PainIdle': len = 50; vol = 0.1; break;
          case 'Boredom': len = 30; vol = 0.2; break;
          case 'BloodLust': len = 35; vol = 0.5; break;
          case 'OutOfShortcut': len = 30; vol = 0.5; break;
        }
        const a = new VoiceArticulation(len * num, vol * num2), M = a.modifier, n = M.length;
        for (let j = 0; j < n; j++) {
          const f = j / (n - 1);
          if (name === 'SpottedPreyFirstTime') { M[j][0] = Math.max(M[j][1], Math.sin(f * Math.PI)); M[j][1] = lerp(M[j][1], Math.sin(f * Math.PI), 0.5); }
          else if (name === 'ReSpottedPrey') { M[1][0] = 1; if (f === 0) M[j][1] = 1; else if (f === 1) M[j][1] = 0; }
          else if (name === 'Curious') { M[j][1] = lerp(M[j][1], f, 0.5); if (f === 1) M[j][1] = 1; }
          else if (name === 'Dominance') { M[j][0] = lerp(M[j][0], 1, Math.pow(1 - f, 0.5)); M[j][1] = lerp(M[j][1], Math.sin(f * Math.PI) * 0.5, 0.5); }
          else if (name === 'Submission') { M[j][0] = lerp(M[j][0], 0, f); M[j][1] = lerp(M[j][1], 1, (1 - f) * 0.5); }
          for (let k = 0; k < 2; k++) M[j][k] = lerp(M[j][k], base.returnMod(f, k), 0.5);
        }
        return a;
      });
    });
  }
  get currentArt() { return this.articulations[this.articulationIndex]; }
  get Volume() { return this.vol; } set Volume(v) { this.vol = v; }
  get Pitch() { return this.ptch; } set Pitch(v) { this.ptch = v; }
  get MakingASound() { return this.soundID !== null && this.Volume > 0; }
  get VisualizedIntensity() { return this.savedIntensity * this.Volume; }

  makeSound(emotion, intensity = lerp(0.8, 1.2, rnd())) {
    const L = this.lizard;
    if (L.Consious && !(intensity < this.currentEmotionIntensity / 2) && !L.grasps[0]) {
      this.currentArticulationProgression = 0; this.articulationIndex = Emotion[emotion]; this.soundID = this.clip; this.currentEmotionIntensity = intensity;
    }
  }

  update() {
    if (this.articulationIndex > -1) {
      const art = this.currentArt;
      this.currentArticulationProgression += 1 / (art.length * lerpMap(this.currentEmotionIntensity, 0, 2, 0.5, 1.5));
      if (this.currentArticulationProgression >= 1) { this.soundID = null; this.articulationIndex = -1; }
      else {
        this.Volume = art.returnMod(this.currentArticulationProgression, 0) * art.maxVolume * lerpMap(this.currentEmotionIntensity, 0, 2, 0.4, 3) * (1 - this.lizard.jawForcedShut);
        this.Pitch = lerp(0.5, 1.5, art.returnMod(this.currentArticulationProgression, 1)) * this.myPitch;
      }
    }
    if (this.lizard.grasps[0]) this.stopSound();          // soundA = null while carrying something
    // CreatureVoice.Update: (re)start the sample when the sound changes / ends
    if (this.soundID === null || this.Volume === 0 || this.soundID !== this.lastSoundID) this.stopSound();
    this.lastSoundID = this.soundID;
    if (!this.src && this.soundID !== null && this.Volume > 0 && !this.lizard.grasps[0]) this.startSound();
    if (this.src) { const t = VoiceAudio.ctx.currentTime; this.src.gain.gain.setTargetAtTime(clamp01(this.Volume), t, 0.015); this.src.node.playbackRate.setTargetAtTime(Math.max(0.1, this.Pitch), t, 0.015); }
    this.updateVisualizer();
  }
  startSound() {
    const ac = VoiceAudio.ctx, buf = VoiceAudio.buffers[this.soundID];
    if (!ac || ac.state !== 'running' || !buf) return;
    const node = ac.createBufferSource(); node.buffer = buf;
    const an = ac.createAnalyser(); an.fftSize = 128; an.smoothingTimeConstant = 0; an.minDecibels = -140;
    const gain = ac.createGain(); gain.gain.value = clamp01(this.Volume);
    node.connect(an); an.connect(gain); gain.connect(VoiceAudio.master);
    node.onended = () => { if (this.src && this.src.node === node) this.src = null; };
    node.start(); this.src = { node, gain, an, buf: new Float32Array(an.frequencyBinCount) };
  }
  stopSound() { if (this.src) { try { this.src.node.stop(); } catch (e) { } this.src = null; } }
  updateVisualizer() {
    if (!this.src) {
      // audio locked or no clip: fake it from the volume so the head still shakes
      this.savedIntensity = (this.MakingASound && !(VoiceAudio.ctx && VoiceAudio.buffers[this.clip] && VoiceAudio.ctx.state === 'running')) ? 0.4 + 0.6 * rnd() : 0; return;
    }
    this.src.an.getFloatFrequencyData(this.src.buf);
    let sum = 0; for (const db of this.src.buf) sum += db > -139 ? Math.pow(10, db / 20) : 0;
    this.savedIntensity = Math.pow(invLerp(0.0002, 0.003, sum / this.src.buf.length), 0.5);   // InitSoundVisualizer(0.0002, 0.003, 0.5)
  }
}
if (typeof addEventListener !== 'undefined') VoiceAudio.init();

const BITE_SFX = Array.from('123', g => Array.from('ABCDEFGH', l => 'bite' + g + l)).flat();
const playBite = () => VoiceAudio.sfx(BITE_SFX), playJaws = () => VoiceAudio.sfx('jaws');
