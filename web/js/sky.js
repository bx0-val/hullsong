import * as THREE from 'three';
import { NOISE } from './noise.js';
import { glowTexture, randomUnit } from './util.js';

export function createSky(rng, universe) {
  const vis = universe.visual;
  const group = new THREE.Group();
  const hue = vis.nebulaHue;
  const s = vis.nebulaStrength;
  const colA = new THREE.Color().setHSL(hue, 0.6, 0.05 * s);
  const colB = new THREE.Color().setHSL((hue + vis.nebulaSpread) % 1, 0.55, 0.07 * s);
  const colC = new THREE.Color().setHSL((hue + 0.5 + rng.float(-0.1, 0.1)) % 1, 0.5, 0.1 * s);
  const bandNormal = randomUnit(rng);

  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(30000, 48, 24),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        uColA: { value: colA },
        uColB: { value: colB },
        uColC: { value: colC },
        uOffset: { value: new THREE.Vector3(rng.float(0, 50), rng.float(0, 50), rng.float(0, 50)) },
        uBand: { value: bandNormal },
        uScale: { value: rng.float(1.4, 3) },
      },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColA, uColB, uColC, uOffset, uBand;
        uniform float uScale;
        varying vec3 vDir;
        ${NOISE}
        void main() {
          vec3 d = normalize(vDir);
          float n = fbm(d * uScale + uOffset);
          float n2 = fbm(d * uScale * 2.2 + uOffset * 1.7 + n);
          float band = pow(1.0 - abs(dot(d, uBand)), 4.0);
          float neb = smoothstep(-0.1, 0.8, n2) * (0.35 + band * 0.9);
          vec3 col = mix(uColA, uColB, smoothstep(-0.4, 0.6, n)) * neb;
          col += uColC * pow(max(0.0, n2), 3.0) * band * 0.6;
          col += vec3(0.004, 0.005, 0.009);
          gl_FragColor = vec4(col, 1.0);
        }`,
    })
  );
  sky.renderOrder = -2;
  group.add(sky);

  const addStars = (count, size, brightness) => {
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < count; i++) {
      const d = randomUnit(rng);
      if (rng.chance(0.55)) d.addScaledVector(bandNormal, -d.dot(bandNormal) * rng.float(0.75, 1)).normalize();
      d.multiplyScalar(25000);
      pos.set([d.x, d.y, d.z], i * 3);
      c.setHSL(rng.pick([0.08, 0.12, 0.58, 0.6, 0.62]), rng.float(0.2, 0.6), 1);
      c.multiplyScalar(brightness * (0.25 + 0.75 * rng.float() ** 3));
      col.set([c.r, c.g, c.b], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const pts = new THREE.Points(
      geo,
      new THREE.PointsMaterial({ size, sizeAttenuation: false, vertexColors: true, map: glowTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })
    );
    pts.renderOrder = -1;
    group.add(pts);
  };
  addStars(rng.int(3000, 8000), 2.2, 1);
  addStars(rng.int(100, 400), 5, 1.4);

  const sprite = (color, scale, pos) => {
    const sp = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: glowTexture(), color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false })
    );
    sp.scale.setScalar(scale);
    sp.position.copy(pos);
    return sp;
  };

  const star = universe.star;
  const starColor = new THREE.Color(star.color);
  if (!star.local) {
    const p = vis.starDir.clone().multiplyScalar(20000);
    group.add(sprite(starColor, star.size * 4, p));
    if (vis.binary) group.add(sprite(starColor.clone().offsetHSL(0.5, 0, 0), star.size * 2, p.clone().add(new THREE.Vector3(1800, 600, 0))));
  }

  return {
    group,
    tint: colB,
    update(camera) {
      group.position.copy(camera.position);
    },
  };
}

// A star that sits in the scene (orbit universes), or lights from far away.
export function createLighting(scene, universe, skyTint) {
  const star = universe.star;
  const color = new THREE.Color(star.color);
  scene.add(new THREE.HemisphereLight(skyTint.clone().multiplyScalar(6), 0x050403, 0.3));
  scene.add(new THREE.AmbientLight(0xffffff, 0.05));
  if (star.local) {
    const body = new THREE.Mesh(new THREE.SphereGeometry(star.size, 48, 32), new THREE.MeshBasicMaterial({ color: color.clone().multiplyScalar(1.6), fog: false, toneMapped: false }));
    scene.add(body);
    for (const [k, o] of [[3.2, 1], [9, 0.45]]) {
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: o, fog: false }));
      halo.scale.setScalar(star.size * k);
      scene.add(halo);
    }
    scene.add(new THREE.PointLight(color, star.lum, 0, 0));
    if (universe.visual.binary) {
      const twin = body.clone();
      twin.scale.setScalar(0.4);
      twin.position.set(star.size * 3, star.size * 0.6, 0);
      scene.add(twin);
    }
  } else {
    const sun = new THREE.DirectionalLight(color, star.lum);
    sun.position.copy(universe.visual.starDir).multiplyScalar(1000);
    scene.add(sun);
  }
}

// Motes that wrap around the camera so you can feel your speed.
export function createDust(color, count = 900, box = 500) {
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < pos.length; i++) pos[i] = Math.random() * box;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const uniforms = { uCam: { value: new THREE.Vector3() }, uBox: { value: box }, uColor: { value: color } };
  const pts = new THREE.Points(
    geo,
    new THREE.ShaderMaterial({
      uniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        uniform vec3 uCam;
        uniform float uBox;
        varying float vA;
        void main() {
          vec3 rel = mod(position - uCam, uBox) - 0.5 * uBox;
          vec4 mv = modelViewMatrix * vec4(uCam + rel, 1.0);
          float d = length(rel) / (0.5 * uBox);
          vA = smoothstep(1.0, 0.55, d) * smoothstep(0.0, 0.06, d);
          gl_PointSize = clamp(260.0 / -mv.z, 0.6, 4.0);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        varying float vA;
        void main() {
          float a = smoothstep(0.5, 0.0, length(gl_PointCoord - 0.5)) * vA * 0.45;
          gl_FragColor = vec4(uColor * a, 1.0);
        }`,
    })
  );
  pts.frustumCulled = false;
  return { object: pts, update: (camera) => uniforms.uCam.value.copy(camera.position) };
}
