/**
 * Themed review catalog.
 *
 * Once in a while a quiz session is replaced by a "themed review" — the MCQ words are
 * drawn from one semantic cluster instead of the whole pool, and the session gets its
 * own colour wash and banner. The point is unpredictability (see Hooked / variable
 * reward): most sessions look normal, so the themed ones land as a surprise.
 *
 * Why a curated map instead of filtering on `Concept.category`:
 * the `category` field was designed to drive quiz distractor selection, not themes, so
 * its buckets are the wrong shape here. `grammar` is a 65-word grab bag holding
 * particles, conjunctions and prepositions together, while `direction` mixes bare
 * directionals (左) with full locative phrases (在左边). Good themes cut across
 * categories (At School wants 学校 + 老师 + 书 + 写, which live in place/person/
 * object/communication) and sometimes split one. Same reasoning as SEMANTIC_CATEGORIES
 * overriding VOCAB_CATEGORY_TO_SYNTAX in utils/syntax.ts.
 *
 * Words are hanzi and must exist in the vocabulary; `validateReviewThemes()` warns on
 * typos at module load. A theme only runs when enough of its words are in the user's
 * known pool — see `viableThemes` in utils/reviewTheme.ts.
 */

export interface ReviewTheme {
  id: string;
  name: string;
  emoji: string;
  /** One-line description shown on the session intro. */
  blurb: string;
  /** Colour wash for the session background. Any CSS colour; mixed over base-100. */
  tint: string;
  /** Hanzi that belong to this theme. */
  words: string[];
}

export const REVIEW_THEMES: ReviewTheme[] = [
  {
    id: 'connectors',
    name: 'Cause & Effect',
    emoji: '🔗',
    blurb: 'The words that glue two clauses together',
    tint: 'oklch(65% 0.19 25)',
    words: ['因为', '所以', '如果', '虽然', '而且', '但是', '可是', '或者', '还是'],
  },
  {
    id: 'from_to',
    name: 'From & To',
    emoji: '🧭',
    blurb: 'Where something starts, where it ends up',
    tint: 'oklch(70% 0.16 220)',
    words: ['从', '到', '往', '向', '朝', '离', '自', '经', '经由', '由'],
  },
  {
    id: 'particles',
    name: 'Little Words',
    emoji: '🎏',
    blurb: 'Particles that carry all the tone and timing',
    tint: 'oklch(72% 0.15 300)',
    words: ['的', '了', '着', '过', '吗', '呢', '吧', '啊', '呀', '哇', '啦', '嘛', '呐', '地', '得'],
  },
  {
    id: 'positions',
    name: 'Where Things Are',
    emoji: '📍',
    blurb: 'Above, below, beside, across',
    tint: 'oklch(70% 0.15 165)',
    words: [
      '上', '下', '里', '外', '前', '后', '中', '东', '西', '左', '右',
      '上面', '下面', '里面', '外面', '前面', '后面', '左边', '右边', '旁边', '对面', '中间',
      '在上面', '在下面', '在里面', '在外面', '在前面', '在后面', '在左边', '在右边', '在旁边', '在对面',
    ],
  },
  {
    id: 'for_whom',
    name: 'For & With',
    emoji: '🤝',
    blurb: 'Who an action is aimed at, or done on behalf of',
    tint: 'oklch(72% 0.15 90)',
    words: ['为', '为了', '替', '帮', '给', '对', '跟', '和', '被', '把'],
  },
  {
    id: 'according_to',
    name: 'According To',
    emoji: '📐',
    blurb: 'Formal prepositions for citing a basis or a topic',
    tint: 'oklch(62% 0.12 265)',
    words: ['按', '照', '根据', '依据', '本着', '关于', '对于', '至于', '以', '因', '由'],
  },
  {
    id: 'everyday_verbs',
    name: 'Everyday Verbs',
    emoji: '🛠️',
    blurb: 'The things you do all day',
    tint: 'oklch(70% 0.18 45)',
    words: [
      '放', '看', '用', '买', '拿', '找', '关', '做', '卖', '吃', '喝',
      '来', '去', '开', '叫', '听', '说', '想', '要', '住', '教', '读', '写', '问',
    ],
  },
  {
    id: 'morphemes',
    name: 'Building Blocks',
    emoji: '🧱',
    blurb: 'Single characters that live inside bigger words',
    tint: 'oklch(60% 0.08 60)',
    words: [
      '员', '师', '者', '生', '学家', '教师', '城', '村', '厂', '室', '店', '馆',
      '国', '口', '体', '机', '物', '法', '学', '学科', '文', '形',
    ],
  },
  {
    id: 'calendar',
    name: 'Clock & Calendar',
    emoji: '📅',
    blurb: 'Telling the time and naming the day',
    tint: 'oklch(72% 0.16 250)',
    words: [
      '今天', '明天', '昨天', '现在', '早上', '上午', '中午', '下午', '晚上', '凌晨',
      '今年', '年', '月', '星期', '号', '日', '日历', '时候', '点', '分', '分钟', '岁',
      '几点', '星期几', '今天几号', '多大', '你几岁',
    ],
  },
  {
    id: 'months',
    name: 'Twelve Months',
    emoji: '🗓️',
    blurb: 'January through December',
    tint: 'oklch(74% 0.14 200)',
    words: [
      '月', '一月', '二月', '三月', '四月', '五月', '六月',
      '七月', '八月', '九月', '十月', '十一月', '十二月',
    ],
  },
  {
    id: 'weekdays',
    name: 'Days of the Week',
    emoji: '📆',
    blurb: 'Monday through Sunday',
    tint: 'oklch(74% 0.13 155)',
    words: ['星期', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六', '星期天', '星期几'],
  },
  {
    id: 'cities',
    name: 'On the Map',
    emoji: '🗺️',
    blurb: 'City names, most of them secretly descriptive',
    tint: 'oklch(68% 0.16 190)',
    words: [
      '北京', '上海', '香港', '南京', '东京', '伦敦', '巴黎',
      '纽约', '洛杉矶', '波士顿', '巴尔的摩', '勒克瑙', '浦那', '旧金山',
    ],
  },
  {
    id: 'people',
    name: 'People Around Me',
    emoji: '👥',
    blurb: 'Family, friends, and the people you meet',
    tint: 'oklch(70% 0.17 350)',
    words: [
      '人', '学生', '老师', '同学', '朋友', '医生', '小姐', '先生', '女',
      '儿', '女儿', '儿子', '妈妈', '爸爸', '家', '教师', '我的朋友',
    ],
  },
  {
    id: 'food',
    name: 'Food & Drink',
    emoji: '🍜',
    blurb: 'Eating, drinking, and what goes in the cup',
    tint: 'oklch(74% 0.16 70)',
    words: [
      '吃', '喝', '菜', '中国菜', '米饭', '饭', '茶', '水', '水果', '苹果',
      '杯子', '好吃', '喝茶', '喝水', '吃饭', '喜欢吃',
    ],
  },
  {
    id: 'school',
    name: 'At School',
    emoji: '🎒',
    blurb: 'Classrooms, teachers, reading and writing',
    tint: 'oklch(68% 0.15 130)',
    words: [
      '学校', '大学', '老师', '教师', '学生', '生', '同学', '学习', '习',
      '书', '汉字', '字', '汉语', '写', '读', '问', '教', '学', '学科', '去学校', '会说汉语',
    ],
  },
  {
    id: 'travel',
    name: 'Getting Around',
    emoji: '🚕',
    blurb: 'Coming, going, and how you get there',
    tint: 'oklch(72% 0.17 240)',
    words: [
      '去', '来', '回', '回来', '出', '飞', '坐', '坐下', '开', '开车',
      '坐飞机', '坐出租车', '一起去', '飞机', '出租车', '车',
    ],
  },
  {
    id: 'questions',
    name: 'Question Words',
    emoji: '❓',
    blurb: 'Everything you need to ask something',
    tint: 'oklch(70% 0.19 320)',
    words: [
      '什么', '哪', '哪儿', '几', '怎么', '怎么样', '多少', '谁', '多大',
      '几点', '星期几', '今天几号', '怎么说', '怎么写', '哪国人',
      '吗', '呢', '有没有', '在哪儿', '请问',
    ],
  },
  {
    id: 'numbers',
    name: 'Numbers & Money',
    emoji: '🔢',
    blurb: 'Counting, prices, and measure words',
    tint: 'oklch(70% 0.15 110)',
    words: [
      '零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '百',
      '两', '块', '钱', '多少钱', '多少', '个', '本',
    ],
  },
  {
    id: 'feelings',
    name: 'Feelings',
    emoji: '💗',
    blurb: 'Liking, loving, and how you are doing',
    tint: 'oklch(72% 0.17 10)',
    words: [
      '好', '很好', '我很好', '想', '爱', '我爱你', '喜欢', '漂亮', '很漂亮',
      '高兴', '很高兴', '认识你很高兴',
    ],
  },
  {
    id: 'weather_nature',
    name: 'Sky & Weather',
    emoji: '🌤️',
    blurb: 'Rain, heat, cold, and what is outside',
    tint: 'oklch(76% 0.12 215)',
    words: ['天气', '天气怎么样', '下雨', '冷', '太冷了', '热', '太热了', '天', '云', '山', '气'],
  },
  {
    id: 'home_objects',
    name: 'Things Around Me',
    emoji: '🪑',
    blurb: 'Furniture, screens, clothes, and body parts',
    tint: 'oklch(66% 0.1 50)',
    words: [
      '书', '椅子', '桌子', '电脑', '电视', '电影', '东西', '衣服', '杯子',
      '车', '出租车', '飞机', '机', '物', '手', '心', '口', '目', '身体', '体',
    ],
  },
  {
    id: 'greetings',
    name: 'Being Polite',
    emoji: '🙏',
    blurb: 'Hellos, thank-yous, and apologies',
    tint: 'oklch(74% 0.15 340)',
    words: ['你好吗', '大家好', '谢谢', '不客气', '对不起', '没关系', '再见', '请', '请问', '喂'],
  },
  {
    id: 'pronouns',
    name: "Who's Who",
    emoji: '🫂',
    blurb: 'I, you, they — and this versus that',
    tint: 'oklch(68% 0.14 280)',
    words: [
      '我', '你', '您', '他', '她', '我们', '你们', '他们', '谁', '他是谁',
      '这', '那', '这儿', '那儿', '这些', '这个', '那个',
    ],
  },
  {
    id: 'size',
    name: 'Big & Small',
    emoji: '📏',
    blurb: 'Size, quantity, and degree',
    tint: 'oklch(70% 0.13 145)',
    words: ['大', '小', '高', '矮', '多', '少', '些', '一点儿', '多少'],
  },
];

export const REVIEW_THEMES_BY_ID: Record<string, ReviewTheme> = Object.fromEntries(
  REVIEW_THEMES.map((t) => [t.id, t]),
);

/**
 * Warn (in dev) about theme words that aren't in the vocabulary at all — a typo'd
 * hanzi is otherwise invisible: it just silently never matches, quietly shrinking
 * the theme below its viability threshold. Mirrors validateEnglishPatterns() in
 * utils/syntax.ts.
 */
export function validateReviewThemes(knownVocabWords: Iterable<string>): string[] {
  const vocab = new Set(knownVocabWords);
  const problems: string[] = [];
  for (const theme of REVIEW_THEMES) {
    for (const word of theme.words) {
      if (!vocab.has(word)) problems.push(`${theme.id}: "${word}" is not in the vocabulary`);
    }
    const dupes = theme.words.filter((w, i) => theme.words.indexOf(w) !== i);
    if (dupes.length > 0) problems.push(`${theme.id}: duplicate words ${dupes.join(', ')}`);
  }
  return problems;
}
