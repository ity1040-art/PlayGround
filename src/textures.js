import * as THREE from '../vendor/three.module.js';

function canvas(size) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  return c;
}

function finish(c, repeatX = 1, repeatY = 1, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeatX, repeatY);
  t.anisotropy = 4;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function noise(ctx, size, amount = 16, alpha = 0.16) {
  const img = ctx.getImageData(0, 0, size, size);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * amount;
    d[i] = Math.max(0, Math.min(255, d[i] + n));
    d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n));
    d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n));
  }
  ctx.putImageData(img, 0, 0);
  // soft grime blooms
  for (let k = 0; k < 26; k++) {
    const x = Math.random() * size, y = Math.random() * size;
    const r = 24 + Math.random() * 90;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(4,7,6,${alpha * Math.random()})`);
    g.addColorStop(1, 'rgba(4,7,6,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function wallpaperTexture() {
  const size = 512;
  const c = canvas(size);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#334644';
  ctx.fillRect(0, 0, size, size);

  // vertical tone bands
  const band = ctx.createLinearGradient(0, 0, size, 0);
  for (let i = 0; i <= 10; i++) {
    band.addColorStop(i / 10, i % 2 ? '#2c3e3c' : '#384c49');
  }
  ctx.globalAlpha = 0.65;
  ctx.fillStyle = band;
  ctx.fillRect(0, 0, size, size);
  ctx.globalAlpha = 1;

  // pinstripes
  ctx.strokeStyle = 'rgba(150,165,150,.08)';
  ctx.lineWidth = 2;
  for (let x = 16; x < size; x += 64) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, size);
    ctx.stroke();
  }

  // damask motifs
  const drawDamask = (cx, cy, s) => {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(s / 100, s / 100);
    ctx.strokeStyle = 'rgba(157,175,158,.17)';
    ctx.fillStyle = 'rgba(157,175,158,.055)';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(0, -46);
    ctx.bezierCurveTo(20, -30, 22, -8, 0, 0);
    ctx.bezierCurveTo(-22, -8, -20, -30, 0, -46);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(28, 16, 32, 38, 0, 48);
    ctx.bezierCurveTo(-32, 38, -28, 16, 0, 0);
    ctx.fill();
    ctx.stroke();
    // leaf curls
    ctx.lineWidth = 1.8;
    for (const dir of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(dir * 4, -14);
      ctx.bezierCurveTo(dir * 34, -24, dir * 40, 2, dir * 22, 12);
      ctx.bezierCurveTo(dir * 32, 4, dir * 28, -10, dir * 10, -9);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(dir * 3, 15);
      ctx.bezierCurveTo(dir * 30, 26, dir * 34, 42, dir * 14, 42);
      ctx.stroke();
    }
    ctx.restore();
  };

  for (let y = 0; y < 3; y++) {
    for (let x = 0; x < 2; x++) {
      drawDamask(128 + x * 256, 86 + y * 170, 105);
      drawDamask(256 + x * 256 - 128, 172 + y * 170, 46);
    }
  }

  noise(ctx, size, 14, 0.24);

  // darker toward edges
  const edge = ctx.createRadialGradient(size / 2, size / 2, size * 0.25, size / 2, size / 2, size * 0.72);
  edge.addColorStop(0, 'rgba(0,0,0,0)');
  edge.addColorStop(1, 'rgba(0,0,0,.28)');
  ctx.fillStyle = edge;
  ctx.fillRect(0, 0, size, size);

  return finish(c, 1, 1);
}

export function woodTexture() {
  const size = 512;
  const c = canvas(size);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#2b1d13';
  ctx.fillRect(0, 0, size, size);
  const plankH = 64;
  for (let row = 0; row < size / plankH; row++) {
    const offset = (row % 2) * 120;
    for (let px = -1; px < 3; px++) {
      const x = px * 256 + offset;
      const shade = 26 + Math.random() * 22;
      ctx.fillStyle = `rgb(${shade + 18},${shade + 4},${Math.max(10, shade - 10)})`;
      ctx.fillRect(x, row * plankH, 256, plankH - 2);
      // grain
      for (let g = 0; g < 18; g++) {
        ctx.strokeStyle = `rgba(${10 + Math.random() * 30},${8 + Math.random() * 18},${4 + Math.random() * 10},${0.1 + Math.random() * 0.25})`;
        ctx.lineWidth = 0.7 + Math.random() * 1.6;
        const gy = row * plankH + 4 + Math.random() * (plankH - 8);
        ctx.beginPath();
        ctx.moveTo(x + 3, gy);
        ctx.bezierCurveTo(x + 80, gy + (Math.random() - 0.5) * 7, x + 170, gy + (Math.random() - 0.5) * 8, x + 253, gy + (Math.random() - 0.5) * 4);
        ctx.stroke();
      }
      // seam
      ctx.fillStyle = 'rgba(3,2,1,.65)';
      ctx.fillRect(x + 254, row * plankH, 3, plankH);
      // nails
      ctx.fillStyle = 'rgba(10,8,6,.8)';
      ctx.beginPath(); ctx.arc(x + 12, row * plankH + 12, 1.8, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.arc(x + 243, row * plankH + plankH - 12, 1.8, 0, 7); ctx.fill();
    }
    ctx.fillStyle = 'rgba(0,0,0,.55)';
    ctx.fillRect(0, row * plankH + plankH - 2, size, 2);
  }
  noise(ctx, size, 10, 0.28);
  return finish(c, 1, 1);
}

export function darkWoodTexture() {
  const size = 256;
  const c = canvas(size);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#24170f';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 70; i++) {
    ctx.strokeStyle = `rgba(${8 + Math.random() * 24},${5 + Math.random() * 14},${2 + Math.random() * 8},${0.18 + Math.random() * 0.3})`;
    ctx.lineWidth = 0.6 + Math.random() * 2.2;
    const y = Math.random() * size;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(size * 0.3, y + (Math.random() - 0.5) * 14, size * 0.7, y + (Math.random() - 0.5) * 14, size, y + (Math.random() - 0.5) * 6);
    ctx.stroke();
  }
  noise(ctx, size, 8, 0.3);
  return finish(c, 1, 1);
}

export function stoneTexture() {
  const size = 512;
  const c = canvas(size);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#232a2b';
  ctx.fillRect(0, 0, size, size);
  const rowH = 74;
  for (let row = 0; row < 8; row++) {
    const offset = (row % 2) * 62;
    for (let col = -1; col < 6; col++) {
      const x = col * 124 + offset;
      const y = row * rowH;
      const g = 30 + Math.random() * 18;
      ctx.fillStyle = `rgb(${g},${g + 4},${g + 5})`;
      ctx.fillRect(x + 3, y + 3, 118, rowH - 6);
      ctx.fillStyle = 'rgba(0,0,0,.35)';
      ctx.fillRect(x + 3, y + rowH - 4, 118, 4);
    }
  }
  noise(ctx, size, 18, 0.3);
  return finish(c, 1, 1);
}

export function plasterTexture() {
  const size = 512;
  const c = canvas(size);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#262b28';
  ctx.fillRect(0, 0, size, size);
  noise(ctx, size, 20, 0.36);
  // cracks
  ctx.strokeStyle = 'rgba(5,7,6,.55)';
  for (let k = 0; k < 5; k++) {
    let x = Math.random() * size, y = Math.random() * size;
    ctx.lineWidth = 0.8 + Math.random() * 1.4;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let s = 0; s < 9; s++) {
      x += (Math.random() - 0.5) * 48;
      y += Math.random() * 34;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  // water stains
  for (let k = 0; k < 7; k++) {
    const x = Math.random() * size, y = Math.random() * size, r = 30 + Math.random() * 100;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(45,38,24,.28)');
    g.addColorStop(1, 'rgba(45,38,24,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
  }
  return finish(c, 1, 1);
}

export function rugTexture(variant = 0) {
  const size = 512;
  const c = canvas(size);
  const ctx = c.getContext('2d');
  const base = variant === 1 ? '#2b1716' : '#3a1a18';
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = 'rgba(168,134,78,.42)';
  ctx.lineWidth = 9;
  ctx.strokeRect(18, 18, size - 36, size - 36);
  ctx.strokeStyle = 'rgba(168,134,78,.2)';
  ctx.lineWidth = 2;
  ctx.strokeRect(36, 36, size - 72, size - 72);
  ctx.strokeRect(56, 56, size - 112, size - 112);

  // border motifs
  ctx.fillStyle = 'rgba(168,134,78,.22)';
  for (let i = 0; i < 24; i++) {
    const t = i / 24;
    const x1 = 46 + t * (size - 92), y1 = 46;
    const x2 = 46 + t * (size - 92), y2 = size - 46;
    ctx.save(); ctx.translate(x1, y1); ctx.rotate(Math.PI / 4); ctx.fillRect(-3, -3, 6, 6); ctx.restore();
    ctx.save(); ctx.translate(x2, y2); ctx.rotate(Math.PI / 4); ctx.fillRect(-3, -3, 6, 6); ctx.restore();
    ctx.save(); ctx.translate(x1, y2); ctx.rotate(Math.PI / 4); ctx.fillRect(-3, -3, 6, 6); ctx.restore();
    ctx.save(); ctx.translate(x2, y1); ctx.rotate(Math.PI / 4); ctx.fillRect(-3, -3, 6, 6); ctx.restore();
  }

  // central medallion
  ctx.save();
  ctx.translate(size / 2, size / 2);
  ctx.strokeStyle = 'rgba(168,134,78,.35)';
  ctx.lineWidth = 3;
  for (let r = 8; r < 158; r += 26) {
    ctx.beginPath();
    if (r % 52 === 8) {
      for (let a = 0; a < 16; a++) {
        const rr = r + (a % 2 ? 12 : 0);
        const ang = (a / 16) * Math.PI * 2;
        const px = Math.cos(ang) * rr, py = Math.sin(ang) * rr;
        a === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      }
      ctx.closePath();
    } else {
      ctx.arc(0, 0, r, 0, Math.PI * 2);
    }
    ctx.stroke();
  }
  ctx.restore();

  noise(ctx, size, 18, 0.32);
  // worn patches
  for (let i = 0; i < 10; i++) {
    const x = Math.random() * size, y = Math.random() * size, r = 10 + Math.random() * 50;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(15,8,7,.25)');
    g.addColorStop(1, 'rgba(15,8,7,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
  }
  return finish(c, 1, 1);
}

export function portraitTexture(variant = 0) {
  const w = 256, h = 384;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, variant ? '#1d1712' : '#171d1c');
  bg.addColorStop(1, '#080807');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  // halo
  const halo = ctx.createRadialGradient(w / 2, 150, 10, w / 2, 150, 130);
  halo.addColorStop(0, 'rgba(185,178,155,.16)');
  halo.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = '#0b0b0a';
  // shoulders
  ctx.beginPath();
  ctx.ellipse(w / 2, h - 30, 118, 138, 0, Math.PI, Math.PI * 2);
  ctx.fill();
  // neck
  ctx.fillRect(w / 2 - 20, 238, 40, 60);
  // face
  ctx.fillStyle = variant ? 'rgba(190,174,146,.78)' : 'rgba(168,178,164,.72)';
  ctx.beginPath();
  ctx.ellipse(w / 2, 185, 50, 72, 0, 0, Math.PI * 2);
  ctx.fill();
  // hair
  ctx.fillStyle = '#0a0a09';
  ctx.beginPath();
  ctx.ellipse(w / 2, 150, 60, 62, 0, Math.PI, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(w / 2 - 58, 150, 17, 118);
  ctx.fillRect(w / 2 + 41, 150, 17, 118);
  // eyes
  ctx.fillStyle = variant ? '#2b0d0d' : '#0c1412';
  ctx.beginPath(); ctx.ellipse(w / 2 - 20, 176, 7, 4, 0, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.ellipse(w / 2 + 20, 176, 7, 4, 0, 0, 7); ctx.fill();
  ctx.fillStyle = 'rgba(220,205,170,.55)';
  ctx.beginPath(); ctx.arc(w / 2 - 20, 176, 1.5, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.arc(w / 2 + 20, 176, 1.5, 0, 7); ctx.fill();
  // mouth
  ctx.strokeStyle = 'rgba(50,20,20,.6)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(w / 2, 214, 12, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.stroke();

  // craquelure
  ctx.strokeStyle = 'rgba(0,0,0,.35)';
  for (let i = 0; i < 22; i++) {
    ctx.lineWidth = 0.5 + Math.random();
    let x = Math.random() * w, y = Math.random() * h;
    ctx.beginPath(); ctx.moveTo(x, y);
    for (let s = 0; s < 4; s++) {
      x += (Math.random() - 0.5) * 28; y += (Math.random() - 0.5) * 28;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  // vignette
  const vg = ctx.createRadialGradient(w / 2, h / 2, 40, w / 2, h / 2, 220);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,.65)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, w, h);
  return finish(c, 1, 1);
}

export function glowTexture(color = '#ffd28a') {
  const size = 128;
  const c = canvas(size);
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,0.95)');
  g.addColorStop(0.16, color);
  g.addColorStop(0.45, 'rgba(120,90,30,.28)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function dustTexture() {
  const size = 64;
  const c = canvas(size);
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,248,225,.85)');
  g.addColorStop(0.35, 'rgba(255,248,225,.22)');
  g.addColorStop(1, 'rgba(255,248,225,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function stainedGlassTexture() {
  const size = 256;
  const c = canvas(size);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#0a0d0d';
  ctx.fillRect(0, 0, size, size);
  const cols = ['#4f7291', '#7c3f46', '#9b8346', '#3e655d', '#4b4a7a'];
  const cols2 = ['#1b3148', '#451f26', '#4e3d1c', '#1e3833', '#282647'];
  for (let gy = 0; gy < 6; gy++) {
    for (let gx = 0; gx < 4; gx++) {
      ctx.fillStyle = Math.random() > 0.4 ? cols[(gx + gy) % 5] : cols2[(gx * 2 + gy) % 5];
      ctx.globalAlpha = 0.6 + Math.random() * 0.3;
      ctx.beginPath();
      ctx.roundRect(gx * 64 + 4, gy * 42 + 4, 56, 34, 4);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
  ctx.strokeStyle = 'rgba(5,7,7,.9)';
  ctx.lineWidth = 4;
  for (let gy = 0; gy <= 6; gy++) {
    ctx.beginPath(); ctx.moveTo(0, gy * 42); ctx.lineTo(size, gy * 42); ctx.stroke();
  }
  for (let gx = 0; gx <= 4; gx++) {
    ctx.beginPath(); ctx.moveTo(gx * 64, 0); ctx.lineTo(gx * 64, size); ctx.stroke();
  }
  return finish(c, 1, 1);
}

export function moonTexture() {
  const size = 256;
  const c = canvas(size);
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(128, 128, 10, 128, 128, 128);
  g.addColorStop(0, 'rgba(225,235,220,1)');
  g.addColorStop(0.12, 'rgba(210,224,210,.9)');
  g.addColorStop(0.26, 'rgba(175,195,190,.32)');
  g.addColorStop(1, 'rgba(120,150,160,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function skyTexture() {
  const w = 768, h = 384;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#02060c');
  g.addColorStop(0.45, '#081722');
  g.addColorStop(0.72, '#10252c');
  g.addColorStop(1, '#04090a');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  // stars
  for (let i = 0; i < 240; i++) {
    const x = Math.random() * w;
    const y = Math.random() * h * 0.72;
    const a = Math.random() * 0.7 + 0.08;
    ctx.fillStyle = `rgba(205,225,230,${a})`;
    const r = Math.random() < 0.9 ? 0.7 : 1.6;
    ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
  }

  // moon
  const mx = 588, my = 88, mr = 34;
  const halo = ctx.createRadialGradient(mx, my, 5, mx, my, 130);
  halo.addColorStop(0, 'rgba(216,232,225,.55)');
  halo.addColorStop(0.16, 'rgba(180,208,208,.2)');
  halo.addColorStop(0.5, 'rgba(100,150,160,.06)');
  halo.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, w, h);
  const moon = ctx.createRadialGradient(mx - 10, my - 10, 2, mx, my, mr);
  moon.addColorStop(0, '#eef4e4');
  moon.addColorStop(0.7, '#c8d5c6');
  moon.addColorStop(1, '#96aa9f');
  ctx.fillStyle = moon;
  ctx.beginPath(); ctx.arc(mx, my, mr, 0, 7); ctx.fill();
  // moon craters
  ctx.fillStyle = 'rgba(90,108,100,.22)';
  for (const [dx, dy, r] of [[-10, 4, 6], [9, -7, 4], [4, 12, 5], [-16, -10, 3]]) {
    ctx.beginPath(); ctx.arc(mx + dx, my + dy, r, 0, 7); ctx.fill();
  }

  // thin clouds
  ctx.fillStyle = 'rgba(80,105,112,.08)';
  for (let i = 0; i < 5; i++) {
    ctx.beginPath();
    ctx.ellipse(100 + i * 150, 130 + Math.random() * 90, 160, 18, 0.04, 0, 7);
    ctx.fill();
  }

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
