import * as THREE from '../vendor/three.module.js';
import { glowTexture } from './textures.js';

const HOME = new THREE.Vector3(0, 0, -10.6);

function lambert(params = {}) {
  const { roughness, metalness, ...rest } = params;
  return new THREE.MeshLambertMaterial(rest);
}


export class Ghost {
  constructor(scene, world, callbacks = {}) {
    this.scene = scene;
    this.world = world;
    this.callbacks = callbacks;
    this.state = 'dormant';
    this.active = false;
    this.final = false;
    this.position = HOME.clone();
    this.velocity = new THREE.Vector3();
    this.target = new THREE.Vector3();
    this.bob = 0;
    this.chaseLost = 0;
    this.searchTimer = 0;
    this.stepTimer = 0;
    this.whisperTimer = 0;
    this.teleportCooldown = 0;
    this.baseSpeed = 1.25;
    this.caught = false;
    this._build();
  }

  _build() {
    this.group = new THREE.Group();
    this.group.position.copy(this.position);
    this.scene.add(this.group);

    this.skinMat = lambert({
      color: 0xb7beb0, roughness: 0.62, metalness: 0.0,
      emissive: 0x2d3d39, emissiveIntensity: 0.55,
      transparent: true, opacity: 0.94
    });
    this.dressMat = lambert({
      color: 0x9aa79f, roughness: 0.94,
      emissive: 0x182522, emissiveIntensity: 0.42,
      transparent: true, opacity: 0.8, side: THREE.DoubleSide
    });
    this.hairMat = lambert({
      color: 0x050605, roughness: 0.72, emissive: 0x040505, emissiveIntensity: 0.3
    });
    this.eyeMat = new THREE.MeshBasicMaterial({ color: 0xff2d1f, toneMapped: false });
    this.mouthMat = new THREE.MeshBasicMaterial({ color: 0x050202, toneMapped: false });

    // dress
    this.dress = new THREE.Mesh(new THREE.ConeGeometry(0.62, 1.55, 14, 1, true), this.dressMat);
    this.dress.position.y = 0.78;
    this.group.add(this.dress);

    // torn hem
    this.hem = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.68, 0.12, 14, 1, true), this.dressMat);
    this.hem.position.y = 0.06;
    this.group.add(this.hem);

    // torso
    this.torso = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 0.72, 10), this.dressMat);
    this.torso.position.y = 1.45;
    this.group.add(this.torso);

    // neck + head
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.085, 0.18, 8), this.skinMat);
    neck.position.y = 1.82;
    this.group.add(neck);

    this.head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 18, 14), this.skinMat);
    this.head.scale.set(0.88, 1.12, 0.92);
    this.head.position.y = 2.02;
    this.group.add(this.head);

    // jaw / open mouth
    const mouth = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), this.mouthMat);
    mouth.scale.set(1.2, 1.7, 0.55);
    mouth.position.set(0, 1.94, 0.17);
    this.group.add(mouth);
    this.mouth = mouth;

    // eyes
    this.eyes = new THREE.Group();
    for (const sx of [-1, 1]) {
      const socket = new THREE.Mesh(new THREE.SphereGeometry(0.062, 10, 8), this.hairMat);
      socket.scale.set(1.1, 1.4, 0.55);
      socket.position.set(sx * 0.083, 2.06, 0.155);
      this.eyes.add(socket);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.028, 8, 6), this.eyeMat);
      eye.position.set(sx * 0.083, 2.06, 0.185);
      this.eyes.add(eye);
    }
    this.group.add(this.eyes);

    // long black hair
    const hairCap = new THREE.Mesh(new THREE.SphereGeometry(0.215, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.62), this.hairMat);
    hairCap.position.set(0, 2.08, -0.015);
    hairCap.scale.set(1.0, 1.1, 1.02);
    this.group.add(hairCap);
    this.hairStrands = [];
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const strand = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.012, 0.9 + Math.random() * 0.5, 5), this.hairMat);
      strand.position.set(Math.sin(a) * 0.15, 1.66, Math.cos(a) * 0.12 - 0.03);
      strand.rotation.z = Math.sin(a) * 0.14;
      this.group.add(strand);
      this.hairStrands.push({ mesh: strand, phase: Math.random() * 6, base: strand.rotation.z });
    }

    // arms
    this.arms = [];
    for (const sx of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.92, 7), this.skinMat);
      arm.position.set(sx * 0.34, 1.42, 0.08);
      arm.rotation.z = sx * 0.28;
      arm.rotation.x = -0.45;
      this.group.add(arm);
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.055, 7, 6), this.skinMat);
      hand.position.set(sx * 0.45, 0.98, 0.34);
      hand.scale.set(1, 1.5, 1);
      this.group.add(hand);
      this.arms.push({ mesh: arm, hand, side: sx });
    }

    // spectral aura sprite
    const auraMat = new THREE.SpriteMaterial({
      map: glowTexture('#7fa9a0'), transparent: true, opacity: 0.13,
      blending: THREE.AdditiveBlending, depthWrite: false
    });
    this.aura = new THREE.Sprite(auraMat);
    this.aura.position.y = 1.1;
    this.aura.scale.set(2.8, 3.2, 1);
    this.group.add(this.aura);

    // red near-light
    this.light = new THREE.PointLight(0xff2c18, 2.2, 5.5, 1.9);
    this.light.position.y = 1.7;
    this.group.add(this.light);

    // swirling wisps
    this.wisps = [];
    for (let i = 0; i < 6; i++) {
      const wm = new THREE.SpriteMaterial({
        map: glowTexture('#8fb3aa'), transparent: true, opacity: 0.15,
        blending: THREE.AdditiveBlending, depthWrite: false
      });
      const w = new THREE.Sprite(wm);
      w.scale.set(0.4, 0.4, 1);
      this.group.add(w);
      this.wisps.push({ sprite: w, phase: Math.random() * 6, radius: 0.5 + Math.random() * 0.4, y: 0.25 + Math.random() * 1.3 });
    }

    this.setDormantLook();
  }

  setDormantLook() {
    this.aura.material.opacity = 0.07;
    this.aura.material.color.setHex(0x7fa9a0);
    this.light.intensity = 0.9;
    this.eyeMat.color.setHex(0x9a231a);
  }

  setHuntingLook() {
    this.aura.material.opacity = 0.2;
    this.aura.material.color.setHex(0xff7b66);
    this.light.intensity = 4.2;
    this.eyeMat.color.setHex(0xff2d1f);
  }

  reset() {
    this.state = 'dormant';
    this.active = false;
    this.final = false;
    this.caught = false;
    this.intensity = 0;
    this.position.copy(HOME);
    this.group.position.copy(HOME);
    this.group.rotation.set(0, 0, 0);
    this.velocity.set(0, 0, 0);
    this.chaseLost = 0;
    this.searchTimer = 0;
    this.targetTimer = 0;
    this.whisperTimer = 0;
    this.teleportCooldown = 0;
    this.group.visible = true;
    this.dressMat.opacity = 0.8;
    this.skinMat.opacity = 0.94;
    this.setDormantLook();
  }

  pickRoamTarget(from, minDist = 6, maxDist = 22) {
    let best = null;
    for (let i = 0; i < 20; i++) {
      const room = this.world.rooms[Math.floor(Math.random() * this.world.rooms.length)];
      const x = room.minX + 2 + Math.random() * (room.maxX - room.minX - 4);
      const z = room.minZ + 2 + Math.random() * (room.maxZ - room.minZ - 4);
      const d = Math.hypot(x - from.x, z - from.z);
      if (d >= minDist && d <= maxDist) return new THREE.Vector3(x, 0, z);
      if (!best || Math.abs(d - 10) < Math.abs(best.d - 10)) best = { x, z, d };
    }
    return new THREE.Vector3(best.x, 0, best.z);
  }

  awaken(playerPos, intensity = 0) {
    this.active = true;
    this.state = 'roam';
    this.setHuntingLook();
    // appear 8-13 metres away, never directly in view if possible
    const target = this.pickRoamTarget(playerPos, 8, 14);
    this.teleportTo(target.x, target.z);
    this.target = this.pickRoamTarget(playerPos, 7, 18);
    this.targetTimer = 0.8;
    this.teleportCooldown = 2.2;
    this.intensity = intensity;
    if (this.callbacks.onAwaken) this.callbacks.onAwaken();
  }

  teleportTo(x, z) {
    this.position.set(x, 0, z);
    this.group.position.set(x, 0, z);
    // brief manifestation flare
    this.aura.material.opacity = 0.5;
  }

  startFinal(playerPos) {
    this.active = true;
    this.final = true;
    this.state = 'chase';
    this.setHuntingLook();
    const t = this.pickRoamTarget(playerPos, 7, 11);
    this.teleportTo(t.x, t.z);
    this.chaseLost = 0;
    this.teleportCooldown = 2.5;
    if (this.callbacks.onFinal) this.callbacks.onFinal();
  }

  update(dt, player, time) {
    if (this.caught) return true;

    const dx = player.pos.x - this.position.x;
    const dz = player.pos.z - this.position.z;
    const dist = Math.hypot(dx, dz);

    // idle animation
    this.bob += dt;
    const hover = Math.sin(this.bob * 1.8) * 0.05;
    this.group.position.y = hover;
    this.group.rotation.z = Math.sin(this.bob * 0.9) * 0.014;
    this.dress.position.y = 0.78 + Math.sin(this.bob * 1.2) * 0.015;
    this.head.rotation.z = Math.sin(this.bob * 0.7) * 0.035;
    this.head.rotation.x = Math.sin(this.bob * 0.5) * 0.025;
    this.aura.position.y = 1.1 + Math.sin(this.bob * 1.4) * 0.06;
    this.light.intensity = (this.state === 'dormant' ? 0.9 : 3.6) * (0.8 + Math.sin(this.bob * 7.3) * 0.13 + Math.random() * 0.08);
    for (const w of this.wisps) {
      const t = time * 0.55 + w.phase;
      w.sprite.position.set(Math.cos(t) * w.radius, w.y + Math.sin(t * 1.6) * 0.2, Math.sin(t) * w.radius);
      w.sprite.material.opacity = 0.06 + (Math.sin(t * 2.3) + 1) * 0.055;
    }
    for (const h of this.hairStrands) {
      h.mesh.rotation.z = h.base + Math.sin(time * 0.7 + h.phase) * 0.05;
      h.mesh.rotation.x = Math.sin(time * 0.5 + h.phase) * 0.04;
    }
    for (const a of this.arms) {
      a.mesh.rotation.x = -0.45 + Math.sin(time * 0.8 + a.side) * 0.07 + (this.state === 'chase' ? -0.55 : 0);
      a.hand.position.x = a.side * 0.45;
      a.hand.position.z = 0.34 + (this.state === 'chase' ? 0.22 : 0);
    }

    if (this.state === 'dormant') {
      // subtle turn toward player if close
      if (dist < 7) {
        const face = Math.atan2(dx, dz);
        this.group.rotation.y += angleDelta(this.group.rotation.y, face) * Math.min(1, dt * 1.4);
        if (dist < 3.4 && time - this.whisperTimer > 8) {
          this.whisperTimer = time;
          if (this.callbacks.onNearDormant) this.callbacks.onNearDormant();
        }
      }
      return false;
    }

    // ── state transitions ────────────────────────────────────
    const senseRadius = (player.flashlight ? 10.5 : 5.5) + (player.sprinting ? 3.5 : 0) + (this.intensity || 0) * 1.2;

    if (player.hidden) {
      if (this.state === 'chase') {
        this.state = 'search';
        this.searchTimer = 5.5;
        const spot = player.hidden;
        this.target.copy(spot.frontPos);
        if (this.callbacks.onLost) this.callbacks.onLost();
      }
    } else if (this.state === 'roam' && (dist < senseRadius || (this.final && dist < 24))) {
      this.state = 'chase';
      this.chaseLost = 0;
      if (this.callbacks.onChase) this.callbacks.onChase();
    } else if (this.state === 'search') {
      this.searchTimer -= dt;
      if (this.searchTimer <= 0 || !player.hidden) {
        this.state = 'roam';
        this.target = this.pickRoamTarget(player.pos, 6, 18);
        this.targetTimer = 0;
      }
    }

    // ── movement ─────────────────────────────────────────────
    let speed = this.baseSpeed + (this.intensity || 0) * 0.28;
    let target = this.target;

    if (this.state === 'chase') {
      speed = (this.final ? 3.55 : 2.45) + (this.intensity || 0) * 0.24;
      target = player.pos;
      if (!player.hidden) {
        if (dist > 18) this.chaseLost += dt;
        else this.chaseLost = 0;
        if (this.chaseLost > 4.5 && !this.final) {
          this.state = 'roam';
          this.target = this.pickRoamTarget(player.pos);
          this.targetTimer = 3;
          if (this.callbacks.onLost) this.callbacks.onLost();
        }
      }
    } else if (this.state === 'search') {
      speed = 1.35;
      target = this.target;
      if (dist < 2.4 && this.searchTimer > 1) {
        // drift around the wardrobe
        const a = time * 0.6;
        this.position.x += Math.cos(a) * dt * 0.5;
        this.position.z += Math.sin(a) * dt * 0.5;
      }
    } else {
      this.targetTimer -= dt;
      if (this.targetTimer <= 0 || Math.hypot(this.target.x - this.position.x, this.target.z - this.position.z) < 1.4) {
        this.target = this.pickRoamTarget(player.pos, 5, 20);
        this.targetTimer = 2 + Math.random() * 4;
      }
      target = this.target;
    }

    const tdx = target.x - this.position.x;
    const tdz = target.z - this.position.z;
    const tdist = Math.hypot(tdx, tdz) || 1;
    const desiredVX = (tdx / tdist) * speed;
    const desiredVZ = (tdz / tdist) * speed;
    const accel = this.state === 'chase' ? 5 : 1.6;
    this.velocity.x += (desiredVX - this.velocity.x) * Math.min(1, dt * accel);
    this.velocity.z += (desiredVZ - this.velocity.z) * Math.min(1, dt * accel);

    this.position.x += this.velocity.x * dt;
    this.position.z += this.velocity.z * dt;
    this.group.position.x = this.position.x;
    this.group.position.z = this.position.z;

    // face travel / player
    const faceTarget = this.state === 'chase' ? Math.atan2(dx, dz) : Math.atan2(this.velocity.x, this.velocity.z);
    if (Math.abs(this.velocity.x) + Math.abs(this.velocity.z) > 0.1 || this.state === 'chase') {
      this.group.rotation.y += angleDelta(this.group.rotation.y, faceTarget) * Math.min(1, dt * 4);
    }

    // lean forward during chase
    const lean = this.state === 'chase' ? -0.12 : -0.03;
    this.group.rotation.x += (lean - this.group.rotation.x) * Math.min(1, dt * 3);

    // silhouette fades when very far from player (reduces accidental sightings through walls)
    const visibleDist = this.state === 'chase' || this.state === 'search' ? 30 : 20;
    const targetOpacity = dist < visibleDist ? 1 : 0.35;
    this.dressMat.opacity += (0.8 * targetOpacity - this.dressMat.opacity) * Math.min(1, dt * 2);
    this.skinMat.opacity += (0.94 * targetOpacity - this.skinMat.opacity) * Math.min(1, dt * 2);

    // proximity whispers
    this.whisperTimer -= dt;
    if (this.whisperTimer <= 0 && dist < 12 && this.state !== 'dormant') {
      this.whisperTimer = 10 + Math.random() * 12;
      if (this.callbacks.onWhisper) this.callbacks.onWhisper(dist);
    }

    // catch
    if (!player.hidden && !this.finalStun) {
      const catchRadius = this.state === 'chase' ? 0.92 : 0.7;
      if (dist < catchRadius) {
        this.caught = true;
        if (this.callbacks.onCatch) this.callbacks.onCatch();
        return true;
      }
    }

    return false;
  }
}

function angleDelta(from, to) {
  let d = (to - from + Math.PI) % (Math.PI * 2) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
