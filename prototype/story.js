// 画里山城 · 第一章剧本数据（与项目根目录的「剧情大纲.md」保持一致）
// 改台词只改这里。who 为空 = 旁白；'@hero' = 当前选的守画人，text 按角色 id 给不同的话。
window.STORY = {
  // 序章：墨爷的画室。scene 是给画面用的分镜编号（越往后，墨渗得越多）
  prologue: [
    { bg: 'studio', img: 'story/prologue_1', scene: 0, who: '', text: '綦江，下雨的夜里。墨爷的画室还亮着一盏灯。' },
    { bg: 'studio', img: 'story/prologue_1', scene: 1, who: '墨爷', text: '这块版……刻了四十年，还是刻不完。' },
    { bg: 'studio', img: 'story/prologue_2', scene: 2, who: '', text: '他把刻刀往版上一插。木版"咔"地裂开一道缝。' },
    { bg: 'studio', img: 'story/prologue_2', scene: 3, who: '', text: '黑得发亮的墨从缝里渗出来，顺着桌腿，爬上了墙上的《山城百景图》。' },
    { bg: 'studio', img: 'story/prologue_3', scene: 4, who: '墨爷', text: '不好……画在褪色！' },
    { bg: 'studio', img: 'story/prologue_3', scene: 5, who: '', text: '墨爷一口气没提上来，倒在了桌边。' },
    { bg: 'studio', img: 'story/prologue_4', scene: 5, who: '@hero', text: {
      yaomei: '墨爷！……我晓得了，你教过我，画里的东西，要用针脚缝回去。',
      bangbang: '墨爷你莫吓我！……画里那些人我都认得，我去把他们挑回来！',
      bianlian: '老哥哥，你这出戏还没唱完，可不能下台。等到，我进去会会它。',
      default: '墨爷！……我这就进画里去。',
    } },
    { bg: 'studio', img: 'story/prologue_4', scene: 6, who: '墨爷（虚弱）', text: '浊墨……先吃的是《赶场图》。进去，把颜色……找回来。' },
  ],

  // 关内对话：在对应时机以字幕出现
  beats: {
    start:    { who: '墨爷（画外）', text: '灰的地方就是浊墨吃过的。打散它，颜色自己会回来。' },
    restore0: { who: '汤摊老板', text: '巴适得板！守画人，等你打完回来喝汤！' },
    enter1:   { who: '墨爷（画外）', text: '梯坎被吃断了，上不去。先把底下的收拾干净。' },
    restore1: { who: '挑夫路人', text: '梯坎回来咯！这下脚杆有地方放了。' },
    dragon:   { who: '舞龙的老汉', text: '雄起！龙灯借你，舞起来它自己晓得咬哪个。' },
    restore2: { who: '墨爷（画外）', text: '龙灯一亮，后头的暗巷就看得清了。' },
    fan:      { who: '扇摊大姐', text: '荣昌的扇子，扇得动风就扇得动邪。拿去！' },
    restore3: { who: '墨爷（画外）', text: '万年台……张不管还在台上。小心，他认不得人了。' },
  },

  // 张不管
  boss: {
    enter:     '你娃莫跑！哪个准你上我的台？',
    phase:     '好好好，我投降，我投降……（才怪！）',
    exposed:   '哎哟，这都被你看穿了？',
    reflected: '我的扇子咋个打我自己？！',
    defeat:    '哎……我这是唱到哪儿了？',
  },

  // 尾声：谢幕，然后是章节地图
  epilogue: [
    { bg: 'stage', img: 'story/epilogue_1', who: '张不管', text: '多谢你，守画人。三十年了，台下头一回这么热闹。' },
    { bg: 'stage', img: 'story/epilogue_1', who: '', text: '锣鼓响起来，赶场的人围到台前。整幅《赶场图》亮了。' },
    { bg: 'stage', img: 'story/epilogue_1', who: '墨爷（画外）', text: '好……好。这一幅，回来了。' },
    { bg: 'stage', img: 'story/epilogue_1', who: '墨爷（画外）', text: '可浊墨跑得快，已经钻进《龙灯会》了。' },
    { bg: 'map', who: '', text: '第一章「赶场图」完。' },
  ],

  // 章节地图
  chapters: [
    { name: '序章', title: '墨爷的画室', place: '綦江', done: true },
    { name: '第一章', title: '赶场图', place: '山城赶场', done: true },
    { name: '第二章', title: '龙灯会', place: '铜梁', done: false },
    { name: '第三章', title: '扇子街', place: '荣昌', done: false },
    { name: '终章', title: '江雾图', place: '朝天门', done: false },
  ],
};
