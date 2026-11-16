import * as THREE from 'three';
import { makeCulture, makeLore, shipIdentity } from './text.js';
import { makeMusicProfile } from './music.js';
import { randomUnit, TAU } from './util.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

export const STARS = {
  yellow: { label: 'a yellow star', color: 0xffe2b0, lum: 2.6, size: 1500 },
  red: { label: 'a red giant', color: 0xff8a5c, lum: 1.8, size: 3000 },
  white: { label: 'a white dwarf', color: 0xdfe8ff, lum: 2.8, size: 600 },
  blue: { label: 'a blue star', color: 0xa8c4ff, lum: 3.0, size: 1300 },
  dim: { label: 'a dying ember', color: 0xd09878, lum: 0.9, size: 900 },
};

export const LIFE = {
  ocean: { sea: 0x0e3a5c, land: [0x3c6b3a, 0x7a7448], cloud: 0xffffff, atmo: 0x6fb4ff, lights: 0xffc27a, cover: 0.15 },
  amber: { sea: 0x5a2d12, land: [0x9a5a22, 0x6b7a2a], cloud: 0xf2d6a8, atmo: 0xffb070, lights: 0xfff0b0, cover: 0.0 },
  ice: { sea: 0x9fc4d8, land: [0x4a7a78, 0xb8d0d0], cloud: 0xeef6ff, atmo: 0xbfe4ff, lights: 0x9fffe8, cover: 0.3 },
  murk: { sea: 0x16301e, land: [0x4f6a22, 0x2e4a2a], cloud: 0xc9d39a, atmo: 0x9fd08a, lights: 0xc8ff9a, cover: -0.1 },
};

const FAMILIES = ['hull', 'spindle', 'cathedral', 'seed', 'ring', 'shattered'];
const LIVING_FAMILIES = ['hull', 'seed', 'cathedral'];

function place(rng, ships, gen, radius, gap) {
  let pos;
  for (let i = 0; i < 300; i++) {
    pos = gen();
    if (ships.every((s) => s.position.distanceTo(pos) > (s.radius + radius) * 2.5 + gap)) break;
  }
  return pos;
}

const LAYOUTS = {
  orbit(rng) {
    const ships = [];
    const n = rng.int(6, 10);
    let r = rng.float(2600, 3400);
    for (let i = 0; i < n; i++) {
      const a = rng.float(0, TAU);
      ships.push({ position: V(Math.cos(a) * r, rng.float(-200, 200), Math.sin(a) * r), radius: rng.float(70, 230) });
      r += rng.float(1500, 2500);
    }
    return { ships, living: [rng.chance(0.75) ? 2 : rng.int(1, n - 1)], localStar: true, label: 'in orbit around' };
  },
  procession(rng) {
    const ships = [];
    const n = rng.int(10, 15);
    let p = V(0, 0, 0);
    const dir = V(rng.float(-1, 1), rng.float(-0.15, 0.15), rng.float(-1, 1)).normalize();
    for (let i = 0; i < n; i++) {
      const radius = i === 0 ? rng.float(260, 360) : rng.float(60, 200);
      ships.push({ position: p.clone(), radius });
      dir.add(V(rng.float(-0.25, 0.25), rng.float(-0.06, 0.06), rng.float(-0.25, 0.25))).normalize();
      p = p.clone().addScaledVector(dir, rng.float(1300, 2000) + radius * 2).add(V(rng.float(-300, 300), rng.float(-120, 120), rng.float(-300, 300)));
    }
    return { ships, living: [rng.int(Math.floor(n / 2), n - 1)], label: 'a frozen procession beneath' };
  },
  graveyard(rng) {
    const ships = [];
    const n = rng.int(16, 22);
    for (let i = 0; i < n; i++) {
      const radius = i < 2 ? rng.float(150, 220) : rng.float(30, 120);
      ships.push({ radius, position: place(rng, ships, () => randomUnit(rng).multiplyScalar(4800 * rng.float() ** 0.6).multiply(V(1, 0.5, 1)), radius, 250) });
    }
    return { ships, living: [rng.int(0, 1)], label: 'a graveyard of small hulls beneath' };
  },
  scatter(rng) {
    const ships = [];
    const n = rng.int(9, 13);
    for (let i = 0; i < n; i++) {
      const radius = rng.float(60, 240);
      ships.push({ radius, position: place(rng, ships, () => randomUnit(rng).multiplyScalar(rng.float(1500, 10000)).multiply(V(1, 0.45, 1)), radius, 800) });
    }
    const living = [rng.int(1, n - 1)];
    if (rng.chance(0.2)) living.push((living[0] + 1 + rng.int(0, n - 3)) % n || 1);
    return { ships, living, label: 'scattered wide beneath' };
  },
  wreck(rng) {
    const ships = [{ position: V(0, 0, 0), radius: rng.float(800, 1100), mother: true }];
    const n = rng.int(6, 9);
    for (let i = 0; i < n; i++) {
      const radius = rng.float(50, 180);
      ships.push({ radius, position: place(rng, ships, () => randomUnit(rng).multiplyScalar(rng.float(3200, 7500)).multiply(V(1, 0.5, 1)), radius, 600) });
    }
    return { ships, living: [rng.chance(0.4) ? 0 : rng.int(1, n)], label: 'the wreck of a colossus beneath' };
  },
};

function telemetry(rng, living, nearMiss) {
  if (living) return { temp: rng.int(274, 303), moisture: rng.float(0.55, 0.85), pressure: rng.float(0.6, 1.3) };
  if (nearMiss) {
    const t = { temp: rng.int(274, 300), moisture: rng.float(0.5, 0.7), pressure: rng.float(0.6, 1), nearMiss: true };
    if (rng.chance(0.5)) t.temp = rng.int(250, 268);
    else t.moisture = rng.float(0.32, 0.46);
    return t;
  }
  const t = { temp: rng.int(180, 330), moisture: rng.float(0.05, 0.5), pressure: rng.float(0.1, 1) };
  const flaw = rng.int(0, 3);
  if (flaw === 0) t.temp = rng.int(3, 120);
  if (flaw === 1) t.temp = rng.int(380, 900);
  if (flaw === 2) t.moisture = rng.float(0, 0.03);
  if (flaw === 3) t.pressure = 0;
  return t;
}


export function generateUniverse(rng) {
  const culture = makeCulture(rng.fork());
  const lore = makeLore(rng.fork(), culture);
  const music = makeMusicProfile(rng.fork());
  const archetype = rng.weighted([['orbit', 3], ['procession', 2], ['graveyard', 2], ['scatter', 2], ['wreck', 2]]);
  const layout = LAYOUTS[archetype](rng);
  // Worlds are large; the space between them larger.
  for (const s of layout.ships) {
    s.radius *= 2.5;
    s.position.multiplyScalar(2.2);
  }
  const starKind = rng.pick(Object.keys(STARS));
  const lifeKind = rng.pick(Object.keys(LIFE));
  const dominant = rng.shuffle(FAMILIES).slice(0, 2);

  const visual = {
    nebulaHue: rng.float(0, 1),
    nebulaSpread: rng.float(0.15, 0.4),
    nebulaStrength: rng.float(0.5, 1.6),
    fog: rng.pick([0.00003, 0.00006, 0.0001]),
    hullHue: rng.float(0, 1),
    hullSat: rng.float(0.02, 0.16),
    windowHue: rng.pick([0.08, 0.1, 0.13, 0.55, 0.5]),
    starDir: randomUnit(rng),
    binary: rng.chance(0.2),
    dread: rng.float(0.3, 1),
  };

  const ships = layout.ships.map((s, i) => {
    const r = rng.fork();
    const living = layout.living.includes(i);
    const nearMiss = !living && r.chance(0.18);
    let family;
    if (living) family = r.pick(dominant.filter((f) => LIVING_FAMILIES.includes(f)).concat(LIVING_FAMILIES));
    else if (s.mother) family = r.pick(['hull', 'cathedral', 'ring']);
    else family = r.weighted(FAMILIES.map((f) => [f, dominant.includes(f) ? 5 : 1]));
    const tele = telemetry(r, living, nearMiss);
    const artifacts = [];
    if (!living) {
      const kinds = [['sleepers', 2], ['tether', 2], ['scaffold', 1.5], ['sail', 1.5], ['obelisk', 0.6], ['orrery', 1], ['lanterns', 1.5]];
      if (tele.temp < 270 || nearMiss) kinds.push(['crystals', 3]);
      for (let k = s.mother ? r.int(3, 4) : r.int(1, 2); k > 0; k--) {
        const kind = r.weighted(kinds.filter(([kk]) => !artifacts.some((a) => a.kind === kk)));
        artifacts.push({ kind, seed: (r.next() * 4294967296) >>> 0 });
      }
    }
    const echoes = [];
    if (living) {
      for (let k = r.int(2, 4); k > 0; k--) echoes.push({ genre: 'living' });
      echoes.push({ genre: 'heart' });
    } else {
      if (nearMiss) echoes.push({ genre: 'nearMiss' });
      for (const a of artifacts) if (r.chance(0.75)) echoes.push({ genre: `art_${a.kind}`, anchor: `art:${a.kind}` });
      for (let k = r.int(1, s.mother ? 4 : 2); k > 0; k--) echoes.push({ genre: 'any' });
    }
    for (const e of echoes) e.freq = Math.round(r.float(3.5, 11) * 2) / 2;
    return {
      ...s,
      index: i,
      seed: (r.next() * 4294967296) >>> 0,
      living,
      nearMiss,
      family,
      id: shipIdentity(r, culture, family),
      telemetry: tele,
      echoes,
      artifacts,
      shy: !living && r.chance(0.4),
      watchers: !living && r.chance(0.45) ? r.int(1, 3) : 0,
      known: false,
    };
  });

  // Clues: living hulls are hidden, but a few sterile hulls remember them.
  const sterile = ships.filter((s) => !s.living);
  for (const target of ships) {
    const carriers = rng.shuffle(sterile.filter((s) => s !== target)).slice(0, target.living ? 2 : rng.chance(0.2) ? 1 : 0);
    for (const c of carriers) c.echoes.push({ genre: target.living ? 'clueLiving' : 'clueSterile', target: target.index, freq: Math.round(rng.float(3.5, 11) * 2) / 2 });
  }

  // Start beside a modest sterile hull, looking at it.
  const anchor = rng.pick(sterile.filter((s) => s.radius < 300)) ?? sterile[0];
  const out = anchor.position.clone().normalize();
  const entities = { drifters: rng.int(2, 3 + Math.round(visual.dread * 5)), voidLeviathan: rng.chance(0.35 + visual.dread * 0.5) };
  if (out.lengthSq() < 0.5) out.set(0, 0, 1);
  out.add(V(rng.float(-0.4, 0.4), rng.float(-0.2, 0.2), rng.float(-0.4, 0.4))).normalize();
  const start = { pos: anchor.position.clone().addScaledVector(out, anchor.radius * 5 + 700), look: anchor.position.clone() };
  anchor.known = true;

  const star = { kind: starKind, ...STARS[starKind], local: !!layout.localStar };
  return {
    archetype,
    culture,
    lore,
    music,
    star,
    lifeKind,
    life: LIFE[lifeKind],
    visual,
    ships,
    start,
    entities,
    description: `${ships.length} hulls, ${layout.label} ${star.label}${visual.binary ? ' and its twin' : ''}`,
  };
}
