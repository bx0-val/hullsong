// The sound engine.
//
//   binaural pair(s) ── dry, one tone per ear, never panned or reverbed ──┐
//   breath (pink noise, 0.1 Hz swell) ────────────────────────────────────┤
//   composer → bed / bass / lead(+ping-pong delay) / texture / life ──────┤
//   spatial chimes ─ HRTF ────────────────────────────────────────────────┼─ master ─ comp ─ out
//   hull voices: resonant bodies (modal filter banks), creaks, groans,    │   (most buses also
//     machines, and on living hulls: surf, wind, creatures ─ HRTF ────────┤    send to reverb)
//   echo voices: a monaural beat at the echo's frequency ─ HRTF ─────────┘

import { Composer } from './music.js';
import { makeWaves } from './instruments.js';
import { Rng } from './rng.js';

const MASTER = 0.8;
const BEAT_LEVELS = [0, 0.03, 0.06, 0.1];
export const LEVEL_NAMES = ['off', 'soft', 'medium', 'strong'];

export const BANDS = [
  { max: 4, sym: 'δ', name: 'delta' },
  { max: 8, sym: 'θ', name: 'theta' },
  { max: 13, sym: 'α', name: 'alpha' },
  { max: Infinity, sym: 'β', name: 'beta' },
];
export const bandFor = (hz) => BANDS.find((b) => hz < b.max);

// Resonance ratios per architecture: plates, bars, bells, tubes.
const MODE_SETS = {
  hull: [1, 1.59, 2.14, 2.3, 2.65, 2.92, 3.16],
  spindle: [1, 2.756, 5.404, 8.933],
  cathedral: [0.5, 1, 1.183, 1.506, 2.0, 2.514, 2.662, 3.011],
  seed: [1, 2, 3.02, 4.1, 5.3],
  ring: [1, 2.32, 4.25, 6.63, 9.38],
};
export const GIFT_INSTRUMENT = { hull: 'pluck', spindle: 'kalimba', cathedral: 'choir', seed: 'glass', ring: 'kalimba', shattered: 'bowed' };

const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const R = Math.random;

function impulse(ctx, seconds, decay) {
  const rate = ctx.sampleRate;
  const len = Math.floor(rate * seconds);
  const buf = ctx.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const x = i / len;
      lp += (R() * 2 - 1 - lp) * (0.9 - 0.8 * x);
      d[i] = lp * Math.pow(1 - x, decay) * Math.min(1, i / (rate * 0.012));
    }
  }
  return buf;
}

function pinkNoise(ctx, seconds, channels) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(channels, len, ctx.sampleRate);
  for (let ch = 0; ch < channels; ch++) {
    const d = buf.getChannelData(ch);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < len; i++) {
      const w = R() * 2 - 1;
      b0 = 0.99765 * b0 + w * 0.099046;
      b1 = 0.963 * b1 + w * 0.2965164;
      b2 = 0.57 * b2 + w * 1.0526913;
      d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2;
    }
  }
  return buf;
}

function clickBuffer(ctx) {
  const len = Math.floor(ctx.sampleRate * 0.04);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (R() * 2 - 1) * Math.exp((-i / len) * 7);
  return buf;
}

function setPos(p, v) {
  if (p.positionX) {
    p.positionX.value = v.x;
    p.positionY.value = v.y;
    p.positionZ.value = v.z;
  } else p.setPosition(v.x, v.y, v.z);
}

const hrtf = (ctx, refDistance, rolloffFactor) =>
  new PannerNode(ctx, { panningModel: 'HRTF', distanceModel: 'inverse', refDistance, rolloffFactor, maxDistance: 100000 });

function euclid(k, n, rng) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(Math.floor(((i + 1) * k) / n) - Math.floor((i * k) / n) ? (rng.chance(0.3) ? 2 : 1) : 0);
  return out;
}

// What a hull sounds like, derived from its shape and size.
function hullSound(ship, composer) {
  const spec = ship.spec;
  const rng = new Rng((spec.seed ^ 0x5bd1e995) >>> 0);
  const size = Math.min(1, spec.radius / 1000);
  const target = 150 - 110 * Math.sqrt(size);
  let f0 = composer.freq(rng.pick([0, 0, 2, 4, 3]));
  while (f0 > target * 1.4) f0 /= 2;
  while (f0 < target / 1.4) f0 *= 2;
  const set = MODE_SETS[spec.family] ?? [1, ...Array.from({ length: 5 }, () => rng.float(1.3, 9))];
  const ratios = set.map((r) => r * rng.float(0.985, 1.015)).sort((a, b) => a - b);
  return {
    f0,
    ratios,
    modes: ratios.map((r, i) => ({ f: f0 * r, q: rng.float(25, 70), g: 1 / (1 + i * 0.5) })).filter((m) => m.f < 6000),
    wind: rng.float(0.3, 1),
    creakMean: rng.float(2, 8),
    groanMean: rng.float(30, 90),
    machine: rng.chance(0.4)
      ? { step: rng.float(0.18, 0.45), pattern: euclid(rng.int(3, 7), rng.pick([8, 12, 16]), rng), on: rng.float(15, 50), off: rng.float(30, 120), thud: rng.float(40, 80) }
      : null,
    species: spec.living
      ? Array.from({ length: rng.int(3, 5) }, () => ({
          base: rng.float(1200, 5200),
          glide: rng.float(-0.5, 0.6),
          len: rng.float(0.03, 0.14),
          reps: rng.int(1, 6),
          gap: rng.float(0.04, 0.2),
          rate: rng.float(8, 30),
          type: rng.pick(['sine', 'sine', 'triangle']),
          next: 0,
        }))
      : null,
  };
}

class HullVoice {
  constructor(e, ship) {
    const ctx = e.ctx;
    const t = ctx.currentTime;
    this.e = e;
    this.ship = ship;
    const S = (this.S = e.soundOf(ship));
    this.panner = hrtf(ctx, ship.radius * 1.5, 1);
    setPos(this.panner, ship.group.position);
    this.out = new GainNode(ctx, { gain: 0 });
    this.out.gain.setTargetAtTime(1, t, 2);
    this.out.connect(this.panner).connect(e.bus.hull);

    // The body: a bank of narrow resonances, excited by wind and by impacts.
    this.bank = new GainNode(ctx);
    this.modes = S.modes.map((m) => {
      const bp = new BiquadFilterNode(ctx, { type: 'bandpass', frequency: m.f, Q: m.q });
      const g = new GainNode(ctx, { gain: m.g });
      this.bank.connect(bp).connect(g).connect(this.out);
      return { bp, g, m };
    });
    this.sources = [];
    this.windGain = new GainNode(ctx, { gain: 0 });
    this.loop(this.windGain).connect(this.bank);

    this.nextDrift = t;
    this.nextCreak = t + R() * S.creakMean;
    this.nextGroan = t + 10 + R() * S.groanMean;
    if (S.machine) {
      this.machineOn = R() < 0.5;
      this.machineSwitch = t + R() * S.machine.off;
      this.nextStep = t;
      this.step = 0;
    }
    if (S.species) {
      const surfLp = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 500 });
      this.surf = new GainNode(ctx, { gain: 0 });
      this.loop(surfLp).connect(this.surf).connect(this.out);
      this.gustBp = new BiquadFilterNode(ctx, { type: 'bandpass', frequency: 600, Q: 1.2 });
      this.gust = new GainNode(ctx, { gain: 0 });
      this.loop(this.gustBp).connect(this.gust).connect(this.out);
      this.nextWave = t;
      this.nextGust = t;
    }
  }

  loop(into) {
    const src = new AudioBufferSourceNode(this.e.ctx, { buffer: this.e.noiseMono, loop: true });
    src.connect(into);
    src.start(this.e.ctx.currentTime, R() * 6);
    this.sources.push(src);
    return into;
  }

  tick(t, near, lifeNear) {
    const S = this.S;
    if (t > this.nextDrift) {
      for (const v of this.modes) v.g.gain.setTargetAtTime(v.m.g * (0.15 + R() * 1.4), t, 2 + R() * 4);
      this.windGain.gain.setTargetAtTime(4 * S.wind * (0.3 + R() * 1.2) * (0.4 + near), t, 4);
      this.nextDrift = t + 3 + R() * 6;
    }
    if (this.nextCreak < t - 2) this.nextCreak = t;
    while (this.nextCreak < t + 0.5) {
      this.creak(this.nextCreak);
      this.nextCreak += R() < 0.3 ? 0.08 + R() * 0.5 : -Math.log(1 - R()) * S.creakMean;
    }
    if (this.nextGroan < t + 0.5) {
      this.groan(Math.max(t, this.nextGroan));
      this.nextGroan = t + S.groanMean * (0.5 + R());
    }
    if (S.machine) {
      const M = S.machine;
      if (t > this.machineSwitch) {
        this.machineOn = !this.machineOn;
        this.machineSwitch = t + (this.machineOn ? M.on : M.off) * (0.6 + R() * 0.8);
      }
      if (this.machineOn) {
        if (this.nextStep < t - 1) this.nextStep = t;
        while (this.nextStep < t + 0.5) {
          const hit = M.pattern[this.step % M.pattern.length];
          if (hit && R() < 0.9) this.thud(this.nextStep, hit === 2);
          this.step++;
          this.nextStep += M.step * (1 + (R() - 0.5) * 0.04);
        }
      }
    }
    if (S.species && lifeNear > 0.01) this.life(t, lifeNear);
  }

  creak(t) {
    const ctx = this.e.ctx;
    const src = new AudioBufferSourceNode(ctx, { buffer: this.e.clickBuf, playbackRate: 0.4 + R() * 1.6 });
    const g = new GainNode(ctx, { gain: (0.5 + R() * 2.5) * 1.5 });
    const direct = new GainNode(ctx, { gain: 0.03 * R() });
    src.connect(g).connect(this.bank);
    src.connect(direct).connect(this.out);
    src.start(t);
    src.onended = () => {
      g.disconnect();
      direct.disconnect();
    };
  }

  groan(t) {
    const ctx = this.e.ctx;
    const f = this.S.f0 * (0.5 + R() * 0.5);
    const dur = 3 + R() * 4;
    const o = new OscillatorNode(ctx, { type: 'sawtooth', frequency: f });
    o.frequency.linearRampToValueAtTime(f * (0.92 + R() * 0.1), t + dur);
    const lp = new BiquadFilterNode(ctx, { type: 'lowpass', Q: 9, frequency: f * 1.5 });
    lp.frequency.setValueAtTime(f * 1.5, t);
    lp.frequency.linearRampToValueAtTime(f * (4 + R() * 4), t + dur * 0.4);
    lp.frequency.linearRampToValueAtTime(f * 1.5, t + dur);
    const g = new GainNode(ctx, { gain: 0 });
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.05, t + dur * 0.3);
    g.gain.linearRampToValueAtTime(0, t + dur);
    o.connect(lp).connect(g).connect(this.out);
    o.start(t);
    o.stop(t + dur + 0.1);
    o.onended = () => [lp, g].forEach((n) => n.disconnect());
  }

  thud(t, accent) {
    const ctx = this.e.ctx;
    const f = this.S.machine.thud;
    const o = new OscillatorNode(ctx, { frequency: f * 1.8 });
    o.frequency.setValueAtTime(f * 1.8, t);
    o.frequency.exponentialRampToValueAtTime(f, t + 0.12);
    const g = new GainNode(ctx, { gain: 0 });
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(accent ? 0.12 : 0.07, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
    const ring = new GainNode(ctx, { gain: 1.5 });
    o.connect(g).connect(this.out);
    g.connect(ring).connect(this.bank);
    o.start(t);
    o.stop(t + 0.5);
    o.onended = () => [g, ring].forEach((n) => n.disconnect());
    if (accent) this.creak(t + 0.01);
  }

  // Something inside answers the hull.
  knock(t) {
    const ctx = this.e.ctx;
    const n = 2 + Math.floor(R() * 3);
    const gap = 0.5 + R() * 0.3;
    for (let i = 0; i < n; i++) {
      const at = t + i * gap * (1 + (R() - 0.5) * 0.1);
      const src = new AudioBufferSourceNode(ctx, { buffer: this.e.clickBuf, playbackRate: 0.22 });
      const g = new GainNode(ctx, { gain: 5 });
      src.connect(g).connect(this.bank);
      const o = new OscillatorNode(ctx, { frequency: 75 });
      o.frequency.setValueAtTime(75, at);
      o.frequency.exponentialRampToValueAtTime(42, at + 0.12);
      const og = new GainNode(ctx, { gain: 0 });
      og.gain.setValueAtTime(0, at);
      og.gain.linearRampToValueAtTime(0.18, at + 0.004);
      og.gain.exponentialRampToValueAtTime(0.0001, at + 0.35);
      o.connect(og).connect(this.out);
      src.start(at);
      o.start(at);
      o.stop(at + 0.4);
      o.onended = () => [g, og].forEach((x) => x.disconnect());
    }
  }

  life(t, k) {
    if (t > this.nextWave) {
      this.surf.gain.setTargetAtTime(0.25 * k * (0.5 + R()), t, 1.5);
      this.surf.gain.setTargetAtTime(0.03 * k, t + 2.5, 2.5);
      this.nextWave = t + 5 + R() * 6;
    }
    if (t > this.nextGust) {
      this.gustBp.frequency.setTargetAtTime(300 + R() * 900, t, 2);
      this.gust.gain.setTargetAtTime(0.12 * k * R(), t, 3);
      this.nextGust = t + 4 + R() * 8;
    }
    for (const sp of this.S.species) {
      if (sp.next < t - 2) sp.next = t + R() * 3;
      if (sp.next < t + 0.5) {
        this.chirp(sp, sp.next);
        sp.next += ((60 / sp.rate) * -Math.log(1 - R())) / (0.3 + k);
      }
    }
  }

  // A small creature call, somewhere on the hull near you.
  chirp(sp, t) {
    const ctx = this.e.ctx;
    const c = this.ship.group.position;
    const toward = this.e.listener.clone().sub(c).normalize();
    toward.x += (R() - 0.5) * 1.6;
    toward.y += (R() - 0.5) * 1.6;
    toward.z += (R() - 0.5) * 1.6;
    const p = hrtf(ctx, this.ship.radius * 0.4, 1);
    setPos(p, c.clone().addScaledVector(toward.normalize(), this.ship.radius * 1.05));
    p.connect(this.e.bus.creatures);
    const base = sp.base * (0.95 + R() * 0.1);
    let end = t;
    const oscs = [];
    for (let i = 0; i < sp.reps; i++) {
      const at = t + i * (sp.len + sp.gap);
      const o = new OscillatorNode(ctx, { type: sp.type, frequency: base });
      o.frequency.setValueAtTime(base, at);
      o.frequency.exponentialRampToValueAtTime(base * (1 + sp.glide), at + sp.len);
      const g = new GainNode(ctx, { gain: 0 });
      g.gain.setValueAtTime(0, at);
      g.gain.linearRampToValueAtTime(0.05, at + sp.len * 0.2);
      g.gain.linearRampToValueAtTime(0, at + sp.len);
      o.connect(g).connect(p);
      o.start(at);
      o.stop(at + sp.len + 0.02);
      o.onended = () => g.disconnect();
      oscs.push(o);
      end = at + sp.len;
    }
    oscs[oscs.length - 1].addEventListener('ended', () => p.disconnect());
  }

  dispose() {
    const t = this.e.ctx.currentTime;
    this.out.gain.setTargetAtTime(0, t, 0.6);
    setTimeout(() => {
      this.sources.forEach((s) => s.stop());
      this.panner.disconnect();
      this.bank.disconnect();
    }, 4000);
  }
}

// An echo hums with a monaural beat at its own frequency. Match it and it settles.
class EchoVoice {
  constructor(e, node) {
    const ctx = e.ctx;
    this.node = node;
    this.f = node.tone;
    this.beat = node.echo.freq;
    this.panner = hrtf(ctx, 40, 1.3);
    setPos(this.panner, node.world);
    this.g = new GainNode(ctx, { gain: 0 });
    this.g.connect(this.panner).connect(e.bus.echo);
    this.o1 = new OscillatorNode(ctx, { frequency: this.f });
    this.o2 = new OscillatorNode(ctx, { frequency: this.f + this.beat });
    this.o3 = new OscillatorNode(ctx, { frequency: this.f * 1.5 });
    this.g3 = new GainNode(ctx, { gain: 0 });
    this.o1.connect(this.g);
    this.o2.connect(this.g);
    this.o3.connect(this.g3).connect(this.g);
    for (const o of [this.o1, this.o2, this.o3]) o.start();
    this.e = e;
  }

  update(t, attuning, matched) {
    setPos(this.panner, this.node.world);
    const settled = matched || this.node.decoded;
    this.o2.frequency.setTargetAtTime(settled ? this.f : this.f + this.beat, t, 0.8);
    this.g3.gain.setTargetAtTime(settled ? 0.5 : 0, t, 1);
    this.g.gain.setTargetAtTime(this.node.decoded ? 0.005 : attuning ? 0.03 : 0.018, t, 0.8);
  }

  dispose() {
    this.g.gain.setTargetAtTime(0, this.e.ctx.currentTime, 0.3);
    setTimeout(() => {
      for (const o of [this.o1, this.o2, this.o3]) o.stop();
      this.panner.disconnect();
    }, 2000);
  }
}

export class AudioEngine {
  constructor(universe) {
    this.profile = universe.music;
    this.inst = this.profile.inst;
    this.brightness = this.profile.brightness;
    this.beatLevel = 2;
    this.muted = false;
    this.beatHz = 7 + this.profile.binaural.bias;
    this.state = { speed01: 0, p: 0, lp: 0, boost: 0, listen: false, attune: null };
    this.hullVoices = new Map();
    this.echoVoices = new Map();
    this.ships = [];
    this.attuneNode = null;
    this.attuneMatched = false;
    this.paramClock = 0;
  }

  get carrierHz() {
    return this.carrier ?? this.profile.binaural.carrierLo * 1.3;
  }

  start(ships, listener) {
    const ctx = (this.ctx = new AudioContext({ latencyHint: 'playback' }));
    const now = ctx.currentTime;
    this.ships = ships;
    this.listener = listener;

    this.master = new GainNode(ctx, { gain: 0 });
    this.master.gain.linearRampToValueAtTime(MASTER, now + 8);
    const comp = new DynamicsCompressorNode(ctx, { threshold: -18, knee: 12, ratio: 3, attack: 0.05, release: 0.6 });
    this.master.connect(comp).connect(ctx.destination);

    const reverb = new ConvolverNode(ctx, { buffer: impulse(ctx, 7, 2.6) });
    this.reverbIn = new GainNode(ctx);
    this.reverbIn.connect(reverb).connect(new GainNode(ctx, { gain: 0.6 })).connect(this.master);

    this.noiseStereo = pinkNoise(ctx, 8, 2);
    this.noiseMono = pinkNoise(ctx, 7, 1);
    this.clickBuf = clickBuffer(ctx);
    this.waves = makeWaves(ctx, this.inst);

    const bus = (level, send) => {
      const g = new GainNode(ctx, { gain: level });
      g.connect(this.master);
      g.connect(new GainNode(ctx, { gain: send })).connect(this.reverbIn);
      return g;
    };
    this.bus = {
      bed: bus(1.7, 0.55),
      bass: bus(1, 0.1),
      lead: bus(1, 0.6),
      sparkle: bus(1, 0.7),
      texture: bus(0.8, 0.8),
      life: bus(0, 0.8),
      creatures: bus(1, 0.4),
      hull: bus(0.55, 0.35),
      echo: bus(1, 0.5),
      deep: bus(1, 0.9),
      weather: bus(1, 0.5),
    };
    this.delay(this.bus.lead);
    this.startBinaural(now);
    this.startBreath(now);

    this.meters = {};
    for (const [k, node] of [['master', this.master], ...Object.entries(this.bus), ['binaural', this.binGain]]) {
      const a = new AnalyserNode(ctx, { fftSize: 2048 });
      node.connect(a);
      this.meters[k] = a;
    }

    this.startVoid(now);
    this.composer = new Composer(this, this.profile);
    this.composer.start(now);
    this.nextChimeAt = now + 6;
    this.scheduler = setInterval(() => this.tick(), 200);
  }

  delay(src) {
    const ctx = this.ctx;
    const time = this.profile.tempo ? (60 / this.profile.tempo) * 0.75 : 0.42;
    const dl = new DelayNode(ctx, { delayTime: time, maxDelayTime: 2 });
    const dr = new DelayNode(ctx, { delayTime: time, maxDelayTime: 2 });
    const fb = new GainNode(ctx, { gain: 0.38 });
    const tone = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 2400 });
    const merger = new ChannelMergerNode(ctx, { numberOfInputs: 2 });
    const send = new GainNode(ctx, { gain: 0.35 });
    src.connect(send).connect(dl);
    dl.connect(dr).connect(tone).connect(fb).connect(dl);
    dl.connect(merger, 0, 0);
    dr.connect(merger, 0, 1);
    merger.connect(this.master);
    merger.connect(this.reverbIn);
  }

  startBinaural(now) {
    const ctx = this.ctx;
    this.binGain = new GainNode(ctx, { gain: 0 });
    this.binGain.gain.linearRampToValueAtTime(BEAT_LEVELS[this.beatLevel], now + 12);
    this.binGain.connect(this.master);
    this.pairs = [];
    const add = (mult, level) => {
      const merger = new ChannelMergerNode(ctx, { numberOfInputs: 2 });
      const L = new OscillatorNode(ctx, { frequency: this.carrierHz * mult });
      const Rr = new OscillatorNode(ctx, { frequency: this.carrierHz * mult + this.beatHz });
      L.connect(merger, 0, 0);
      Rr.connect(merger, 0, 1);
      merger.connect(new GainNode(ctx, { gain: level })).connect(this.binGain);
      L.start(now);
      Rr.start(now);
      this.pairs.push({ L, R: Rr, mult });
    };
    add(1, 1);
    if (this.profile.binaural.second) add(1.5, 0.45);
  }

  startBreath(now) {
    const ctx = this.ctx;
    const src = new AudioBufferSourceNode(ctx, { buffer: this.noiseStereo, loop: true });
    const lp = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 420, Q: 0.3 });
    const level = new GainNode(ctx, { gain: 0.04 });
    const breath = new OscillatorNode(ctx, { frequency: 0.1 });
    breath.connect(new GainNode(ctx, { gain: 260 })).connect(lp.frequency);
    breath.connect(new GainNode(ctx, { gain: 0.018 })).connect(level.gain);
    src.connect(lp).connect(level).connect(this.master);
    src.start(now);
    breath.start(now);
  }

  // A presence too large to place: sub-bass, from roughly where it is in the sky.
  startVoid(now) {
    const ctx = this.ctx;
    this.voidPanner = hrtf(ctx, 400, 1);
    this.voidGain = new GainNode(ctx, { gain: 0 });
    this.voidGain.connect(this.voidPanner).connect(this.bus.deep);
    const sub = new OscillatorNode(ctx, { frequency: 27 });
    sub.connect(new GainNode(ctx, { gain: 0.6 })).connect(this.voidGain);
    const rumble = new AudioBufferSourceNode(ctx, { buffer: this.noiseMono, loop: true });
    rumble.connect(new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 55, Q: 0.7 })).connect(new GainNode(ctx, { gain: 3 })).connect(this.voidGain);
    sub.start(now);
    rumble.start(now);
    this.void = { presence: 0, dir: null, nextMoan: now + 20 };
  }

  thunder(pos, ref) {
    const ctx = this.ctx;
    const t = ctx.currentTime + 0.3 + R() * 2.2;
    const p = hrtf(ctx, ref, 1);
    setPos(p, pos);
    p.connect(this.bus.weather);
    const src = new AudioBufferSourceNode(ctx, { buffer: this.noiseMono, playbackRate: 0.6 + R() * 0.3 });
    const lp = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 160 + R() * 120, Q: 0.8 });
    const g = new GainNode(ctx, { gain: 0 });
    const dur = 4 + R() * 3;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(1.6, t + 0.08);
    g.gain.setTargetAtTime(0.5, t + 0.2, 0.4);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(lp).connect(g).connect(p);
    src.start(t, R() * 5);
    src.stop(t + dur + 0.1);
    src.onended = () => [lp, g, p].forEach((n) => n.disconnect());
  }

  // A long, low call: two detuned saws through a slowly opening throat.
  leviathanCall(pos, ref, low = 1) {
    const ctx = this.ctx;
    const t = ctx.currentTime + 0.1;
    const dur = 7 + R() * 6;
    const f = (32 + R() * 28) * low;
    const p = hrtf(ctx, ref, 1);
    setPos(p, pos);
    p.connect(this.bus.deep);
    const g = new GainNode(ctx, { gain: 0 });
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.12, t + dur * 0.35);
    g.gain.linearRampToValueAtTime(0.08, t + dur * 0.7);
    g.gain.linearRampToValueAtTime(0, t + dur);
    const throat = new BiquadFilterNode(ctx, { type: 'bandpass', frequency: 180, Q: 5 });
    throat.frequency.setValueAtTime(180, t);
    throat.frequency.linearRampToValueAtTime(420 + R() * 300, t + dur * 0.45);
    throat.frequency.linearRampToValueAtTime(200, t + dur);
    const lp = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 700 });
    throat.connect(lp).connect(g).connect(p);
    const oscs = [-9, 7].map((d) => {
      const o = new OscillatorNode(ctx, { type: 'sawtooth', frequency: f, detune: d });
      o.frequency.setValueAtTime(f, t);
      o.frequency.linearRampToValueAtTime(f * (1.08 + R() * 0.15), t + dur * 0.4);
      o.frequency.linearRampToValueAtTime(f * (0.85 + R() * 0.1), t + dur);
      o.connect(throat);
      o.start(t);
      o.stop(t + dur + 0.1);
      return o;
    });
    // Sometimes a higher, almost-whale line rides on top.
    if (R() < 0.5) {
      const w = new OscillatorNode(ctx, { frequency: f * 6 });
      w.frequency.setValueAtTime(f * 6, t + dur * 0.2);
      w.frequency.exponentialRampToValueAtTime(f * (9 + R() * 4), t + dur * 0.5);
      w.frequency.exponentialRampToValueAtTime(f * 5, t + dur * 0.9);
      const wg = new GainNode(ctx, { gain: 0 });
      wg.gain.setValueAtTime(0, t + dur * 0.2);
      wg.gain.linearRampToValueAtTime(0.025, t + dur * 0.5);
      wg.gain.linearRampToValueAtTime(0, t + dur * 0.9);
      w.connect(wg).connect(p);
      w.start(t);
      w.stop(t + dur);
      w.onended = () => wg.disconnect();
    }
    oscs[0].onended = () => [throat, lp, g, p].forEach((n) => n.disconnect());
  }

  drifterSong(pos) {
    const ctx = this.ctx;
    const t = ctx.currentTime + 0.1;
    const c = this.composer;
    const f = c.freq(c.chordPcs[Math.floor(R() * c.chordPcs.length)] + this.profile.N * 5);
    const p = hrtf(ctx, 1500, 1);
    setPos(p, pos);
    p.connect(this.bus.sparkle);
    const g = new GainNode(ctx, { gain: 0 });
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.03, t + 2.5);
    g.gain.linearRampToValueAtTime(0, t + 9);
    g.connect(p);
    const oscs = [f, f * 1.5, f * 2.01].map((fr, i) => {
      const o = new OscillatorNode(ctx, { frequency: fr, detune: (R() - 0.5) * 10 });
      o.connect(new GainNode(ctx, { gain: [1, 0.5, 0.2][i] })).connect(g);
      o.start(t);
      o.stop(t + 9.1);
      return o;
    });
    oscs[0].onended = () => [g, p].forEach((n) => n.disconnect());
  }

  soundOf(ship) {
    return (ship.sound ??= hullSound(ship, this.composer));
  }

  setCarrier(f) {
    const lo = this.profile.binaural.carrierLo;
    while (f >= lo * 2) f /= 2;
    while (f < lo) f *= 2;
    this.carrierTarget = f;
    this.carrier ??= f;
  }

  tick() {
    const t = this.ctx.currentTime;
    this.composer.tick(t, this.state);

    if (this.nextChimeAt < t - 2) this.nextChimeAt = t + 0.2;
    while (this.nextChimeAt < t + 0.6) {
      this.chime(this.nextChimeAt);
      const s = this.state;
      const mean = (11 / (1 + 1.5 * s.p + 3 * s.lp)) * (s.listen ? 0.6 : 1);
      this.nextChimeAt += Math.max(1.5, -Math.log(1 - R()) * mean);
    }

    const L = this.listener;
    for (const ship of this.ships) {
      if (ship.leviathans.length && ship.surfaceDistance(L) < ship.radius * 3) {
        ship.nextCall ??= t + 4 + R() * 8;
        if (t > ship.nextCall) {
          const lev = ship.leviathans[Math.floor(R() * ship.leviathans.length)];
          this.leviathanCall(lev.world, ship.radius * 0.5);
          ship.nextCall = t + 18 + R() * 35;
        }
      }
    }
    for (const d of this.drifters ?? []) {
      if (d.alpha > 0.15 && t > (d.nextSong ?? 0) && d.pos.distanceTo(L) < 14000) {
        this.drifterSong(d.pos);
        d.nextSong = t + 14 + R() * 30;
      }
    }
    const V = this.void;
    if (V.dir) {
      setPos(this.voidPanner, L.clone().addScaledVector(V.dir, 600));
      this.voidGain.gain.setTargetAtTime(V.presence * 0.09, t, 2);
      if (V.presence > 0.4 && t > V.nextMoan) {
        this.leviathanCall(L.clone().addScaledVector(V.dir, 900), 900, 0.6);
        V.nextMoan = t + 25 + R() * 40;
      }
    }
    const landedVoice = this.landedShip && !this.landedShip.spec.living && this.hullVoices.get(this.landedShip);
    if (landedVoice) {
      this.nextKnock ??= t + 25 + R() * 40;
      if (t > this.nextKnock) {
        landedVoice.knock(t + 0.1);
        this.nextKnock = t + 45 + R() * 110;
      }
    } else this.nextKnock = null;
    for (const ship of this.ships) {
      const d = ship.surfaceDistance(L);
      const reach = 1500 + ship.radius * 10;
      let v = this.hullVoices.get(ship);
      if (!v && d < reach) this.hullVoices.set(ship, (v = new HullVoice(this, ship)));
      else if (v && d > reach * 1.25) {
        v.dispose();
        this.hullVoices.delete(ship);
        v = null;
      }
      if (v) v.tick(t, clamp(1 - d / (ship.radius * 8), 0, 1), clamp(1 - d / (ship.radius * 6), 0, 1));

      for (const n of ship.nodes) {
        const dn = n.world.distanceTo(L);
        let ev = this.echoVoices.get(n);
        if (!ev && dn < 700) {
          n.tone ??= this.composer.freq(Math.floor(R() * this.profile.N) + this.profile.N * 4);
          this.echoVoices.set(n, (ev = new EchoVoice(this, n)));
        } else if (ev && dn > 900) {
          ev.dispose();
          this.echoVoices.delete(n);
          ev = null;
        }
        if (ev) ev.update(t, this.attuneNode === n, this.attuneNode === n && this.attuneMatched);
      }
    }
  }

  chime(t) {
    const c = this.composer;
    const pc = c.chordPcs[Math.floor(R() * c.chordPcs.length)];
    const f = c.freq(pc + this.profile.N * (R() < 0.3 ? 4 : 3));
    const theta = R() * Math.PI * 2;
    const phi = Math.acos(R() * 2 - 1);
    const dist = 6 + R() * 20;
    const ctx = this.ctx;
    const p = hrtf(ctx, 8, 1);
    setPos(p, {
      x: this.listener.x + Math.sin(phi) * Math.cos(theta) * dist,
      y: this.listener.y + Math.cos(phi) * dist,
      z: this.listener.z + Math.sin(phi) * Math.sin(theta) * dist,
    });
    p.connect(this.bus.sparkle);
    const car = new OscillatorNode(ctx, { frequency: f });
    const mod = new OscillatorNode(ctx, { frequency: f * 3.5 });
    const depth = new GainNode(ctx, { gain: f * 1.1 });
    depth.gain.exponentialRampToValueAtTime(f * 0.01, t + 2);
    mod.connect(depth).connect(car.frequency);
    const g = new GainNode(ctx, { gain: 0 });
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.05, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 5);
    car.connect(g).connect(p);
    car.start(t);
    mod.start(t);
    car.stop(t + 5.1);
    mod.stop(t + 5.1);
    car.onended = () => [depth, g, p].forEach((n) => n.disconnect());
  }

  // s: { speed01, p, lp, boost, listen, attune (Hz or null) }
  update(s, dt) {
    if (!this.ctx) return;
    this.state = s;
    const bias = this.profile.binaural.bias;
    let target = 7 + 2.5 * s.speed01 + bias;
    target = lerp(target, 6 + bias * 0.5, s.p);
    target = lerp(target, 4.5, s.lp);
    if (s.listen) target = Math.min(target, 3.2);
    target = lerp(target, 12, s.boost);
    let tc = 4;
    if (s.attune != null) {
      target = s.attune;
      tc = 1.6;
    }
    this.beatTarget = clamp(target, 1.5, 14);
    this.beatHz += (this.beatTarget - this.beatHz) * (1 - Math.exp(-dt / tc));
    if (this.carrierTarget) this.carrier += (this.carrierTarget - this.carrier) * (1 - Math.exp(-dt / 5));
    this.attuneMatched = s.attune != null && Math.abs(this.beatHz - s.attune) < 0.25;

    this.paramClock += dt;
    if (this.paramClock < 0.1) return;
    this.paramClock = 0;
    const t = this.ctx.currentTime;
    for (const pr of this.pairs) {
      const c = this.carrierHz * pr.mult;
      pr.L.frequency.setTargetAtTime(c - this.beatHz / 2, t, 0.08);
      pr.R.frequency.setTargetAtTime(c + this.beatHz / 2, t, 0.08);
    }
    const attuning = s.attune != null;
    const b = this.bus;
    b.bed.gain.setTargetAtTime(1.7 * (s.listen ? 0.35 : attuning ? 0.6 : 1), t, 1.5);
    b.lead.gain.setTargetAtTime(s.listen || attuning ? 0.5 : 1, t, 1.5);
    b.hull.gain.setTargetAtTime(0.55 * (s.listen ? 1.8 : 1) * (s.landed ? 1.8 : 1), t, 1.5);
    b.echo.gain.setTargetAtTime(attuning ? 1.8 : s.listen ? 1.5 : 1, t, 1);
    b.creatures.gain.setTargetAtTime(s.listen ? 1.4 : 1, t, 1.5);
    b.life.gain.setTargetAtTime(s.lp, t, 2);
  }

  setListener(pos, fwd, up) {
    if (!this.ctx) return;
    const l = this.ctx.listener;
    if (l.positionX) {
      l.positionX.value = pos.x;
      l.positionY.value = pos.y;
      l.positionZ.value = pos.z;
      l.forwardX.value = fwd.x;
      l.forwardY.value = fwd.y;
      l.forwardZ.value = fwd.z;
      l.upX.value = up.x;
      l.upY.value = up.y;
      l.upZ.value = up.z;
    } else {
      l.setPosition(pos.x, pos.y, pos.z);
      l.setOrientation(fwd.x, fwd.y, fwd.z, up.x, up.y, up.z);
    }
  }

  cycleBeatLevel() {
    this.beatLevel = (this.beatLevel + 1) % BEAT_LEVELS.length;
    this.binGain.gain.cancelScheduledValues(this.ctx.currentTime);
    this.binGain.gain.setTargetAtTime(BEAT_LEVELS[this.beatLevel], this.ctx.currentTime, 0.5);
    return this.beatLevel;
  }

  toggleMute() {
    this.muted = !this.muted;
    this.master.gain.cancelScheduledValues(this.ctx.currentTime);
    this.master.gain.setTargetAtTime(this.muted ? 0 : MASTER, this.ctx.currentTime, 0.5);
    return this.muted;
  }

  // Debugging: RMS per bus.
  levels() {
    const out = {};
    const buf = new Float32Array(2048);
    for (const [k, a] of Object.entries(this.meters)) {
      a.getFloatTimeDomainData(buf);
      let s = 0;
      for (const x of buf) s += x * x;
      out[k] = +Math.sqrt(s / buf.length).toFixed(4);
    }
    return out;
  }
}
