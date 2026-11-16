// Set pieces: the things a crew left around their ship. Each registers an
// anchor ('art:<kind>') so an echo can sit inside it.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { NOISE } from './noise.js';
import { Rng } from './rng.js';
import { randomUnit, TAU, glowTexture } from './util.js';

const V3 = THREE.Vector3;
const Z = new V3(0, 0, 1);

function glowSprite(color, scale, opacity = 1) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity }));
  s.scale.setScalar(scale);
  return s;
}

// A group out beside the hull, facing away from it.
function outboard(ctx, rng, near, far) {
  const dir = randomUnit(rng);
  const holder = new THREE.Group();
  holder.position.copy(dir).multiplyScalar(ctx.R * rng.float(near, far));
  holder.quaternion.setFromUnitVectors(Z, dir);
  ctx.body.add(holder);
  return { dir, holder };
}

const KINDS = {
  sleepers(ctx, rng) {
    const { R } = ctx;
    const { dir, holder } = outboard(ctx, rng, 1.6, 2.2);
    const rows = rng.int(4, 9);
    const cols = rng.int(8, 18);
    const sp = R * 0.035;
    const pods = new THREE.InstancedMesh(new THREE.CapsuleGeometry(sp * 0.28, sp * 0.8, 3, 8), ctx.trimMat, rows * cols);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const lit = [];
    let i = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const p = new V3((c - cols / 2) * sp, (r - rows / 2) * sp * 1.7, (((c - cols / 2) * sp) ** 2 / (cols * sp)) * 0.8);
        q.setFromEuler(new THREE.Euler(rng.float(-0.08, 0.08), rng.float(-0.08, 0.08), rng.float(-0.08, 0.08)));
        pods.setMatrixAt(i++, m.compose(p, q, new V3(1, 1, 1)));
        if (rng.chance(0.05)) lit.push(p.clone().add(new V3(0, 0, sp * 0.3)));
      }
    }
    const sway = new THREE.Group();
    sway.add(pods);
    holder.add(sway);
    let litMat = null;
    if (lit.length) {
      litMat = new THREE.PointsMaterial({ size: sp * 0.8, map: glowTexture(), color: 0xffc89a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
      sway.add(new THREE.Points(new THREE.BufferGeometry().setFromPoints(lit), litMat));
    }
    ctx.updaters.push((t) => {
      sway.rotation.z = Math.sin(t * 0.02) * 0.12;
      if (litMat) litMat.opacity = 0.35 + 0.3 * Math.sin(t * 0.6);
    });
    return { pos: holder.position.clone().addScaledVector(dir, R * 0.14), base: holder.position.clone() };
  },

  tether(ctx, rng) {
    const { R } = ctx;
    const dir = randomUnit(rng);
    const base = ctx.surfacePoint(dir);
    const L = R * rng.float(1.4, 3);
    const pivot = new THREE.Group();
    pivot.position.copy(base);
    pivot.quaternion.setFromUnitVectors(Z, dir);
    const swing = new THREE.Group();
    pivot.add(swing);
    const pts = Array.from({ length: 24 }, (_, k) => new V3(Math.sin((Math.PI * k) / 23) * L * 0.08, 0, (k / 23) * L));
    swing.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 48, Math.max(0.6, R * 0.003), 4), ctx.trimMat));
    const boat = new THREE.Mesh(new THREE.CapsuleGeometry(R * 0.025, R * 0.06, 4, 8).rotateX(Math.PI / 2), ctx.trimMat);
    boat.position.z = L;
    const lamp = glowSprite(0xff8a6a, R * 0.05);
    lamp.position.set(0, R * 0.03, L);
    swing.add(boat, lamp);
    ctx.body.add(pivot);
    const ph = rng.float(0, TAU);
    ctx.updaters.push((t) => {
      swing.rotation.x = Math.sin(t * 0.05 + ph) * 0.07;
      swing.rotation.y = Math.sin(t * 0.037 + ph) * 0.05;
      lamp.material.opacity = Math.max(0, Math.sin(t * 0.9 + ph)) ** 12;
    });
    return { pos: base.clone().addScaledVector(dir, L + R * 0.1), base: base.clone().addScaledVector(dir, L) };
  },

  scaffold(ctx, rng) {
    const { R } = ctx;
    const { dir, holder } = outboard(ctx, rng, 1.7, 2.3);
    const size = R * rng.float(0.35, 0.6);
    const ribs = rng.int(5, 9);
    const parts = [];
    for (let k = 0; k < ribs; k++) {
      const x = (k / (ribs - 1) - 0.5) * size * 2.4;
      const r = size * (0.6 + 0.4 * Math.sin((Math.PI * k) / (ribs - 1)));
      parts.push(new THREE.TorusGeometry(r, size * 0.012, 4, 24, Math.PI).rotateY(Math.PI / 2).translate(x, 0, 0));
    }
    parts.push(new THREE.BoxGeometry(size * 2.5, size * 0.03, size * 0.03));
    for (let k = rng.int(3, 8); k > 0; k--) {
      parts.push(new THREE.BoxGeometry(size * rng.float(0.6, 1.8), size * 0.015, size * 0.015).translate(rng.float(-1, 1) * size, rng.float(0.2, 0.7) * size, rng.float(-0.4, 0.4) * size));
    }
    const frame = new THREE.Mesh(mergeGeometries(parts), ctx.trimMat);
    holder.add(frame);
    // Something nests in it.
    for (let k = rng.int(3, 7); k > 0; k--) {
      const egg = new THREE.Mesh(new THREE.IcosahedronGeometry(size * rng.float(0.03, 0.07), 1), new THREE.MeshStandardMaterial({ color: 0x0b0d0c, roughness: 0.4, emissive: 0x1d3a2a, emissiveIntensity: 0.6 }));
      egg.position.set(rng.float(-1, 1) * size, rng.float(0.05, 0.5) * size, rng.float(-0.3, 0.3) * size);
      egg.scale.y = 1.4;
      holder.add(egg);
    }
    return { pos: holder.position.clone(), base: holder.position.clone().addScaledVector(dir, -size * 0.3) };
  },

  sail(ctx, rng) {
    const { R } = ctx;
    const dir = randomUnit(rng);
    const base = ctx.surfacePoint(dir);
    const mast = R * rng.float(0.8, 1.4);
    const W = R * rng.float(1.2, 2.2);
    ctx.parts.push(new THREE.BoxGeometry(R * 0.012, R * 0.012, mast).applyMatrix4(new THREE.Matrix4().compose(base.clone().addScaledVector(dir, mast / 2), new THREE.Quaternion().setFromUnitVectors(Z, dir), new V3(1, 1, 1))));
    const u = { uTime: { value: 0 }, uSeed: { value: rng.float(0, 50) }, uColor: { value: new THREE.Color().setHSL(rng.float(0, 1), 0.1, 0.75) }, uAmp: { value: W * 0.03 } };
    const sail = new THREE.Mesh(
      new THREE.PlaneGeometry(W, W * 0.8, 48, 40),
      new THREE.ShaderMaterial({
        uniforms: u,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        vertexShader: /* glsl */ `
          uniform float uTime, uAmp;
          varying vec2 vUv;
          void main() {
            vUv = uv;
            vec3 p = position;
            p.z += sin(p.x * 0.01 + uTime * 0.3) * uAmp + sin(p.y * 0.017 - uTime * 0.21) * uAmp * 0.6;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
          }`,
        fragmentShader: /* glsl */ `
          uniform float uSeed;
          uniform vec3 uColor;
          varying vec2 vUv;
          ${NOISE}
          void main() {
            float n = snoise(vec3(vUv * 4.0, uSeed));
            float tear = snoise(vec3(vUv * 11.0, uSeed + 3.0)) * 0.5 + (1.0 - vUv.y) * 0.6;
            if (n > 0.45 || tear > 0.75) discard;
            float edge = smoothstep(0.45, 0.3, n) * smoothstep(0.75, 0.6, tear);
            gl_FragColor = vec4(uColor, 0.16 + 0.12 * (1.0 - edge));
          }`,
      })
    );
    const tip = base.clone().addScaledVector(dir, mast);
    const side = new V3().crossVectors(dir, Math.abs(dir.y) < 0.9 ? new V3(0, 1, 0) : new V3(1, 0, 0)).normalize();
    sail.position.copy(tip).addScaledVector(side, W * 0.55).addScaledVector(dir, -W * 0.1);
    sail.quaternion.setFromUnitVectors(Z, side.clone().cross(dir).normalize());
    ctx.body.add(sail);
    ctx.updaters.push((t) => (u.uTime.value = t));
    return { pos: sail.position.clone().addScaledVector(dir, R * 0.15), base: sail.position.clone() };
  },

  obelisk(ctx, rng) {
    const { R } = ctx;
    const { dir, holder } = outboard(ctx, rng, 1.6, 2.4);
    const h = R * rng.float(0.5, 0.9);
    const geo = new THREE.BoxGeometry(h * 0.22, h, h * 0.05);
    const slab = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x050506, roughness: 0.25, metalness: 0.85 }));
    const u = { uTime: { value: 0 }, uSeed: { value: rng.float(0, 100) } };
    const glyphs = new THREE.Mesh(
      geo,
      new THREE.ShaderMaterial({
        uniforms: u,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: /* glsl */ `
          uniform float uTime, uSeed;
          varying vec2 vUv;
          float h(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233)) + uSeed) * 43758.5453); }
          void main() {
            vec2 g = vUv * vec2(6.0, 40.0);
            vec2 c = floor(g);
            vec2 f = fract(g);
            float stroke = step(0.55, h(c)) * step(0.35, f.y) * step(f.y, 0.55) * step(0.1, f.x) * step(f.x, 0.1 + 0.8 * h(c + 7.0));
            float wave = 0.5 + 0.5 * sin(uTime * 0.5 - vUv.y * 9.0);
            gl_FragColor = vec4(vec3(0.55, 0.15, 0.1) * stroke * wave * 0.8, 1.0);
          }`,
      })
    );
    holder.add(slab, glyphs);
    ctx.updaters.push((t) => {
      holder.rotateOnAxis(new V3(0, 1, 0), 0.0005);
      u.uTime.value = t;
    });
    return { pos: holder.position.clone().addScaledVector(dir, h * 0.25), base: holder.position.clone() };
  },

  crystals(ctx, rng) {
    const { R } = ctx;
    const dir = randomUnit(rng);
    const base = ctx.surfacePoint(dir);
    const n = rng.int(25, 70);
    const mat = new THREE.MeshStandardMaterial({ color: 0xbfe6ff, emissive: 0x2a5a7a, emissiveIntensity: 0.7, transparent: true, opacity: 0.78, roughness: 0.1, metalness: 0.1, flatShading: true });
    const inst = new THREE.InstancedMesh(new THREE.OctahedronGeometry(1, 0), mat, n);
    const m = new THREE.Matrix4();
    const side = new V3().crossVectors(dir, new V3(0.3, 1, 0.2).normalize()).normalize();
    const side2 = new V3().crossVectors(dir, side);
    const reach = R * rng.float(0.4, 0.9);
    for (let i = 0; i < n; i++) {
      const along = reach * rng.float() ** 1.5;
      const spread = (reach - along) * 0.35;
      const p = base.clone().addScaledVector(dir, along).addScaledVector(side, rng.float(-1, 1) * spread).addScaledVector(side2, rng.float(-1, 1) * spread);
      const axis = dir.clone().add(randomUnit(rng).multiplyScalar(0.6)).normalize();
      const len = R * rng.float(0.03, 0.22) * (1 - (along / reach) * 0.7);
      inst.setMatrixAt(i, m.compose(p, new THREE.Quaternion().setFromUnitVectors(Z, axis), new V3(len * 0.18, len * 0.18, len)));
    }
    ctx.body.add(inst);
    return { pos: base.clone().addScaledVector(dir, reach + R * 0.1), base: base.clone().addScaledVector(dir, reach * 0.6) };
  },

  orrery(ctx, rng) {
    const { R } = ctx;
    const { dir, holder } = outboard(ctx, rng, 1.8, 2.5);
    holder.add(new THREE.Mesh(new THREE.SphereGeometry(R * 0.03, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffd7a0 })));
    holder.add(glowSprite(0xffb070, R * 0.2, 0.6));
    const rings = rng.int(3, 5);
    for (let k = 0; k < rings; k++) {
      const r = R * 0.07 * (k + 1.5);
      const g = new THREE.Group();
      g.rotation.set(rng.float(-0.5, 0.5), rng.float(0, TAU), rng.float(-0.5, 0.5));
      g.add(new THREE.Mesh(new THREE.TorusGeometry(r, R * 0.002, 4, 96).rotateX(Math.PI / 2), ctx.trimMat));
      const planets = k === rings - 1 ? 2 : 1;
      for (let j = 0; j < planets; j++) {
        const pl = new THREE.Mesh(new THREE.SphereGeometry(R * rng.float(0.008, 0.016), 12, 8), ctx.trimMat);
        const a = rng.float(0, TAU);
        pl.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
        g.add(pl);
      }
      holder.add(g);
      const w = rng.float(0.02, 0.12) / (k + 1);
      ctx.updaters.push((t, dt) => (g.rotation.y += w * dt));
    }
    return { pos: holder.position.clone().addScaledVector(dir, R * 0.08), base: holder.position.clone() };
  },

  // A chain of beacons reaching toward another hull.
  lanterns(ctx, rng, universe, spec) {
    const { R } = ctx;
    const others = universe.ships.filter((s) => s !== spec);
    const target = others.reduce((a, b) => (a.position.distanceTo(spec.position) < b.position.distanceTo(spec.position) ? a : b));
    ctx.group.updateMatrixWorld(true);
    const toward = ctx.group.worldToLocal(target.position.clone()).normalize();
    const n = rng.int(10, 20);
    const gap = Math.min(700, (target.position.distanceTo(spec.position) * 0.35) / n);
    const lamps = [];
    for (let i = 0; i < n; i++) {
      const p = toward.clone().multiplyScalar(R * 1.3 + i * gap);
      p.add(new V3(Math.sin(i * 0.7) * gap * 0.15, Math.cos(i * 0.5) * gap * 0.1, 0));
      const lamp = glowSprite(0xffcf8a, Math.max(18, R * 0.04));
      lamp.position.copy(p);
      const box = new THREE.Mesh(new THREE.BoxGeometry(R * 0.008 + 1, R * 0.008 + 1, R * 0.016 + 2), ctx.trimMat);
      box.position.copy(p);
      ctx.group.add(lamp, box);
      lamps.push(lamp);
    }
    ctx.updaters.push((t) => lamps.forEach((l, i) => (l.material.opacity = 0.15 + 0.85 * Math.max(0, Math.sin(t * 1.2 - i * 0.45)) ** 6)));
    // The chain hangs off the non-spinning group, so its echo must too.
    const last = lamps[lamps.length - 1].position;
    return { pos: last.clone().add(new V3(0, R * 0.08, 0)), base: last.clone(), space: 'group' };
  },
};

export function addArtifacts(ctx, spec, universe) {
  for (const a of spec.artifacts) {
    const at = KINDS[a.kind](ctx, new Rng(a.seed), universe, spec);
    ctx.anchors.push({ ...at, kind: `art:${a.kind}` });
  }
}

// Living hulls: curtains of light at the poles.
export function aurora(ctx, rng, color) {
  const { coreRadius: cr, coreStretch: st } = ctx;
  const u = { uTime: { value: 0 }, uColor: { value: new THREE.Color(color) }, uColor2: { value: new THREE.Color().setHSL(rng.float(0.7, 0.85), 0.8, 0.6) } };
  for (const sgn of [1, -1]) {
    if (sgn < 0 && rng.chance(0.5)) continue;
    const r = cr * rng.float(0.3, 0.45);
    const h = cr * rng.float(0.15, 0.3);
    const curtain = new THREE.Mesh(
      new THREE.CylinderGeometry(r * 1.15, r, h, 96, 1, true),
      new THREE.ShaderMaterial({
        uniforms: u,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: /* glsl */ `
          uniform float uTime;
          uniform vec3 uColor, uColor2;
          varying vec2 vUv;
          ${NOISE}
          void main() {
            float folds = snoise(vec3(vUv.x * 14.0, uTime * 0.05, 0.0)) * 0.5 + 0.5;
            float rays = pow(snoise(vec3(vUv.x * 60.0, uTime * 0.2, 1.0)) * 0.5 + 0.5, 3.0);
            float fade = pow(vUv.y, 1.6) * smoothstep(1.0, 0.85, vUv.y);
            vec3 col = mix(uColor, uColor2, vUv.y);
            gl_FragColor = vec4(col * fade * (0.15 + 0.5 * folds * rays + 0.2 * folds), 1.0);
          }`,
      })
    );
    curtain.position.y = sgn * cr * st * 1.02;
    if (sgn < 0) curtain.rotation.x = Math.PI;
    ctx.body.add(curtain);
  }
  ctx.updaters.push((t) => (u.uTime.value = t));
}
