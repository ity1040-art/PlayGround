import * as THREE from '../vendor/three.module.js';
import { buildWorld } from './world.js';
import { Ghost } from './ghost.js';
import { AudioEngine } from './audio.js';
import { glowTexture } from './textures.js';
import { mergeGeometries } from '../vendor/BufferGeometryUtils.js';

// ── DOM ──────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);
const canvas = $('game-canvas');
const titleScreen = $('title-screen');
const startBtn = $('start-btn');
const introOverlay = $('intro-overlay');
const hud = $('hud');
const objectiveText = $('objective-text');
const compassArrow = $('compass-arrow');
const compassLabel = $('compass-label');
const compassDist = $('compass-dist');
const relicSlots = [...document.querySelectorAll('.relic-slot')];
const roomToast = $('room-toast');
const subtitleEl = $('subtitle');
const interactPrompt = $('interact-prompt');
const interactText = $('interact-text');
const interactKey = interactPrompt.querySelector('.key');
const crosshair = $('crosshair');
const staminaBar = $('stamina-bar');
const staminaWrap = $('stamina-wrap');
const dangerVignette = $('danger-vignette');
const useBtn = $('use-btn');
const lightBtn = $('light-btn');
const sprintBtn = $('sprint-btn');
const pauseBtn = $('pause-btn');
const pauseScreen = $('pause-screen');
const resumeBtn = $('resume-btn');
const muteBtn = $('mute-btn');
const endScreen = $('end-screen');
const endKicker = $('end-kicker');
const endTitle = $('end-title');
const endCopy = $('end-copy');
const endStats = $('end-stats');
const endQuote = $('end-quote');
const againBtn = $('again-btn');
const jumpscare = $('jumpscare');
const hideOverlay = $('hide-overlay');
const damageFlash = $('damage-flash');
const lightningFlash = $('lightning-flash');
const boot = $('boot');
const rotateHint = $('rotate-hint');

function lambert(params = {}) {
  const { roughness, metalness, ...rest } = params;
  return new THREE.MeshLambertMaterial(rest);
}

const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
const isMobile = isTouch || innerWidth < 900;

// ── Three.js setup ───────────────────────────────────────────
const renderer = new THREE.WebGLRenderer({
  canvas, antialias: true, powerPreference: 'high-performance', alpha: false, stencil: false
});
const MAX_PR = Math.min(devicePixelRatio || 1, isMobile ? 1.3 : 1.65);
let renderScale = 1;
renderer.setPixelRatio(MAX_PR);
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.4;
renderer.shadowMap.enabled = false;


// Collapse the static mansion into a handful of draw calls. This is the
// difference between a playable phone game and a slideshow.
function mergeStaticScene(root) {
  root.updateMatrixWorld(true);
  const buckets = new Map();
  const remove = [];
  const AXES = new Set(['position', 'normal', 'uv']);

  function normalizeGeometry(src, matrix) {
    const g = src.index ? src.toNonIndexed() : src.clone();
    for (const name of Object.keys(g.attributes)) {
      if (!AXES.has(name)) g.deleteAttribute(name);
    }
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.uv) {
      const count = g.attributes.position.count;
      g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(count * 2), 2));
    }
    g.applyMatrix4(matrix);
    return g;
  }

  function walk(obj, dynamicParent) {
    const dynamic = dynamicParent || obj.userData.dynamic;
    if (dynamic) return;
    if (obj.isMesh && !obj.isSkinnedMesh && obj.geometry && !Array.isArray(obj.material)) {
      const m = obj.material;
      if (!m.transparent && m.opacity >= 0.999 && !m.isShaderMaterial && !obj.userData.noMerge) {
        const geo = normalizeGeometry(obj.geometry, obj.matrixWorld);
        if (!buckets.has(m.uuid)) buckets.set(m.uuid, { material: m, geometries: [] });
        buckets.get(m.uuid).geometries.push(geo);
        remove.push(obj);
      }
    }
    for (const child of obj.children) walk(child, dynamic);
  }
  walk(root, false);

  for (const { material, geometries } of buckets.values()) {
    if (geometries.length === 0) continue;
    const merged = geometries.length === 1 ? geometries[0] : mergeGeometries(geometries, false);
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, material);
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    root.add(mesh);
  }
  for (const mesh of remove) {
    if (mesh.parent) mesh.parent.remove(mesh);
    mesh.geometry.dispose();
  }
}

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x040809);
scene.fog = new THREE.FogExp2(0x050b0d, 0.033);

const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.05, 80);
camera.rotation.order = 'YXZ';
scene.add(camera);

const world = buildWorld(scene);
mergeStaticScene(scene);

// flashlight
const flashlightTarget = new THREE.Object3D();
flashlightTarget.position.set(0, -0.08, -5);
camera.add(flashlightTarget);
const flashlight = new THREE.SpotLight(0xffe7c0, 65, 28, 0.62, 0.6, 1.4);
flashlight.position.set(0.18, -0.12, 0.05);
flashlight.target = flashlightTarget;
flashlight.castShadow = false;
camera.add(flashlight);

// soft fill so the world isn't pitch black when the torch is off
const fill = new THREE.PointLight(0x9db3b0, 9, 8, 1.7);
fill.position.set(0, 0.6, 0);
camera.add(fill);

const audio = new AudioEngine();

const ghost = new Ghost(scene, world, {
  onAwaken: () => {
    audio.screech();
    showSubtitle('“…there you are.”', 3600);
    world.triggerBlackout(1.6);
  },
  onChase: () => {
    audio.screech();
    if (!ghost.final) showSubtitle('RUN.', 2200);
  },
  onLost: () => {
    showSubtitle('She has lost your scent… for now.', 3200);
  },
  onWhisper: (dist) => {
    audio.whisper(1.2);
    if (Math.random() < 0.35) {
      const lines = [
        '“Do not look behind you.”',
        '“I can hear your heart.”',
        '“The house remembers you.”',
        '“Stay a little longer.”',
        '“You took something that was mine.”'
      ];
      showSubtitle(lines[Math.floor(Math.random() * lines.length)], 3800);
    }
  },
  onNearDormant: () => {
    audio.whisper(0.6);
    showSubtitle('“Turn around.”', 2600);
  },
  onFinal: () => {
    audio.screech();
  },
  onCatch: () => {
    handleCaught();
  }
});

// ── Game state ───────────────────────────────────────────────
let state = 'title';
let relics = 0;
let gameStart = 0;
let elapsed = 0;
let candles = [];
let nearestInteract = null;
let currentRoom = null;
let subtitleTimer = 0;
let toastTimer = 0;
let thunderTimer = 22 + Math.random() * 12;
let lightningGlow = 0;
let introDismissed = false;
let introTimer = null;
let caughtTimer = null;
let runTimer = 0;
let deathHandled = false;

const player = {
  pos: new THREE.Vector3(0, 0, 11.6),
  vel: new THREE.Vector2(),
  yaw: 0,
  pitch: 0,
  radius: 0.31,
  eye: 1.62,
  bob: 0,
  bobRoll: 0,
  stamina: 100,
  sprinting: false,
  moving: false,
  lightOn: true,
  hidden: null,
  hideWasLight: true,
  hideLookOffset: 0,
  stepDist: 0
};

const input = {
  keys: new Set(),
  joyX: 0,
  joyY: 0,
  joyMag: 0,
  lookId: null,
  lookX: 0,
  lookY: 0,
  joyId: null,
  sprintHeld: false,
  pointerLock: false
};

const tmpV = new THREE.Vector3();
const clock = new THREE.Clock();


// The thing that greets you when she catches you.
function drawScareFace() {
  const c = document.getElementById('scare-canvas');
  if (!c) return;
  const W = c.width, H = c.height;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, W, H);

  // ragged sheet of black hair behind the face
  ctx.fillStyle = '#030404';
  ctx.beginPath();
  ctx.moveTo(-30, H + 20);
  ctx.bezierCurveTo(-20, 520, -10, 260, 30, 130);
  ctx.bezierCurveTo(80, 40, 150, -20, 256, -24);
  ctx.bezierCurveTo(370, -28, 452, 30, 488, 140);
  ctx.bezierCurveTo(520, 270, 530, 520, 540, H + 20);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(50,58,55,.18)';
  for (let i = 0; i < 44; i++) {
    ctx.lineWidth = 0.6 + Math.random() * 1.6;
    const x = 20 + Math.random() * 472;
    ctx.beginPath();
    ctx.moveTo(x, 50 + Math.random() * 60);
    ctx.bezierCurveTo(x - 20, 240, x + 25, 430, x - 15 + Math.random() * 30, 720);
    ctx.stroke();
  }

  // face silhouette
  const face = new Path2D();
  face.moveTo(256, 92);
  face.bezierCurveTo(334, 92, 374, 168, 376, 276);
  face.bezierCurveTo(378, 392, 350, 528, 300, 620);
  face.bezierCurveTo(282, 658, 230, 658, 212, 620);
  face.bezierCurveTo(162, 528, 134, 392, 136, 276);
  face.bezierCurveTo(138, 168, 178, 92, 256, 92);
  face.closePath();

  ctx.save();
  ctx.clip(face);

  // skin
  const skin = ctx.createRadialGradient(220, 220, 30, 256, 400, 340);
  skin.addColorStop(0, '#d2d3c2');
  skin.addColorStop(0.34, '#b9bbaa');
  skin.addColorStop(0.68, '#8e9488');
  skin.addColorStop(1, '#565d55');
  ctx.fillStyle = skin;
  ctx.fillRect(0, 0, W, H);

  // mottled decay
  for (let i = 0; i < 230; i++) {
    const x = 120 + Math.random() * 272;
    const y = 110 + Math.random() * 540;
    const r = 1 + Math.random() * 22;
    const dark = Math.random() > 0.42;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, dark ? `rgba(35,45,38,${0.04 + Math.random() * 0.09})` : `rgba(235,232,206,${0.03 + Math.random() * 0.06})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }

  // temple / cheek / jaw hollows
  function hollow(x, y, rx, ry, a) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, Math.max(rx, ry));
    g.addColorStop(0, `rgba(20,28,23,${a})`);
    g.addColorStop(0.55, `rgba(20,28,23,${a * 0.5})`);
    g.addColorStop(1, 'rgba(20,28,23,0)');
    ctx.save(); ctx.translate(x, y); ctx.scale(1, ry / rx); ctx.translate(-x, -y);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, rx, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  hollow(156, 310, 56, 85, 0.5);
  hollow(356, 310, 56, 85, 0.5);
  hollow(188, 405, 48, 42, 0.34);
  hollow(324, 405, 48, 42, 0.34);
  hollow(256, 585, 70, 55, 0.38);
  hollow(256, 150, 115, 65, 0.25);

  // brow ridge
  ctx.strokeStyle = 'rgba(38,44,36,.5)';
  ctx.lineWidth = 7;
  ctx.beginPath(); ctx.moveTo(164, 246); ctx.bezierCurveTo(190, 230, 218, 232, 236, 244); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(276, 244); ctx.bezierCurveTo(296, 232, 326, 230, 350, 246); ctx.stroke();
  ctx.strokeStyle = 'rgba(218,216,191,.22)';
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(170, 238); ctx.bezierCurveTo(198, 224, 220, 226, 236, 236); ctx.stroke();

  // creases
  ctx.strokeStyle = 'rgba(40,46,38,.22)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.moveTo(196 + i * 5, 206 + i * 11);
    ctx.bezierCurveTo(228, 196 + i * 11, 284, 196 + i * 11, 316 - i * 5, 206 + i * 11);
    ctx.stroke();
  }

  // eye sockets
  function socket(cx, cy, rx, ry, rot) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rot);
    const g = ctx.createRadialGradient(0, 0, 4, 0, 0, rx * 1.1);
    g.addColorStop(0, '#000000');
    g.addColorStop(0.5, '#020303');
    g.addColorStop(0.82, 'rgba(10,14,11,.94)');
    g.addColorStop(1, 'rgba(10,14,11,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
    // wet rim
    ctx.strokeStyle = 'rgba(120,122,102,.35)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(0, 0, rx * 0.92, ry * 0.9, 0, 0, Math.PI * 2); ctx.stroke();
    // bloodshot veins
    for (let i = 0; i < 6; i++) {
      ctx.strokeStyle = `rgba(120,30,24,${0.16 + Math.random() * 0.18})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      const a = Math.random() * Math.PI * 2;
      ctx.moveTo(Math.cos(a) * rx * 0.55, Math.sin(a) * ry * 0.55);
      ctx.quadraticCurveTo(Math.cos(a + 0.3) * rx * 0.85, Math.sin(a + 0.3) * ry * 0.8, Math.cos(a + 0.1) * rx, Math.sin(a + 0.1) * ry);
      ctx.stroke();
    }
    ctx.restore();
  }
  socket(204, 292, 46, 34, -0.08);
  socket(308, 292, 46, 34, 0.08);

  // pinprick pupils
  function pupil(cx, cy) {
    ctx.save();
    ctx.shadowColor = 'rgba(255,30,18,.95)';
    ctx.shadowBlur = 26;
    ctx.fillStyle = '#ff2c1c';
    ctx.beginPath(); ctx.arc(cx, cy, 7.2, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#ffe3c8';
    ctx.beginPath(); ctx.arc(cx - 1.4, cy - 1.8, 1.8, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  pupil(209, 295);
  pupil(313, 295);

  // dark tear tracks
  ctx.lineCap = 'round';
  for (const [x, drift] of [[196, -6], [212, 2], [304, -3], [318, 6]]) {
    const g = ctx.createLinearGradient(0, 320, 0, 590);
    g.addColorStop(0, 'rgba(6,9,7,.62)');
    g.addColorStop(0.5, 'rgba(8,12,9,.32)');
    g.addColorStop(1, 'rgba(8,12,9,0)');
    ctx.strokeStyle = g;
    ctx.lineWidth = 5 + Math.random() * 5;
    ctx.beginPath();
    ctx.moveTo(x, 318);
    ctx.bezierCurveTo(x + drift, 380, x - drift, 470, x + drift * 0.5, 580);
    ctx.stroke();
  }

  // nose
  ctx.fillStyle = 'rgba(36,42,35,.4)';
  ctx.beginPath();
  ctx.moveTo(256, 322);
  ctx.bezierCurveTo(245, 352, 242, 372, 246, 390);
  ctx.bezierCurveTo(238, 396, 236, 404, 246, 407);
  ctx.bezierCurveTo(253, 409, 259, 409, 266, 407);
  ctx.bezierCurveTo(276, 404, 274, 396, 266, 390);
  ctx.bezierCurveTo(270, 372, 267, 352, 256, 322);
  ctx.fill();
  ctx.fillStyle = 'rgba(6,8,6,.8)';
  ctx.beginPath(); ctx.ellipse(247, 398, 6, 3.5, 0.25, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(265, 398, 6, 3.5, -0.25, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(222,220,197,.25)';
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(256, 330); ctx.bezierCurveTo(248, 350, 247, 365, 249, 376); ctx.stroke();

  // grinning maw
  const maw = new Path2D();
  maw.moveTo(198, 452);
  maw.bezierCurveTo(214, 428, 236, 421, 256, 425);
  maw.bezierCurveTo(282, 420, 306, 430, 314, 454);
  maw.bezierCurveTo(322, 512, 318, 574, 298, 612);
  maw.bezierCurveTo(282, 646, 228, 648, 212, 613);
  maw.bezierCurveTo(190, 574, 191, 510, 198, 452);
  maw.closePath();
  ctx.fillStyle = 'rgba(120,106,84,.55)';
  ctx.fill(maw);
  const throat = ctx.createRadialGradient(256, 590, 10, 256, 545, 140);
  throat.addColorStop(0, '#1b0204');
  throat.addColorStop(0.48, '#070101');
  throat.addColorStop(1, '#010000');
  ctx.fillStyle = throat;
  ctx.fill(maw);
  ctx.strokeStyle = 'rgba(90,70,54,.6)';
  ctx.lineWidth = 5;
  ctx.stroke(maw);

  // teeth
  ctx.save();
  ctx.clip(maw);
  const upperY = 440;
  ctx.fillStyle = '#c4bda4';
  for (let i = 0; i < 6; i++) {
    const x = 194 + i * 21;
    ctx.beginPath();
    ctx.moveTo(x, upperY);
    ctx.lineTo(x + 18, upperY - 2 + Math.random() * 5);
    ctx.lineTo(x + 7 + Math.random() * 4, upperY + 30 + Math.random() * 22);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(50,42,32,.4)'; ctx.lineWidth = 1; ctx.stroke();
  }
  ctx.fillStyle = '#9e9982';
  for (let i = 0; i < 5; i++) {
    const x = 204 + i * 22;
    const top = 628 - Math.random() * 8;
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x + 19, top);
    ctx.lineTo(x + 9, top - 28 - Math.random() * 16);
    ctx.closePath();
    ctx.fill();
  }
  // tongue shadow
  ctx.fillStyle = 'rgba(55,8,12,.55)';
  ctx.beginPath(); ctx.ellipse(256, 596, 46, 25, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();

  // sores / veins
  for (let i = 0; i < 12; i++) {
    const x = 154 + Math.random() * 205;
    const y = 180 + Math.random() * 420;
    ctx.strokeStyle = `rgba(52,70,58,${0.12 + Math.random() * 0.14})`;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.bezierCurveTo(x + 10, y + 12, x - 8, y + 24, x + 6, y + 38);
    ctx.stroke();
  }

  // face edge shading
  const edge = ctx.createRadialGradient(256, 360, 120, 256, 360, 270);
  edge.addColorStop(0, 'rgba(0,0,0,0)');
  edge.addColorStop(0.8, 'rgba(0,0,0,.28)');
  edge.addColorStop(1, 'rgba(0,0,0,.6)');
  ctx.fillStyle = edge;
  ctx.fillRect(0, 0, W, H);

  ctx.restore();

  // lank hair over the face — irregular, heavier at the temples
  for (let i = 0; i < 22; i++) {
    const side = i % 3 === 0 ? (Math.random() > 0.5 ? 1 : -1) : 0;
    let x = side ? (side > 0 ? 355 + Math.random() * 80 : 50 + Math.random() * 90) : 120 + Math.random() * 272;
    let y = 55 + Math.random() * 90;
    const sway = 12 + Math.random() * 34;
    ctx.strokeStyle = `rgba(3,5,4,${0.42 + Math.random() * 0.5})`;
    ctx.lineWidth = 1 + Math.random() * 6;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let seg = 0; seg < 5; seg++) {
      const nx = x + (Math.random() - 0.5) * sway * 2 + (x < 256 ? -6 : 6);
      const ny = y + 70 + Math.random() * 60;
      ctx.quadraticCurveTo(x + (Math.random() - 0.5) * sway * 2, (y + ny) / 2, nx, ny);
      x = nx; y = ny;
      if (y > 690) break;
    }
    ctx.stroke();
  }
  // clumps of hair spilling over the cheeks
  ctx.fillStyle = 'rgba(3,5,4,.82)';
  for (const sx of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(256 + sx * 128, 90);
    ctx.bezierCurveTo(256 + sx * 165, 220, 256 + sx * 150, 400, 256 + sx * 118, 566);
    ctx.bezierCurveTo(256 + sx * 150, 430, 256 + sx * 120, 250, 256 + sx * 100, 150);
    ctx.closePath();
    ctx.fill();
  }

  // final grime and film grain
  for (let i = 0; i < 900; i++) {
    const x = Math.random() * W, y = Math.random() * H;
    ctx.fillStyle = Math.random() > 0.5 ? `rgba(255,255,255,${Math.random() * 0.035})` : `rgba(0,0,0,${Math.random() * 0.07})`;
    ctx.fillRect(x, y, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }
  const vig = ctx.createRadialGradient(256, 380, 130, 256, 380, 430);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(0,0,0,.62)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, W, H);
}

// ── helpers ──────────────────────────────────────────────────
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function lerp(a, b, t) { return a + (b - a) * t; }
function wrapAngle(a) { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; }
function formatTime(ms) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function showSubtitle(text, ms = 4200) {
  subtitleEl.textContent = text;
  subtitleEl.classList.add('show');
  clearTimeout(subtitleTimer);
  subtitleTimer = setTimeout(() => subtitleEl.classList.remove('show'), ms);
}

function showToast(text) {
  roomToast.textContent = text;
  roomToast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => roomToast.classList.remove('show'), 1900);
}

function setObjective(text) {
  objectiveText.textContent = text;
}

function updateRelicUI() {
  relicSlots.forEach((slot, i) => slot.classList.toggle('lit', i < relics));
}

// ── candle spawning ──────────────────────────────────────────
const candleGlowTex = glowTexture('#9fe8e3');
const stoneCandleMat = lambert({ color: 0x3b403d, roughness: 0.92 });
const candleWaxMat = lambert({ color: 0x141619, roughness: 0.72, emissive: 0x060708 });
const candleFlameMat = new THREE.MeshBasicMaterial({ color: 0xaef6ec, toneMapped: false });
const candleRuneMat = new THREE.MeshBasicMaterial({ color: 0x93e0d9, transparent: true, opacity: 0.8, toneMapped: false });

function spawnCandles() {
  removeCandles();
  const byRoom = {};
  for (const spot of world.candleSpots) {
    if (!byRoom[spot.room]) byRoom[spot.room] = [];
    byRoom[spot.room].push(spot);
  }
  const roomNames = Object.keys(byRoom);
  shuffle(roomNames);
  const chosenRooms = roomNames.slice(0, 3);
  for (const room of chosenRooms) {
    const spots = byRoom[room];
    const spot = spots[Math.floor(Math.random() * spots.length)];
    candles.push(createCandle(spot));
  }
}

function createCandle(spot) {
  const group = new THREE.Group();
  group.position.set(spot.x, 0, spot.z);
  const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.34, 0.62, 10), stoneCandleMat);
  pedestal.position.y = 0.31;
  group.add(pedestal);
  const rune = new THREE.Mesh(new THREE.TorusGeometry(0.31, 0.014, 6, 22), candleRuneMat);
  rune.rotation.x = Math.PI / 2;
  rune.position.y = 0.035;
  group.add(rune);
  const wax = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.085, 0.56, 8), candleWaxMat);
  wax.position.y = 0.9;
  group.add(wax);
  const drip = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.05, 0.16, 6), candleWaxMat);
  drip.position.set(0.06, 0.75, 0.02);
  group.add(drip);
  const flame = new THREE.Mesh(new THREE.SphereGeometry(0.036, 8, 8), candleFlameMat);
  flame.scale.set(0.8, 2.2, 0.8);
  flame.position.y = 1.21;
  group.add(flame);

  const halo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: candleGlowTex, color: 0xffffff, transparent: true, opacity: 0.55,
    blending: THREE.AdditiveBlending, depthWrite: false
  }));
  halo.position.y = 1.21;
  halo.scale.set(1.0, 1.0, 1);
  group.add(halo);

  const light = new THREE.PointLight(0x8fe8df, 4.5, 5, 1.8);
  light.position.y = 1.15;
  group.add(light);

  scene.add(group);
  return {
    group, light, halo, flame, pos: new THREE.Vector3(spot.x, 0, spot.z),
    room: spot.room, taken: false, phase: Math.random() * 10
  };
}

function removeCandles() {
  for (const c of candles) {
    scene.remove(c.group);
    c.group.traverse(o => {
      if (o.geometry) o.geometry.dispose();
    });
  }
  candles = [];
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ── interaction ──────────────────────────────────────────────
function findNearestInteraction() {
  if (player.hidden) {
    return { type: 'unhide', dist: 0, label: 'LEAVE HIDING SPOT' };
  }
  let best = null;
  for (const c of candles) {
    if (c.taken) continue;
    const d = Math.hypot(c.pos.x - player.pos.x, c.pos.z - player.pos.z);
    if (d < 1.95 && (!best || d < best.dist)) {
      best = { type: 'candle', target: c, dist: d, label: 'TAKE THE BLACK CANDLE' };
    }
  }
  for (const h of world.hideSpots) {
    const d = h.frontPos.distanceTo(tmpV.set(player.pos.x, 0, player.pos.z));
    if (d < 1.5 && (!best || d < best.dist)) {
      best = { type: 'hide', target: h, dist: d, label: 'HIDE IN THE WARDROBE' };
    }
  }
  const exitDist = Math.hypot(player.pos.x, player.pos.z - 13.45);
  if (exitDist < 2.7 && (!best || exitDist < best.dist)) {
    best = {
      type: 'exit', dist: exitDist,
      label: relics >= 3 ? 'ESCAPE THROUGH THE DOOR' : `THE SEAL HOLDS · ${3 - relics} CANDLE${relics === 2 ? '' : 'S'} REMAIN`
    };
  }
  return best;
}

function useAction() {
  if (state !== 'playing') return;
  audio.init();
  if (player.hidden) { exitHide(); return; }
  const target = nearestInteract;
  if (!target) return;
  if (target.type === 'candle') collectCandle(target.target);
  else if (target.type === 'hide') enterHide(target.target);
  else if (target.type === 'exit') {
    if (relics >= 3) {
      showSubtitle('Go. NOW.', 1800);
      audio.doorOpen();
    } else {
      audio.doorLocked();
      showSubtitle(`The seal holds. ${3 - relics} black candle${relics === 2 ? '' : 's'} still burn.`, 3400);
      flashDamage(0.18, 220);
    }
  }
}

function collectCandle(candle) {
  if (candle.taken) return;
  candle.taken = true;
  scene.remove(candle.group);
  relics++;
  updateRelicUI();
  world.exit.setLit(relics);
  audio.pickup();
  world.triggerBlackout(1.35);
  spawnBurst(candle.pos.x, 1.2, candle.pos.z, 0x9fe8e3);

  if (relics < 3) {
    ghost.awaken(player.pos, relics - 1);
    const lines = [
      'One candle taken. The house exhales.',
      'Two candles. Something moves in the walls.',
      'The seal tightens around your wrist.'
    ];
    showSubtitle(lines[Math.min(relics - 1, 2)], 3800);
    setObjective(`Find the black candles  ·  ${relics} of 3 taken`);
    flashDamage(0.22, 260, 'rgba(150,235,225,.3)');
  } else {
    setObjective('THE SEAL IS BROKEN — RUN TO THE FOYER DOOR');
    showSubtitle('All three candles burn. The door is open. RUN.', 5000);
    world.exit.setOpen(true);
    audio.doorOpen();
    ghost.startFinal(player.pos);
    flashDamage(0.4, 400, 'rgba(190,230,220,.45)');
    lightningGlow = 1.5;
    setTimeout(() => addLightningFlash(false), 150);
  }

  // small health-like pulse for feedback
  const d = document.createElement('div');
  d.className = 'pickup-pulse';
  d.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:8;background:radial-gradient(circle at 50% 50%, rgba(150,235,225,.35), transparent 60%);opacity:1;transition:opacity 1.1s ease;';
  document.getElementById('app').appendChild(d);
  requestAnimationFrame(() => { d.style.opacity = '0'; });
  setTimeout(() => d.remove(), 1300);
}

function enterHide(spot) {
  player.hidden = spot;
  player.hideReturn = player.pos.clone();
  player.hideWasLight = player.lightOn;
  player.lightOn = false;
  updateFlashlight();
  player.pos.set(spot.camPos.x, 0, spot.camPos.z);
  player.yaw = spot.yaw;
  player.hideBaseYaw = spot.yaw;
  player.hideBasePitch = 0;
  player.pitch = 0;
  hideOverlay.classList.add('show');
  useBtn.classList.remove('pulse');
  showSubtitle('Hold your breath. She cannot see you here.', 3600);
  audio.whisper(0.5);
  if (ghost.state === 'chase') ghost.state = 'search', ghost.searchTimer = 5.5, ghost.target.copy(spot.frontPos);
}

function exitHide() {
  if (!player.hidden) return;
  const spot = player.hidden;
  player.hidden = null;
  player.pos.set(spot.frontPos.x, 0, spot.frontPos.z);
  player.yaw = spot.yaw;
  player.pitch = 0;
  player.lightOn = player.hideWasLight;
  updateFlashlight();
  hideOverlay.classList.remove('show');
  showSubtitle('You slip back into the dark.', 2200);
}

// ── flashlight ───────────────────────────────────────────────
function updateFlashlight() {
  flashlight.intensity = player.lightOn ? 65 : 0;
  fill.intensity = player.lightOn ? 9 : 1.2;
  lightBtn.classList.toggle('on', player.lightOn);
}

function toggleLight() {
  if (state !== 'playing') return;
  audio.init();
  if (player.hidden) {
    showSubtitle('Not while hiding.', 1800);
    return;
  }
  player.lightOn = !player.lightOn;
  updateFlashlight();
  audio.thud();
}

// ── movement + collision ─────────────────────────────────────
function getMoveVector() {
  let x = 0, y = 0;
  if (input.keys.has('KeyW') || input.keys.has('ArrowUp')) y += 1;
  if (input.keys.has('KeyS') || input.keys.has('ArrowDown')) y -= 1;
  if (input.keys.has('KeyA') || input.keys.has('ArrowLeft')) x -= 1;
  if (input.keys.has('KeyD') || input.keys.has('ArrowRight')) x += 1;
  if (input.joyMag > 0.08) {
    x += input.joyX;
    y += input.joyY;
  }
  const len = Math.hypot(x, y);
  if (len > 1) { x /= len; y /= len; }
  return { x, y, len: Math.min(1, len) };
}

function movePlayer(dt) {
  const mv = getMoveVector();
  player.moving = mv.len > 0.05;

  const wantsSprint = (input.keys.has('ShiftLeft') || input.keys.has('ShiftRight') || input.sprintHeld) && player.moving;
  player.sprinting = wantsSprint && player.stamina > 3;

  if (player.sprinting) player.stamina = Math.max(0, player.stamina - dt * 24);
  else player.stamina = Math.min(100, player.stamina + dt * 16);

  const speed = player.sprinting ? 4.55 : 2.75;
  const targetVX = (mv.x * speed);
  const targetVZ = (-mv.y * speed);
  // forward is -z with yaw = 0, so rotate the input by yaw
  const cos = Math.cos(player.yaw), sin = Math.sin(player.yaw);
  const worldX = targetVX * cos + targetVZ * sin;
  const worldZ = -targetVX * sin + targetVZ * cos;

  const accel = player.moving ? 11 : 14;
  player.vel.x = lerp(player.vel.x, worldX, Math.min(1, dt * accel));
  player.vel.y = lerp(player.vel.y, worldZ, Math.min(1, dt * accel));

  if (!player.moving) {
    player.vel.x = lerp(player.vel.x, 0, Math.min(1, dt * 12));
    player.vel.y = lerp(player.vel.y, 0, Math.min(1, dt * 12));
  }

  const dx = player.vel.x * dt;
  const dz = player.vel.y * dt;
  const prevX = player.pos.x, prevZ = player.pos.z;
  moveAxis('x', dx);
  moveAxis('z', dz);
  player.pos.x = clamp(player.pos.x, -15.55, 15.55);
  player.pos.z = clamp(player.pos.z, -13.55, 16.6);

  const moved = Math.hypot(player.pos.x - prevX, player.pos.z - prevZ);

  if (moved > 0.001) {
    player.stepDist += moved;
    const stride = player.sprinting ? 1.85 : 2.2;
    if (player.stepDist > stride) {
      player.stepDist = 0;
      audio.step(player.sprinting);
      player.bob += Math.PI;
    }
  }

  // head bob
  const speedNorm = Math.min(1, Math.hypot(player.vel.x, player.vel.y) / 4.55);
  player.bob += dt * (player.sprinting ? 11 : 7.5) * speedNorm;
  const bobAmp = player.sprinting ? 0.055 : 0.033;
  player.bobRoll = Math.cos(player.bob * 0.5) * 0.006 * speedNorm;
  player.camY = player.eye + Math.sin(player.bob) * bobAmp * speedNorm;

  // stamina UI
  staminaBar.style.width = `${player.stamina}%`;
  staminaBar.style.background = player.stamina < 24
    ? 'linear-gradient(90deg,#5c1a1a,#a43a3a)'
    : 'linear-gradient(90deg,#66542f,#c9a86a)';
  sprintBtn.classList.toggle('on', player.sprinting);
}

function moveAxis(axis, amount) {
  if (Math.abs(amount) < 0.000001) return;
  const p = player.pos;
  const r = player.radius;
  if (axis === 'x') p.x += amount; else p.z += amount;
  for (const c of world.colliders) {
    if (!c.enabled) continue;
    if (p.x > c.minX - r && p.x < c.maxX + r && p.z > c.minZ - r && p.z < c.maxZ + r) {
      if (axis === 'x') {
        p.x = amount > 0 ? c.minX - r - 0.001 : c.maxX + r + 0.001;
      } else {
        p.z = amount > 0 ? c.minZ - r - 0.001 : c.maxZ + r + 0.001;
      }
    }
  }
}

// ── camera ───────────────────────────────────────────────────
function updateCamera(dt) {
  camera.rotation.y = player.yaw;
  camera.rotation.x = player.pitch;
  camera.rotation.z = player.bobRoll;

  let shake = 0;
  if (ghost.active && !player.hidden) {
    const d = Math.hypot(player.pos.x - ghost.position.x, player.pos.z - ghost.position.z);
    if (d < 6) shake = (1 - d / 6) * 0.012;
    if (ghost.state === 'chase') shake += 0.006;
  }
  const sx = (Math.random() - 0.5) * shake;
  const sy = (Math.random() - 0.5) * shake;
  camera.position.set(player.pos.x + sx, (player.camY ?? player.eye) + sy, player.pos.z);
}

// ── compass / HUD ────────────────────────────────────────────
function updateHUD() {
  let target = null;
  let label = 'CANDLE';
  if (relics >= 3) {
    target = tmpV.set(0, 0, 14.4);
    label = 'EXIT';
  } else {
    let best = Infinity;
    for (const c of candles) {
      if (c.taken) continue;
      const d = Math.hypot(c.pos.x - player.pos.x, c.pos.z - player.pos.z);
      if (d < best) { best = d; target = tmpV.set(c.pos.x, 0, c.pos.z); }
    }
  }
  if (target) {
    const dx = target.x - player.pos.x;
    const dz = target.z - player.pos.z;
    const cos = Math.cos(player.yaw), sin = Math.sin(player.yaw);
    const right = dx * cos - dz * sin;
    const fwd = -dx * sin - dz * cos;
    const angle = Math.atan2(right, fwd) * 180 / Math.PI;
    compassArrow.style.transform = `rotate(${angle}deg)`;
    compassDist.textContent = `${Math.max(1, Math.round(Math.hypot(dx, dz)))}m`;
    compassLabel.textContent = label;
    compassDist.style.color = label === 'EXIT' ? '#9fd6cf' : '#c9b78e';
  }
  compassLabel.style.color = label === 'EXIT' ? '#78b6ae' : '#8d8169';

  const danger = getDanger();
  dangerVignette.style.opacity = String(danger * 0.92);
  dangerVignette.style.background = ghost.state === 'chase'
    ? 'radial-gradient(ellipse at 50% 50%, transparent 34%, rgba(120,4,8,.55) 82%, rgba(60,0,2,.9) 100%)'
    : 'radial-gradient(ellipse at 50% 50%, transparent 40%, rgba(70,10,14,.42) 85%, rgba(30,0,2,.8) 100%)';

  nearestInteract = findNearestInteraction();
  if (nearestInteract) {
    interactPrompt.classList.remove('hidden');
    interactText.textContent = nearestInteract.label;
    interactKey.textContent = isTouch ? '✦' : 'E';
    crosshair.classList.add('active');
    useBtn.classList.add('pulse');
  } else {
    interactPrompt.classList.add('hidden');
    crosshair.classList.remove('active');
    useBtn.classList.remove('pulse');
  }

  // room name toast
  const room = world.roomAt(player.pos.x, player.pos.z);
  if (room && (!currentRoom || room.id !== currentRoom.id)) {
    currentRoom = room;
    showToast(room.name);
  }
}

function getDanger() {
  if (!ghost.active) return 0;
  const d = Math.hypot(player.pos.x - ghost.position.x, player.pos.z - ghost.position.z);
  let danger = clamp(1 - d / 13, 0, 1);
  if (ghost.state === 'chase') danger = Math.max(danger, 0.55);
  if (ghost.state === 'search') danger = Math.max(danger, 0.35);
  if (player.hidden) danger *= 0.6;
  return danger;
}

// ── effects ──────────────────────────────────────────────────
const bursts = [];
function spawnBurst(x, y, z, color) {
  const mat = new THREE.SpriteMaterial({
    map: candleGlowTex, color, transparent: true, opacity: 0.95,
    blending: THREE.AdditiveBlending, depthWrite: false
  });
  const s = new THREE.Sprite(mat);
  s.position.set(x, y, z);
  s.scale.set(0.4, 0.4, 1);
  scene.add(s);
  bursts.push({ sprite: s, life: 0, max: 1.2 });
}

function updateBursts(dt) {
  for (let i = bursts.length - 1; i >= 0; i--) {
    const b = bursts[i];
    b.life += dt;
    const t = b.life / b.max;
    b.sprite.scale.setScalar(0.4 + t * 4.5);
    b.sprite.material.opacity = Math.max(0, 0.95 * (1 - t));
    b.sprite.position.y += dt * 0.5;
    if (t >= 1) {
      scene.remove(b.sprite);
      b.sprite.material.dispose();
      bursts.splice(i, 1);
    }
  }
}

function flashDamage(opacity = 0.5, ms = 300, color = 'rgba(110,0,0,.9)') {
  damageFlash.style.transition = 'none';
  damageFlash.style.background = `radial-gradient(circle, transparent 20%, ${color} 100%)`;
  damageFlash.style.opacity = String(opacity);
  requestAnimationFrame(() => {
    damageFlash.style.transition = `opacity ${ms}ms ease-out`;
    damageFlash.style.opacity = '0';
  });
}

function addLightningFlash(withSound = true) {
  lightningFlash.classList.remove('flash');
  void lightningFlash.offsetWidth;
  lightningFlash.classList.add('flash');
  if (withSound) audio.lightning();
  lightningGlow = 1.3;
}

// ── game flow ────────────────────────────────────────────────
function resetGame() {
  removeCandles();
  ghost.reset();
  world.exit.reset();
  world.triggerBlackout(0.001);
  relics = 0;
  deathHandled = false;
  currentRoom = null;
  nearestInteract = null;
  elapsed = 0;
  gameStart = performance.now();
  thunderTimer = 20 + Math.random() * 12;
  lightningGlow = 0;

  player.pos.set(0, 0, 11.6);
  player.vel.set(0, 0);
  player.yaw = 0;
  player.pitch = 0;
  player.bob = 0;
  player.bobRoll = 0;
  player.stamina = 100;
  player.sprinting = false;
  player.lightOn = true;
  player.hidden = null;
  player.hideReturn = null;
  player.stepDist = 0;
  player.camY = player.eye;
  input.keys.clear();
  input.joyX = 0; input.joyY = 0; input.joyMag = 0;
  input.sprintHeld = false;
  hideOverlay.classList.remove('show');
  introOverlay.classList.add('hidden');
  introOverlay.classList.remove('fade');
  pauseScreen.classList.add('hidden');
  endScreen.classList.add('hidden');
  jumpscare.classList.remove('show');
  hud.classList.remove('hidden');
  updateFlashlight();
  updateRelicUI();
  updateCamera(0);
  spawnCandles();
  setObjective('Find the three black candles');
  updateHUD();
  showToast('THE FOYER');
  audio.init();
  audio.doorLocked();
  setTimeout(() => {
    if (state === 'playing') showSubtitle('Find three black candles. Break the seal. Do not let her touch you.', 5200);
  }, 900);
}

function dismissIntro() {
  if (introDismissed) return;
  introDismissed = true;
  introOverlay.classList.add('fade');
  setTimeout(() => introOverlay.classList.add('hidden'), 1700);
}

function startGame() {
  audio.init();
  state = 'playing';
  titleScreen.classList.add('hidden');
  resetGame();
  introDismissed = false;
  introOverlay.classList.remove('hidden', 'fade');
  clearTimeout(introTimer);
  introTimer = setTimeout(dismissIntro, 6200);
  setTimeout(() => { if (state === 'playing') addLightningFlash(true); }, 7000);
  if (!isMobile && !isTouch) {
    // pointer lock is requested on first canvas click, not here
  }
}

function handleCaught() {
  if (state !== 'playing' || deathHandled) return;
  deathHandled = true;
  state = 'caught';
  runTimer = elapsed;
  player.vel.set(0, 0);
  input.keys.clear();
  input.joyMag = 0;
  hideOverlay.classList.remove('show');
  audio.jumpscare();
  world.triggerBlackout(0.1);
  flashlight.intensity = 0;
  jumpscare.classList.add('show');
  flashDamage(0.9, 120, 'rgba(120,0,0,.95)');
  // violent camera shake behind the overlay
  caughtTimer = setTimeout(() => showEnd(false), 2400);
}

function showEnd(win) {
  jumpscare.classList.remove('show');
  state = win ? 'won' : 'dead';
  hud.classList.add('hidden');
  endScreen.classList.remove('hidden');
  endScreen.classList.toggle('win', win);
  const time = formatTime(runTimer || elapsed);
  endStats.innerHTML = `
    <div><b>${relics}/3</b><span>BLACK CANDLES</span></div>
    <div><b>${time}</b><span>TIME IN THE HOUSE</span></div>
  `;
  if (win) {
    endKicker.textContent = 'DAWN BREAKS';
    endTitle.textContent = 'YOU ESCAPED';
    endCopy.textContent = 'The door slams shut behind you. Somewhere inside, a candle goes out.';
    endQuote.textContent = '“You will come back. They always do.”';
    againBtn.querySelector('span').textContent = 'ENTER AGAIN';
    audio.chime();
    flashDamage(0.35, 900, 'rgba(210,235,220,.45)');
  } else {
    endKicker.textContent = 'THE HOUSE KEEPS YOU';
    endTitle.textContent = 'SHE FOUND YOU';
    endCopy.textContent = 'Your breath was the only thing louder than her footsteps.';
    endQuote.textContent = '“You should not have taken the first candle.”';
    againBtn.querySelector('span').textContent = 'TRY AGAIN';
    audio.setMuted(false);
  }
}

function checkWin() {
  if (state !== 'playing') return;
  if (relics >= 3 && world.exit.openness > 0.35 && player.pos.z > 14.25 && Math.abs(player.pos.x) < 1.45) {
    state = 'won';
    runTimer = elapsed;
    flashlight.intensity = 0;
    ghost.active = false;
    setTimeout(() => showEnd(true), 450);
    flashDamage(0.5, 1500, 'rgba(220,240,230,.62)');
    audio.chime();
  }
}

function togglePause(force) {
  if (state !== 'playing' && state !== 'paused') return;
  const willPause = force !== undefined ? force : state === 'playing';
  if (willPause) {
    state = 'paused';
    pauseScreen.classList.remove('hidden');
    hud.style.filter = 'blur(2px)';
    if (audio.ctx) audio.ctx.suspend();
  } else {
    state = 'playing';
    pauseScreen.classList.add('hidden');
    hud.style.filter = '';
    if (audio.ctx) audio.ctx.resume();
    clock.getDelta();
  }
}

// ── update loop ──────────────────────────────────────────────
function updatePlaying(dt, time) {
  elapsed = performance.now() - gameStart;

  if (!player.hidden) {
    movePlayer(dt);
    updateCamera(dt);
  } else {
    // limited look inside the wardrobe
    const off = wrapAngle(player.yaw - player.hideBaseYaw);
    player.yaw = player.hideBaseYaw + clamp(off, -0.65, 0.65);
    player.pitch = clamp(player.pitch, -0.42, 0.42);
    player.camY = player.eye;
    updateCamera(dt);
  }

  ghost.update(dt, {
    pos: player.pos,
    hidden: player.hidden,
    flashlight: player.lightOn,
    sprinting: player.sprinting
  }, time);

  updateBursts(dt);
  updateHUD();
  checkWin();

  // flashlight flutter near the ghost / during blackout
  const danger = getDanger();
  if (player.lightOn) {
    let base = 65;
    if (ghost.active) base *= 0.92 + Math.sin(time * 19 + Math.sin(time * 3.3) * 6) * 0.06;
    if (danger > 0.72 && Math.random() < 0.055) base *= 0.08;
    flashlight.intensity = base;
    fill.intensity = 9 - danger * 3.5;
  }

  // ambient thunder
  thunderTimer -= dt;
  if (thunderTimer <= 0) {
    thunderTimer = 26 + Math.random() * 24;
    addLightningFlash(true);
  }
  if (lightningGlow > 0) {
    lightningGlow = Math.max(0, lightningGlow - dt * 2.6);
    world.hemi.intensity = 0.72 + lightningGlow * 1.25;
  } else {
    world.hemi.intensity = 0.72;
  }

  audio.update(dt, danger);

  // breathing while hidden
  if (player.hidden) {
    const d = Math.hypot(player.pos.x - ghost.position.x, player.pos.z - ghost.position.z);
    if (ghost.active && d < 5) {
      dangerVignette.style.opacity = String(0.55 + Math.sin(time * 3.1) * 0.13);
    }
  }

  // hide prompt override
  if (player.hidden) {
    interactPrompt.classList.remove('hidden');
    interactText.textContent = 'LEAVE HIDING SPOT';
    interactKey.textContent = isTouch ? '✦' : 'E';
    useBtn.classList.add('pulse');
    crosshair.classList.remove('active');
  }
}

function updateTitle(dt, time) {
  const sway = Math.sin(time * 0.11) * 0.06;
  camera.position.set(Math.sin(time * 0.07) * 0.28, 1.84 + Math.sin(time * 0.4) * 0.02, 11.9);
  camera.rotation.y = sway;
  camera.rotation.x = -0.025;
  camera.rotation.z = Math.sin(time * 0.09) * 0.004;
  if (lightningGlow > 0) {
    lightningGlow = Math.max(0, lightningGlow - dt * 2.6);
    world.hemi.intensity = 0.72 + lightningGlow * 1.25;
  }
}

function animate() {
  requestAnimationFrame(animate);
  const rawDt = clock.getDelta();
  const dt = Math.min(rawDt, 0.05);
  const time = performance.now() / 1000;

  if (state === 'title') {
    updateTitle(dt, time);
    world.update(dt, camera.position);
    audio.update(dt, 0);
  } else if (state === 'playing') {
    updatePlaying(dt, time);
    world.update(dt, camera.position);
  } else if (state === 'paused') {
    // frozen house, but still rendered
  } else if (state === 'caught') {
    // camera convulses under the scare overlay
    camera.position.x = player.pos.x + (Math.random() - 0.5) * 0.08;
    camera.position.z = player.pos.z + (Math.random() - 0.5) * 0.08;
    camera.rotation.z = (Math.random() - 0.5) * 0.06;
    world.update(dt, camera.position);
  } else {
    world.update(dt, camera.position);
  }

  // Adaptive resolution keeps the frame rate usable on weaker phones.
  qualityFrames++;
  qualityElapsed += rawDt;
  if (qualityElapsed > 2.2) {
    const fps = qualityFrames / qualityElapsed;
    if (fps < 28 && renderScale > 0.58) {
      renderScale = Math.max(0.58, renderScale - 0.14);
      renderer.setPixelRatio(MAX_PR * renderScale);
    } else if (fps > 54 && renderScale < 1 && qualityFrames > 20) {
      renderScale = Math.min(1, renderScale + 0.07);
      renderer.setPixelRatio(MAX_PR * renderScale);
    }
    qualityFrames = 0;
    qualityElapsed = 0;
  }

  renderer.render(scene, camera);
}

let qualityFrames = 0;
let qualityElapsed = 0;

// ── input wiring ─────────────────────────────────────────────
const lookSensitivity = 0.0024;

function lookDelta(dx, dy, sensitivity = lookSensitivity) {
  if (state !== 'playing') return;
  player.yaw -= dx * sensitivity;
  player.pitch -= dy * sensitivity;
  player.pitch = clamp(player.pitch, -1.32, 1.32);
  if (player.hidden) {
    player.yaw = player.hideBaseYaw + clamp(wrapAngle(player.yaw - player.hideBaseYaw), -0.65, 0.65);
    player.pitch = clamp(player.pitch, -0.42, 0.42);
  }
}

// keyboard
addEventListener('keydown', (e) => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  if (e.repeat) return;
  input.keys.add(e.code);
  if (state === 'playing') {
    if (e.code === 'KeyE' || e.code === 'Space') useAction();
    if (e.code === 'KeyF') toggleLight();
    if (e.code === 'Escape' || e.code === 'KeyP') { togglePause(); }
    if (introOverlay.classList.contains('hidden') === false) dismissIntro();
  } else if (state === 'paused' && (e.code === 'Escape' || e.code === 'KeyP')) {
    togglePause(false);
  }
});
addEventListener('keyup', (e) => {
  input.keys.delete(e.code);
});

// mouse look / pointer lock
canvas.addEventListener('click', () => {
  if (state === 'playing' && !isTouch && document.pointerLockElement !== canvas) {
    canvas.requestPointerLock?.();
  }
});
document.addEventListener('pointerlockchange', () => {
  input.pointerLock = document.pointerLockElement === canvas;
});
document.addEventListener('mousemove', (e) => {
  if (state !== 'playing') return;
  if (document.pointerLockElement === canvas) {
    lookDelta(e.movementX, e.movementY);
  } else if (mouseDown) {
    lookDelta(e.movementX, e.movementY);
  }
});
let mouseDown = false;
canvas.addEventListener('pointerdown', (e) => {
  if (e.pointerType === 'mouse') {
    mouseDown = true;
    if (state === 'playing' && introOverlay.classList.contains('hidden') === false) dismissIntro();
  } else if (e.pointerType === 'touch' || e.pointerType === 'pen') {
    if (state !== 'playing') return;
    input.lookId = e.pointerId;
    input.lookX = e.clientX;
    input.lookY = e.clientY;
    canvas.setPointerCapture(e.pointerId);
    if (introOverlay.classList.contains('hidden') === false) dismissIntro();
  }
});
canvas.addEventListener('pointermove', (e) => {
  if (e.pointerType !== 'mouse' && e.pointerId === input.lookId) {
    const dx = e.clientX - input.lookX;
    const dy = e.clientY - input.lookY;
    input.lookX = e.clientX;
    input.lookY = e.clientY;
    lookDelta(dx, dy, 0.0034);
  }
});
canvas.addEventListener('pointerup', (e) => {
  if (e.pointerType === 'mouse') mouseDown = false;
  if (e.pointerId === input.lookId) input.lookId = null;
});
canvas.addEventListener('pointercancel', (e) => {
  if (e.pointerId === input.lookId) input.lookId = null;
});
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

// joystick
const joyBase = $('joystick-base');
const joyKnob = $('joystick-knob');
joyBase.addEventListener('pointerdown', (e) => {
  if (state !== 'playing') return;
  e.preventDefault();
  input.joyId = e.pointerId;
  joyBase.setPointerCapture(e.pointerId);
  updateJoy(e);
  if (introOverlay.classList.contains('hidden') === false) dismissIntro();
});
joyBase.addEventListener('pointermove', (e) => {
  if (e.pointerId !== input.joyId) return;
  updateJoy(e);
});
function endJoy(e) {
  if (e.pointerId !== input.joyId) return;
  input.joyId = null;
  input.joyX = 0; input.joyY = 0; input.joyMag = 0;
  joyKnob.style.transform = 'translate(0px, 0px)';
}
joyBase.addEventListener('pointerup', endJoy);
joyBase.addEventListener('pointercancel', endJoy);
function updateJoy(e) {
  const rect = joyBase.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  let dx = e.clientX - cx;
  let dy = e.clientY - cy;
  const max = rect.width * 0.36;
  const len = Math.hypot(dx, dy);
  if (len > max) { dx = dx / len * max; dy = dy / len * max; }
  joyKnob.style.transform = `translate(${dx}px, ${dy}px)`;
  input.joyX = dx / max;
  input.joyY = -dy / max;
  input.joyMag = Math.min(1, len / max);
}
// sprint touch
sprintBtn.addEventListener('pointerdown', (e) => {
  e.preventDefault(); e.stopPropagation();
  input.sprintHeld = true;
  sprintBtn.classList.add('on');
  audio.init();
  if (state === 'playing' && introOverlay.classList.contains('hidden') === false) dismissIntro();
});
const releaseSprint = (e) => {
  if (e) e.stopPropagation();
  input.sprintHeld = false;
  sprintBtn.classList.remove('on');
};
sprintBtn.addEventListener('pointerup', releaseSprint);
sprintBtn.addEventListener('pointercancel', releaseSprint);
sprintBtn.addEventListener('pointerleave', releaseSprint);

// buttons
useBtn.addEventListener('pointerdown', (e) => {
  e.preventDefault(); e.stopPropagation();
  useAction();
});
lightBtn.addEventListener('pointerdown', (e) => {
  e.preventDefault(); e.stopPropagation();
  toggleLight();
});
pauseBtn.addEventListener('click', (e) => { e.stopPropagation(); togglePause(true); });
resumeBtn.addEventListener('click', () => togglePause(false));
muteBtn.addEventListener('click', () => {
  audio.setMuted(!audio.muted);
  muteBtn.textContent = audio.muted ? 'SOUND: OFF' : 'SOUND: ON';
});
startBtn.addEventListener('click', startGame);
againBtn.addEventListener('click', () => {
  endScreen.classList.add('hidden');
  audio.setMuted(false);
  muteBtn.textContent = 'SOUND: ON';
  state = 'playing';
  resetGame();
  setTimeout(() => showSubtitle('The house remembers you. It will be harder to hide.', 3800), 2400);
});

// dismiss intro on any activity
addEventListener('pointerdown', () => {
  if (state === 'playing' && !introOverlay.classList.contains('hidden')) {
    // small delay so the first tap is not eaten
    if (performance.now() - gameStart > 900) dismissIntro();
  }
}, { passive: true });

// visibility
document.addEventListener('visibilitychange', () => {
  if (document.hidden && state === 'playing') togglePause(true);
});

// resize
function resize() {
  renderer.setPixelRatio(MAX_PR * renderScale);
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  rotateHint.classList.toggle('hidden', !(isTouch && innerHeight > innerWidth && state === 'playing'));
}
addEventListener('resize', resize);
setInterval(() => {
  rotateHint.classList.toggle('hidden', !(isTouch && innerHeight > innerWidth && state === 'playing' && performance.now() - gameStart > 7000));
}, 1200);

// intro control text
if (isTouch) {
  $('intro-controls').textContent = 'Left stick to move · drag to look · ✦ to act · RUN to sprint';
}

// boot
drawScareFace();
setTimeout(() => boot.classList.add('done'), 500);
setTimeout(() => boot.remove(), 1500);

updateFlashlight();
world.exit.setLit(0);
animate();

// expose a tiny debug API for verification
window.__hollow = {
  scene, renderer, camera, THREE, world, audio,
  setScale(v) { renderScale = v; renderer.setPixelRatio(MAX_PR * v); },
  get state() { return state; },
  get relics() { return relics; },
  get player() { return player; },
  get ghost() { return ghost; },
  get candles() { return candles; },
  start: startGame,
  use: useAction,
  light: toggleLight,
  teleport(x, z) { player.pos.set(x, 0, z); updateCamera(0); },
  collectAll() {
    for (const c of [...candles]) if (!c.taken) collectCandle(c);
  },
  win() { if (state === 'playing') { relics = 3; world.exit.setOpen(true); world.exit.openness = 1; player.pos.set(0, 0, 14.4); checkWin(); } }
};
