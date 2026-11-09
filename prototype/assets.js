// 图片素材加载：按 assets/index.js 的清单加载 WebP。
// 有图就用图，图还没到或缺图就由 art.js 用代码画，所以加载过程中游戏照样能玩。
window.IMG = (() => {
  'use strict';
  const list = window.ASSET_LIST || {};
  const cache = {}, keys = Object.keys(list);
  let done = 0, failed = 0;
  const off = new URLSearchParams(location.search).has('noimg');   // ?noimg：只用代码画（对比、排查用）
  // 最多同时加载 6 张（一次发一百多个请求，服务器或弱网会拒绝），失败的自动重试 3 次
  // 背景层和第一区的东西排在前面，先看到的先到
  const order = keys.slice().sort((a, b) => prio(a) - prio(b));
  function prio(k) { return k.startsWith('bg/') ? 0 : k.startsWith('tile/') || k.startsWith('hero/') || k.startsWith('ui/') ? 1 : k.startsWith('story/') ? 3 : 2; }
  let next = 0, active = 0;
  function pump() {
    while (active < 6 && next < order.length) load(order[next++], 0);
  }
  function load(k, tries) {
    active++;
    const img = new Image();
    img.onload = () => { active--; done++; cache[k] = img; pump(); };
    img.onerror = () => {
      active--;
      if (tries < 3) setTimeout(() => { load(k, tries + 1); }, 300 * (tries + 1));
      else { done++; failed++; console.warn('[素材] 加载失败：', list[k].src); }
      pump();
    };
    img.src = list[k].src + (tries ? '?r=' + tries : '');
  }
  if (!off) pump();
  // 预处理过的版本（压暗、上色），按需生成一次后缓存
  const derived = {};
  function variant(key, tag, fn) {
    const id = key + '|' + tag;
    if (derived[id]) return derived[id];
    const img = cache[key]; if (!img) return null;
    const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height;
    const c = cv.getContext('2d'); c.drawImage(img, 0, 0); fn(c, cv.width, cv.height);
    return (derived[id] = cv);
  }
  return {
    get: (k) => cache[k] || null,
    info: (k) => list[k] || null,
    has: (k) => !!cache[k],
    progress: () => (off || !keys.length ? 1 : done / keys.length),
    failed: () => failed,
    // 压暗成剪影（前景枝叶、看戏人群）：保留轮廓，颜色压到接近黑
    dark(k, amount = 0.82, rgb = '6,9,12') {
      return variant(k, 'dark' + amount + rgb, (c, w, h) => { c.globalCompositeOperation = 'source-atop'; c.fillStyle = `rgba(${rgb},${amount})`; c.fillRect(0, 0, w, h); });
    },
    // 给白色素材上色（彩旗）
    tint(k, color) {
      return variant(k, 'tint' + color, (c, w, h) => { c.globalCompositeOperation = 'multiply'; c.fillStyle = color; c.fillRect(0, 0, w, h); c.globalCompositeOperation = 'destination-in'; c.drawImage(cache[k], 0, 0); });
    },
  };
})();
