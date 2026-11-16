import * as THREE from 'three';
import { Rng, hashString } from './rng.js';
import { generateUniverse } from './universe.js';
import { buildShip } from './ships.js';
import { createSky, createLighting, createDust } from './sky.js';
import { AudioEngine, LEVEL_NAMES, GIFT_INSTRUMENT } from './audio.js';
import { Writer, telemetryLine } from './text.js';
import { Hud } from './hud.js';
import { createDrifters, createVoidLeviathan } from './entities.js';

// ---------------------------------------------------------------- universe

const params = new URLSearchParams(location.search);
const seedStr = params.get('seed') || Math.random().toString(36).slice(2, 8);
const rng = new Rng(hashString(seedStr));
const newUniverse = () => (location.search = `?seed=${Math.random().toString(36).slice(2, 8)}`);
const universe = generateUniverse(rng.fork());

const canvas = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(65, innerWidth / innerHeight, 1, 150000);
const sky = createSky(rng.fork(), universe);
scene.add(sky.group);
scene.fog = new THREE.FogExp2(sky.tint.clone().multiplyScalar(0.25), universe.visual.fog);
createLighting(scene, universe, sky.tint);
const dust = createDust(new THREE.Color().setHSL(universe.visual.nebulaHue, 0.2, 0.65));
scene.add(dust.object);

const ships = universe.ships.map((spec) => buildShip(spec, universe));
for (const s of ships) scene.add(s.group);
const allNodes = ships.flatMap((s) => s.nodes.map((n) => ({ ship: s, node: n })));

const drifters = createDrifters(rng.fork(), universe, universe.entities.drifters);
scene.add(drifters.group);
const voidLev = universe.entities.voidLeviathan ? createVoidLeviathan(rng.fork(), sky.group, sky.tint) : null;

// Inside an atmosphere the sky closes in: a tinted dome around the camera, and thicker fog.
const haze = new THREE.Mesh(
  new THREE.SphereGeometry(1500, 32, 16),
  new THREE.MeshBasicMaterial({ color: 0, side: THREE.BackSide, transparent: true, opacity: 0, depthWrite: false, fog: false })
);
haze.renderOrder = 3;
scene.add(haze);
const baseFog = { color: scene.fog.color.clone(), density: scene.fog.density };

const writer = new Writer(rng.fork(), universe.lore, universe.visual.dread);
writer.neighbours = universe.ships.map((s) => s.id.name);
const audio = new AudioEngine(universe);
const hud = new Hud();
const journal = { record: [], ships: new Map() };
window.hullsong = { universe, ships, audio, journal, drifters, voidLev, decode: (...a) => decode(...a), land: () => toggleLand(), get ship() { return ship; }, get landed() { return landed; } }; // console debugging
 // console debugging

// ---------------------------------------------------------------- input

const keys = new Set();
const mouse = { x: 0, y: 0 };
let listening = false;
let started = false;

addEventListener('keydown', (e) => {
  if (e.code === 'Space') e.preventDefault();
  keys.add(e.code);
  if (!started || e.repeat) return;
  if (e.code === 'KeyF') {
    listening = !listening;
    document.body.classList.toggle('listening', listening);
    hud.toast(listening ? 'listening · the music steps back' : 'listening off');
  }
  if (e.code === 'KeyB') hud.toast(`binaural · ${LEVEL_NAMES[audio.cycleBeatLevel()]}`);
  if (e.code === 'KeyM') hud.toast(audio.toggleMute() ? 'muted' : 'sound on');
  if (e.code === 'KeyH') hud.toggle();
  if (e.code === 'KeyJ' || (e.code === 'Escape' && hud.journalOpen)) hud.toggleJournal(journal);
  if (e.code === 'KeyN') newUniverse();
  if (e.code === 'KeyL') toggleLand();
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => keys.clear());

const cursorEl = document.getElementById('cursor');
addEventListener('mousemove', (e) => {
  mouse.x = (e.clientX / innerWidth) * 2 - 1;
  mouse.y = (e.clientY / innerHeight) * 2 - 1;
  cursorEl.style.left = `${e.clientX}px`;
  cursorEl.style.top = `${e.clientY}px`;
});
document.addEventListener('mouseleave', () => {
  mouse.x = mouse.y = 0;
  cursorEl.style.left = '50%';
  cursorEl.style.top = '50%';
});
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ---------------------------------------------------------------- intro

document.getElementById('intro-desc').textContent = universe.description;
document.getElementById('intro-music').textContent = universe.music.describe();
document.getElementById('intro-seed').textContent = seedStr;
document.getElementById('reroll').addEventListener('click', (e) => {
  e.preventDefault();
  newUniverse();
});
document.getElementById('begin').addEventListener('click', () => {
  if (started) return;
  started = true;
  audio.start(ships, ship.pos);
  audio.drifters = drifters.list;
  document.getElementById('intro').classList.add('gone');
  setTimeout(() => hud.show(), 3000);
  setTimeout(() => document.getElementById('help').classList.add('gone'), 90000);
  setTimeout(() => hud.story([{ text: writer.opener() }, { text: 'the hulls still remember. find their echoes, hold still beside them, and listen.', cls: 'hint' }]), 3500);
});

// ---------------------------------------------------------------- ship

const CRUISE = 260;
const BOOST = 1800;
const ship = {
  pos: universe.start.pos.clone(),
  quat: new THREE.Quaternion(),
  speed: 0,
  ang: new THREE.Vector3(),
  bank: 0,
};
{
  const m = new THREE.Matrix4().lookAt(ship.pos, universe.start.look, new THREE.Vector3(0, 1, 0));
  ship.quat.setFromRotationMatrix(m);
}
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler(0, 0, 0, 'YXZ');
const fwd = new THREE.Vector3();
const up = new THREE.Vector3();
const ZAXIS = new THREE.Vector3(0, 0, 1);

function stick(v) {
  const a = Math.abs(v);
  return a < 0.06 ? 0 : Math.sign(v) * ((a - 0.06) / 0.94) ** 1.4;
}

function fly(dt) {
  let pitch = -stick(mouse.y) * 0.9;
  let yaw = -stick(mouse.x) * 1.1;
  let roll = 0;
  if (keys.has('ArrowUp')) pitch += 0.7;
  if (keys.has('ArrowDown')) pitch -= 0.7;
  if (keys.has('ArrowLeft')) yaw += 0.8;
  if (keys.has('ArrowRight')) yaw -= 0.8;
  if (keys.has('KeyQ')) roll += 1.1;
  if (keys.has('KeyE')) roll -= 1.1;
  if (!started || hud.journalOpen) {
    pitch = 0;
    yaw = started ? 0 : 0.02;
    roll = 0;
  }
  const k = 1 - Math.exp(-dt * 3);
  ship.ang.x += (pitch - ship.ang.x) * k;
  ship.ang.y += (yaw - ship.ang.y) * k;
  ship.ang.z += (roll - ship.ang.z) * k;
  tmpE.set(ship.ang.x * dt, ship.ang.y * dt, ship.ang.z * dt);
  ship.quat.multiply(tmpQ.setFromEuler(tmpE)).normalize();

  const boosting = keys.has('ShiftLeft') || keys.has('ShiftRight');
  const max = boosting ? BOOST : CRUISE;
  if (!started) ship.speed = 12;
  else if (keys.has('Space')) ship.speed *= Math.exp(-dt * 1.5);
  else if (keys.has('KeyW')) ship.speed = Math.min(max, ship.speed + (boosting ? 700 : 90) * dt);
  else if (keys.has('KeyS')) ship.speed = Math.max(0, ship.speed - 220 * dt);
  if (ship.speed > max) ship.speed = Math.max(max, ship.speed - 500 * dt);

  fwd.set(0, 0, -1).applyQuaternion(ship.quat);
  ship.pos.addScaledVector(fwd, ship.speed * dt);

  for (const s of ships) {
    if (s.group.position.distanceTo(ship.pos) > s.radius * 5) continue;
    const info = s.surfaceInfo(ship.pos);
    if (info.dist < 6) {
      ship.pos.copy(s.pointAbove(info, 6).point);
      ship.speed *= 0.98;
    }
  }
  if (universe.star.local) {
    const d = ship.pos.length();
    const min = universe.star.size * 1.5;
    if (d < min) ship.pos.multiplyScalar(min / d);
  }

  ship.bank += (-ship.ang.y * 0.35 - ship.bank) * k;
  camera.position.copy(ship.pos);
  camera.quaternion.copy(ship.quat).multiply(tmpQ.setFromAxisAngle(ZAXIS, ship.bank));
  return boosting && ship.speed > CRUISE ? (ship.speed - CRUISE) / (BOOST - CRUISE) : 0;
}

// ---------------------------------------------------------------- landing

let landed = null;
const V3 = THREE.Vector3;
const tmpQ2 = new THREE.Quaternion();

function landingSpot() {
  let best = null;
  for (const s of ships) {
    if (s.group.position.distanceTo(ship.pos) > s.radius * 5) continue;
    const info = s.surfaceInfo(ship.pos);
    if (info.dir && info.dist < 140 && (!best || info.dist < best.info.dist)) best = { s, info };
  }
  return best;
}

function toggleLand() {
  if (landed) return liftOff();
  const spot = landingSpot();
  if (!spot) return hud.toast('nothing here to land on');
  if (ship.speed > 80) return hud.toast('too fast to land');
  const { s, info } = spot;
  const at = s.pointAbove(info, info.water ? 5 : 9);
  const fw = new V3(0, 0, -1).applyQuaternion(ship.quat);
  fw.addScaledVector(at.up, -fw.dot(at.up)).normalize();
  const inv = s.body.getWorldQuaternion(tmpQ2).invert();
  landed = { s, local: at.local, upLocal: at.upLocal, fwdLocal: fw.applyQuaternion(inv), yaw: 0, pitch: 0.1, water: info.water, settle: 0, from: ship.pos.clone() };
  ship.speed = 0;
  audio.landedShip = s;
  hud.toast(info.water ? `adrift on the sea of the “${s.spec.id.name}”` : `landed on the “${s.spec.id.name}”`, 3500);
}

function liftOff() {
  const up = landed.upLocal.clone().applyQuaternion(landed.s.body.getWorldQuaternion(tmpQ2));
  ship.quat.copy(camera.quaternion);
  ship.pos.addScaledVector(up, 12);
  ship.speed = 30;
  ship.ang.set(0, 0, 0);
  ship.bank = 0;
  landed = null;
  audio.landedShip = null;
  hud.toast('lifting off');
}

// Landed: the ship rides the hull's slow turn; the mouse looks around.
function sit(dt, t) {
  const L = landed;
  const bq = L.s.body.getWorldQuaternion(tmpQ2);
  const up = L.upLocal.clone().applyQuaternion(bq);
  const pos = L.local.clone().applyMatrix4(L.s.body.matrixWorld);
  if (L.water) pos.addScaledVector(up, Math.sin(t * 0.7) * 1.2);
  L.settle = Math.min(1, L.settle + dt * 0.5);
  ship.pos.lerpVectors(L.from, pos, THREE.MathUtils.smootherstep(L.settle, 0, 1));
  if (!hud.journalOpen) {
    L.yaw -= stick(mouse.x) * dt * 0.9;
    L.pitch = THREE.MathUtils.clamp(L.pitch - stick(mouse.y) * dt * 0.7, -0.5, 1.3);
  }
  const f0 = L.fwdLocal.clone().applyQuaternion(bq);
  const side = new V3().crossVectors(f0, up).normalize();
  const look = f0.multiplyScalar(Math.cos(L.yaw)).addScaledVector(side, Math.sin(L.yaw));
  look.multiplyScalar(Math.cos(L.pitch)).addScaledVector(up, Math.sin(L.pitch));
  camera.position.copy(ship.pos);
  camera.quaternion.setFromRotationMatrix(new THREE.Matrix4().lookAt(ship.pos, ship.pos.clone().add(look), up));
  if (keys.has('KeyW')) liftOff();
}

// ---------------------------------------------------------------- echoes

let decodedCount = 0;
const lock = { node: null, prev: new THREE.Vector3() };
const totalEchoes = allNodes.length;

function decode(s, node) {
  node.decoded = true;
  node.progress = 0;
  audio.attuneNode = null;
  const spec = s.spec;
  const echo = node.echo;
  const target = echo.target != null ? ships[echo.target] : null;
  const text = writer.echo(spec, echo, target?.spec);
  decodedCount++;
  let fate = null;
  if (echo.genre === 'heart') fate = writer.finalFateLine();
  else if (decodedCount % 2 === 0) fate = writer.nextFateLine();

  const lines = [{ text: `${spec.id.type} · “${spec.id.name}”`, cls: 'title' }, { text }];
  if (fate) lines.push({ text: fate, cls: 'record' });
  hud.story(lines, spec.living ? 'alive' : '');

  if (!journal.ships.has(spec)) journal.ships.set(spec, []);
  journal.ships.get(spec).push(text);
  if (fate) journal.record.push(fate);

  if (target && !target.spec.known) {
    target.spec.known = true;
    setTimeout(() => hud.toast(`bearing logged · “${target.spec.id.name}”`, 4000), 1500);
  }
  const instrument = spec.living ? 'glass' : GIFT_INSTRUMENT[spec.family];
  audio.composer.giftFromModes(audio.soundOf(s).ratios, instrument, spec.id.name);
  setTimeout(() => hud.toast(`a phrase from “${spec.id.name}” joins the music`, 3500), 6000);
  if (echo.genre === 'heart') {
    audio.composer.culminate(audio.ctx.currentTime + 1);
    setTimeout(() => hud.toast('everything you carried, at once', 5000), 11000);
  }
}

// ---------------------------------------------------------------- markers

for (const s of ships) s.marker = hud.marker('ship');
for (const { node } of allNodes) node.marker = hud.marker('echo');
const proj = new THREE.Vector3();
function project(p) {
  proj.copy(p).project(camera);
  if (proj.z > 1 || Math.abs(proj.x) > 1.05 || Math.abs(proj.y) > 1.05) return null;
  return [(proj.x * 0.5 + 0.5) * innerWidth, (-proj.y * 0.5 + 0.5) * innerHeight];
}

// ---------------------------------------------------------------- loop

const clock = new THREE.Clock();
let hudClock = 0;

function frame() {
  const dt = Math.min(clock.getDelta(), 0.1);
  const t = clock.elapsedTime;
  const boost = landed ? 0 : fly(dt);

  let p = 0;
  let lp = 0;
  let metCount = 0;
  for (const s of ships) {
    const spec = s.spec;
    const dist = s.surfaceDistance(ship.pos);
    const near = THREE.MathUtils.clamp(1 - dist / (s.radius * 6), 0, 1);
    p = Math.max(p, near);
    if (spec.living) lp = Math.max(lp, THREE.MathUtils.clamp(1 - dist / (s.radius * 10), 0, 1));
    s.update(t, dt, near, ship.pos);
    for (const e of s.events.splice(0)) if (e.type === 'flash' && started) audio.thunder(s.body.localToWorld(e.local.clone()), s.radius * 0.8);

    if (started) {
      if (!spec.living && dist < 2500 + s.radius * 12) spec.known = true;
      if (spec.living && dist < s.radius * 8) spec.known = true;
      if (!spec.met && dist < s.radius * 3) {
        spec.met = true;
        hud.note([{ text: `${spec.id.type} · “${spec.id.name}” · ${spec.id.designation}`, cls: 'title' }, { text: telemetryLine(spec.telemetry) }], spec.living ? 'alive' : '');
      }
    }
    if (spec.met) metCount++;

    const at = started && spec.known && dist > s.radius * 1.5 ? project(s.group.position) : null;
    const km = (dist / 1000).toFixed(1);
    hud.placeMarker(s.marker, at?.[0], at?.[1], listening ? 0.95 : spec.met ? 0.55 : 0.35, spec.met ? `${spec.id.name} · ${km}k` : `${km}k`, {
      met: !!spec.met,
      alive: spec.living && !!spec.met,
    });
  }

  if (landed) sit(dt, t);

  // Atmosphere: how deep inside a living world's air are we?
  let air = 0;
  let airColor = null;
  for (const s of ships) {
    if (!s.spec.living || s.group.position.distanceTo(ship.pos) > s.radius * 2) continue;
    const a = THREE.MathUtils.clamp(1 - s.surfaceDistance(ship.pos) / (s.coreRadius * 0.22), 0, 1);
    if (a > air) {
      air = a;
      const up = ship.pos.clone().sub(s.group.position).normalize();
      const light = universe.star.local ? ship.pos.clone().negate().normalize() : universe.visual.starDir;
      const day = THREE.MathUtils.clamp(up.dot(light) * 0.7 + 0.35, 0.04, 1);
      airColor = new THREE.Color(universe.life.atmo).multiplyScalar(0.45 * day);
    }
  }
  haze.position.copy(camera.position);
  haze.material.opacity = air * 0.75;
  if (airColor) haze.material.color.copy(airColor);
  scene.fog.color.copy(baseFog.color).lerp(airColor ?? baseFog.color, air);
  scene.fog.density = baseFog.density + air * 0.0006;

  // Attunement: hold space near an echo; your beat glides to its frequency.
  let cand = null;
  let candShip = null;
  let candD = Infinity;
  for (const { ship: s, node } of allNodes) {
    const d = node.world.distanceTo(ship.pos);
    const show = started && d < 2500 && (s.spec.known || d < 900);
    const at = show ? project(node.world) : null;
    hud.placeMarker(node.marker, at?.[0], at?.[1], node.decoded ? 0.3 : 0.75, !node.decoded && d < 700 ? `${node.echo.freq} Hz` : '', { decoded: node.decoded });
    if (node.decoded) continue;
    const range = Math.min(260, Math.max(80, s.radius * 0.25));
    if (d < range && d < candD) {
      cand = node;
      candShip = s;
      candD = d;
    }
  }
  let attune = null;
  if (lock.node && lock.node !== cand) lock.node = null;
  const holding = started && keys.has('Space') && !hud.journalOpen;
  if (cand) {
    const slow = ship.speed < 45;
    if (holding && slow) {
      if (lock.node === cand && !landed) ship.pos.add(cand.world.clone().sub(lock.prev));
      lock.node = cand;
      lock.prev.copy(cand.world);
      camera.position.copy(ship.pos);
      attune = cand.echo.freq;
      audio.attuneNode = cand;
      cand.progress = Math.min(1, cand.progress + dt * (audio.attuneMatched ? 1 / 6 : 1 / 45));
      hud.attunePrompt(audio.attuneMatched ? 'listening…' : `tuning ${audio.beatHz.toFixed(1)} → ${cand.echo.freq} Hz`, cand.progress);
      if (cand.progress >= 1) decode(candShip, cand);
    } else {
      audio.attuneNode = null;
      hud.attunePrompt(holding ? 'too fast · let go of thrust' : `echo · ${cand.echo.freq} Hz · hold space to attune`, cand.progress);
    }
  } else {
    audio.attuneNode = null;
    if (landed) hud.attunePrompt(`${landed.water ? 'adrift' : 'landed'} · L or W to lift off`, 0);
    else if (started && ship.speed < 80 && landingSpot()) hud.attunePrompt('L · land', 0);
    else hud.attunePrompt(null);
  }
  for (const { node } of allNodes) if (node !== audio.attuneNode) node.progress = Math.max(0, node.progress - dt / 25);

  sky.update(camera);
  dust.update(camera);
  drifters.update(t, dt, ship.pos);
  if (voidLev) {
    voidLev.update(t, dt);
    if (audio.void) {
      audio.void.presence = voidLev.state.presence;
      audio.void.dir = voidLev.state.dir;
    }
  }
  fwd.set(0, 0, -1).applyQuaternion(camera.quaternion);
  up.set(0, 1, 0).applyQuaternion(camera.quaternion);
  audio.setListener(ship.pos, fwd, up);
  audio.update({ speed01: Math.min(1, ship.speed / CRUISE), p, lp, boost, listen: listening, attune, landed: !!landed }, dt);

  hudClock += dt;
  if (started && hudClock > 0.08) {
    hudClock = 0;
    hud.beat(audio, listening, t);
    hud.statusLines([
      `echoes ${decodedCount} / ${totalEchoes}`,
      `hulls met ${metCount} / ${ships.length}`,
      `drift ${Math.round(ship.speed)}`,
      `${seedStr} · ${universe.music.scaleName}`,
    ]);
  }

  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
