// The composer. A universe has a tuning, a palette and a tempo (or none).
// Music unfolds in movements of a few minutes, each with its own
// instrumentation, harmonic habits and motif. Chords move by weighted chance
// and are voice-led, so nothing loops. Phrases gifted by echoes return
// throughout, varied.

import { rollInstruments, play, BEDS, LEADS, VEL, LEAD_OCT } from './instruments.js';
import { pickR, mod } from './util.js';

const cents = (semis) => semis.map((s) => s * 100);
const SCALES = {
  lydian: cents([0, 2, 4, 6, 7, 9, 11]),
  ionian: cents([0, 2, 4, 5, 7, 9, 11]),
  mixolydian: cents([0, 2, 4, 5, 7, 9, 10]),
  dorian: cents([0, 2, 3, 5, 7, 9, 10]),
  aeolian: cents([0, 2, 3, 5, 7, 8, 10]),
  phrygian: cents([0, 1, 3, 5, 7, 8, 10]),
  'major pentatonic': cents([0, 2, 4, 7, 9]),
  'minor pentatonic': cents([0, 3, 5, 7, 10]),
  yo: cents([0, 2, 5, 7, 9]),
  in: cents([0, 1, 5, 7, 8]),
  'harmonic series': [8, 9, 10, 11, 12, 13, 14, 15].map((n) => 1200 * Math.log2(n / 8)),
};

export function makeMusicProfile(rng) {
  const system = rng.weighted([['mode', 5], ['penta', 3], ['harmonic', 1.5], ['quartal', 1.5]]);
  let scaleName;
  if (system === 'penta') scaleName = rng.pick(['major pentatonic', 'minor pentatonic', 'yo', 'in']);
  else if (system === 'harmonic') scaleName = 'harmonic series';
  else scaleName = rng.weighted([['lydian', 3], ['ionian', 2], ['mixolydian', 2], ['dorian', 3], ['aeolian', 2], ['phrygian', 0.6]]);
  const scale = SCALES[scaleName];
  const N = scale.length;

  const beds = rng.shuffle(BEDS).slice(0, rng.int(1, 2));
  const leads = rng.shuffle(['glass', 'kalimba', 'pluck', 'bowed'].filter((x) => !beds.includes(x))).slice(0, rng.int(1, 2));
  const extras = ['sub', 'grain'].filter(() => rng.chance(0.55));
  const tempo = rng.chance(0.55) ? rng.int(46, 78) : null;

  return {
    system,
    scaleName,
    scale,
    N,
    stack: system === 'quartal' ? 3 : N === 5 ? rng.pick([1, 2]) : 2,
    rootHz: 55 * 2 ** (rng.int(-3, 8) / 12),
    palette: [...beds, ...leads, ...extras],
    tempo,
    chordSpan: rng.pick([[10, 18], [16, 28], [22, 40]]),
    density: rng.float(0.6, 1.3),
    brightness: rng.float(0.7, 1.3),
    inst: rollInstruments(rng),
    binaural: { carrierLo: rng.pick([95, 125, 150, 180]), bias: rng.float(-1.2, 1.2), second: rng.chance(0.4) },
    describe() {
      return `${scaleName}${system === 'quartal' ? ' in fourths' : ''} · ${tempo ? `${tempo} bpm` : 'unmeasured time'}`;
    },
  };
}

function euclid(k, n) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(Math.floor(((i + 1) * k) / n) - Math.floor((i * k) / n));
  return out;
}

function weightedIndex(w) {
  let r = Math.random() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < w.length; i++) if ((r -= w[i]) <= 0) return i;
  return 0;
}

export function genMotif(steps = [-2, -1, -1, 1, 1, 2, 3, -3, 0]) {
  const len = 3 + Math.floor(Math.random() * 5);
  const out = [];
  let d = pickR([0, 2, 4]);
  for (let i = 0; i < len; i++) {
    out.push({ d, dur: pickR([1, 1, 1, 2, 2, 0.5, 3]) });
    d += pickR(steps);
  }
  out[out.length - 1].dur += 2;
  return out;
}

function vary(m) {
  const r = Math.random();
  let v = m.map((n) => ({ ...n }));
  if (r < 0.18) v = v.map((n) => ({ ...n, d: -n.d }));
  else if (r < 0.32) v.reverse();
  else if (r < 0.45) v = v.map((n) => ({ ...n, dur: n.dur * 2 }));
  else if (r < 0.58) v = v.slice(0, Math.max(2, Math.ceil(v.length / 2)));
  else if (r < 0.72) {
    const s = pickR([-2, 2, 4]);
    v = v.map((n) => ({ ...n, d: n.d + s }));
  }
  return v;
}

function voiceLead(prev, pcs, lo, hi, N) {
  const list = [...pcs];
  while (list.length < 4) list.push(pcs[list.length % pcs.length]);
  if (!prev) {
    let a = lo - 1;
    return list.map((pc) => {
      let x = a + 1;
      while (mod(x, N) !== pc) x++;
      return (a = x);
    });
  }
  const sorted = [...prev].sort((x, y) => x - y);
  const out = [];
  list.forEach((pc, i) => {
    const target = sorted[Math.min(i, sorted.length - 1)];
    let best = null;
    for (let a = lo; a <= hi; a++) {
      if (mod(a, N) !== pc || out.includes(a)) continue;
      if (best === null || Math.abs(a - target) < Math.abs(best - target)) best = a;
    }
    out.push(best ?? lo + pc);
  });
  return out.sort((x, y) => x - y);
}

export class Composer {
  constructor(engine, profile) {
    this.e = engine;
    this.p = profile;
    this.gifts = [];
    this.extra = new Set();
    this.voicing = null;
    this.root = 0;
    this.rootAbs = 0;
    this.chordPcs = [0, profile.stack, profile.stack * 2].map((x) => mod(x, profile.N));
    this.movements = 0;
  }

  freq(abs) {
    const N = this.p.N;
    const o = Math.floor(abs / N);
    return this.p.rootHz * 2 ** (o + this.p.scale[mod(abs, N)] / 1200);
  }

  start(t) {
    this.newMovement(t);
  }

  newMovement(t, culminate = false) {
    const p = this.p;
    const palette = [...p.palette, ...this.extra];
    const beds = palette.filter((x) => BEDS.includes(x));
    const leads = palette.filter((x) => LEADS.includes(x) && x !== 'choir');
    const first = this.movements++ === 0;
    const pulseInst = palette.filter((x) => ['kalimba', 'pluck', 'glass'].includes(x));
    const m = {
      end: t + (culminate ? 200 : 150 + Math.random() * 170),
      bed: pickR(beds.length ? beds : ['pad']),
      bed2: Math.random() < 0.3 ? pickR(beds) : null,
      lead: leads.length && Math.random() < 0.85 ? pickR(leads) : null,
      bass: palette.includes('sub') && Math.random() < 0.65,
      grain: palette.includes('grain') && Math.random() < 0.6,
      pulse: !!p.tempo && pulseInst.length > 0 && Math.random() < 0.55,
      pulseInst: pickR(pulseInst.length ? pulseInst : ['glass']),
      center: first ? 0 : pickR([0, 0, 3, 4, 5, p.N - 2]),
      weights: Array.from({ length: p.N }, (_, i) => (i === 0 ? 2.5 : 0.2) + Math.random() * 1.5),
      pedal: Math.random() < 0.25,
      size: Math.random() < 0.5 ? 3 : 4,
      color: Math.random() < 0.5,
      density: p.density * (0.6 + Math.random() * 0.7) * (culminate ? 1.5 : 1),
      bedOct: Math.random() < 0.2 ? 1 : 2,
      motif: genMotif(),
      beat: p.tempo ? 60 / p.tempo : 0.55 + Math.random() * 0.35,
    };
    const n = pickR([8, 12, 16]);
    m.pattern = euclid(2 + Math.floor(Math.random() * (n / 2 - 1)), n);
    m.arp = Array.from({ length: n }, () => Math.floor(Math.random() * 4));
    m.step = 0;
    m.pulseFrom = t + 20 + Math.random() * 60;
    m.pulseTo = m.end - 20 - Math.random() * 40;
    m.nextPulse = m.pulseFrom;
    m.nextMotif = t + (culminate ? 2 : 8 + Math.random() * 15);
    m.nextGrain = t + 5;
    this.m = m;
    this.nextChord ??= t + 0.3;
    if (culminate) {
      this.gifts.slice(-8).forEach((g, i) => this.playPhrase(g.motif, g.instrument, t + 3 + i * m.beat * 6, 0.9));
    }
  }

  tick(t, state) {
    const m = this.m;
    if (t > m.end - 1) this.newMovement(t);
    if (t + 2 > this.nextChord) this.playChord(Math.max(this.nextChord, t + 0.05));

    if (m.lead && t + 1 > m.nextMotif) {
      let motif = m.motif;
      let inst = m.lead;
      if (this.gifts.length && Math.random() < 0.45) {
        const g = pickR(this.gifts);
        motif = g.motif;
        inst = g.instrument;
      }
      const end = this.playPhrase(vary(motif), inst, Math.max(t, m.nextMotif), 1);
      m.nextMotif = end + (12 + Math.random() * 30) / m.density;
    }

    if (m.pulse && t > m.pulseFrom - 1 && t < m.pulseTo) {
      while (m.nextPulse < t + 0.6) {
        const i = m.step % m.pattern.length;
        if (m.pattern[i] && Math.random() < 0.85) {
          const pc = this.chordPcs[m.arp[i] % this.chordPcs.length];
          const accent = i === 0 ? 1 : 0.65;
          play(this.e, m.pulseInst, this.freq(pc + this.p.N * 3), m.nextPulse, m.beat, VEL[m.pulseInst] * 0.55 * accent, this.e.bus.lead, Math.sin(m.step * 0.7) * 0.5);
        }
        m.step++;
        if (m.step % (m.pattern.length * 4) === 0) {
          const j = Math.floor(Math.random() * m.pattern.length);
          m.pattern[j] = 1 - m.pattern[j];
        }
        m.nextPulse += m.beat / 2;
      }
    }

    if (m.grain) {
      if (m.nextGrain < t - 1) m.nextGrain = t;
      const rate = (1.5 + 5 * m.density) * (0.4 + state.p + state.lp);
      while (m.nextGrain < t + 0.5) {
        const pc = pickR(this.chordPcs);
        play(this.e, 'grain', this.freq(pc + this.p.N * (3 + Math.floor(Math.random() * 3))), m.nextGrain, 0, VEL.grain, this.e.bus.texture, Math.random() * 2 - 1);
        m.nextGrain += -Math.log(1 - Math.random()) / rate;
      }
    }
  }

  playPhrase(motif, inst, t, level) {
    const m = this.m;
    const base = this.rootAbs + this.p.N * (LEAD_OCT[inst] ?? 3);
    let tt = t;
    const pan = (Math.random() - 0.5) * 0.8;
    for (const n of motif) {
      const len = n.dur * m.beat;
      play(this.e, inst, this.freq(base + n.d), tt, len * 0.9, VEL[inst] * level * (0.7 + Math.random() * 0.4), this.e.bus.lead, pan);
      tt += len * (this.p.tempo ? 1 : 0.85 + Math.random() * 0.3);
    }
    return tt;
  }

  playChord(t) {
    const m = this.m;
    const p = this.p;
    const N = p.N;
    let root = this.root;
    if (!(m.pedal && Math.random() < 0.5)) {
      do root = weightedIndex(m.weights);
      while (root === this.root && Math.random() < 0.85);
    }
    this.root = root;
    const rootAbs = (this.rootAbs = root + m.center);
    const pcs = [];
    for (let k = 0; k < m.size; k++) pcs.push(mod(rootAbs + k * p.stack, N));
    if (m.color && Math.random() < 0.6) pcs.push(mod(rootAbs + (Math.random() < 0.5 ? 1 : 5), N));
    this.chordPcs = [...new Set(pcs)];

    const lo = N * m.bedOct;
    this.voicing = voiceLead(this.voicing, this.chordPcs, lo, lo + N + Math.floor(N * 0.7), N);
    const dur = p.chordSpan[0] + Math.random() * (p.chordSpan[1] - p.chordSpan[0]);
    const n = this.voicing.length;
    this.voicing.forEach((a, i) => {
      play(this.e, m.bed, this.freq(a), t + Math.random() * 1.5, dur + 3, VEL[m.bed] * (0.8 + Math.random() * 0.3), this.e.bus.bed, (i / (n - 1)) * 1.2 - 0.6);
    });
    if (m.bed2 && m.bed2 !== m.bed) {
      this.voicing.slice(-2).forEach((a, i) => {
        play(this.e, m.bed2, this.freq(a + N), t + 2 + i, dur, VEL[m.bed2] * 0.6, this.e.bus.bed, i ? 0.7 : -0.7);
      });
    }
    if (m.bass) play(this.e, 'sub', this.freq(mod(rootAbs, N)), t, dur + 2, VEL.sub, this.e.bus.bass);
    // The life layer always plays; the engine decides whether you can hear it.
    [0, p.stack, p.stack * 2].forEach((o, i) => {
      play(this.e, 'shimmer', this.freq(rootAbs + o + N * 4), t + 1 + i, dur, VEL.shimmer, this.e.bus.life, i - 1);
    });
    this.e.setCarrier(this.freq(mod(rootAbs, N)));
    this.nextChord = t + dur;
  }

  // A phrase from a hull: its resonances, folded into the scale.
  giftFromModes(modeRatios, instrument, shipName) {
    const N = this.p.N;
    const motif = modeRatios.slice(0, 3 + Math.floor(Math.random() * 3)).map((r, i) => ({
      d: Math.round(Math.log2(r) * N) % (N + 3),
      dur: [1, 2, 1, 3, 1, 2][i % 6],
    }));
    motif[motif.length - 1].dur += 2;
    const gift = { motif, instrument, shipName };
    this.gifts.push(gift);
    if (!this.p.palette.includes(instrument)) this.extra.add(instrument);
    this.playPhrase(motif, instrument, this.e.ctx.currentTime + 1.5, 1.2);
    return gift;
  }

  culminate(t) {
    this.newMovement(t, true);
  }
}
