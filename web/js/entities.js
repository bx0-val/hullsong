// Things that live here, or seem to. None of them can be reached.

import * as THREE from 'three';
import { NOISE } from './noise.js';
import { randomUnit, TAU, glowTexture } from './util.js';

const V3 = THREE.Vector3;

// ---------------------------------------------------------------- leviathan body

// A cylinder bent into a swimming body by the vertex shader. Length runs along z.
const BODY_VERT = /* glsl */ `
  uniform float uTime, uLen, uRad, uSwim, uPhase;
  varying float vS;
  varying float vAng;
  varying vec3 vN;
  varying vec3 vV;
  void main() {
    float s = position.y + 0.5;
    float ang = atan(position.z, position.x);
    float taper = pow(sin(3.14159 * clamp(s * 0.92 + 0.04, 0.0, 1.0)), 0.7) * (1.0 + 0.35 * smoothstep(0.7, 0.88, s));
    float sway = sin(s * 8.0 - uTime * uSwim + uPhase) * uLen * 0.05 * (1.15 - s);
    vec3 p = vec3(position.x * uRad * taper + sway, position.z * uRad * taper * 0.75, (s - 0.5) * uLen);
    vS = s;
    vAng = ang;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vV = -mv.xyz;
    vN = normalize(normalMatrix * vec3(position.x, position.z * 0.75, 0.0));
    gl_Position = projectionMatrix * mv;
  }`;

const BODY_FRAG = /* glsl */ `
  uniform vec3 uColor, uGlow, uRim;
  uniform float uTime;
  varying float vS;
  varying float vAng;
  varying vec3 vN;
  varying vec3 vV;
  float h(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
  void main() {
    float rim = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.5);
    vec2 cell = floor(vec2(vS * 70.0, vAng * 3.0));
    float spot = step(0.975, h(cell)) * max(0.0, sin(uTime * 0.6 + h(cell + 3.0) * 20.0)) * 0.6;
    float eyes = smoothstep(0.955, 0.965, vS) * smoothstep(0.975, 0.965, vS) * step(0.6, abs(sin(vAng)));
    gl_FragColor = vec4(uColor + uRim * rim + uGlow * (spot + eyes * 2.0), 1.0);
  }`;

function bodyMaterial(len, rad, color, glow, rim, swim) {
  const u = {
    uTime: { value: 0 },
    uLen: { value: len },
    uRad: { value: rad },
    uSwim: { value: swim },
    uPhase: { value: Math.random() * TAU },
    uColor: { value: new THREE.Color(color) },
    uGlow: { value: new THREE.Color(glow) },
    uRim: { value: new THREE.Color(rim) },
  };
  return { u, mat: new THREE.ShaderMaterial({ uniforms: u, vertexShader: BODY_VERT, fragmentShader: BODY_FRAG }) };
}

const bodyGeo = new THREE.CylinderGeometry(1, 1, 1, 14, 96, true);

// ---------------------------------------------------------------- under the sea

// Leviathans circle beneath the water and sink away when you come close.
// Shoals glint just under the surface and scatter.
export function seaLife(ctx, rng, life, kind) {
  const { coreRadius: cr, coreStretch: st, body } = ctx;
  const sea = cr * 0.995;
  const out = { leviathans: [] };

  for (let i = rng.int(1, 3); i > 0; i--) {
    const len = cr * rng.float(0.45, 0.95);
    const rad = len * rng.float(0.03, 0.05);
    const { u, mat } = bodyMaterial(len, rad, 0x020405, kind === 'amber' ? 0xffa060 : 0x6fffe0, 0x0a1a1c, rng.float(0.6, 1.2));
    const mesh = new THREE.Mesh(bodyGeo, mat);
    mesh.frustumCulled = false;
    const pivot = new THREE.Group();
    pivot.rotation.set(rng.float(0, TAU), rng.float(0, TAU), 0);
    pivot.scale.y = st;
    pivot.add(mesh);
    body.add(pivot);
    const top = sea - rad * 2.5;
    const lev = { mesh, pivot, depth: top - rng.float(0, cr * 0.03), speed: rng.float(12, 35) / sea, top, low: sea - cr * 0.06, world: new V3(), len };
    mesh.position.y = lev.depth;
    out.leviathans.push(lev);
    ctx.updaters.push((t, dt) => {
      u.uTime.value = t;
      pivot.rotation.x += lev.speed * dt;
      pivot.rotation.y += lev.speed * 0.1 * dt;
      mesh.getWorldPosition(lev.world);
      // Rise toward the surface slowly; dive if anything comes near.
      const close = lev.world.distanceTo(ctx.playerWorld) < len * 1.2;
      const target = close ? lev.low : top - (0.5 + 0.5 * Math.sin(t * 0.01 + i)) * cr * 0.025;
      lev.depth += (target - lev.depth) * (1 - Math.exp(-dt * (close ? 0.6 : 0.05)));
      mesh.position.y = lev.depth;
    });
  }

  for (let i = rng.int(3, 6); i > 0; i--) {
    const n = 220;
    const seeds = new Float32Array(n).map(() => Math.random());
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
    const u = { uTime: { value: 0 }, uSpread: { value: cr * rng.float(0.02, 0.05) }, uDepth: { value: sea - cr * 0.006 }, uSize: { value: Math.max(1.5, cr * 0.004) }, uColor: { value: new THREE.Color(kind === 'amber' ? 0xffe0a0 : 0xbff6ff) } };
    const pts = new THREE.Points(
      geo,
      new THREE.ShaderMaterial({
        uniforms: u,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        vertexShader: /* glsl */ `
          attribute float aSeed;
          uniform float uTime, uSpread, uDepth, uSize;
          varying float vA;
          void main() {
            float a = aSeed * 6.2831 * 7.0 + uTime * (0.3 + fract(aSeed * 13.0) * 0.6);
            float r = uSpread * (0.2 + fract(aSeed * 7.3) * 0.8);
            vec3 p = vec3(cos(a) * r, uDepth - fract(aSeed * 3.7) * uSpread * 0.3, sin(a) * r * 0.6 + sin(uTime * 0.5 + aSeed * 20.0) * uSpread * 0.1);
            vec4 mv = modelViewMatrix * vec4(p, 1.0);
            vA = pow(0.5 + 0.5 * sin(uTime * 5.0 + aSeed * 80.0), 6.0);
            gl_PointSize = clamp(uSize * 300.0 / -mv.z, 0.0, 6.0);
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: /* glsl */ `
          uniform vec3 uColor;
          varying float vA;
          void main() {
            float a = smoothstep(0.5, 0.0, length(gl_PointCoord - 0.5)) * vA;
            gl_FragColor = vec4(uColor * a, 1.0);
          }`,
      })
    );
    pts.frustumCulled = false;
    pts.renderOrder = 1;
    const pivot = new THREE.Group();
    pivot.rotation.set(rng.float(0, TAU), rng.float(0, TAU), 0);
    pivot.scale.y = st;
    pivot.add(pts);
    body.add(pivot);
    const base = rng.float(0.004, 0.012);
    let flee = 0;
    const w = new V3();
    ctx.updaters.push((t, dt) => {
      u.uTime.value = t;
      pts.getWorldPosition(w);
      const d = w.distanceTo(ctx.playerWorld);
      flee = Math.max(flee - dt * 0.2, d < u.uSpread.value * 6 ? 1 : 0);
      pivot.rotation.x += (base + flee * 0.05) * dt;
    });
  }
  return out;
}

// ---------------------------------------------------------------- drifters

// Pale bells hanging in the void between hulls. They keep their distance.
export function createDrifters(rng, universe, count) {
  const group = new THREE.Group();
  const hue = (universe.visual.nebulaHue + rng.float(0.3, 0.7)) % 1;
  const list = [];
  const extent = universe.ships.reduce((m, s) => Math.max(m, s.position.length()), 0) + 6000;
  const place = (d) => {
    for (let k = 0; k < 50; k++) {
      d.pos.copy(randomUnit(rng).multiplyScalar(rng.float(3000, extent))).multiply(new V3(1, 0.5, 1));
      if (universe.ships.every((s) => s.position.distanceTo(d.pos) > s.radius * 4 + 1500)) return;
    }
  };
  for (let i = 0; i < count; i++) {
    const S = rng.float(150, 650);
    const u = { uTime: { value: 0 }, uColor: { value: new THREE.Color().setHSL((hue + rng.float(-0.06, 0.06) + 1) % 1, 0.5, 0.65) }, uAlpha: { value: 0 }, uPhase: { value: rng.float(0, TAU) } };
    const bell = new THREE.Mesh(
      new THREE.SphereGeometry(S, 40, 20, 0, TAU, 0, Math.PI * 0.55),
      new THREE.ShaderMaterial({
        uniforms: u,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        vertexShader: /* glsl */ `
          uniform float uTime, uPhase;
          varying vec3 vN;
          varying vec3 vV;
          varying vec3 vP;
          void main() {
            vec3 p = position;
            float pulse = sin(uTime * 0.7 + uPhase);
            p.xz *= 1.0 + 0.09 * pulse;
            p.y *= 0.7 - 0.05 * pulse;
            vP = position;
            vec4 mv = modelViewMatrix * vec4(p, 1.0);
            vV = -mv.xyz;
            vN = normalize(normalMatrix * normal);
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: /* glsl */ `
          uniform vec3 uColor;
          uniform float uAlpha, uTime;
          varying vec3 vN;
          varying vec3 vV;
          varying vec3 vP;
          ${NOISE}
          void main() {
            float rim = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 1.8);
            float veins = pow(1.0 - abs(snoise(normalize(vP) * 4.0 + uTime * 0.03)), 8.0);
            gl_FragColor = vec4(uColor * (rim * 0.6 + veins * 0.5) * uAlpha, 1.0);
          }`,
      })
    );
    const tGeo = [];
    for (let k = rng.int(8, 14); k > 0; k--) {
      const a = rng.float(0, TAU);
      const r = S * rng.float(0.2, 0.9);
      const len = S * rng.float(2, 4.5);
      const pts = [];
      const ts = [];
      for (let j = 0; j <= 30; j++) {
        pts.push(Math.cos(a) * r, -(j / 30) * len, Math.sin(a) * r);
        ts.push(j / 30);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      g.setAttribute('aT', new THREE.Float32BufferAttribute(ts, 1));
      tGeo.push(g);
    }
    const tMat = new THREE.ShaderMaterial({
      uniforms: u,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        attribute float aT;
        uniform float uTime, uPhase;
        varying float vT;
        void main() {
          vec3 p = position;
          p.x += sin(uTime * 0.6 + aT * 5.0 + uPhase + position.z * 0.01) * aT * 60.0;
          p.z += cos(uTime * 0.5 + aT * 4.0 + uPhase) * aT * 60.0;
          vT = aT;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        uniform float uAlpha;
        varying float vT;
        void main() { gl_FragColor = vec4(uColor * (1.0 - vT) * 0.5 * uAlpha, 1.0); }`,
    });
    const holder = new THREE.Group();
    holder.add(bell);
    for (const g of tGeo) holder.add(new THREE.Line(g, tMat));
    group.add(holder);
    const d = { holder, u, pos: holder.position, vel: randomUnit(rng).multiplyScalar(rng.float(5, 20)), alpha: 0, base: rng.float(0.5, 1), size: S, nextSong: 0 };
    place(d);
    list.push(d);
  }

  const away = new V3();
  const jitter = new V3();
  return {
    group,
    list,
    update(t, dt, player) {
      for (const d of list) {
        const dist = d.pos.distanceTo(player);
        away.copy(d.pos).sub(player).normalize();
        if (dist < 5000) d.vel.addScaledVector(away, dt * 40 * (1 - dist / 5000));
        d.vel.add(jitter.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(dt * 6));
        d.vel.clampLength(0, dist < 5000 ? 260 : 25);
        d.pos.addScaledVector(d.vel, dt);
        const target = d.base * THREE.MathUtils.clamp((dist - 1800) / 3000, 0, 1);
        d.alpha += (target - d.alpha) * (1 - Math.exp(-dt * 0.8));
        // Too close: it is simply not there anymore.
        if (dist < 1500 && d.alpha < 0.03) place(d);
        d.u.uTime.value = t;
        d.u.uAlpha.value = d.alpha;
        d.holder.visible = d.alpha > 0.005;
      }
    },
  };
}

// ---------------------------------------------------------------- the thing in the sky

// So large and far it lives in the sky layer. You see it as stars going out.
export function createVoidLeviathan(rng, skyGroup, tint) {
  const len = rng.float(15000, 24000);
  const { u, mat } = bodyMaterial(len, len * rng.float(0.03, 0.045), 0x000000, 0x6a1a10, tint.clone().multiplyScalar(2.5), 0.25);
  const mesh = new THREE.Mesh(bodyGeo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1;
  mesh.position.y = 20000;
  const pivot = new THREE.Group();
  pivot.add(mesh);
  skyGroup.add(pivot);
  const state = { active: false, until: 60 + rng.float(60, 240), presence: 0, dir: new V3() };
  const newPath = () => {
    pivot.quaternion.setFromUnitVectors(new V3(0, 1, 0), randomUnit(rng));
    pivot.rotateY(rng.float(0, TAU));
    pivot.rotation.x -= 0.6;
  };
  newPath();
  mesh.visible = false;
  return {
    state,
    update(t, dt) {
      u.uTime.value = t;
      if (t > state.until) {
        state.active = !state.active;
        state.until = t + (state.active ? rng.float(240, 420) : rng.float(360, 900));
        if (state.active) newPath();
      }
      const target = state.active ? 1 : 0;
      state.presence += (target - state.presence) * (1 - Math.exp(-dt * 0.05));
      mesh.visible = state.presence > 0.01;
      if (mesh.visible) pivot.rotation.x += dt * 0.0035;
      mesh.getWorldPosition(state.dir).sub(skyGroup.position).normalize();
    },
  };
}

// ---------------------------------------------------------------- watchers

// A light moving along a dead hull, like someone carrying a lamp. It goes out when you come.
export function watchers(ctx, rng, n) {
  for (let i = 0; i < n; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffd2a0, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 }));
    s.scale.setScalar(ctx.R * 0.035);
    ctx.body.add(s);
    const axis = randomUnit(rng);
    let dir = randomUnit(rng);
    let alpha = 0;
    let hiddenUntil = 0;
    const w = new V3();
    const speed = rng.float(0.01, 0.03);
    ctx.updaters.push((t, dt) => {
      dir.applyAxisAngle(axis, speed * dt);
      s.position.copy(ctx.surfacePoint(dir)).multiplyScalar(1.015);
      s.getWorldPosition(w);
      const near = w.distanceTo(ctx.playerWorld) < ctx.R * 1.4;
      if (near && alpha > 0.05) hiddenUntil = t + rng.float(20, 60);
      const target = t < hiddenUntil || near ? 0 : 0.8 * (0.7 + 0.3 * Math.sin(t * 2.3 + i));
      alpha += (target - alpha) * (1 - Math.exp(-dt * (target < alpha ? 3 : 0.4)));
      if (alpha < 0.01 && t < hiddenUntil) dir = randomUnit(rng);
      s.material.opacity = alpha;
    });
  }
}
