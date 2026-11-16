import * as THREE from 'three';

export const TAU = Math.PI * 2;

export function randomUnit(rng) {
  const theta = rng.float(0, TAU);
  const z = rng.float(-1, 1);
  const r = Math.sqrt(1 - z * z);
  return new THREE.Vector3(r * Math.cos(theta), r * Math.sin(theta), z);
}

export const pickR = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const mod = (a, n) => ((a % n) + n) % n;

function canvasTexture(draw) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  draw(c.getContext('2d'));
  return new THREE.CanvasTexture(c);
}

let glow, ring;
export function glowTexture() {
  return (glow ??= canvasTexture((g) => {
    const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.2, 'rgba(255,255,255,0.55)');
    grad.addColorStop(0.5, 'rgba(255,255,255,0.12)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
  }));
}

export function ringTexture() {
  return (ring ??= canvasTexture((g) => {
    g.strokeStyle = 'rgba(255,255,255,0.9)';
    g.lineWidth = 3;
    g.beginPath();
    g.arc(64, 64, 56, 0, TAU);
    g.stroke();
  }));
}
