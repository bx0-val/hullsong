import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { NOISE } from './noise.js';
import { Rng } from './rng.js';
import { randomUnit, TAU, glowTexture, ringTexture } from './util.js';
import { addArtifacts, aurora } from './artifacts.js';
import { seaLife, watchers } from './entities.js';

const V3 = THREE.Vector3;
const Z = new V3(0, 0, 1);

// ---------------------------------------------------------------- hull surface

const HULL_HEAD = /* glsl */ `
uniform float uPanel, uWinDensity, uWinOn, uLife, uRadius, uStretch, uSea, uFrost;
uniform vec3 uWinColor, uLifeA, uLifeB, uSeed;
varying vec3 vObjPos;
varying vec3 vObjN;
${NOISE}
float h12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
vec2 plate(vec2 uv) {
  vec2 g = uv;
  g.x += step(1.0, mod(floor(g.y), 2.0)) * 0.5;
  vec2 c = floor(g);
  vec2 f = fract(g);
  vec2 fw = fwidth(g);
  vec2 w = fw * 1.5 + 0.02;
  vec2 e = smoothstep(vec2(0.0), w, f) * smoothstep(vec2(0.0), w, 1.0 - f);
  float line = mix(e.x * e.y, 1.0, smoothstep(0.15, 0.5, max(fw.x, fw.y)));
  return vec2(line, h12(c + uSeed.xy));
}
vec3 windows(vec2 uv) {
  vec2 g = uv * vec2(4.0, 2.0);
  vec2 c = floor(g);
  vec2 f = fract(g);
  float row = step(0.7, h12(vec2(c.y, 7.0) + uSeed.yz));
  float lit = step(1.0 - uWinDensity, h12(c + uSeed.zx));
  float shape = step(0.2, f.x) * step(f.x, 0.8) * step(0.3, f.y) * step(f.y, 0.7);
  vec2 fw = fwidth(g);
  float fade = 1.0 - smoothstep(0.2, 0.6, max(fw.x, fw.y));
  return uWinColor * row * lit * mix(0.2, shape, fade) * (0.5 + 0.5 * h12(c + 3.1));
}
`;

const HULL_COLOR = /* glsl */ `
#include <color_fragment>
vec3 hTw = pow(abs(normalize(vObjN)), vec3(4.0));
hTw /= (hTw.x + hTw.y + hTw.z);
vec3 hP = vObjPos * uPanel;
vec2 pa = plate(hP.yz), pb = plate(hP.xz), pc = plate(hP.xy);
float hLine = pa.x * hTw.x + pb.x * hTw.y + pc.x * hTw.z;
float hCell = pa.y * hTw.x + pb.y * hTw.y + pc.y * hTw.z;
diffuseColor.rgb *= (0.75 + 0.4 * hCell) * mix(0.5, 1.0, hLine);
vec3 hQ = vObjPos / vec3(1.0, uStretch, 1.0);
float hAlt = length(hQ) / uRadius;
float hN = snoise(hQ * (2.5 / uRadius) + uSeed) * 0.6 + snoise(hQ * (8.0 / uRadius) + uSeed * 1.3) * 0.3;
if (uLife > 0.0) {
  float wet = uSea > 0.0 ? smoothstep(0.1, 0.0, hAlt - uSea) : 0.5;
  float grow = smoothstep(-0.25, 0.25, hN + wet * 0.6) * uLife;
  vec3 lc = mix(uLifeA, uLifeB, smoothstep(-0.4, 0.4, hN * 1.7 + hCell * 0.3));
  diffuseColor.rgb = mix(diffuseColor.rgb, lc, grow * 0.9);
}
if (uFrost > 0.0) {
  float fr = smoothstep(0.0, 0.4, hN + (1.0 - hAlt) * 5.0) * uFrost;
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.72, 0.8, 0.88), fr);
}
`;

const HULL_EMISSIVE = /* glsl */ `
#include <emissivemap_fragment>
float hDay = 1.0;
#if NUM_DIR_LIGHTS > 0
  hDay = dot(normal, directionalLights[0].direction);
#elif NUM_POINT_LIGHTS > 0
  hDay = dot(normal, normalize(pointLights[0].position + vViewPosition));
#endif
vec3 hWin = windows(hP.yz * 6.0) * hTw.x + windows(hP.xz * 6.0) * hTw.y + windows(hP.xy * 6.0) * hTw.z;
float hCluster = mix(1.0, smoothstep(0.05, 0.35, hN), uLife);
float hNight = mix(0.35 * (1.0 - uLife), 1.0, smoothstep(0.2, -0.3, hDay));
float hDry = uLife > 0.0 ? smoothstep(uSea, uSea + 0.006, hAlt) : 1.0;
totalEmissiveRadiance += hWin * uWinOn * hCluster * hNight * hDry;
`;

function hullMaterial(color, metalness, roughness) {
  const mat = new THREE.MeshStandardMaterial({ color, metalness, roughness, flatShading: true });
  const u = {
    uPanel: { value: 0.08 },
    uWinDensity: { value: 0.05 },
    uWinOn: { value: 0 },
    uWinColor: { value: new THREE.Color(1, 0.7, 0.4) },
    uLife: { value: 0 },
    uLifeA: { value: new THREE.Color() },
    uLifeB: { value: new THREE.Color() },
    uRadius: { value: 100 },
    uStretch: { value: 1 },
    uSea: { value: -1 },
    uFrost: { value: 0 },
    uSeed: { value: new V3() },
  };
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vObjPos;\nvarying vec3 vObjN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObjPos = position;\nvObjN = normal;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${HULL_HEAD}`)
      .replace('#include <color_fragment>', HULL_COLOR)
      .replace('#include <emissivemap_fragment>', HULL_EMISSIVE);
  };
  mat.userData.u = u;
  return mat;
}

// ---------------------------------------------------------------- geometry helpers

function terraced(rng, radius, detail, stretch, opts = {}) {
  const geo = new THREE.IcosahedronGeometry(radius, detail);
  const waves = Array.from({ length: 6 }, () => ({ k: randomUnit(rng).multiplyScalar(rng.float(2, 8)), ph: rng.float(0, TAU), a: rng.float(0.3, 1) }));
  const bandFreq = rng.float(8, 18);
  const gash = !opts.noGash && rng.chance(0.55) ? { dir: randomUnit(rng), edge: rng.float(0.86, 0.94), depth: rng.float(0.15, 0.3) } : null;
  const amp = opts.amp ?? 0.035;
  // Ground radius in a unit direction (unstretched). Also used for collision.
  const height = (v) => {
    let s = 0;
    for (const w of waves) s += Math.sin(v.dot(w.k) + w.ph) * w.a;
    let h = 1 + (Math.round(s * 1.5) / 1.5) * amp;
    if (Math.abs(Math.sin(v.y * bandFreq)) > 0.95) h += 0.015;
    if (gash) {
      const g = v.dot(gash.dir);
      if (g > gash.edge) h -= gash.depth * THREE.MathUtils.smoothstep(g, gash.edge, 1);
    }
    return radius * h;
  };
  const attr = geo.attributes.position;
  const v = new V3();
  for (let i = 0; i < attr.count; i++) {
    v.fromBufferAttribute(attr, i).normalize();
    v.multiplyScalar(height(v));
    v.y *= stretch;
    if (opts.cut) {
      const d = v.dot(opts.cut.n);
      if (d > opts.cut.d) v.addScaledVector(opts.cut.n, opts.cut.d - d);
    }
    attr.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return { geo, gash, height };
}

const detailFor = (r) => (r > 1500 ? 40 : r > 500 ? 28 : r > 200 ? 18 : 10);

// The main body collides by its true shape, so you can skim it, enter its gashes, and land.
function hullCollider(ctx, height, r, stretch) {
  ctx.height = height;
  ctx.colliders.push({ type: 'hull', height, stretch, c: new V3(), r: r * 1.05 });
}

function placePart(geo, base, out, along, spin) {
  const q = new THREE.Quaternion().setFromUnitVectors(Z, out);
  if (spin) q.premultiply(spin);
  return geo.applyMatrix4(new THREE.Matrix4().compose(base.clone().addScaledVector(out, along), q, new V3(1, 1, 1)));
}

function surface(dir, r, stretch) {
  const p = dir.clone().multiplyScalar(r);
  p.y *= stretch;
  return p;
}

function anchor(ctx, pos, base, kind = '') {
  ctx.anchors.push({ pos, base, kind });
}

// Spars, modules and rings: the scaffolding most ships share.
function spars(ctx, cr, stretch, n) {
  const { rng } = ctx;
  for (let i = 0; i < n; i++) {
    const base = surface(randomUnit(rng), cr * 0.9, stretch);
    const out = base.clone().normalize();
    const len = cr * rng.float(0.3, 1.3);
    const w = cr * rng.float(0.015, 0.045);
    ctx.parts.push(placePart(new THREE.BoxGeometry(w, w, len), base, out, len / 2));
    const tip = base.clone().addScaledVector(out, len);
    if (rng.chance(0.45)) {
      ctx.parts.push(placePart(new THREE.BoxGeometry(w * 4, w * 4, w * 6), base, out, len));
      ctx.lights.push(tip.clone().addScaledVector(out, w * 3.5));
    }
    anchor(ctx, tip.clone().addScaledVector(out, cr * 0.2), tip);
  }
}

function modules(ctx, cr, stretch, n) {
  const { rng } = ctx;
  for (let i = 0; i < n; i++) {
    const dir = randomUnit(rng);
    dir.y = Math.sign(dir.y) * (0.55 + 0.45 * Math.abs(dir.y));
    dir.normalize();
    const base = surface(dir, cr * 0.97, stretch);
    const out = base.clone().normalize();
    const size = cr * rng.float(0.05, 0.16);
    const spin = new THREE.Quaternion().setFromAxisAngle(out, rng.float(0, TAU));
    ctx.parts.push(placePart(new THREE.BoxGeometry(size * rng.float(0.6, 1.6), size * rng.float(0.4, 1), size * rng.float(0.8, 2.4)), base, out, size * 0.4, spin));
    if (rng.chance(0.3)) ctx.lights.push(base.clone().addScaledVector(out, size * 1.6));
  }
}

function rings(ctx, cr, stretch, n) {
  const { rng } = ctx;
  for (let i = 0; i < n; i++) {
    const R = cr * rng.float(1.3, 2.0) * Math.max(1, stretch * 0.7);
    const tube = cr * rng.float(0.015, 0.045);
    const arc = rng.chance(0.4) ? rng.float(Math.PI * 0.8, Math.PI * 1.8) : TAU;
    const ringM = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rng.float(0, Math.PI), rng.float(0, Math.PI), 0));
    ctx.parts.push(new THREE.TorusGeometry(R, tube, 6, 96, arc).applyMatrix4(ringM));
    const struts = rng.int(2, 6);
    for (let k = 0; k < struts; k++) {
      const a = (k / struts) * arc;
      const dir = new V3(Math.cos(a), Math.sin(a), 0);
      const inner = cr * 0.85;
      ctx.parts.push(placePart(new THREE.BoxGeometry(tube, tube, R - inner), dir.clone().multiplyScalar(inner), dir, (R - inner) / 2).applyMatrix4(ringM));
    }
    const a = rng.float(0, arc);
    const onRing = new V3(Math.cos(a) * R, Math.sin(a) * R, 0).applyMatrix4(ringM);
    anchor(ctx, onRing.clone().multiplyScalar(1 + (cr * 0.15) / R), onRing);
  }
}

// ---------------------------------------------------------------- families

const BUILDERS = {
  hull(ctx) {
    const { rng, R } = ctx;
    const stretch = rng.chance(0.4) ? rng.float(1.3, 2.0) : rng.float(0.9, 1.1);
    const { geo, gash, height } = terraced(rng, R, detailFor(R), stretch);
    ctx.coreGeos.push(geo);
    Object.assign(ctx, { coreRadius: R, coreStretch: stretch });
    hullCollider(ctx, height, R, stretch);
    if (gash) anchor(ctx, surface(gash.dir, R * 1.25, stretch), surface(gash.dir, R * (1 - gash.depth), stretch), 'gash');
    spars(ctx, R, stretch, rng.int(3, 12));
    modules(ctx, R, stretch, rng.int(4, 16));
    rings(ctx, R, stretch, rng.pick([0, 0, 1, 1, 2, 3]));
  },

  spindle(ctx) {
    const { rng, R } = ctx;
    const L = R * 2;
    const rb = R * rng.float(0.14, 0.24);
    const segs = rng.int(5, 10);
    const pts = [new THREE.Vector2(0.001, -L / 2)];
    for (let k = 0; k < segs; k++) {
      const y0 = -L / 2 + (L * k) / segs;
      const y1 = -L / 2 + (L * (k + 1)) / segs;
      const r = rb * rng.pick([1, 1, 0.75, 1.2, 0.6, 0.9]);
      pts.push(new THREE.Vector2(r, y0 + L * 0.004), new THREE.Vector2(r, y1 - L * 0.004));
    }
    pts.push(new THREE.Vector2(rb * 0.35, L / 2 + rb * 0.8), new THREE.Vector2(0.001, L / 2 + rb * 2.2));
    ctx.coreGeos.push(new THREE.LatheGeometry(pts, rng.pick([8, 12, 16])).rotateX(Math.PI / 2));
    Object.assign(ctx, { coreRadius: rb, coreStretch: 1 });

    const bell = [[0.5, 0], [0.7, -0.5], [1.1, -1.5], [1.2, -1.6]].map(([r, y]) => new THREE.Vector2(rb * r, rb * y));
    ctx.parts.push(new THREE.LatheGeometry(bell, 16).rotateX(Math.PI / 2).translate(0, 0, -L / 2));

    for (let z = -L / 2; z <= L / 2 + rb; z += rb * 1.6) ctx.colliders.push({ c: new V3(0, 0, z), r: rb * 1.35 });

    for (let i = rng.int(1, 3); i > 0; i--) {
      const z = rng.float(-0.3, 0.35) * L;
      const Rr = rb * rng.float(2.2, 3.6);
      const tube = rb * rng.float(0.18, 0.32);
      const pieces = [new THREE.TorusGeometry(Rr, tube, 8, 64)];
      const spokes = rng.int(3, 6);
      for (let k = 0; k < spokes; k++) {
        const a = (k / spokes) * TAU;
        const dir = new V3(Math.cos(a), Math.sin(a), 0);
        pieces.push(placePart(new THREE.BoxGeometry(tube * 0.4, tube * 0.4, Rr - rb), dir.clone().multiplyScalar(rb), dir, (Rr - rb) / 2));
      }
      const ring = new THREE.Mesh(mergeGeometries(pieces), ctx.hullMat);
      ring.position.z = z;
      ctx.body.add(ring);
      const w = rng.float(0.05, 0.2) * (rng.chance(0.5) ? 1 : -1);
      ctx.updaters.push((t, dt) => (ring.rotation.z += w * dt));
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * TAU;
        ctx.colliders.push({ c: new V3(Math.cos(a) * Rr, Math.sin(a) * Rr, z), r: tube * 2 });
      }
      anchor(ctx, new V3(0, Rr + tube * 5, z), new V3(0, Rr + tube, z));
    }
    for (let i = rng.int(2, 8); i > 0; i--) {
      const a = rng.float(0, TAU);
      const out = new V3(Math.cos(a), Math.sin(a), 0);
      const base = out.clone().multiplyScalar(rb * 0.9).setZ(rng.float(-0.45, 0.45) * L);
      const len = rb * rng.float(0.8, 3);
      ctx.parts.push(placePart(new THREE.BoxGeometry(rb * 0.06, rb * 0.06, len), base, out, len / 2));
      ctx.lights.push(base.clone().addScaledVector(out, len));
    }
    anchor(ctx, new V3(0, 0, L / 2 + rb * 4.5), new V3(0, 0, L / 2 + rb * 2.2), 'prow');
    anchor(ctx, new V3(0, 0, -L / 2 - rb * 4), new V3(0, 0, -L / 2 - rb * 1.6), 'stern');
  },

  cathedral(ctx) {
    const { rng, R } = ctx;
    const cr = R * 0.72;
    const stretch = rng.float(0.75, 0.95);
    const { geo, height } = terraced(rng, cr, detailFor(cr), stretch, { noGash: rng.chance(0.6) });
    ctx.coreGeos.push(geo);
    Object.assign(ctx, { coreRadius: cr, coreStretch: stretch });
    hullCollider(ctx, height, cr, stretch);
    const tips = [];
    for (let i = rng.int(10, 26); i > 0; i--) {
      const dir = randomUnit(rng);
      dir.y = Math.abs(dir.y) * 0.85 + 0.15;
      dir.normalize();
      const base = surface(dir, cr * 0.95, stretch);
      const out = base.clone().normalize();
      const len = R * rng.float(0.25, 1.2) * (0.4 + 0.6 * dir.y);
      const w = len * rng.float(0.05, 0.1);
      ctx.parts.push(placePart(new THREE.ConeGeometry(w, len, rng.pick([4, 6, 8])).rotateX(Math.PI / 2), base, out, len / 2));
      ctx.parts.push(placePart(new THREE.BoxGeometry(w * 2.4, w * 2.4, w * 1.5), base, out, w * 0.5));
      tips.push({ tip: base.clone().addScaledVector(out, len), out, len });
    }
    tips.sort((a, b) => b.len - a.len);
    for (const s of tips.slice(0, 3)) {
      anchor(ctx, s.tip.clone().addScaledVector(s.out, R * 0.12), s.tip, 'spire');
      ctx.lights.push(s.tip.clone());
    }
    for (let i = rng.int(3, 8); i > 0; i--) {
      const base = surface(randomUnit(rng), cr * 0.98, stretch);
      const out = base.clone().normalize();
      const tangent = new V3().crossVectors(out, Math.abs(out.y) < 0.9 ? new V3(0, 1, 0) : new V3(1, 0, 0)).normalize();
      const a = cr * rng.float(0.15, 0.35);
      const m = new THREE.Matrix4().makeBasis(tangent, out, new V3().crossVectors(tangent, out)).setPosition(base);
      ctx.parts.push(new THREE.TorusGeometry(a, a * 0.06, 4, 20, Math.PI).applyMatrix4(m));
    }
    const keelOut = new V3(0, -1, 0);
    const keelLen = cr * rng.float(0.5, 1.1);
    ctx.parts.push(placePart(new THREE.ConeGeometry(cr * 0.08, keelLen, 6).rotateX(Math.PI / 2), surface(keelOut, cr * 0.95, stretch), keelOut, keelLen / 2));
    anchor(ctx, surface(keelOut, cr * 0.95, stretch).addScaledVector(keelOut, keelLen + R * 0.12), surface(keelOut, cr, stretch).addScaledVector(keelOut, keelLen), 'keel');
  },

  seed(ctx) {
    const { rng, R } = ctx;
    const cr = R * 0.62;
    const stretch = rng.float(1.5, 2.2);
    const { geo, height } = terraced(rng, cr, detailFor(cr), stretch, { amp: 0.02, noGash: true });
    ctx.coreGeos.push(geo);
    Object.assign(ctx, { coreRadius: cr, coreStretch: stretch });
    hullCollider(ctx, height, cr, stretch);
    const ribs = rng.int(5, 10);
    const off = rng.float(0, TAU);
    for (let i = 0; i < ribs; i++) {
      ctx.parts.push(new THREE.TorusGeometry(cr * 1.04, cr * rng.float(0.025, 0.045), 5, 48, Math.PI).rotateZ(-Math.PI / 2).scale(1, stretch, 1).rotateY((i / ribs) * TAU + off));
    }
    const top = new V3(0, cr * stretch * 0.97, 0);
    const open = rng.float(0.35, 1.1);
    const petals = rng.int(4, 8);
    for (let k = 0; k < petals; k++) {
      const a = (k / petals) * TAU;
      const dir = new V3(Math.sin(open) * Math.cos(a), Math.cos(open), Math.sin(open) * Math.sin(a));
      const len = cr * rng.float(0.6, 1.1);
      ctx.parts.push(placePart(new THREE.BoxGeometry(cr * 0.28, cr * 0.025, len), top, dir, len / 2));
      if (k % 2 === 0) anchor(ctx, top.clone().addScaledVector(dir, len + R * 0.12), top.clone().addScaledVector(dir, len), 'petal');
    }
    const down = new V3(0, -1, 0);
    const root = surface(down, cr * 0.95, stretch);
    const rootLen = cr * rng.float(0.4, 0.9);
    ctx.parts.push(placePart(new THREE.ConeGeometry(cr * 0.12, rootLen, 8).rotateX(Math.PI / 2), root, down, rootLen / 2));
    anchor(ctx, root.clone().addScaledVector(down, rootLen + R * 0.1), root.clone().addScaledVector(down, rootLen), 'root');
    ctx.lights.push(top.clone());
  },

  ring(ctx) {
    const { rng, R } = ctx;
    const Rr = R * 0.85;
    const tube = R * rng.float(0.07, 0.13);
    const hub = R * 0.16;
    ctx.coreGeos.push(new THREE.TorusGeometry(Rr, tube, 10, 160).rotateX(Math.PI / 2));
    ctx.coreGeos.push(terraced(rng, hub, 8, 1, { noGash: true }).geo);
    Object.assign(ctx, { coreRadius: hub, coreStretch: 1, spinScale: 3 });
    for (let i = rng.int(12, 40); i > 0; i--) {
      const a = rng.float(0, TAU);
      const out = new V3(Math.cos(a), 0, Math.sin(a));
      const size = tube * rng.float(0.4, 1);
      ctx.parts.push(placePart(new THREE.BoxGeometry(size * rng.float(1, 3), size, size), out.clone().multiplyScalar(Rr + tube * 0.7), out, size * 0.3));
    }
    const spokes = rng.int(3, 8);
    for (let k = 0; k < spokes; k++) {
      const a = (k / spokes) * TAU;
      const dir = new V3(Math.cos(a), 0, Math.sin(a));
      ctx.parts.push(placePart(new THREE.BoxGeometry(tube * 0.35, tube * 0.35, Rr - hub), dir.clone().multiplyScalar(hub * 0.9), dir, (Rr - hub) / 2));
      if (k < 2) anchor(ctx, dir.clone().multiplyScalar(Rr * 0.55).setY(tube * 3), dir.clone().multiplyScalar(Rr * 0.55), 'spoke');
    }
    ctx.colliders.push({ c: new V3(), r: hub * 1.2 });
    for (let k = 0; k < 36; k++) {
      const a = (k / 36) * TAU;
      ctx.colliders.push({ c: new V3(Math.cos(a) * Rr, 0, Math.sin(a) * Rr), r: tube * 1.5 });
    }
    anchor(ctx, new V3(0, hub * 2.2, 0), new V3(0, hub, 0), 'hub');
    anchor(ctx, new V3(0, -hub * 2.2, 0), new V3(0, -hub, 0), 'hub');
    const a = rng.float(0, TAU);
    anchor(ctx, new V3(Math.cos(a) * (Rr + tube * 3.5), 0, Math.sin(a) * (Rr + tube * 3.5)), new V3(Math.cos(a) * (Rr + tube), 0, Math.sin(a) * (Rr + tube)), 'rim');
  },

  shattered(ctx) {
    const { rng, R } = ctx;
    const pieces = rng.int(3, 5);
    for (let i = 0; i < pieces; i++) {
      const dir = randomUnit(rng);
      const cr = R * rng.float(0.4, 0.62);
      const center = dir.clone().multiplyScalar(R * rng.float(0.55, 0.85));
      const n = dir.clone().negate();
      const d = cr * rng.float(0.2, 0.5);
      ctx.coreGeos.push(terraced(rng, cr, detailFor(cr), 1, { cut: { n, d }, noGash: true }).geo.translate(center.x, center.y, center.z));
      ctx.colliders.push({ c: center, r: cr * 1.05 });
      if (i < 2) anchor(ctx, center.clone().addScaledVector(dir, cr * 1.4), center.clone().addScaledVector(dir, cr), 'shard');
    }
    Object.assign(ctx, { coreRadius: R * 0.5, coreStretch: 1 });
    const reactor = new THREE.Mesh(new THREE.IcosahedronGeometry(R * 0.08, 1), new THREE.MeshBasicMaterial({ color: 0xffb27a }));
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xff9a5a, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    halo.scale.setScalar(R * 0.6);
    ctx.body.add(reactor, halo);
    ctx.updaters.push((t) => {
      const k = 0.5 + 0.5 * Math.sin(t * 0.4);
      halo.material.opacity = 0.35 + 0.4 * k;
      reactor.rotation.y = t * 0.1;
    });
    anchor(ctx, new V3(0, R * 0.18, 0), new V3(0, R * 0.08, 0), 'reactor');
  },
};

// ---------------------------------------------------------------- extras

function blinkers(ctx, color) {
  const geo = new THREE.BufferGeometry().setFromPoints(ctx.lights);
  const mat = new THREE.PointsMaterial({ size: ctx.R * 0.06, map: glowTexture(), color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  ctx.body.add(new THREE.Points(geo, mat));
  const rate = ctx.rng.float(0.3, 1.1);
  const phase = ctx.rng.float(0, TAU);
  ctx.updaters.push((t) => (mat.opacity = 0.2 + 0.8 * Math.max(0, Math.sin(t * rate + phase)) ** 8));
}

function debris(ctx, count, spread) {
  const { rng, R } = ctx;
  const pivot = new THREE.Group();
  pivot.quaternion.setFromUnitVectors(new V3(0, 1, 0), randomUnit(rng));
  const inst = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), ctx.trimMat, count);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  for (let i = 0; i < count; i++) {
    const a = rng.float(0, TAU);
    const r = R * rng.float(1.5, spread);
    const s = R * (0.004 + 0.035 * rng.float() ** 2);
    q.setFromEuler(new THREE.Euler(rng.float(0, TAU), rng.float(0, TAU), 0));
    m.compose(new V3(Math.cos(a) * r, rng.float(-1, 1) * R * 0.06, Math.sin(a) * r), q, new V3(s, s * rng.float(0.5, 1.5), s));
    inst.setMatrixAt(i, m);
  }
  pivot.add(inst);
  ctx.group.add(pivot);
  const w = rng.float(0.004, 0.02) * (rng.chance(0.5) ? 1 : -1);
  ctx.updaters.push((t, dt) => (inst.rotation.y += w * dt));
}

function vent(ctx, color) {
  const { rng, R } = ctx;
  const c = rng.pick(ctx.colliders);
  const dir = randomUnit(rng);
  const origin = c.c.clone().addScaledVector(dir, c.r * 0.9);
  const n = 140;
  const seeds = new Float32Array(n).map(() => Math.random());
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
  const u = { uTime: { value: 0 }, uOrigin: { value: origin }, uDir: { value: dir }, uLen: { value: R * rng.float(0.6, 1.6) }, uSize: { value: R * 0.05 }, uColor: { value: new THREE.Color(color) } };
  const pts = new THREE.Points(
    geo,
    new THREE.ShaderMaterial({
      uniforms: u,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        attribute float aSeed;
        uniform float uTime, uLen, uSize;
        uniform vec3 uOrigin, uDir;
        varying float vA;
        void main() {
          float t = fract(uTime * 0.04 + aSeed);
          vec3 side = vec3(fract(aSeed * 91.7), fract(aSeed * 53.3), fract(aSeed * 17.9)) - 0.5;
          vec3 p = uOrigin + uDir * (t * uLen) + side * (t * uLen * 0.4);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          vA = (1.0 - t) * smoothstep(0.0, 0.05, t);
          gl_PointSize = uSize * (0.5 + t * 2.5) * (300.0 / -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        varying float vA;
        void main() {
          float a = smoothstep(0.5, 0.0, length(gl_PointCoord - 0.5)) * vA * 0.18;
          gl_FragColor = vec4(uColor * a, 1.0);
        }`,
    })
  );
  pts.frustumCulled = false;
  ctx.body.add(pts);
  ctx.updaters.push((t) => (u.uTime.value = t));
}

function searchlight(ctx, color) {
  const { rng, R } = ctx;
  const c = rng.pick(ctx.colliders);
  const out = randomUnit(rng);
  const base = c.c.clone().addScaledVector(out, c.r * 0.9);
  const towerLen = R * 0.15;
  ctx.parts.push(placePart(new THREE.BoxGeometry(R * 0.02, R * 0.02, towerLen), base, out, towerLen / 2));
  const L = R * rng.float(1.5, 3);
  // Apex (the lamp) at the pivot, widening outward along +y.
  const cone = new THREE.ConeGeometry(L * 0.13, L, 20, 1, true).rotateX(Math.PI).translate(0, L / 2, 0);
  const beam = new THREE.Mesh(
    cone,
    new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(color) } },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform vec3 uColor; varying vec2 vUv; void main() { float a = pow(vUv.y, 2.5) * 0.16; gl_FragColor = vec4(uColor * a, 1.0); }',
    })
  );
  const pivot = new THREE.Group();
  pivot.position.copy(base).addScaledVector(out, towerLen);
  pivot.quaternion.setFromUnitVectors(new V3(0, 1, 0), out);
  const arm = new THREE.Group();
  arm.rotation.z = rng.float(0.9, 1.4);
  arm.add(beam);
  const spinner = new THREE.Group();
  spinner.add(arm);
  pivot.add(spinner);
  ctx.body.add(pivot);
  ctx.lights.push(pivot.position.clone());
  const w = rng.float(0.1, 0.35);
  ctx.updaters.push((t, dt) => (spinner.rotation.y += w * dt));
}

function satellites(ctx, n, color) {
  const { rng, R } = ctx;
  for (let i = 0; i < n; i++) {
    const pivot = new THREE.Group();
    pivot.quaternion.setFromUnitVectors(new V3(0, 1, 0), randomUnit(rng));
    const s = R * rng.float(0.02, 0.05);
    const sat = new THREE.Mesh(mergeGeometries([new THREE.BoxGeometry(s, s, s * 1.6), new THREE.BoxGeometry(s * 5, s * 0.08, s * 1.2)]), ctx.trimMat);
    sat.position.x = R * rng.float(1.6, 2.6);
    const lamp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    lamp.scale.setScalar(s * 4);
    sat.add(lamp);
    pivot.add(sat);
    ctx.group.add(pivot);
    const w = rng.float(0.02, 0.07);
    ctx.updaters.push((t, dt) => {
      pivot.rotation.y += w * dt;
      lamp.material.opacity = 0.3 + 0.7 * Math.max(0, Math.sin(t * 1.3 + i)) ** 10;
    });
  }
}

const CLOUD_VERT = /* glsl */ `
  varying vec3 vObj;
  varying vec3 vWorld;
  varying vec3 vN;
  varying vec3 vView;
  void main() {
    vObj = position;
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    vN = normalize(mat3(modelMatrix) * normal);
    vView = cameraPosition - w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }`;

const CLOUD_FRAG = /* glsl */ `
  uniform float uTime, uCover, uLocal, uFlash;
  uniform vec3 uSeed, uColor, uSunDir, uFlashDir;
  varying vec3 vObj;
  varying vec3 vWorld;
  varying vec3 vN;
  varying vec3 vView;
  ${NOISE}
  void main() {
    vec3 d = normalize(vObj);
    float c = fbm(d * 3.0 + uSeed + vec3(uTime * 0.004, 0.0, uTime * 0.002));
    float c2 = fbm(d * 9.0 + uSeed * 2.0 - uTime * 0.003);
    float a = smoothstep(uCover, uCover + 0.3, c + c2 * 0.3);
    vec3 L = uLocal > 0.5 ? normalize(-vWorld) : uSunDir;
    float lit = clamp(dot(normalize(vN), L) * 0.9 + 0.25, 0.04, 1.0);
    float flash = uFlash * smoothstep(0.9, 1.0, dot(d, uFlashDir)) * (0.3 + a);
    gl_FragColor = vec4(uColor * lit + vec3(0.85, 0.9, 1.0) * flash * 2.5, a * 0.85 + flash * 0.3);
  }`;

const ATMO_FRAG = /* glsl */ `
  uniform vec3 uColor, uSunDir;
  uniform float uLocal;
  varying vec3 vWorld;
  varying vec3 vN;
  varying vec3 vView;
  void main() {
    vec3 n = normalize(vN);
    float f = pow(1.0 - abs(dot(n, normalize(vView))), 2.6);
    vec3 L = uLocal > 0.5 ? normalize(-vWorld) : uSunDir;
    float lit = clamp(dot(n, L) * 0.8 + 0.35, 0.08, 1.0);
    gl_FragColor = vec4(uColor * f * 0.6 * lit, 1.0);
  }`;

function biosphere(ctx, universe) {
  const { rng, coreRadius: cr, coreStretch: st } = ctx;
  const life = universe.life;
  const sun = { uSunDir: { value: universe.visual.starDir.clone() }, uLocal: { value: universe.star.local ? 1 : 0 } };

  const ice = universe.lifeKind === 'ice';
  const sea = new THREE.Mesh(
    new THREE.SphereGeometry(cr * 0.995, 128, 96),
    new THREE.MeshStandardMaterial({ color: life.sea, roughness: ice ? 0.6 : 0.12, metalness: 0.1, transparent: true, opacity: ice ? 0.93 : 0.8 })
  );
  sea.scale.y = st;
  sea.renderOrder = 2;
  ctx.body.add(sea);
  ctx.colliders[0].sea = cr * 0.995 + 2;

  const cu = {
    uTime: { value: 0 },
    uCover: { value: life.cover + rng.float(-0.1, 0.1) },
    uSeed: { value: new V3(rng.float(0, 30), rng.float(0, 30), rng.float(0, 30)) },
    uColor: { value: new THREE.Color(life.cloud) },
    uFlash: { value: 0 },
    uFlashDir: { value: new V3(0, 1, 0) },
    ...sun,
  };
  const clouds = new THREE.Mesh(
    new THREE.SphereGeometry(cr * 1.09, 96, 64),
    new THREE.ShaderMaterial({ uniforms: cu, vertexShader: CLOUD_VERT, fragmentShader: CLOUD_FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide })
  );
  clouds.scale.y = st;
  ctx.body.add(clouds);

  const atmo = new THREE.Mesh(
    new THREE.SphereGeometry(cr * 1.2, 64, 48),
    new THREE.ShaderMaterial({ uniforms: { uColor: { value: new THREE.Color(life.atmo) }, ...sun }, vertexShader: CLOUD_VERT, fragmentShader: ATMO_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })
  );
  atmo.scale.y = st;
  ctx.body.add(atmo);

  const stormy = universe.lifeKind !== 'ice' && rng.chance(0.75);
  let nextFlash = rng.float(5, 20);
  ctx.updaters.push((t, dt) => {
    cu.uTime.value = t;
    clouds.rotation.y += dt * 0.004;
    cu.uFlash.value *= Math.exp(-dt * 7);
    if (stormy && t > nextFlash) {
      const dir = randomUnit(rng);
      cu.uFlashDir.value.copy(dir);
      cu.uFlash.value = 1;
      setTimeout(() => (cu.uFlash.value = 0.8), 90 + Math.random() * 120);
      const p = dir.clone().multiplyScalar(cr * 1.09);
      p.y *= st;
      ctx.events.push({ type: 'flash', local: p.applyEuler(clouds.rotation) });
      nextFlash = t + (Math.random() < 0.3 ? 0.4 + Math.random() : rng.float(6, 25));
    }
  });
  if (rng.chance(0.6)) aurora(ctx, rng, life.atmo);
  ctx.sea = seaLife(ctx, rng, life, universe.lifeKind);
  // The heart sits just above the weather.
  const dir = randomUnit(rng);
  anchor(ctx, surface(dir, cr * 1.16, st), surface(dir, cr, st), 'heart');
}

function makeNode(a, echo, R, color) {
  const g = new THREE.Group();
  g.position.copy(a.pos);
  const size = Math.max(10, R * 0.06);
  const sprite = (tex, scale, opacity) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity }));
    s.scale.setScalar(scale);
    g.add(s);
    return s;
  };
  const halo = sprite(glowTexture(), size * 3, 0.35);
  const core = sprite(glowTexture(), size * 0.8, 1);
  const ring = sprite(ringTexture(), size * 2.2, 0);
  const thread = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new V3(), a.base.clone().sub(a.pos)]),
    new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  g.add(thread);
  return { object: g, halo, core, ring, thread, size, echo, progress: 0, decoded: false, phase: Math.random() * TAU, world: new V3() };
}

// ---------------------------------------------------------------- assembly

export function buildShip(spec, universe) {
  const rng = new Rng(spec.seed);
  const R = spec.radius;
  const vis = universe.visual;
  const group = new THREE.Group();
  group.position.copy(spec.position);
  group.rotation.set(rng.float(-0.35, 0.35), rng.float(0, TAU), rng.float(-0.35, 0.35));
  const body = new THREE.Group();
  group.add(body);

  const hullColor = new THREE.Color().setHSL((vis.hullHue + rng.float(-0.08, 0.08) + 1) % 1, vis.hullSat * rng.float(0.5, 1.5), rng.float(0.16, 0.3));
  if (spec.living) hullColor.offsetHSL(0, 0, -0.04);
  const hullMat = hullMaterial(hullColor, 0.45, 0.82);
  const trimMat = hullMaterial(hullColor.clone().offsetHSL(0, 0, -0.06), 0.7, 0.6);

  const ctx = { rng, R, group, body, hullMat, trimMat, colliders: [], anchors: [], lights: [], parts: [], coreGeos: [], updaters: [], events: [], spinScale: 1, playerWorld: new V3(1e9, 0, 0) };
  ctx.surfacePoint = (dir) => {
    if (ctx.height) return dir.clone().multiplyScalar(ctx.height(dir)).multiply(new V3(1, ctx.coreStretch, 1));
    const c = ctx.colliders.reduce((a, b) => (b.c.dot(dir) > a.c.dot(dir) ? b : a));
    return c.c.clone().addScaledVector(dir, c.r * 0.95);
  };
  BUILDERS[spec.family](ctx);
  addArtifacts(ctx, spec, universe);
  for (const g of ctx.coreGeos) body.add(new THREE.Mesh(g, hullMat));
  if (ctx.parts.length) body.add(new THREE.Mesh(mergeGeometries(ctx.parts), trimMat));

  const t = spec.telemetry;
  const winColor = new THREE.Color().setHSL(spec.living ? 0.1 : vis.windowHue, 0.7, 0.6);
  const frost = spec.living ? 0 : t.temp < 270 && t.moisture > 0.15 ? rng.float(0.4, 0.9) : 0;
  const seed = new V3(rng.float(0, 50), rng.float(0, 50), rng.float(0, 50));
  for (const mat of [hullMat, trimMat]) {
    const u = mat.userData.u;
    u.uPanel.value = rng.float(0.04, 0.09);
    u.uWinOn.value = spec.living ? 1 : rng.chance(0.55) ? 0.6 : 0;
    u.uWinDensity.value = spec.living ? 0.18 : rng.float(0.03, 0.18);
    u.uWinColor.value.copy(spec.living ? new THREE.Color(universe.life.lights) : winColor);
    u.uRadius.value = ctx.coreRadius;
    u.uStretch.value = ctx.coreStretch;
    u.uFrost.value = frost;
    u.uSeed.value.copy(seed);
    if (spec.living) {
      u.uLife.value = 1;
      u.uLifeA.value.set(universe.life.land[0]);
      u.uLifeB.value.set(universe.life.land[1]);
      u.uSea.value = 0.995;
    }
  }

  for (let i = rng.int(3, 10); i > 0; i--) {
    const c = rng.pick(ctx.colliders);
    ctx.lights.push(c.c.clone().addScaledVector(randomUnit(rng), c.r * 0.95));
  }
  blinkers(ctx, spec.living ? 0x9fffe0 : 0xffb070);
  debris(ctx, rng.int(10, spec.family === 'shattered' ? 140 : 50), spec.family === 'shattered' ? 2.2 : 3);
  for (let i = rng.chance(0.4) ? rng.int(1, 3) : 0; i > 0; i--) vent(ctx, spec.living ? 0xdff6ff : 0xb8c4cc);
  if (!spec.living && rng.chance(0.3)) searchlight(ctx, winColor);
  satellites(ctx, rng.int(0, 3), winColor);
  if (spec.living) biosphere(ctx, universe);
  if (spec.watchers) watchers(ctx, rng, spec.watchers);
  if (spec.shy) {
    const base = hullMat.userData.u.uWinOn.value;
    const w = new V3();
    ctx.updaters.push((t, dt) => {
      const near = ctx.playerWorld.distanceTo(group.getWorldPosition(w)) < R * 2.5;
      for (const m of [hullMat, trimMat]) {
        const u = m.userData.u.uWinOn;
        u.value += ((near ? base * 0.05 : base) - u.value) * (1 - Math.exp(-dt * (near ? 1.5 : 0.1)));
      }
    });
  }

  // Echo nodes: heart on its own anchor, the rest spread over the others.
  // Echoes with a named anchor (heart, artifacts) take it; the rest share what is left.
  const free = rng.shuffle(ctx.anchors.filter((a) => !a.kind.startsWith('art:') && a.kind !== 'heart'));
  const nodes = spec.echoes.map((echo) => {
    const want = echo.genre === 'heart' ? 'heart' : echo.anchor;
    let a = want ? ctx.anchors.find((x) => x.kind === want) : free.shift();
    if (!a) {
      const d = randomUnit(rng);
      const s = ctx.surfacePoint(d);
      a = { pos: s.clone().addScaledVector(d, R * 0.25), base: s };
    }
    if (a.space !== 'group') {
      for (const c of ctx.colliders) {
        if (c.type === 'hull') {
          const q = a.pos.clone().multiply(new V3(1, 1 / c.stretch, 1));
          const dir = q.clone().normalize();
          const min = c.height(dir) + R * 0.1;
          if (q.length() < min) a.pos = dir.multiplyScalar(min).multiply(new V3(1, c.stretch, 1));
        } else {
          const off = a.pos.clone().sub(c.c);
          if (off.length() < c.r + R * 0.08) a.pos = c.c.clone().addScaledVector(off.normalize(), c.r + R * 0.08);
        }
      }
    }
    const color = echo.genre === 'heart' ? 0x9fffe0 : echo.genre.startsWith('clue') ? 0xa8c8ff : echo.genre.startsWith('art_') ? 0xffb8d0 : 0xffd9a0;
    const node = makeNode(a, echo, R, color);
    (a.space === 'group' ? group : body).add(node.object);
    return node;
  });

  const spin = rng.float(0.003, 0.012) * (rng.chance(0.5) ? 1 : -1) * ctx.spinScale;
  const worldColliders = ctx.colliders.map((c) => ({ c: new V3(), r: c.r }));
  const inv = new THREE.Matrix4();
  const q = new V3();

  const ship = {
    spec,
    group,
    body,
    nodes,
    radius: R,
    coreRadius: ctx.coreRadius,
    coreStretch: ctx.coreStretch,
    worldColliders,
    events: ctx.events,
    leviathans: ctx.sea?.leviathans ?? [],
    updateWorld() {
      group.updateMatrixWorld(true);
      inv.copy(body.matrixWorld).invert();
      ctx.colliders.forEach((c, i) => worldColliders[i].c.copy(c.c).applyMatrix4(body.matrixWorld));
      for (const n of nodes) n.object.getWorldPosition(n.world);
    },
    // Nearest surface: distance, and enough to find the point on it.
    surfaceInfo(p) {
      let best = { dist: Infinity };
      ctx.colliders.forEach((c, i) => {
        if (c.type === 'hull') {
          q.copy(p).applyMatrix4(inv);
          q.y /= c.stretch;
          const len = q.length();
          const dir = q.clone().divideScalar(len);
          let ground = c.height(dir);
          let water = false;
          if (c.sea && c.sea > ground) {
            ground = c.sea;
            water = true;
          }
          if (len - ground < best.dist) best = { dist: len - ground, dir, ground, stretch: c.stretch, water };
        } else {
          const wc = worldColliders[i];
          const d = p.distanceTo(wc.c) - wc.r;
          if (d < best.dist) best = { dist: d, sphere: wc, from: p.clone() };
        }
      });
      return best;
    },
    surfaceDistance(p) {
      return this.surfaceInfo(p).dist;
    },
    // A world-space point `h` above the surface described by `info`, plus its up vector.
    pointAbove(info, h) {
      if (info.sphere) {
        const up = info.from.clone().sub(info.sphere.c).normalize();
        return { point: info.sphere.c.clone().addScaledVector(up, info.sphere.r + h), up, local: null };
      }
      const local = info.dir.clone().multiplyScalar(info.ground + h);
      local.y *= info.stretch;
      const upLocal = info.dir.clone();
      upLocal.y /= info.stretch;
      upLocal.normalize();
      return { point: local.clone().applyMatrix4(body.matrixWorld), up: upLocal.clone().transformDirection(body.matrixWorld), local, upLocal };
    },
    update(time, dt, near, player) {
      body.rotation.y += spin * dt;
      ctx.playerWorld.copy(player);
      for (const f of ctx.updaters) f(time, dt, near);
      for (const n of nodes) {
        const breathe = 0.5 + 0.5 * Math.sin(time * 0.8 + n.phase);
        if (n.decoded) {
          n.halo.material.opacity = 0.1;
          n.core.material.opacity = 0.3;
          n.ring.material.opacity = 0;
          n.thread.material.opacity = 0.06;
        } else {
          n.halo.material.opacity = 0.2 + 0.2 * breathe + n.progress * 0.6;
          n.core.scale.setScalar(n.size * (0.7 + 0.3 * breathe + n.progress));
          n.ring.material.opacity = n.progress > 0 ? 0.25 + 0.7 * n.progress : 0;
          n.ring.scale.setScalar(n.size * (2 + (1 - n.progress) * 3));
          n.thread.material.opacity = 0.15 + 0.2 * breathe;
        }
      }
      this.updateWorld();
    },
  };
  ship.updateWorld();
  return ship;
}
