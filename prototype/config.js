// 画里山城 · 灰盒原型参数（对应设计方案 v4.0 第02、03、04章）
// 所有可调数值集中在这里：试玩后只改这个文件。
// 长度单位：1 单位 ≈ 角色身高的 0.55 倍（角色站立高约 1.8 单位）。时间单位：秒。
window.CONFIG = {
  unit: 48,            // 1 单位对应的像素（逻辑分辨率 960×540）
  gravity: 30,

  player: {
    hp: 100, speed: 5, jumpHeight: 2.2, w: 0.8, h: 1.8,
    invuln: 0.8,          // 受伤后无敌
    coyote: 0.10,         // 离地跳跃容错
    jumpBuffer: 0.12,     // 输入缓存
    switchInterval: 0.2,  // 切换武器间隔
    stepUp: 0.55,         // 自动迈上的台阶高度
    fallDamage: 10,
  },

  mutton: { heal: 30 },

  weapons: {
    needle: {
      name: '蜀绣飞针', slot: 1, interval: 0.70, count: 3, burstGap: 0.07,
      dmg: 6, range: 7, speed: 20,
      thread: { rounds: 6, reload: 1.5 },   // 穿针引线：打 6 轮后换线 1.5 秒（切走也照样在换）
      skill: { name: '晕针穿刺', dmg: 18, cd: 5, stun: 0.6, range: 9 },
    },
    // 龙绕身：小龙绕身一圈，前后都打、向外弹开；绕身期间（active）挡下谷粒和飞扇
    dragon: {
      name: '铜梁龙舞', slot: 2, interval: 0.80, dmg: 18, radius: 2.6, knockback: 1.2, active: 0.3,
      skill: { name: '游龙', dmg: 15, cd: 6, dist: 4, time: 0.22 },   // 向前穿身冲刺，途中无敌
    },
    // 扇风：向前扇出一阵风，把小怪扇飞 push 单位，打断冲锋/抛射，吹散谷粒，把飞扇扇回去
    fan: {
      name: '荣昌折扇', slot: 3, interval: 0.60, dmg: 8, range: 3.5, arc: 100, push: 3.0, pushTime: 0.25,
      skill: { name: '扇面迷阵', cd: 8, duration: 3, radius: 2, slow: 0.4, bossSlow: 0.2 },
    },
  },

  // 开局可选的守画人。只写与默认值不同的地方；正式美术建议共用一套身体动作，只换头部、服装色和道具
  characters: [
    { id: 'yaomei', name: '幺妹', title: '蜀绣绣娘', color: '#b03a48', look: 'bun',
      desc: ['飞针专精：线量 8，换线只要 1 秒', '晕针穿刺冷却 -1 秒', '生命 90，身子单薄'],
      hp: 90, thread: 8, reload: 1.0, pierceCdMinus: 1 },
    { id: 'bangbang', name: '棒棒', title: '山城挑夫', color: '#3f5f7a', look: 'pole',
      desc: ['生命 130，挨打几乎不踉跄', '龙舞伤害 +25%', '挑着扁担，走得稍慢'],
      hp: 130, speedMul: 0.9, hurtStunMul: 0.3, dragonDmgMul: 1.25 },
    { id: 'bianlian', name: '变脸匠', title: '川剧艺人', color: '#6b2f6b', look: 'mask',
      desc: ['一换武器就「变脸」：0.4 秒无敌', '变脸后下一击伤害 +50%', '换武器几乎没有间隔'],
      hp: 100, switchInterval: 0.08, faceChange: { invuln: 0.4, mul: 1.5 } },
  ],

  enemies: {
    chicken: { name: '秧鸡妖', hp: 40, dmg: 12, w: 0.9, h: 1.0, walk: 2.2, aggro: 6,
      tele: 0.65, charge: 0.45, chargeSpeed: 13, recover: 0.9 },
    grain: { name: '谷穗怪', hp: 30, dmg: 8, w: 0.7, h: 1.6, walk: 1.6, keepMin: 5, keepMax: 8,
      tele: 0.8, period: 2.5, flight: 1.0, grainGravity: 20, throwRange: 11 },
  },

  boss: {
    name: '张不管', hp: 600, w: 1.3, h: 2.4, walk: 2.5,
    moveDmgMul: 0.5,      // 出招过程中受伤减半，破绽期全额
    idle: 0.6, phase2At: 0.5, phaseTime: 0.8, enterTime: 1.5,
    // 回旋扇：飞到戏台边缘后停住闪烁 hover 秒，再以较慢的 returnSpeed 飞回（首次试玩被回程打中最多）
    // reflect*：折扇扇风把飞扇扇回去打中张不管（以扇破扇）；龙绕身只能挡下，不会扇回
    fan:    { tele: 0.8, dmg: 15, speed: 10, recover: 1.2, hover: 0.5, returnSpeed: 7,
              reflectSpeed: 14, reflectDmg: 20, reflectStun: 2.2 },
    // 矮子步：冲撞时身体压到 45%（约 1.1 高），起跳就能越过（跳跃高度 2.2）
    charge: { tele: 0.7, dmg: 15, speed: 13, maxDist: 12, recover: 1.5, crouch: 0.45 },
    // 假投降突袭：冲 6 单位，看到「投降」后退开就能躲
    // exposed：示弱时被折扇风刃打中 = 当场拆穿，取消突袭并露出更长破绽
    fake:   { tele: 1.2, dmg: 20, speed: 12, dur: 0.5, recover: 1.5, exposed: 2.6 },
    phaseMutton: true,    // 转二阶段时戏台边送来一碗羊肉
    showWeakOutline: true, // 灰盒期用黄框标出破绽，正式美术换成动作表现
  },

  restore: { anim: 0.8 },
  assist: { afterFails: 2, removeEnemies: 1, extraTele: 0.2, bossHpMul: 0.75 },

  // ---------------- 第一关：赶场图 ----------------
  level: {
    width: 120,
    // 静态地形：x/y 为左下角，y 向上。oneWay = 只能从上方踩住的平台
    solids: [
      { x: -6, y: -5, w: 52, h: 5 },        // 低处地面（顶面 y=0），x -6~46
      { x: 46, y: -5, w: 80, h: 7.5 },      // 高处地面（顶面 y=2.5），x 46~126
      { x: 5, y: 0, w: 1.2, h: 0.8 },       // 开场矮台，教跳跃
      { x: 59.5, y: 3.9, w: 2.2, h: 0.3, oneWay: true }, // 龙灯街摊棚，可站上躲冲锋
      { x: -7, y: -5, w: 1, h: 40 },        // 世界左墙
      { x: 120, y: -5, w: 1, h: 40 },       // 世界右墙
    ],
    // 石阶：区域②复色后出现
    stairs: [
      { x: 42, y: 0, w: 1, h: 0.5 }, { x: 43, y: 0, w: 1, h: 1.0 },
      { x: 44, y: 0, w: 1, h: 1.5 }, { x: 45, y: 0, w: 1, h: 2.0 },
    ],
    darkRange: [68.5, 95],   // 龙灯未亮前的暗巷
    pickups: [
      { type: 'dragon', x: 50.5, y: 2.5 },
      { type: 'fan', x: 69.5, y: 2.5 },
    ],
    // 5 个修复区域。x0/x1 = 战区左右边界，trigger = 进入后开战
    areas: [
      { name: '羊肉摊', colorName: '朱红', color: '#c8402f', x0: 9, x1: 24, trigger: 10.5, ground: 0,
        reward: 'shop', rewardText: '摊位开张：后面的战区出口会出现羊肉',
        waves: [[{ t: 'chicken', x: 21 }], [{ t: 'chicken', x: 22.5 }, { t: 'chicken', x: 20 }]] },
      { name: '青石梯坎', colorName: '青灰', color: '#4f7f8f', x0: 26, x1: 46, trigger: 28, ground: 0,
        reward: 'stairs', rewardText: '石阶成形：可以走上高处了',
        waves: [[{ t: 'grain', x: 41 }], [{ t: 'chicken', x: 44 }, { t: 'grain', x: 43.5 }, { t: 'chicken', x: 31 }]] },
      { name: '龙灯街', colorName: '金黄', color: '#e0a526', x0: 54, x1: 66, trigger: 55.5, ground: 2.5,
        reward: 'light', rewardText: '龙灯亮起：照亮了通往戏台的暗巷',
        waves: [[{ t: 'chicken', x: 63.5 }, { t: 'chicken', x: 65 }], [{ t: 'chicken', x: 55 }, { t: 'chicken', x: 65 }]] },
      { name: '戏台前场', colorName: '翠绿', color: '#3e9b5a', x0: 72, x1: 92, trigger: 74, ground: 2.5,
        reward: 'curtain', rewardText: '帷幕拉开：检查点与补给出现，戏台开放',
        waves: [[{ t: 'chicken', x: 88 }], [{ t: 'chicken', x: 90 }, { t: 'grain', x: 86 }, { t: 'grain', x: 91 }]] },
      { name: '戏台', colorName: '全彩', color: '#b23a8e', x0: 96, x1: 116, trigger: 98, ground: 2.5,
        reward: 'boss', rewardText: '', boss: { x: 112 } },
    ],
    muttonSpots: { afterArea2: 48, afterArea4: 94 },
  },

  lines: {
    mutton: '巴适得板！',
    lowHp: '遭不住咯……',
    dragon: '雄起！',
    boss: '你娃莫跑！',
    end: '画归色了，赶场去咯！',
  },
};
