import * as THREE from '../vendor/three.module.js';
import {
  wallpaperTexture, woodTexture, darkWoodTexture, stoneTexture, plasterTexture,
  rugTexture, portraitTexture, glowTexture, stainedGlassTexture, moonTexture, dustTexture, skyTexture
} from './textures.js';

export const WALL_HEIGHT = 3.5;

function lambert(params = {}) {
  const { roughness, metalness, ...rest } = params;
  return new THREE.MeshLambertMaterial(rest);
}

const ROOM_DEFS = [
  { id: 'library', name: 'THE LIBRARY', minX: -16, maxX: -4, minZ: -14, maxZ: -4 },
  { id: 'chapel', name: 'THE CHAPEL', minX: -4, maxX: 4, minZ: -14, maxZ: -4 },
  { id: 'study', name: 'THE STUDY', minX: 4, maxX: 16, minZ: -14, maxZ: -4 },
  { id: 'dining', name: 'THE DINING ROOM', minX: -16, maxX: -4, minZ: -4, maxZ: 4 },
  { id: 'hall', name: 'THE GREAT HALL', minX: -4, maxX: 4, minZ: -4, maxZ: 4 },
  { id: 'kitchen', name: 'THE KITCHEN', minX: 4, maxX: 16, minZ: -4, maxZ: 4 },
  { id: 'parlor', name: 'THE PARLOR', minX: -16, maxX: -4, minZ: 4, maxZ: 14 },
  { id: 'foyer', name: 'THE FOYER', minX: -4, maxX: 4, minZ: 4, maxZ: 14 },
  { id: 'music', name: 'THE MUSIC ROOM', minX: 4, maxX: 16, minZ: 4, maxZ: 14 },
];

const CANDLE_SPOTS = [
  { room: 'library', x: -12, z: -9 },
  { room: 'library', x: -7, z: -12 },
  { room: 'library', x: -13.4, z: -5.6 },
  { room: 'chapel', x: 0, z: -11.2 },
  { room: 'chapel', x: -2.6, z: -8.3 },
  { room: 'chapel', x: 2.9, z: -12.3 },
  { room: 'study', x: 12, z: -11.6 },
  { room: 'study', x: 7.4, z: -6.2 },
  { room: 'study', x: 14, z: -7.2 },
  { room: 'dining', x: -12.2, z: 1.2 },
  { room: 'dining', x: -6.6, z: -2.6 },
  { room: 'dining', x: -12.4, z: -2.8 },
  { room: 'hall', x: 0, z: 0.4 },
  { room: 'hall', x: 2.35, z: 2.2 },
  { room: 'hall', x: -2.35, z: 2.2 },
  { room: 'kitchen', x: 13.2, z: 2.1 },
  { room: 'kitchen', x: 7, z: -2.2 },
  { room: 'kitchen', x: 12.2, z: -1.4 },
  { room: 'parlor', x: -12, z: 11.5 },
  { room: 'parlor', x: -6.6, z: 7.9 },
  { room: 'parlor', x: -13.5, z: 12.5 },
  { room: 'music', x: 12, z: 7.6 },
  { room: 'music', x: 6, z: 12.2 },
  { room: 'music', x: 14, z: 8.6 },
];

export function buildWorld(scene) {
  const colliders = [];
  const lights = [];
  const flickerLights = [];
  const fires = [];
  const glowSprites = [];

  const H = WALL_HEIGHT;
  const mats = makeMaterials();

  // ── shared helpers ─────────────────────────────────────────
  function addCollider(cx, cz, w, d, tag = 'solid') {
    const c = {
      minX: cx - w / 2, maxX: cx + w / 2,
      minZ: cz - d / 2, maxZ: cz + d / 2,
      tag, enabled: true
    };
    colliders.push(c);
    return c;
  }

  function box(x, y, z, w, h, d, material, opts = {}) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    if (opts.ry) mesh.rotation.y = opts.ry;
    mesh.castShadow = !!opts.castShadow;
    mesh.receiveShadow = opts.receiveShadow !== false;
    scene.add(mesh);
    if (opts.collide) {
      if (Math.abs(Math.sin(opts.ry || 0)) > 0.7) addCollider(x, z, d, w, opts.tag);
      else addCollider(x, z, w, d, opts.tag);
    }
    return mesh;
  }

  function cyl(x, y, z, rTop, rBot, h, material, seg = 10) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, h, seg), material);
    mesh.position.set(x, y, z);
    mesh.receiveShadow = true;
    scene.add(mesh);
    return mesh;
  }

  function glow(x, y, z, size, color = '#ffd28a', opacity = 0.7) {
    const mat = new THREE.SpriteMaterial({
      map: getGlowTexture(color), transparent: true, opacity,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: true
    });
    const s = new THREE.Sprite(mat);
    s.position.set(x, y, z);
    s.scale.set(size, size, 1);
    s.userData.baseOpacity = opacity;
    scene.add(s);
    glowSprites.push(s);
    return s;
  }

  function addFlicker(light, base, speed = 7, phase = 0) {
    flickerLights.push({ light, base, speed, phase });
    lights.push(light);
    return light;
  }

  function pointLight(x, y, z, color, intensity, distance, decay = 1.7) {
    const l = new THREE.PointLight(color, intensity, distance, decay);
    l.position.set(x, y, z);
    scene.add(l);
    return l;
  }

  // ── floors & ceilings ──────────────────────────────────────
  const floorMaterials = {};
  for (const r of ROOM_DEFS) {
    const w = r.maxX - r.minX;
    const d = r.maxZ - r.minZ;
    const wm = mats.wood.clone();
    wm.map = mats.wood.map.clone();
    wm.map.needsUpdate = true;
    wm.map.repeat.set(w / 5.2, d / 5.2);
    wm.map.rotation = Math.PI / 2;
    wm.color = new THREE.Color(r.id === 'chapel' ? 0x8a9490 : r.id === 'kitchen' ? 0xa8a49a : 0xffffff);

    const floorMat = r.id === 'chapel' ? mats.stoneFloor : r.id === 'kitchen' ? mats.kitchenFloor : wm;
    floorMaterials[r.id] = floorMat;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, d), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set((r.minX + r.maxX) / 2, 0.015, (r.minZ + r.maxZ) / 2);
    floor.receiveShadow = true;
    scene.add(floor);
  }

  // ceiling
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(32, 28), mats.ceiling);
  ceil.rotation.x = Math.PI / 2;
  ceil.position.set(0, H, 0);
  scene.add(ceil);

  // ── walls ──────────────────────────────────────────────────
  const exteriorWalls = [
    [-16, 14, -1.22, 14], [1.22, 14, 16, 14],
    [-16, -14, 16, -14],
    [-16, -14, -16, 14],
    [16, -14, 16, 14],
  ];
  const interiorWalls = [
    [-4, -14, -4, -10], [-4, -8, -4, -1], [-4, 1, -4, 8], [-4, 10, -4, 14],
    [4, -14, 4, -10], [4, -8, 4, -1], [4, 1, 4, 8], [4, 10, 4, 14],
    [-16, -4, -14, -4], [-12, -4, -1, -4], [1, -4, 12, -4], [14, -4, 16, -4],
    [-16, 4, -14, 4], [-12, 4, -4, 4], [-4, 4, -1, 4], [1, 4, 4, 4],
    [4, 4, 12, 4], [14, 4, 16, 4],
  ];

  for (const [x1, z1, x2, z2] of exteriorWalls) addWall(x1, z1, x2, z2, 0.5, true);
  for (const [x1, z1, x2, z2] of interiorWalls) addWall(x1, z1, x2, z2, 0.3, false);

  function addWall(x1, z1, x2, z2, thick, exterior) {
    const horizontal = Math.abs(x2 - x1) > Math.abs(z2 - z1);
    const length = horizontal ? Math.abs(x2 - x1) : Math.abs(z2 - z1);
    if (length < 0.05) return;
    const cx = (x1 + x2) / 2, cz = (z1 + z2) / 2;

    const map = mats.wallpaper.map.clone();
    map.needsUpdate = true;
    map.repeat.set(length / 2.4, H / 2.4);
    const wallMat = mats.wallpaper.clone();
    wallMat.map = map;
    if (exterior) wallMat.color = new THREE.Color(0x879491);
    wallMat.side = THREE.FrontSide;

    const geo = new THREE.BoxGeometry(horizontal ? length : thick, H, horizontal ? thick : length);
    const mesh = new THREE.Mesh(geo, wallMat);
    mesh.position.set(cx, H / 2, cz);
    mesh.receiveShadow = true;
    scene.add(mesh);

    // dark wainscot around the lower wall
    const wain = new THREE.Mesh(
      new THREE.BoxGeometry(horizontal ? length + 0.02 : thick + 0.09, 1.1, horizontal ? thick + 0.09 : length + 0.02),
      mats.wainscot
    );
    wain.position.set(cx, 0.56, cz);
    wain.receiveShadow = true;
    scene.add(wain);

    // baseboard + crown
    const base = new THREE.Mesh(
      new THREE.BoxGeometry(horizontal ? length + 0.02 : thick + 0.14, 0.11, horizontal ? thick + 0.14 : length + 0.02),
      mats.trim
    );
    base.position.set(cx, 0.055, cz);
    scene.add(base);

    const crown = new THREE.Mesh(
      new THREE.BoxGeometry(horizontal ? length + 0.02 : thick + 0.12, 0.13, horizontal ? thick + 0.12 : length + 0.02),
      mats.trim
    );
    crown.position.set(cx, H - 0.08, cz);
    scene.add(crown);

    addCollider(cx, cz, horizontal ? length + (exterior ? 0.1 : 0.06) : thick, horizontal ? thick : length + (exterior ? 0.1 : 0.06), 'wall');
  }

  // ── doorway frames & ajar doors ────────────────────────────
  // vertical wall doors: [x, z1, z2]
  const vDoors = [
    [-4, -10, -8], [-4, -1, 1], [-4, 8, 10],
    [4, -10, -8], [4, -1, 1], [4, 8, 10],
  ];
  // horizontal wall doors: [z, x1, x2]
  const hDoors = [
    [-4, -14, -12], [-4, -1, 1], [-4, 12, 14],
    [4, -14, -12], [4, -1, 1], [4, 12, 14],
  ];

  vDoors.forEach(([x, z1, z2], i) => {
    addDoorFrame('v', x, z1, z2);
    addDoorPanel('v', x, z1, z2, i % 3 === 0 ? 1 : -1);
  });
  hDoors.forEach(([z, x1, x2], i) => {
    addDoorFrame('h', z, x1, x2);
    addDoorPanel('h', z, x1, x2, i % 2 === 0 ? 1 : -1);
  });

  function addDoorFrame(axis, fixed, a, b) {
    const gap = Math.abs(b - a);
    const center = (a + b) / 2;
    const post = 0.16;
    if (axis === 'v') {
      box(fixed, 1.38, a + 0.05, 0.52, 2.76, post, mats.trim);
      box(fixed, 1.38, b - 0.05, 0.52, 2.76, post, mats.trim);
      box(fixed, 2.78, center, 0.52, 0.22, gap, mats.trim);
      box(fixed, 2.9, center, 0.62, 0.1, gap + 0.22, mats.trim);
    } else {
      box(a + 0.05, 1.38, fixed, post, 2.76, 0.52, mats.trim);
      box(b - 0.05, 1.38, fixed, post, 2.76, 0.52, mats.trim);
      box(center, 2.78, fixed, gap, 0.22, 0.52, mats.trim);
      box(center, 2.9, fixed, gap + 0.22, 0.1, 0.62, mats.trim);
    }
  }

  function addDoorPanel(axis, fixed, a, b, direction) {
    const gap = Math.abs(b - a) - 0.14;
    const group = new THREE.Group();
    const hingeX = axis === 'h' ? a + 0.07 : fixed;
    const hingeZ = axis === 'v' ? a + 0.07 : fixed;
    group.position.set(hingeX, 1.36, hingeZ);
    const baseAngle = axis === 'v' ? -Math.PI / 2 : 0;
    group.rotation.y = baseAngle + direction * (1.72 + Math.random() * 0.22);

    const panel = new THREE.Mesh(new THREE.BoxGeometry(gap, 2.62, 0.075), mats.door);
    panel.position.x = gap / 2;
    panel.castShadow = true;
    group.add(panel);

    // recessed door panels
    for (let i = 0; i < 2; i++) {
      const inset = new THREE.Mesh(new THREE.BoxGeometry(gap * 0.62, 0.92, 0.035), mats.doorInset);
      inset.position.set(gap / 2, i === 0 ? 0.58 : -0.62, 0.05);
      group.add(inset);
    }
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 8), mats.brass);
    knob.position.set(gap * 0.86, 0, 0.09);
    group.add(knob);
    scene.add(group);
  }

  // ── grand exit door (foyer south wall) ─────────────────────
  const exit = buildExitDoor();

  function buildExitDoor() {
    box(-1.35, 1.38, 14, 0.2, 2.76, 0.6, mats.trim);
    box(1.35, 1.38, 14, 0.2, 2.76, 0.6, mats.trim);
    box(0, 2.9, 14, 3.1, 0.2, 0.7, mats.trim);
    // wall above the double doors (the doorway gap runs to the ceiling)
    box(0, 3.2, 14, 2.9, 0.62, 0.62, mats.wainscot);

    const leftPivot = new THREE.Group();
    leftPivot.position.set(-1.2, 1.38, 13.86);
    leftPivot.userData.dynamic = true;
    const rightPivot = new THREE.Group();
    rightPivot.position.set(1.2, 1.38, 13.86);
    rightPivot.userData.dynamic = true;

    const makePanel = (w, sign) => {
      const g = new THREE.Group();
      const p = new THREE.Mesh(new THREE.BoxGeometry(w, 2.72, 0.09), mats.door);
      p.position.x = sign * w / 2;
      p.castShadow = true;
      g.add(p);
      for (let i = 0; i < 3; i++) {
        const inset = new THREE.Mesh(new THREE.BoxGeometry(w * 0.66, 0.54, 0.035), mats.doorInset);
        inset.position.set(sign * w / 2, 0.82 - i * 0.78, 0.055);
        g.add(inset);
      }
      const handle = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), mats.brass);
      handle.position.set(sign * (w - 0.14), 0, 0.1);
      g.add(handle);
      return g;
    };
    leftPivot.add(makePanel(1.2, 1));
    rightPivot.add(makePanel(1.2, -1));

    // three rune sockets on the left door
    const sockets = [];
    for (let i = 0; i < 3; i++) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.105, 0.022, 8, 18), mats.runeOff);
      ring.position.set(0.55 + (i - 1) * 0.3, 1.02, 0.09);
      leftPivot.add(ring);
      sockets.push(ring);
    }

    scene.add(leftPivot, rightPivot);

    const collider = addCollider(0, 13.98, 2.55, 0.36, 'exit');

    const doorGlow = glow(0, 2.1, 13.55, 1.4, '#93c8c3', 0.14);

    return {
      leftPivot, rightPivot, sockets, collider, open: false, opening: false, openness: 0,
      setOpen(on) {
        this.opening = on;
        if (on) collider.enabled = false;
      },
      reset() {
        this.open = false; this.opening = false; this.openness = 0;
        collider.enabled = true;
        leftPivot.rotation.y = 0; rightPivot.rotation.y = 0;
        sockets.forEach((s, i) => { s.material = i < 0 ? mats.runeOn : mats.runeOff; });
        doorGlow.material.opacity = 0.02;
        doorGlow.userData.baseOpacity = 0.02;
      },
      setLit(n) {
        sockets.forEach((s, i) => { s.material = i < n ? mats.runeOn : mats.runeOff; });
        doorGlow.material.opacity = 0.02 + n * 0.05;
        doorGlow.userData.baseOpacity = 0.02 + n * 0.05;
      },
      update(dt) {
        if (this.opening && this.openness < 1) {
          this.openness = Math.min(1, this.openness + dt / 2.3);
          const e = easeInOut(this.openness);
          leftPivot.rotation.y = e * 1.86;
          rightPivot.rotation.y = -e * 1.86;
          if (this.openness >= 1) this.open = true;
        }
        if (this.open) {
          doorGlow.material.opacity = 0.35 + Math.sin(performance.now() * 0.003) * 0.1;
        }
      }
    };
  }

  function easeInOut(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }

  // porch / outside
  const porch = new THREE.Mesh(new THREE.PlaneGeometry(12, 8), mats.porch);
  porch.rotation.x = -Math.PI / 2;
  porch.position.set(0, 0.0, 18);
  scene.add(porch);

  // the night you are trying to reach
  const sky = new THREE.Mesh(
    new THREE.PlaneGeometry(54, 26),
    new THREE.MeshBasicMaterial({ map: skyTexture(), fog: false })
  );
  sky.position.set(0, 8, 33);
  sky.rotation.y = Math.PI;
  scene.add(sky);
  const outsideGround = new THREE.Mesh(
    new THREE.PlaneGeometry(54, 24),
    new THREE.MeshBasicMaterial({ color: 0x070c09 })
  );
  outsideGround.rotation.x = -Math.PI / 2;
  outsideGround.position.set(0, -0.02, 26);
  scene.add(outsideGround);
  for (let i = 0; i < 8; i++) {
    const stone = new THREE.Mesh(
      new THREE.BoxGeometry(1.2 + Math.random() * 0.4, 0.06, 0.7),
      new THREE.MeshBasicMaterial({ color: 0x222824 })
    );
    stone.position.set(-0.35 + (Math.random() - 0.5) * 0.5, 0.015, 15.4 + i * 1.25);
    stone.rotation.y = (Math.random() - 0.5) * 0.2;
    scene.add(stone);
  }
  const porchLight = pointLight(0, 3.4, 18.5, 0x87aebc, 16, 16, 1.6);
  addFlicker(porchLight, 16, 0.4, 2.2);
  box(-2.4, 0.32, 14.65, 0.45, 0.65, 3.6, mats.stone);
  box(2.4, 0.32, 14.65, 0.45, 0.65, 3.6, mats.stone);
  for (let i = 0; i < 3; i++) {
    box(0, 0.08 + i * 0.055, 14.8 + i * 0.32, 3.1 - i * 0.1, 0.11, 0.45, mats.stone);
  }
  // distant tree silhouettes outside the door
  for (let i = 0; i < 8; i++) {
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.26, 5 + Math.random() * 5, 5), mats.bark);
    t.position.set(-14 + i * 4 + Math.random() * 2, 2.5, 21 + Math.random() * 6);
    scene.add(t);
    const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(1.6 + Math.random() * 1.2, 0), mats.foliage);
    crown.position.set(t.position.x, t.position.y + 2.4, t.position.z);
    crown.scale.y = 1.35;
    scene.add(crown);
  }

  // ── wall decor: paintings, windows, sconces ────────────────
  function painting(x, y, z, ry, variant = 0, w = 1.1, h = 1.65) {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    g.rotation.y = ry;
    const frame = new THREE.Mesh(new THREE.BoxGeometry(w + 0.16, h + 0.16, 0.08), mats.goldFrame);
    g.add(frame);
    const canvasMesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), lambert({
      map: portraitTexture(variant), roughness: 0.8, emissive: 0x0b0b08, emissiveIntensity: 0.2
    }));
    canvasMesh.position.z = 0.05;
    g.add(canvasMesh);
    scene.add(g);
  }

  painting(-3.78, 2.1, 1.2, Math.PI / 2, 0, 0.95, 1.45);
  painting(-3.78, 2.1, -1.7, Math.PI / 2, 1, 0.8, 1.2);
  painting(3.78, 2.05, 0.6, -Math.PI / 2, 1, 1.0, 1.5);
  painting(-9.4, 2.2, 3.78, Math.PI, 1, 1.3, 1.9);
  painting(-11.5, 2.15, -3.78, 0, 0, 1.0, 1.5);
  painting(9.5, 2.15, 3.78, Math.PI, 0, 1.15, 1.7);
  painting(3.78, 2.1, 8.9, -Math.PI / 2, 0, 0.9, 1.35);

  function windowFrame(x, y, z, ry, w = 2.2, h = 2.9, stained = false) {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    g.rotation.y = ry;
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({
      map: stained ? stainedGlassTexture() : moonTexture(),
      transparent: true, opacity: stained ? 0.85 : 0.75,
      color: stained ? 0xffffff : 0x9fb8c4,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: true
    }));
    g.add(glass);
    const t = 0.1;
    const frameMat = mats.trim;
    const top = new THREE.Mesh(new THREE.BoxGeometry(w + 0.22, 0.16, 0.18), frameMat); top.position.y = h / 2 + 0.08; g.add(top);
    const bot = new THREE.Mesh(new THREE.BoxGeometry(w + 0.28, 0.28, 0.32), frameMat); bot.position.y = -h / 2 - 0.1; g.add(bot);
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.14, h, 0.18), frameMat); l.position.x = -w / 2 - 0.07; g.add(l);
    const r = new THREE.Mesh(new THREE.BoxGeometry(0.14, h, 0.18), frameMat); r.position.x = w / 2 + 0.07; g.add(r);
    const mid = new THREE.Mesh(new THREE.BoxGeometry(0.07, h, 0.12), frameMat); g.add(mid);
    const midH = new THREE.Mesh(new THREE.BoxGeometry(w, 0.07, 0.12), frameMat); g.add(midH);
    // arch
    const arch = new THREE.Mesh(new THREE.TorusGeometry(w * 0.52, 0.08, 6, 16, Math.PI), frameMat);
    arch.position.y = h / 2; g.add(arch);
    scene.add(g);
    return g;
  }

  windowFrame(0, 1.9, -13.67, 0, 2.6, 3.0, true);
  windowFrame(-15.67, 2.0, -10.2, Math.PI / 2, 1.8, 2.4, false);
  windowFrame(15.67, 2.0, 6.9, -Math.PI / 2, 1.8, 2.4, false);
  windowFrame(-15.67, 2.0, 10.7, Math.PI / 2, 1.8, 2.4, true);

  const moonGlow = glow(0, 2.4, -13.4, 5.5, '#9dc7d2', 0.18);

  function sconce(x, y, z, ry) {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    g.rotation.y = ry;
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.42, 0.08), mats.iron);
    arm.position.set(0, 0, 0.2);
    arm.rotation.x = -0.4;
    g.add(arm);
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.07, 0.12, 8), mats.iron);
    cup.position.set(0, 0.2, 0.35);
    g.add(cup);
    const candle = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.28, 7), mats.wax);
    candle.position.set(0, 0.38, 0.35);
    g.add(candle);
    const flame = new THREE.Mesh(new THREE.SphereGeometry(0.045, 7, 7), mats.flame);
    flame.scale.y = 1.8;
    flame.position.set(0, 0.56, 0.35);
    g.add(flame);
    scene.add(g);
    const gl = glow(x + Math.sin(ry) * 0.35, y + 0.56, z + Math.cos(ry) * 0.35, 1.2, '#ffb45e', 0.44);
    return gl;
  }
  sconce(-3.82, 1.75, 7.2, Math.PI / 2);
  sconce(3.82, 1.75, 7.2, -Math.PI / 2);
  sconce(-3.82, 1.75, -2.7, Math.PI / 2);
  sconce(3.82, 1.75, -2.7, -Math.PI / 2);
  sconce(9.8, 1.8, -3.8, Math.PI);
  sconce(-9.8, 1.8, -3.8, Math.PI);

  // ── chandeliers ────────────────────────────────────────────
  function chandelier(x, z, intensity = 10) {
    const g = new THREE.Group();
    g.position.set(x, 2.72, z);
    const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, H - 2.72, 5), mats.iron);
    chain.position.y = (H - 2.72) / 2;
    g.add(chain);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.035, 6, 20), mats.iron);
    ring.rotation.x = Math.PI / 2;
    g.add(ring);
    const inner = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.022, 6, 16), mats.iron);
    inner.rotation.x = Math.PI / 2;
    inner.position.y = 0.12;
    g.add(inner);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      const px = Math.cos(a) * 0.62, pz = Math.sin(a) * 0.62;
      const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.04, 0.08, 7), mats.iron);
      cup.position.set(px, 0.03, pz);
      g.add(cup);
      const wax = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.034, 0.26, 6), mats.wax);
      wax.position.set(px, 0.19, pz);
      g.add(wax);
      const flame = new THREE.Mesh(new THREE.SphereGeometry(0.036, 6, 6), mats.flame);
      flame.scale.y = 1.7;
      flame.position.set(px, 0.35, pz);
      g.add(flame);
    }
    scene.add(g);
    const gl = glow(x, 2.55, z, 4.2, '#ffc071', 0.32);
    const l = pointLight(x, 2.55, z, 0xffc98b, intensity, 15, 1.5);
    addFlicker(l, intensity, 5.4, Math.random() * 4);
    return gl;
  }
  chandelier(0, 10.6, 12);
  chandelier(0, 0, 11);

  // ── furniture builders ─────────────────────────────────────
  function table(x, z, w, d, ry = 0, h = 0.78, mat = mats.darkWood) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = ry;
    const top = new THREE.Mesh(new THREE.BoxGeometry(w, 0.12, d), mat);
    top.position.y = h;
    top.castShadow = true;
    top.receiveShadow = true;
    g.add(top);
    const legW = 0.09;
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(legW, h, legW), mat);
        leg.position.set(sx * (w / 2 - 0.12), h / 2, sz * (d / 2 - 0.12));
        leg.castShadow = true;
        g.add(leg);
      }
    }
    scene.add(g);
    addCollider(x, z, ry ? d : w, ry ? w : d, 'table');
    return g;
  }

  function chair(x, z, ry = 0, mat = mats.darkWood) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = ry;
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.08, 0.48), mat);
    seat.position.y = 0.47;
    g.add(seat);
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.72, 0.06), mat);
    back.position.set(0, 0.85, -0.21);
    g.add(back);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.47, 0.055), mat);
      leg.position.set(sx * 0.19, 0.235, sz * 0.19);
      g.add(leg);
    }
    scene.add(g);
    addCollider(x, z, 0.5, 0.5, 'chair');
    return g;
  }

  function bookshelf(x, z, ry, width = 2.4, height = 2.7) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = ry;
    const body = new THREE.Mesh(new THREE.BoxGeometry(width, height, 0.48), mats.darkWood);
    body.position.y = height / 2;
    body.castShadow = true;
    g.add(body);
    // inner back
    const inner = new THREE.Mesh(new THREE.BoxGeometry(width - 0.2, height - 0.2, 0.05), mats.shelfBack);
    inner.position.set(0, height / 2, -0.21);
    g.add(inner);
    const shelfCount = 4;
    for (let s = 0; s < shelfCount; s++) {
      const sy = 0.45 + s * ((height - 0.65) / shelfCount);
      const shelf = new THREE.Mesh(new THREE.BoxGeometry(width - 0.18, 0.055, 0.38), mats.darkWood);
      shelf.position.set(0, sy, 0.04);
      g.add(shelf);
      let bx = -width / 2 + 0.2;
      while (bx < width / 2 - 0.25) {
        const bw = 0.055 + Math.random() * 0.055;
        const bh = 0.28 + Math.random() * 0.22;
        const book = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, 0.24), mats.books[Math.floor(Math.random() * mats.books.length)]);
        book.position.set(bx + bw / 2, sy + bh / 2 + 0.03, 0.09);
        book.rotation.z = Math.random() > 0.92 ? 0.12 : 0;
        g.add(book);
        bx += bw + 0.012;
      }
    }
    scene.add(g);
    if (Math.abs(Math.sin(ry)) > 0.7) addCollider(x, z, 0.5, width, 'shelf');
    else addCollider(x, z, width, 0.5, 'shelf');
    return g;
  }

  function fireplace(x, z, ry) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = ry;
    const surround = new THREE.Mesh(new THREE.BoxGeometry(2.7, 1.7, 0.5), mats.stone);
    surround.position.y = 0.85;
    g.add(surround);
    const opening = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.1, 0.52), mats.black);
    opening.position.set(0, 0.68, 0.02);
    g.add(opening);
    const mantle = new THREE.Mesh(new THREE.BoxGeometry(3.1, 0.16, 0.7), mats.darkWood);
    mantle.position.y = 1.72;
    g.add(mantle);

    const fireGroup = new THREE.Group();
    fireGroup.position.set(0, 0.22, 0.2);
    const flameSpecs = [
      { color: '#ff5a12', sx: 1.25, sy: 2.1, op: 0.55, y: 0.38 },
      { color: '#ffae3d', sx: 0.8, sy: 1.4, op: 0.7, y: 0.34 },
      { color: '#fff0b0', sx: 0.38, sy: 0.7, op: 0.85, y: 0.28 },
    ];
    const fireSprites = [];
    for (const spec of flameSpecs) {
      const m = new THREE.SpriteMaterial({
        map: getGlowTexture(spec.color), transparent: true, opacity: spec.op,
        blending: THREE.AdditiveBlending, depthWrite: false, color: 0xffffff
      });
      const s = new THREE.Sprite(m);
      s.position.y = spec.y;
      s.scale.set(spec.sx, spec.sy, 1);
      s.userData = { baseX: spec.sx, baseY: spec.sy, baseOp: spec.op };
      fireGroup.add(s);
      fireSprites.push(s);
    }
    g.add(fireGroup);
    for (let i = 0; i < 5; i++) {
      const log = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.9, 6), mats.bark);
      log.rotation.z = Math.PI / 2;
      log.position.set((Math.random() - 0.5) * 0.5, 0.18 + Math.random() * 0.15, 0.15);
      g.add(log);
    }
    scene.add(g);
    addCollider(x, z, ry ? 0.55 : 2.8, ry ? 2.8 : 0.55, 'fireplace');
    const wx = x + Math.sin(ry) * 0.5;
    const wz = z + Math.cos(ry) * 0.5;
    const light = pointLight(wx, 0.9, wz, 0xff7a2a, 9, 8, 1.8);
    addFlicker(light, 9, 11, Math.random() * 5);
    const gl = glow(wx, 0.8, wz, 2.4, '#ff7c2e', 0.3);
    fires.push({ group: fireGroup, sprites: fireSprites, light, base: 9, phase: Math.random() * 6 });
    return g;
  }

  function sofa(x, z, ry, len = 2.2) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = ry;
    const base = new THREE.Mesh(new THREE.BoxGeometry(len, 0.42, 0.95), mats.sofa);
    base.position.y = 0.32;
    base.castShadow = true;
    g.add(base);
    const back = new THREE.Mesh(new THREE.BoxGeometry(len, 0.72, 0.22), mats.sofa);
    back.position.set(0, 0.82, -0.37);
    g.add(back);
    for (const sx of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.55, 0.95), mats.sofa);
      arm.position.set(sx * (len / 2 - 0.1), 0.56, 0);
      g.add(arm);
    }
    for (let i = 0; i < 2; i++) {
      const cushion = new THREE.Mesh(new THREE.BoxGeometry(len / 2 - 0.2, 0.12, 0.72), mats.sofaLight);
      cushion.position.set((i - 0.5) * (len / 2), 0.56, 0.04);
      g.add(cushion);
    }
    scene.add(g);
    addCollider(x, z, ry ? 0.98 : len, ry ? len : 0.98, 'sofa');
    return g;
  }

  function armchair(x, z, ry) {
    return sofa(x, z, ry, 0.9);
  }

  function piano(x, z, ry) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = ry;
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.38, 1.5), mats.black);
    body.position.set(0, 1.0, 0);
    body.castShadow = true;
    g.add(body);
    const lid = new THREE.Mesh(new THREE.BoxGeometry(2.86, 0.06, 1.45), mats.black);
    lid.position.set(0, 1.42, 0);
    lid.rotation.z = -0.16;
    g.add(lid);
    const keys = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.06, 0.24), mats.keys);
    keys.position.set(0, 1.01, 0.78);
    g.add(keys);
    for (const sx of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.95, 0.13), mats.black);
      leg.position.set(sx * 1.25, 0.48, sx * 0.55);
      g.add(leg);
    }
    scene.add(g);
    addCollider(x, z, ry ? 1.6 : 3.0, ry ? 3.0 : 1.6, 'piano');
    return g;
  }

  function wardrobe(x, z, ry) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = ry;
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.55, 2.45, 0.68), mats.darkWood);
    body.position.y = 1.225;
    body.castShadow = true;
    g.add(body);
    // crown
    const crown = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.16, 0.8), mats.trim);
    crown.position.y = 2.5;
    g.add(crown);
    for (const sx of [-1, 1]) {
      const door = new THREE.Mesh(new THREE.BoxGeometry(0.69, 2.15, 0.06), mats.door);
      door.position.set(sx * 0.385, 1.22, 0.355);
      g.add(door);
      const inset = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.85, 0.03), mats.doorInset);
      inset.position.set(sx * 0.385, 1.42, 0.39);
      g.add(inset);
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.04, 7, 7), mats.brass);
      knob.position.set(sx * 0.07, 1.2, 0.41);
      g.add(knob);
    }
    scene.add(g);
    addCollider(x - Math.sin(ry) * 0.0, z, ry ? 0.72 : 1.6, ry ? 1.6 : 0.72, 'wardrobe');
    const front = { x: Math.sin(ry), z: Math.cos(ry) };
    const pos = new THREE.Vector3(x, z, 0);
    return {
      group: g,
      x, z, ry,
      front,
      frontPos: new THREE.Vector3(x + front.x * 1.05, 0, z + front.z * 1.05),
      camPos: new THREE.Vector3(x + front.x * 0.06, 1.52, z + front.z * 0.06),
      yaw: Math.atan2(-front.x, -front.z),
    };
  }

  function altar(x, z) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    const base = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.95, 1.05), mats.stone);
    base.position.y = 0.48;
    g.add(base);
    const top = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.12, 1.25), mats.darkWood);
    top.position.y = 1.01;
    g.add(top);
    const cloth = new THREE.Mesh(new THREE.BoxGeometry(3.42, 0.02, 1.18), mats.altarCloth);
    cloth.position.y = 1.08;
    g.add(cloth);
    scene.add(g);
    addCollider(x, z, 3.5, 1.25, 'altar');
    for (let i = 0; i < 5; i++) {
      const cx = x - 1.35 + i * 0.68;
      const wax = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.32, 7), mats.wax);
      wax.position.set(cx, 1.28, z + 0.2);
      scene.add(wax);
      const fl = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 6), mats.flame);
      fl.scale.y = 1.8;
      fl.position.set(cx, 1.5, z + 0.2);
      scene.add(fl);
      glow(cx, 1.5, z + 0.2, 0.75, '#ffbd6e', 0.35);
    }
    const l = pointLight(x, 1.7, z, 0xffc98f, 8, 7, 1.8);
    addFlicker(l, 8, 8, Math.random() * 6);
    return g;
  }

  function pew(x, z, ry = 0) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = ry;
    const seat = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.1, 0.42), mats.darkWood);
    seat.position.y = 0.52;
    g.add(seat);
    const back = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.68, 0.09), mats.darkWood);
    back.position.set(0, 0.87, -0.21);
    g.add(back);
    for (const sx of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.52, 0.55), mats.darkWood);
      leg.position.set(sx * 1.0, 0.26, 0);
      g.add(leg);
    }
    scene.add(g);
    addCollider(x, z, ry ? 0.55 : 2.35, ry ? 2.35 : 0.55, 'pew');
    return g;
  }

  function counter(x, z, w, d, h = 0.92) {
    box(x, h / 2, z, w, h, d, mats.counter, { collide: true, tag: 'counter' });
    box(x, h + 0.03, z, w + 0.08, 0.06, d + 0.08, mats.stone);
  }

  function clock(x, z, ry) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = ry;
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.85, 2.55, 0.5), mats.darkWood);
    body.position.y = 1.28;
    g.add(body);
    const face = new THREE.Mesh(new THREE.CircleGeometry(0.32, 20), mats.clockFace);
    face.position.set(0, 1.95, 0.26);
    g.add(face);
    const hand1 = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.24, 0.01), mats.black);
    hand1.position.set(0, 2.06, 0.28);
    g.add(hand1);
    const hand2 = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.025, 0.01), mats.black);
    hand2.position.set(0.06, 1.95, 0.28);
    g.add(hand2);
    const pend = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.6, 0.02), mats.brass);
    pend.position.set(0, 0.85, 0.27);
    g.add(pend);
    scene.add(g);
    addCollider(x, z, ry ? 0.55 : 0.9, ry ? 0.9 : 0.55, 'clock');
    return g;
  }

  // ── ROOM DRESSING ──────────────────────────────────────────

  // LIBRARY
  bookshelf(-12.5, -13.6, 0, 3.0, 2.9);
  bookshelf(-8.8, -13.6, 0, 3.0, 2.9);
  bookshelf(-14.9, -11.2, Math.PI / 2, 3.4, 2.9);
  bookshelf(-14.9, -5.9, Math.PI / 2, 2.6, 2.4);
  table(-10.6, -7.4, 2.7, 1.4);
  chair(-10.6, -5.9, 0);
  chair(-10.6, -8.9, Math.PI);
  chair(-12.6, -7.4, Math.PI / 2);
  glow(-10.6, 1.55, -7.4, 1.6, '#ffbd76', 0.35);
  // open book on table
  box(-10.6, 0.86, -7.4, 0.5, 0.04, 0.36, mats.paper, { ry: 0.12 });

  // CHAPEL
  altar(0, -12.35);
  for (let row = 0; row < 3; row++) {
    pew(-2.2, -10.4 + row * 1.7, 0);
    pew(2.2, -10.4 + row * 1.7, 0);
  }
  // stone pillar ruins
  box(-3.5, 1.4, -7.4, 0.5, 2.8, 0.5, mats.stone);
  box(3.5, 1.4, -7.4, 0.5, 2.8, 0.5, mats.stone);
  // offering bowl
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.22, 0.22, 12), mats.brass);
  bowl.position.set(0, 1.18, -11.9);
  scene.add(bowl);
  glow(0, 1.35, -11.9, 1.2, '#9fdfe3', 0.3);

  // STUDY
  table(10.2, -10.6, 2.8, 1.4, 0, 0.8);
  chair(10.2, -9.2, Math.PI);
  bookshelf(6.8, -13.6, 0, 2.6, 2.8);
  bookshelf(13.2, -13.6, 0, 2.6, 2.8);
  bookshelf(14.9, -10.2, -Math.PI / 2, 2.6, 2.4);
  glow(10.2, 1.5, -10.6, 1.4, '#ffc480', 0.28);
  // globe
  const globeStand = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.12, 0.9, 7), mats.brass);
  globeStand.position.set(13.8, 0.45, -6.8);
  scene.add(globeStand);
  const globe = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 8), mats.globe);
  globe.position.set(13.8, 1.05, -6.8);
  scene.add(globe);
  addCollider(13.8, -6.8, 0.9, 0.9, 'globe');
  // scattered papers
  for (let i = 0; i < 5; i++) {
    box(9 + Math.random() * 4, 0.03, -9 + Math.random() * 2, 0.4, 0.01, 0.3, mats.paper, { ry: Math.random() * 3 });
  }

  // DINING
  table(-9, 0, 6.2, 1.9, 0, 0.8, mats.darkWood);
  for (let i = 0; i < 3; i++) {
    chair(-11.2 + i * 2.2, -1.5, 0);
    chair(-11.2 + i * 2.2, 1.5, Math.PI);
  }
  chair(-13.0, 0, Math.PI / 2);
  chair(-5.0, 0, -Math.PI / 2);
  fireplace(-15.7, 0.3, Math.PI / 2);
  // candelabra on table
  for (let i = 0; i < 2; i++) {
    const cx = -10.4 + i * 2.9;
    const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.09, 0.42, 7), mats.brass);
    stand.position.set(cx, 1.02, 0);
    scene.add(stand);
    for (let c = 0; c < 3; c++) {
      const wax = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.03, 0.22, 6), mats.wax);
      wax.position.set(cx, 1.42, 0);
      scene.add(wax);
      const fl = new THREE.Mesh(new THREE.SphereGeometry(0.028, 6, 6), mats.flame);
      fl.scale.y = 1.8;
      fl.position.set(cx, 1.57, 0);
      scene.add(fl);
    }
    glow(cx, 1.55, 0, 1.5, '#ffc27a', 0.3);
  }

  // GREAT HALL
  const hallRug = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 6.6), mats.rug);
  hallRug.rotation.x = -Math.PI / 2;
  hallRug.position.set(0, 0.035, 0.6);
  scene.add(hallRug);
  clock(-3.35, -2.5, Math.PI / 2);
  // candelabra stands
  for (const sx of [-1, 1]) {
    const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.16, 1.7, 8), mats.brass);
    stand.position.set(sx * 3.2, 0.85, 1.8);
    scene.add(stand);
    for (let c = 0; c < 3; c++) {
      const a = (c / 3) * Math.PI * 2;
      const wax = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.2, 6), mats.wax);
      wax.position.set(sx * 3.2 + Math.cos(a) * 0.18, 1.8, 1.8 + Math.sin(a) * 0.18);
      scene.add(wax);
      const fl = new THREE.Mesh(new THREE.SphereGeometry(0.028, 6, 6), mats.flame);
      fl.scale.y = 1.8;
      fl.position.set(wax.position.x, 1.94, wax.position.z);
      scene.add(fl);
    }
    glow(sx * 3.2, 1.9, 1.8, 1.6, '#ffc27a', 0.25);
    addCollider(sx * 3.2, 1.8, 0.35, 0.35, 'stand');
  }
  // giant ornate mirror
  const mirror = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 2.5), mats.mirror);
  mirror.position.set(3.78, 1.85, -2.9);
  mirror.rotation.y = -Math.PI / 2;
  scene.add(mirror);
  const mirrorFrame = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.75, 1.75), mats.goldFrame);
  mirrorFrame.position.set(3.86, 1.85, -2.9);
  scene.add(mirrorFrame);

  // KITCHEN
  counter(15.2, -2.8, 1.3, 3.2, 0.95);
  counter(15.2, 0.9, 1.3, 3.4, 0.95);
  counter(7.0, 3.4, 3.4, 1.2, 0.92);
  // stove
  box(13.0, 0.45, 3.45, 1.3, 0.9, 0.9, mats.iron, { collide: true, tag: 'stove' });
  glow(13.0, 0.95, 3.45, 1.2, '#ff7a35', 0.2);
  // hanging pots
  for (let i = 0; i < 4; i++) {
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.13, 0.18, 9), mats.iron);
    pot.position.set(9 + i * 0.55, 2.2, 3.0);
    scene.add(pot);
  }
  glow(10, 2.4, 0, 2.2, '#ffb976', 0.24);
  // table & prep
  table(10.2, 0.8, 2.0, 1.0, 0, 0.8, mats.darkWood);
  box(10.2, 0.86, 0.8, 0.5, 0.03, 0.34, mats.paper, { ry: 0.4 });

  // PARLOR
  fireplace(-15.7, 8.0, Math.PI / 2);
  sofa(-10.4, 8.2, -Math.PI / 2, 2.3);
  armchair(-9.2, 12.2, Math.PI);
  table(-12.2, 9.4, 1.6, 1.0, 0, 0.48);
  glow(-8.2, 1.45, 11.0, 1.5, '#ffbf7a', 0.25);
  // standing lamp base
  const lampPole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.12, 1.5, 7), mats.brass);
  lampPole.position.set(-8.2, 0.75, 11.0);
  scene.add(lampPole);
  addCollider(-8.2, 11.0, 0.4, 0.4, 'lamp');
  // tea set
  cyl(-12.2, 0.54, 9.4, 0.12, 0.09, 0.12, mats.porcelain);

  // FOYER
  const foyerRug = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 4.2), mats.rug2);
  foyerRug.rotation.x = -Math.PI / 2;
  foyerRug.position.set(0, 0.035, 9.2);
  scene.add(foyerRug);
  table(-3.1, 12.5, 1.3, 0.6, Math.PI / 2, 0.9);
  table(3.1, 12.5, 1.3, 0.6, Math.PI / 2, 0.9);
  // coat rack
  const rack = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.06, 1.9, 6), mats.darkWood);
  rack.position.set(-3.2, 0.95, 7.0);
  scene.add(rack);
  addCollider(-3.2, 7.0, 0.4, 0.4, 'rack');
  for (let i = 0; i < 3; i++) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.04, 0.04), mats.darkWood);
    arm.position.set(-3.2 + (i - 1) * 0.12, 1.7 + i * 0.06, 7.0);
    arm.rotation.y = i * 1.1;
    scene.add(arm);
  }

  // MUSIC ROOM
  piano(11.4, 11.7, Math.PI);
  chair(11.4, 9.8, 0);
  chair(8.4, 8.8, 0.8);
  // music stand
  const standPole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.04, 1.3, 6), mats.iron);
  standPole.position.set(8.0, 0.65, 11.2);
  scene.add(standPole);
  box(8.0, 1.35, 11.2, 0.5, 0.36, 0.02, mats.paper, { ry: -0.4 });
  glow(12.4, 2.1, 9.0, 1.8, '#ffb46e', 0.22);

  // ── hiding wardrobes ──────────────────────────────────────
  const hideSpots = [
    wardrobe(-15.32, -6.7, Math.PI / 2),
    wardrobe(-15.32, 12.1, Math.PI / 2),
    wardrobe(15.32, -6.6, -Math.PI / 2),
    wardrobe(15.32, 11.4, -Math.PI / 2),
    wardrobe(-15.32, 2.8, Math.PI / 2),
    wardrobe(3.35, 8.6, -Math.PI / 2),
  ];

  // ── dust ───────────────────────────────────────────────────
  const dustCount = 420;
  const dustGeo = new THREE.BufferGeometry();
  const dustPos = new Float32Array(dustCount * 3);
  const dustSeed = new Float32Array(dustCount);
  for (let i = 0; i < dustCount; i++) {
    dustPos[i * 3] = (Math.random() - 0.5) * 31;
    dustPos[i * 3 + 1] = 0.2 + Math.random() * 3.1;
    dustPos[i * 3 + 2] = (Math.random() - 0.5) * 27;
    dustSeed[i] = Math.random() * 100;
  }
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  const dustMat = new THREE.PointsMaterial({
    size: 0.032, map: dustTexture(), transparent: true, opacity: 0.4,
    depthWrite: false, blending: THREE.AdditiveBlending, color: 0xd8cba8,
    sizeAttenuation: true
  });
  const dust = new THREE.Points(dustGeo, dustMat);
  scene.add(dust);

  // ── ambient light ──────────────────────────────────────────
  const hemi = new THREE.HemisphereLight(0x2b4550, 0x070504, 0.72);
  scene.add(hemi);
  const dir = new THREE.DirectionalLight(0x8fb2c4, 0.6);
  dir.position.set(-8, 12, -14);
  scene.add(dir);

  let blackoutTimer = 0;
  let elapsed = 0;

  return {
    colliders,
    hideSpots,
    candleSpots: CANDLE_SPOTS,
    rooms: ROOM_DEFS,
    exit,
    lights,
    hemi,
    dust,
    dustSeed,
    get position() { return new THREE.Vector3(0, 0, 0); },
    triggerBlackout(seconds = 1.4) { blackoutTimer = seconds; },
    roomAt(x, z) {
      for (const r of ROOM_DEFS) {
        if (x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ) return r;
      }
      return null;
    },
    update(dt, cameraPos) {
      elapsed += dt;
      blackoutTimer = Math.max(0, blackoutTimer - dt);
      const blackout = blackoutTimer > 0;
      for (const f of flickerLights) {
        const t = elapsed * f.speed + f.phase;
        let k = 0.86 + Math.sin(t) * 0.08 + Math.sin(t * 2.7 + 1.3) * 0.045;
        if (blackout) k *= (Math.random() > 0.45 ? 0.02 : 1.1);
        else if (Math.random() < 0.0016) k *= 0.35;
        f.light.intensity = f.base * k;
      }
      for (const fire of fires) {
        const flick = 0.82 + Math.sin(elapsed * 13 + fire.phase) * 0.12 + Math.random() * 0.1;
        fire.light.intensity = fire.base * flick;
        fire.sprites.forEach((s, i) => {
          const p = flick + Math.sin(elapsed * (9 + i * 3.2) + fire.phase + i) * 0.12;
          s.scale.set(s.userData.baseX * (0.88 + p * 0.16), s.userData.baseY * (0.82 + p * 0.22), 1);
          s.material.opacity = s.userData.baseOp * (0.82 + p * 0.18);
          s.position.x = Math.sin(elapsed * (2.4 + i) + fire.phase) * 0.04;
        });
      }
      // dust drifts toward the player, slowly
      if (cameraPos) {
        const pos = dust.geometry.attributes.position;
        const arr = pos.array;
        for (let i = 0; i < dustCount; i++) {
          const i3 = i * 3;
          arr[i3] += Math.sin(elapsed * 0.35 + dustSeed[i]) * 0.0007;
          arr[i3 + 1] += Math.cos(elapsed * 0.28 + dustSeed[i]) * 0.0005;
          arr[i3 + 2] += Math.sin(elapsed * 0.3 + dustSeed[i] * 2) * 0.0006;
          if (arr[i3] > 16) arr[i3] = -16;
          if (arr[i3] < -16) arr[i3] = 16;
          if (arr[i3 + 2] > 14) arr[i3 + 2] = -14;
          if (arr[i3 + 2] < -14) arr[i3 + 2] = 14;
        }
        pos.needsUpdate = true;
      }
      exit.update(dt);
      // gentle glow pulse
      const pulse = 0.9 + Math.sin(elapsed * 2.3) * 0.1;
      for (const s of glowSprites) {
        const base = s.userData.baseOpacity ?? 0.3;
        s.material.opacity = base * pulse;
      }
    }
  };

  function getGlowTexture(color) {
    if (!getGlowTexture.cache) getGlowTexture.cache = {};
    const key = color;
    if (!getGlowTexture.cache[key]) getGlowTexture.cache[key] = glowTexture(color);
    return getGlowTexture.cache[key];
  }

  function makeMaterials() {
    const wallpaper = lambert({
      map: wallpaperTexture(), roughness: 0.94, metalness: 0.0, color: 0xb9c4ba
    });
    const woodMap = woodTexture();
    woodMap.repeat.set(2, 2);
    const wood = lambert({ map: woodMap, roughness: 0.82, metalness: 0.02, color: 0xa79a88 });

    const stoneMap = stoneTexture();
    stoneMap.repeat.set(2, 2);
    const stone = lambert({ map: stoneMap, roughness: 0.96, color: 0x9b9e98 });

    const kitchenMap = stoneTexture();
    kitchenMap.repeat.set(3, 3);
    const kitchenFloor = lambert({ map: kitchenMap, roughness: 0.9, color: 0xb0a793 });

    const stoneFloorMap = stoneTexture();
    stoneFloorMap.repeat.set(3, 3);
    const stoneFloor = lambert({ map: stoneFloorMap, roughness: 0.95, color: 0x868f8b });

    const plaster = plasterTexture();
    plaster.repeat.set(5, 5);
    const ceiling = lambert({ map: plaster, roughness: 1, color: 0x76736b });

    const darkWoodMap = darkWoodTexture();
    darkWoodMap.repeat.set(2, 2);

    const wax = lambert({ color: 0xd6c8a2, roughness: 0.8, emissive: 0x2a1e0a, emissiveIntensity: 0.35 });
    const flame = new THREE.MeshBasicMaterial({ color: 0xffcf7c, toneMapped: false });
    const fire = new THREE.MeshBasicMaterial({ color: 0xff7a22, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
    const doorInset = lambert({ color: 0x2b1b10, roughness: 0.75 });
    const paper = lambert({ color: 0xc8bea2, roughness: 0.9 });
    const sofaMat = lambert({ color: 0x3e2926, roughness: 0.96 });
    const sofaLight = lambert({ color: 0x53352f, roughness: 0.96 });
    const altarCloth = lambert({ color: 0x4c171b, roughness: 0.92, emissive: 0x170406, emissiveIntensity: 0.4 });
    const books = [0x5b2528, 0x2d4038, 0x4d4227, 0x30324a, 0x5b4a2b, 0x3a2522].map(c =>
      lambert({ color: c, roughness: 0.9 }));
    const rugMap = rugTexture(0);
    const rug2Map = rugTexture(1);

    return {
      wallpaper, wood, stone, kitchenFloor, stoneFloor, ceiling,
      darkWood: lambert({ map: darkWoodMap, color: 0x8a7660, roughness: 0.78 }),
      wainscot: lambert({ map: darkWoodMap.clone(), color: 0x5a4736, roughness: 0.8 }),
      trim: lambert({ color: 0x1b120b, roughness: 0.82 }),
      door: lambert({ map: darkWoodMap.clone(), color: 0x7a6248, roughness: 0.76 }),
      doorInset,
      iron: lambert({ color: 0x1a1a1a, roughness: 0.48, metalness: 0.7 }),
      brass: lambert({ color: 0x8f7341, roughness: 0.4, metalness: 0.78 }),
      goldFrame: lambert({ color: 0x7d6433, roughness: 0.5, metalness: 0.62 }),
      wax, flame, fire, paper, sofa: sofaMat, sofaLight, altarCloth,
      books,
      shelfBack: lambert({ color: 0x140d08, roughness: 0.95 }),
      black: lambert({ color: 0x080808, roughness: 0.55 }),
      keys: lambert({ color: 0xd7d1b9, roughness: 0.5 }),
      clockFace: lambert({ color: 0xbcb195, roughness: 0.7, emissive: 0x211b11, emissiveIntensity: 0.4 }),
      counter: lambert({ color: 0x3b3830, roughness: 0.86 }),
      porcelain: lambert({ color: 0xd3cbb6, roughness: 0.35 }),
      mirror: lambert({ color: 0x5c7275, roughness: 0.18, metalness: 0.85, emissive: 0x0c1516, emissiveIntensity: 0.7 }),
      globe: lambert({ color: 0x3f5343, roughness: 0.8 }),
      bark: lambert({ color: 0x221a12, roughness: 1 }),
      foliage: lambert({ color: 0x0b1210, roughness: 1 }),
      porch: lambert({ color: 0x101310, roughness: 1 }),
      rug: lambert({ map: rugMap, roughness: 0.98, color: 0xa08f80 }),
      rug2: lambert({ map: rug2Map, roughness: 0.98, color: 0x938374 }),
      runeOff: lambert({ color: 0x2c2720, roughness: 0.7, metalness: 0.4 }),
      runeOn: new THREE.MeshBasicMaterial({ color: 0x9fe8e3, toneMapped: false }),
    };
  }
}
