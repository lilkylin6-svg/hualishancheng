// 画里山城 · 灰盒原型 v0.1
// 纯 Canvas，无依赖。逻辑在 step()，绘制在 render()，二者分离：演出失败不会卡住流程。
(() => {
'use strict';
const C = window.CONFIG;
const L = C.level;
const U = C.unit;
const VW = 960, VH = 540;            // 逻辑分辨率
const VIEW_U = VW / U;               // 视野宽度（单位）= 20
const GROUND_SY = 470;               // 世界 y=0 时相机基准的屏幕 y
const DT = 1 / 60;
const FONT = '"Microsoft YaHei","PingFang SC","Noto Sans SC",sans-serif';
const params = new URLSearchParams(location.search);

// ---------------------------------------------------------------- 画布
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
let scale = 1, offX = 0, offY = 0;
// 画布分辨率上限：高清屏按原生倍率渲染会让像素数翻几倍，新画风的发光效果扛不住。
// 默认最多 1.25 倍，网址加 ?dpr=2 可以手动调高画质。
const DPR_PARAM = parseFloat(new URLSearchParams(location.search).get('dpr'));
let MAX_DPR = DPR_PARAM || 1.25;
function renderDpr() { return Math.min(window.devicePixelRatio || 1, MAX_DPR); }
// 自动降画质：连续约 2.5 秒低于 45 帧，就把画布分辨率降一档（1.25 → 1 → 0.8），只降不升，避免来回抖
// 手动指定了 ?dpr= 时不自动调整
const DPR_STEPS = [1.25, 1, 0.8];
let slowTime = 0;
function autoQuality(frameDt) {
  if (DPR_PARAM || state !== 'play') { slowTime = 0; return; }
  slowTime = frameDt > 1 / 45 ? slowTime + frameDt : Math.max(0, slowTime - frameDt * 0.5);
  if (slowTime > 2.5) {
    const i = DPR_STEPS.findIndex(d => d < MAX_DPR - 0.01);
    if (i >= 0) { MAX_DPR = DPR_STEPS[i]; resize(); console.log('[画质] 帧率偏低，画布分辨率降到', MAX_DPR); }
    slowTime = 0;
  }
}
function resize() {
  const dpr = renderDpr();
  const w = window.innerWidth, h = window.innerHeight;
  canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
  canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
  scale = Math.min(w / VW, h / VH) * dpr;
  offX = (canvas.width - VW * scale) / 2; offY = (canvas.height - VH * scale) / 2;
}
window.addEventListener('resize', resize); resize();
function toView(clientX, clientY) {
  const dpr = renderDpr();
  return { x: (clientX * dpr - offX) / scale, y: (clientY * dpr - offY) / scale };
}

// ---------------------------------------------------------------- 输入
const held = new Set(), pressed = new Set();
const KEYMAP = {
  KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
  Space: 'jump', KeyW: 'jump', ArrowUp: 'jump', KeyJ: 'attack', KeyK: 'skill',
  Digit1: 'w1', Digit2: 'w2', Digit3: 'w3', Tab: 'cycle', Escape: 'pause',
  Enter: 'confirm', KeyY: 'yes', KeyN: 'no', KeyR: 'restart', KeyC: 'copy', KeyB: 'back', KeyV: 'art', F1: 'debug',
};
function press(a) { if (!held.has(a)) pressed.add(a); held.add(a); }
window.addEventListener('keydown', e => {
  const a = KEYMAP[e.code]; if (!a) return;
  e.preventDefault(); if (e.repeat) return;
  isTouch = false; press(a);
});
window.addEventListener('keyup', e => { const a = KEYMAP[e.code]; if (a) held.delete(a); });
window.addEventListener('blur', () => { held.clear(); autoPause(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) { held.clear(); autoPause(); } });

// 触屏虚拟按键（逻辑坐标）
let isTouch = false;
const TBTN = [
  { a: 'left', x: 80, y: 462, r: 46, label: '◀' },
  { a: 'right', x: 190, y: 462, r: 46, label: '▶' },
  { a: 'jump', x: 885, y: 462, r: 50, label: '跳' },
  { a: 'attack', x: 770, y: 478, r: 46, label: '攻' },
  { a: 'skill', x: 800, y: 370, r: 38, label: '技' },
  { a: 'w1', x: 905, y: 170, r: 28, label: '1' },
  { a: 'w2', x: 905, y: 236, r: 28, label: '2' },
  { a: 'w3', x: 905, y: 302, r: 28, label: '3' },
  { a: 'pause', x: 920, y: 96, r: 24, label: 'Ⅱ' },
];
const touchMap = new Map();      // touchId -> action
let tapPoint = null;             // 菜单界面的点击位置
function btnAt(p) { return TBTN.find(b => (p.x - b.x) ** 2 + (p.y - b.y) ** 2 <= (b.r + 12) ** 2); }
function syncTouchHeld() {
  for (const b of TBTN) held.delete(b.a);
  for (const a of touchMap.values()) if (a) held.add(a);
}
canvas.addEventListener('touchstart', e => {
  e.preventDefault(); isTouch = true;
  for (const t of e.changedTouches) {
    const p = toView(t.clientX, t.clientY);
    tapPoint = p;
    const b = state === 'play' ? btnAt(p) : null;
    touchMap.set(t.identifier, b ? b.a : null);
    if (b && !held.has(b.a)) pressed.add(b.a);
  }
  syncTouchHeld();
}, { passive: false });
canvas.addEventListener('touchmove', e => {
  e.preventDefault();
  for (const t of e.changedTouches) {
    const p = toView(t.clientX, t.clientY);
    const b = state === 'play' ? btnAt(p) : null;
    const prev = touchMap.get(t.identifier);
    const now = b ? b.a : null;
    if (now !== prev) { touchMap.set(t.identifier, now); if (now && !held.has(now)) pressed.add(now); }
  }
  syncTouchHeld();
}, { passive: false });
const touchEnd = e => { e.preventDefault(); for (const t of e.changedTouches) touchMap.delete(t.identifier); syncTouchHeld(); };
canvas.addEventListener('touchend', touchEnd, { passive: false });
canvas.addEventListener('touchcancel', touchEnd, { passive: false });
canvas.addEventListener('mousedown', e => { tapPoint = toView(e.clientX, e.clientY); });

// ---------------------------------------------------------------- 工具
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rand = (a, b) => a + Math.random() * (b - a);
const sign = v => (v > 0 ? 1 : v < 0 ? -1 : 0);
function boxOverlap(ax, ay, aw, ah, bx, by, bw, bh) { // 中心x、底y
  return Math.abs(ax - bx) * 2 < aw + bw && ay < by + bh && by < ay + ah;
}
const solidOverlap = (cx, by, w, h, s) =>
  cx - w / 2 < s.x + s.w - 1e-6 && cx + w / 2 > s.x + 1e-6 && by < s.y + s.h - 1e-6 && by + h > s.y + 1e-6;

// ---------------------------------------------------------------- 游戏状态
let state = 'title';     // title | play | paused | dying | dead | assist | result
let g;                   // 一局的全部数据
let debug = params.has('debug');
const god = params.has('god');

// ---------------------------------------------------------------- 剧情画面
// story：正在播放的一组画面；?nostory 或自动测试时跳过
let story = null, prologueSeen = false, skipStory = params.has('nostory');
const TYPE_SPEED = 32;   // 打字机：每秒出几个字
function startStory(panels, next) {
  if (skipStory || !panels || !panels.length) { next(); return; }
  story = { panels, i: 0, t: 0, next };
  state = 'story';
}
function endStory() { const n = story.next; story = null; n(); }
function panelWho(p) { return p.who === '@hero' ? (g && g.char ? g.char.name : '守画人') : p.who; }
function panelText(p) {
  if (typeof p.text === 'string') return p.text;
  return (g && g.char && p.text[g.char.id]) || p.text.default;
}

let selChar = clamp((parseInt(params.get('char') || '1', 10) || 1) - 1, 0, C.characters.length - 1);
const CARD_RECTS = C.characters.map((c, i) => ({ x: 60 + i * 290, y: 150, w: 260, h: 285 }));

function newRun(startOverride, charIdx) {
  if (charIdx !== undefined && charIdx >= 0) selChar = charIdx;
  g = {
    char: charIdx === -1 ? null : C.characters[selChar],   // -1 = 不带角色特性（自动测试用）
    time: 0, t: 0,
    player: null,
    enemies: [], boss: null, projs: [], effects: [], zones: [], pickups: [], floats: [],
    areas: L.areas.map((a, i) => ({ ...a, idx: i, state: 'idle', wave: 0, waveTimer: 0, restoreT: 0, fails: 0,
      assist: false, assistAsked: false, enterTime: null, clearTime: null })),
    flags: { shop: false, stairs: false, lit: false },
    unlocked: { needle: true, dragon: false, fan: false },
    weapon: 'needle',
    cam: 0, shake: 0,
    checkpoint: { x: 2, y: 0, area: -1 },
    consumed: [],        // 本次检查点后吃掉的道具，重试时恢复
    prompt: null, promptStep: 0, toast: null, subtitle: null, subQueue: [], lowHpSaid: false,
    finalT: -1,
    metrics: {
      firstRestore: null, switches: 0, attacks: { needle: 0, dragon: 0, fan: 0 }, skills: { needle: 0, fan: 0 },
      deaths: [], bossHits: { fan: 0, charge: 0, fake: 0 }, assistAreas: [], areaTimes: [], retries: 0,
    },
  };
  for (const p of L.pickups) g.pickups.push({ ...p, taken: false, bob: Math.random() * 6 });
  g.player = makePlayer(2, 0);
  setPrompt('move');

  // 调试：?area=N 直接从第 N 个区域开始
  const startArea = clamp(parseInt(startOverride || params.get('area') || '1', 10) || 1, 1, 5) - 1;
  for (let i = 0; i < startArea; i++) { const a = g.areas[i]; a.state = 'restored'; a.restoreT = 1; applyReward(a, true); }
  if (startArea >= 3) { g.unlocked.dragon = true; g.pickups[0].taken = true; }
  if (startArea >= 4) { g.unlocked.fan = true; g.pickups[1].taken = true; }
  if (startArea > 0) {
    const a = g.areas[startArea];
    const sx = startArea === 2 ? 49 : startArea === 3 ? 68 : a.x0 - 1.5;
    g.player.x = sx; g.player.y = a.ground; g.checkpoint = { x: sx, y: a.ground, area: startArea - 1 };
    g.prompt = null;
  }
  g.cam = clamp(g.player.x - VIEW_U * 0.4, 0, L.width - VIEW_U);
  if (startArea === 0) beat('start');
}

// 当前角色的某项特性，没写就用默认值
function ch(key, def) { return g && g.char && g.char[key] !== undefined ? g.char[key] : def; }
const threadRounds = () => ch('thread', C.weapons.needle.thread.rounds);

function makePlayer(x, y) {
  const hp = ch('hp', C.player.hp);
  return { x, y, vx: 0, vy: 0, w: C.player.w, h: C.player.h, facing: 1, grounded: true, hp, maxHp: hp,
    coyote: 0, jumpBuf: 0, invuln: 0, hurtT: 0, kbVx: 0, attackT: 0, switchT: 0, burst: 0, burstT: 0, burstMul: 1,
    cd: { needle: 0, dragon: 0, fan: 0 }, coilT: 0, gustT: 0, dashT: 0, dashDir: 1, dashHit: null, nextHitMul: 1, faceT: 0,
    lastSafe: { x, y }, moved: 0, dead: false, thread: threadRounds(), reloadT: 0 };
}

// ---------------------------------------------------------------- 地形
function activeSolids() {
  const out = L.solids.slice();
  if (g.flags.stairs) out.push(...L.stairs);
  for (const a of g.areas) {
    if (a.state === 'fighting' || a.state === 'restoring') {
      out.push({ x: a.x0 - 0.4, y: a.ground, w: 0.4, h: 30, lock: true });
    }
    if (a.state !== 'restored' && a.reward !== 'boss') out.push({ x: a.x1, y: a.ground, w: 0.4, h: 30, gate: a.idx });
    if (a.reward === 'boss' && (a.state === 'fighting')) out.push({ x: a.x1, y: a.ground, w: 0.4, h: 30, lock: true });
  }
  return out;
}

function moveBody(b, dt, solids, opts = {}) {
  b.hitWall = 0;
  // 水平
  let nx = b.x + b.vx * dt;
  for (const s of solids) {
    if (s.oneWay) continue;
    if (!solidOverlap(nx, b.y, b.w, b.h, s)) continue;
    const top = s.y + s.h, rise = top - b.y;
    if (opts.stepUp && b.grounded && rise > 0 && rise <= C.player.stepUp &&
        !solids.some(o => !o.oneWay && o !== s && solidOverlap(nx, top, b.w, b.h, o))) {
      b.y = top; continue;
    }
    if (b.vx > 0) nx = Math.min(nx, s.x - b.w / 2 - 1e-4);
    else if (b.vx < 0) nx = Math.max(nx, s.x + s.w + b.w / 2 + 1e-4);
    else nx = b.x;
    b.hitWall = sign(b.vx) || 1;
  }
  b.x = nx;
  // 垂直
  const prevY = b.y;
  let ny = b.y + b.vy * dt;
  b.grounded = false;
  for (const s of solids) {
    if (!solidOverlap(b.x, ny, b.w, b.h, s)) continue;
    const top = s.y + s.h;
    if (s.oneWay) {
      if (b.vy <= 0 && prevY >= top - 0.05 && !b.dropThrough) { ny = top; b.vy = 0; b.grounded = true; }
      continue;
    }
    if (b.vy <= 0 && prevY >= top - 0.6) { ny = top; b.vy = 0; b.grounded = true; }
    else if (b.vy > 0) { ny = s.y - b.h; b.vy = 0; }
  }
  b.y = ny;
}

function groundAt(x) {
  let best = -99;
  for (const s of activeSolids()) if (!s.lock && s.gate === undefined && x >= s.x && x <= s.x + s.w) best = Math.max(best, s.y + s.h);
  return best;
}

// ---------------------------------------------------------------- 提示、字幕
const PROMPTS = {
  move:   { k: 'A / D 或 ← → 移动', t: '按住 ◀ ▶ 移动' },
  jump:   { k: '空格 跳过矮台', t: '点「跳」跳过矮台' },
  attack: { k: 'J  飞针攻击：先打远处的敌人', t: '点「攻」发射飞针' },
  grain:  { k: '谷穗怪会抛谷粒：看地上的落点标记，躲开', t: '看地上的落点标记，躲开谷粒' },
  pierce: { k: 'K  晕针穿刺：贯穿一排并定住小怪', t: '点「技」晕针穿刺：贯穿并定身' },
  dragon: { k: '按 2 切龙舞：J 龙绕身扫开四周，K 游龙冲刺', t: '点「龙」：「攻」龙绕身，「技」游龙冲刺' },
  fan:    { k: '按 3 切折扇：J 扇风把敌人扇飞，还能打断冲锋', t: '点「扇」：「攻」扇风把敌人扇飞' },
  mix:    { k: '扇阵切武器后仍在：按 1 或 2 换回去打', t: '扇阵还在：点「1」「2」换武器出手' },
  boss:   { k: '看准破绽（收扇、喘气）再全力输出', t: '看准破绽（收扇、喘气）再全力输出' },
  thread: { k: '飞针在换线：按 2 / 3 换龙舞或折扇顶上', t: '飞针在换线：点「龙」「扇」顶上' },
};
function setPrompt(id, dur) { g.prompt = { id, t: dur || 0 }; }
function clearPrompt(id) { if (g.prompt && g.prompt.id === id) g.prompt = null; }
// 字幕：带说话人，多句排队。Boss 台词插队；没有说话人的短喊话（回血、残血）有队列时就不说了
function say(text, boss, who) {
  const line = { text, who: who || '', t: Math.min(5.5, 1.8 + text.length * 0.1), shown: 0, boss: !!boss };
  if (!g.subtitle || boss) { g.subtitle = line; return; }
  if (!who && (g.subQueue.length || g.subtitle.who)) return;
  g.subQueue.push(line);
  if (g.subQueue.length > 3) g.subQueue.shift();
}
// 剧情台词（story.js）
const STORY = window.STORY || null;
function beat(key) { const b = STORY && STORY.beats[key]; if (b) say(b.text, false, b.who); }
function bossLine(key) { const t = STORY && STORY.boss[key]; if (t) say(t, true, C.boss.name); }
function toast(text, dur = 2.2) { g.toast = { text, t: dur }; }

// ---------------------------------------------------------------- 主更新
function step(dt) {
  if (pressed.has('debug')) debug = !debug;
  if (pressed.has('art') && artStyle) ART = ART ? null : artStyle;

  if (state === 'title') {
    const n = C.characters.length;
    if (pressed.has('left')) selChar = (selChar + n - 1) % n;
    if (pressed.has('right') || pressed.has('cycle')) selChar = (selChar + 1) % n;
    ['w1', 'w2', 'w3'].forEach((k, i) => { if (pressed.has(k) && i < n) selChar = i; });
    let go = pressed.has('attack') || pressed.has('confirm') || pressed.has('jump');
    if (tapPoint) {
      const hit = CARD_RECTS.findIndex(r => tapPoint.x >= r.x && tapPoint.x <= r.x + r.w && tapPoint.y >= r.y && tapPoint.y <= r.y + r.h);
      if (hit >= 0) { if (hit === selChar) go = true; selChar = hit; }
      else if (tapPoint.y > 450) go = true;
    }
    if (go) {
      newRun(undefined, selChar); state = 'play';
      if (STORY && !prologueSeen) { prologueSeen = true; startStory(STORY.prologue, () => { state = 'play'; }); }
    }
  } else if (state === 'paused') {
    if (pressed.has('pause') || pressed.has('confirm') || (tapPoint && tapPoint.y < 400)) state = 'play';
    else if (pressed.has('restart') || (tapPoint && tapPoint.y >= 400)) { newRun(undefined, selChar); state = 'play'; }
  } else if (state === 'dead') {
    if (pressed.has('attack') || pressed.has('confirm') || tapPoint) retry();
  } else if (state === 'assist') {
    const a = g.areas[currentAreaIdx()];
    let ans = null;
    if (pressed.has('yes')) ans = true; else if (pressed.has('no')) ans = false;
    else if (tapPoint) ans = tapPoint.x < VW / 2;
    if (ans !== null) {
      a.assistAsked = true; a.assist = ans;
      if (ans && !g.metrics.assistAreas.includes(a.idx + 1)) g.metrics.assistAreas.push(a.idx + 1);
      retry();
    }
  } else if (state === 'story') {
    story.t += dt;
    const adv = pressed.has('attack') || pressed.has('confirm') || pressed.has('jump') || tapPoint;
    if (pressed.has('pause') || (tapPoint && tapPoint.y < 50 && tapPoint.x > VW - 200)) endStory();   // Esc / 点右上角：跳过整段
    else if (adv) {
      const full = panelText(story.panels[story.i]).length;
      if (story.t * TYPE_SPEED < full) story.t = full / TYPE_SPEED + 0.01;   // 先把这句显示完
      else { story.i++; story.t = 0; if (story.i >= story.panels.length) endStory(); }
    }
  } else if (state === 'result') {
    if (pressed.has('copy')) copyMetrics();
    else if (pressed.has('back') || (tapPoint && tapPoint.y > 430 && tapPoint.x < VW / 2 - 130)) state = 'title';
    else if (pressed.has('attack') || pressed.has('confirm') || pressed.has('restart') || (tapPoint && tapPoint.y > 430)) { newRun(undefined, selChar); state = 'play'; }
    else if (tapPoint && tapPoint.y > 380) copyMetrics();
  } else if (state === 'play' || state === 'dying') {
    if (state === 'play' && pressed.has('pause')) { state = 'paused'; }
    else updateWorld(dt);
  }
  pressed.clear(); tapPoint = null;
}

function autoPause() { if (state === 'play') state = 'paused'; }

function currentAreaIdx() {
  const f = g.areas.findIndex(a => a.state === 'fighting');
  return f >= 0 ? f : g.checkpoint.area;
}

function updateWorld(dt) {
  g.time += dt; g.t += dt;
  const solids = activeSolids();
  if (state === 'play') updatePlayer(dt, solids);
  else { g.dyingT -= dt; if (g.dyingT <= 0) onDeathScreen(); }
  updateAreas(dt);
  for (const e of g.enemies) updateEnemy(e, dt, solids);
  g.enemies = g.enemies.filter(e => !e.remove);
  if (g.boss) updateBoss(g.boss, dt, solids);
  updateProjectiles(dt, solids);
  updateZones(dt);
  updatePickups();
  updateEffects(dt);
  updateCamera(dt);
  if (g.prompt && g.prompt.t > 0) { g.prompt.t -= dt; if (g.prompt.t <= 0) g.prompt = null; }
  if (g.toast) { g.toast.t -= dt; if (g.toast.t <= 0) g.toast = null; }
  if (g.subtitle) {
    g.subtitle.t -= dt; g.subtitle.shown += dt;
    if (g.subQueue.length && g.subtitle.shown > 1.8) g.subtitle.t = Math.min(g.subtitle.t, 0);   // 后面有人排队，就别说太久
    if (g.subtitle.t <= 0) g.subtitle = g.subQueue.shift() || null;
  }
  if (g.finalT >= 0) { g.finalT += dt; if (g.finalT > 3.2) finish(); }
}

// ---------------------------------------------------------------- 玩家
const jumpV = Math.sqrt(2 * C.gravity * C.player.jumpHeight);

function updatePlayer(dt, solids) {
  const p = g.player, P = C.player;
  const dir = (held.has('right') ? 1 : 0) - (held.has('left') ? 1 : 0);
  if (dir && p.dashT <= 0) p.facing = dir;
  p.vx = dir * P.speed * ch('speedMul', 1);
  if (p.hurtT > 0) { p.hurtT -= dt; p.vx = p.kbVx; }
  if (dir) p.moved += Math.abs(p.vx) * dt;

  if (pressed.has('jump')) p.jumpBuf = P.jumpBuffer; else p.jumpBuf -= dt;
  if (p.grounded) p.coyote = P.coyote; else p.coyote -= dt;
  if (p.jumpBuf > 0 && p.coyote > 0 && p.dashT <= 0) { p.vy = jumpV; p.jumpBuf = 0; p.coyote = 0; p.grounded = false; }
  p.vy -= C.gravity * dt;
  if (p.dashT > 0) updateDash(p, dt);
  p.dropThrough = false;
  moveBody(p, dt, solids, { stepUp: true });
  if (p.grounded) p.lastSafe = { x: p.x, y: p.y };
  if (p.y < -6) { // 跌落
    p.x = p.lastSafe.x; p.y = p.lastSafe.y; p.vy = 0;
    hurtPlayer(C.player.fallDamage, 'fall', 0);
  }

  p.invuln = Math.max(0, p.invuln - dt);
  p.attackT = Math.max(0, p.attackT - dt);
  p.switchT = Math.max(0, p.switchT - dt);
  p.gustT = Math.max(0, p.gustT - dt);
  p.faceT = Math.max(0, p.faceT - dt);
  if (p.coilT > 0) { p.coilT = Math.max(0, p.coilT - dt); coilBlock(); }
  for (const k in p.cd) p.cd[k] = Math.max(0, p.cd[k] - dt);
  if (p.reloadT > 0) {           // 换线：不管当前拿什么武器都在进行
    p.reloadT -= dt;
    if (p.reloadT <= 0) { p.reloadT = 0; p.thread = threadRounds(); clearPrompt('thread'); }
  }

  // 切换武器
  const order = ['needle', 'dragon', 'fan'];
  let want = null;
  if (pressed.has('w1')) want = 'needle'; if (pressed.has('w2')) want = 'dragon'; if (pressed.has('w3')) want = 'fan';
  if (pressed.has('cycle')) {
    const un = order.filter(w => g.unlocked[w]);
    want = un[(un.indexOf(g.weapon) + 1) % un.length];
  }
  if (want && want !== g.weapon) {
    if (!g.unlocked[want]) toast('还没有获得' + C.weapons[want].name, 1.2);
    else if (p.switchT <= 0) {
      g.weapon = want; p.switchT = ch('switchInterval', P.switchInterval); g.metrics.switches++;
      const fc = ch('faceChange', null);
      if (fc) {   // 变脸匠：换武器即变脸
        p.invuln = Math.max(p.invuln, fc.invuln); p.nextHitMul = fc.mul; p.faceT = 0.35;
        g.metrics.faceChanges = (g.metrics.faceChanges || 0) + 1;
      }
    }
  }

  // 飞针连发
  if (p.burst > 0) {
    p.burstT -= dt;
    if (p.burstT <= 0) { spawnNeedle(); p.burst--; p.burstT = C.weapons.needle.burstGap; }
  }

  // 攻击（按住可连续出手；间隔跨武器共享）
  if ((pressed.has('attack') || held.has('attack')) && p.attackT <= 0) doAttack();
  if (pressed.has('skill')) doSkill();

  // 教学提示推进
  if (g.prompt) {
    if (g.prompt.id === 'move' && p.moved > 1.5) setPrompt('jump');
    else if (g.prompt.id === 'jump' && p.x > 6.4) g.prompt = null;
  }
  if (p.hp < 30 && !g.lowHpSaid && p.hp > 0) { g.lowHpSaid = true; say(C.lines.lowHp); }
}

function doAttack() {
  const p = g.player, w = C.weapons[g.weapon];
  if (g.weapon === 'needle' && p.reloadT > 0) {
    if (pressed.has('attack')) toast('换线中……先换别的武器顶上', 0.9);
    return;
  }
  p.attackT = w.interval;
  g.metrics.attacks[g.weapon]++;
  const mul = takeHitMul();
  if (g.weapon === 'needle') {
    p.burst = w.count; p.burstT = 0; p.burstMul = mul;
    clearPrompt('attack');
    const canSwap = g.unlocked.dragon || g.unlocked.fan;   // 只有一把武器时不换线：没得切，等待只会拖慢开场
    if (canSwap) p.thread--;
    if (canSwap && p.thread <= 0) {
      p.reloadT = ch('reload', w.thread.reload); g.metrics.reloads = (g.metrics.reloads || 0) + 1;
      if (!g.threadTaught && (g.unlocked.dragon || g.unlocked.fan)) { g.threadTaught = true; setPrompt('thread', 4); }
    }
  } else if (g.weapon === 'dragon') {
    dragonCoil(mul);
  } else if (g.weapon === 'fan') {
    fanGust(mul);
  }
}

// 变脸匠：变脸后的下一击加成（用一次就没）
function takeHitMul() { const p = g.player, m = p.nextHitMul; p.nextHitMul = 1; return m; }

// 离玩家身体中心最近的距离（用于圆形/扇形范围判定）
function nearest(ox, oy, t, centerY) {
  const top = centerY ? t.y + t.h / 2 : t.y + t.h, bot = centerY ? t.y - t.h / 2 : t.y;
  const nx = clamp(ox, t.x - t.w / 2, t.x + t.w / 2), ny = clamp(oy, bot, top);
  return { dx: nx - ox, dy: ny - oy, d: Math.hypot(nx - ox, ny - oy) };
}

// 龙舞 · 龙绕身：绕身一圈，前后都打并向外弹开
function dragonCoil(mul) {
  const p = g.player, w = C.weapons.dragon, ox = p.x, oy = p.y + 0.9;
  p.coilT = w.active;
  let hits = 0;
  for (const t of targets()) {
    if (nearest(ox, oy, t).d > w.radius) continue;
    damageTarget(t, Math.round(w.dmg * ch('dragonDmgMul', 1) * mul), { knock: (sign(t.x - p.x) || p.facing) * w.knockback });
    hits++;
  }
  coilBlock();
  if (hits && g.prompt && g.prompt.id === 'dragon') clearPrompt('dragon');
}

// 龙绕身期间：挡下碰到龙身的谷粒和飞扇
function coilBlock() {
  const p = g.player, w = C.weapons.dragon, ox = p.x, oy = p.y + 0.9;
  for (const q of g.projs) {
    if (q.from !== 'e' || q.phase === 'reflect' || q.dead) continue;
    if (nearest(ox, oy, q, true).d > w.radius + 0.2) continue;
    q.dead = true;
    g.metrics.blocks = (g.metrics.blocks || 0) + 1;
    for (let i = 0; i < 6; i++) g.effects.push({ kind: 'paper', x: q.x, y: q.y, vx: rand(-3, 3), vy: rand(1, 4), t: 0.4, max: 0.4, rot: 0, c: '#e0a526' });
    if (q.kind === 'bfan') toast('龙舞挡下了飞扇', 1.0);
  }
}

// 折扇 · 扇风：向前扇出一阵风
function fanGust(mul) {
  const p = g.player, w = C.weapons.fan, ox = p.x, oy = p.y + 0.9;
  const cosLim = Math.cos((w.arc / 2) * Math.PI / 180);
  const inCone = (t, cy) => {
    const n = nearest(ox, oy, t, cy);
    return n.d <= w.range && (n.d < 0.4 || (n.dx * p.facing) / n.d >= cosLim);
  };
  p.gustT = 0.22;
  let pushed = 0;
  for (const t of targets()) {
    if (!inCone(t)) continue;
    if (t === g.boss) {
      if (t.state === 'fake_tele') bossExposed(t);           // 以扇破扇②：拆穿假投降
      damageTarget(t, Math.round(w.dmg * mul));
      continue;
    }
    // 扇飞：强力击退，并打断冲锋或抛射
    if (t.type === 'chicken' && (t.state === 'tele' || t.state === 'charge')) { t.state = 'recover'; t.t = C.enemies.chicken.recover; g.metrics.interrupts = (g.metrics.interrupts || 0) + 1; }
    if (t.type === 'grain' && t.state === 'tele') { t.state = 'recover'; t.t = 0.6; t.throwT = C.enemies.grain.period; g.metrics.interrupts = (g.metrics.interrupts || 0) + 1; }
    damageTarget(t, Math.round(w.dmg * mul), { push: p.facing * w.push, pushTime: w.pushTime });
    pushed++;
  }
  for (const q of g.projs) {
    if (q.from !== 'e' || q.dead || !inCone(q, true)) continue;
    if (q.kind === 'bfan' && q.phase !== 'reflect') {           // 以扇破扇①：把飞扇扇回去
      q.phase = 'reflect'; q.spin = 0;
      g.metrics.reflects = (g.metrics.reflects || 0) + 1;
      toast('一扇子扇回去了！', 1.2);
    } else if (q.kind === 'grain') { q.dead = true; }
  }
  if (pushed && g.prompt && g.prompt.id === 'fan') setPrompt('mix', 3.5);
}

// 龙舞 · 游龙：向前穿身冲刺，途中无敌，路过的敌人各吃一次伤害
function updateDash(p, dt) {
  const s = C.weapons.dragon.skill;
  p.dashT -= dt;
  p.vx = p.dashDir * s.dist / s.time; p.vy = 0;
  p.invuln = Math.max(p.invuln, p.dashT + 0.08);
  for (const t of targets()) {
    if (p.dashHit.has(t) || !boxOverlap(p.x, p.y, p.w + 0.6, p.h, t.x, t.y, t.w, t.h)) continue;
    p.dashHit.add(t);
    damageTarget(t, Math.round(s.dmg * ch('dragonDmgMul', 1) * p.dashMul));
  }
}

// 飞针离地高度：要低于最矮的敌人（秧鸡妖身高 1.0），否则会从头顶擦过去
const NEEDLE_Y = 0.6;

function spawnNeedle() {
  const p = g.player, w = C.weapons.needle;
  g.projs.push({ kind: 'needle', from: 'p', x: p.x + p.facing * 0.4, y: p.y + NEEDLE_Y + rand(-0.06, 0.06),
    vx: p.facing * w.speed, vy: 0, w: 0.5, h: 0.14, left: w.range, dmg: Math.round(w.dmg * p.burstMul) });
}

function doSkill() {
  const p = g.player;
  if (g.weapon === 'dragon') {
    const s = C.weapons.dragon.skill;
    if (p.cd.dragon > 0 || p.dashT > 0) return;
    p.cd.dragon = s.cd; g.metrics.skills.dragon = (g.metrics.skills.dragon || 0) + 1;
    p.dashT = s.time; p.dashDir = p.facing; p.dashHit = new Set(); p.dashMul = takeHitMul();
    return;
  }
  if (g.weapon === 'needle') {
    const s = C.weapons.needle.skill;
    if (p.cd.needle > 0) return;
    p.cd.needle = Math.max(1, s.cd - ch('pierceCdMinus', 0)); g.metrics.skills.needle++;
    const y0 = p.y + 0.5, y1 = p.y + 1.6;
    const x0 = p.x, x1 = p.x + p.facing * s.range;
    for (const t of targets()) {
      const inX = p.facing > 0 ? (t.x + t.w / 2 >= x0 && t.x - t.w / 2 <= x1) : (t.x - t.w / 2 <= x0 && t.x + t.w / 2 >= x1);
      if (inX && t.y < y1 && t.y + t.h > y0) damageTarget(t, s.dmg, { stun: s.stun });
    }
    g.effects.push({ kind: 'beam', x0, x1, y: p.y + NEEDLE_Y, t: 0.18, max: 0.18 });
    clearPrompt('pierce');
  } else if (g.weapon === 'fan') {
    const s = C.weapons.fan.skill;
    if (p.cd.fan > 0) return;
    p.cd.fan = s.cd; g.metrics.skills.fan++;
    g.zones = [{ x: p.x, y: p.y, r: s.radius, t: s.duration, max: s.duration }];
    if (g.prompt && g.prompt.id === 'fan') setPrompt('mix', 3.5);
  }
}

function targets() {
  const out = g.enemies.filter(e => e.state !== 'spawn' && !e.dead);
  if (g.boss && g.boss.state !== 'dead' && g.boss.state !== 'enter') out.push(g.boss);
  return out;
}

function hurtPlayer(dmg, cause, dirX) {
  const p = g.player;
  if (p.invuln > 0 || state !== 'play' || g.finalT >= 0) return false;
  if (god) { p.invuln = C.player.invuln; return true; }
  p.hp = Math.max(0, p.hp - dmg);
  p.invuln = C.player.invuln;
  p.hurtT = 0.15 * ch('hurtStunMul', 1); p.kbVx = (dirX || -p.facing) * 4;
  g.shake = 0.18;
  g.floats.push({ x: p.x, y: p.y + 2, text: '-' + dmg, t: 0.8, color: '#e33' });
  if (cause in g.metrics.bossHits) g.metrics.bossHits[cause]++;
  if (p.hp <= 0) {
    state = 'dying'; g.dyingT = 0.6;
    const a = currentAreaIdx();
    g.metrics.deaths.push({ area: a + 1, x: +p.x.toFixed(1), cause, t: +g.time.toFixed(1) });
  }
  return true;
}

// ---------------------------------------------------------------- 敌人
function spawnEnemy(def, area) {
  const E = C.enemies[def.t];
  g.enemies.push({ type: def.t, x: def.x, y: area.ground, vx: 0, vy: 0, w: E.w, h: E.h, hp: E.hp, maxHp: E.hp,
    facing: -1, state: 'spawn', t: 0.45, throwT: 1.2, kbT: 0, kbVx: 0, flash: 0, hitDone: false, area: area.idx });
}

function slowMul(e, isBoss) {
  for (const z of g.zones) {
    if (Math.abs(e.x - z.x) <= z.r + e.w / 2 && Math.abs(e.y - z.y) < 2) {
      return 1 - (isBoss ? C.weapons.fan.skill.bossSlow : C.weapons.fan.skill.slow);
    }
  }
  return 1;
}

function extraTele(areaIdx) { return g.areas[areaIdx] && g.areas[areaIdx].assist ? C.assist.extraTele : 0; }

function updateEnemy(e, dt, solids) {
  const E = C.enemies[e.type], p = g.player;
  e.flash = Math.max(0, e.flash - dt);
  const dx = p.x - e.x, dy = p.y - e.y, sm = slowMul(e, false);
  e.slowed = sm < 1;
  let vx = 0;
  e.t -= dt;

  if (e.state === 'spawn') { if (e.t <= 0) { e.state = 'walk'; } }
  else if (e.state === 'stun') { if (e.t <= 0) e.state = 'walk'; }
  else if (e.type === 'chicken') {
    if (e.state === 'walk') {
      e.facing = sign(dx) || e.facing;
      if (dy > 1.2) { // 玩家站在高处：退开到 3 单位外等他下来，避免挤在脚下
        if (Math.abs(dx) < 3) vx = -e.facing * E.walk * sm;
      } else if (Math.abs(dx) > 0.6) vx = e.facing * E.walk * sm;
      if (Math.abs(dx) <= E.aggro && Math.abs(dy) < 1.2 && e.grounded) {
        e.state = 'tele'; e.t = E.tele + extraTele(e.area); e.chargeDir = e.facing;
      }
    } else if (e.state === 'tele') {
      if (e.t <= 0) { e.state = 'charge'; e.t = E.charge; e.hitDone = false; }
    } else if (e.state === 'charge') {
      vx = e.chargeDir * E.chargeSpeed * sm;
      if (!e.hitDone && boxOverlap(e.x, e.y, e.w, e.h, p.x, p.y, p.w, p.h)) {
        if (hurtPlayer(E.dmg, 'chicken', e.chargeDir)) e.hitDone = true;
      }
      if (e.t <= 0 || e.hitWall) { e.state = 'recover'; e.t = E.recover; }
    } else if (e.state === 'recover') {
      if (e.t <= 0) e.state = 'walk';
    }
  } else if (e.type === 'grain') {
    e.throwT -= dt;
    const dist = Math.abs(dx);
    if (e.state === 'walk') {
      e.facing = sign(dx) || e.facing;
      if (dist < E.keepMin) vx = -e.facing * E.walk * sm;
      else if (dist > E.keepMax) vx = e.facing * E.walk * sm;
      if (e.throwT <= 0 && dist <= E.throwRange) {
        e.state = 'tele'; e.t = E.tele + extraTele(e.area); e.targetX = p.x; e.targetY = p.y;
        if (!g.grainTaught) { g.grainTaught = true; setPrompt('grain', 3.5); }
      }
    } else if (e.state === 'tele') {
      e.targetX = e.targetX + (p.x - e.targetX) * Math.min(1, dt * 1.5); // 预警期间缓慢追踪，抛出时锁定
      if (e.t <= 0) {
        const T = E.flight, sx = e.x, sy = e.y + e.h, ty = groundAt(e.targetX);
        g.projs.push({ kind: 'grain', from: 'e', x: sx, y: sy, vx: (e.targetX - sx) / T,
          vy: (ty - sy + 0.5 * E.grainGravity * T * T) / T, w: 0.35, h: 0.35, dmg: E.dmg, grav: E.grainGravity,
          targetX: e.targetX, src: 'grain', life: 3 });
        e.throwT = E.period; e.state = 'recover'; e.t = 0.35;
      }
    } else if (e.state === 'recover') { if (e.t <= 0) e.state = 'walk'; }
  }

  if (e.kbT > 0) { e.kbT -= dt; vx = e.kbVx; }
  e.vx = vx;
  e.vy -= C.gravity * dt;
  moveBody(e, dt, solids);
  if (e.y < -8) e.remove = true;
}

function damageTarget(t, dmg, opt = {}) {
  if (t === g.boss) return damageBoss(dmg);
  t.hp -= dmg; t.flash = 0.1;
  g.floats.push({ x: t.x, y: t.y + t.h + 0.3, text: String(dmg), t: 0.6, color: '#fff' });
  if (opt.stun && t.hp > 0) { t.state = 'stun'; t.t = opt.stun; }
  if (opt.knock && t.hp > 0) { t.kbT = 0.15; t.kbVx = opt.knock / 0.15; }
  if (opt.push && t.hp > 0) { t.kbT = opt.pushTime; t.kbVx = opt.push / opt.pushTime; t.blown = opt.pushTime; }
  if (t.hp <= 0 && !t.dead) {
    t.dead = true; t.remove = true;
    for (let i = 0; i < 14; i++) g.effects.push({ kind: 'paper', x: t.x, y: t.y + t.h / 2, vx: rand(-3, 3), vy: rand(1, 6),
      t: rand(0.5, 0.9), max: 0.9, rot: rand(0, 6), c: Math.random() < 0.5 ? '#efe9dc' : '#2a2630' });
  }
}

// ---------------------------------------------------------------- 战区与复色
function updateAreas(dt) {
  const p = g.player;
  for (const a of g.areas) {
    const prevOk = a.idx === 0 || g.areas[a.idx - 1].state === 'restored';
    if (a.state === 'idle' && prevOk && p.x >= a.trigger && state === 'play') startArea(a);
    if (a.state === 'fighting') {
      if (a.reward === 'boss') continue;
      const waves = wavesFor(a);
      const alive = g.enemies.some(e => e.area === a.idx);
      if (!alive) {
        if (a.wave < waves.length) {
          a.waveTimer -= dt;
          if (a.waveTimer <= 0) {
            for (const d of waves[a.wave]) spawnEnemy(d, a);
            a.wave++; a.waveTimer = 0.6;
            if (a.idx === 0 && a.wave === 1) setPrompt('attack');
            if (a.idx === 1 && a.wave === 2 && !g.metrics.skills.needle) setPrompt('pierce', 6);
          }
        } else beginRestore(a);
      }
    } else if (a.state === 'restoring') {
      a.restoreT += dt / C.restore.anim;
      if (a.restoreT >= 1) { a.restoreT = 1; a.state = 'restored'; applyReward(a, false); }
    }
  }
}

function wavesFor(a) {
  const w = a.waves.map(x => x.slice());
  if (a.assist) {
    let n = C.assist.removeEnemies;
    for (let i = w.length - 1; i >= 0 && n > 0; i--) while (w[i].length > 1 && n > 0) { w[i].pop(); n--; }
  }
  return w;
}

function startArea(a) {
  a.state = 'fighting'; a.wave = 0; a.waveTimer = 0.4;
  if (a.enterTime === null) a.enterTime = g.time;
  g.checkpoint = { x: a.x0 + 0.8, y: a.ground, area: a.idx };
  g.consumed = [];
  if (a.idx === 1) beat('enter1');
  if (a.reward === 'boss') {
    g.boss = makeBoss(a);
    bossLine('enter');
    setPrompt('boss', 5);
  }
}

function beginRestore(a) {
  a.state = 'restoring'; a.restoreT = 0;
  // 复色光波从这里向两边漫开（新画风用）：Boss 战从张不管倒下处，其余从玩家脚下
  a.origin = a.reward === 'boss' && g.boss ? g.boss.x : g.player.x;
  if (a.clearTime === null) { a.clearTime = g.time; g.metrics.areaTimes[a.idx] = +(a.clearTime - a.enterTime).toFixed(1); }
  if (g.metrics.firstRestore === null) g.metrics.firstRestore = +g.time.toFixed(1);
  a.fails = 0;
}

function applyReward(a, silent) {
  if (a.reward === 'shop') g.flags.shop = true;
  if (a.reward === 'stairs') {
    g.flags.stairs = true;
    if (g.flags.shop) addMutton(L.muttonSpots.afterArea2, 2.5);
    const p = g.player;
    for (const s of L.stairs) if (solidOverlap(p.x, p.y, p.w, p.h, s)) p.y = s.y + s.h;
    for (const e of g.enemies) for (const s of L.stairs) if (solidOverlap(e.x, e.y, e.w, e.h, s)) e.y = s.y + s.h;
  }
  if (a.reward === 'light') g.flags.lit = true;
  if (a.reward === 'curtain') {
    if (g.flags.shop) addMutton(L.muttonSpots.afterArea4, 2.5);
    g.checkpoint = { x: 94.5, y: 2.5, area: 3 };
  }
  if (!silent && a.rewardText) toast(a.rewardText, 3);
  if (!silent) beat('restore' + a.idx);
}

function addMutton(x, y) { if (!g.pickups.some(q => q.type === 'mutton' && q.x === x)) g.pickups.push({ type: 'mutton', x, y, taken: false, bob: 0 }); }

function updatePickups() {
  const p = g.player;
  for (const q of g.pickups) {
    if (q.taken || state !== 'play') continue;
    if (Math.abs(p.x - q.x) > 0.8 || p.y > q.y + 3 || p.y + p.h < q.y) continue;
    if (q.type === 'mutton') {
      if (p.hp >= p.maxHp) continue;      // 满血不消耗
      p.hp = Math.min(p.maxHp, p.hp + C.mutton.heal);
      q.taken = true; g.consumed.push(q); say(C.lines.mutton);
      g.floats.push({ x: p.x, y: p.y + 2.2, text: '+' + C.mutton.heal, t: 0.9, color: '#6f6' });
      if (p.hp >= 30) g.lowHpSaid = false;
    } else if (q.type === 'dragon') {
      q.taken = true; g.unlocked.dragon = true; beat('dragon'); setPrompt('dragon');
      toast('龙灯苏醒，获得「铜梁龙舞」', 2.5);
    } else if (q.type === 'fan') {
      q.taken = true; g.unlocked.fan = true; setPrompt('fan'); beat('fan');
      toast('扇摊复原一角，获得「荣昌折扇」', 2.5);
    }
  }
}

function retry() {
  const ai = currentAreaIdx();
  const a = g.areas[ai];
  g.metrics.retries++;
  g.enemies = []; g.projs = []; g.zones = []; g.effects = [];
  for (const q of g.consumed) q.taken = false;
  g.consumed = [];
  g.pickups = g.pickups.filter(q => !q.phaseDrop);   // 转阶段送的羊肉只属于那一次尝试
  const p = g.player, cp = g.checkpoint;
  Object.assign(p, makePlayer(cp.x, cp.y));
  p.invuln = 1.0;
  g.lowHpSaid = false;
  if (a && a.state === 'fighting') {
    a.wave = 0; a.waveTimer = 0.6;
    if (a.reward === 'boss') {
      g.boss = makeBoss(a); g.boss.t = 0.8;
      if (a.assist) g.boss.hp = g.boss.maxHp = Math.round(C.boss.hp * C.assist.bossHpMul);
    }
  }
  g.finalT = -1;
  state = 'play';
}

function onDeathScreen() {
  const ai = currentAreaIdx();
  const a = g.areas[ai];
  if (a) {
    a.fails++;
    if (a.fails >= C.assist.afterFails && !a.assistAsked && !a.assist) { state = 'assist'; return; }
  }
  state = 'dead';
}

// ---------------------------------------------------------------- Boss 张不管
function makeBoss(a) {
  const B = C.boss;
  return { isBoss: true, x: a.boss.x, y: a.ground, vx: 0, vy: 0, w: B.w, h: B.h, hp: B.hp, maxHp: B.hp, facing: -1,
    state: 'enter', t: B.enterTime, phase: 1, seq: 0, flash: 0, area: a.idx, hitDone: false, moved: 0 };
}

function bossVulnerable(b) { return /_recover$/.test(b.state); }

function damageBoss(dmg) {
  const b = g.boss, B = C.boss;
  if (!b || b.state === 'dead' || b.state === 'enter' || b.state === 'phase') return;
  const real = bossVulnerable(b) ? dmg : Math.max(1, Math.round(dmg * B.moveDmgMul));
  b.hp -= real; b.flash = 0.1;
  g.floats.push({ x: b.x + rand(-0.3, 0.3), y: b.y + b.h + 0.3, text: String(real), t: 0.6,
    color: bossVulnerable(b) ? '#ffd84a' : '#ddd' });
  if (b.hp <= 0) bossDie(b);
}

function bossDie(b) {
  b.hp = 0; b.state = 'dead'; b.t = 0;
  g.projs = []; g.enemies = [];
  g.player.invuln = 99;
  const a = g.areas[b.area];
  beginRestore(a);
  g.finalT = 0;
  bossLine('defeat');
}

// 以扇破扇①：被自己的飞扇打中，进入加长破绽
function bossHitByOwnFan(b) {
  const F = C.boss.fan;
  if (b.state === 'phase' || b.state === 'enter' || b.state === 'dead') return;
  b.state = 'fan_recover'; b.t = F.reflectStun; b.stunned = true;
  damageBoss(F.reflectDmg);
  if (b.state !== 'dead') { toast('张不管被自己的扇子打中了！趁现在！', 1.8); bossLine('reflected'); }
}

// 以扇破扇②：示弱时被折扇风刃打中 = 当场拆穿
function bossExposed(b) {
  b.state = 'fake_recover'; b.t = C.boss.fake.exposed; b.stunned = true;
  g.metrics.exposes = (g.metrics.exposes || 0) + 1;
  toast('拆穿了！', 1.5);
  bossLine('exposed');
}

function bossNext(b) {
  const B = C.boss;
  b.stunned = false;
  if (b.phase === 1 && b.hp <= B.hp * B.phase2At) {
    b.state = 'phase'; b.t = B.phaseTime;
    g.projs = g.projs.filter(q => q.from === 'p');
    g.player.invuln = Math.max(g.player.invuln, B.phaseTime);
    bossLine('phase');
    if (B.phaseMutton) {
      const a = g.areas[b.area], x = sign(g.player.x - b.x) > 0 ? a.x0 + 2 : a.x1 - 2; // 放在玩家身后一侧
      g.pickups.push({ type: 'mutton', x: Math.abs(x - g.player.x) < 1.5 ? (a.x0 + a.x1) / 2 : x, y: a.ground, taken: false, bob: 0, phaseDrop: true });
    }
    return;
  }
  b.state = 'idle'; b.t = B.idle;
}

function bossStartMove(b) {
  const B = C.boss, seq = b.phase === 1 ? ['fan', 'charge'] : ['fan', 'fake', 'charge'];
  const mv = seq[b.seq % seq.length]; b.seq++;
  const x = extraTele(b.area);
  b.facing = sign(g.player.x - b.x) || b.facing;
  b.hitDone = false;
  if (mv === 'fan') { b.state = 'fan_tele'; b.t = B.fan.tele + x; }
  if (mv === 'charge') { b.state = 'charge_tele'; b.t = B.charge.tele + x; b.chargeDir = b.facing; }
  if (mv === 'fake') { b.state = 'fake_tele'; b.t = B.fake.tele + x; }
  // 每招第一次出现时给一句提示（只在本局第一次）
  const TIPS = {
    fan: g.unlocked.fan ? '飞扇来了！用折扇（3）一扇子扇回去，或用龙舞（2）挡下' : '飞扇到边上会停一下再飞回来：回程也要跳！',
    charge: '矮子步：他压低身子要冲了，跳过他头顶！',
    fake: g.unlocked.fan ? '假投降！走近用折扇（3）扇他，当场拆穿' : '假投降！别信，赶紧退开',
  };
  g.bossTips = g.bossTips || {};
  if (!g.bossTips[mv]) { g.bossTips[mv] = true; toast(TIPS[mv], 2.2); }
}

function updateBoss(b, dt, solids) {
  const B = C.boss, p = g.player, a = g.areas[b.area];
  b.flash = Math.max(0, b.flash - dt);
  b.goT = Math.max(0, (b.goT || 0) - dt);
  b.h =/^charge/.test(b.state) && b.state !== 'charge_recover' ? B.h * B.charge.crouch : B.h;
  b.t -= dt;
  let vx = 0;
  const sm = slowMul(b, true);
  switch (b.state) {
    case 'enter': if (b.t <= 0) { b.state = 'idle'; b.t = 0.3; } break;
    case 'idle': {
      b.facing = sign(p.x - b.x) || b.facing;
      const d = Math.abs(p.x - b.x);
      if (d > 5) vx = b.facing * B.walk * sm; else if (d < 2.5) vx = -b.facing * B.walk * sm;
      if (b.t <= 0) bossStartMove(b);
      break;
    }
    case 'phase': if (b.t <= 0) { b.phase = 2; b.seq = 0; b.state = 'idle'; b.t = B.idle; } break;
    case 'fan_tele':
      if (b.t <= 0) {
        g.projs.push({ kind: 'bfan', from: 'e', x: b.x + b.facing * 0.8, y: b.y + 0.25, vx: b.facing * B.fan.speed, vy: 0,
          w: 0.9, h: 0.55, dmg: B.fan.dmg, src: 'fan', phase: 'out', hitOut: false, hitBack: false });
        b.state = 'fan_wait'; b.t = 8;
      }
      break;
    case 'fan_wait': if (!g.projs.some(q => q.kind === 'bfan') || b.t <= 0) { b.state = 'fan_recover'; b.t = B.fan.recover; } break;
    case 'charge_tele': if (b.t <= 0) { b.state = 'charge'; b.moved = 0; b.goT = 0.35; } break;
    case 'charge': {
      vx = b.chargeDir * B.charge.speed * sm;
      b.moved += Math.abs(vx) * dt;
      if (!b.hitDone && boxOverlap(b.x, b.y, b.w, b.h, p.x, p.y, p.w, p.h) && hurtPlayer(B.charge.dmg, 'charge', b.chargeDir)) b.hitDone = true;
      if (b.hitWall || b.moved >= B.charge.maxDist) { b.state = 'charge_recover'; b.t = B.charge.recover; }
      break;
    }
    case 'fake_tele': if (b.t <= 0) { b.state = 'fake_dash'; b.t = B.fake.dur; b.facing = sign(p.x - b.x) || b.facing; } break;
    case 'fake_dash':
      vx = b.facing * B.fake.speed * sm;
      if (!b.hitDone && boxOverlap(b.x, b.y, b.w, b.h, p.x, p.y, p.w, p.h) && hurtPlayer(B.fake.dmg, 'fake', b.facing)) b.hitDone = true;
      if (b.t <= 0 || b.hitWall) { b.state = 'fake_recover'; b.t = B.fake.recover; }
      break;
    case 'fan_recover': case 'charge_recover': case 'fake_recover':
      if (b.t <= 0) bossNext(b);
      break;
    case 'dead': b.t += 2 * dt; break;
  }
  b.vx = vx;
  b.vy -= C.gravity * dt;
  moveBody(b, dt, solids);
  b.x = clamp(b.x, a.x0 + b.w / 2, a.x1 - b.w / 2);
}

// ---------------------------------------------------------------- 投射物、区域、特效
function updateProjectiles(dt, solids) {
  const p = g.player;
  for (const q of g.projs) {
    if (q.kind === 'grain') q.vy -= q.grav * dt;
    if (q.kind === 'bfan') {
      const a = g.areas[4], b = g.boss;
      if (q.phase === 'out' && (q.x <= a.x0 + 0.6 || q.x >= a.x1 - 0.6)) { q.phase = 'hover'; q.hoverT = C.boss.fan.hover; q.vx = 0; }
      if (q.phase === 'hover') { q.hoverT -= dt; if (q.hoverT <= 0) q.phase = 'back'; }
      if (q.phase === 'reflect') {
        if (!b || b.state === 'dead') { q.dead = true; continue; }
        q.vx = sign(b.x - q.x) * C.boss.fan.reflectSpeed;
        if (Math.abs(q.x - b.x) < 0.8) { q.dead = true; bossHitByOwnFan(b); continue; }
      }
      if (q.phase === 'back' && b && Math.abs(q.x - b.x) < 0.7) { q.dead = true; continue; }
      if (q.phase === 'back' && b) q.vx = sign(b.x - q.x) * C.boss.fan.returnSpeed;
      q.spin = (q.spin || 0) + dt * 18;
    }
    q.x += q.vx * dt; q.y += q.vy * dt;
    if (q.left !== undefined) { q.left -= Math.abs(q.vx * dt); if (q.left <= 0) q.dead = true; }
    if (q.life !== undefined) { q.life -= dt; if (q.life <= 0) q.dead = true; }

    if (q.from === 'p') {
      for (const t of targets()) {
        if (boxOverlap(q.x, q.y - q.h / 2, q.w, q.h, t.x, t.y, t.w, t.h)) {
          damageTarget(t, q.dmg); q.dead = true; break;
        }
      }
      if (!q.dead && solids.some(s => !s.oneWay && solidOverlap(q.x, q.y - q.h / 2, 0.1, q.h, s))) q.dead = true;
    } else {
      if (q.phase !== 'reflect' && boxOverlap(q.x, q.y - q.h / 2, q.w, q.h, p.x, p.y, p.w, p.h)) {
        if (q.kind === 'bfan') {
          const key = q.phase === 'back' ? 'hitBack' : 'hitOut';
          if (!q[key] && hurtPlayer(q.dmg, 'fan', sign(q.vx))) q[key] = true;
        } else if (hurtPlayer(q.dmg, q.src || 'enemy', sign(q.vx))) q.dead = true;
      }
      if (q.kind === 'grain' && !q.dead && q.vy < 0 && solids.some(s => !s.lock && s.gate === undefined && solidOverlap(q.x, q.y - q.h, 0.2, 0.2, s))) {
        q.dead = true;
        for (let i = 0; i < 6; i++) g.effects.push({ kind: 'paper', x: q.x, y: q.y - 0.2, vx: rand(-2, 2), vy: rand(1, 3), t: 0.35, max: 0.35, rot: 0, c: '#d9b44a' });
      }
    }
  }
  g.projs = g.projs.filter(q => !q.dead);
}

function updateZones(dt) { for (const z of g.zones) z.t -= dt; g.zones = g.zones.filter(z => z.t > 0); }

function updateEffects(dt) {
  for (const e of g.effects) {
    e.t -= dt;
    if (e.kind === 'paper') { e.vy -= 12 * dt; e.x += e.vx * dt; e.y += e.vy * dt; e.rot += dt * 8; }
  }
  g.effects = g.effects.filter(e => e.t > 0);
  for (const f of g.floats) { f.t -= dt; f.y += dt * 1.2; }
  g.floats = g.floats.filter(f => f.t > 0);
  g.shake = Math.max(0, g.shake - dt);
}

function updateCamera(dt) {
  const p = g.player;
  let target = p.x - VIEW_U * 0.4;
  let lo = 0, hi = L.width - VIEW_U;
  const f = g.areas.find(a => a.state === 'fighting');
  if (f) {
    const w = f.x1 - f.x0 + 1;
    if (w <= VIEW_U) { lo = hi = (f.x0 + f.x1) / 2 - VIEW_U / 2; }
    else { lo = f.x0 - 0.5; hi = f.x1 + 0.5 - VIEW_U; }
  }
  if (g.finalT >= 0) { lo = 0; hi = L.width - VIEW_U; target = 96 - VIEW_U / 2 + 10 - Math.min(1, g.finalT / 2.5) * 6; }
  target = clamp(target, lo, hi);
  g.cam += (target - g.cam) * Math.min(1, dt * 6);
  // 相机高度随地面抬升
  const gy = p.x > 46 ? 2.5 : 0;
  g.camY = (g.camY === undefined ? gy : g.camY + (gy - g.camY) * Math.min(1, dt * 4));
}

// ---------------------------------------------------------------- 结算与数据
function restoredCount() { return g.areas.filter(a => a.state === 'restored').length; }

function finish() {
  state = 'result';
  g.metrics.totalTime = +g.time.toFixed(1);
  if (STORY) startStory(STORY.epilogue, () => { state = 'result'; });
  console.log('[画里山城 试玩数据]', JSON.stringify(g.metrics));
}

function metricsText() {
  const m = g.metrics;
  return JSON.stringify({
    版本: 'v0.6', 总用时含重试: m.totalTime, 第一次复色: m.firstRestore, 各区域用时: m.areaTimes,
    死亡: m.deaths, 重试次数: m.retries, 切换武器次数: m.switches, 普攻次数: m.attacks, 特色技次数: m.skills,
    Boss命中玩家: m.bossHits, 开启辅助拓印的区域: m.assistAreas,
    角色: g.char ? g.char.name : '-', 飞针换线次数: m.reloads || 0, 折扇扇回飞扇: m.reflects || 0, 折扇拆穿假投降: m.exposes || 0,
    折扇打断敌人: m.interrupts || 0, 龙舞挡下投射物: m.blocks || 0, 变脸次数: m.faceChanges || 0,
  }, null, 1);
}

function copyMetrics() {
  const txt = metricsText();
  const done = () => toastResult('试玩数据已复制');
  if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(txt).then(done, () => fallbackCopy(txt));
  else fallbackCopy(txt);
}
function fallbackCopy(txt) {
  const ta = document.createElement('textarea'); ta.value = txt; document.body.appendChild(ta); ta.select();
  try { document.execCommand('copy'); toastResult('试玩数据已复制'); } catch (e) { toastResult('复制失败，数据已输出到控制台'); }
  ta.remove();
}
let resultMsg = null;
function toastResult(t) { resultMsg = { text: t, until: performance.now() + 2000 }; }

// ================================================================ 绘制
function sx(x) { return (x - g.cam) * U; }
function sy(y) { return GROUND_SY - (y - (g.camY || 0)) * U + (g.camY || 0) * 0; }
// 说明：camY 只做轻微跟随，地面始终在画面下部
function wy(y) { return GROUND_SY - (y - (g.camY || 0) * 0.85) * U; }

function render() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#1b1a18'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(scale, 0, 0, scale, offX, offY);
  ctx.save();
  ctx.beginPath(); ctx.rect(0, 0, VW, VH); ctx.clip();
  if (state === 'title') drawTitle();
  else if (state === 'story') drawStory();
  else {
    let shx = 0, shy = 0;
    if (g.shake > 0) { shx = rand(-4, 4); shy = rand(-3, 3); }
    ctx.save(); ctx.translate(shx, shy);
    drawWorld();
    ctx.restore();
    drawHUD();
    if (isTouch && (state === 'play' || state === 'dying')) drawTouch();
    if (state === 'paused') drawPause();
    if (state === 'dead') drawDead();
    if (state === 'assist') drawAssist();
    if (state === 'result') drawResult();
  }
  if (isTouch && window.innerHeight > window.innerWidth) {
    ctx.fillStyle = 'rgba(20,18,16,0.85)'; ctx.fillRect(0, 0, VW, VH);
    text('请把手机横过来玩', VW / 2, VH / 2, 40, '#ffe9b0', 'center', 'bold');
  }
  ctx.restore();
}

// 界面文字颜色：灰盒是浅底深字，新画风是深底浅字
const INK = () => (ART ? '#eadfc8' : '#3b3833');

// 界面图片素材：新画风时才用，灰盒保持原样
const UI = (k) => (ART && window.IMG ? window.IMG.get(k) : null);

function text(str, x, y, size, color, align = 'left', weight = 'normal') {
  ctx.font = `${weight} ${size}px ${FONT}`; ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'middle';
  ctx.fillText(str, x, y);
}
function roundRect(x, y, w, h, r) { ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h); }
function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
}

function drawGreyBack() {
  // 纸面背景
  ctx.fillStyle = '#d8d4ca'; ctx.fillRect(0, 0, VW, VH);
  // 远山（视差）
  ctx.fillStyle = '#c4bfb3';
  for (let i = -1; i < 8; i++) {
    const bx = ((i * 260 - g.cam * U * 0.25) % 2080 + 2080) % 2080 - 260;
    ctx.beginPath(); ctx.moveTo(bx, 330); ctx.lineTo(bx + 130, 170 + (i % 3) * 30); ctx.lineTo(bx + 260, 330); ctx.fill();
  }
  // 区域色带：未修复是刻线，修复后是套色
  for (const a of g.areas) {
    const x0 = sx(a.idx === 0 ? -6 : g.areas[a.idx - 1].x1), x1 = sx(a.reward === 'boss' ? L.width : a.x1);
    const prog = a.state === 'restored' ? 1 : a.state === 'restoring' ? a.restoreT : 0;
    // 刻线
    ctx.save(); ctx.beginPath(); ctx.rect(x0, 0, x1 - x0, VH); ctx.clip();
    ctx.strokeStyle = 'rgba(60,55,50,0.10)'; ctx.lineWidth = 2;
    for (let k = x0 - VH; k < x1; k += 22) { ctx.beginPath(); ctx.moveTo(k, VH); ctx.lineTo(k + VH * 0.6, 0); ctx.stroke(); }
    if (prog > 0) {
      const w = (x1 - x0) * prog;
      ctx.fillStyle = hexA(a.color, 0.30); ctx.fillRect(x0, 0, w, VH);
      if (a.state === 'restoring') { ctx.fillStyle = hexA(a.color, 0.75); ctx.fillRect(x0 + w - 10, 0, 10, VH); }
    }
    ctx.restore();
  }
  drawProps();
  // 地形
  for (const s of activeSolids()) {
    if (s.lock || s.gate !== undefined) continue;
    if (s.x < -6.5 || s.x >= 120) continue;
    const x = sx(s.x), y = wy(s.y + s.h), w = s.w * U, h = s.h * U;
    const isStair = L.stairs.includes(s);
    ctx.fillStyle = s.oneWay ? '#7a6a58' : isStair ? '#6f8790' : '#5d5952';
    ctx.fillRect(x, y, w, s.oneWay ? 8 : h);
    ctx.fillStyle = '#3b3833'; ctx.fillRect(x, y, w, 3);
  }
  // 未出现的石阶虚线
  if (!g.flags.stairs) {
    ctx.setLineDash([5, 5]); ctx.strokeStyle = 'rgba(40,40,40,0.45)'; ctx.lineWidth = 1.5;
    for (const s of L.stairs) ctx.strokeRect(sx(s.x), wy(s.y + s.h), s.w * U, s.h * U);
    ctx.setLineDash([]);
  }
  // 浊气门与战区锁
  for (const s of activeSolids()) {
    if (!(s.lock || s.gate !== undefined)) continue;
    const x = sx(s.x) - 10, y0 = wy(s.y + 6), y1 = wy(s.y);
    const grd = ctx.createLinearGradient(x, 0, x + 24, 0);
    grd.addColorStop(0, 'rgba(50,30,70,0)'); grd.addColorStop(0.5, 'rgba(50,30,70,0.55)'); grd.addColorStop(1, 'rgba(50,30,70,0)');
    ctx.fillStyle = grd; ctx.fillRect(x, y0, 24, y1 - y0);
    ctx.strokeStyle = 'rgba(40,20,60,0.6)'; ctx.lineWidth = 2; ctx.beginPath();
    for (let yy = y0; yy < y1; yy += 6) ctx.lineTo(x + 12 + Math.sin(yy * 0.08 + g.t * 4) * 6, yy);
    ctx.stroke();
  }
}

function drawWorld() {
  if (ART) ART.back(); else drawGreyBack();
  // 暗巷
  if (!g.flags.lit && ART) ART.dark();
  else if (!g.flags.lit) {
    const x0 = sx(L.darkRange[0]), x1 = sx(L.darkRange[1]);
    const grd = ctx.createLinearGradient(x0, 0, x0 + 80, 0);
    grd.addColorStop(0, 'rgba(18,16,22,0)'); grd.addColorStop(1, 'rgba(18,16,22,0.82)');
    ctx.fillStyle = grd; ctx.fillRect(x0, 0, 80, VH);
    ctx.fillStyle = 'rgba(18,16,22,0.82)'; ctx.fillRect(x0 + 80, 0, Math.max(0, x1 - x0 - 80), VH);
    if (x0 < VW - 60) text('暗巷：龙灯未亮', Math.max(x0 + 120, 40), 140, 16, 'rgba(230,220,200,0.7)');
  }
  // 扇阵
  for (const z of g.zones) {
    const a = Math.min(1, z.t / 0.4);
    ctx.fillStyle = `rgba(62,155,90,${0.22 * a})`; ctx.strokeStyle = `rgba(62,155,90,${0.8 * a})`; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(sx(z.x), wy(z.y) - 4, z.r * U, 18, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(sx(z.x), wy(z.y) - 4, z.r * U, Math.PI, 0); ctx.strokeStyle = `rgba(62,155,90,${0.35 * a})`; ctx.stroke();
  }
  // 道具
  for (const q of g.pickups) {
    if (q.taken) continue;
    if (ART) { ART.pickup(q); continue; }
    const x = sx(q.x), y = wy(q.y) - 22 + Math.sin(g.t * 3 + q.bob) * 4;
    if (q.type === 'mutton') {
      ctx.fillStyle = '#b5552f'; ctx.beginPath(); ctx.ellipse(x, y, 14, 9, -0.3, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#efe6d6'; ctx.fillRect(x + 8, y - 12, 4, 10);
      text('羊肉', x, y - 24, 12, '#3b2b20', 'center');
    } else {
      ctx.fillStyle = q.type === 'dragon' ? '#e0a526' : '#3e9b5a';
      ctx.beginPath(); ctx.arc(x, y, 14, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#fff8'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, 20 + Math.sin(g.t * 5) * 3, 0, Math.PI * 2); ctx.stroke();
      text(q.type === 'dragon' ? '龙' : '扇', x, y + 1, 15, '#fff', 'center', 'bold');
    }
  }
  // 敌人
  for (const e of g.enemies) ART ? ART.enemy(e) : drawEnemy(e);
  if (g.boss) ART ? ART.boss(g.boss) : drawBoss(g.boss);
  if (ART) ART.player(); else drawPlayer();
  // 投射物
  for (const q of g.projs) ART ? ART.proj(q) : drawProj(q);
  // 特效
  for (const e of g.effects) {
    if (e.kind === 'paper') {
      ctx.save(); ctx.translate(sx(e.x), wy(e.y)); ctx.rotate(e.rot); ctx.globalAlpha = Math.min(1, e.t / e.max * 1.5);
      ctx.fillStyle = e.c; ctx.fillRect(-4, -3, 8, 6); ctx.restore();
    } else if (e.kind === 'beam') {
      ctx.strokeStyle = `rgba(255,215,90,${e.t / e.max})`; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(sx(e.x0), wy(e.y)); ctx.lineTo(sx(e.x1), wy(e.y)); ctx.stroke();
    }
  }
  for (const f of g.floats) text(f.text, sx(f.x), wy(f.y), 16, f.color, 'center', 'bold');
  if (ART) ART.front();
  // 结尾全景提亮
  if (g.finalT >= 0) {
    ctx.fillStyle = `rgba(255,235,190,${Math.max(0, 0.35 - Math.abs(g.finalT - 0.6) * 0.4)})`; ctx.fillRect(0, 0, VW, VH);
  }
}

function drawProps() {
  const lit = (i) => g.areas[i].state === 'restored' ? 1 : g.areas[i].state === 'restoring' ? g.areas[i].restoreT : 0;
  const grey = '#8d877d';
  // ① 羊肉摊
  {
    const k = lit(0), x = sx(13), y = wy(0);
    ctx.fillStyle = '#7d756a'; ctx.fillRect(x, y - 70, 8, 70); ctx.fillRect(x + 150, y - 70, 8, 70);
    ctx.fillStyle = k ? mix(grey, '#c8402f', k) : grey; ctx.fillRect(x - 10, y - 92, 178, 26);
    ctx.fillStyle = '#efe9dc55'; for (let i = 0; i < 178; i += 30) ctx.fillRect(x - 10 + i, y - 92, 14, 26);
    ctx.fillStyle = '#6b6156'; ctx.fillRect(x + 10, y - 34, 138, 34);
    text(k ? '羊肉汤' : '······', x + 79, y - 112, 15, k ? '#c8402f' : '#6b6156', 'center', 'bold');
  }
  // ③ 龙灯
  {
    const k = lit(2);
    ctx.strokeStyle = '#4a453e'; ctx.lineWidth = 1.5; ctx.beginPath();
    ctx.moveTo(sx(53), wy(7.2)); ctx.quadraticCurveTo(sx(60), wy(6.2), sx(67), wy(7.2)); ctx.stroke();
    for (let i = 0; i < 7; i++) {
      const lx = 54.2 + i * 1.8, ly = 6.6 - Math.sin(i / 6 * Math.PI) * 0.5;
      if (k) { ctx.fillStyle = `rgba(255,200,80,${0.25 * k})`; ctx.beginPath(); ctx.arc(sx(lx), wy(ly), 22, 0, 7); ctx.fill(); }
      ctx.fillStyle = k ? mix('#7d756a', '#e0a526', k) : '#7d756a';
      ctx.beginPath(); ctx.ellipse(sx(lx), wy(ly), 9, 12, 0, 0, 7); ctx.fill();
    }
  }
  // ④ 帷幕（区域④的出口）
  {
    const a = g.areas[3], k = lit(3);
    const x = sx(a.x1), y = wy(2.5);
    const open = k;
    ctx.fillStyle = mix('#6d6359', '#a8322a', k);
    ctx.fillRect(x - 44 - open * 30, y - 230, 44, 230); ctx.fillRect(x + 4 + open * 30, y - 230, 44, 230);
    ctx.fillStyle = '#4e463e'; ctx.fillRect(x - 80, y - 245, 160, 16);
  }
  // ⑤ 戏台
  {
    const a = g.areas[4], k = g.finalT >= 0 ? Math.min(1, g.finalT / 1.2) : 0;
    const x0 = sx(a.x0 + 1), x1 = sx(a.x1 - 1), y = wy(2.5);
    ctx.fillStyle = mix('#8a8378', '#9c3b2e', k); ctx.fillRect(x0, y - 260, x1 - x0, 18);
    ctx.fillStyle = mix('#7a7268', '#5a3b2a', k); ctx.fillRect(x0 + 10, y - 242, 10, 242); ctx.fillRect(x1 - 20, y - 242, 10, 242);
    ctx.fillStyle = mix('#8d877d', '#e0a526', k); ctx.fillRect(x0 - 20, y - 282, x1 - x0 + 40, 22);
    text('戏台', (x0 + x1) / 2, y - 251, 14, k ? '#ffe9b0' : '#3b3833', 'center', 'bold');
    if (k > 0) { // 谢幕人群
      for (let i = 0; i < 9; i++) {
        const px = x0 + 40 + i * ((x1 - x0 - 80) / 8), bob = Math.sin(g.t * 4 + i) * 3;
        ctx.fillStyle = ['#c8402f', '#e0a526', '#3e9b5a', '#4f7f8f'][i % 4];
        ctx.globalAlpha = k; ctx.fillRect(px - 8, y - 70 + bob, 16, 34); ctx.beginPath(); ctx.arc(px, y - 78 + bob, 8, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
      }
    }
  }
}

function mix(a, b, k) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const r = Math.round(((pa >> 16) * (1 - k)) + ((pb >> 16) * k));
  const gg = Math.round((((pa >> 8) & 255) * (1 - k)) + (((pb >> 8) & 255) * k));
  const bl = Math.round(((pa & 255) * (1 - k)) + ((pb & 255) * k));
  return `rgb(${r},${gg},${bl})`;
}

// 武器特效（游龙残影、扇风、龙绕身）：灰盒和新画风共用
function drawPlayerFx(opt = {}) {
  const p = g.player;
  const x = sx(p.x), y = wy(p.y), w = p.w * U, h = p.h * U, cy = y - 0.9 * U;
  // 游龙残影
  if (p.dashT > 0) {
    for (let i = 1; i <= 3; i++) { ctx.fillStyle = `rgba(224,165,38,${0.35 - i * 0.09})`; ctx.fillRect(x - p.dashDir * i * 22 - w / 2, y - h + 14, w, h - 14); }
  }
  // 扇风
  if (p.gustT > 0 && opt.gust !== false) {
    const W = C.weapons.fan, a = p.gustT / 0.22, half = W.arc / 2 * Math.PI / 180, base = p.facing > 0 ? 0 : Math.PI;
    ctx.fillStyle = `rgba(62,155,90,${0.28 * a})`;
    ctx.beginPath(); ctx.moveTo(x, cy); ctx.arc(x, cy, W.range * U, base - half, base + half); ctx.fill();
    ctx.strokeStyle = `rgba(62,155,90,${0.8 * a})`; ctx.lineWidth = 3;
    for (let i = -1; i <= 1; i++) {
      const r = W.range * U * (1 - a * 0.4);
      ctx.beginPath(); ctx.arc(x, cy, r - 14 + i * 12, base - half * 0.7, base + half * 0.7); ctx.stroke();
    }
  }
  // 龙绕身
  if (p.coilT > 0 && opt.coil !== false) {
    const R = C.weapons.dragon.radius * U, a = p.coilT / C.weapons.dragon.active, ang = (1 - a) * Math.PI * 2;
    ctx.strokeStyle = `rgba(224,165,38,${0.85 * a})`; ctx.lineWidth = 10;
    ctx.beginPath(); ctx.arc(x, cy, R * 0.92, ang - 2.6, ang); ctx.stroke();
    ctx.fillStyle = `rgba(224,165,38,${0.15 * a})`; ctx.beginPath(); ctx.arc(x, cy, R, 0, 7); ctx.fill();
    ctx.fillStyle = '#c0281e'; ctx.beginPath(); ctx.arc(x + Math.cos(ang) * R * 0.92, cy + Math.sin(ang) * R * 0.92, 9, 0, 7); ctx.fill();
  }
}

// 受伤无敌时闪烁（游龙和变脸的无敌不闪）
function playerBlink(p) {
  return state === 'play' && p.invuln > 0 && p.invuln < 50 && p.dashT <= 0 && p.faceT <= 0 && Math.floor(p.invuln * 15) % 2 === 0;
}

function drawPlayerLabels(p, x, y, h, color) {
  if (p.faceT > 0) text('变！', x, y - h - 36, 18, '#c0281e', 'center', 'bold');
  if (p.reloadT > 0 && g.weapon === 'needle') text('换线…', x, y - h - 20, 13, color || '#7a1d16', 'center', 'bold');
  if (debug) { ctx.strokeStyle = '#0f0'; ctx.strokeRect(x - p.w * U / 2, y - h, p.w * U, h); }
}

function drawPlayer() {
  const p = g.player;
  const x = sx(p.x), y = wy(p.y), w = p.w * U, h = p.h * U;
  drawPlayerFx();
  if (!playerBlink(p)) drawHero(x, y, w, h, p);
  drawPlayerLabels(p, x, y, h);
}

// 守画人外观：按角色换头部、服装色和道具（正式美术同理，共用一套身体动作）
const MASK_COLOR = { needle: '#c8402f', dragon: '#e0a526', fan: '#3e9b5a' };
function drawHero(x, y, w, h, p, look, color, weapon) {
  look = look || (g && g.char ? g.char.look : 'hat');
  color = color || (g && g.char ? g.char.color : '#2f3d5c');
  const facing = p ? p.facing : 1;
  ctx.fillStyle = color; ctx.fillRect(x - w / 2, y - h + 14, w, h - 14);
  ctx.fillStyle = '#f0e2c8'; ctx.fillRect(x - w / 2 + 4, y - h + 12, w - 8, 18);              // 脸
  ctx.fillStyle = '#222'; ctx.fillRect(x + facing * 6 - 2, y - h + 18, 4, 4);                // 眼
  if (look === 'bun') {            // 幺妹：发髻 + 红头绳
    ctx.fillStyle = '#2a2222'; ctx.fillRect(x - w / 2, y - h + 6, w, 9);
    ctx.beginPath(); ctx.arc(x - facing * 6, y - h + 2, 10, 0, 7); ctx.fill();
    ctx.fillStyle = '#c8402f'; ctx.fillRect(x - facing * 6 - 8, y - h + 4, 16, 3);
  } else if (look === 'pole') {    // 棒棒：白头帕 + 肩上扁担和绳子
    ctx.fillStyle = '#efe9dc'; ctx.fillRect(x - w / 2 - 2, y - h + 6, w + 4, 8);
    ctx.strokeStyle = '#8a6a3a'; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(x - facing * 34, y - h + 40); ctx.lineTo(x + facing * 30, y - h + 30); ctx.stroke();
    ctx.strokeStyle = '#5a4a32'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x - facing * 32, y - h + 40); ctx.lineTo(x - facing * 32, y - h + 66); ctx.stroke();
  } else if (look === 'mask') {    // 变脸匠：脸谱颜色随武器变
    const wpn = weapon || (g ? g.weapon : 'needle');
    ctx.fillStyle = MASK_COLOR[wpn] || '#c8402f'; ctx.fillRect(x - w / 2 + 4, y - h + 10, w - 8, 22);
    ctx.fillStyle = '#fff'; ctx.fillRect(x + facing * 6 - 4, y - h + 16, 8, 5);
    ctx.fillStyle = '#111'; ctx.fillRect(x - w / 2 + 6, y - h + 26, w - 12, 3);
    ctx.fillStyle = '#e0a526'; ctx.fillRect(x - w / 2 - 2, y - h + 4, w + 4, 7);           // 头冠
  } else {                         // 默认：斗笠 + 红围巾
    ctx.fillStyle = '#c8402f'; ctx.fillRect(x - w / 2, y - h + 30, w, 7);
    ctx.fillStyle = '#e8d9b5'; ctx.beginPath();
    ctx.moveTo(x - 30, y - h + 18); ctx.lineTo(x, y - h - 6); ctx.lineTo(x + 30, y - h + 18); ctx.fill();
  }
}

function drawEnemy(e) {
  const x = sx(e.x), y = wy(e.y), w = e.w * U, h = e.h * U;
  ctx.globalAlpha = e.state === 'spawn' ? 1 - e.t / 0.45 : 1;
  const tele = e.state === 'tele';
  if (e.type === 'chicken') {
    if (tele) { // 冲锋路线
      ctx.strokeStyle = 'rgba(220,40,40,0.8)'; ctx.lineWidth = 4; ctx.setLineDash([10, 6]);
      ctx.beginPath(); ctx.moveTo(x, y - 3); ctx.lineTo(x + e.chargeDir * 6 * U, y - 3); ctx.stroke(); ctx.setLineDash([]);
    }
    ctx.fillStyle = e.flash > 0 ? '#fff' : tele ? '#8e2f5a' : '#4b3566';
    roundRect(x - w / 2, y - h, w, h, 10); ctx.fill();
    ctx.fillStyle = '#d9a23a'; ctx.beginPath();
    ctx.moveTo(x + e.facing * w / 2, y - h * 0.65); ctx.lineTo(x + e.facing * (w / 2 + 14), y - h * 0.55); ctx.lineTo(x + e.facing * w / 2, y - h * 0.45); ctx.fill();
    ctx.fillStyle = '#ff3b3b'; ctx.fillRect(x + e.facing * 8 - 3, y - h * 0.75, 6, 5);
    if (e.state === 'recover') text('喘', x, y - h - 12, 13, '#3b3833', 'center');
  } else {
    if (tele) { // 落点标记
      const gx = sx(e.targetX), gy = wy(groundAt(e.targetX));
      ctx.strokeStyle = 'rgba(220,40,40,0.85)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(gx, gy - 3, 22, 7, 0, 0, 7); ctx.stroke();
    }
    ctx.fillStyle = e.flash > 0 ? '#fff' : '#4d3a5c'; ctx.fillRect(x - w / 2, y - h, w, h);
    ctx.fillStyle = '#d6b347';
    for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.ellipse(x + i * 9, y - h - 10, 4, 14, i * 0.4, 0, 7); ctx.fill(); }
    if (tele) { ctx.strokeStyle = '#4d3a5c'; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(x, y - h + 10); ctx.lineTo(x - e.facing * 12, y - h - 18); ctx.stroke(); }
    ctx.fillStyle = '#ff3b3b'; ctx.fillRect(x + e.facing * 6 - 3, y - h + 12, 6, 5);
  }
  if (e.state === 'stun') text('定', x, y - h - 14, 14, '#e0a526', 'center', 'bold');
  if (e.slowed) text('慢', x + 16, y - h - 14, 12, '#3e9b5a', 'center', 'bold');
  ctx.globalAlpha = 1;
  if (e.hp < e.maxHp) { ctx.fillStyle = '#0006'; ctx.fillRect(x - 18, y - h - 26, 36, 4); ctx.fillStyle = '#e44'; ctx.fillRect(x - 18, y - h - 26, 36 * e.hp / e.maxHp, 4); }
  if (debug) { ctx.strokeStyle = '#f0f'; ctx.strokeRect(x - w / 2, y - h, w, h); text(e.state, x, y + 12, 11, '#000', 'center'); }
}

function drawBoss(b) {
  const x = sx(b.x), y = wy(b.y), w = b.w * U;
  const h = b.h * U;
  if (b.state === 'dead') { ctx.globalAlpha = Math.max(0.25, 1 - b.t * 0.3); }
  // 预警
  if (b.state === 'charge_tele') {
    ctx.strokeStyle = 'rgba(220,40,40,0.85)'; ctx.lineWidth = 5; ctx.setLineDash([12, 6]);
    ctx.beginPath(); ctx.moveTo(x, y - 3); ctx.lineTo(x + b.chargeDir * C.boss.charge.maxDist * U, y - 3); ctx.stroke(); ctx.setLineDash([]);
  }
  // 预警期间：头顶倒计时条，满了就开冲
  if (b.state === 'charge_tele') {
    const k = 1 - b.t / (C.boss.charge.tele + extraTele(b.area));
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(x - 30, y - h - 22, 60, 7);
    ctx.fillStyle = '#e33'; ctx.fillRect(x - 30, y - h - 22, 60 * clamp(k, 0, 1), 7);
  }
  if (b.goT > 0) { // 开冲瞬间
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 4; ctx.strokeRect(x - w / 2 - 4, y - h - 4, w + 8, h + 8);
    text('冲！', x, y - h - 30, 24, '#c0281e', 'center', 'bold');
  }
  const weak = bossVulnerable(b);
  ctx.fillStyle = b.flash > 0 ? '#fff' : b.state === 'phase' ? '#aaa' : '#6e3a2c';
  ctx.fillRect(x - w / 2, y - h, w, h);
  // 白脸丑角妆
  ctx.fillStyle = '#f2ece0'; ctx.fillRect(x - 16, y - h + 10, 32, 26);
  ctx.fillStyle = '#222'; ctx.fillRect(x - 10 + b.facing * 3, y - h + 18, 6, 4); ctx.fillRect(x + 4 + b.facing * 3, y - h + 18, 6, 4);
  // 扇子姿态
  ctx.fillStyle = '#e8d9b5';
  if (b.state === 'fan_tele') { ctx.beginPath(); ctx.arc(x + b.facing * 10, y - h - 14, 22, Math.PI, 0); ctx.fill(); }
  else if (b.state === 'fake_tele') {
    ctx.beginPath(); ctx.arc(x, y - h - 24, 20, Math.PI, 0); ctx.fill();
    text('投降！投降！', x, y - h - 56, 15, INK(), 'center', 'bold');
    // 墨线暗示仍要出招
    ctx.strokeStyle = `rgba(30,20,40,${0.4 + 0.4 * Math.sin(g.t * 20)})`; ctx.lineWidth = 3;
    for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(x + b.facing * (w / 2 + 6), y - h + 20 + i * 18); ctx.lineTo(x + b.facing * (w / 2 + 34), y - h + 14 + i * 18); ctx.stroke(); }
  }
  if (weak) {
    if (C.boss.showWeakOutline) { ctx.strokeStyle = '#ffd84a'; ctx.lineWidth = 3; ctx.strokeRect(x - w / 2 - 3, y - h - 3, w + 6, h + 6); }
    const label = b.stunned ? (b.state === 'fan_recover' ? '被扇晕了！' : '被拆穿了！') : b.state === 'fan_recover' ? '收扇' : '喘气';
    text(label, x, y - h - (b.stunned ? 44 : 18), b.stunned ? 17 : 14, b.stunned ? '#c0281e' : '#7a5a00', 'center', 'bold');
  }
  ctx.globalAlpha = 1;
  if (debug) text(b.state + ' ' + b.t.toFixed(2), x, y + 14, 11, '#000', 'center');
}

function drawProj(q) {
  const x = sx(q.x), y = wy(q.y);
  if (q.kind === 'needle') { ctx.strokeStyle = '#2b2b2b'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x - 12, y); ctx.lineTo(x + 12, y); ctx.stroke(); ctx.fillStyle = '#c8402f'; ctx.fillRect(x - sign(q.vx) * 14, y - 1, 4, 3); }
  else if (q.kind === 'wind') { ctx.strokeStyle = 'rgba(62,155,90,0.9)'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(x - sign(q.vx) * 10, y, 16, -1, 1, q.vx < 0); ctx.stroke(); }
  else if (q.kind === 'grain') { ctx.fillStyle = '#d9b44a'; ctx.beginPath(); ctx.arc(x, y, 7, 0, 7); ctx.fill(); ctx.strokeStyle = '#6b5414'; ctx.lineWidth = 1.5; ctx.stroke(); }
  else if (q.kind === 'bfan') {
    // 地面箭头：显示飞扇正往哪边走；停顿时闪烁并标「回」
    const dir = q.phase === 'hover' ? sign((g.boss ? g.boss.x : q.x) - q.x) : sign(q.vx);
    const gy = wy(g.areas[4].ground) - 2;
    ctx.strokeStyle = q.phase === 'reflect' ? 'rgba(224,165,38,0.95)' : q.phase === 'out' ? 'rgba(220,40,40,0.5)' : 'rgba(220,40,40,0.9)'; ctx.lineWidth = 4;
    ctx.setLineDash([10, 6]); ctx.beginPath(); ctx.moveTo(x, gy); ctx.lineTo(x + dir * 2.5 * U, gy); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = ctx.strokeStyle; ctx.beginPath();
    ctx.moveTo(x + dir * 2.5 * U + dir * 12, gy); ctx.lineTo(x + dir * 2.5 * U, gy - 8); ctx.lineTo(x + dir * 2.5 * U, gy + 8); ctx.fill();
    if (q.phase === 'hover') {
      const blink = Math.floor(q.hoverT * 12) % 2 === 0;
      ctx.strokeStyle = blink ? '#ff3b3b' : '#ffd84a'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(x, y - 6, 30, 0, 7); ctx.stroke();
      text('回！', x, y - 52, 20, '#c0281e', 'center', 'bold');
    }
    if (q.phase === 'back') text('回', x, y - 40, 14, '#c0281e', 'center', 'bold');
    ctx.save(); ctx.translate(x, y - 6); ctx.rotate(q.spin || 0);
    ctx.fillStyle = q.phase === 'reflect' ? '#ffd84a' : '#e8d9b5'; ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, 20, 0, Math.PI * 0.9); ctx.fill();
    ctx.strokeStyle = '#6e3a2c'; ctx.lineWidth = 2; ctx.stroke(); ctx.restore();
  }
}

// ---------------------------------------------------------------- HUD
function drawHUD() {
  const p = g.player;
  // 生命
  roundRect(14, 14, 236, 40, 6); ctx.fillStyle = 'rgba(30,26,22,0.78)'; ctx.fill();
  if (UI('ui/hp_frame')) ctx.drawImage(UI('ui/hp_frame'), 8, 10, 248, 48);
  ctx.fillStyle = '#e8d9b5'; ctx.beginPath(); ctx.moveTo(24, 40); ctx.lineTo(38, 22); ctx.lineTo(52, 40); ctx.fill();
  ctx.fillStyle = '#3a3530'; ctx.fillRect(62, 26, 140, 16);
  ctx.fillStyle = p.hp < 30 ? (Math.floor(g.t * 6) % 2 ? '#ff5050' : '#a82020') : '#d23c32';
  ctx.fillRect(62, 26, 140 * p.hp / p.maxHp, 16);
  text(`${Math.ceil(p.hp)}/${p.maxHp}`, 222, 34, 13, '#fff', 'center');
  if (p.hp < 30 && p.hp > 0) text('危险', 62, 64, 13, '#ff6a6a', 'left', 'bold');
  // 修复进度
  const n = restoredCount();
  roundRect(VW - 286, 14, 272, 40, 6); ctx.fillStyle = 'rgba(30,26,22,0.78)'; ctx.fill();
  if (UI('ui/restore_frame')) ctx.drawImage(UI('ui/restore_frame'), VW - 292, 10, 284, 48);
  text(`修复 ${n * 20}%`, VW - 272, 34, 17, '#f3ead6', 'left', 'bold');
  g.areas.forEach((a, i) => {
    const x = VW - 160 + i * 28;
    ctx.fillStyle = a.state === 'restored' ? a.color : a.state === 'restoring' ? hexA(a.color, a.restoreT) : '#3a3530';
    ctx.fillRect(x, 24, 22, 20); ctx.strokeStyle = '#d8cdb5'; ctx.lineWidth = 1.5; ctx.strokeRect(x, 24, 22, 20);
  });
  // 区域名
  const ai = g.areas.findIndex(a => a.state === 'fighting');
  if (ai >= 0) text(`${'①②③④⑤'[ai]} ${g.areas[ai].name}`, VW / 2, 26, 16, INK(), 'center', 'bold');
  // Boss 血条
  if (g.boss && g.boss.state !== 'dead') {
    const b = g.boss;
    text(`${C.boss.name}${b.phase === 2 ? ' · 二阶段' : ''}`, VW / 2, 48, 14, INK(), 'center', 'bold');
    ctx.fillStyle = '#3a3530'; ctx.fillRect(VW / 2 - 180, 60, 360, 10);
    ctx.fillStyle = '#b23a2e'; ctx.fillRect(VW / 2 - 180, 60, 360 * Math.max(0, b.hp) / b.maxHp, 10);
    ctx.fillStyle = '#fff8'; ctx.fillRect(VW / 2, 58, 2, 14);
  }
  // 武器栏
  const ws = ['needle', 'dragon', 'fan'];
  if (!isTouch) ws.forEach((w, i) => {
    const x = 18 + i * 66, y = VH - 78;
    const cur = g.weapon === w, un = g.unlocked[w];
    roundRect(x, y, 56, 56, 6); ctx.fillStyle = cur ? 'rgba(224,165,38,0.9)' : 'rgba(30,26,22,0.75)'; ctx.fill();
    const icon = UI('ui/icon_' + w);
    if (icon) { ctx.save(); ctx.globalAlpha = un ? 1 : 0.25; const s = cur ? 46 : 40; ctx.drawImage(icon, x + 28 - s / 2, y + 26 - s / 2, s, s); ctx.restore(); if (!un) text('未得', x + 28, y + 44, 11, '#aaa', 'center'); }
    else text(un ? C.weapons[w].name.slice(2) : '未得', x + 28, y + 24, 15, un ? (cur ? '#2b2118' : '#efe6d6') : '#777', 'center', 'bold');
    text(String(i + 1), x + 28, y + 66, 12, INK(), 'center');
    if (w === 'needle' && (g.unlocked.dragon || g.unlocked.fan)) {     // 线量
      const R = threadRounds(), step = Math.min(8, 46 / R);
      for (let k = 0; k < R; k++) {
        ctx.fillStyle = k < p.thread && p.reloadT <= 0 ? (cur ? '#7a1d16' : '#e8d9b5') : 'rgba(0,0,0,0.3)';
        ctx.fillRect(x + 5 + k * step, y + 5, step - 2, 5);
      }
      if (p.reloadT > 0) {
        const k = 1 - p.reloadT / ch('reload', C.weapons.needle.thread.reload);
        ctx.fillStyle = 'rgba(0,0,0,0.55)'; roundRect(x, y, 56, 56, 6); ctx.fill();
        text('换线', x + 28, y + 24, 14, '#ffe9b0', 'center', 'bold');
        ctx.fillStyle = '#e0a526'; ctx.fillRect(x + 6, y + 42, 44 * k, 4);
      }
    }
    const s = C.weapons[w].skill;
    if (un && s) {
      const cd = p.cd[w] / s.cd;
      if (cd > 0) { ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(x, y + 56 * (1 - cd), 56, 56 * cd); text(p.cd[w].toFixed(1), x + 28, y + 44, 11, '#fff', 'center'); }
      else if (!UI('ui/icon_' + w)) text('K 就绪', x + 28, y + 44, 10, cur ? '#2b2118' : '#cfc3a8', 'center');
      else { ctx.fillStyle = '#7dffb0'; ctx.beginPath(); ctx.arc(x + 49, y + 49, 4, 0, 7); ctx.fill(); }   // 有图标时：右下角亮一个绿点表示特色技就绪
    }
  });
  // 攻击间隔条
  const ai2 = p.attackT / C.weapons[g.weapon].interval;
  if (ai2 > 0 && !isTouch) { ctx.fillStyle = '#0005'; ctx.fillRect(18, VH - 88, 188, 4); ctx.fillStyle = '#e0a526'; ctx.fillRect(18, VH - 88, 188 * (1 - ai2), 4); }
  // 按键提示
  if (!isTouch) {
    const kk = 'J 攻击   K 特色技   空格 跳跃';
    text(kk, VW - 20, VH - 24, 14, INK(), 'right');
  }
  // 教学提示
  if (g.prompt && PROMPTS[g.prompt.id]) {
    const s = isTouch ? PROMPTS[g.prompt.id].t : PROMPTS[g.prompt.id].k;
    ctx.font = `bold 18px ${FONT}`; const w = ctx.measureText(s).width + 40;
    roundRect(VW / 2 - w / 2, 92, w, 38, 8); ctx.fillStyle = 'rgba(30,26,22,0.82)'; ctx.fill();
    text(s, VW / 2, 111, 18, '#ffe9b0', 'center', 'bold');
  }
  if (g.toast) {
    ctx.font = `16px ${FONT}`; const w = ctx.measureText(g.toast.text).width + 36;
    roundRect(VW / 2 - w / 2, 142, w, 32, 8); ctx.fillStyle = 'rgba(178,58,46,0.88)'; ctx.fill();
    text(g.toast.text, VW / 2, 158, 16, '#fff', 'center');
  }
  if (g.subtitle) {
    const st = g.subtitle, size = st.text.length > 20 ? 18 : 21;
    ctx.font = `bold ${size}px ${FONT}`; const w = Math.max(ctx.measureText(st.text).width + 44, 200);
    const a = Math.min(1, st.shown * 6, st.t * 4);
    ctx.save(); ctx.globalAlpha = Math.max(0, a);
    roundRect(VW / 2 - w / 2, VH - 74, w, 44, 6); ctx.fillStyle = 'rgba(0,0,0,0.66)'; ctx.fill();
    if (st.who) {
      ctx.font = `bold 13px ${FONT}`; const ww = ctx.measureText(st.who).width + 18;
      roundRect(VW / 2 - w / 2 + 10, VH - 88, ww, 22, 4); ctx.fillStyle = st.boss ? 'rgba(178,58,46,0.95)' : 'rgba(150,110,40,0.95)'; ctx.fill();
      text(st.who, VW / 2 - w / 2 + 10 + ww / 2, VH - 77, 13, '#fff', 'center', 'bold');
    }
    text(st.text, VW / 2, VH - 51, size, '#fff', 'center', 'bold');
    ctx.restore();
  }
  text(`用时 ${fmtTime(g.time)}`, 18, 74, 12, INK());
  if (debug) {
    text(`FPS ${fps.toFixed(0)}  x=${p.x.toFixed(2)} y=${p.y.toFixed(2)}  敌人 ${g.enemies.length}  投射物 ${g.projs.length}`, 18, 92, 12, '#000');
  }
}

function fmtTime(t) { const m = Math.floor(t / 60), s = Math.floor(t % 60); return `${m}:${String(s).padStart(2, '0')}`; }

function drawTouch() {
  for (const b of TBTN) {
    if ((b.a === 'w2' && !g.unlocked.dragon) || (b.a === 'w3' && !g.unlocked.fan)) continue;
    const wKey = { w1: 'needle', w2: 'dragon', w3: 'fan' }[b.a];
    const on = held.has(b.a) || (wKey && g.weapon === wKey);
    ctx.fillStyle = on ? 'rgba(224,165,38,0.6)' : 'rgba(30,26,22,0.35)';
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, 7); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 2; ctx.stroke();
    if (UI('ui/btn_round')) { ctx.save(); ctx.globalAlpha = on ? 0.95 : 0.6; ctx.drawImage(UI('ui/btn_round'), b.x - b.r, b.y - b.r, b.r * 2, b.r * 2); ctx.restore(); }
    let label = b.label;
    if (wKey) label = { needle: '针', dragon: '龙', fan: '扇' }[wKey];
    if (b.a === 'attack' && g.weapon === 'dragon') label = '扫';
    if (wKey && UI('ui/icon_' + wKey)) ctx.drawImage(UI('ui/icon_' + wKey), b.x - b.r * 0.72, b.y - b.r * 0.72, b.r * 1.44, b.r * 1.44);
    else text(label, b.x, b.y + 1, b.r > 40 ? 22 : 16, '#fff', 'center', 'bold');
    if (wKey === 'needle' && g.unlocked.dragon) {
      const p = g.player;
      if (p.reloadT > 0) {
        const k = p.reloadT / ch('reload', C.weapons.needle.thread.reload);
        ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.beginPath(); ctx.moveTo(b.x, b.y);
        ctx.arc(b.x, b.y, b.r, -Math.PI / 2, -Math.PI / 2 + k * Math.PI * 2); ctx.fill();
      } else text(String(p.thread), b.x + b.r - 4, b.y - b.r + 6, 12, '#ffe9b0', 'center', 'bold');
    }
    if (b.a === 'skill') {   // 特色技冷却
      const s = C.weapons[g.weapon].skill;
      if (!s) { ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, 7); ctx.fill(); }
      else if (g.player.cd[g.weapon] > 0) {
        const k = g.player.cd[g.weapon] / s.cd;
        ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.beginPath(); ctx.moveTo(b.x, b.y);
        ctx.arc(b.x, b.y, b.r, -Math.PI / 2, -Math.PI / 2 + k * Math.PI * 2); ctx.fill();
      }
    }
  }
}

function panel(title, lines, btns) {
  ctx.fillStyle = 'rgba(20,18,16,0.72)'; ctx.fillRect(0, 0, VW, VH);
  text(title, VW / 2, 170, 36, '#ffe9b0', 'center', 'bold');
  lines.forEach((l, i) => text(l, VW / 2, 230 + i * 32, 18, '#efe6d6', 'center'));
  (btns || []).forEach(b => {
    roundRect(b.x - b.w / 2, b.y - 24, b.w, 48, 8); ctx.fillStyle = b.c || 'rgba(178,58,46,0.9)'; ctx.fill();
    text(b.text, b.x, b.y, 18, '#fff', 'center', 'bold');
  });
}

function drawPause() {
  panel('暂停', ['战斗已完全停止'], [
    { x: VW / 2, y: 330, w: 300, text: isTouch ? '点这里继续' : 'Esc 继续' },
    { x: VW / 2, y: 440, w: 300, text: isTouch ? '点这里重开整局' : 'R 重开整局', c: 'rgba(80,72,64,0.9)' },
  ]);
}
function drawDead() {
  panel('再拓一次', ['从本战区入口重来：生命、敌人、冷却重置', '已修好的画面和已得武器都会保留'],
    [{ x: VW / 2, y: 360, w: 300, text: isTouch ? '点击屏幕重试' : 'J / Enter 重试' }]);
}
function drawAssist() {
  const isBoss = g.areas[currentAreaIdx()] && g.areas[currentAreaIdx()].reward === 'boss';
  const effect = isBoss ? `张不管生命 -${Math.round((1 - C.assist.bossHpMul) * 100)}%` : `本区少 ${C.assist.removeEnemies} 只敌人`;
  panel('开启辅助拓印？', ['本战区已连续失败 2 次', `开启后：${effect}，预警延长 ${C.assist.extraTele} 秒；结算会如实标注`],
    [{ x: VW / 2 - 140, y: 360, w: 240, text: isTouch ? '开启' : 'Y 开启' },
     { x: VW / 2 + 140, y: 360, w: 240, text: isTouch ? '不用' : 'N 不用', c: 'rgba(80,72,64,0.9)' }]);
}
function drawResult() {
  const m = g.metrics;
  ctx.fillStyle = 'rgba(20,18,16,0.55)'; ctx.fillRect(0, 0, VW, VH);
  roundRect(VW / 2 - 330, 60, 660, 420, 12); ctx.fillStyle = 'rgba(243,234,214,0.96)'; ctx.fill();
  text(C.lines.end, VW / 2, 105, 30, '#b23a2e', 'center', 'bold');
  const rows = [
    ['用时（含重试）', fmtTime(m.totalTime)],
    ['修复完成度', '100%'],
    ['死亡 / 重试', `${m.deaths.length} 次`],
    ['辅助拓印', m.assistAreas.length ? `区域 ${m.assistAreas.join('、')}` : '未开启'],
    ['武器使用（普攻）', `飞针 ${m.attacks.needle} · 龙舞 ${m.attacks.dragon} · 折扇 ${m.attacks.fan}`],
    ['切换武器', `${m.switches} 次`],
    ['折扇 / 龙舞', `扇回飞扇 ${m.reflects || 0} · 拆穿 ${m.exposes || 0} · 打断 ${m.interrupts || 0} · 挡下 ${m.blocks || 0}`],
  ];
  rows.forEach((r, i) => { text(r[0], VW / 2 - 280, 148 + i * 31, 16, '#6b5f50'); text(r[1], VW / 2 + 280, 148 + i * 31, 16, '#2b2118', 'right', 'bold'); });
  roundRect(VW / 2 - 280, 362, 560, 46, 6); ctx.fillStyle = '#e8dcc2'; ctx.fill();
  text('知识卡（待核实后填写）：綦江版画 · 一个短知识点', VW / 2, 385, 15, '#6b5f50', 'center');
  if (!isTouch) {
    text('C 复制试玩数据', VW / 2 - 200, 445, 16, '#4f7f8f', 'center', 'bold');
    text('J 再玩一次', VW / 2, 445, 16, '#b23a2e', 'center', 'bold');
    text('B 换角色', VW / 2 + 200, 445, 16, '#6b5f50', 'center', 'bold');
  } else {
    text('点这里复制试玩数据', VW / 2, 425, 15, '#4f7f8f', 'center', 'bold');
    roundRect(VW / 2 - 330, 488, 190, 40, 8); ctx.fillStyle = 'rgba(80,72,64,0.9)'; ctx.fill(); text('换角色', VW / 2 - 235, 508, 17, '#fff', 'center', 'bold');
    roundRect(VW / 2 - 110, 488, 220, 40, 8); ctx.fillStyle = 'rgba(178,58,46,0.9)'; ctx.fill(); text('再玩一次', VW / 2, 508, 17, '#fff', 'center', 'bold');
  }
  if (g.char) text(`守画人：${g.char.name}（${g.char.title}）`, VW / 2, 128, 14, '#6b5f50', 'center');
  if (resultMsg && performance.now() < resultMsg.until) text(resultMsg.text, VW / 2, 40, 16, '#fff', 'center', 'bold');
}

function drawTitle() {
  if (ART) return drawTitleArt();
  ctx.fillStyle = '#d8d4ca'; ctx.fillRect(0, 0, VW, VH);
  ctx.strokeStyle = 'rgba(60,55,50,0.10)'; ctx.lineWidth = 2;
  for (let k = -VH; k < VW; k += 22) { ctx.beginPath(); ctx.moveTo(k, VH); ctx.lineTo(k + VH * 0.6, 0); ctx.stroke(); }
  const t = performance.now() / 1000;
  ['#c8402f', '#4f7f8f', '#e0a526', '#3e9b5a', '#b23a8e'].forEach((c, i) => {
    ctx.fillStyle = hexA(c, 0.25 + 0.1 * Math.sin(t * 2 + i)); ctx.fillRect(i * VW / 5, 0, VW / 5, VH);
  });
  text('画里山城', VW / 2, 52, 44, '#2b2118', 'center', 'bold');
  text('版画除妖记 · 灰盒原型 v0.2 · 选一位守画人', VW / 2, 100, 17, '#6b5f50', 'center');
  C.characters.forEach((c, i) => {
    const r = CARD_RECTS[i], sel = i === selChar;
    roundRect(r.x, r.y, r.w, r.h, 12);
    ctx.fillStyle = sel ? 'rgba(255,248,232,0.97)' : 'rgba(243,234,214,0.8)'; ctx.fill();
    ctx.lineWidth = sel ? 5 : 2; ctx.strokeStyle = sel ? c.color : 'rgba(60,55,50,0.35)'; ctx.stroke();
    // 立绘（灰盒）
    const bob = sel ? Math.sin(t * 4) * 3 : 0;
    drawHero(r.x + r.w / 2, r.y + 120 + bob, C.player.w * U, C.player.h * U, { facing: 1 }, c.look, c.color, ['needle', 'dragon', 'fan'][Math.floor(t) % 3]);
    text(`${i + 1}  ${c.name}`, r.x + r.w / 2, r.y + 150, 24, '#2b2118', 'center', 'bold');
    text(c.title, r.x + r.w / 2, r.y + 178, 15, c.color, 'center', 'bold');
    c.desc.forEach((d, k) => text(d, r.x + r.w / 2, r.y + 210 + k * 24, 13.5, '#4a4238', 'center'));
  });
  text(isTouch ? '点卡片选择，再点一次开始' : '← → 或 1/2/3 选择　J / 空格 开始', VW / 2, 470, 18, '#b23a2e', 'center', 'bold');
  text('A/D 移动　空格 跳跃　J 普攻　K 特色技　1/2/3 或 Tab 切武器　Esc 暂停', VW / 2, 506, 14, '#4a4238', 'center');
}

// 新画风的标题与选角：背景是缓慢平移的整幅山城，卡片半透明压在上面
function drawTitleArt() {
  const t = performance.now() / 1000;
  ART.titleBack();
  const logo = UI('ui/logo');
  if (logo) { const w = 300, h = w * logo.height / logo.width; ctx.drawImage(logo, VW / 2 - w / 2, 6, w, h); }
  else { ctx.save(); ctx.shadowColor = 'rgba(255,200,130,0.6)'; ctx.shadowBlur = 24; text('画里山城', VW / 2, 54, 46, '#fff1d6', 'center', 'bold'); ctx.restore(); }
  text('选一位守画人', VW / 2, logo ? 108 : 100, 16, 'rgba(240,225,200,0.85)', 'center');
  const prog = window.IMG ? window.IMG.progress() : 1;
  if (prog < 1) text(`素材加载中 ${Math.round(prog * 100)}%`, VW - 20, 22, 12, 'rgba(240,225,200,0.6)', 'right');
  C.characters.forEach((c, i) => {
    const r = CARD_RECTS[i], sel = i === selChar;
    roundRect(r.x, r.y, r.w, r.h, 14);
    ctx.fillStyle = sel ? 'rgba(12,18,26,0.9)' : 'rgba(12,18,26,0.76)'; ctx.fill();
    ctx.lineWidth = sel ? 3 : 1.5; ctx.strokeStyle = sel ? hexA(c.color, 1) : 'rgba(214,232,220,0.25)'; ctx.stroke();
    if (sel) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = hexA(c.color, 0.12); ctx.fill(); ctx.restore(); }
    if (UI('ui/card_frame')) { ctx.save(); ctx.globalAlpha = sel ? 1 : 0.55; ctx.drawImage(UI('ui/card_frame'), r.x - 6, r.y - 6, r.w + 12, r.h + 12); ctx.restore(); }
    const bob = sel ? Math.sin(t * 3) * 3 : 0;
    ART.portrait(r.x + r.w / 2, r.y + 122 + bob, c, ['needle', 'dragon', 'fan'][Math.floor(t) % 3], sel);
    text(`${i + 1}  ${c.name}`, r.x + r.w / 2, r.y + 156, 24, '#fff1d6', 'center', 'bold');
    text(c.title, r.x + r.w / 2, r.y + 184, 15, mix(c.color, '#ffffff', 0.45), 'center', 'bold');
    c.desc.forEach((d, k) => text(d, r.x + r.w / 2, r.y + 214 + k * 23, 13.5, 'rgba(232,222,204,0.88)', 'center'));
  });
  text(isTouch ? '点卡片选择，再点一次开始' : '← → 或 1/2/3 选择　J / 空格 开始　V 切换灰盒画面', VW / 2, 472, 17, '#ffd9a0', 'center', 'bold');
  text('A/D 移动　空格 跳跃　J 普攻　K 特色技　1/2/3 或 Tab 切武器　Esc 暂停', VW / 2, 506, 13.5, 'rgba(232,222,204,0.75)', 'center');
}

// ---------------------------------------------------------------- 新画风（art.js）
// art.js 只负责画面，不碰游戏逻辑。?art=0 或按 V 切回灰盒。
const artStyle = window.ArtStyle ? window.ArtStyle({
  ctx, U, VW, VH, C, L,
  get g() { return g; }, get state() { return state; }, get debug() { return debug; },
  sx, wy, activeSolids, text, hexA, roundRect, ch, MASK_COLOR,
  drawPlayerFx, playerBlink, drawPlayerLabels, drawEnemyGrey: drawEnemy,
  extraTele, bossVulnerable, get selChar() { return selChar; }, CARD_RECTS, drawHero,
  get isTouch() { return isTouch; },
}) : null;
let ART = params.get('art') === '0' ? null : artStyle;

// ---------------------------------------------------------------- 剧情画面绘制
function wrapLines(str, maxW, size) {
  ctx.font = `${size}px ${FONT}`;
  const lines = []; let cur = '';
  for (const c of str) {
    if (ctx.measureText(cur + c).width > maxW && cur) { lines.push(cur); cur = c; } else cur += c;
  }
  if (cur) lines.push(cur);
  return lines;
}

function drawStory() {
  const p = story.panels[story.i];
  if (ART) ART.storyBack(p.bg, p.scene || 0, p.img);
  else {
    const grd = ctx.createLinearGradient(0, 0, 0, VH);
    grd.addColorStop(0, '#2a2622'); grd.addColorStop(1, '#0f0d0b');
    ctx.fillStyle = grd; ctx.fillRect(0, 0, VW, VH);
    const label = p.bg === 'studio' ? '【墨爷的画室】' : p.bg === 'stage' ? '【万年台】' : '';
    if (label) text(label, VW / 2, 180, 26, 'rgba(232,222,204,0.5)', 'center', 'bold');
  }
  if (p.bg === 'map') drawChapterMap();
  // 文字框
  const full = panelText(p), shown = full.slice(0, Math.floor(story.t * TYPE_SPEED));
  const who = panelWho(p), boxY = VH - 150;
  // 说话人立绘：画在对话框右上方
  const pk = !who || p.bg === 'map' ? null : who.startsWith('墨爷') ? 'story/moye_portrait' : who === C.boss.name ? 'boss/portrait'
    : p.who === '@hero' && g && g.char ? `hero/${g.char.id}/portrait` : null;
  // 插图里已经画了这个人，就不再叠立绘（序章 4 的守画人是幺妹）
  const IN_PIC = { 'story/prologue_1': ['墨爷'], 'story/prologue_3': ['墨爷'], 'story/epilogue_1': [C.boss.name] };
  const inPic = (IN_PIC[p.img] || []).some(n => who && who.startsWith(n)) || (p.img === 'story/prologue_4' && p.who === '@hero' && g && g.char && g.char.id === 'yaomei');
  const pimg = pk && !inPic && UI(pk);
  if (pimg) { const h = 270, w = h * pimg.width / pimg.height; ctx.drawImage(pimg, VW - 70 - w, boxY + 24 - h, w, h); }
  roundRect(60, boxY, VW - 120, 120, 10); ctx.fillStyle = 'rgba(8,10,14,0.82)'; ctx.fill();
  ctx.strokeStyle = 'rgba(232,200,140,0.35)'; ctx.lineWidth = 1.5; ctx.stroke();
  if (UI('ui/dialog_box')) ctx.drawImage(UI('ui/dialog_box'), 52, boxY - 6, VW - 104, 132);
  if (who) {
    ctx.font = `bold 16px ${FONT}`; const ww = ctx.measureText(who).width + 26;
    roundRect(80, boxY - 16, ww, 30, 6);
    ctx.fillStyle = who === C.boss.name ? '#a8322a' : who.startsWith('墨爷') ? '#7a5a2a' : '#3f5f7a'; ctx.fill();
    if (UI('ui/name_plate')) ctx.drawImage(UI('ui/name_plate'), 74, boxY - 20, ww + 12, 38);
    text(who, 80 + ww / 2, boxY - 1, 16, '#fff', 'center', 'bold');
  }
  wrapLines(shown, VW - 200, 21).forEach((l, k) => text(l, 100, boxY + 40 + k * 32, 21, who ? '#fff4e2' : '#d8cdb8', 'left', who ? 'bold' : 'normal'));
  if (shown.length >= full.length && Math.floor(performance.now() / 400) % 2 === 0) text('▼', VW - 92, boxY + 98, 14, '#e8c890', 'center');
  text(isTouch ? '点击继续　点这里跳过' : 'J / 空格 继续　Esc 跳过', VW - 70, 28, 13, 'rgba(232,222,204,0.6)', 'right');
  text(`${story.i + 1} / ${story.panels.length}`, 70, 28, 13, 'rgba(232,222,204,0.5)', 'left');
}

// 章节地图：一卷展开的画，已完成的章节亮着，后面的锁着
function drawChapterMap() {
  const ch = STORY.chapters, n = ch.length, t = performance.now() / 1000;
  const xs = ch.map((c, i) => 120 + i * (VW - 240) / (n - 1)), ys = ch.map((c, i) => 200 + (i % 2 ? 50 : -10));
  const scroll = UI('ui/chapter_scroll');
  if (scroll) { const w = VW - 40, h = w * scroll.height / scroll.width; ctx.save(); ctx.globalAlpha = 0.9; ctx.drawImage(scroll, 20, 222 - h / 2, w, h); ctx.restore(); ctx.fillStyle = 'rgba(6,8,12,0.35)'; ctx.fillRect(20, 222 - h / 2, w, h); }
  ctx.strokeStyle = 'rgba(232,200,140,0.45)'; ctx.lineWidth = 3; ctx.setLineDash([8, 8]);
  ctx.beginPath(); xs.forEach((x, i) => (i ? ctx.lineTo(x, ys[i]) : ctx.moveTo(x, ys[i]))); ctx.stroke(); ctx.setLineDash([]);
  ch.forEach((c, i) => {
    const x = xs[i], y = ys[i];
    if (c.done) { ctx.save(); ctx.globalAlpha = 0.25 + 0.15 * Math.sin(t * 3 + i); ctx.beginPath(); ctx.arc(x, y, 42, 0, Math.PI * 2); ctx.fillStyle = '#ffd890'; ctx.fill(); ctx.restore(); }
    ctx.beginPath(); ctx.arc(x, y, 30, 0, Math.PI * 2);
    ctx.fillStyle = c.done ? 'rgba(232,170,60,0.95)' : 'rgba(40,44,52,0.9)'; ctx.fill();
    const thumb = UI('ui/chapter_thumb_' + (i + 1));
    if (thumb) {   // 圆形缩略图：没解锁的褪成灰
      ctx.save(); ctx.beginPath(); ctx.arc(x, y, 30, 0, Math.PI * 2); ctx.clip();
      ctx.drawImage(thumb, x - 32, y - 32, 64, 64);
      if (!c.done) { ctx.globalCompositeOperation = 'saturation'; ctx.fillStyle = '#808080'; ctx.fillRect(x - 32, y - 32, 64, 64); ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = 'rgba(10,12,16,0.55)'; ctx.fillRect(x - 32, y - 32, 64, 64); }
      ctx.restore();
    }
    ctx.lineWidth = 3; ctx.strokeStyle = c.done ? '#fff1d6' : 'rgba(200,200,210,0.4)'; ctx.beginPath(); ctx.arc(x, y, 30, 0, Math.PI * 2); ctx.stroke();
    if (!thumb || !c.done) text(c.done ? '✓' : '锁', x, y + 1, c.done ? 24 : 16, c.done ? '#3a2410' : 'rgba(220,220,230,0.75)', 'center', 'bold');
    text(c.name, x, y + 50, 15, c.done ? '#ffe6b8' : 'rgba(220,220,230,0.55)', 'center', 'bold');
    text(`《${c.title}》`, x, y + 72, 14, c.done ? '#fff1d6' : 'rgba(220,220,230,0.5)', 'center');
    text(c.done ? c.place : '敬请期待', x, y + 92, 12, c.done ? 'rgba(255,230,190,0.75)' : 'rgba(220,220,230,0.4)', 'center');
  });
  text('山城百景图', VW / 2, 100, 30, '#fff1d6', 'center', 'bold');
}

// ---------------------------------------------------------------- 主循环
let last = performance.now(), acc = 0, fps = 60;
function frame(now) {
  const ft = Math.min(0.1, (now - last) / 1000); last = now;
  fps = fps * 0.95 + (ft > 0 ? 1 / ft : 60) * 0.05;
  autoQuality(ft);
  acc += ft;
  let steps = 0;
  if (window.__game && window.__game.pauseLoop) acc = 0;   // 自动测试时由测试脚本驱动
  while (acc >= DT && steps < 6) { step(DT); acc -= DT; steps++; }
  render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// 测试与调参用的入口（浏览器控制台可访问）
window.__game = {
  get g() { return g; }, get state() { return state; }, set state(v) { state = v; },
  get maxDpr() { return MAX_DPR; },
  newRun, step, press: a => { press(a); }, release: a => held.delete(a), held, pressed,
  start(area, charIdx) { newRun(area, charIdx); state = 'play'; },
  get skipStory() { return skipStory; }, set skipStory(v) { skipStory = v; },
  get story() { return story; }, set prologueSeen(v) { prologueSeen = v; },
  get selChar() { return selChar; },
  pauseLoop: false,
};
})();
