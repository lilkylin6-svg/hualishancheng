// 自动回归测试：打开 test.html 即运行。对应设计方案第11章「完整版本的质量底线」。
// 用一个简单的脚本玩家跑完整关，并逐项检查流程规则。
(() => {
'use strict';
const G = window.__game;
const C = window.CONFIG;
G.pauseLoop = true;
G.skipStory = true;   // 其余测试不放剧情画面；剧情流程在「剧情」一组里单独测
const DT = 1 / 60;
const KEYS = ['left', 'right', 'attack', 'jump', 'skill', 'w1', 'w2', 'w3', 'cycle', 'pause', 'confirm', 'yes', 'no'];
const releaseAll = () => KEYS.forEach(k => G.release(k));
const tap = k => { G.press(k); G.step(DT); G.release(k); };
const start = (area, charIdx = -1) => G.start(area, charIdx);   // 默认不带角色特性
const run = (n, fn) => { for (let i = 0; i < n; i++) { if (fn) fn(); G.step(DT); } };

// 脚本玩家：靠近最近的敌人，人多时用龙舞，否则飞针
function bot(keepAlive) {
  const g = G.g, p = g.player;
  releaseAll();
  const f = g.areas.find(a => a.state === 'fighting');
  let tx = p.x + 5, want = 1;
  const ts = g.enemies.filter(e => e.state !== 'spawn');
  if (g.boss && g.boss.state !== 'dead' && g.boss.state !== 'enter') ts.push(g.boss);
  if (f && ts.length) {
    const t = ts.slice().sort((a, b) => Math.abs(a.x - p.x) - Math.abs(b.x - p.x))[0];
    tx = t.x;
    const near = ts.filter(e => Math.abs(e.x - p.x) < 3).length;
    if (g.unlocked.dragon && (near >= 2 || (p.reloadT > 0 && g.weapon === 'needle')) && g.weapon !== 'dragon') G.press('w2');
    else if (near < 2 && g.weapon !== 'needle' && p.reloadT <= 0) G.press('w1');
    want = g.weapon === 'dragon' ? 1.2 : 4;
    if (g.unlocked.fan && Math.random() < 0.01) G.press('w3');
    if (g.weapon === 'fan') G.press('skill');
    if (g.weapon === 'needle' && Math.random() < 0.02) G.press('skill');
    if (p.y > f.ground + 1 && p.grounded) { G.press(p.x < 60.6 ? 'left' : 'right'); return; }
  }
  const d = tx - p.x;
  if (Math.abs(d) > want + 0.3) G.press(d > 0 ? 'right' : 'left');
  else if (Math.sign(d) !== p.facing && Math.abs(d) > 0.2) G.press(d > 0 ? 'right' : 'left');
  else if (f && ts.length) G.press('attack');
  if (p.hitWall || (f && ts.some(e => /tele|charge/.test(e.state)) && Math.random() < 0.06)) G.press('jump');
  if (!p.grounded && p.vy < 0 && p.y > 3 && p.x > 59 && p.x < 62.5) { G.release('left'); G.release('right'); }
  if (keepAlive) p.hp = 100;
}
function botUntil(cond, maxSec = 300) {
  for (let i = 0; i < 60 * maxSec; i++) { if (cond(G.g)) { releaseAll(); return true; } bot(true); G.step(DT); }
  releaseAll(); return false;
}
function dieNow() {
  const p = G.g.player; releaseAll();
  p.invuln = 0; p.hp = 1;
  for (let i = 0; i < 60 * 40 && G.state === 'play'; i++) { p.invuln = 0; G.step(DT); }
  run(60);
}

const results = [];
function check(name, ok, detail = '') { results.push({ name, ok: !!ok, detail }); }
function test(name, fn) {
  try { fn(); } catch (e) { check(name + '（异常）', false, (e.stack || e.message).split('\n').slice(0, 3).join(' | ')); console.error(e); }
}

// ------------------------------------------------------------------ 用例
test('整关', () => {
  start(1);
  const done = botUntil(() => G.state === 'result', 400);
  const m = G.g.metrics;
  check('脚本玩家能从开场打到结算', done, `总用时 ${m.totalTime}s`);
  check('5 个区域全部复原，修复度 100%', G.g.areas.every(a => a.state === 'restored'));
  check('每个区域只结算一次', m.areaTimes.length === 5 && m.areaTimes.every(t => t > 0), JSON.stringify(m.areaTimes));
  check('复色返还全部生效（补给、石阶、龙灯）', G.g.flags.shop && G.g.flags.stairs && G.g.flags.lit);
  check('两把武器都在流程中获得', G.g.unlocked.dragon && G.g.unlocked.fan);
  // 设计目标是真人 30 秒内；脚本玩家笨拙且有随机性，这里只用 35 秒作防退化的保护线
  check('第一次复色不晚于 35 秒（脚本玩家；真人目标 30 秒）', m.firstRestore !== null && m.firstRestore <= 35, `${m.firstRestore}s`);
  check('Boss 用时（脚本玩家参考值，目标 60–90 秒）', true, `${m.areaTimes[4]}s`);
});

test('战区重试', () => {
  start(1);
  botUntil(g => g.areas[0].state === 'fighting' && g.enemies.length > 0, 20);
  dieNow();
  check('死亡后进入「再拓一次」', G.state === 'dead');
  tap('confirm');
  const g = G.g;
  check('重试：生命恢复、敌人清空、从第 1 波重来', g.player.hp === 100 && g.enemies.length === 0 && g.areas[0].wave === 0 && g.areas[0].state === 'fighting');
  check('重试：回到战区入口', Math.abs(g.player.x - (g.areas[0].x0 + 0.8)) < 0.01);
  run(60);
  dieNow();
  check('连续失败 2 次，询问辅助拓印', G.state === 'assist');
  tap('yes');
  const seen = new Set();
  botUntil(g2 => { g2.enemies.forEach(e => seen.add(e)); return g2.areas[0].state === 'restored'; }, 60);
  check('辅助拓印：区域①少 1 只敌人（3→2）', seen.size === 2, `实际 ${seen.size} 只`);
  check('辅助拓印记录进试玩数据', JSON.stringify(G.g.metrics.assistAreas) === '[1]');
});

test('道具重置', () => {
  start(3);  // 从龙灯街开始：区域②出口有羊肉
  const g = G.g;
  const mutton = g.pickups.find(q => q.type === 'mutton');
  check('摊位复色后，区域②出口出现羊肉', !!mutton);
  g.player.hp = 100; g.player.x = mutton.x; run(2);
  check('满血时不消耗羊肉', !mutton.taken);
  g.player.hp = 50; run(2);
  check('受伤时拾取回复 30', mutton.taken && g.player.hp === 80);
});

test('暂停', () => {
  start(1);
  botUntil(g => g.enemies.some(e => e.state !== 'spawn'), 20);
  const g = G.g, t0 = g.time, xs = g.enemies.map(e => e.x).join();
  tap('pause');
  run(120);
  check('暂停后计时与敌人全部停止', G.state === 'paused' && g.time === t0 && g.enemies.map(e => e.x).join() === xs);
  tap('pause');
  check('再按 Esc 继续', G.state === 'play');
});

test('武器切换', () => {
  start(5);
  const g = G.g, p = g.player;
  releaseAll();
  tap('attack');
  const a0 = p.attackT;
  tap('w2');
  check('切武器不重置攻击间隔', g.weapon === 'dragon' && p.attackT > 0 && p.attackT < a0);
  run(15);
  tap('w3'); tap('skill');
  const cd = p.cd.fan;
  run(15); tap('w1');
  check('切到飞针', g.weapon === 'needle');
  run(15); tap('w3');
  check('切走再切回，折扇冷却不刷新', cd > 7 && p.cd.fan < cd && p.cd.fan > 7);
  check('切换武器后扇阵仍然存在', g.zones.length === 1);
});

test('Boss', () => {
  start(5);
  const g = G.g;
  for (let i = 0; i < 60 * 3; i++) { G.press('right'); G.step(DT); }
  releaseAll();
  check('进入戏台后张不管登场', g.boss && g.areas[4].state === 'fighting');
  // 招式中受伤减半、破绽期全额
  for (let i = 0; i < 60 * 20 && !/^(fan_tele|charge_tele)$/.test(g.boss.state); i++) { g.player.hp = 100; G.step(DT); }
  let hp = g.boss.hp; g.player.x = g.boss.x - 3; g.player.facing = 1; g.weapon = 'needle'; g.player.cd.needle = 0;
  tap('skill');
  const moveDmg = hp - g.boss.hp;
  for (let i = 0; i < 60 * 20 && !/recover/.test(g.boss.state); i++) { g.player.hp = 100; G.step(DT); }
  hp = g.boss.hp; g.player.x = g.boss.x - 3; g.player.facing = 1; g.player.cd.needle = 0;
  tap('skill');
  const weakDmg = hp - g.boss.hp;
  check('出招中受伤减半，破绽期全额', moveDmg === 9 && weakDmg === 18, `出招中 ${moveDmg}，破绽 ${weakDmg}`);
  // 半血进二阶段
  g.boss.hp = 301;
  for (let i = 0; i < 60 * 20 && !/recover/.test(g.boss.state); i++) { g.player.hp = 100; G.step(DT); }
  g.player.x = g.boss.x - 3; g.player.facing = 1; g.player.cd.needle = 0; tap('skill');
  for (let i = 0; i < 60 * 10 && g.boss.phase === 1; i++) { g.player.hp = 100; G.step(DT); }
  check('半血后在招式结束时进入二阶段', g.boss.phase === 2);
  let sawFake = false;
  for (let i = 0; i < 60 * 30 && !sawFake; i++) { g.player.hp = 100; G.step(DT); if (g.boss.state === 'fake_tele') sawFake = true; }
  check('二阶段出现假投降', sawFake);
  // Boss 战死亡重试
  dieNow(); tap('confirm');
  check('Boss 战重试从第一阶段开始', G.state === 'play' && g.boss.hp === 600 && g.boss.phase === 1);
  // 致死一击：立即净化、清空投射物
  for (let i = 0; i < 60 * 20 && g.boss.state !== 'fan_wait'; i++) { g.player.hp = 100; G.step(DT); }
  g.boss.hp = 1; g.player.x = g.boss.x - 3; g.player.facing = 1; g.player.cd.needle = 0;
  tap('skill');
  check('击败后立即停止伤害并清空投射物', g.boss.state === 'dead' && g.projs.length === 0 && g.player.invuln > 10);
  run(60 * 4);
  check('击败后进入结算', G.state === 'result');
});

test('Boss 公平性', () => {
  start(5);
  const g = G.g;
  for (let i = 0; i < 60 * 3; i++) { G.press('right'); G.step(DT); }
  releaseAll();
  for (let i = 0; i < 60 * 30 && g.boss.state !== 'charge'; i++) { g.player.hp = 100; G.step(DT); }
  check('矮子步冲撞时身体压低，低于跳跃高度', g.boss.state === 'charge' && g.boss.h < C.player.jumpHeight - 0.5, `冲撞时高 ${g.boss.h.toFixed(2)}`);
  for (let i = 0; i < 60 * 30 && /recover/.test(g.boss.state) === false; i++) { g.player.hp = 100; G.step(DT); }
  g.boss.hp = 301;
  for (let i = 0; i < 60 * 20 && !/recover/.test(g.boss.state); i++) { g.player.hp = 100; G.step(DT); }
  g.player.x = g.boss.x - 3; g.player.facing = 1; g.player.cd.needle = 0; g.weapon = 'needle'; tap('skill');
  for (let i = 0; i < 60 * 10 && g.boss.phase === 1; i++) { g.player.hp = 100; G.step(DT); }
  const drop = g.pickups.find(q => q.phaseDrop);
  check('转二阶段时送来一碗羊肉', !!drop);
  dieNow(); tap('confirm');
  check('重试后转阶段羊肉被收回', !g.pickups.some(q => q.phaseDrop));
  dieNow();
  check('Boss 战连续失败 2 次也会询问辅助拓印', G.state === 'assist');
  tap('yes');
  check('Boss 辅助拓印：生命 ×0.75', g.boss.hp === Math.round(C.boss.hp * C.assist.bossHpMul), `${g.boss.hp}`);
});

test('穿针引线', () => {
  start(5);
  const g = G.g, p = g.player, R = C.weapons.needle.thread.rounds;
  releaseAll();
  for (let k = 0; k < R; k++) { p.attackT = 0; tap('attack'); }
  check(`飞针打 ${R} 轮后进入换线`, p.thread === 0 && p.reloadT > 1.4);
  const n = g.metrics.attacks.needle;
  p.attackT = 0; tap('attack');
  check('换线中飞针不能出手', g.metrics.attacks.needle === n);
  run(15); tap('w2'); p.attackT = 0; tap('attack');
  check('换线中可以切龙舞出手', g.weapon === 'dragon' && g.metrics.attacks.dragon === 1);
  run(60 * 1.5);
  check('切走期间换线照样完成，线量回满', p.reloadT === 0 && p.thread === R);
  start(1);
  const p1 = G.g.player; releaseAll();
  for (let k = 0; k < R + 2; k++) { p1.attackT = 0; tap('attack'); }
  check('只有飞针时不换线（第一、二区不拖慢开场）', p1.reloadT === 0 && G.g.metrics.attacks.needle === R + 2);
});

// 进戏台，等飞扇飞到玩家前方 lo~hi 单位处，用指定武器出手
function bossFanAt(weapon, lo, hi) {
  start(5);
  const g = G.g, p = g.player;
  for (let i = 0; i < 60 * 3; i++) { G.press('right'); G.step(DT); }
  releaseAll();
  for (let i = 0; i < 60 * 30; i++) {
    p.hp = 100;
    const q = g.projs.find(q => q.kind === 'bfan' && q.phase === 'out');
    if (q) {
      const ahead = (p.x - q.x) * Math.sign(q.vx);
      if (ahead > lo && ahead < hi) {
        g.weapon = weapon; p.facing = -Math.sign(q.vx); p.attackT = 0;
        tap('attack');
        return q;
      }
    }
    G.step(DT);
  }
  return null;
}

// 进第 1 区，等第一只秧鸡妖进入可行动状态
function firstChicken() {
  start(1);
  const g = G.g;
  g.player.x = 11;   // 直接进第 1 区（跳过开场矮台）
  for (let i = 0; i < 60 * 6 && !(g.areas[0].state === 'fighting' && g.enemies.some(e => e.state !== 'spawn')); i++) { G.press('right'); G.step(DT); }
  releaseAll();
  g.unlocked.dragon = g.unlocked.fan = true;
  const e = g.enemies.find(e => e.state !== 'spawn');
  e.state = 'walk'; e.t = 0;
  return e;
}

test('飞针命中', () => {
  for (const type of ['chicken', 'grain']) {
    const e = firstChicken(), g = G.g, p = g.player;
    if (type === 'grain') { Object.assign(e, { type: 'grain', w: C.enemies.grain.w, h: C.enemies.grain.h, hp: 30, maxHp: 30 }); }
    e.state = 'stun'; e.t = 10;                              // 站着不动
    p.x = e.x - 4; p.y = e.y; p.facing = 1; g.weapon = 'needle'; p.attackT = 0;
    const hp0 = e.hp;
    tap('attack'); run(30);
    const need = C.weapons.needle.count * C.weapons.needle.dmg;
    check(`飞针三针都能打中站着的${C.enemies[type].name}`, hp0 - e.hp === need, `打中 ${hp0 - e.hp}/${need}`);
  }
});

test('折扇 · 扇风', () => {
  let e = firstChicken(), g = G.g, p = g.player;
  p.x = e.x - 2; p.y = e.y; p.facing = 1; g.weapon = 'fan'; p.attackT = 0;
  const x0 = e.x, hp0 = e.hp;
  tap('attack'); run(20);
  check('扇风把秧鸡妖扇飞（≥2 单位）', e.x - x0 >= 2 && e.hp === hp0 - C.weapons.fan.dmg, `飞出 ${(e.x - x0).toFixed(2)}`);
  e = firstChicken(); g = G.g; p = g.player;
  for (let i = 0; i < 60 * 5 && e.state !== 'tele'; i++) { p.hp = 100; G.step(DT); }
  p.facing = Math.sign(e.x - p.x) || 1; p.x = e.x - p.facing * 2; g.weapon = 'fan'; p.attackT = 0;
  tap('attack');
  check('扇风打断秧鸡妖的冲锋预备', e.state === 'recover' && g.metrics.interrupts === 1);
});

test('龙舞 · 龙绕身与游龙', () => {
  let e = firstChicken(), g = G.g, p = g.player;
  p.x = e.x + 1.5; p.y = e.y; p.facing = 1; g.weapon = 'dragon'; p.attackT = 0;   // 敌人在背后
  const hp0 = e.hp;
  tap('attack');
  check('龙绕身能打到背后的敌人并弹开', e.hp === hp0 - C.weapons.dragon.dmg && e.kbVx < 0);
  e = firstChicken(); g = G.g; p = g.player;
  p.x = e.x - 2; p.y = e.y; p.facing = 1; g.weapon = 'dragon'; p.cd.dragon = 0;
  const hpE = e.hp, hpP = p.hp, xs = p.x;
  e.state = 'charge'; e.t = 0.45; e.chargeDir = -1; e.hitDone = false;   // 正面冲过来
  tap('skill'); run(20);
  check('游龙冲刺穿过敌人：造成伤害、自己不掉血', e.hp === hpE - C.weapons.dragon.skill.dmg && p.hp === hpP && p.x - xs > 3,
    `位移 ${(p.x - xs).toFixed(2)}`);
});

test('以扇破扇', () => {
  // ① 折扇扇风把飞扇扇回去
  let q = bossFanAt('fan', 0.5, 3.0);
  let g = G.g, p = g.player;
  check('折扇扇风能把飞来的扇子扇回去', q && q.phase === 'reflect');
  const hp0 = g.boss.hp, fanHits0 = g.metrics.bossHits.fan;
  p.x = g.boss.x - 2; p.invuln = 0;   // 站在扇子回程路线上
  for (let i = 0; i < 60 * 5 && !g.boss.stunned; i++) { p.hp = 100; p.invuln = 0; G.step(DT); }
  check('张不管被自己的扇子打中：受到全额伤害并晕更久', g.boss.stunned && g.boss.state === 'fan_recover' && hp0 - g.boss.hp === C.boss.fan.reflectDmg && g.boss.t > C.boss.fan.recover,
    `伤害 ${hp0 - g.boss.hp}，破绽剩 ${g.boss.t.toFixed(2)}s`);
  check('被扇回的扇子不会伤到玩家', g.metrics.bossHits.fan === fanHits0);
  // ② 龙绕身挡下飞扇（不扇回）
  q = bossFanAt('dragon', 0.5, 2.5);
  g = G.g;
  run(2);
  check('龙绕身挡下飞扇', q && q.dead && g.metrics.blocks === 1 && !g.projs.some(x => x.kind === 'bfan'));
  for (let i = 0; i < 30 && g.boss.state === 'fan_wait'; i++) G.step(DT);
  check('挡下后张不管照常收扇（不是被扇晕）', g.boss.state === 'fan_recover' && !g.boss.stunned);
  // ③ 折扇拆穿假投降
  start(5);
  g = G.g; p = g.player;
  for (let i = 0; i < 60 * 3; i++) { G.press('right'); G.step(DT); }
  releaseAll();
  for (let i = 0; i < 60 * 5 && g.boss.state === 'enter'; i++) G.step(DT);
  Object.assign(g.boss, { phase: 2, seq: 1, state: 'idle', t: 0 });   // 下一招是假投降
  for (let i = 0; i < 60 * 5 && g.boss.state !== 'fake_tele'; i++) G.step(DT);
  p.x = g.boss.x - 2.5; p.y = g.boss.y; p.facing = 1; g.weapon = 'fan'; p.attackT = 0;
  const hits0 = g.metrics.bossHits.fake;
  tap('attack');
  check('扇风扇中示弱的张不管 = 拆穿', g.boss.state === 'fake_recover' && g.boss.stunned && g.metrics.exposes === 1);
  run(60 * 2);
  check('拆穿后突袭被取消', g.metrics.bossHits.fake === hits0);
});

test('角色', () => {
  C.characters.forEach((c, i) => {
    start(1, i);
    check(`${c.name}：生命 ${c.hp}`, G.g.player.maxHp === c.hp && G.g.player.hp === c.hp && G.g.char === c);
  });
  // 幺妹：线量与换线
  start(4, 0);
  let g = G.g, p = g.player; releaseAll();
  const R0 = C.characters[0].thread;
  for (let k = 0; k < R0; k++) { p.attackT = 0; tap('attack'); }
  check(`幺妹：线量 ${R0}，换线 ${C.characters[0].reload} 秒`, p.thread === 0 && Math.abs(p.reloadT - (C.characters[0].reload - DT)) < 0.02);
  // 棒棒：走得慢、挨打不踉跄
  start(5, 1); g = G.g; p = g.player;   // 戏台入口前是平地
  const x0 = p.x; for (let i = 0; i < 60; i++) { G.press('right'); G.step(DT); } releaseAll();
  check('棒棒：移动速度 ×0.9', Math.abs((p.x - x0) - C.player.speed * 0.9) < 0.1, `1 秒走了 ${(p.x - x0).toFixed(2)}`);
  // 变脸匠：换武器即变脸
  start(5, 2); g = G.g; p = g.player; releaseAll();
  run(5); tap('w2');
  check('变脸匠：换武器获得无敌并蓄好加成', p.invuln >= 0.35 && p.nextHitMul === 1.5 && g.metrics.faceChanges === 1);
  p.attackT = 0; tap('attack');
  check('变脸加成用一次就没', p.nextHitMul === 1);
});

// 会躲招、不回血的脚本玩家：衡量 Boss 对「认真看预警」的玩家是否公平
function dodgeBot() {
  const g = G.g, p = g.player, b = g.boss;
  releaseAll();
  if (!b || b.state === 'dead') { G.press('right'); return; }
  const a = g.areas[4];
  const rel = p.x - b.x, dist = Math.abs(rel);
  let move = 0, jump = false;
  if (b.state === 'charge' || b.state === 'charge_tele') {
    const ahead = (p.x - b.x) * b.chargeDir;
    if (b.state === 'charge' && ahead > 0 && ahead < 2.0) jump = true;
  }
  if (b.state === 'fake_tele' || b.state === 'fake_dash') {
    move = sign(rel) || 1;
    if ((move > 0 && p.x > a.x1 - 1.2) || (move < 0 && p.x < a.x0 + 1.2)) move = 0;
  }
  for (const q of g.projs) if (q.kind === 'bfan') { const d = (p.x - q.x) * Math.sign(q.vx); if (d > 0 && d < 1.6) jump = true; }
  if (!move) {
    if (dist > 5) move = sign(rel) * -1; else if (dist < 3.5) move = sign(rel) || 1;
    if ((move > 0 && p.x > a.x1 - 1) || (move < 0 && p.x < a.x0 + 1)) move = 0;
  }
  if (move) G.press(move > 0 ? 'right' : 'left');
  else if (sign(-rel) !== p.facing) G.press(rel < 0 ? 'right' : 'left');
  if (jump) G.press('jump');
  if (p.reloadT > 0) { if (g.weapon !== 'fan') G.press('w3'); }   // 换线时用折扇风刃顶上
  else if (g.weapon !== 'needle') G.press('w1');
  if (!move || dist < 5.5) G.press('attack');
  if (p.cd.needle <= 0 && dist < 8) G.press('skill');
  // 转阶段羊肉：受伤且附近有就去拿
  const m = g.pickups.find(q => q.phaseDrop && !q.taken);
  if (m && p.hp < 70 && b.state !== 'charge' && b.state !== 'fake_dash') { releaseAll(); G.press(m.x > p.x ? 'right' : 'left'); }
}
const sign = v => (v > 0 ? 1 : v < 0 ? -1 : 0);

test('躲招脚本玩家（不回血，10 场）', () => {
  let wins = 0; const times = [], hps = [], hitsBy = { fan: 0, charge: 0, fake: 0 };
  for (let k = 0; k < 10; k++) {
    releaseAll();
    start(5);
    const g = G.g;
    for (let i = 0; i < 60 * 3; i++) { G.press('right'); G.step(DT); }
    releaseAll();
    const t0 = g.time;
    for (let i = 0; i < 60 * 240 && G.state === 'play' && g.boss.state !== 'dead'; i++) { dodgeBot(); G.step(DT); }
    for (const key in hitsBy) hitsBy[key] += g.metrics.bossHits[key];
    if (g.boss.state === 'dead') { wins++; times.push(g.time - t0); hps.push(g.player.hp); }
  }
  releaseAll();
  const avg = arr => arr.length ? (arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(0) : '-';
  check('认真躲招的玩家多数能赢（≥7/10）', wins >= 7,
    `胜 ${wins}/10，平均用时 ${avg(times)}s，剩余生命 ${avg(hps)}；10 场共被命中：飞扇 ${hitsBy.fan}、冲撞 ${hitsBy.charge}、假投降 ${hitsBy.fake}`);
});

test('剧情', () => {
  const S = window.STORY;
  G.skipStory = false; G.prologueSeen = false;
  // 标题 → 序章 → 游戏
  G.state = 'title'; releaseAll();
  tap('confirm');
  check('选好角色后先播序章', G.state === 'story' && G.story.panels === S.prologue);
  let n = 0;
  while (G.state === 'story' && n < 100) { tap('confirm'); n++; }
  check('序章按完进入游戏', G.state === 'play', `按了 ${n} 下`);
  check('序章每句都要先显示完再翻页（按键数 = 句数 × 2）', n === S.prologue.length * 2, `${n} / ${S.prologue.length * 2}`);
  check('进入画中时墨爷在画外说话', G.g.subtitle && G.g.subtitle.who === S.beats.start.who);
  // 第二次开局不再播序章
  G.state = 'title'; tap('confirm');
  check('同一次打开只播一次序章', G.state === 'play');
  // Esc 跳过
  G.prologueSeen = false; G.state = 'title'; tap('confirm'); tap('pause');
  check('Esc 跳过整段序章', G.state === 'play');
  // 关内对话：羊肉摊复色后汤摊老板说话
  start(1, 0);
  const g = G.g; g.player.x = 11; run(30);
  for (const e of g.enemies) { e.hp = 0; e.remove = true; }
  g.areas[0].wave = g.areas[0].waves.length; run(70);
  const said = [g.subtitle, ...g.subQueue].filter(Boolean).map(l => l.who);
  check('羊肉摊复色后汤摊老板说话', said.includes(S.beats.restore0.who), said.join('、'));
  // 张不管台词
  start(5, 0);
  const g5 = G.g;
  for (let i = 0; i < 60 * 3; i++) { G.press('right'); G.step(DT); }
  releaseAll();
  check('张不管登场有台词', g5.subtitle && g5.subtitle.who === C.boss.name && g5.subtitle.text === S.boss.enter);
  // 击败 → 尾声 → 结算
  for (let i = 0; i < 60 * 20 && !/recover/.test(g5.boss.state); i++) { g5.player.hp = 100; G.step(DT); }
  g5.boss.hp = 1; g5.player.x = g5.boss.x - 3; g5.player.facing = 1; g5.weapon = 'needle'; g5.player.cd.needle = 0;
  tap('skill');
  check('击败张不管时他说话', g5.subtitle && g5.subtitle.text === S.boss.defeat);
  run(60 * 4);
  check('击败后先播尾声', G.state === 'story' && G.story.panels === S.epilogue);
  n = 0;
  while (G.state === 'story' && n < 100) { tap('confirm'); n++; }
  check('尾声（含章节地图）播完进入结算', G.state === 'result');
  G.skipStory = true;
});

// 剧本数据完整性：每个台词时机都有内容
test('剧本数据', () => {
  const S = window.STORY;
  check('story.js 已加载', !!S);
  const beats = ['start', 'restore0', 'enter1', 'restore1', 'dragon', 'restore2', 'fan', 'restore3'];
  check('关内 8 处对话齐全', beats.every(k => S.beats[k] && S.beats[k].text && S.beats[k].who));
  check('张不管 5 句台词齐全', ['enter', 'phase', 'exposed', 'reflected', 'defeat'].every(k => S.boss[k]));
  const hero = S.prologue.find(p => p.who === '@hero');
  check('序章里三位守画人各有自己的台词', C.characters.every(c => hero.text[c.id]));
  check('章节地图 5 章，比赛版完成前两章', S.chapters.length === 5 && S.chapters.filter(c => c.done).length === 2);
});

// ------------------------------------------------------------------ 输出
const pass = results.filter(r => r.ok).length;
const box = document.createElement('div');
box.style.cssText = 'position:fixed;inset:0;overflow:auto;background:#f3ead6;color:#2b2118;font:15px/1.6 "Microsoft YaHei",sans-serif;padding:24px 28px;z-index:9';
box.innerHTML = `<h2 style="margin:0 0 12px">自动回归测试：${pass}/${results.length} 通过</h2>` +
  results.map(r => `<div style="color:${r.ok ? '#2d6a3e' : '#b23a2e'}">${r.ok ? '✔' : '✘'} ${r.name}${r.detail ? `　<span style="color:#6b5f50">${r.detail}</span>` : ''}</div>`).join('');
document.body.appendChild(box);
window.__testResults = { pass, total: results.length, results };
console.log(`[测试] ${pass}/${results.length} 通过`, results);
})();
