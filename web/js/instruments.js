// Synth voices. Every universe rolls its own parameters, so the "glass" of one
// universe is not the "glass" of the next.

export const BEDS = ['pad', 'choir', 'bowed'];
export const LEADS = ['glass', 'kalimba', 'pluck', 'bowed', 'choir'];

const VOWELS = {
  a: [800, 1150, 2900],
  o: [450, 800, 2830],
  u: [325, 700, 2530],
  e: [400, 1700, 2600],
  i: [300, 1900, 2700],
};

export function rollInstruments(rng) {
  const harmonics = [0];
  const roll = rng.float(1.1, 2.3);
  const odd = rng.chance(0.4);
  for (let k = 1; k <= 18; k++) harmonics.push((1 / k ** roll) * (odd && k % 2 === 0 ? 0.2 : 1) * rng.float(0.5, 1.2));
  return {
    pad: { harmonics, detune: rng.float(3, 12), voices: rng.int(2, 3), attack: rng.float(3, 8), release: rng.float(5, 11), cutoff: rng.float(700, 2400) },
    choir: { vowels: rng.shuffle(Object.keys(VOWELS)).slice(0, 2), attack: rng.float(1.5, 4), release: rng.float(3, 7), vib: rng.float(4.2, 5.6) },
    bowed: { attack: rng.float(0.8, 2.5), release: rng.float(2, 5), bright: rng.float(3, 7), vib: rng.float(4.5, 6) },
    glass: { ratio: rng.pick([1, 2, 3, 3.5, 4.2, 1.41]), index: rng.float(0.4, 2), attack: rng.float(0.005, 0.25), decay: rng.float(3, 8) },
    kalimba: { ratio: rng.pick([5.4, 6.8, 4.1, 7.2]), index: rng.float(1, 3), decay: rng.float(1, 2.5) },
    pluck: { decay: rng.float(1.2, 3.5), bright: rng.float(4, 12) },
    sub: { attack: rng.float(3, 6), release: rng.float(5, 9) },
    shimmer: { trem: rng.float(0.2, 0.7) },
    grain: { len: [rng.float(0.03, 0.08), rng.float(0.1, 0.3)], q: rng.float(15, 60) },
  };
}

export function makeWaves(ctx, inst) {
  const h = inst.pad.harmonics;
  return { pad: ctx.createPeriodicWave(new Float32Array(h.length), Float32Array.from(h)) };
}

function env(ctx, t, attack, hold, release, level) {
  const g = new GainNode(ctx, { gain: 0 });
  const top = t + Math.max(attack, hold);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(level, t + attack);
  g.gain.setValueAtTime(level, top);
  g.gain.setTargetAtTime(0, top, release / 4);
  return { g, stop: top + release * 1.4 };
}

function finish(sources, t, stop, nodes) {
  for (const s of sources) {
    s.start(t);
    s.stop(stop);
  }
  sources[0].onended = () => nodes.forEach((n) => n.disconnect());
}

const osc = (ctx, type, frequency, detune = 0) => new OscillatorNode(ctx, { type, frequency, detune });

function fm(ctx, freq, t, ratio, index, attack, decay, indexDecay, level, dest) {
  const car = osc(ctx, 'sine', freq);
  const mod = osc(ctx, 'sine', freq * ratio);
  const depth = new GainNode(ctx, { gain: 0 });
  depth.gain.setValueAtTime(freq * index, t);
  depth.gain.exponentialRampToValueAtTime(Math.max(0.01, freq * index * 0.01), t + indexDecay);
  mod.connect(depth).connect(car.frequency);
  const g = new GainNode(ctx, { gain: 0 });
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(level, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  car.connect(g).connect(dest);
  const sources = [car, mod];
  finish(sources, t, t + attack + decay + 0.1, [depth, g]);
}

// play(engine, name, freq, t, dur, vel, dest, pan)
export function play(e, name, freq, t, dur, vel, dest, pan = 0) {
  const ctx = e.ctx;
  const p = e.inst[name];
  const out = new StereoPannerNode(ctx, { pan: Math.max(-1, Math.min(1, pan)) });
  out.connect(dest);
  const tidy = [out];

  switch (name) {
    case 'pad': {
      const { g, stop } = env(ctx, t, p.attack, dur, p.release, vel);
      const f = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: p.cutoff * 0.4, Q: 0.5 });
      f.frequency.setValueAtTime(p.cutoff * 0.4, t);
      f.frequency.linearRampToValueAtTime(p.cutoff * e.brightness, t + p.attack + dur * 0.4);
      f.frequency.setTargetAtTime(p.cutoff * 0.4, t + dur, p.release / 3);
      f.connect(g).connect(out);
      const sources = [];
      for (let i = 0; i < p.voices; i++) {
        const o = osc(ctx, 'sine', freq, (i - (p.voices - 1) / 2) * p.detune + (Math.random() - 0.5) * 3);
        o.setPeriodicWave(e.waves.pad);
        o.connect(f);
        sources.push(o);
      }
      finish(sources, t, stop, [f, g, ...tidy]);
      break;
    }
    case 'choir': {
      const { g, stop } = env(ctx, t, p.attack, dur, p.release, vel * 3.5);
      const sum = new GainNode(ctx);
      const vib = osc(ctx, 'sine', p.vib + Math.random() * 0.4);
      const vibDepth = new GainNode(ctx, { gain: freq * 0.006 });
      vib.connect(vibDepth);
      const sources = [vib];
      for (const d of [-7, 6]) {
        const o = osc(ctx, 'sawtooth', freq, d);
        vibDepth.connect(o.frequency);
        o.connect(sum);
        sources.push(o);
      }
      const [v1, v2] = p.vowels.map((v) => VOWELS[v]);
      const nodes = [sum, vibDepth, g, ...tidy];
      [1, 0.45, 0.2].forEach((amp, k) => {
        const bp = new BiquadFilterNode(ctx, { type: 'bandpass', frequency: v1[k], Q: 8 + k * 2 });
        bp.frequency.setValueAtTime(v1[k], t);
        bp.frequency.linearRampToValueAtTime(v2[k], t + Math.max(dur, 1));
        const a = new GainNode(ctx, { gain: amp });
        sum.connect(bp).connect(a).connect(g);
        nodes.push(bp, a);
      });
      g.connect(out);
      finish(sources, t, stop, nodes);
      break;
    }
    case 'bowed': {
      const { g, stop } = env(ctx, t, p.attack, dur, p.release, vel);
      const lp = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: freq * p.bright, Q: 0.9 });
      const vib = osc(ctx, 'sine', p.vib);
      const depth = new GainNode(ctx, { gain: 0 });
      depth.gain.setValueAtTime(0, t);
      depth.gain.linearRampToValueAtTime(freq * 0.005, t + p.attack + 0.8);
      vib.connect(depth);
      const sources = [vib];
      for (const [d, lvl] of [[0, 1], [5, 0.5]]) {
        const o = osc(ctx, 'sawtooth', freq, d);
        depth.connect(o.frequency);
        const a = new GainNode(ctx, { gain: lvl });
        o.connect(a).connect(lp);
        sources.push(o);
        tidy.push(a);
      }
      lp.connect(g).connect(out);
      finish(sources, t, stop, [lp, depth, g, ...tidy]);
      break;
    }
    case 'glass':
      fm(ctx, freq, t, p.ratio, p.index, p.attack, p.decay, p.decay * 0.4, vel, out);
      break;
    case 'kalimba':
      fm(ctx, freq, t, p.ratio, p.index, 0.004, p.decay, 0.12, vel, out);
      break;
    case 'pluck': {
      const lp = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: freq * p.bright, Q: 1 });
      lp.frequency.setValueAtTime(freq * p.bright, t);
      lp.frequency.setTargetAtTime(freq * 1.2, t, 0.25);
      const g = new GainNode(ctx, { gain: 0 });
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(vel, t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t + p.decay);
      const o1 = osc(ctx, 'triangle', freq);
      const o2 = osc(ctx, 'sine', freq * 2);
      const a2 = new GainNode(ctx, { gain: 0.3 });
      o1.connect(lp);
      o2.connect(a2).connect(lp);
      lp.connect(g).connect(out);
      const sources = [o1, o2];
      finish(sources, t, t + p.decay + 0.1, [lp, g, a2, ...tidy]);
      break;
    }
    case 'sub': {
      const { g, stop } = env(ctx, t, p.attack, dur, p.release, vel);
      const o1 = osc(ctx, 'sine', freq);
      const o2 = osc(ctx, 'sine', freq * 2);
      const a2 = new GainNode(ctx, { gain: 0.15 });
      o1.connect(g);
      o2.connect(a2).connect(g);
      g.connect(out);
      const sources = [o1, o2];
      finish(sources, t, stop, [g, a2, ...tidy]);
      break;
    }
    case 'shimmer': {
      const { g, stop } = env(ctx, t, 4, dur, 6, vel);
      const trem = new GainNode(ctx, { gain: 0.6 });
      const lfo = osc(ctx, 'sine', p.trem * (0.7 + Math.random() * 0.6));
      const ld = new GainNode(ctx, { gain: 0.4 });
      lfo.connect(ld).connect(trem.gain);
      const o = osc(ctx, 'sine', freq, (Math.random() - 0.5) * 8);
      o.connect(g).connect(trem).connect(out);
      const sources = [o, lfo];
      finish(sources, t, stop, [g, trem, ld, ...tidy]);
      break;
    }
    case 'grain': {
      const len = p.len[0] + Math.random() * (p.len[1] - p.len[0]);
      const src = new AudioBufferSourceNode(ctx, { buffer: e.noiseMono });
      const bp = new BiquadFilterNode(ctx, { type: 'bandpass', frequency: freq, Q: p.q });
      const g = new GainNode(ctx, { gain: 0 });
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(vel * 6, t + len / 2);
      g.gain.linearRampToValueAtTime(0, t + len);
      src.connect(bp).connect(g).connect(out);
      src.start(t, Math.random() * 6);
      src.stop(t + len + 0.02);
      src.onended = () => [bp, g, ...tidy].forEach((n) => n.disconnect());
      break;
    }
  }
}

// Gentle loudness per instrument, so roles can swap without remixing.
export const VEL = { pad: 0.028, choir: 0.03, bowed: 0.02, glass: 0.07, kalimba: 0.06, pluck: 0.06, sub: 0.07, shimmer: 0.016, grain: 0.03 };
// Octave (above the universe root) each instrument prefers for melodies.
export const LEAD_OCT = { glass: 3, kalimba: 3, pluck: 3, bowed: 2, choir: 2 };
