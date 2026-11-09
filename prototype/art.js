// 画里山城 · 「发光山城」画风样张
// 只负责画面，不改游戏逻辑。全部用代码绘制：远近多层视差、江雾、吊脚楼灯火、边缘光、光点、复色光波。
// 灵感方向：发光、有层次、动作流畅的 2D 手绘感；场景元素全部取自重庆（吊脚楼、梯坎、江、羊肉汤摊）。
window.ArtStyle = function (api) {
'use strict';
const { ctx, U, VW, VH, C, L } = api;
const TAU = Math.PI * 2;
// 性能剖析：在控制台设置 window.__artSkip = ['desat','fog'] 可以临时跳过某些步骤
const skip = (k) => window.__artSkip && window.__artSkip.includes(k);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;

// 可复现的随机数：同一张图每次生成都一样
function rng(seed) {
  let s = seed >>> 0;
  return () => { s += 0x6D2B79F5; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const PAL = {
  skyTop: '#0d1f33', skyMid: '#2c5a6e', skyLow: '#e9a76b',
  far1: '#6f8fa0', far2: '#4c6f82', far3: '#355466', river: '#2f5568',
  house: '#1f3546', houseRoof: '#152634', near: '#0f1a24', nearRoof: '#0a131b',
  ground: '#0b1116', groundTop: '#1d2a2b',
  rim: '214,232,220', window: '255,196,110', lantern: '255,140,70', mote: '255,236,200',
  ink: '#120b19', inkRim: '170,95,215',
};

// ------------------------------------------------------------------ 预先画好的视差层
// factor：相机每移动 1 像素，这一层移动多少像素。越小越远。
const MARGIN = 120;
function makeLayer(factor, draw) {
  const W = Math.ceil(L.width * U * factor + VW + MARGIN * 2);
  const cv = document.createElement('canvas'); cv.width = W; cv.height = VH;
  const lc = cv.getContext('2d');
  const layer = { cv, factor, lights: [] };
  draw(lc, W, layer);
  return layer;
}

function ridge(lc, W, base, amp, color, seed, rough) {
  const r = rng(seed), ph = [r() * 9, r() * 9, r() * 9];
  lc.fillStyle = color; lc.beginPath(); lc.moveTo(0, VH);
  for (let x = 0; x <= W; x += 6) {
    const y = base - amp * (0.55 * Math.sin(x * 0.0021 + ph[0]) + 0.3 * Math.sin(x * 0.0057 + ph[1]) + rough * Math.sin(x * 0.019 + ph[2]));
    lc.lineTo(x, y);
  }
  lc.lineTo(W, VH); lc.closePath(); lc.fill();
}
function ridgeY(x, base, amp, seed, rough) {
  const r = rng(seed), ph = [r() * 9, r() * 9, r() * 9];
  return base - amp * (0.55 * Math.sin(x * 0.0021 + ph[0]) + 0.3 * Math.sin(x * 0.0057 + ph[1]) + rough * Math.sin(x * 0.019 + ph[2]));
}

// 吊脚楼：楼身 + 起翘的屋檐 + 栏杆 + 一直伸到坡下的木柱；窗户登记成灯光
function stiltHouse(lc, layer, x, baseY, w, h, r, body, roof, lightScale) {
  const top = baseY - h;
  // 木柱
  lc.strokeStyle = roof; lc.lineWidth = Math.max(2, w * 0.03);
  for (let k = 0; k < 4; k++) { const px = x + 6 + k * (w - 12) / 3; lc.beginPath(); lc.moveTo(px, baseY - 4); lc.lineTo(px, VH); lc.stroke(); }
  lc.beginPath(); lc.moveTo(x, baseY + 30); lc.lineTo(x + w, baseY + 18); lc.stroke();  // 斜撑
  // 楼身
  lc.fillStyle = body; lc.fillRect(x, top, w, h);
  // 栏杆
  lc.fillStyle = roof; lc.fillRect(x - 6, baseY - h * 0.38, w + 12, 3);
  for (let px = x - 4; px < x + w + 6; px += 7) lc.fillRect(px, baseY - h * 0.38, 1.5, h * 0.16);
  // 屋顶：两端起翘
  const ov = w * 0.16, rh = Math.max(10, h * 0.28);
  lc.fillStyle = roof; lc.beginPath();
  lc.moveTo(x - ov, top + 2); lc.quadraticCurveTo(x - ov * 0.4, top - 2, x + w * 0.12, top - rh);
  lc.lineTo(x + w * 0.88, top - rh); lc.quadraticCurveTo(x + w + ov * 0.4, top - 2, x + w + ov, top + 2);
  lc.lineTo(x + w + ov * 1.15, top - 6); lc.lineTo(x + w + ov * 0.7, top + 4); lc.lineTo(x - ov * 0.7, top + 4); lc.lineTo(x - ov * 1.15, top - 6);
  lc.closePath(); lc.fill();
  // 窗
  const cols = Math.max(1, Math.floor(w / 26));
  for (let c = 0; c < cols; c++) {
    if (r() < 0.35) continue;
    const wx = x + 8 + c * (w - 16) / cols, wy = top + h * 0.2, ww = Math.min(14, (w - 16) / cols - 6), wh = h * 0.22;
    lc.fillStyle = `rgba(${PAL.window},0.85)`; lc.fillRect(wx, wy, ww, wh);
    lc.fillStyle = roof; lc.fillRect(wx + ww / 2 - 0.75, wy, 1.5, wh);
    layer.lights.push({ x: wx + ww / 2, y: wy + wh / 2, r: (16 + r() * 10) * lightScale, c: PAL.window, flick: r() * 6 });
  }
}

let layers = null;
function buildLayers() {
  const far1 = makeLayer(0.06, (lc, W) => ridge(lc, W, 300, 70, PAL.far1, 11, 0.08));
  const far2 = makeLayer(0.13, (lc, W) => {
    ridge(lc, W, 330, 85, PAL.far2, 23, 0.12);
    // 远处一层模糊的楼群剪影
    const r = rng(5);
    lc.fillStyle = '#41637a';
    for (let x = 0; x < W; x += 18 + r() * 30) { const bh = 14 + r() * 34; lc.fillRect(x, ridgeY(x, 330, 85, 23, 0.12) - bh + 12, 10 + r() * 16, bh); }
  });
  const far3 = makeLayer(0.24, (lc, W) => {
    ridge(lc, W, 355, 60, PAL.far3, 37, 0.15);
    // 江面
    const grd = lc.createLinearGradient(0, 372, 0, VH);
    grd.addColorStop(0, '#3d6a7c'); grd.addColorStop(1, PAL.river);
    lc.fillStyle = grd; lc.fillRect(0, 372, W, VH - 372);
  });
  const houses = makeLayer(0.45, (lc, W, layer) => {
    const base = 410;
    ridge(lc, W, base, 55, '#24404f', 51, 0.2);
    const r = rng(77);
    for (let x = 20; x < W - 40; x += 60 + r() * 70) {
      const w = 46 + r() * 50, h = 34 + r() * 40, y = ridgeY(x + w / 2, base, 55, 51, 0.2) + 6;
      stiltHouse(lc, layer, x, y, w, h, r, PAL.house, PAL.houseRoof, 0.8);
    }
  });
  const near = makeLayer(0.72, (lc, W, layer) => {
    const r = rng(91);
    for (let x = 0; x < W - 60; x += 150 + r() * 160) {
      const w = 90 + r() * 70, h = 70 + r() * 60, y = 420 + r() * 30;
      stiltHouse(lc, layer, x, y, w, h, r, PAL.near, PAL.nearRoof, 1.1);
      // 晾衣竿
      if (r() < 0.5) {
        lc.strokeStyle = PAL.nearRoof; lc.lineWidth = 1.5;
        lc.beginPath(); lc.moveTo(x + w, y - h * 0.62); lc.lineTo(x + w + 50, y - h * 0.7); lc.stroke();
        lc.fillStyle = 'rgba(200,190,170,0.35)'; lc.fillRect(x + w + 14, y - h * 0.68, 12, 20); lc.fillRect(x + w + 32, y - h * 0.7, 10, 16);
      }
    }
  });
  layers = { far1, far2, far3, houses, near };
}

// ------------------------------------------------------------------ 复色状态
const g = () => api.g;
// 相机：游戏中跟随玩家；标题界面没有一局游戏，用 view 自己缓慢平移
let view = null;
const CAM = () => (view ? view.cam : g().cam);
const CAMY = () => (view ? 0 : (g().camY || 0));
function band(i) {
  const a = g().areas[i];
  return { a, x0: i === 0 ? -6 : g().areas[i - 1].x1, x1: a.reward === 'boss' ? L.width : a.x1 };
}
// 某个区域里还没恢复颜色的世界坐标区间（复色光波从 origin 向两边漫开）
function greyRanges(i) {
  const { a, x0, x1 } = band(i);
  if (a.state === 'restored') return [];
  if (a.state !== 'restoring') return [[x0, x1]];
  const o = clamp(a.origin !== undefined ? a.origin : x0, x0, x1);
  const r = a.restoreT * Math.max(o - x0, x1 - o);
  const out = [];
  if (o - r > x0) out.push([x0, o - r]);
  if (o + r < x1) out.push([o + r, x1]);
  return out;
}
function restoredAt(wx) {
  if (view) return 1;
  for (let i = 0; i < g().areas.length; i++) {
    const { x0, x1 } = band(i);
    const lo = i === 0 ? -1e9 : x0, hi = i === g().areas.length - 1 ? 1e9 : x1;
    if (wx < lo || wx >= hi) continue;
    return greyRanges(i).some(([a, b]) => wx >= a && wx < b) ? 0 : 1;
  }
  return 0;
}
const screenToWorld = (px) => CAM() + px / U;

// ------------------------------------------------------------------ 粒子（光点、复色光屑、蒸汽）
const motes = [];
{ const r = rng(3); for (let i = 0; i < 46; i++) motes.push({ x: r() * (VW + 200), y: 60 + r() * 420, z: 0.35 + r() * 1.0, ph: r() * TAU, sp: 6 + r() * 14 }); }
const sparks = [];   // 复色时飞起的彩色光屑
const steam = [];
let lastT = performance.now(), time = 0;
const wasState = new Map();   // 记录每个区域上一帧的状态，用于在复色开始时爆一圈光

// ------------------------------------------------------------------ 背景
function drawSky() {
  const grd = ctx.createLinearGradient(0, 0, 0, 400);
  grd.addColorStop(0, PAL.skyTop); grd.addColorStop(0.55, PAL.skyMid); grd.addColorStop(1, PAL.skyLow);
  ctx.fillStyle = grd; ctx.fillRect(0, 0, VW, VH);
  // 落日余晖
  const sx = VW * 0.68 - CAM() * U * 0.02, sy = 300;
  const sun = ctx.createRadialGradient(sx, sy, 10, sx, sy, 420);
  sun.addColorStop(0, 'rgba(255,226,170,0.75)'); sun.addColorStop(0.25, 'rgba(255,190,120,0.25)'); sun.addColorStop(1, 'rgba(255,170,100,0)');
  ctx.fillStyle = sun; ctx.fillRect(0, 0, VW, VH);
  // 光柱
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 4; i++) {
    const a = 0.035 + 0.02 * Math.sin(time * 0.4 + i * 1.7);
    ctx.fillStyle = `rgba(255,220,170,${a})`;
    const x0 = 120 + i * 190 - CAM() * U * 0.05;
    ctx.beginPath(); ctx.moveTo(x0, -10); ctx.lineTo(x0 + 70, -10); ctx.lineTo(x0 + 330, VH); ctx.lineTo(x0 + 180, VH); ctx.fill();
  }
  ctx.restore();
}

function blit(layer) {
  const ox = -MARGIN - CAM() * U * layer.factor;
  const oy = CAMY() * 0.85 * U * layer.factor;
  ctx.drawImage(layer.cv, Math.round(ox), Math.round(oy));
}

function drawFog(y, h, alpha, speed, factor) {
  const off = (time * speed + CAM() * U * factor) % 600;
  for (let i = -1; i < 3; i++) {
    const x = i * 600 - off;
    // 压扁的圆形渐变 = 椭圆形的雾团，边缘完全透明，不会出现硬边
    ctx.save(); ctx.translate(x + 300, y); ctx.scale(1, h / 360);
    const grd = ctx.createRadialGradient(0, 0, 10, 0, 0, 360);
    grd.addColorStop(0, `rgba(205,225,230,${alpha})`); grd.addColorStop(1, 'rgba(205,225,230,0)');
    ctx.fillStyle = grd; ctx.fillRect(-360, -360, 720, 720);
    ctx.restore();
  }
}

// 河面的波光
function drawRiverGlints() {
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  const oy = CAMY() * 0.85 * U * 0.24;
  for (let i = 0; i < 26; i++) {
    const x = ((i * 97 + time * 8 - CAM() * U * 0.24) % (VW + 100) + VW + 100) % (VW + 100) - 50;
    const y = 382 + (i % 6) * 14 + oy;
    const a = 0.12 + 0.12 * Math.sin(time * 2 + i);
    ctx.fillStyle = `rgba(255,214,160,${a})`; ctx.fillRect(x, y, 18 + (i % 4) * 8, 1.5);
  }
  ctx.restore();
}

// ------------------------------------------------------------------ 地形与场景物件
function hash(n) { const s = Math.sin(n * 127.1) * 43758.5453; return s - Math.floor(s); }

function drawTerrain() {
  if (drawTerrainImg()) return;
  for (const s of api.activeSolids()) {
    if (s.lock || s.gate !== undefined || s.x < -6.5 || s.x >= 120) continue;
    const x = api.sx(s.x), y = api.wy(s.y + s.h), w = s.w * U, h = s.h * U;
    if (x > VW + 10 || x + w < -10) continue;
    const isStair = L.stairs.includes(s);
    if (s.oneWay) {          // 木摊棚
      ctx.fillStyle = '#2a1d16'; ctx.fillRect(x, y, w, 9);
      ctx.fillStyle = `rgba(${PAL.rim},0.45)`; ctx.fillRect(x, y, w, 1.5);
      ctx.fillStyle = '#1a120d'; ctx.fillRect(x + 6, y + 9, 4, 50); ctx.fillRect(x + w - 10, y + 9, 4, 50);
      continue;
    }
    if (isStair || (s.w < 2 && s.h < 1)) {   // 石阶 / 开场的石墩
      const grd = ctx.createLinearGradient(0, y, 0, y + h);
      grd.addColorStop(0, '#3b4a4d'); grd.addColorStop(1, '#151d22');
      ctx.fillStyle = grd; ctx.fillRect(x, y, w, h);
      ctx.fillStyle = `rgba(${PAL.rim},0.6)`; ctx.fillRect(x, y, w, 2);
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(x + w - 3, y, 3, h);
      continue;
    }
    // 地面：深色土石 + 顶部被光照亮的边 + 青苔草叶
    const grd = ctx.createLinearGradient(0, y, 0, y + 90);
    grd.addColorStop(0, PAL.groundTop); grd.addColorStop(1, PAL.ground);
    ctx.fillStyle = grd; ctx.fillRect(x, y, w, Math.min(h, VH - y + 20));
    // 石板缝
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1;
    const x0w = Math.max(s.x, CAM() - 1), x1w = Math.min(s.x + s.w, CAM() + VW / U + 1);
    for (let wx = Math.floor(x0w); wx < x1w; wx++) {
      const px = api.sx(wx + hash(wx) * 0.6);
      ctx.beginPath(); ctx.moveTo(px, y + 4); ctx.lineTo(px + 3, y + 18); ctx.stroke();
    }
    ctx.fillStyle = `rgba(${PAL.rim},0.55)`; ctx.fillRect(x, y, w, 2);
    // 草叶
    ctx.strokeStyle = '#3f5a3a'; ctx.lineWidth = 2;
    for (let wx = Math.floor(x0w * 3) / 3; wx < x1w; wx += 1 / 3) {
      const hh = hash(wx * 3.1);
      if (hh < 0.45) continue;
      const px = api.sx(wx), sway = Math.sin(time * 1.6 + wx) * 2;
      ctx.beginPath(); ctx.moveTo(px, y + 1); ctx.quadraticCurveTo(px + 2, y - 6 * hh, px + 4 + sway, y - 12 * hh); ctx.stroke();
    }
  }
  // 还没出现的石阶：微弱的蓝色虚影
  if (!g().flags.stairs) {
    ctx.setLineDash([4, 5]); ctx.strokeStyle = `rgba(150,200,230,${0.25 + 0.15 * Math.sin(time * 2)})`; ctx.lineWidth = 1.5;
    for (const s of L.stairs) ctx.strokeRect(api.sx(s.x), api.wy(s.y + s.h), s.w * U, s.h * U);
    ctx.setLineDash([]);
  }
}

// 羊肉汤摊（区域①的主角）
function drawMuttonStall() {
  if (drawMuttonStallImg()) return;
  const x = api.sx(12.6), y = api.wy(0);
  if (x > VW + 40 || x < -260) return;
  // 柱子
  ctx.fillStyle = '#2b1c14'; ctx.fillRect(x, y - 118, 9, 118); ctx.fillRect(x + 170, y - 118, 9, 118);
  // 布篷：红底，荷叶边
  ctx.fillStyle = '#b8402e'; ctx.beginPath(); ctx.moveTo(x - 18, y - 132); ctx.lineTo(x + 196, y - 132); ctx.lineTo(x + 206, y - 104);
  for (let k = 10; k >= 0; k--) { const px = x - 22 + k * 22.8; ctx.quadraticCurveTo(px + 11, y - 92, px, y - 104); }
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(255,230,200,0.18)'; for (let k = 0; k < 6; k++) ctx.fillRect(x - 12 + k * 36, y - 132, 16, 28);
  ctx.fillStyle = `rgba(${PAL.rim},0.4)`; ctx.fillRect(x - 18, y - 133, 214, 2);
  // 招牌
  ctx.fillStyle = '#3a2416'; ctx.fillRect(x + 50, y - 162, 80, 26);
  ctx.fillStyle = '#e8c27a'; ctx.font = `bold 15px "Microsoft YaHei",sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('羊肉汤', x + 90, y - 149);
  // 柜台、锅、碗
  ctx.fillStyle = '#3a271b'; ctx.fillRect(x + 14, y - 46, 150, 46);
  ctx.fillStyle = '#5a3c28'; ctx.fillRect(x + 10, y - 50, 158, 6);
  ctx.fillStyle = '#1b1b1d'; ctx.beginPath(); ctx.ellipse(x + 60, y - 56, 28, 10, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#3a3a3e'; ctx.fillRect(x + 32, y - 66, 56, 12);
  ctx.fillStyle = '#efe6d6'; for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.ellipse(x + 112 + k * 13, y - 54, 6, 3, 0, 0, TAU); ctx.fill(); }
  // 挂着的灯笼（光在 drawLights 里加）
  for (const k of [0, 1, 2]) {
    const lx = x + 30 + k * 60, ly = y - 84 + Math.sin(time * 1.5 + k) * 1.5;
    ctx.strokeStyle = '#2b1c14'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(lx, y - 100); ctx.lineTo(lx, ly - 10); ctx.stroke();
    ctx.fillStyle = '#c23a28'; ctx.beginPath(); ctx.ellipse(lx, ly, 9, 11, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#e0a526'; ctx.fillRect(lx - 5, ly - 12, 10, 2); ctx.fillRect(lx - 5, ly + 10, 10, 2);
  }
  // 锅里冒热气（只有复色后）
  if (restoredAt(14) && Math.random() < 0.25) steam.push({ x: 12.6 + 60 / U, y: 1.25, vx: (Math.random() - 0.5) * 0.2, vy: 0.5 + Math.random() * 0.3, t: 2.2, max: 2.2, r: 6 + Math.random() * 6 });
}

// 浊气：翻涌的墨烟
function drawMurk() {
  if (drawMurkImg()) return;
  for (const s of api.activeSolids()) {
    if (!(s.lock || s.gate !== undefined)) continue;
    const x = api.sx(s.x + s.w / 2), yb = api.wy(s.y), H = 6 * U;
    if (x < -60 || x > VW + 60) continue;
    ctx.save();
    for (let i = 0; i < 16; i++) {
      const k = ((time * 0.28 + i / 16) % 1), yy = yb - k * H, rr = 22 + 14 * Math.sin(i * 2.3 + time * 0.7);
      const xx = x + Math.sin(time * 1.1 + i * 1.7) * 12 + (k - 0.5) * 10 * Math.sin(i);
      const grd = ctx.createRadialGradient(xx, yy, 0, xx, yy, rr);
      const a = 0.5 * Math.sin(k * Math.PI);
      grd.addColorStop(0, `rgba(24,12,34,${a})`); grd.addColorStop(1, 'rgba(24,12,34,0)');
      ctx.fillStyle = grd; ctx.fillRect(xx - rr, yy - rr, rr * 2, rr * 2);
    }
    ctx.globalCompositeOperation = 'lighter';
    const grd = ctx.createLinearGradient(x - 26, 0, x + 26, 0);
    grd.addColorStop(0, 'rgba(140,60,200,0)'); grd.addColorStop(0.5, `rgba(140,60,200,${0.12 + 0.05 * Math.sin(time * 3)})`); grd.addColorStop(1, 'rgba(140,60,200,0)');
    ctx.fillStyle = grd; ctx.fillRect(x - 26, yb - H, 52, H);
    ctx.restore();
  }
}

// ------------------------------------------------------------------ 各区标志场景
// 场景里的灯先登记，等去色之后再统一加光（这样灯只在复色的地方亮）
let frameLights = [];
const addLight = (x, y, r, rgb, a) => frameLights.push({ x, y, r, rgb, a });
const visible = (x0, x1) => x1 > -220 && x0 < VW + 220;

// ② 青石梯坎：身后一道爬上山的大梯坎、路灯，和一棵黄葛树
function drawStairway() {
  if (drawStairwayImg()) return;
  const yb = api.wy(0), bx0 = api.sx(30), bx1 = api.sx(42.5), by1 = yb - 250, W = 84;
  if (!visible(bx0 - 200, bx1 + 200)) return;
  // 黄葛树（重庆市树）：粗干、气根、大树冠
  const tx = api.sx(33.2);
  ctx.fillStyle = '#0d1512';
  ctx.beginPath(); ctx.moveTo(tx - 34, yb); ctx.quadraticCurveTo(tx - 12, yb - 60, tx - 14, yb - 150); ctx.lineTo(tx + 10, yb - 150);
  ctx.quadraticCurveTo(tx + 8, yb - 60, tx + 36, yb); ctx.fill();
  ctx.strokeStyle = '#0d1512'; ctx.lineWidth = 9;
  for (const [dx, dy] of [[-70, -200], [60, -215], [-20, -240]]) { ctx.beginPath(); ctx.moveTo(tx, yb - 140); ctx.quadraticCurveTo(tx + dx * 0.4, yb - 180, tx + dx, yb + dy + 10); ctx.stroke(); }
  ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(13,21,18,0.8)';
  for (let k = 0; k < 9; k++) { const rx = tx - 80 + k * 20; ctx.beginPath(); ctx.moveTo(rx, yb - 190 + (k % 3) * 8); ctx.quadraticCurveTo(rx + Math.sin(time + k) * 3, yb - 120, rx + 2, yb - 70 - (k % 4) * 12); ctx.stroke(); }
  const r = rng(404);
  for (let k = 0; k < 9; k++) {
    const cx = tx - 110 + r() * 220, cy = yb - 215 - r() * 70, cr = 45 + r() * 35;
    ctx.fillStyle = '#122019'; ctx.beginPath(); ctx.arc(cx, cy, cr, 0, TAU); ctx.fill();
  }
  ctx.strokeStyle = `rgba(${PAL.rim},0.22)`; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(tx - 20, yb - 275, 80, Math.PI * 1.15, Math.PI * 1.7); ctx.stroke();
  // 大梯坎
  ctx.fillStyle = '#1b262c';
  ctx.beginPath(); ctx.moveTo(bx0, yb); ctx.lineTo(bx0 + W, yb); ctx.lineTo(bx1 + W, by1); ctx.lineTo(bx1, by1); ctx.closePath(); ctx.fill();
  for (let i = 0; i <= 26; i++) {
    const k = i / 26, x = lerp(bx0, bx1, k), y = lerp(yb, by1, k);
    ctx.fillStyle = `rgba(${PAL.rim},${0.12 + 0.12 * (1 - k)})`; ctx.fillRect(x, y, W, 1.5);
  }
  ctx.strokeStyle = '#0c1418'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(bx0, yb - 28); ctx.lineTo(bx1, by1 - 28); ctx.stroke();
  for (let i = 1; i <= 3; i++) {
    const k = i / 4, x = lerp(bx0, bx1, k), y = lerp(yb, by1, k);
    ctx.fillStyle = '#0c1418'; ctx.fillRect(x - 2, y - 62, 4, 62);
    ctx.fillStyle = '#4a3a22'; ctx.fillRect(x - 6, y - 74, 12, 13);
    addLight(x, y - 68, 55, '255,200,120', 0.55);
  }
}

// ③ 龙灯街：一串灯笼 + 一条悬在街上的龙灯，复色后整条龙亮成金色
function drawLanternStreet() {
  if (drawLanternStreetImg()) return;
  const lit = g().areas[2].state === 'restored';
  const x0 = api.sx(53), x1 = api.sx(67);
  if (!visible(x0, x1)) return;
  ctx.strokeStyle = '#1b1410'; ctx.lineWidth = 1.5; ctx.beginPath();
  ctx.moveTo(x0, api.wy(8.6)); ctx.quadraticCurveTo(api.sx(60), api.wy(7.8), x1, api.wy(8.6)); ctx.stroke();
  for (let i = 0; i < 7; i++) {
    const lx = api.sx(54.2 + i * 1.8), ly = api.wy(8.1 - Math.sin(i / 6 * Math.PI) * 0.4) + Math.sin(time * 1.3 + i) * 2;
    ctx.fillStyle = lit ? '#d8402a' : '#3a2a22'; ctx.beginPath(); ctx.ellipse(lx, ly, 8, 10, 0, 0, TAU); ctx.fill();
    if (lit) addLight(lx, ly, 34, '255,120,70', 0.5);
  }
  // 龙灯：连续起伏的龙身 + 鳞片 + 舞龙杆
  const N = 22, pts = [];
  for (let i = 0; i < N; i++) {
    const wx = 54.3 + i * 0.5, wyy = 2.5 + 3.9 + Math.sin(time * 1.6 - i * 0.45) * 0.4;
    pts.push([api.sx(wx), api.wy(wyy)]);
  }
  ctx.strokeStyle = '#120d0a'; ctx.lineWidth = 2;
  for (let i = 2; i < N; i += 4) { const [px, py] = pts[i]; ctx.beginPath(); ctx.moveTo(px, py + 10); ctx.lineTo(px, py + 58); ctx.stroke(); }
  const body = lit ? '#e8a823' : '#3d3326', belly = lit ? '#c4471f' : '#2a221b';
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const [lw, col] of [[24, body], [8, belly]]) {
    ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.beginPath();
    pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py + (lw === 8 ? 6 : 0)) : ctx.moveTo(px, py + (lw === 8 ? 6 : 0))));
    ctx.stroke();
  }
  ctx.strokeStyle = lit ? 'rgba(120,50,10,0.55)' : 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1.5;
  for (let i = 1; i < N - 1; i++) { const [px, py] = pts[i]; ctx.beginPath(); ctx.arc(px, py - 2, 7, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke(); }
  // 背鳍
  ctx.fillStyle = lit ? '#c4471f' : '#2a221b';
  for (let i = 1; i < N - 2; i += 2) { const [px, py] = pts[i]; ctx.beginPath(); ctx.moveTo(px - 6, py - 10); ctx.lineTo(px, py - 20); ctx.lineTo(px + 6, py - 10); ctx.fill(); }
  // 龙尾
  { const [tx, ty] = pts[0]; ctx.fillStyle = body; ctx.beginPath(); ctx.moveTo(tx, ty - 10); ctx.lineTo(tx - 26, ty - 22); ctx.lineTo(tx - 18, ty); ctx.lineTo(tx - 26, ty + 18); ctx.lineTo(tx, ty + 10); ctx.fill(); }
  if (lit) for (let i = 0; i < N; i += 3) addLight(pts[i][0], pts[i][1], 46, '255,190,70', 0.38);
  // 龙头
  const [hx, hy] = pts[N - 1];
  ctx.fillStyle = lit ? '#f0b52a' : '#40362a';
  ctx.beginPath(); ctx.moveTo(hx - 6, hy - 14); ctx.lineTo(hx + 30, hy - 6); ctx.lineTo(hx + 34, hy + 6); ctx.lineTo(hx + 8, hy + 14); ctx.lineTo(hx - 8, hy + 8); ctx.fill();
  ctx.strokeStyle = lit ? '#f0b52a' : '#40362a'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(hx + 2, hy - 12); ctx.quadraticCurveTo(hx - 6, hy - 30, hx + 8, hy - 34); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(hx + 14, hy - 10); ctx.quadraticCurveTo(hx + 10, hy - 30, hx + 24, hy - 32); ctx.stroke();
  ctx.fillStyle = lit ? '#c0281e' : '#201812'; ctx.beginPath(); ctx.arc(hx + 18, hy - 2, 3, 0, TAU); ctx.fill();
  if (lit) addLight(hx + 14, hy, 80, '255,200,90', 0.6);
}

// ④ 戏台前场：卖荣昌折扇的摊子 + 迎风的旗
function drawFanStall() {
  if (drawFanStallImg()) return;
  const x = api.sx(68.6), y = api.wy(2.5);
  if (visible(x - 40, x + 150)) {
    ctx.fillStyle = '#20150f'; ctx.fillRect(x, y - 96, 6, 96); ctx.fillRect(x + 104, y - 96, 6, 96);
    ctx.fillStyle = '#3b2717'; ctx.fillRect(x - 6, y - 100, 122, 8); ctx.fillRect(x + 6, y - 40, 98, 40);
    const fans = ['#c8402f', '#e0a526', '#3e9b5a', '#4f7f8f', '#b23a8e'];
    fans.forEach((c, i) => {
      const fx = x + 16 + i * 20, fy = y - 56 + (i % 2) * 8;
      ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(fx, fy + 10); ctx.arc(fx, fy + 10, 15, Math.PI * 1.1, Math.PI * 1.9); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1;
      for (let k = 0; k < 5; k++) { const a = Math.PI * (1.1 + k * 0.2); ctx.beginPath(); ctx.moveTo(fx, fy + 10); ctx.lineTo(fx + Math.cos(a) * 15, fy + 10 + Math.sin(a) * 15); ctx.stroke(); }
    });
    ctx.fillStyle = '#2b1c12'; ctx.fillRect(x + 28, y - 126, 54, 22);
    ctx.fillStyle = '#e8c27a'; ctx.font = 'bold 13px "Microsoft YaHei",sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('荣昌折扇', x + 55, y - 115);
    addLight(x + 55, y - 115, 50, '255,200,120', 0.35);
  }
  for (const [wx, c] of [[76, '#b8402e'], [82.5, '#3e9b5a'], [89, '#e0a526']]) {
    const px = api.sx(wx);
    if (!visible(px, px)) continue;
    ctx.fillStyle = '#120d0a'; ctx.fillRect(px - 2, y - 210, 4, 210);
    ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(px + 2, y - 206);
    for (let k = 0; k <= 8; k++) ctx.lineTo(px + 2 + k * 6, y - 206 + Math.sin(time * 4 - k * 0.7) * 4 * (k / 8) + k * 0.6);
    for (let k = 8; k >= 0; k--) ctx.lineTo(px + 2 + k * 5.4, y - 166 + Math.sin(time * 4 - k * 0.7) * 4 * (k / 8) - k * 1.8);
    ctx.fill();
  }
}

// ④ 出口的帷幕 + ⑤ 戏台
function drawStage() {
  if (drawStageImg()) return;
  const a4 = g().areas[3], open = a4.state === 'restored' ? 1 : a4.state === 'restoring' ? a4.restoreT : 0;
  const cx = api.sx(a4.x1), y = api.wy(2.5);
  if (visible(cx - 100, cx + 100)) {
    for (const side of [-1, 1]) {
      const x0 = side < 0 ? cx - 48 - open * 36 : cx + 4 + open * 36;
      const grd = ctx.createLinearGradient(x0, 0, x0 + 44, 0);
      grd.addColorStop(0, '#4a1512'); grd.addColorStop(0.5, '#7a221b'); grd.addColorStop(1, '#4a1512');
      ctx.fillStyle = grd; ctx.fillRect(x0, y - 236, 44, 236);
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; for (let k = 0; k < 4; k++) ctx.fillRect(x0 + 6 + k * 10, y - 236, 3, 236);
    }
    ctx.fillStyle = '#140e0b'; ctx.fillRect(cx - 90, y - 252, 180, 20);
  }
  const a5 = g().areas[4], x0 = api.sx(a5.x0 + 1), x1 = api.sx(a5.x1 - 1), mid = (x0 + x1) / 2;
  const ys = y + 40;   // 戏台整体往下放，给顶部提示条让位
  if (!visible(x0, x1)) return;
  { const y = ys;
  // 屏风（台后的背板）
  ctx.fillStyle = '#2a1712'; ctx.fillRect(x0 + 40, y - 236, x1 - x0 - 80, 196);
  ctx.strokeStyle = 'rgba(224,165,38,0.35)'; ctx.lineWidth = 2;
  for (let k = 0; k < 6; k++) { const px = x0 + 60 + k * (x1 - x0 - 120) / 5; ctx.strokeRect(px - 26, y - 210, 52, 130); ctx.beginPath(); ctx.arc(px, y - 145, 16, 0, TAU); ctx.stroke(); }
  // 红柱
  ctx.fillStyle = '#6e1a15'; ctx.fillRect(x0 + 6, y - 250, 16, 210); ctx.fillRect(x1 - 22, y - 250, 16, 210);
  ctx.fillStyle = `rgba(${PAL.rim},0.3)`; ctx.fillRect(x0 + 6, y - 250, 2, 210); ctx.fillRect(x1 - 22, y - 250, 2, 210);
  // 飞檐屋顶
  ctx.fillStyle = '#120c0a';
  ctx.beginPath(); ctx.moveTo(x0 - 60, y - 262); ctx.quadraticCurveTo(x0 - 20, y - 268, x0 + 10, y - 300);
  ctx.lineTo(x1 - 10, y - 300); ctx.quadraticCurveTo(x1 + 20, y - 268, x1 + 60, y - 262);
  ctx.lineTo(x1 + 72, y - 280); ctx.lineTo(x1 + 50, y - 252); ctx.lineTo(x0 - 50, y - 252); ctx.lineTo(x0 - 72, y - 280); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#120c0a'; ctx.beginPath(); ctx.moveTo(x0 + 40, y - 300); ctx.lineTo(mid, y - 340); ctx.lineTo(x1 - 40, y - 300); ctx.fill();
  ctx.strokeStyle = `rgba(${PAL.rim},0.35)`; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(x0 - 60, y - 262); ctx.quadraticCurveTo(x0 - 20, y - 268, x0 + 10, y - 300); ctx.lineTo(x1 - 10, y - 300); ctx.quadraticCurveTo(x1 + 20, y - 268, x1 + 60, y - 262); ctx.stroke();
  // 匾
  ctx.fillStyle = '#3a2416'; ctx.fillRect(mid - 50, y - 292, 100, 26);
  ctx.fillStyle = '#e8c27a'; ctx.font = 'bold 15px "Microsoft YaHei",sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('万年台', mid, y - 279);
  addLight(mid, y - 279, 60, '255,200,120', 0.35);
  // 大红灯笼
  for (const lx of [x0 + 70, x1 - 70]) {
    const ly = y - 230 + Math.sin(time * 1.2 + lx) * 2;
    ctx.strokeStyle = '#120c0a'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(lx, y - 252); ctx.lineTo(lx, ly - 18); ctx.stroke();
    ctx.fillStyle = '#c8302a'; ctx.beginPath(); ctx.ellipse(lx, ly, 18, 22, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#e0a526'; ctx.fillRect(lx - 10, ly - 24, 20, 4); ctx.fillRect(lx - 10, ly + 20, 20, 4);
    addLight(lx, ly, 90, '255,120,70', 0.55);
  }
  }
}

// 结尾谢幕：前景的看戏人群，举着灯笼
function drawCrowd() {
  const a5 = g().areas[4];
  const k = g().finalT >= 0 ? clamp(g().finalT / 1.2, 0, 1) : a5.state === 'restored' ? 1 : 0;
  if (k <= 0) return;
  if (drawCrowdImg(k)) return;
  const r = rng(808);
  ctx.save(); ctx.globalAlpha = k;
  for (let i = 0; i < 26; i++) {
    const x = r() * (VW + 80) - 40, s = 0.8 + r() * 0.5, bob = Math.sin(time * 5 + i) * 3 * (i % 2);
    const y = VH + 10 - bob;
    ctx.fillStyle = '#05070a';
    ctx.beginPath(); ctx.ellipse(x, y - 30 * s, 26 * s, 40 * s, 0, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(x, y - 78 * s, 15 * s, 0, TAU); ctx.fill();
    if (i % 4 === 0) {   // 举起的灯笼
      const lx = x + 16 * s, ly = y - 120 * s + bob;
      ctx.strokeStyle = '#05070a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x + 10 * s, y - 60 * s); ctx.lineTo(lx, ly + 12); ctx.stroke();
      ctx.fillStyle = '#e04a2a'; ctx.beginPath(); ctx.ellipse(lx, ly, 8, 10, 0, 0, TAU); ctx.fill();
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; glow(lx, ly, 40, '255,130,70', 0.6); ctx.restore();
    }
    if (i % 3 === 1) {   // 举手欢呼
      ctx.strokeStyle = '#05070a'; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(x - 12 * s, y - 60 * s); ctx.lineTo(x - 22 * s, y - 104 * s + bob); ctx.stroke();
    }
  }
  ctx.restore();
}

// 暗巷：龙灯没亮之前，前面的街是一片墨黑
function dark() {
  const x0 = api.sx(L.darkRange[0]), x1 = api.sx(L.darkRange[1]);
  if (x0 > VW || x1 < 0) return;
  const grd = ctx.createLinearGradient(x0, 0, x0 + 140, 0);
  grd.addColorStop(0, 'rgba(5,6,12,0)'); grd.addColorStop(1, 'rgba(5,6,12,0.86)');
  ctx.fillStyle = grd; ctx.fillRect(x0, 0, 140, VH);
  ctx.fillStyle = 'rgba(5,6,12,0.86)'; ctx.fillRect(x0 + 140, 0, Math.max(0, x1 - x0 - 140), VH);
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 8; i++) {
    const px = x0 + 160 + ((i * 113 + time * 12) % Math.max(200, x1 - x0 - 160)), py = 160 + (i * 57) % 260;
    glow(px, py + Math.sin(time + i) * 10, 40, '120,80,170', 0.08);
  }
  ctx.restore();
  if (x0 < VW - 80) api.text('暗巷：龙灯未亮', Math.max(x0 + 150, 60), 150, 16, 'rgba(220,210,240,0.6)');
}

// ------------------------------------------------------------------ 张不管：川剧丑角剪影
function boss(b) {
  const B = C.boss, x = api.sx(b.x), y = api.wy(b.y), w = b.w * U, h = b.h * U, f = b.facing;
  if (x < -150 || x > VW + 150) return;
  ctx.save();
  if (b.state === 'dead') ctx.globalAlpha = Math.max(0.2, 1 - b.t * 0.3);
  // ---- 预警（信息和灰盒完全一样，只是换成发光的样子）
  if (b.state === 'charge_tele') {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = 'rgba(255,70,60,0.85)'; ctx.lineWidth = 5; ctx.setLineDash([12, 6]);
    ctx.beginPath(); ctx.moveTo(x, y - 3); ctx.lineTo(x + b.chargeDir * B.charge.maxDist * U, y - 3); ctx.stroke(); ctx.setLineDash([]);
    glow(x, y - h / 2, 90, '255,60,50', 0.35);
    ctx.restore();
    const k = 1 - b.t / (B.charge.tele + api.extraTele(b.area));
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(x - 30, y - h - 26, 60, 7);
    ctx.fillStyle = '#ff4a3a'; ctx.fillRect(x - 30, y - h - 26, 60 * clamp(k, 0, 1), 7);
  }
  const weak = api.bossVulnerable(b);
  if (weak) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; glow(x, y - h / 2, h * 0.9, '255,214,90', b.stunned ? 0.55 : 0.38); ctx.restore(); }
  if (!bossImg(b, x, y, w, h, f)) {
  // ---- 身体：长袍
  const sil = b.state === 'phase' ? '#4a4a52' : '#120c10';
  ctx.fillStyle = sil;
  ctx.beginPath(); ctx.moveTo(x - w * 0.62, y); ctx.lineTo(x - w * 0.38, y - h * 0.72); ctx.lineTo(x + w * 0.38, y - h * 0.72); ctx.lineTo(x + w * 0.62, y); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#6b2a20'; ctx.globalAlpha *= 0.75;
  ctx.beginPath(); ctx.moveTo(x - w * 0.5, y - 2); ctx.lineTo(x - w * 0.32, y - h * 0.68); ctx.lineTo(x + w * 0.32, y - h * 0.68); ctx.lineTo(x + w * 0.5, y - 2); ctx.closePath(); ctx.fill();
  ctx.globalAlpha = b.state === 'dead' ? Math.max(0.2, 1 - b.t * 0.3) : 1;
  ctx.fillStyle = '#d9b44a'; ctx.fillRect(x - w * 0.42, y - h * 0.45, w * 0.84, 4);   // 腰带
  ctx.strokeStyle = `rgba(${PAL.rim},0.7)`; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(x - w * 0.62 * f, y); ctx.lineTo(x - w * 0.38 * f, y - h * 0.72); ctx.stroke();
  // ---- 头：丑角帽 + 鼻梁上的白「豆腐块」
  const hx = x + f * 4, hy = y - h * 0.72 - 16;
  ctx.fillStyle = sil; ctx.beginPath(); ctx.arc(hx, hy, 17, 0, TAU); ctx.fill();
  ctx.fillStyle = '#0a0709';
  ctx.beginPath(); ctx.moveTo(hx - 18, hy - 8); ctx.lineTo(hx - 13, hy - 30); ctx.lineTo(hx + 13, hy - 30); ctx.lineTo(hx + 18, hy - 8); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.ellipse(hx - 24, hy - 20, 10, 4, -0.4 + Math.sin(time * 3) * 0.15, 0, TAU); ctx.fill();   // 帽翅
  ctx.beginPath(); ctx.ellipse(hx + 24, hy - 20, 10, 4, 0.4 - Math.sin(time * 3) * 0.15, 0, TAU); ctx.fill();
  ctx.fillStyle = '#f4efe4'; ctx.fillRect(hx + f * 3 - 7, hy - 6, 14, 12);
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; glow(hx + f * 3, hy, 22, '255,250,235', 0.35); ctx.restore();
  ctx.fillStyle = '#1a1014'; ctx.fillRect(hx + f * 3 - 6, hy - 3, 4, 3); ctx.fillRect(hx + f * 3 + 2, hy - 3, 4, 3);
  // ---- 扇子的姿态
  const fanAt = (fx, fy, rr, open) => {
    ctx.fillStyle = '#efe4c8'; ctx.beginPath(); ctx.moveTo(fx, fy);
    ctx.arc(fx, fy, rr, Math.PI * (1.5 - open / 2), Math.PI * (1.5 + open / 2)); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(110,58,44,0.6)'; ctx.lineWidth = 1;
    for (let k = 0; k <= 6; k++) { const a = Math.PI * (1.5 - open / 2 + open * k / 6); ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(fx + Math.cos(a) * rr, fy + Math.sin(a) * rr); ctx.stroke(); }
  };
  if (b.state === 'fan_tele') {
    fanAt(hx + f * 14, hy - 30, 30, 1);
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; glow(hx + f * 14, hy - 44, 50, '255,240,200', 0.4); ctx.restore();
  } else if (b.state === 'fake_tele') {
    fanAt(hx, hy - 42, 26, 1);
    api.text('投降！投降！', x, hy - 84, 15, '#ffe9c8', 'center', 'bold');
    ctx.strokeStyle = `rgba(150,60,200,${0.45 + 0.4 * Math.sin(time * 20)})`; ctx.lineWidth = 3;
    for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(x + f * (w / 2 + 8), y - h + 24 + i * 18); ctx.lineTo(x + f * (w / 2 + 38), y - h + 18 + i * 18); ctx.stroke(); }
  } else if (b.state !== 'fan_wait') {
    ctx.strokeStyle = '#efe4c8'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(x + f * w * 0.45, y - h * 0.5); ctx.lineTo(x + f * (w * 0.45 + 18), y - h * 0.62); ctx.stroke();
  }
  }
  ctx.restore();
  if (b.state === 'fake_tele' && img('boss/side')) {
    api.text('投降！投降！', x, y - h - 70, 15, '#ffe9c8', 'center', 'bold');
    ctx.strokeStyle = `rgba(150,60,200,${0.45 + 0.4 * Math.sin(time * 20)})`; ctx.lineWidth = 3;
    for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(x + f * (w / 2 + 8), y - h + 24 + i * 18); ctx.lineTo(x + f * (w / 2 + 38), y - h + 18 + i * 18); ctx.stroke(); }
  }
  // ---- 受击闪白、开冲、破绽文字
  if (b.flash > 0) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; glow(x, y - h / 2, w, '255,255,255', 0.5); drawFrame('fx/hit_spark_4f', (0.1 - b.flash) / 0.1 * 4, x, y - h / 2, 70, 70); ctx.restore(); }
  if (b.goT > 0) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; glow(x, y - h / 2, 80, '255,255,255', 0.5); ctx.restore();
    api.text('冲！', x, y - h - 34, 26, '#ff5a3a', 'center', 'bold');
  }
  if (weak) {
    const label = b.stunned ? (b.state === 'fan_recover' ? '被扇晕了！' : '被拆穿了！') : b.state === 'fan_recover' ? '收扇' : '喘气';
    api.text(label, x, y - h - (b.stunned ? 70 : 54), b.stunned ? 18 : 15, b.stunned ? '#ff6a4a' : '#ffd36a', 'center', 'bold');
  }
  if (api.debug) api.text(b.state + ' ' + b.t.toFixed(2), x, y + 14, 11, '#fff', 'center');
}

// ------------------------------------------------------------------ 投射物
function proj(q) {
  const x = api.sx(q.x), y = api.wy(q.y), d = Math.sign(q.vx) || 1;
  if (projImg(q, x, y, d)) return;
  ctx.save();
  if (q.kind === 'needle') {
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = 'rgba(255,90,70,0.35)'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(x - d * 26, y); ctx.lineTo(x + d * 10, y); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,245,230,0.95)'; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.moveTo(x - d * 12, y); ctx.lineTo(x + d * 12, y); ctx.stroke();
  } else if (q.kind === 'grain') {
    ctx.globalCompositeOperation = 'lighter';
    glow(x, y, 18, '240,190,70', 0.7);
    ctx.fillStyle = '#ffe08a'; ctx.beginPath(); ctx.ellipse(x, y, 4, 6, Math.atan2(q.vy, q.vx), 0, TAU); ctx.fill();
  } else if (q.kind === 'bfan') {
    // 地面箭头：飞扇往哪边走；停顿时闪烁并标「回！」
    const dir = q.phase === 'hover' ? Math.sign((g().boss ? g().boss.x : q.x) - q.x) : d;
    const gy = api.wy(g().areas[4].ground) - 2;
    const col = q.phase === 'reflect' ? '255,200,70' : '255,70,60';
    const al = q.phase === 'out' ? 0.55 : 0.95;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = `rgba(${col},${al})`; ctx.lineWidth = 4; ctx.setLineDash([10, 6]);
    ctx.beginPath(); ctx.moveTo(x, gy); ctx.lineTo(x + dir * 2.5 * U, gy); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = `rgba(${col},${al})`; ctx.beginPath();
    ctx.moveTo(x + dir * 2.5 * U + dir * 12, gy); ctx.lineTo(x + dir * 2.5 * U, gy - 8); ctx.lineTo(x + dir * 2.5 * U, gy + 8); ctx.fill();
    glow(x, y - 6, 46, q.phase === 'reflect' ? '255,210,80' : '255,240,210', 0.5);
    ctx.restore();
    if (q.phase === 'hover') {
      const blink = Math.floor(q.hoverT * 12) % 2 === 0;
      ctx.strokeStyle = blink ? '#ff4a3a' : '#ffd84a'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(x, y - 6, 32, 0, TAU); ctx.stroke();
      api.text('回！', x, y - 56, 22, '#ff6a4a', 'center', 'bold');
    }
    if (q.phase === 'back') api.text('回', x, y - 42, 15, '#ff6a4a', 'center', 'bold');
    if (drawFrame('fx/boss_fan_4f', (q.spin || 0) * 0.7, x, y - 6, 52, 52)) { ctx.restore(); return; }
    ctx.translate(x, y - 6); ctx.rotate(q.spin || 0);
    ctx.fillStyle = q.phase === 'reflect' ? '#ffd84a' : '#f3e8cc';
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, 21, 0, Math.PI * 0.9); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(110,58,44,0.7)'; ctx.lineWidth = 1;
    for (let k = 0; k <= 5; k++) { const a = Math.PI * 0.9 * k / 5; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * 21, Math.sin(a) * 21); ctx.stroke(); }
  }
  ctx.restore();
}

// ------------------------------------------------------------------ 道具
function pickup(q) {
  const x = api.sx(q.x), y = api.wy(q.y) - 24 + Math.sin(time * 3 + (q.bob || 0)) * 4;
  if (x < -40 || x > VW + 40) return;
  if (pickupImg(q, x, y)) return;
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  glow(x, y, 46, q.type === 'mutton' ? '255,170,110' : q.type === 'dragon' ? '255,200,80' : '120,230,150', 0.45);
  ctx.restore();
  if (q.type === 'mutton') {   // 一碗羊肉汤
    ctx.fillStyle = '#efe6d6'; ctx.beginPath(); ctx.ellipse(x, y + 2, 16, 9, 0, 0, Math.PI); ctx.fill();
    ctx.fillStyle = '#d8a060'; ctx.beginPath(); ctx.ellipse(x, y + 2, 15, 5, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#8a4a2a'; ctx.fillRect(x - 7, y, 6, 3); ctx.fillRect(x + 2, y + 1, 5, 3);
    ctx.strokeStyle = 'rgba(240,240,240,0.35)'; ctx.lineWidth = 2;
    for (let k = -1; k <= 1; k++) { ctx.beginPath(); ctx.moveTo(x + k * 6, y - 4); ctx.quadraticCurveTo(x + k * 6 + Math.sin(time * 3 + k) * 5, y - 14, x + k * 6, y - 24); ctx.stroke(); }
    api.text('羊肉汤', x, y - 32, 12, '#ffe0c0', 'center', 'bold');
  } else {
    const col = q.type === 'dragon' ? '255,200,80' : '120,230,150';
    ctx.strokeStyle = `rgba(${col},0.8)`; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, 22 + Math.sin(time * 5) * 4, 0, TAU); ctx.stroke();
    ctx.fillStyle = `rgba(${col},0.95)`; ctx.beginPath(); ctx.arc(x, y, 14, 0, TAU); ctx.fill();
    api.text(q.type === 'dragon' ? '龙' : '扇', x, y + 1, 15, '#1a1208', 'center', 'bold');
  }
}

// ------------------------------------------------------------------ 标题背景：整幅山城缓缓平移，全部亮着
function titleBack() {
  const now = performance.now(), dt = Math.min(0.05, (now - lastT) / 1000); lastT = now; time += dt;
  const span = L.width - VW / U - 2;
  view = { cam: (time * 0.9) % (span * 2) < span ? (time * 0.9) % span : span - ((time * 0.9) % span) };
  drawBackdrop();
  frameLights = [];
  drawLights();
  frontAmbient();
  view = null;
}

// ------------------------------------------------------------------ 剧情背景
// 墨爷的画室：雨夜、烛光、刻了一半的木版、墙上的《山城百景图》。scene 越大，浊墨渗得越多
let storyScene = -1, sceneT = 0;
function drawStudio(scene) {
  if (scene !== storyScene) { storyScene = scene; sceneT = 0; }
  const k = clamp(sceneT / 1.6, 0, 1);       // 本分镜内的进度（墨慢慢爬）
  // 墙和地
  const wall = ctx.createLinearGradient(0, 0, 0, VH);
  wall.addColorStop(0, '#1d1611'); wall.addColorStop(1, '#0c0907');
  ctx.fillStyle = wall; ctx.fillRect(0, 0, VW, VH);
  ctx.fillStyle = '#080605'; ctx.fillRect(0, 395, VW, VH - 395);
  // 窗：夜雨
  ctx.fillStyle = '#0d1a26'; ctx.fillRect(90, 70, 190, 210);
  ctx.save(); ctx.beginPath(); ctx.rect(90, 70, 190, 210); ctx.clip();
  ctx.strokeStyle = 'rgba(150,180,210,0.35)'; ctx.lineWidth = 1;
  for (let i = 0; i < 40; i++) {
    const x = 90 + ((i * 37 + time * 60) % 210), y = 70 + ((i * 53 + time * 420) % 230);
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 4, y + 16); ctx.stroke();
  }
  ctx.restore();
  ctx.strokeStyle = '#2a1d14'; ctx.lineWidth = 8; ctx.strokeRect(90, 70, 190, 210);
  ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(185, 70); ctx.lineTo(185, 280); ctx.moveTo(90, 175); ctx.lineTo(280, 175); ctx.stroke();
  // 墙上的《山城百景图》：一幅小画，随剧情褪色
  const sx0 = 420, sy0 = 50, sw = 340, sh = 230;
  ctx.fillStyle = '#3a2a1c'; ctx.fillRect(sx0 - 12, sy0 - 16, sw + 24, 10); ctx.fillRect(sx0 - 12, sy0 + sh + 6, sw + 24, 10);
  ctx.fillStyle = '#e8dcc0'; ctx.fillRect(sx0, sy0, sw, sh);
  ctx.save(); ctx.beginPath(); ctx.rect(sx0 + 10, sy0 + 10, sw - 20, sh - 20); ctx.clip();
  const sky = ctx.createLinearGradient(0, sy0, 0, sy0 + sh);
  sky.addColorStop(0, '#2c5a6e'); sky.addColorStop(0.7, '#e9a76b'); sky.addColorStop(1, '#e9a76b');
  ctx.fillStyle = sky; ctx.fillRect(sx0, sy0, sw, sh);
  ctx.fillStyle = '#4c6f82'; ctx.beginPath(); ctx.moveTo(sx0, sy0 + 150);
  for (let x = 0; x <= sw; x += 10) ctx.lineTo(sx0 + x, sy0 + 130 - 25 * Math.sin(x * 0.03) - 12 * Math.sin(x * 0.08));
  ctx.lineTo(sx0 + sw, sy0 + sh); ctx.lineTo(sx0, sy0 + sh); ctx.fill();
  const r = rng(12);
  for (let i = 0; i < 9; i++) {
    const hx = sx0 + 14 + i * 36, hh = 30 + r() * 30, hy = sy0 + sh - 20 - hh;
    ctx.fillStyle = '#1f3546'; ctx.fillRect(hx, hy, 28, hh + 20);
    ctx.fillStyle = '#152634'; ctx.beginPath(); ctx.moveTo(hx - 5, hy); ctx.lineTo(hx + 14, hy - 12); ctx.lineTo(hx + 33, hy); ctx.fill();
    ctx.fillStyle = 'rgba(255,196,110,0.9)'; ctx.fillRect(hx + 6, hy + 8, 6, 7); ctx.fillRect(hx + 16, hy + 8, 6, 7);
  }
  ctx.fillStyle = '#c8402f'; ctx.fillRect(sx0 + 150, sy0 + 170, 50, 12);
  // 褪色：scene 4 开始从下往上变灰
  const grey = scene < 4 ? 0 : scene === 4 ? k : 1;
  if (grey > 0) {
    const gh = sh * grey;
    ctx.globalCompositeOperation = 'saturation'; ctx.fillStyle = '#808080'; ctx.fillRect(sx0, sy0 + sh - gh, sw, gh);
    ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = 'rgba(140,140,150,1)'; ctx.globalAlpha = 0.6; ctx.fillRect(sx0, sy0 + sh - gh, sw, gh);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }
  // 墨斑
  if (scene >= 3) {
    const m = scene === 3 ? k : 1;
    for (let i = 0; i < 7; i++) {
      const bx = sx0 + 40 + i * 42, by = sy0 + sh - 10, br = (14 + (i % 3) * 8) * m;
      ctx.fillStyle = 'rgba(18,10,26,0.85)'; ctx.beginPath(); ctx.arc(bx, by - br * 0.5, br, 0, TAU); ctx.fill();
    }
  }
  ctx.restore();
  // 画在发光（scene 6：守画人要进去了）
  if (scene >= 6) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; glow(sx0 + sw / 2, sy0 + sh / 2, 260, '255,220,160', 0.25 + 0.1 * Math.sin(time * 3)); ctx.restore(); }
  // 桌子
  ctx.fillStyle = '#2a1c12'; ctx.fillRect(170, 360, 470, 18);
  ctx.fillStyle = '#1c130c'; ctx.fillRect(190, 378, 14, 120); ctx.fillRect(606, 378, 14, 120);
  // 木版 + 刻刀 + 裂缝
  ctx.fillStyle = '#6a4a2c'; ctx.fillRect(380, 340, 110, 20);
  ctx.fillStyle = '#4a321e'; for (let i = 0; i < 6; i++) ctx.fillRect(390 + i * 16, 344, 10, 3);
  if (scene >= 2) {
    ctx.strokeStyle = '#120a08'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(428, 340); ctx.lineTo(434, 348); ctx.lineTo(430, 360); ctx.stroke();
    ctx.fillStyle = '#b8b8c0'; ctx.fillRect(430, 300, 3, 42); ctx.fillStyle = '#3a2416'; ctx.fillRect(427, 290, 9, 16);
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; glow(432, 350, 40, '150,70,220', 0.45 + 0.2 * Math.sin(time * 5)); ctx.restore();
  }
  // 浊墨：从裂缝顺着桌腿爬到墙上的画
  if (scene >= 3) {
    const m = scene === 3 ? k : 1;
    ctx.strokeStyle = 'rgba(18,10,26,0.9)'; ctx.lineCap = 'round';
    for (let j = 0; j < 3; j++) {
      ctx.lineWidth = 6 - j * 1.5;
      ctx.beginPath(); ctx.moveTo(432 + j * 6, 352);
      const ex = lerp(432, 470 + j * 40, m), ey = lerp(352, sy0 + sh + 4, m);
      ctx.bezierCurveTo(470 + j * 10, 380, 520 - j * 20, 330 - m * 40, ex + Math.sin(time * 2 + j) * 4, ey);
      ctx.stroke();
    }
  }
  // 蜡烛
  const fl = 0.85 + 0.15 * Math.sin(time * 9) * Math.sin(time * 5.3);
  ctx.fillStyle = '#e8dcc0'; ctx.fillRect(556, 318, 10, 42);
  ctx.fillStyle = '#ffd27a'; ctx.beginPath(); ctx.ellipse(561, 310, 4, 9, Math.sin(time * 4) * 0.15, 0, TAU); ctx.fill();
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  glow(561, 312, 260 * fl, '255,170,90', 0.35); glow(561, 310, 30, '255,230,170', 0.9);
  ctx.restore();
  // 墨爷：坐在桌边刻版；scene 5 起伏在桌上
  const sil = '#060404';
  ctx.fillStyle = sil;
  if (scene < 5) {
    ctx.beginPath(); ctx.moveTo(250, 470); ctx.lineTo(262, 330); ctx.lineTo(318, 326); ctx.lineTo(332, 470); ctx.fill();   // 身子
    ctx.beginPath(); ctx.arc(298, 304, 22, 0, TAU); ctx.fill();                                                          // 头
    ctx.beginPath(); ctx.moveTo(306, 318); ctx.lineTo(322, 350); ctx.lineTo(300, 326); ctx.fill();                       // 胡子
    ctx.strokeStyle = sil; ctx.lineWidth = 9; ctx.beginPath(); ctx.moveTo(310, 350); ctx.lineTo(382, 344); ctx.stroke(); // 手臂伸向木版
  } else {
    ctx.beginPath(); ctx.moveTo(240, 470); ctx.lineTo(258, 368); ctx.lineTo(340, 352); ctx.lineTo(332, 470); ctx.fill();
    ctx.beginPath(); ctx.ellipse(350, 350, 24, 18, 0.3, 0, TAU); ctx.fill();
    ctx.strokeStyle = sil; ctx.lineWidth = 9; ctx.beginPath(); ctx.moveTo(300, 362); ctx.lineTo(372, 362); ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(255,190,120,0.35)'; ctx.lineWidth = 2;
  if (scene < 5) { ctx.beginPath(); ctx.arc(298, 304, 22, -0.6, 0.9); ctx.stroke(); }
  // 守画人：scene 5 起从右边进来
  if (scene >= 5) {
    const c = g() && g().char, look = c ? c.look : 'hat', col = c ? c.color : '#b8402e';
    const hx = scene === 5 ? lerp(VW + 40, 800, clamp(sceneT / 0.8, 0, 1)) : 790;
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; glow(hx, 340, 80, '255,224,180', 0.3); ctx.restore();
    heroBody(hx, 392, C.player.h * U, -1, look, col, 'needle', scene === 5 && sceneT < 0.8 ? sceneT * 12 : 0, false, 0);
  }
  // 暗角
  const vg = ctx.createRadialGradient(560, 300, 120, 480, 280, 620);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.75)');
  ctx.fillStyle = vg; ctx.fillRect(0, 0, VW, VH);
}

// 剧情插图：铺满画面，缓慢推近（换图时从头推）
let storyKey = null, storyKeyT = 0;
function storyImage(key, dt) {
  const im = img(key); if (!im) return false;
  if (key !== storyKey) { storyKey = key; storyKeyT = 0; }
  storyKeyT += dt;
  const z = 1.02 + 0.06 * Math.min(1, storyKeyT / 8);
  const sc = Math.max(VW / im.width, VH / im.height) * z, w = im.width * sc, h = im.height * sc;
  ctx.drawImage(im, (VW - w) / 2, (VH - h) / 2 - 10 * Math.min(1, storyKeyT / 8), w, h);
  const vg = ctx.createRadialGradient(VW / 2, VH * 0.45, VH * 0.3, VW / 2, VH * 0.5, VW * 0.7);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.6)');
  ctx.fillStyle = vg; ctx.fillRect(0, 0, VW, VH);
  return true;
}
function storyBack(bg, scene, key) {
  const now = performance.now(), dt = Math.min(0.05, (now - lastT) / 1000);
  if (key && bg !== 'map') { lastT = now; time += dt; if (storyImage(key, dt)) return; }
  if (bg === 'studio') { lastT = now; time += dt; sceneT += dt; drawStudio(scene); return; }
  storyScene = -1;
  titleBack();                         // 整幅山城亮着
  if (bg === 'stage' && g()) drawCrowd();
  ctx.fillStyle = bg === 'map' ? 'rgba(6,8,12,0.62)' : 'rgba(30,10,4,0.18)'; ctx.fillRect(0, 0, VW, VH);
}

// ------------------------------------------------------------------ 图片素材（有图就用图，没图退回代码绘制）
const IM = window.IMG || { get: () => null, info: () => null, dark: () => null, tint: () => null };
const img = (k) => IM.get(k);
const info = (k) => IM.info(k) || {};

// 画一张图：宽 w，按原比例算高；(x, y) 是底边中点，flip 为 -1 时水平翻转
function drawAt(im, x, y, w, flip = 1, h) {
  h = h || w * im.height / im.width;
  ctx.save(); ctx.translate(x, y); if (flip < 0) ctx.scale(-1, 1);
  ctx.drawImage(im, -w / 2, -h, w, h); ctx.restore();
  return h;
}
// 序列帧的第 i 帧，(x, y) 为中心
function drawFrame(key, i, x, y, w, h, rot = 0, flip = 1) {
  const im = img(key), inf = info(key); if (!im || !inf.frames) return false;
  const n = inf.frames, f = ((Math.floor(i) % n) + n) % n;
  ctx.save(); ctx.translate(x, y); if (rot) ctx.rotate(rot); if (flip < 0) ctx.scale(-1, 1);
  ctx.drawImage(im, f * inf.fw, 0, inf.fw, inf.fh, -w / 2, -h / 2, w, h); ctx.restore();
  return true;
}
// 在图片上按比例位置写字（招牌、匾额）
function signText(str, cx, cy, size) {
  ctx.save(); ctx.font = `bold ${size}px "Microsoft YaHei","PingFang SC",sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(255,200,120,0.6)'; ctx.shadowBlur = 6;
  ctx.fillStyle = '#ffe2a8'; ctx.fillText(str, cx, cy); ctx.restore();
}

// ---- 视差背景
const IMG_LAYERS = [
  ['bg/far1_mountains', 0.06], ['bg/far2_city', 0.13], ['bg/far3_river', 0.24], ['bg/mid_stilt_houses', 0.45], ['bg/near_stilt_houses', 0.72],
];
const useImgBg = () => IMG_LAYERS.every(([k]) => img(k));
// 背景图先缩放到屏幕高度并缓存，之后每帧按原尺寸贴（每帧缩放大图很费）
const scaledCache = new Map();
function scaledToScreen(im) {
  let cv = scaledCache.get(im);
  if (!cv) {
    cv = document.createElement('canvas');
    cv.width = Math.round(im.width * VH / im.height); cv.height = VH;
    cv.getContext('2d').drawImage(im, 0, 0, cv.width, cv.height);
    scaledCache.set(im, cv);
  }
  return cv;
}
function blitImg(src, factor) {
  const im = scaledToScreen(src), w = im.width;
  const off = ((CAM() * U * factor) % w + w) % w;
  const oy = CAMY() * 0.85 * U * factor;
  for (let x = -off; x < VW; x += w) ctx.drawImage(im, Math.floor(x), Math.round(oy));
}
// 背景：天空 → 远山 → 江 → 吊脚楼（近两层压暗一些，免得抢战斗平面的戏）
function drawBackdrop() {
  if (useImgBg()) {
    if (!skip('sky')) drawSky();
    if (!skip('layers')) { blitImg(img('bg/far1_mountains'), 0.06); blitImg(img('bg/far2_city'), 0.13); }
    if (!skip('fog')) drawFog(330 + CAMY() * 4, 70, 0.2, 6, 0.13);
    if (!skip('layers')) blitImg(img('bg/far3_river'), 0.24);
    if (!skip('layers')) blitImg(IM.dark('bg/mid_stilt_houses', 0.18, '12,24,34') || img('bg/mid_stilt_houses'), 0.45);
    if (!skip('fog')) drawFog(420, 60, 0.16, 10, 0.45);
    if (!skip('layers')) blitImg(IM.dark('bg/near_stilt_houses', 0.42, '8,16,24') || img('bg/near_stilt_houses'), 0.72);
  } else {
    if (!layers) buildLayers();
    if (!skip('sky')) drawSky();
    if (!skip('layers')) { blit(layers.far1); blit(layers.far2); }
    if (!skip('fog')) drawFog(330 + CAMY() * 4, 70, 0.22, 6, 0.13);
    if (!skip('layers')) blit(layers.far3);
    drawRiverGlints();
    if (!skip('layers')) blit(layers.houses);
    if (!skip('fog')) drawFog(420, 60, 0.18, 10, 0.45);
    if (!skip('layers')) blit(layers.near);
  }
}

// ---- 地面与地形
let groundPat = null, fillPat = null;
const TILE = 112;
function patterns() {
  if (groundPat || !img('tile/ground') || !img('tile/ground_fill')) return !!groundPat;
  const mk = (key, dark) => {
    const cv = document.createElement('canvas'); cv.width = cv.height = TILE;
    const c = cv.getContext('2d'); c.drawImage(IM.dark(key, dark, '6,12,18') || img(key), 0, 0, TILE, TILE);
    return ctx.createPattern(cv, 'repeat');
  };
  groundPat = mk('tile/ground', 0.38); fillPat = mk('tile/ground_fill', 0.5);
  return true;
}
function drawTerrainImg() {
  if (!patterns()) return false;
  const ox = api.sx(0);
  for (const s of api.activeSolids()) {
    if (s.lock || s.gate !== undefined || s.x < -6.5 || s.x >= 120) continue;
    const x = api.sx(s.x), y = api.wy(s.y + s.h), w = s.w * U, h = s.h * U;
    if (x > VW + 10 || x + w < -10) continue;
    const isStair = L.stairs.includes(s);
    if (s.oneWay && img('tile/awning_platform')) {
      const im = img('tile/awning_platform'), ww = w + 24, hh = ww * im.height / im.width;
      ctx.drawImage(im, x - 12, y - 6, ww, hh);
      continue;
    }
    if (isStair && img('tile/stair_step')) {
      ctx.save(); ctx.translate(ox, 0); ctx.fillStyle = fillPat; ctx.fillRect(x - ox, y + 10, w, h - 10); ctx.restore();
      const im = img('tile/stair_step'); ctx.drawImage(im, x - 3, y - 4, w + 6, (w + 6) * im.height / im.width);
      continue;
    }
    if (s.w < 2 && s.h < 1 && img('tile/stone_block')) {
      const im = img('tile/stone_block'); ctx.drawImage(im, x - 4, y - 4, w + 8, h + 8);
      continue;
    }
    // 地面：顶部一层带青苔的石板，下面是深色土石，都按世界坐标对齐，跟着镜头走
    ctx.save(); ctx.translate(ox, y);
    ctx.fillStyle = groundPat; ctx.fillRect(x - ox, 0, w, Math.min(TILE, VH - y + 10));
    if (VH - y > TILE) { ctx.fillStyle = fillPat; ctx.fillRect(x - ox, TILE, w, VH - y - TILE + 10); }
    ctx.restore();
    ctx.fillStyle = `rgba(${PAL.rim},0.35)`; ctx.fillRect(x, y, w, 1.5);
  }
  if (!g().flags.stairs) {
    ctx.setLineDash([4, 5]); ctx.strokeStyle = `rgba(150,200,230,${0.25 + 0.15 * Math.sin(time * 2)})`; ctx.lineWidth = 1.5;
    for (const s of L.stairs) ctx.strokeRect(api.sx(s.x), api.wy(s.y + s.h), s.w * U, s.h * U);
    ctx.setLineDash([]);
  }
  return true;
}

// ---- 各区域标志物
function drawMuttonStallImg() {
  const im = img('prop/mutton_stall'); if (!im) return false;
  const W = 232, cx = api.sx(14.8), yb = api.wy(0) + 2;
  if (!visible(cx - W, cx + W)) return true;
  const H = drawAt(im, cx, yb, W);
  signText('羊肉汤', cx, yb - H * 0.765, 15);
  for (const fx of [0.24, 0.5, 0.76]) addLight(cx + (fx - 0.5) * W, yb - H * 0.55, 52, PAL.lantern, 0.5);
  if (restoredAt(14) && Math.random() < 0.25) {
    const wx = 14.8 + 0.1 * W / U, wyy = (yb - H * 0.42 - api.wy(0)) / -U;
    steam.push({ x: wx, y: wyy, vx: (Math.random() - 0.5) * 0.2, vy: 0.5 + Math.random() * 0.3, t: 2.2, max: 2.2, r: 6 + Math.random() * 6 });
  }
  return true;
}
function drawStairwayImg() {
  const st = img('prop/stairway'), tr = img('prop/huangge_tree'); if (!st || !tr) return false;
  const yb = api.wy(0) + 2;
  const tx = api.sx(32.4);
  if (visible(tx - 200, tx + 200)) drawAt(IM.dark('prop/huangge_tree', 0.25, '8,16,20') || tr, tx, yb, 300);
  const sx = api.sx(37.6);
  if (visible(sx - 260, sx + 260)) {
    const W = 440, H = drawAt(st, sx, yb, W);
    for (const [fx, fy] of [[0.07, 0.75], [0.5, 0.3], [0.93, 0.05]]) addLight(sx + (fx - 0.5) * W, yb - H * (1 - fy), 48, '255,200,120', 0.5);
  }
  return true;
}
function drawLanternStreetImg() {
  const ls = img('prop/lantern_string'), head = img('prop/dragon_head'), seg = img('prop/dragon_segment'), tail = img('prop/dragon_tail');
  if (!ls || !head || !seg || !tail) return false;
  const x0 = api.sx(53), x1 = api.sx(67), lit = g().areas[2].state === 'restored';
  if (!visible(x0, x1)) return true;
  const W = x1 - x0, H = W * ls.height / ls.width, ly = api.wy(8.5);
  ctx.drawImage(ls, x0, ly - H / 2, W, H);
  if (lit) for (let i = 0; i < 7; i++) addLight(x0 + W * (i + 0.5) / 7, ly + H * 0.2, 34, '255,120,70', 0.5);
  // 龙灯：龙身一节节沿着起伏的曲线排，龙头在右
  const N = 22, pts = [];
  for (let i = 0; i < N; i++) pts.push([api.sx(54.3 + i * 0.5), api.wy(2.5 + 3.9 + Math.sin(time * 1.6 - i * 0.45) * 0.4)]);
  ctx.strokeStyle = '#120d0a'; ctx.lineWidth = 2;
  for (let i = 2; i < N; i += 4) { const [px, py] = pts[i]; ctx.beginPath(); ctx.moveTo(px, py + 10); ctx.lineTo(px, py + 58); ctx.stroke(); }
  { const [tx, ty] = pts[0]; const ang = Math.atan2(pts[1][1] - ty, pts[1][0] - tx); ctx.save(); ctx.translate(tx, ty); ctx.rotate(ang); ctx.drawImage(tail, -46, -10, 48, 19); ctx.restore(); }
  for (let i = 1; i < N - 1; i++) {
    const [px, py] = pts[i], [nx, ny] = pts[i + 1], ang = Math.atan2(ny - py, nx - px);
    ctx.save(); ctx.translate(px, py); ctx.rotate(ang); ctx.drawImage(seg, -20, -11, 42, 22); ctx.restore();
  }
  const [hx, hy] = pts[N - 1], ang = Math.atan2(hy - pts[N - 2][1], hx - pts[N - 2][0]);
  ctx.save(); ctx.translate(hx, hy); ctx.rotate(ang); ctx.drawImage(head, -14, -36, 78, 64); ctx.restore();
  if (lit) { for (let i = 0; i < N; i += 3) addLight(pts[i][0], pts[i][1], 46, '255,190,70', 0.38); addLight(hx + 26, hy - 4, 80, '255,200,90', 0.55); }
  return true;
}
function drawFanStallImg() {
  const im = img('prop/fan_stall'), flag = img('prop/flag_4f'); if (!im || !flag) return false;
  const y = api.wy(2.5) + 2, cx = api.sx(70.4);
  if (visible(cx - 150, cx + 150)) {
    const W = 196, H = drawAt(im, cx, y, W);
    signText('荣昌折扇', cx, y - H * 0.67, 13);
    for (const fx of [0.18, 0.82]) addLight(cx + (fx - 0.5) * W, y - H * 0.6, 40, '255,200,120', 0.4);
  }
  for (const [wx, c] of [[76, '#c8402f'], [82.5, '#3e9b5a'], [89, '#e0a526']]) {
    const px = api.sx(wx);
    if (!visible(px, px)) continue;
    ctx.fillStyle = '#120d0a'; ctx.fillRect(px - 2, y - 212, 4, 212);
    const tinted = IM.tint('prop/flag_4f', c) || flag, inf = info('prop/flag_4f');
    const f = Math.floor(time * 8 + wx) % inf.frames;
    ctx.drawImage(tinted, f * inf.fw, 0, inf.fw, inf.fh, px + 1, y - 210, 74, 56);
  }
  return true;
}
function drawStageImg() {
  const cur = img('prop/curtain'), stage = img('prop/stage'); if (!cur || !stage) return false;
  const a4 = g().areas[3], open = a4.state === 'restored' ? 1 : a4.state === 'restoring' ? a4.restoreT : 0;
  const cx = api.sx(a4.x1), y = api.wy(2.5) + 2;
  if (visible(cx - 100, cx + 100)) {
    const ch = 236, cw = ch * cur.width / cur.height;
    ctx.drawImage(cur, cx - 4 - cw - open * 36, y - ch, cw, ch);
    ctx.save(); ctx.translate(cx + 4 + cw + open * 36, y - ch); ctx.scale(-1, 1); ctx.drawImage(cur, 0, 0, cw, ch); ctx.restore();
    ctx.fillStyle = '#140e0b'; ctx.fillRect(cx - 90, y - 250, 180, 18);
  }
  const a5 = g().areas[4], mid = api.sx((a5.x0 + a5.x1) / 2);
  if (!visible(mid - 400, mid + 400)) return true;
  const W = 780, H = drawAt(stage, mid, y + 6, W);
  signText('万年台', mid, y + 6 - H * 0.675, 15);
  for (const fx of [0.245, 0.755]) addLight(mid + (fx - 0.5) * W, y + 6 - H * 0.56, 95, '255,120,70', 0.55);
  return true;
}
function drawCrowdImg(k) {
  const ims = [1, 2, 3, 4].map(i => img('prop/crowd_' + i)); if (!ims.every(Boolean)) return false;
  const r = rng(808);
  ctx.save(); ctx.globalAlpha = k;
  for (let i = 0; i < 12; i++) {
    const n = Math.floor(r() * 4), im = IM.dark('prop/crowd_' + (n + 1), 0.62, '10,8,8') || ims[n];
    const x = -40 + i * (VW + 80) / 11 + (r() - 0.5) * 30, hh = 170 + r() * 60, bob = Math.sin(time * 5 + i) * 3 * (i % 2);
    drawAt(im, x, VH + 30 - bob, hh * im.width / im.height, r() < 0.5 ? 1 : -1, hh);
    if (n >= 2) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; glow(x + hh * 0.18, VH + 30 - hh * 0.62, 50, '255,140,70', 0.45); ctx.restore(); }
  }
  ctx.restore();
  return true;
}
function drawMurkImg() {
  if (!img('fx/ink_smoke_6f')) return false;
  for (const s of api.activeSolids()) {
    if (!(s.lock || s.gate !== undefined)) continue;
    const x = api.sx(s.x + s.w / 2), yb = api.wy(s.y), H = 6 * U;
    if (x < -80 || x > VW + 80) continue;
    for (let i = 0; i < 9; i++) {
      const k = (time * 0.25 + i / 9) % 1, yy = yb - k * H;
      ctx.save(); ctx.globalAlpha = 0.85 * Math.sin(k * Math.PI);
      drawFrame('fx/ink_smoke_6f', time * 8 + i, x + Math.sin(time * 1.1 + i * 1.7) * 10, yy, 76, 76);
      ctx.restore();
    }
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const grd = ctx.createLinearGradient(x - 30, 0, x + 30, 0);
    grd.addColorStop(0, 'rgba(140,60,200,0)'); grd.addColorStop(0.5, `rgba(140,60,200,${0.12 + 0.05 * Math.sin(time * 3)})`); grd.addColorStop(1, 'rgba(140,60,200,0)');
    ctx.fillStyle = grd; ctx.fillRect(x - 30, yb - H, 60, H); ctx.restore();
  }
  return true;
}
function drawFgImg(it, sx) {
  const n = 1 + (it.seed % 3), key = (it.top ? 'bg/fg_vines_' : 'bg/fg_grass_') + n;
  const im = IM.dark(key, 0.86, '4,7,10'); if (!im) return false;
  const w = (it.top ? 520 : 380) * it.s, h = w * im.height / im.width;
  const sway = Math.sin(time * 1.2 + it.seed) * 0.02;
  ctx.save(); ctx.translate(sx, it.top ? -6 : VH + 6); ctx.rotate(sway);
  ctx.drawImage(im, -w / 2, it.top ? 0 : -h, w, h); ctx.restore();
  return true;
}

// ---- 守画人：上半身用三视图侧面像，腿用拆件摆动（变脸匠穿长袍，整体滑行）
const HIP_CUT = { yaomei: 0.5, bangbang: 0.57 };
function heroImg(x, y, f, id, run, air, bob, moving, H = 100) {
  const side = img(`hero/${id}/side`); if (!side) return false;
  const inf = info(`hero/${id}/side`), sc = H / side.height, W = side.width * sc, footX = (inf.footX || 0.5) * W;
  ctx.save(); ctx.translate(x, y - bob); if (f < 0) ctx.scale(-1, 1);
  if (moving) ctx.rotate(0.05);
  const cut = HIP_CUT[id], lu = img(`hero/${id}/leg_upper`), ll = img(`hero/${id}/leg_lower`);
  if (cut && lu && ll) {
    const legH = H * (1 - cut) + 4, hipY = -legH, upH = legH * 0.48, loH = legH * 0.56;
    const wu = upH * lu.width / lu.height, wl = loH * ll.width / ll.height;
    const legs = air ? [[-0.6, 0.9], [0.35, 0.5]] : [[Math.sin(run) * 0.55, Math.max(0, -Math.sin(run)) * 0.7], [-Math.sin(run) * 0.55, Math.max(0, Math.sin(run)) * 0.7]];
    legs.forEach(([a, knee], i) => {
      // 后面那条腿压暗一点做出前后层次（用预先压暗的图，不用 ctx.filter：滤镜会拖慢整个画布）
      const u = i === 0 ? IM.dark(`hero/${id}/leg_upper`, 0.4, '0,0,0') || lu : lu;
      const l = i === 0 ? IM.dark(`hero/${id}/leg_lower`, 0.4, '0,0,0') || ll : ll;
      ctx.save(); ctx.translate(0, hipY + 2); ctx.rotate(-a);
      ctx.drawImage(u, -wu / 2, 0, wu, upH);
      ctx.translate(0, upH - 3); ctx.rotate(knee);
      ctx.drawImage(l, -wl * 0.45, 0, wl, loH);
      ctx.restore();
    });
    ctx.drawImage(side, 0, 0, side.width, side.height * cut + 2, -footX, -H, W, H * cut + 2 * sc);
  } else {
    // 长袍：整体轻轻摆
    if (moving) ctx.transform(1, 0, Math.sin(run) * 0.04, 1, 0, 0);
    ctx.drawImage(side, -footX, -H, W, H);
  }
  ctx.restore();
  return true;
}

// ---- 小怪
function enemyImg(e, x, y, w, h) {
  if (e.type === 'chicken') {
    const body = img('enemy/chicken_body'), head = img('enemy/chicken_head'), leg = img('enemy/chicken_leg');
    if (!body || !head || !leg) return false;
    const step = e.state === 'charge' ? Math.sin(time * 40) * 6 : Math.sin(time * 10 + e.x) * 3;
    ctx.save(); ctx.translate(x, y); ctx.scale(e.facing, 1);
    for (const d of [-1, 1]) { ctx.save(); ctx.translate(d * 7, -h * 0.32); ctx.rotate(d * step * 0.04); ctx.drawImage(leg, -4, 0, 8, h * 0.34); ctx.restore(); }
    const bw = w * 1.45, bh = bw * body.height / body.width;
    ctx.drawImage(body, -bw * 0.55, -h * 0.3 - bh, bw, bh);
    const hw = w * 0.72, hh = hw * head.height / head.width;
    ctx.drawImage(head, w * 0.18, -h * 0.62 - hh * 0.75, hw, hh);
    ctx.restore();
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; glow(x + e.facing * (w * 0.62), y - h * 0.72, 10, '255,50,50', 0.8); ctx.restore();
    return true;
  }
  const body = img('enemy/grain_body'), ear = img('enemy/grain_ear');
  if (!body || !ear) return false;
  const tele = e.state === 'tele';
  ctx.save(); ctx.translate(x, y); ctx.scale(e.facing, 1);
  const bh = h * 1.12, bw = bh * body.width / body.height;
  ctx.drawImage(body, -bw / 2, -bh, bw, bh);
  for (let k = -1; k <= 1; k++) {
    ctx.save(); ctx.translate(k * 7, -bh + 10); ctx.rotate(k * 0.35 + Math.sin(time * 2 + k) * 0.08 + (tele ? -0.4 : 0));
    ctx.drawImage(ear, -8, -34, 16, 34); ctx.restore();
  }
  ctx.restore();
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; glow(x, y - h - 14, 34, '240,190,70', 0.32); ctx.restore();
  return true;
}

// ---- 张不管
function bossImg(b, x, y, w, h, f) {
  const side = img('boss/side'); if (!side) return false;
  const B = C.boss, inf = info('boss/side');
  const H = B.h * U * 1.34, sc = H / side.height, W = side.width * sc;
  const squash = b.h / B.h;                // 矮子步：压低
  ctx.save(); ctx.translate(x, y); if (f < 0) ctx.scale(-1, 1);
  ctx.scale(squash < 1 ? 1.12 : 1, squash);
  if (b.state === 'idle') ctx.rotate(Math.sin(time * 3) * 0.02);
  ctx.drawImage(side, -(inf.footX || 0.5) * W, -H, W, H);
  ctx.restore();
  if (b.state === 'phase') { ctx.save(); ctx.globalCompositeOperation = 'saturation'; ctx.fillStyle = '#808080'; ctx.fillRect(x - W, y - H, W * 2, H); ctx.restore(); }
  const fan = img('boss/fan_open');
  if (fan && (b.state === 'fan_tele' || b.state === 'fake_tele')) {
    const fy = y - H * squash - 18;
    drawAt(fan, x + (b.state === 'fan_tele' ? f * 20 : 0), fy, 80);
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; glow(x + f * 20, fy - 25, 55, '255,240,200', 0.35); ctx.restore();
  }
  return true;
}

// ---- 投射物、道具
function projImg(q, x, y, d) {
  if (q.kind === 'needle' && img('fx/needle')) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = 'rgba(255,90,70,0.3)'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(x - d * 24, y); ctx.lineTo(x, y); ctx.stroke();
    ctx.restore();
    drawAt(img('fx/needle'), x, y + 3, 30, d, 6);
    return true;
  }
  if (q.kind === 'grain' && img('fx/grain')) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; glow(x, y, 16, '240,190,70', 0.6); ctx.restore();
    ctx.save(); ctx.translate(x, y); ctx.rotate(Math.atan2(q.vy, q.vx) + Math.PI / 2); ctx.drawImage(img('fx/grain'), -6, -8, 12, 16); ctx.restore();
    return true;
  }
  return false;
}
function pickupImg(q, x, y) {
  const key = q.type === 'mutton' ? 'fx/item_mutton' : q.type === 'dragon' ? 'fx/item_dragon' : 'fx/item_fan';
  const im = img(key); if (!im) return false;
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  glow(x, y, 50, q.type === 'mutton' ? '255,170,110' : q.type === 'dragon' ? '255,200,80' : '120,230,150', 0.45);
  if (q.type !== 'mutton') { ctx.strokeStyle = 'rgba(255,240,200,0.6)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 30 + Math.sin(time * 5) * 4, 0, TAU); ctx.stroke(); }
  ctx.restore();
  drawAt(im, x, y + 22, q.type === 'mutton' ? 48 : 52);
  if (q.type === 'mutton') api.text('羊肉汤', x, y - 22, 12, '#ffe0c0', 'center', 'bold');
  return true;
}

// ------------------------------------------------------------------ 失色与灯光
// 没复色的地方：去饱和 + 压暗偏冷（用混合模式，手机浏览器也支持）
function drawDesaturate() {
  ctx.save();
  for (let i = 0; i < g().areas.length; i++) {
    for (const [a, b] of greyRanges(i)) {
      const x0 = Math.max(-5, api.sx(a)), x1 = Math.min(VW + 5, api.sx(b));
      if (x1 <= x0) continue;
      ctx.globalCompositeOperation = 'saturation'; ctx.fillStyle = '#808080'; ctx.fillRect(x0, 0, x1 - x0, VH);
      ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = 'rgba(150,160,175,1)'; ctx.globalAlpha = 0.55; ctx.fillRect(x0, 0, x1 - x0, VH);
      ctx.globalAlpha = 1;
    }
  }
  ctx.restore();
}

// 发光：每种颜色预先画一张 64×64 的光晕贴图，之后只缩放贴图、用透明度控制强弱。
// 比每帧新建渐变快得多（屏幕上同时有上百个光点、窗灯和光屑）。
const glowCache = new Map();
function glowSprite(rgb) {
  let cv = glowCache.get(rgb);
  if (!cv) {
    cv = document.createElement('canvas'); cv.width = cv.height = 64;
    const c = cv.getContext('2d'), grd = c.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, `rgba(${rgb},1)`); grd.addColorStop(0.35, `rgba(${rgb},0.35)`); grd.addColorStop(1, `rgba(${rgb},0)`);
    c.fillStyle = grd; c.fillRect(0, 0, 64, 64);
    glowCache.set(rgb, cv);
  }
  return cv;
}
function glow(x, y, r, rgb, a) {
  if (a <= 0.003 || r <= 0) return;
  const prev = ctx.globalAlpha;
  ctx.globalAlpha = prev * Math.min(1, a);
  ctx.drawImage(glowSprite(rgb), x - r, y - r, r * 2, r * 2);
  ctx.globalAlpha = prev;
}

// 窗户、灯笼的光：只在已复色的地方亮
function drawLights() {
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  if (layers && !useImgBg()) for (const key of ['houses', 'near']) {
    const layer = layers[key];
    const ox = -MARGIN - CAM() * U * layer.factor, oy = CAMY() * 0.85 * U * layer.factor;
    for (const l of layer.lights) {
      const x = l.x + ox, y = l.y + oy;
      if (x < -40 || x > VW + 40) continue;
      const on = restoredAt(screenToWorld(x));
      const f = 0.85 + 0.15 * Math.sin(time * 3 + l.flick);
      glow(x, y, l.r * (on ? 1.6 : 0.8), l.c, (on ? 0.55 : 0.08) * f);
    }
  }
  // 场景物件登记的灯：只在已复色的地方亮
  for (const l of frameLights) {
    if (!restoredAt(screenToWorld(l.x))) continue;
    glow(l.x, l.y, l.r, l.rgb, l.a * (0.88 + 0.12 * Math.sin(time * 4 + l.x)));
  }
  // 羊肉摊灯笼
  if (!view && restoredAt(14) && !img('prop/mutton_stall')) {
    const x = api.sx(12.6), y = api.wy(0);
    for (const k of [0, 1, 2]) glow(x + 30 + k * 60, y - 84, 60, PAL.lantern, 0.55 + 0.1 * Math.sin(time * 4 + k));
    glow(x + 90, y - 149, 70, '255,200,120', 0.25);
  }
  ctx.restore();
}

// ------------------------------------------------------------------ 每帧
function tick() {
  const now = performance.now(), dt = Math.min(0.05, (now - lastT) / 1000); lastT = now; time += dt;
  // 复色开始：从光波起点爆一圈彩色光屑
  if (g()) for (const a of g().areas) {
    const prev = wasState.get(a);
    if (a.state === 'restoring' && prev !== 'restoring') {
      const o = a.origin !== undefined ? a.origin : (a.x0 + a.x1) / 2;
      for (let i = 0; i < 70; i++) {
        const ang = Math.random() * TAU, sp = 2 + Math.random() * 7;
        sparks.push({ x: o, y: a.ground + 1 + Math.random(), vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp * 0.7 + 2, t: 1.4, max: 1.4, c: a.color });
      }
    }
    wasState.set(a, a.state);
  }
  if (api.state === 'play' || api.state === 'dying') {
    for (const s of sparks) { s.t -= dt; s.x += s.vx * dt; s.y += s.vy * dt; s.vx *= 0.97; s.vy = s.vy * 0.97 - 1.5 * dt; }
    for (const s of steam) { s.t -= dt; s.x += s.vx * dt; s.y += s.vy * dt; s.r += dt * 6; }
  }
  for (let i = sparks.length - 1; i >= 0; i--) if (sparks[i].t <= 0) sparks.splice(i, 1);
  for (let i = steam.length - 1; i >= 0; i--) if (steam[i].t <= 0) steam.splice(i, 1);
  return dt;
}

function back() {
  const dt = tick();
  drawBackdrop();
  // 近景雾：把背景整体推远，让战斗平面更清楚
  { const hz = ctx.createLinearGradient(0, 230, 0, 480); hz.addColorStop(0, 'rgba(40,70,90,0)'); hz.addColorStop(1, 'rgba(40,70,90,0.42)'); ctx.fillStyle = hz; ctx.fillRect(0, 230, VW, 250); }
  frameLights = [];
  drawStairway();
  drawLanternStreet();
  drawFanStall();
  drawStage();
  drawMuttonStall();
  if (!skip('terrain')) drawTerrain();
  if (!skip('desat')) drawDesaturate();
  if (!skip('lights')) drawLights();
  if (!skip('murk')) drawMurk();
  // 热气
  ctx.save();
  for (const s of steam) {
    const a = 0.18 * (s.t / s.max);
    ctx.fillStyle = `rgba(235,235,235,${a})`; ctx.beginPath(); ctx.arc(api.sx(s.x), api.wy(s.y), s.r, 0, TAU); ctx.fill();
  }
  ctx.restore();
  return dt;
}

// ------------------------------------------------------------------ 守画人
// 围巾：一串用约束连起来的点，跟着人飘
const scarf = { pts: null };
function updateScarf(ax, ay, facing, dt, moving) {
  const N = 9, seg = scarfThin ? 4.5 : 7;
  if (!scarf.pts) scarf.pts = Array.from({ length: N }, (_, i) => ({ x: ax - facing * i * seg, y: ay, px: ax - facing * i * seg, py: ay }));
  const pts = scarf.pts;
  pts[0].x = ax; pts[0].y = ay; pts[0].px = ax; pts[0].py = ay;
  const wind = -facing * (moving ? 70 : 18) + Math.sin(time * 3) * 14;
  for (let i = 1; i < N; i++) {
    const p = pts[i], vx = (p.x - p.px) * 0.9, vy = (p.y - p.py) * 0.9;
    p.px = p.x; p.py = p.y;
    p.x += vx + wind * dt * dt * 30; p.y += vy + 260 * dt * dt + Math.sin(time * 6 + i) * 0.3;
  }
  for (let k = 0; k < 4; k++) {
    for (let i = 1; i < N; i++) {
      const a = pts[i - 1], b = pts[i], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1, diff = (d - seg) / d;
      if (i === 1) { b.x -= dx * diff; b.y -= dy * diff; } else { a.x += dx * diff * 0.5; a.y += dy * diff * 0.5; b.x -= dx * diff * 0.5; b.y -= dy * diff * 0.5; }
    }
  }
}
let scarfThin = false;
function drawScarf(color) {
  const pts = scarf.pts; if (!pts) return;
  ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 1; i < pts.length; i++) {
      const w = ((1 - i / pts.length) * 7 + 2) * (scarfThin ? 0.55 : 1);
      ctx.strokeStyle = pass === 0 ? `rgba(255,120,90,${scarfThin ? 0.1 : 0.18})` : color;
      ctx.lineWidth = pass === 0 ? w + (scarfThin ? 4 : 8) : w;
      ctx.beginPath(); ctx.moveTo(pts[i - 1].x, pts[i - 1].y); ctx.lineTo(pts[i].x, pts[i].y); ctx.stroke();
    }
  }
  ctx.restore();
}

let lastPlayerT = performance.now();

// 守画人剪影：游戏中和选角卡片共用
function heroBody(x, y, h, f, look, main, weapon, run, air, bob) {
  const sil = '#0b1018', rim = `rgba(${PAL.rim},0.85)`;
  ctx.lineCap = 'round';
  // 腿
  ctx.strokeStyle = sil; ctx.lineWidth = 8;
  const hipY = y - 30 - bob;
  const l1 = air ? -0.5 : Math.sin(run) * 0.7, l2 = air ? 0.4 : -Math.sin(run) * 0.7;
  for (const a of [l1, l2]) { ctx.beginPath(); ctx.moveTo(x, hipY); ctx.lineTo(x + Math.sin(a) * 26 * f, hipY + Math.cos(a) * (air ? 22 : 28)); ctx.stroke(); }
  // 身体（衣服用角色主色，再压暗做剪影，边缘留光）
  const bodyTop = y - h + 30 - bob;
  ctx.fillStyle = sil;
  ctx.beginPath(); ctx.moveTo(x - 18, hipY + 6); ctx.lineTo(x - 13, bodyTop); ctx.lineTo(x + 13, bodyTop); ctx.lineTo(x + 19, hipY + 6); ctx.closePath(); ctx.fill();
  ctx.fillStyle = main; ctx.globalAlpha = 0.8;
  ctx.beginPath(); ctx.moveTo(x - 15, hipY + 3); ctx.lineTo(x - 11, bodyTop + 5); ctx.lineTo(x + 11, bodyTop + 5); ctx.lineTo(x + 16, hipY + 3); ctx.closePath(); ctx.fill();
  ctx.globalAlpha = 1;
  // 两侧轮廓光：朝光的一侧更亮
  ctx.lineWidth = 2;
  ctx.strokeStyle = rim; ctx.beginPath(); ctx.moveTo(x - 18 * f, hipY + 6); ctx.lineTo(x - 13 * f, bodyTop); ctx.lineTo(x + 13 * f, bodyTop); ctx.stroke();
  ctx.strokeStyle = `rgba(${PAL.rim},0.35)`; ctx.beginPath(); ctx.moveTo(x + 19 * f, hipY + 6); ctx.lineTo(x + 13 * f, bodyTop); ctx.stroke();
  // 头
  const hx = x + f * 2, hy = bodyTop - 12;
  ctx.fillStyle = sil; ctx.beginPath(); ctx.arc(hx, hy, 12, 0, TAU); ctx.fill();
  ctx.strokeStyle = rim; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(hx, hy, 12, Math.PI * (f > 0 ? 0.9 : 0.1) - 0.9, Math.PI * (f > 0 ? 0.9 : 0.1) + 0.9); ctx.stroke();
  // 头部特征
  if (look === 'bun') {
    ctx.fillStyle = sil; ctx.beginPath(); ctx.arc(hx - f * 8, hy - 11, 8, 0, TAU); ctx.fill();
    ctx.fillStyle = '#d9473a'; ctx.fillRect(hx - f * 8 - 7, hy - 9, 14, 2.5);
  } else if (look === 'pole') {
    ctx.fillStyle = '#d8d0c0'; ctx.fillRect(hx - 13, hy - 7, 26, 5);
    ctx.strokeStyle = '#3b2a18'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(x - f * 38, bodyTop + 14); ctx.lineTo(x + f * 30, bodyTop + 2); ctx.stroke();
    ctx.strokeStyle = sil; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x - f * 36, bodyTop + 14); ctx.lineTo(x - f * 36, bodyTop + 44); ctx.stroke();
  } else if (look === 'mask') {
    const mc = api.MASK_COLOR[weapon] || '#c8402f';
    ctx.fillStyle = mc; ctx.beginPath(); ctx.ellipse(hx + f * 2, hy + 1, 9, 10, 0, 0, TAU); ctx.fill();
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; glow(hx, hy, 26, '255,200,140', 0.25); ctx.restore();
    ctx.fillStyle = '#e0a526'; ctx.fillRect(hx - 13, hy - 15, 26, 5);
  } else {   // 斗笠
    ctx.fillStyle = '#1a1712'; ctx.beginPath(); ctx.moveTo(hx - 26, hy - 2); ctx.lineTo(hx, hy - 22); ctx.lineTo(hx + 26, hy - 2); ctx.fill();
    ctx.strokeStyle = rim; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(hx - 26, hy - 2); ctx.lineTo(hx, hy - 22); ctx.lineTo(hx + 26, hy - 2); ctx.stroke();
  }
  // 发光的眼睛
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  glow(hx + f * 6, hy + 1, 7, '255,236,190', 0.9);
  ctx.restore();
}

function player() {
  const p = g().player, ch = g().char, id = ch ? ch.id : 'yaomei';
  const now = performance.now(), dt = Math.min(0.05, (now - lastPlayerT) / 1000); lastPlayerT = now;
  const hasCoil = !!img('fx/dragon_coil_6f'), hasGust = !!img('fx/fan_gust_4f');
  api.drawPlayerFx({ coil: !hasCoil, gust: !hasGust });
  const x = api.sx(p.x), y = api.wy(p.y), h = p.h * U, f = p.facing;
  const moving = Math.abs(p.vx) > 0.5 && p.grounded;
  const look = ch ? ch.look : 'hat', main = ch ? ch.color : '#b8402e';
  const imgMode = !!img(`hero/${id}/side`), H = 118;
  // 扇风序列帧（在人身前）
  if (p.gustT > 0 && hasGust) {
    const k = 1 - p.gustT / 0.22, R = C.weapons.fan.range * U;
    ctx.save(); ctx.globalAlpha = Math.min(1, p.gustT / 0.08);
    drawFrame('fx/fan_gust_4f', k * 4, x + f * R * 0.55, y - h * 0.5, R * 1.1, R * 0.75, 0, f);
    ctx.restore();
  }
  // 身后的光晕
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  glow(x, y - h * 0.55, 80, '255,224,180', imgMode ? 0.2 : 0.28);
  glow(x, y - 2, 34, '255,224,180', 0.25);
  ctx.restore();
  if (scarfThin !== imgMode) { scarfThin = imgMode; scarf.pts = null; }
  updateScarf(x - f * (imgMode ? 2 : 4), imgMode ? y - H * 0.8 : y - h + 36, f, dt, Math.abs(p.vx) > 0.5);
  if (!api.playerBlink(p)) {
    drawScarf(look === 'mask' ? api.MASK_COLOR[g().weapon] : '#d9473a');
    const run = moving ? p.x * 3.2 : 0, bob = moving ? Math.abs(Math.sin(run)) * 3 : 0;
    if (!heroImg(x, y, f, id, run, !p.grounded, bob, moving, H)) heroBody(x, y, h, f, look, main, g().weapon, run, !p.grounded, bob);
  }
  // 变脸匠：换武器时，新脸谱在头顶亮一下
  if (look === 'mask' && p.faceT > 0) {
    const mk = { needle: 'red', dragon: 'gold', fan: 'green' }[g().weapon], mi = img(`hero/bianlian/prop_mask_${mk}`);
    if (mi) { ctx.save(); ctx.globalAlpha = Math.min(1, p.faceT / 0.15); drawAt(mi, x, y - H - 8 - (0.35 - p.faceT) * 40, 34); ctx.restore(); }
  }
  // 龙绕身序列帧（罩在人外面）
  if (p.coilT > 0 && hasCoil) {
    const k = 1 - p.coilT / C.weapons.dragon.active, D = C.weapons.dragon.radius * U * 2.1;
    ctx.save(); ctx.globalAlpha = Math.min(1, p.coilT / 0.1); ctx.globalCompositeOperation = 'lighter';
    drawFrame('fx/dragon_coil_6f', k * 6, x, y - h * 0.5, D, D, 0, f);
    ctx.restore();
  }
  api.drawPlayerLabels(p, x, y, imgMode ? H : h, '#ffd9a0');
}
function portrait(x, y, c, weapon, sel) {
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  glow(x, y - 48, 70, sel ? '255,214,160' : '200,210,220', sel ? 0.35 : 0.15);
  ctx.restore();
  const pim = img(`hero/${c.id}/portrait`);
  if (pim) {   // 选角卡片：半身立绘，底部淡出
    const h = 132, w = h * pim.width / pim.height;
    ctx.save(); ctx.globalAlpha = sel ? 1 : 0.8;
    ctx.drawImage(pim, x - w / 2, y + 8 - h, w, h);
    ctx.restore();
    return;
  }
  heroBody(x, y, C.player.h * U, 1, c.look, c.color, weapon, 0, false, 0);
}

// ------------------------------------------------------------------ 小怪：墨色剪影 + 发光的眼睛
function enemy(e) {
  const x = api.sx(e.x), y = api.wy(e.y), w = e.w * U, h = e.h * U;
  if (x < -80 || x > VW + 80) return;
  ctx.save();
  ctx.globalAlpha = e.state === 'spawn' ? 1 - e.t / 0.45 : 1;
  const tele = e.state === 'tele';
  // 预警（与灰盒相同的信息，换成发光的样子）
  if (e.type === 'chicken' && tele) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = 'rgba(255,70,60,0.75)'; ctx.lineWidth = 4; ctx.setLineDash([10, 6]);
    ctx.beginPath(); ctx.moveTo(x, y - 3); ctx.lineTo(x + e.chargeDir * 6 * U, y - 3); ctx.stroke(); ctx.setLineDash([]);
    glow(x, y - h / 2, 50, '255,60,50', 0.35);
    ctx.restore();
  }
  if (e.type === 'grain' && tele) {
    const gx = api.sx(e.targetX), gyy = api.wy(e.y);
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = 'rgba(255,80,60,0.85)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(gx, gyy - 3, 22, 7, 0, 0, TAU); ctx.stroke();
    glow(gx, gyy - 3, 30, '255,80,60', 0.3);
    ctx.restore();
  }
  if (!enemyImg(e, x, y, w, h)) {
  // 墨色触须
  ctx.strokeStyle = 'rgba(18,10,26,0.8)'; ctx.lineWidth = 3;
  for (let k = 0; k < 3; k++) {
    const bx = x + (k - 1) * w * 0.3;
    ctx.beginPath(); ctx.moveTo(bx, y - 4);
    ctx.quadraticCurveTo(bx - e.facing * 10 + Math.sin(time * 5 + k) * 6, y + 2, bx - e.facing * 20 + Math.sin(time * 4 + k * 2) * 8, y - 8 - k * 3);
    ctx.stroke();
  }
  if (e.type === 'chicken') {
    // 身体 + 背上的羽刺
    ctx.fillStyle = PAL.ink;
    ctx.strokeStyle = PAL.ink; ctx.lineWidth = 3;
    const step = e.state === 'charge' ? Math.sin(time * 40) * 6 : Math.sin(time * 10 + e.x) * 3;
    for (const d of [-1, 1]) { ctx.beginPath(); ctx.moveTo(x + d * 6, y - h * 0.25); ctx.lineTo(x + d * 6 + step * d, y); ctx.stroke(); }
    ctx.beginPath(); ctx.ellipse(x - e.facing * 3, y - h * 0.5, w * 0.6, h * 0.36, e.facing * 0.15, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(x + e.facing * w * 0.38, y - h * 0.72, h * 0.22, 0, TAU); ctx.fill();
    for (let k = 0; k < 4; k++) {
      const bx = x - e.facing * (6 + k * 7), by = y - h * 0.8 + k * 4;
      ctx.beginPath(); ctx.moveTo(bx - 5, by + 6); ctx.lineTo(bx - e.facing * 12, by - 12 + Math.sin(time * 6 + k) * 2); ctx.lineTo(bx + 5, by + 4); ctx.fill();
    }
    ctx.fillStyle = '#6b4a20'; ctx.beginPath();
    { const bx = x + e.facing * (w * 0.38 + h * 0.18), by = y - h * 0.72;
      ctx.moveTo(bx, by - 5); ctx.lineTo(bx + e.facing * 14, by + 1); ctx.lineTo(bx, by + 5); ctx.fill(); }
    ctx.strokeStyle = `rgba(${PAL.inkRim},0.55)`; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.ellipse(x - e.facing * 3, y - h * 0.5, w * 0.6, h * 0.36, e.facing * 0.15, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
    ctx.globalCompositeOperation = 'lighter';
    glow(x + e.facing * (w * 0.45), y - h * 0.75, 12, '255,50,50', 0.95);
  } else {
    // 谷穗怪：细长的墨色茎 + 发光的穗
    ctx.fillStyle = PAL.ink;
    ctx.beginPath(); ctx.moveTo(x - w * 0.4, y); ctx.quadraticCurveTo(x - w * 0.55, y - h * 0.6, x - w * 0.2, y - h); ctx.lineTo(x + w * 0.2, y - h);
    ctx.quadraticCurveTo(x + w * 0.55, y - h * 0.6, x + w * 0.4, y); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = `rgba(${PAL.inkRim},0.5)`; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.globalCompositeOperation = 'lighter';
    for (let k = -1; k <= 1; k++) {
      const sway = Math.sin(time * 2 + k) * 3 + (tele ? -e.facing * 6 : 0);
      ctx.fillStyle = 'rgba(240,190,70,0.85)';
      ctx.beginPath(); ctx.ellipse(x + k * 8 + sway, y - h - 12, 3.5, 13, k * 0.4, 0, TAU); ctx.fill();
    }
    glow(x, y - h - 10, 34, '240,190,70', 0.35);
    glow(x + e.facing * 6, y - h + 14, 10, '255,50,50', 0.9);
  }
  }
  ctx.restore();
  // 受击闪白 + 命中火花
  if (e.flash > 0) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; glow(x, y - h / 2, w, '255,255,255', 0.6);
    drawFrame('fx/hit_spark_4f', (0.1 - e.flash) / 0.1 * 4, x, y - h / 2, 56, 56); ctx.restore();
  }
  if (e.state === 'stun') api.text('定', x, y - h - 18, 14, '#ffd36a', 'center', 'bold');
  if (e.slowed) api.text('慢', x + 16, y - h - 18, 12, '#8be0a0', 'center', 'bold');
  if (e.hp < e.maxHp) { ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(x - 18, y - h - 30, 36, 4); ctx.fillStyle = '#ff5a4a'; ctx.fillRect(x - 18, y - h - 30, 36 * e.hp / e.maxHp, 4); }
  if (api.debug) { ctx.strokeStyle = '#f0f'; ctx.strokeRect(x - w / 2, y - h, w, h); }
}

// ------------------------------------------------------------------ 前景、光点、复色光波、暗角
// 前景剪影：画面上下边缘的枝叶和草丛，比主角离镜头更近
const fgItems = [];
{ const r = rng(19); for (let x = -200; x < L.width * U * 1.35 + VW; x += 260 + r() * 380) fgItems.push({ x, top: r() < 0.55, s: (r() < 0.55 ? 0.8 : 0.45) + r() * 0.35, seed: (r() * 1e6) | 0 }); }
function drawFgItem(it, sx) {
  const r = rng(it.seed);
  ctx.fillStyle = '#05080b';
  if (it.top) {     // 垂下来的枝叶
    ctx.beginPath(); ctx.moveTo(sx - 120 * it.s, -10);
    ctx.quadraticCurveTo(sx, 50 * it.s, sx + 140 * it.s, -10); ctx.fill();
    for (let k = 0; k < 9; k++) {
      const lx = sx - 100 * it.s + k * 26 * it.s, ly = 20 * it.s + r() * 60 * it.s, sway = Math.sin(time * 1.2 + k) * 4;
      ctx.beginPath(); ctx.ellipse(lx + sway, ly, 7 * it.s, 20 * it.s, 0.4 - r() * 0.8, 0, TAU); ctx.fill();
      ctx.fillRect(lx + sway - 0.75, 0, 1.5, ly);
    }
  } else {          // 草丛
    for (let k = 0; k < 14; k++) {
      const bx = sx - 70 * it.s + k * 10 * it.s, hh = (40 + r() * 70) * it.s, sway = Math.sin(time * 1.6 + k * 0.7) * 6;
      ctx.beginPath(); ctx.moveTo(bx - 4, VH + 4); ctx.quadraticCurveTo(bx, VH - hh * 0.6, bx + sway + 6, VH - hh); ctx.lineTo(bx + 5, VH + 4); ctx.fill();
    }
  }
}

function front() {
  // 复色光波：两道发光的边从起点向两边推开
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (const a of g().areas) {
    if (a.state !== 'restoring') continue;
    const { x0, x1 } = band(a.idx);
    const o = clamp(a.origin !== undefined ? a.origin : x0, x0, x1), r = a.restoreT * Math.max(o - x0, x1 - o);
    const n = parseInt(a.color.slice(1), 16), rgb = `${n >> 16},${(n >> 8) & 255},${n & 255}`;
    for (const ex of [o - r, o + r]) {
      const px = api.sx(ex);
      if (px < -150 || px > VW + 150) continue;
      const grd = ctx.createLinearGradient(px - 90, 0, px + 90, 0);
      grd.addColorStop(0, `rgba(${rgb},0)`); grd.addColorStop(0.5, `rgba(255,240,210,${0.55 * (1 - a.restoreT * 0.5)})`); grd.addColorStop(1, `rgba(${rgb},0)`);
      ctx.fillStyle = grd; ctx.fillRect(px - 90, 0, 180, VH);
      if (Math.random() < 0.9) sparks.push({ x: ex, y: a.ground + Math.random() * 6, vx: (Math.random() - 0.5), vy: 1 + Math.random() * 2, t: 1.2, max: 1.2, c: a.color });
    }
    glow(api.sx(o), api.wy(a.ground + 1), 200, '255,236,200', 0.35 * (1 - a.restoreT));
  }
  // 光屑
  for (const s of sparks) {
    const n = parseInt(s.c.slice(1), 16), rgb = `${Math.min(255, (n >> 16) + 80)},${Math.min(255, ((n >> 8) & 255) + 80)},${Math.min(255, (n & 255) + 80)}`;
    glow(api.sx(s.x), api.wy(s.y), 10, rgb, 0.9 * (s.t / s.max));
  }
  ctx.restore();
  if (!skip('ambient')) frontAmbient();
}

// 光点、前景枝叶、谢幕人群、暗角（标题界面也用）
function frontAmbient() {
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  // 漂浮光点
  for (const m of motes) {
    const W = VW + 200;
    const x = ((m.x - CAM() * U * m.z * 0.6 + Math.sin(time * 0.3 + m.ph) * 30) % W + W) % W - 100;
    const y = m.y + Math.sin(time * 0.5 + m.ph) * 20 - ((time * m.sp) % 500);
    const yy = ((y % 520) + 520) % 520 + 10;
    const tw = 0.5 + 0.5 * Math.sin(time * 2.2 + m.ph * 3);
    const on = restoredAt(screenToWorld(x));
    glow(x, yy, 6 + m.z * 5, on ? PAL.mote : '170,190,220', (on ? 0.6 : 0.25) * tw * m.z);
  }
  ctx.restore();
  // 前景枝叶
  for (const it of fgItems) {
    const px = it.x - CAM() * U * 1.35;
    if (px < -260 || px > VW + 260) continue;
    if (!drawFgImg(it, px)) drawFgItem(it, px);
  }
  if (!view) drawCrowd();
  // 暗角
  const vg = ctx.createRadialGradient(VW / 2, VH * 0.55, VH * 0.35, VW / 2, VH * 0.55, VW * 0.75);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,4,10,0.55)');
  ctx.fillStyle = vg; ctx.fillRect(0, 0, VW, VH);
}

return { back, front, player, enemy, boss, proj, pickup, dark, titleBack, portrait, storyBack };
};
