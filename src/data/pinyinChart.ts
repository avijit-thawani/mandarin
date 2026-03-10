// Complete Mandarin Pinyin Chart data
// All valid pinyin syllable combinations organized for chart display and practice

export const INITIALS = [
  '', 'b', 'p', 'm', 'f', 'd', 't', 'n', 'l',
  'g', 'k', 'h', 'j', 'q', 'x', 'z', 'c', 's', 'zh', 'ch', 'sh', 'r',
] as const;

export const INITIAL_LABELS = [
  '∅', 'b', 'p', 'm', 'f', 'd', 't', 'n', 'l',
  'g', 'k', 'h', 'j', 'q', 'x', 'z', 'c', 's', 'zh', 'ch', 'sh', 'r',
] as const;

export interface ChartRow {
  final: string;
  label: string;
}

export const CHART_ROWS: ChartRow[] = [
  { final: '-i', label: 'i' },
  { final: 'a', label: 'a' },
  { final: 'ai', label: 'ai' },
  { final: 'an', label: 'an' },
  { final: 'ang', label: 'ang' },
  { final: 'ao', label: 'ao' },
  { final: 'e', label: 'e' },
  { final: 'ei', label: 'ei' },
  { final: 'en', label: 'en' },
  { final: 'eng', label: 'eng' },
  { final: 'er', label: 'er' },
  { final: 'i', label: 'i' },
  { final: 'ia', label: 'ia' },
  { final: 'ian', label: 'ian' },
  { final: 'iang', label: 'iang' },
  { final: 'iao', label: 'iao' },
  { final: 'ie', label: 'ie' },
  { final: 'in', label: 'in' },
  { final: 'ing', label: 'ing' },
  { final: 'iong', label: 'iong' },
  { final: 'iu', label: 'iou' },
  { final: 'o', label: 'o' },
  { final: 'ong', label: 'ong' },
  { final: 'ou', label: 'ou' },
  { final: 'u', label: 'u' },
  { final: 'ua', label: 'ua' },
  { final: 'uai', label: 'uai' },
  { final: 'uan', label: 'uan' },
  { final: 'uang', label: 'uang' },
  { final: 'ui', label: 'uei' },
  { final: 'un', label: 'uen' },
  { final: 'ueng', label: 'ueng' },
  { final: 'uo', label: 'uo' },
  { final: 'ü', label: 'ü' },
  { final: 'üan', label: 'üan' },
  { final: 'üe', label: 'üe' },
  { final: 'ün', label: 'ün' },
];

// Which initials are valid for each final
const VALID_INITIALS: Record<string, string[]> = {
  '-i':   ['z', 'c', 's', 'zh', 'ch', 'sh', 'r'],
  'a':    ['', 'b', 'p', 'm', 'f', 'd', 't', 'n', 'l', 'g', 'k', 'h', 'z', 'c', 's', 'zh', 'ch', 'sh'],
  'ai':   ['', 'b', 'p', 'm', 'd', 't', 'n', 'l', 'g', 'k', 'h', 'z', 'c', 's', 'zh', 'ch', 'sh'],
  'an':   ['', 'b', 'p', 'm', 'f', 'd', 't', 'n', 'l', 'g', 'k', 'h', 'z', 'c', 's', 'zh', 'ch', 'sh', 'r'],
  'ang':  ['', 'b', 'p', 'm', 'f', 'd', 't', 'n', 'l', 'g', 'k', 'h', 'z', 'c', 's', 'zh', 'ch', 'sh', 'r'],
  'ao':   ['', 'b', 'p', 'm', 'd', 't', 'n', 'l', 'g', 'k', 'h', 'z', 'c', 's', 'zh', 'ch', 'sh', 'r'],
  'e':    ['', 'm', 'd', 't', 'n', 'l', 'g', 'k', 'h', 'z', 'c', 's', 'zh', 'ch', 'sh', 'r'],
  'ei':   ['', 'b', 'p', 'm', 'f', 'd', 'n', 'l', 'g', 'h', 'z', 'zh', 'sh'],
  'en':   ['', 'b', 'p', 'm', 'f', 'n', 'g', 'k', 'h', 'z', 'c', 's', 'zh', 'ch', 'sh', 'r'],
  'eng':  ['', 'b', 'p', 'm', 'f', 'd', 't', 'n', 'l', 'g', 'k', 'h', 'z', 'c', 's', 'zh', 'ch', 'sh', 'r'],
  'er':   [''],
  'i':    ['', 'b', 'p', 'm', 'd', 't', 'n', 'l', 'j', 'q', 'x'],
  'ia':   ['', 'd', 'l', 'j', 'q', 'x'],
  'ian':  ['', 'b', 'p', 'm', 'd', 't', 'n', 'l', 'j', 'q', 'x'],
  'iang': ['', 'n', 'l', 'j', 'q', 'x'],
  'iao':  ['', 'b', 'p', 'm', 'd', 't', 'n', 'l', 'j', 'q', 'x'],
  'ie':   ['', 'b', 'p', 'm', 'd', 't', 'n', 'l', 'j', 'q', 'x'],
  'in':   ['', 'b', 'p', 'm', 'n', 'l', 'j', 'q', 'x'],
  'ing':  ['', 'b', 'p', 'm', 'd', 't', 'n', 'l', 'j', 'q', 'x'],
  'iong': ['', 'j', 'q', 'x'],
  'iu':   ['', 'm', 'd', 'n', 'l', 'j', 'q', 'x'],
  'o':    ['', 'b', 'p', 'm', 'f'],
  'ong':  ['d', 't', 'n', 'l', 'g', 'k', 'h', 'z', 'c', 's', 'zh', 'ch', 'r'],
  'ou':   ['', 'p', 'm', 'f', 'd', 't', 'l', 'g', 'k', 'h', 'z', 'c', 's', 'zh', 'ch', 'sh', 'r'],
  'u':    ['', 'b', 'p', 'm', 'f', 'd', 't', 'n', 'l', 'g', 'k', 'h', 'z', 'c', 's', 'zh', 'ch', 'sh', 'r'],
  'ua':   ['', 'g', 'k', 'h', 'zh', 'sh'],
  'uai':  ['', 'g', 'k', 'h', 'zh', 'ch', 'sh'],
  'uan':  ['', 'd', 't', 'n', 'l', 'g', 'k', 'h', 'z', 'c', 's', 'zh', 'ch', 'sh', 'r'],
  'uang': ['', 'g', 'k', 'h', 'zh', 'ch', 'sh'],
  'ui':   ['', 'd', 't', 'g', 'k', 'h', 'z', 'c', 's', 'zh', 'ch', 'sh', 'r'],
  'un':   ['', 'd', 't', 'l', 'g', 'k', 'h', 'z', 'c', 's', 'zh', 'ch', 'sh', 'r'],
  'ueng': [''],
  'uo':   ['', 'd', 't', 'n', 'l', 'g', 'k', 'h', 'z', 'c', 's', 'zh', 'sh', 'r'],
  'ü':    ['', 'n', 'l', 'j', 'q', 'x'],
  'üan':  ['', 'j', 'q', 'x'],
  'üe':   ['', 'n', 'l', 'j', 'q', 'x'],
  'ün':   ['', 'j', 'q', 'x'],
};

// Standalone forms when no initial is present
const STANDALONE_FORMS: Record<string, string> = {
  'a': 'a', 'ai': 'ai', 'an': 'an', 'ang': 'ang', 'ao': 'ao',
  'e': 'e', 'ei': 'ei', 'en': 'en', 'eng': 'eng', 'er': 'er',
  'o': 'o', 'ou': 'ou',
  'i': 'yi', 'ia': 'ya', 'ian': 'yan', 'iang': 'yang', 'iao': 'yao',
  'ie': 'ye', 'in': 'yin', 'ing': 'ying', 'iong': 'yong', 'iu': 'you',
  'u': 'wu', 'ua': 'wa', 'uai': 'wai', 'uan': 'wan', 'uang': 'wang',
  'ui': 'wei', 'un': 'wen', 'ueng': 'weng', 'uo': 'wo',
  'ü': 'yu', 'üan': 'yuan', 'üe': 'yue', 'ün': 'yun',
};

// Compute the written syllable from initial + final
export function toSyllable(initial: string, final: string): string | null {
  const validInitials = VALID_INITIALS[final];
  if (!validInitials || !validInitials.includes(initial)) return null;

  if (initial === '') {
    return STANDALONE_FORMS[final] ?? null;
  }

  if (final === '-i') return initial + 'i';

  // j/q/x + ü → write as u
  if (['j', 'q', 'x'].includes(initial) && final.startsWith('ü')) {
    return initial + 'u' + final.slice(1);
  }

  return initial + final;
}

// Get all valid syllables as a flat list
export function getAllSyllables(): string[] {
  const syllables: string[] = [];
  for (const row of CHART_ROWS) {
    for (const initial of INITIALS) {
      const s = toSyllable(initial, row.final);
      if (s) syllables.push(s);
    }
  }
  return syllables;
}

// Representative characters for TTS playback (one per syllable)
export const SYLLABLE_CHARS: Record<string, string> = {
  // Standalone
  a: '啊', ai: '爱', an: '安', ang: '昂', ao: '奥',
  e: '鹅', ei: '诶', en: '恩', eng: '鞥', er: '耳',
  o: '噢', ou: '欧',
  yi: '一', ya: '鸭', yan: '烟', yang: '羊', yao: '要',
  ye: '也', yin: '音', ying: '鹰', yong: '用', you: '有',
  wu: '五', wa: '挖', wai: '外', wan: '万', wang: '王',
  wei: '为', wen: '文', weng: '翁', wo: '我',
  yu: '鱼', yuan: '元', yue: '月', yun: '云',
  // b
  ba: '八', bai: '白', ban: '班', bang: '帮', bao: '包',
  bei: '北', ben: '本', beng: '蹦',
  bi: '比', bian: '边', biao: '表', bie: '别', bin: '宾', bing: '冰',
  bo: '波', bu: '不',
  // p
  pa: '怕', pai: '拍', pan: '盘', pang: '胖', pao: '跑',
  pei: '陪', pen: '喷', peng: '朋',
  pi: '皮', pian: '片', piao: '票', pie: '撇', pin: '拼', ping: '平',
  po: '破', pou: '剖', pu: '朴',
  // m
  ma: '妈', mai: '买', man: '慢', mang: '忙', mao: '猫',
  me: '么', mei: '美', men: '门', meng: '梦',
  mi: '米', mian: '面', miao: '秒', mie: '灭', min: '民', ming: '明', miu: '谬',
  mo: '墨', mou: '某', mu: '木',
  // f
  fa: '发', fan: '饭', fang: '方', fei: '飞', fen: '分', feng: '风',
  fo: '佛', fou: '否', fu: '福',
  // d
  da: '大', dai: '带', dan: '但', dang: '当', dao: '到',
  de: '的', dei: '得', deng: '灯',
  di: '地', dia: '嗲', dian: '电', diao: '钓', die: '叠', ding: '丁', diu: '丢',
  dong: '东', dou: '都', du: '读', duan: '断', dui: '对', dun: '吨', duo: '多',
  // t
  ta: '他', tai: '太', tan: '谈', tang: '汤', tao: '套',
  te: '特', teng: '疼',
  ti: '提', tian: '天', tiao: '条', tie: '铁', ting: '听',
  tong: '同', tou: '头', tu: '图', tuan: '团', tui: '推', tun: '吞', tuo: '脱',
  // n
  na: '那', nai: '奶', nan: '南', nang: '囊', nao: '脑',
  ne: '呢', nei: '内', nen: '嫩', neng: '能',
  ni: '你', nian: '年', niang: '娘', niao: '鸟', nie: '捏', nin: '您', ning: '宁', niu: '牛',
  nong: '农', nu: '努', nuan: '暖', nuo: '诺', nü: '女', nüe: '虐',
  // l
  la: '拉', lai: '来', lan: '蓝', lang: '狼', lao: '老',
  le: '了', lei: '雷', leng: '冷',
  li: '里', lia: '俩', lian: '连', liang: '两', liao: '料', lie: '列', lin: '林', ling: '零', liu: '六',
  long: '龙', lou: '楼', lu: '路', luan: '乱', lun: '论', luo: '落', lü: '绿', lüe: '略',
  // g
  ga: '嘎', gai: '改', gan: '干', gang: '刚', gao: '高',
  ge: '个', gei: '给', gen: '根', geng: '更',
  gong: '工', gou: '狗', gu: '古', gua: '挂', guai: '怪', guan: '关', guang: '光', gui: '贵', gun: '滚', guo: '国',
  // k
  ka: '卡', kai: '开', kan: '看', kang: '康', kao: '考',
  ke: '可', ken: '肯', keng: '坑',
  kong: '空', kou: '口', ku: '苦', kua: '夸', kuai: '快', kuan: '宽', kuang: '况', kui: '亏', kun: '困', kuo: '扩',
  // h
  ha: '哈', hai: '海', han: '汉', hang: '行', hao: '好',
  he: '和', hei: '黑', hen: '很', heng: '横',
  hong: '红', hou: '后', hu: '虎', hua: '花', huai: '坏', huan: '换', huang: '黄', hui: '回', hun: '混', huo: '火',
  // j
  ji: '几', jia: '家', jian: '见', jiang: '江', jiao: '叫',
  jie: '姐', jin: '今', jing: '京', jiong: '窘', jiu: '九',
  ju: '举', juan: '卷', jue: '觉', jun: '军',
  // q
  qi: '七', qia: '掐', qian: '千', qiang: '强', qiao: '桥',
  qie: '切', qin: '亲', qing: '请', qiong: '穷', qiu: '秋',
  qu: '去', quan: '全', que: '却', qun: '群',
  // x
  xi: '西', xia: '下', xian: '先', xiang: '想', xiao: '小',
  xie: '写', xin: '心', xing: '星', xiong: '熊', xiu: '修',
  xu: '需', xuan: '选', xue: '学', xun: '寻',
  // z
  zi: '字', za: '扎', zai: '在', zan: '赞', zang: '脏', zao: '早',
  ze: '则', zei: '贼', zen: '怎', zeng: '增',
  zong: '总', zou: '走', zu: '组', zuan: '钻', zui: '最', zun: '尊', zuo: '做',
  // c
  ci: '次', ca: '擦', cai: '才', can: '餐', cang: '藏', cao: '草',
  ce: '策', cen: '参', ceng: '层',
  cong: '从', cou: '凑', cu: '粗', cuan: '窜', cui: '催', cun: '村', cuo: '错',
  // s
  si: '四', sa: '撒', sai: '赛', san: '三', sang: '桑', sao: '扫',
  se: '色', sen: '森', seng: '僧',
  song: '松', sou: '搜', su: '苏', suan: '算', sui: '随', sun: '孙', suo: '所',
  // zh
  zhi: '知', zha: '扎', zhai: '摘', zhan: '站', zhang: '张', zhao: '找',
  zhe: '这', zhei: '这', zhen: '真', zheng: '正',
  zhong: '中', zhou: '州', zhu: '猪', zhua: '抓', zhuai: '拽', zhuan: '转', zhuang: '装', zhui: '追', zhun: '准', zhuo: '桌',
  // ch
  chi: '吃', cha: '茶', chai: '拆', chan: '产', chang: '长', chao: '炒',
  che: '车', chen: '陈', cheng: '成',
  chong: '冲', chou: '抽', chu: '出', chuai: '揣', chuan: '船', chuang: '窗', chui: '吹', chun: '春',
  // sh
  shi: '是', sha: '沙', shai: '晒', shan: '山', shang: '上', shao: '少',
  she: '蛇', shei: '谁', shen: '身', sheng: '生',
  shou: '手', shu: '书', shua: '刷', shuai: '帅', shuan: '拴', shuang: '双', shui: '水', shun: '顺', shuo: '说',
  // r
  ri: '日', ran: '然', rang: '让', rao: '绕',
  re: '热', ren: '人', reng: '仍',
  rong: '容', rou: '肉', ru: '如', ruan: '软', rui: '瑞', run: '润', ruo: '若',
};

// Final group labels for visual separation in the chart
export const FINAL_GROUPS = [
  { label: 'Special', startIndex: 0, endIndex: 0 },
  { label: 'a group', startIndex: 1, endIndex: 5 },
  { label: 'e group', startIndex: 6, endIndex: 10 },
  { label: 'i group', startIndex: 11, endIndex: 20 },
  { label: 'o group', startIndex: 21, endIndex: 23 },
  { label: 'u group', startIndex: 24, endIndex: 32 },
  { label: 'ü group', startIndex: 33, endIndex: 36 },
];
