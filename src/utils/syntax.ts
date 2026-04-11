import type { Concept, Modality } from '../types/vocabulary';
import type { SentenceExercise, SyntaxDirection, ChineseModality, GrammarTemplate } from '../types/syntax';
import type { SyntaxDirectionRatio } from '../types/settings';
import { SYNTAX_DIRECTION_OPTIONS } from '../types/settings';

// Generate unique ID
function generateId(): string {
  return crypto.randomUUID();
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

export function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function getRandomItem<T>(array: T[]): T | undefined {
  if (array.length === 0) return undefined;
  return array[Math.floor(Math.random() * array.length)];
}

// ============================================================================
// SEMANTIC WORD CATEGORIES - Which words make sense together
// ============================================================================

const SEMANTIC_CATEGORIES: Record<string, string[]> = {
  // People (subjects of sentences)
  '我': ['person', 'subject'],
  '你': ['person', 'subject'],
  '他': ['person', 'subject'],
  '她': ['person', 'subject'],
  '我们': ['person', 'subject'],
  '你们': ['person', 'subject'],
  '他们': ['person', 'subject'],
  '爸爸': ['person', 'subject', 'family'],
  '妈妈': ['person', 'subject', 'family'],
  '老师': ['person', 'subject', 'profession'],
  '学生': ['person', 'subject', 'profession'],
  '医生': ['person', 'subject', 'profession'],
  '朋友': ['person', 'subject'],
  '同学': ['person', 'subject'],
  '儿子': ['person', 'subject', 'family'],
  '先生': ['person', 'subject'],
  '小姐': ['person', 'subject'],
  
  // Food (can be eaten)
  '米饭': ['food', 'edible'],
  '苹果': ['food', 'edible', 'fruit'],
  '菜': ['food', 'edible'],
  '水果': ['food', 'edible'],
  '饭': ['food', 'edible'],
  '中国菜': ['food', 'edible'],
  '鱼': ['food', 'edible', 'animal'],
  
  // Drinks (can be drunk)
  '茶': ['drink', 'drinkable'],
  '水': ['drink', 'drinkable'],
  
  // Places (can go to)
  '学校': ['place', 'destination'],
  '家': ['place', 'destination'],
  '医院': ['place', 'destination'],
  '商店': ['place', 'destination'],
  '银行': ['place', 'destination'],
  '饭店': ['place', 'destination'],
  '大学': ['place', 'destination'],
  '中国': ['place', 'destination', 'country'],
  '美国': ['place', 'destination', 'country'],
  
  // Time expressions
  '今天': ['time'],
  '明天': ['time'],
  '昨天': ['time'],
  '上午': ['time'],
  '下午': ['time'],
  '中午': ['time'],
  
  // Readable/Watchable things
  '书': ['readable', 'thing', 'locatable'],
  '电视': ['watchable', 'thing'],
  '电影': ['watchable', 'thing'],
  '汉字': ['readable', 'thing'],
  
  // Vehicles
  '车': ['vehicle', 'thing'],
  '出租车': ['vehicle'],
  '飞机': ['vehicle'],
  
  // Things that can be described
  '天气': ['describable', 'nature'],
  '狗': ['animal', 'describable', 'locatable'],
  '猫': ['animal', 'describable', 'locatable'],
  '山': ['nature', 'describable'],
  
  // Furniture / reference objects for location
  '椅子': ['furniture', 'thing'],
  '桌子': ['furniture', 'thing'],
  '电脑': ['thing', 'locatable'],
  
  // Adjectives for descriptions
  '好': ['quality_adj'],
  '大': ['size_adj'],
  '小': ['size_adj'],
  '高': ['size_adj'],
  '矮': ['size_adj'],
  '冷': ['temperature_adj', 'weather_adj'],
  '热': ['temperature_adj', 'weather_adj'],
  '漂亮': ['appearance_adj'],
  '高兴': ['emotion_adj'],
  
  // Time (extended)
  '早上': ['time'],
  '晚上': ['time'],
  '凌晨': ['time'],
  
  // Months
  '一月': ['time'],
  '二月': ['time'],
  '三月': ['time'],
  '四月': ['time'],
  '五月': ['time'],
  '六月': ['time'],
  '七月': ['time'],
  '八月': ['time'],
  '九月': ['time'],
  '十月': ['time'],
  '十一月': ['time'],
  '十二月': ['time'],

  // Days of the week
  '星期一': ['time', 'time_unit'],
  '星期二': ['time', 'time_unit'],
  '星期三': ['time', 'time_unit'],
  '星期四': ['time', 'time_unit'],
  '星期五': ['time', 'time_unit'],
  '星期六': ['time', 'time_unit'],
  '星期天': ['time', 'time_unit'],

  // Time units (can follow 上个/这个/下个)
  '星期': ['time', 'time_unit'],
  '月': ['time', 'time_unit'],
  '年': ['time', 'time_unit'],
  
  // Languages
  '汉语': ['language'],
};

// Auto-derive syntax slot categories from the vocabulary JSON's SemanticCategory field.
// This ensures words NOT in the hand-curated SEMANTIC_CATEGORIES map can still
// participate in sentence templates (e.g. any pronoun → person/subject slot).
const VOCAB_CATEGORY_TO_SYNTAX: Record<string, string[]> = {
  pronoun:       ['person', 'subject'],
  person:        ['person', 'subject'],
  family:        ['person', 'subject', 'family'],
  food:          ['food', 'edible'],
  animal:        ['animal', 'describable', 'locatable'],
  place:         ['place', 'destination'],
  country:       ['place', 'destination', 'country'],
  time:          ['time'],
  object:        ['thing', 'locatable'],
  nature:        ['describable', 'nature'],
  weather:       ['describable', 'nature'],
  size:          ['size_adj'],
  emotion:       ['emotion_adj'],
};

function getCategories(word: string, vocabCategory?: string): string[] {
  const curated = SEMANTIC_CATEGORIES[word] || [];
  if (!vocabCategory) return curated;
  const derived = VOCAB_CATEGORY_TO_SYNTAX[vocabCategory] || [];
  if (curated.length === 0) return derived;
  // Merge both, deduplicated
  const merged = new Set([...curated, ...derived]);
  return [...merged];
}

// ============================================================================
// SENTENCE-FRIENDLY ENGLISH - Clean translations for sentence building
// ============================================================================
// Dictionary meanings like "(plural) you" or "dish, cuisine" don't work in sentences.
// This provides clean, single-word English that works grammatically.

const SENTENCE_ENGLISH: Record<string, { subject: string; object: string }> = {
  // Pronouns - need different forms for subject vs object position
  '我': { subject: 'I', object: 'me' },
  '你': { subject: 'you', object: 'you' },
  '他': { subject: 'he', object: 'him' },
  '她': { subject: 'she', object: 'her' },
  '我们': { subject: 'we', object: 'us' },
  '你们': { subject: 'you all', object: 'you all' },
  '他们': { subject: 'they', object: 'them' },
  
  // People - same for subject and object
  '爸爸': { subject: 'Dad', object: 'Dad' },
  '妈妈': { subject: 'Mom', object: 'Mom' },
  '老师': { subject: 'the teacher', object: 'the teacher' },
  '学生': { subject: 'the student', object: 'the student' },
  '医生': { subject: 'the doctor', object: 'the doctor' },
  '朋友': { subject: 'my friend', object: 'my friend' },
  '同学': { subject: 'my classmate', object: 'my classmate' },
  '儿子': { subject: 'the son', object: 'the son' },
  '先生': { subject: 'Mr.', object: 'Mr.' },
  '小姐': { subject: 'Miss', object: 'Miss' },
  
  // Food - clean single words
  '米饭': { subject: 'rice', object: 'rice' },
  '苹果': { subject: 'apples', object: 'apples' },
  '菜': { subject: 'vegetables', object: 'vegetables' },
  '水果': { subject: 'fruit', object: 'fruit' },
  '饭': { subject: 'food', object: 'food' },
  '中国菜': { subject: 'Chinese food', object: 'Chinese food' },
  '鱼': { subject: 'fish', object: 'fish' },
  
  // Drinks
  '茶': { subject: 'tea', object: 'tea' },
  '水': { subject: 'water', object: 'water' },
  
  // Places
  '学校': { subject: 'school', object: 'school' },
  '家': { subject: 'home', object: 'home' },
  '医院': { subject: 'the hospital', object: 'the hospital' },
  '商店': { subject: 'the store', object: 'the store' },
  '银行': { subject: 'the bank', object: 'the bank' },
  '饭店': { subject: 'the restaurant', object: 'the restaurant' },
  '大学': { subject: 'university', object: 'university' },
  '中国': { subject: 'China', object: 'China' },
  '美国': { subject: 'America', object: 'America' },
  
  // Time
  '今天': { subject: 'today', object: 'today' },
  '明天': { subject: 'tomorrow', object: 'tomorrow' },
  '昨天': { subject: 'yesterday', object: 'yesterday' },
  '上午': { subject: 'this morning', object: 'this morning' },
  '下午': { subject: 'this afternoon', object: 'this afternoon' },
  '中午': { subject: 'at noon', object: 'at noon' },
  
  // Months
  '一月': { subject: 'in January', object: 'in January' },
  '二月': { subject: 'in February', object: 'in February' },
  '三月': { subject: 'in March', object: 'in March' },
  '四月': { subject: 'in April', object: 'in April' },
  '五月': { subject: 'in May', object: 'in May' },
  '六月': { subject: 'in June', object: 'in June' },
  '七月': { subject: 'in July', object: 'in July' },
  '八月': { subject: 'in August', object: 'in August' },
  '九月': { subject: 'in September', object: 'in September' },
  '十月': { subject: 'in October', object: 'in October' },
  '十一月': { subject: 'in November', object: 'in November' },
  '十二月': { subject: 'in December', object: 'in December' },

  // Days of the week
  '星期一': { subject: 'Monday', object: 'Monday' },
  '星期二': { subject: 'Tuesday', object: 'Tuesday' },
  '星期三': { subject: 'Wednesday', object: 'Wednesday' },
  '星期四': { subject: 'Thursday', object: 'Thursday' },
  '星期五': { subject: 'Friday', object: 'Friday' },
  '星期六': { subject: 'Saturday', object: 'Saturday' },
  '星期天': { subject: 'Sunday', object: 'Sunday' },

  // Time units (for 上个/这个/下个 patterns)
  '星期': { subject: 'week', object: 'week' },
  '月': { subject: 'month', object: 'month' },
  '年': { subject: 'year', object: 'year' },
  
  // Readable/Watchable
  '书': { subject: 'books', object: 'books' },
  '电视': { subject: 'TV', object: 'TV' },
  '电影': { subject: 'movies', object: 'movies' },
  '汉字': { subject: 'Chinese characters', object: 'Chinese characters' },
  
  // Describable
  '天气': { subject: 'The weather', object: 'the weather' },
  '狗': { subject: 'The dog', object: 'the dog' },
  '猫': { subject: 'The cat', object: 'the cat' },
  '山': { subject: 'The mountain', object: 'the mountain' },
  
  // Furniture / locatable things
  '椅子': { subject: 'The chair', object: 'the chair' },
  '桌子': { subject: 'The table', object: 'the table' },
  '电脑': { subject: 'The computer', object: 'the computer' },
  
  // Time (extended)
  '早上': { subject: 'this morning', object: 'this morning' },
  '晚上': { subject: 'tonight', object: 'tonight' },
  '凌晨': { subject: 'in the wee hours', object: 'in the wee hours' },
  
  // Vehicles
  '车': { subject: 'the car', object: 'the car' },
  '出租车': { subject: 'a taxi', object: 'a taxi' },
  '飞机': { subject: 'the plane', object: 'the plane' },
  
  // Languages
  '汉语': { subject: 'Chinese', object: 'Chinese' },
  
  // Adjectives
  '好': { subject: 'good', object: 'good' },
  '大': { subject: 'big', object: 'big' },
  '小': { subject: 'small', object: 'small' },
  '高': { subject: 'tall', object: 'tall' },
  '矮': { subject: 'short', object: 'short' },
  '冷': { subject: 'cold', object: 'cold' },
  '热': { subject: 'hot', object: 'hot' },
  '漂亮': { subject: 'beautiful', object: 'beautiful' },
  '高兴': { subject: 'happy', object: 'happy' },
};

// Get clean English for sentence building
function getSentenceEnglish(word: string, position: 'subject' | 'object' = 'subject', meaning?: string): string {
  const entry = SENTENCE_ENGLISH[word];
  if (entry) {
    return entry[position];
  }
  if (meaning) {
    // Clean dictionary meaning for sentence use: take first sense,
    // strip leading parentheticals like "(singular)", strip "to " verb prefix
    return meaning
      .split(/[,;/]/)[0]
      .trim()
      .replace(/^\(.*?\)\s*/, '')
      .replace(/^to\s+/i, '');
  }
  return word;
}

// ============================================================================
// CURATED SENTENCE TEMPLATES - Meaningful sentences only!
// ============================================================================

interface TemplateSlot {
  role: string;
  categories: string[];
  posFilter?: string[];
}

interface CuratedTemplate {
  id: string;
  name: string;
  description: string;
  explanation: string;
  example: { zh: string; en: string };
  slots: TemplateSlot[];
  fixedWords: Array<{
    word: string;
    pinyin: string;
    meaning: string;
  }>;
  chineseOrder: string[];
  englishPattern: string;
  difficulty: 1 | 2 | 3;
}

const CURATED_TEMPLATES: CuratedTemplate[] = [
  // ========== Level 1: Basic patterns ==========
  {
    id: 'person_eat_food',
    name: 'Someone eats something',
    description: 'Subject + 吃 + Food',
    explanation: 'Basic SVO order: Subject + Verb + Object (same as English)',
    example: { zh: '我吃苹果', en: 'I eat apples' },
    slots: [
      { role: 'subject', categories: ['person'] },
      { role: 'object', categories: ['edible'] },
    ],
    fixedWords: [
      { word: '吃', pinyin: 'chī', meaning: 'eat' },
    ],
    chineseOrder: ['subject', '吃', 'object'],
    englishPattern: '{subject} eats {object}',
    difficulty: 1,
  },
  {
    id: 'person_drink_drink',
    name: 'Someone drinks something',
    description: 'Subject + 喝 + Drink',
    explanation: 'Basic SVO order: Subject + Verb + Object (same as English)',
    example: { zh: '他喝茶', en: 'He drinks tea' },
    slots: [
      { role: 'subject', categories: ['person'] },
      { role: 'object', categories: ['drinkable'] },
    ],
    fixedWords: [
      { word: '喝', pinyin: 'hē', meaning: 'drink' },
    ],
    chineseOrder: ['subject', '喝', 'object'],
    englishPattern: '{subject} drinks {object}',
    difficulty: 1,
  },
  {
    id: 'person_go_place',
    name: 'Someone goes somewhere',
    description: 'Subject + 去 + Place',
    explanation: 'Basic SVO order: Subject + Verb + Destination',
    example: { zh: '我去学校', en: 'I go to school' },
    slots: [
      { role: 'subject', categories: ['person'] },
      { role: 'destination', categories: ['destination'] },
    ],
    fixedWords: [
      { word: '去', pinyin: 'qù', meaning: 'go to' },
    ],
    chineseOrder: ['subject', '去', 'destination'],
    englishPattern: '{subject} goes to {destination}',
    difficulty: 1,
  },
  {
    id: 'person_like_food',
    name: 'Someone likes something',
    description: 'Subject + 喜欢 + Object',
    explanation: 'Express preferences: Subject + 喜欢 + what you like',
    example: { zh: '她喜欢苹果', en: 'She likes apples' },
    slots: [
      { role: 'subject', categories: ['person'] },
      { role: 'object', categories: ['edible', 'drinkable'] },
    ],
    fixedWords: [
      { word: '喜欢', pinyin: 'xǐhuan', meaning: 'like' },
    ],
    chineseOrder: ['subject', '喜欢', 'object'],
    englishPattern: '{subject} likes {object}',
    difficulty: 1,
  },
  {
    id: 'person_at_place',
    name: 'Someone is at a place',
    description: 'Subject + 在 + Place',
    explanation: 'Location: Subject + 在 + where they are',
    example: { zh: '妈妈在家', en: 'Mom is at home' },
    slots: [
      { role: 'subject', categories: ['person'] },
      { role: 'location', categories: ['destination'] },
    ],
    fixedWords: [
      { word: '在', pinyin: 'zài', meaning: 'at/in' },
    ],
    chineseOrder: ['subject', '在', 'location'],
    englishPattern: '{subject} is at {location}',
    difficulty: 1,
  },
  {
    id: 'person_read_book',
    name: 'Someone reads/watches',
    description: 'Subject + 看 + Readable/Watchable',
    explanation: '看 (kàn) means both "read" and "watch"',
    example: { zh: '我看书', en: 'I read books' },
    slots: [
      { role: 'subject', categories: ['person'] },
      { role: 'object', categories: ['readable', 'watchable'] },
    ],
    fixedWords: [
      { word: '看', pinyin: 'kàn', meaning: 'read/watch' },
    ],
    chineseOrder: ['subject', '看', 'object'],
    englishPattern: '{subject} reads {object}',
    difficulty: 1,
  },
  {
    id: 'thing_very_adj',
    name: 'Something is [adjective]',
    description: 'Subject + 很 + Adjective',
    explanation: 'In Chinese, use 很 before adjectives (even when not "very")',
    example: { zh: '天气好', en: 'The weather is good' },
    slots: [
      { role: 'subject', categories: ['describable', 'nature', 'animal', 'person'] },
      { role: 'adjective', categories: ['quality_adj', 'size_adj', 'appearance_adj', 'emotion_adj'] },
    ],
    fixedWords: [
      { word: '很', pinyin: 'hěn', meaning: 'very' },
    ],
    chineseOrder: ['subject', '很', 'adjective'],
    englishPattern: '{subject} is very {adjective}',
    difficulty: 1,
  },
  
  // ========== Level 2: Questions and Negation ==========
  {
    id: 'person_eat_question',
    name: 'Do you eat...?',
    description: 'Yes/No question with 吗',
    explanation: 'Add 吗 at the end to turn a statement into a yes/no question',
    example: { zh: '你吃苹果吗', en: 'Do you eat apples?' },
    slots: [
      { role: 'subject', categories: ['person'] },
      { role: 'object', categories: ['edible'] },
    ],
    fixedWords: [
      { word: '吃', pinyin: 'chī', meaning: 'eat' },
      { word: '吗', pinyin: 'ma', meaning: '(question)' },
    ],
    chineseOrder: ['subject', '吃', 'object', '吗'],
    englishPattern: 'Does {subject} eat {object}?',
    difficulty: 2,
  },
  {
    id: 'person_drink_question',
    name: 'Do you drink...?',
    description: 'Yes/No question with 吗',
    explanation: 'Add 吗 at the end to turn a statement into a yes/no question',
    example: { zh: '他喝茶吗', en: 'Does he drink tea?' },
    slots: [
      { role: 'subject', categories: ['person'] },
      { role: 'object', categories: ['drinkable'] },
    ],
    fixedWords: [
      { word: '喝', pinyin: 'hē', meaning: 'drink' },
      { word: '吗', pinyin: 'ma', meaning: '(question)' },
    ],
    chineseOrder: ['subject', '喝', 'object', '吗'],
    englishPattern: 'Does {subject} drink {object}?',
    difficulty: 2,
  },
  {
    id: 'person_like_question',
    name: 'Do you like...?',
    description: 'Yes/No question with 吗',
    explanation: 'Add 吗 at the end to turn a statement into a yes/no question',
    example: { zh: '你喜欢中国菜吗', en: 'Do you like Chinese food?' },
    slots: [
      { role: 'subject', categories: ['person'] },
      { role: 'object', categories: ['edible', 'drinkable', 'readable', 'watchable'] },
    ],
    fixedWords: [
      { word: '喜欢', pinyin: 'xǐhuan', meaning: 'like' },
      { word: '吗', pinyin: 'ma', meaning: '(question)' },
    ],
    chineseOrder: ['subject', '喜欢', 'object', '吗'],
    englishPattern: 'Does {subject} like {object}?',
    difficulty: 2,
  },
  {
    id: 'person_not_eat',
    name: "Someone doesn't eat",
    description: 'Negation with 不',
    explanation: '不 (bù) goes before the verb to negate present/future actions',
    example: { zh: '我不吃鱼', en: "I don't eat fish" },
    slots: [
      { role: 'subject', categories: ['person'] },
      { role: 'object', categories: ['edible'] },
    ],
    fixedWords: [
      { word: '不', pinyin: 'bù', meaning: 'not' },
      { word: '吃', pinyin: 'chī', meaning: 'eat' },
    ],
    chineseOrder: ['subject', '不', '吃', 'object'],
    englishPattern: "{subject} doesn't eat {object}",
    difficulty: 2,
  },
  {
    id: 'person_not_drink',
    name: "Someone doesn't drink",
    description: 'Negation with 不',
    explanation: '不 (bù) goes before the verb to negate present/future actions',
    example: { zh: '他不喝水', en: "He doesn't drink water" },
    slots: [
      { role: 'subject', categories: ['person'] },
      { role: 'object', categories: ['drinkable'] },
    ],
    fixedWords: [
      { word: '不', pinyin: 'bù', meaning: 'not' },
      { word: '喝', pinyin: 'hē', meaning: 'drink' },
    ],
    chineseOrder: ['subject', '不', '喝', 'object'],
    englishPattern: "{subject} doesn't drink {object}",
    difficulty: 2,
  },
  {
    id: 'person_not_go',
    name: "Someone doesn't go",
    description: 'Negation with 不',
    explanation: '不 (bù) goes before the verb to negate present/future actions',
    example: { zh: '她不去学校', en: "She doesn't go to school" },
    slots: [
      { role: 'subject', categories: ['person'] },
      { role: 'destination', categories: ['destination'] },
    ],
    fixedWords: [
      { word: '不', pinyin: 'bù', meaning: 'not' },
      { word: '去', pinyin: 'qù', meaning: 'go to' },
    ],
    chineseOrder: ['subject', '不', '去', 'destination'],
    englishPattern: "{subject} doesn't go to {destination}",
    difficulty: 2,
  },
  {
    id: 'person_want_eat',
    name: 'Someone wants to eat',
    description: 'Want + Verb with 想',
    explanation: '想 (xiǎng) + verb = want to do something',
    example: { zh: '我想吃苹果', en: 'I want to eat apples' },
    slots: [
      { role: 'subject', categories: ['person'] },
      { role: 'object', categories: ['edible'] },
    ],
    fixedWords: [
      { word: '想', pinyin: 'xiǎng', meaning: 'want to' },
      { word: '吃', pinyin: 'chī', meaning: 'eat' },
    ],
    chineseOrder: ['subject', '想', '吃', 'object'],
    englishPattern: '{subject} wants to eat {object}',
    difficulty: 2,
  },
  {
    id: 'person_want_drink',
    name: 'Someone wants to drink',
    description: 'Want + Verb with 想',
    explanation: '想 (xiǎng) + verb = want to do something',
    example: { zh: '她想喝茶', en: 'She wants to drink tea' },
    slots: [
      { role: 'subject', categories: ['person'] },
      { role: 'object', categories: ['drinkable'] },
    ],
    fixedWords: [
      { word: '想', pinyin: 'xiǎng', meaning: 'want to' },
      { word: '喝', pinyin: 'hē', meaning: 'drink' },
    ],
    chineseOrder: ['subject', '想', '喝', 'object'],
    englishPattern: '{subject} wants to drink {object}',
    difficulty: 2,
  },
  {
    id: 'person_want_go',
    name: 'Someone wants to go',
    description: 'Want + Verb with 想',
    explanation: '想 (xiǎng) + verb = want to do something',
    example: { zh: '他想去中国', en: 'He wants to go to China' },
    slots: [
      { role: 'subject', categories: ['person'] },
      { role: 'destination', categories: ['destination'] },
    ],
    fixedWords: [
      { word: '想', pinyin: 'xiǎng', meaning: 'want to' },
      { word: '去', pinyin: 'qù', meaning: 'go to' },
    ],
    chineseOrder: ['subject', '想', '去', 'destination'],
    englishPattern: '{subject} wants to go to {destination}',
    difficulty: 2,
  },
  
  // ========== Level 2: Preposition/Location patterns ==========
  // Key insight: Chinese puts location words AFTER the reference object
  // English: "The cat is UNDER the chair" → Chinese: 猫在椅子下面 (cat at chair below)
  {
    id: 'thing_on_reference',
    name: 'Something is on something',
    description: 'Subject + 在 + Reference + 上面',
    explanation: 'Chinese location words go AFTER the reference: 书在桌子上面 = "book at table on-top" = The book is on the table',
    example: { zh: '书在桌子上面', en: 'The book is on the table' },
    slots: [
      { role: 'subject', categories: ['locatable'] },
      { role: 'reference', categories: ['furniture'] },
    ],
    fixedWords: [
      { word: '在', pinyin: 'zài', meaning: 'at' },
      { word: '上面', pinyin: 'shàngmiàn', meaning: 'on/above' },
    ],
    chineseOrder: ['subject', '在', 'reference', '上面'],
    englishPattern: '{subject} is on {reference}',
    difficulty: 2,
  },
  {
    id: 'thing_under_reference',
    name: 'Something is under something',
    description: 'Subject + 在 + Reference + 下面',
    explanation: 'Chinese location words go AFTER the reference: 猫在椅子下面 = "cat at chair below" = The cat is under the chair',
    example: { zh: '猫在椅子下面', en: 'The cat is under the chair' },
    slots: [
      { role: 'subject', categories: ['locatable'] },
      { role: 'reference', categories: ['furniture'] },
    ],
    fixedWords: [
      { word: '在', pinyin: 'zài', meaning: 'at' },
      { word: '下面', pinyin: 'xiàmiàn', meaning: 'under/below' },
    ],
    chineseOrder: ['subject', '在', 'reference', '下面'],
    englishPattern: '{subject} is under {reference}',
    difficulty: 2,
  },
  {
    id: 'thing_in_front_of_reference',
    name: 'Something is in front of something',
    description: 'Subject + 在 + Reference + 前面',
    explanation: 'Chinese location words go AFTER the reference: 猫在椅子前面 = "cat at chair front" = The cat is in front of the chair',
    example: { zh: '猫在椅子前面', en: 'The cat is in front of the chair' },
    slots: [
      { role: 'subject', categories: ['locatable'] },
      { role: 'reference', categories: ['furniture'] },
    ],
    fixedWords: [
      { word: '在', pinyin: 'zài', meaning: 'at' },
      { word: '前面', pinyin: 'qiánmiàn', meaning: 'in front of' },
    ],
    chineseOrder: ['subject', '在', 'reference', '前面'],
    englishPattern: '{subject} is in front of {reference}',
    difficulty: 2,
  },
  {
    id: 'thing_behind_reference',
    name: 'Something is behind something',
    description: 'Subject + 在 + Reference + 后面',
    explanation: 'Chinese location words go AFTER the reference: 狗在椅子后面 = "dog at chair behind" = The dog is behind the chair',
    example: { zh: '狗在椅子后面', en: 'The dog is behind the chair' },
    slots: [
      { role: 'subject', categories: ['locatable'] },
      { role: 'reference', categories: ['furniture'] },
    ],
    fixedWords: [
      { word: '在', pinyin: 'zài', meaning: 'at' },
      { word: '后面', pinyin: 'hòumiàn', meaning: 'behind' },
    ],
    chineseOrder: ['subject', '在', 'reference', '后面'],
    englishPattern: '{subject} is behind {reference}',
    difficulty: 2,
  },
  {
    id: 'thing_inside_reference',
    name: 'Something is inside something',
    description: 'Subject + 在 + Reference + 里面',
    explanation: 'Chinese location words go AFTER the reference: 书在桌子里面 = "book at table inside" = The book is inside the desk',
    example: { zh: '书在桌子里面', en: 'The book is inside the desk' },
    slots: [
      { role: 'subject', categories: ['locatable'] },
      { role: 'reference', categories: ['furniture'] },
    ],
    fixedWords: [
      { word: '在', pinyin: 'zài', meaning: 'at' },
      { word: '里面', pinyin: 'lǐmiàn', meaning: 'inside' },
    ],
    chineseOrder: ['subject', '在', 'reference', '里面'],
    englishPattern: '{subject} is inside {reference}',
    difficulty: 2,
  },
  {
    id: 'thing_beside_reference',
    name: 'Something is beside something',
    description: 'Subject + 在 + Reference + 旁边',
    explanation: 'Chinese location words go AFTER the reference: 猫在椅子旁边 = "cat at chair beside" = The cat is beside the chair',
    example: { zh: '猫在椅子旁边', en: 'The cat is beside the chair' },
    slots: [
      { role: 'subject', categories: ['locatable'] },
      { role: 'reference', categories: ['furniture'] },
    ],
    fixedWords: [
      { word: '在', pinyin: 'zài', meaning: 'at' },
      { word: '旁边', pinyin: 'pángbiān', meaning: 'beside' },
    ],
    chineseOrder: ['subject', '在', 'reference', '旁边'],
    englishPattern: '{subject} is beside {reference}',
    difficulty: 2,
  },
  {
    id: 'person_on_place',
    name: 'Someone is at a place (on/above)',
    description: 'Person + 在 + Place + 上面',
    explanation: 'Same location pattern with people: 他在学校前面 = He is in front of the school',
    example: { zh: '爸爸在家里面', en: 'Dad is inside the house' },
    slots: [
      { role: 'subject', categories: ['person'] },
      { role: 'reference', categories: ['destination'] },
    ],
    fixedWords: [
      { word: '在', pinyin: 'zài', meaning: 'at' },
      { word: '里面', pinyin: 'lǐmiàn', meaning: 'inside' },
    ],
    chineseOrder: ['subject', '在', 'reference', '里面'],
    englishPattern: '{subject} is inside {reference}',
    difficulty: 2,
  },
  {
    id: 'person_in_front_place',
    name: 'Someone is in front of a place',
    description: 'Person + 在 + Place + 前面',
    explanation: 'Location pattern with people and places: 他在学校前面 = He is in front of the school',
    example: { zh: '他在学校前面', en: 'He is in front of the school' },
    slots: [
      { role: 'subject', categories: ['person'] },
      { role: 'reference', categories: ['destination'] },
    ],
    fixedWords: [
      { word: '在', pinyin: 'zài', meaning: 'at' },
      { word: '前面', pinyin: 'qiánmiàn', meaning: 'in front of' },
    ],
    chineseOrder: ['subject', '在', 'reference', '前面'],
    englishPattern: '{subject} is in front of {reference}',
    difficulty: 2,
  },

  // ========== Level 3: Time expressions ==========
  {
    id: 'time_person_go',
    name: 'When someone goes',
    description: 'Time + Subject + Verb',
    explanation: 'In Chinese, time words come BEFORE the subject (opposite of English)',
    example: { zh: '今天我去学校', en: 'Today I go to school' },
    slots: [
      { role: 'time', categories: ['time'] },
      { role: 'subject', categories: ['person'] },
      { role: 'destination', categories: ['destination'] },
    ],
    fixedWords: [
      { word: '去', pinyin: 'qù', meaning: 'go to' },
    ],
    chineseOrder: ['time', 'subject', '去', 'destination'],
    englishPattern: '{subject} goes to {destination} {time}',
    difficulty: 3,
  },
  {
    id: 'time_person_eat',
    name: 'When someone eats',
    description: 'Time + Subject + Verb + Object',
    explanation: 'In Chinese, time words come BEFORE the subject (opposite of English)',
    example: { zh: '明天他吃苹果', en: 'Tomorrow he eats apples' },
    slots: [
      { role: 'time', categories: ['time'] },
      { role: 'subject', categories: ['person'] },
      { role: 'object', categories: ['edible'] },
    ],
    fixedWords: [
      { word: '吃', pinyin: 'chī', meaning: 'eat' },
    ],
    chineseOrder: ['time', 'subject', '吃', 'object'],
    englishPattern: '{subject} eats {object} {time}',
    difficulty: 3,
  },
  {
    id: 'time_person_drink',
    name: 'When someone drinks',
    description: 'Time + Subject + Verb + Object',
    explanation: 'In Chinese, time words come BEFORE the subject (opposite of English)',
    example: { zh: '上午我喝茶', en: 'In the morning I drink tea' },
    slots: [
      { role: 'time', categories: ['time'] },
      { role: 'subject', categories: ['person'] },
      { role: 'object', categories: ['drinkable'] },
    ],
    fixedWords: [
      { word: '喝', pinyin: 'hē', meaning: 'drink' },
    ],
    chineseOrder: ['time', 'subject', '喝', 'object'],
    englishPattern: '{subject} drinks {object} {time}',
    difficulty: 3,
  },

  // ========== Level 3: 上个/这个/下个 + time unit ==========
  {
    id: 'last_timeunit_go',
    name: 'Last [week/month] someone goes',
    description: '上个 + Time Unit + Subject + Verb',
    explanation: 'Use 上个 (shàng ge) before time units like 星期 (week), 月 (month), or 年 (year) to say "last." Time comes BEFORE the subject in Chinese.',
    example: { zh: '上个星期我去学校', en: 'I went to school last week' },
    slots: [
      { role: 'time_unit', categories: ['time_unit'] },
      { role: 'subject', categories: ['person'] },
      { role: 'destination', categories: ['destination'] },
    ],
    fixedWords: [
      { word: '上个', pinyin: 'shàng ge', meaning: 'last' },
      { word: '去', pinyin: 'qù', meaning: 'go to' },
    ],
    chineseOrder: ['上个', 'time_unit', 'subject', '去', 'destination'],
    englishPattern: '{subject} goes to {destination} last {time_unit}',
    difficulty: 3,
  },
  {
    id: 'this_timeunit_eat',
    name: 'This [week/month] someone eats',
    description: '这个 + Time Unit + Subject + Verb + Object',
    explanation: 'Use 这个 (zhè ge) before time units like 星期 (week) or 月 (month) to say "this." Compare: 上个 = last, 这个 = this, 下个 = next.',
    example: { zh: '这个月她吃中国菜', en: 'She eats Chinese food this month' },
    slots: [
      { role: 'time_unit', categories: ['time_unit'] },
      { role: 'subject', categories: ['person'] },
      { role: 'object', categories: ['edible'] },
    ],
    fixedWords: [
      { word: '这个', pinyin: 'zhè ge', meaning: 'this' },
      { word: '吃', pinyin: 'chī', meaning: 'eat' },
    ],
    chineseOrder: ['这个', 'time_unit', 'subject', '吃', 'object'],
    englishPattern: '{subject} eats {object} this {time_unit}',
    difficulty: 3,
  },
  {
    id: 'next_timeunit_go',
    name: 'Next [week/month] someone goes',
    description: '下个 + Time Unit + Subject + Verb',
    explanation: 'Use 下个 (xià ge) before time units like 星期 (week), 月 (month), or 年 (year) to say "next." The full pattern: 上个 = last, 这个 = this, 下个 = next.',
    example: { zh: '下个星期他去中国', en: 'He goes to China next week' },
    slots: [
      { role: 'time_unit', categories: ['time_unit'] },
      { role: 'subject', categories: ['person'] },
      { role: 'destination', categories: ['destination'] },
    ],
    fixedWords: [
      { word: '下个', pinyin: 'xià ge', meaning: 'next' },
      { word: '去', pinyin: 'qù', meaning: 'go to' },
    ],
    chineseOrder: ['下个', 'time_unit', 'subject', '去', 'destination'],
    englishPattern: '{subject} goes to {destination} next {time_unit}',
    difficulty: 3,
  },

  // ========== New patterns: 也, 有/没有, 坐, 在+V, 学 ==========
  {
    id: 'person_have_thing',
    name: 'Someone has something',
    description: 'Subject + 有 + Object',
    explanation: '有 (yǒu) expresses possession. Unlike English, there is no "a/the" needed.',
    example: { zh: '我有书', en: 'I have books' },
    slots: [
      { role: 'subject', categories: ['person'] },
      { role: 'object', categories: ['thing', 'locatable', 'readable', 'edible', 'drinkable'] },
    ],
    fixedWords: [
      { word: '有', pinyin: 'yǒu', meaning: 'have' },
    ],
    chineseOrder: ['subject', '有', 'object'],
    englishPattern: '{subject} has {object}',
    difficulty: 1,
  },
  {
    id: 'person_take_vehicle',
    name: 'Someone takes transport',
    description: 'Subject + 坐 + Vehicle',
    explanation: '坐 (zuò) literally means "sit" but is used for taking transportation',
    example: { zh: '我坐飞机', en: 'I take the plane' },
    slots: [
      { role: 'subject', categories: ['person'] },
      { role: 'object', categories: ['vehicle'] },
    ],
    fixedWords: [
      { word: '坐', pinyin: 'zuò', meaning: 'take/ride' },
    ],
    chineseOrder: ['subject', '坐', 'object'],
    englishPattern: '{subject} takes {object}',
    difficulty: 1,
  },
  {
    id: 'person_learn_language',
    name: 'Someone studies a language',
    description: 'Subject + 学 + Language',
    explanation: '学 (xué) means to study or learn',
    example: { zh: '我学汉语', en: 'I study Chinese' },
    slots: [
      { role: 'subject', categories: ['person'] },
      { role: 'object', categories: ['language'] },
    ],
    fixedWords: [
      { word: '学', pinyin: 'xué', meaning: 'study/learn' },
    ],
    chineseOrder: ['subject', '学', 'object'],
    englishPattern: '{subject} studies {object}',
    difficulty: 1,
  },
  {
    id: 'person_also_eat',
    name: 'Someone also eats something',
    description: 'Subject + 也 + 吃 + Object',
    explanation: '也 (yě) = "also/too". It always goes BEFORE the verb, never at the end like English.',
    example: { zh: '他也吃苹果', en: 'He also eats apples' },
    slots: [
      { role: 'subject', categories: ['person'] },
      { role: 'object', categories: ['edible'] },
    ],
    fixedWords: [
      { word: '也', pinyin: 'yě', meaning: 'also' },
      { word: '吃', pinyin: 'chī', meaning: 'eat' },
    ],
    chineseOrder: ['subject', '也', '吃', 'object'],
    englishPattern: '{subject} also eats {object}',
    difficulty: 2,
  },
  {
    id: 'person_not_have',
    name: "Someone doesn't have something",
    description: 'Subject + 没有 + Object',
    explanation: 'Use 没有 (méiyǒu), NOT 不, to negate 有. 没有 is also used for past-tense negation.',
    example: { zh: '我没有车', en: "I don't have a car" },
    slots: [
      { role: 'subject', categories: ['person'] },
      { role: 'object', categories: ['thing', 'locatable', 'readable', 'edible', 'drinkable'] },
    ],
    fixedWords: [
      { word: '没有', pinyin: 'méiyǒu', meaning: "don't have" },
    ],
    chineseOrder: ['subject', '没有', 'object'],
    englishPattern: "{subject} doesn't have {object}",
    difficulty: 2,
  },
  {
    id: 'person_at_place_eat',
    name: 'Someone eats at a place',
    description: 'Subject + 在 + Place + 吃 + Object',
    explanation: '在+Place BEFORE the verb = doing something at that place. Compare: 我在家 (I am at home) vs 我在家吃饭 (I eat at home).',
    example: { zh: '我在家吃饭', en: 'I eat food at home' },
    slots: [
      { role: 'subject', categories: ['person'] },
      { role: 'location', categories: ['destination'] },
      { role: 'object', categories: ['edible'] },
    ],
    fixedWords: [
      { word: '在', pinyin: 'zài', meaning: 'at' },
      { word: '吃', pinyin: 'chī', meaning: 'eat' },
    ],
    chineseOrder: ['subject', '在', 'location', '吃', 'object'],
    englishPattern: '{subject} eats {object} at {location}',
    difficulty: 2,
  },

  // ========== Ch 3: 是 sentences ==========
  {
    id: 'person_is_identity',
    name: 'Someone is [identity]',
    description: 'Subject + 是 + Noun',
    explanation: '是 (shì) links a subject to an identity. Unlike English, no article "a" is needed.',
    example: { zh: '我是学生', en: 'I am a student' },
    slots: [
      { role: 'subject', categories: ['person'], posFilter: ['pronoun'] },
      { role: 'identity', categories: ['profession'] },
    ],
    fixedWords: [
      { word: '是', pinyin: 'shì', meaning: 'is/am/are' },
    ],
    chineseOrder: ['subject', '是', 'identity'],
    englishPattern: '{subject} is {identity}',
    difficulty: 1,
  },
  {
    id: 'person_is_identity_question',
    name: 'Are you a [identity]?',
    description: 'Subject + 是 + Noun + 吗',
    explanation: 'Add 吗 to a 是 sentence to ask about someone\'s identity',
    example: { zh: '你是老师吗', en: 'Are you a teacher?' },
    slots: [
      { role: 'subject', categories: ['person'], posFilter: ['pronoun'] },
      { role: 'identity', categories: ['profession'] },
    ],
    fixedWords: [
      { word: '是', pinyin: 'shì', meaning: 'is/am/are' },
      { word: '吗', pinyin: 'ma', meaning: '(question)' },
    ],
    chineseOrder: ['subject', '是', 'identity', '吗'],
    englishPattern: 'Is {subject} {identity}?',
    difficulty: 2,
  },
  {
    id: 'person_not_is',
    name: 'Someone is not [identity]',
    description: 'Subject + 不 + 是 + Noun',
    explanation: 'Negate 是 with 不: "I am not a teacher". Unlike 没, use 不 for 是.',
    example: { zh: '我不是老师', en: 'I am not a teacher' },
    slots: [
      { role: 'subject', categories: ['person'], posFilter: ['pronoun'] },
      { role: 'identity', categories: ['profession'] },
    ],
    fixedWords: [
      { word: '不', pinyin: 'bù', meaning: 'not' },
      { word: '是', pinyin: 'shì', meaning: 'is/am/are' },
    ],
    chineseOrder: ['subject', '不', '是', 'identity'],
    englishPattern: '{subject} is not {identity}',
    difficulty: 2,
  },

  // ========== Ch 4: 谁 question ==========
  {
    id: 'who_is',
    name: 'Who is someone?',
    description: 'Subject + 是 + 谁',
    explanation: '谁 (shéi) asks about identity. Chinese keeps the same word order as a statement.',
    example: { zh: '他是谁', en: 'Who is he?' },
    slots: [
      { role: 'subject', categories: ['person'], posFilter: ['pronoun'] },
    ],
    fixedWords: [
      { word: '是', pinyin: 'shì', meaning: 'is/am/are' },
      { word: '谁', pinyin: 'shéi', meaning: 'who' },
    ],
    chineseOrder: ['subject', '是', '谁'],
    englishPattern: 'Who is {subject}?',
    difficulty: 2,
  },

  // ========== Ch 6: 会 ability ==========
  {
    id: 'person_can_speak',
    name: 'Someone can speak [language]',
    description: 'Subject + 会 + 说 + Language',
    explanation: '会 (huì) before a verb = ability gained through learning: "I can speak Chinese"',
    example: { zh: '我会说汉语', en: 'I can speak Chinese' },
    slots: [
      { role: 'subject', categories: ['person'] },
      { role: 'object', categories: ['language'] },
    ],
    fixedWords: [
      { word: '会', pinyin: 'huì', meaning: 'can' },
      { word: '说', pinyin: 'shuō', meaning: 'speak' },
    ],
    chineseOrder: ['subject', '会', '说', 'object'],
    englishPattern: '{subject} can speak {object}',
    difficulty: 2,
  },
  {
    id: 'person_can_write',
    name: 'Someone can write [something]',
    description: 'Subject + 会 + 写 + Object',
    explanation: '会 + 写 = can write (learned ability). 汉字 = Chinese characters.',
    example: { zh: '她会写汉字', en: 'She can write Chinese characters' },
    slots: [
      { role: 'subject', categories: ['person'] },
      { role: 'object', categories: ['readable'] },
    ],
    fixedWords: [
      { word: '会', pinyin: 'huì', meaning: 'can' },
      { word: '写', pinyin: 'xiě', meaning: 'write' },
    ],
    chineseOrder: ['subject', '会', '写', 'object'],
    englishPattern: '{subject} can write {object}',
    difficulty: 2,
  },
  {
    id: 'person_can_make',
    name: 'Someone can cook [food]',
    description: 'Subject + 会 + 做 + Food',
    explanation: '会 + 做 = can make/cook (learned ability)',
    example: { zh: '妈妈会做中国菜', en: 'Mom can cook Chinese food' },
    slots: [
      { role: 'subject', categories: ['person'] },
      { role: 'object', categories: ['edible'] },
    ],
    fixedWords: [
      { word: '会', pinyin: 'huì', meaning: 'can' },
      { word: '做', pinyin: 'zuò', meaning: 'make/cook' },
    ],
    chineseOrder: ['subject', '会', '做', 'object'],
    englishPattern: '{subject} can cook {object}',
    difficulty: 2,
  },
  {
    id: 'person_cant_speak',
    name: "Someone can't speak [language]",
    description: 'Subject + 不 + 会 + 说 + Language',
    explanation: 'Negate 会 with 不: 不会 = don\'t have the ability.',
    example: { zh: '他不会说汉语', en: "He can't speak Chinese" },
    slots: [
      { role: 'subject', categories: ['person'] },
      { role: 'object', categories: ['language'] },
    ],
    fixedWords: [
      { word: '不', pinyin: 'bù', meaning: 'not' },
      { word: '会', pinyin: 'huì', meaning: 'can' },
      { word: '说', pinyin: 'shuō', meaning: 'speak' },
    ],
    chineseOrder: ['subject', '不', '会', '说', 'object'],
    englishPattern: "{subject} can't speak {object}",
    difficulty: 2,
  },

  // ========== Ch 7: Serial verb 去+place+V ==========
  {
    id: 'go_place_read',
    name: 'Go somewhere to read',
    description: 'Subject + 去 + Place + 看 + Readable',
    explanation: 'Serial verb: two verbs share one subject. 去 (go) + 看 (read) = go somewhere to read.',
    example: { zh: '我去学校看书', en: 'I go to school to read books' },
    slots: [
      { role: 'subject', categories: ['person'] },
      { role: 'destination', categories: ['destination'] },
      { role: 'object', categories: ['readable', 'watchable'] },
    ],
    fixedWords: [
      { word: '去', pinyin: 'qù', meaning: 'go to' },
      { word: '看', pinyin: 'kàn', meaning: 'read/watch' },
    ],
    chineseOrder: ['subject', '去', 'destination', '看', 'object'],
    englishPattern: '{subject} goes to {destination} to read {object}',
    difficulty: 2,
  },
  {
    id: 'go_place_study',
    name: 'Go somewhere to study',
    description: 'Subject + 去 + Place + 学 + Language',
    explanation: 'Serial verb: 去 (go) + 学 (study) = go somewhere to study.',
    example: { zh: '我去中国学汉语', en: 'I go to China to study Chinese' },
    slots: [
      { role: 'subject', categories: ['person'] },
      { role: 'destination', categories: ['destination'] },
      { role: 'object', categories: ['language'] },
    ],
    fixedWords: [
      { word: '去', pinyin: 'qù', meaning: 'go to' },
      { word: '学', pinyin: 'xué', meaning: 'study' },
    ],
    chineseOrder: ['subject', '去', 'destination', '学', 'object'],
    englishPattern: '{subject} goes to {destination} to study {object}',
    difficulty: 2,
  },

  // ========== Ch 10: 有 existential, 能, 请 ==========
  {
    id: 'location_has_thing_on',
    name: 'There is something on [ref]',
    description: 'Reference + 上面 + 有 + Thing',
    explanation: 'Existential 有: location + 有 + thing = "there is [thing] at [location]". Opposite of 在 pattern.',
    example: { zh: '桌子上面有书', en: 'The table has books on it' },
    slots: [
      { role: 'reference', categories: ['furniture'] },
      { role: 'item', categories: ['locatable', 'readable'] },
    ],
    fixedWords: [
      { word: '上面', pinyin: 'shàngmiàn', meaning: 'on/above' },
      { word: '有', pinyin: 'yǒu', meaning: 'have/there is' },
    ],
    chineseOrder: ['reference', '上面', '有', 'item'],
    englishPattern: '{reference} has {item} on it',
    difficulty: 2,
  },
  {
    id: 'location_has_thing_under',
    name: 'There is something under [ref]',
    description: 'Reference + 下面 + 有 + Thing',
    explanation: 'Existential 有 with location. Location words go AFTER the reference.',
    example: { zh: '椅子下面有猫', en: 'The chair has a cat under it' },
    slots: [
      { role: 'reference', categories: ['furniture'] },
      { role: 'item', categories: ['locatable', 'animal'] },
    ],
    fixedWords: [
      { word: '下面', pinyin: 'xiàmiàn', meaning: 'under/below' },
      { word: '有', pinyin: 'yǒu', meaning: 'have/there is' },
    ],
    chineseOrder: ['reference', '下面', '有', 'item'],
    englishPattern: '{reference} has {item} under it',
    difficulty: 2,
  },
  {
    id: 'location_has_thing_inside',
    name: 'There is something inside [ref]',
    description: 'Reference + 里面 + 有 + Thing',
    explanation: 'Existential 有: different from 在 (specific location) — 有 states existence.',
    example: { zh: '桌子里面有书', en: 'The desk has books inside it' },
    slots: [
      { role: 'reference', categories: ['furniture'] },
      { role: 'item', categories: ['locatable', 'readable'] },
    ],
    fixedWords: [
      { word: '里面', pinyin: 'lǐmiàn', meaning: 'inside' },
      { word: '有', pinyin: 'yǒu', meaning: 'have/there is' },
    ],
    chineseOrder: ['reference', '里面', '有', 'item'],
    englishPattern: '{reference} has {item} inside it',
    difficulty: 2,
  },
  {
    id: 'person_able_go',
    name: 'Someone can go somewhere',
    description: 'Subject + 能 + 去 + Place',
    explanation: '能 (néng) = can/able to (ability or permission). Different from 会 (learned skill).',
    example: { zh: '我能去商店', en: 'I can go to the store' },
    slots: [
      { role: 'subject', categories: ['person'] },
      { role: 'destination', categories: ['destination'] },
    ],
    fixedWords: [
      { word: '能', pinyin: 'néng', meaning: 'can/able to' },
      { word: '去', pinyin: 'qù', meaning: 'go to' },
    ],
    chineseOrder: ['subject', '能', '去', 'destination'],
    englishPattern: '{subject} can go to {destination}',
    difficulty: 2,
  },
  {
    id: 'please_drink',
    name: 'Please have a drink',
    description: '请 + 喝 + Drink',
    explanation: '请 (qǐng) before a verb = polite invitation: "Please [do something]"',
    example: { zh: '请喝茶', en: 'Please have some tea' },
    slots: [
      { role: 'object', categories: ['drinkable'] },
    ],
    fixedWords: [
      { word: '请', pinyin: 'qǐng', meaning: 'please' },
      { word: '喝', pinyin: 'hē', meaning: 'drink' },
    ],
    chineseOrder: ['请', '喝', 'object'],
    englishPattern: 'Please drink {object}',
    difficulty: 1,
  },
  {
    id: 'please_eat',
    name: 'Please eat something',
    description: '请 + 吃 + Food',
    explanation: '请 before a verb = polite invitation. 请吃 = "please eat / help yourself"',
    example: { zh: '请吃水果', en: 'Please have some fruit' },
    slots: [
      { role: 'object', categories: ['edible'] },
    ],
    fixedWords: [
      { word: '请', pinyin: 'qǐng', meaning: 'please' },
      { word: '吃', pinyin: 'chī', meaning: 'eat' },
    ],
    chineseOrder: ['请', '吃', 'object'],
    englishPattern: 'Please eat {object}',
    difficulty: 1,
  },

  // ========== Ch 12: 怎么样, 太...了 ==========
  {
    id: 'how_is_thing',
    name: 'How is [something]?',
    description: 'Time + Subject + 怎么样',
    explanation: '怎么样 (zěnmeyàng) asks about condition: "How is the weather tomorrow?"',
    example: { zh: '明天天气怎么样', en: 'How is the weather tomorrow?' },
    slots: [
      { role: 'time', categories: ['time'] },
      { role: 'subject', categories: ['describable', 'nature'] },
    ],
    fixedWords: [
      { word: '怎么样', pinyin: 'zěnmeyàng', meaning: 'how about' },
    ],
    chineseOrder: ['time', 'subject', '怎么样'],
    englishPattern: 'How is {subject} {time}?',
    difficulty: 2,
  },
  {
    id: 'too_adj',
    name: 'Something is too [adj]',
    description: 'Subject + 太 + Adjective + 了',
    explanation: '太...了 (tài...le) = "too...!" Express that something is excessive.',
    example: { zh: '天气太冷了', en: 'The weather is too cold' },
    slots: [
      { role: 'subject', categories: ['describable', 'nature', 'person'] },
      { role: 'adjective', categories: ['quality_adj', 'size_adj', 'temperature_adj', 'appearance_adj', 'emotion_adj'] },
    ],
    fixedWords: [
      { word: '太', pinyin: 'tài', meaning: 'too' },
      { word: '了', pinyin: 'le', meaning: '(emphasis)' },
    ],
    chineseOrder: ['subject', '太', 'adjective', '了'],
    englishPattern: '{subject} is too {adjective}',
    difficulty: 2,
  },

  // ========== Ch 13: 在...呢 progressive, 吧 suggestion ==========
  {
    id: 'person_reading_now',
    name: 'Someone is reading now',
    description: 'Subject + 在 + 看 + Object + 呢',
    explanation: '在...呢 = action in progress (like English "-ing"). 在 before verb, 呢 at end.',
    example: { zh: '我在看书呢', en: 'I am reading books' },
    slots: [
      { role: 'subject', categories: ['person'] },
      { role: 'object', categories: ['readable', 'watchable'] },
    ],
    fixedWords: [
      { word: '在', pinyin: 'zài', meaning: '(progressive)' },
      { word: '看', pinyin: 'kàn', meaning: 'read/watch' },
      { word: '呢', pinyin: 'ne', meaning: '(ongoing)' },
    ],
    chineseOrder: ['subject', '在', '看', 'object', '呢'],
    englishPattern: '{subject} is reading {object}',
    difficulty: 2,
  },
  {
    id: 'person_eating_now',
    name: 'Someone is eating now',
    description: 'Subject + 在 + 吃 + Object + 呢',
    explanation: '在...呢 = action in progress. 呢 at the end reinforces the ongoing sense.',
    example: { zh: '他在吃苹果呢', en: 'He is eating apples' },
    slots: [
      { role: 'subject', categories: ['person'] },
      { role: 'object', categories: ['edible'] },
    ],
    fixedWords: [
      { word: '在', pinyin: 'zài', meaning: '(progressive)' },
      { word: '吃', pinyin: 'chī', meaning: 'eat' },
      { word: '呢', pinyin: 'ne', meaning: '(ongoing)' },
    ],
    chineseOrder: ['subject', '在', '吃', 'object', '呢'],
    englishPattern: '{subject} is eating {object}',
    difficulty: 2,
  },
  {
    id: 'person_drinking_now',
    name: 'Someone is drinking now',
    description: 'Subject + 在 + 喝 + Object + 呢',
    explanation: '在...呢 = action in progress.',
    example: { zh: '她在喝茶呢', en: 'She is drinking tea' },
    slots: [
      { role: 'subject', categories: ['person'] },
      { role: 'object', categories: ['drinkable'] },
    ],
    fixedWords: [
      { word: '在', pinyin: 'zài', meaning: '(progressive)' },
      { word: '喝', pinyin: 'hē', meaning: 'drink' },
      { word: '呢', pinyin: 'ne', meaning: '(ongoing)' },
    ],
    chineseOrder: ['subject', '在', '喝', 'object', '呢'],
    englishPattern: '{subject} is drinking {object}',
    difficulty: 2,
  },
  {
    id: 'person_studying_now',
    name: 'Someone is studying now',
    description: 'Subject + 在 + 学 + Object + 呢',
    explanation: '在...呢 = action in progress.',
    example: { zh: '他在学汉语呢', en: 'He is studying Chinese' },
    slots: [
      { role: 'subject', categories: ['person'] },
      { role: 'object', categories: ['language'] },
    ],
    fixedWords: [
      { word: '在', pinyin: 'zài', meaning: '(progressive)' },
      { word: '学', pinyin: 'xué', meaning: 'study' },
      { word: '呢', pinyin: 'ne', meaning: '(ongoing)' },
    ],
    chineseOrder: ['subject', '在', '学', 'object', '呢'],
    englishPattern: '{subject} is studying {object}',
    difficulty: 2,
  },
  {
    id: 'should_eat',
    name: "Let's eat [something]",
    description: 'Subject + 吃 + Object + 吧',
    explanation: '吧 (ba) at the end softens a suggestion: "Let\'s..." or "How about...?"',
    example: { zh: '我们吃饭吧', en: 'We should eat food' },
    slots: [
      { role: 'subject', categories: ['person'] },
      { role: 'object', categories: ['edible'] },
    ],
    fixedWords: [
      { word: '吃', pinyin: 'chī', meaning: 'eat' },
      { word: '吧', pinyin: 'ba', meaning: '(suggestion)' },
    ],
    chineseOrder: ['subject', '吃', 'object', '吧'],
    englishPattern: '{subject} should eat {object}',
    difficulty: 2,
  },
  {
    id: 'should_go',
    name: "Let's go [somewhere]",
    description: 'Subject + 去 + Place + 吧',
    explanation: '吧 makes a polite suggestion: "Let\'s go to..."',
    example: { zh: '我们去学校吧', en: "We should go to school" },
    slots: [
      { role: 'subject', categories: ['person'] },
      { role: 'destination', categories: ['destination'] },
    ],
    fixedWords: [
      { word: '去', pinyin: 'qù', meaning: 'go to' },
      { word: '吧', pinyin: 'ba', meaning: '(suggestion)' },
    ],
    chineseOrder: ['subject', '去', 'destination', '吧'],
    englishPattern: '{subject} should go to {destination}',
    difficulty: 2,
  },
  {
    id: 'should_drink',
    name: "Let's drink [something]",
    description: 'Subject + 喝 + Object + 吧',
    explanation: '吧 softens a suggestion: "How about we drink...?"',
    example: { zh: '我们喝茶吧', en: "We should drink tea" },
    slots: [
      { role: 'subject', categories: ['person'] },
      { role: 'object', categories: ['drinkable'] },
    ],
    fixedWords: [
      { word: '喝', pinyin: 'hē', meaning: 'drink' },
      { word: '吧', pinyin: 'ba', meaning: '(suggestion)' },
    ],
    chineseOrder: ['subject', '喝', 'object', '吧'],
    englishPattern: '{subject} should drink {object}',
    difficulty: 2,
  },

  // ========== Ch 14: 了 completion, 没 past negation ==========
  {
    id: 'person_went',
    name: 'Someone went somewhere',
    description: 'Subject + 去 + Place + 了',
    explanation: '了 (le) after verb/object = completed action (past tense).',
    example: { zh: '我去商店了', en: 'I went to the store' },
    slots: [
      { role: 'subject', categories: ['person'] },
      { role: 'destination', categories: ['destination'] },
    ],
    fixedWords: [
      { word: '去', pinyin: 'qù', meaning: 'go to' },
      { word: '了', pinyin: 'le', meaning: '(completed)' },
    ],
    chineseOrder: ['subject', '去', 'destination', '了'],
    englishPattern: '{subject} went to {destination}',
    difficulty: 2,
  },
  {
    id: 'person_ate',
    name: 'Someone ate something',
    description: 'Subject + 吃 + Object + 了',
    explanation: '了 marks completed action. Compare: 我吃苹果 (I eat) vs 我吃苹果了 (I ate).',
    example: { zh: '他吃苹果了', en: 'He ate apples' },
    slots: [
      { role: 'subject', categories: ['person'] },
      { role: 'object', categories: ['edible'] },
    ],
    fixedWords: [
      { word: '吃', pinyin: 'chī', meaning: 'eat' },
      { word: '了', pinyin: 'le', meaning: '(completed)' },
    ],
    chineseOrder: ['subject', '吃', 'object', '了'],
    englishPattern: '{subject} ate {object}',
    difficulty: 2,
  },
  {
    id: 'person_drank',
    name: 'Someone drank something',
    description: 'Subject + 喝 + Object + 了',
    explanation: '了 marks completed action.',
    example: { zh: '她喝茶了', en: 'She drank tea' },
    slots: [
      { role: 'subject', categories: ['person'] },
      { role: 'object', categories: ['drinkable'] },
    ],
    fixedWords: [
      { word: '喝', pinyin: 'hē', meaning: 'drink' },
      { word: '了', pinyin: 'le', meaning: '(completed)' },
    ],
    chineseOrder: ['subject', '喝', 'object', '了'],
    englishPattern: '{subject} drank {object}',
    difficulty: 2,
  },
  {
    id: 'person_didnt_eat',
    name: "Someone didn't eat",
    description: 'Subject + 没 + 吃 + Object',
    explanation: 'Use 没 (méi), NOT 不, to negate past actions. No 了 in the negative form.',
    example: { zh: '我没吃饭', en: "I didn't eat food" },
    slots: [
      { role: 'subject', categories: ['person'] },
      { role: 'object', categories: ['edible'] },
    ],
    fixedWords: [
      { word: '没', pinyin: 'méi', meaning: 'not (past)' },
      { word: '吃', pinyin: 'chī', meaning: 'eat' },
    ],
    chineseOrder: ['subject', '没', '吃', 'object'],
    englishPattern: "{subject} didn't eat {object}",
    difficulty: 2,
  },
  {
    id: 'person_didnt_go',
    name: "Someone didn't go",
    description: 'Subject + 没 + 去 + Place',
    explanation: 'Use 没 to negate past actions. 没去 = didn\'t go.',
    example: { zh: '他没去学校', en: "He didn't go to school" },
    slots: [
      { role: 'subject', categories: ['person'] },
      { role: 'destination', categories: ['destination'] },
    ],
    fixedWords: [
      { word: '没', pinyin: 'méi', meaning: 'not (past)' },
      { word: '去', pinyin: 'qù', meaning: 'go to' },
    ],
    chineseOrder: ['subject', '没', '去', 'destination'],
    englishPattern: "{subject} didn't go to {destination}",
    difficulty: 2,
  },

  // ========== Questions: 什么, 哪儿 ==========
  {
    id: 'what_eat',
    name: 'What do you eat?',
    description: 'Subject + 吃 + 什么',
    explanation: '什么 (shénme) = "what". Unlike English, it stays where the answer goes (no word order change).',
    example: { zh: '你吃什么', en: 'What do you eat?' },
    slots: [
      { role: 'subject', categories: ['person'] },
    ],
    fixedWords: [
      { word: '吃', pinyin: 'chī', meaning: 'eat' },
      { word: '什么', pinyin: 'shénme', meaning: 'what' },
    ],
    chineseOrder: ['subject', '吃', '什么'],
    englishPattern: 'What does {subject} eat?',
    difficulty: 2,
  },
  {
    id: 'what_drink',
    name: 'What do you drink?',
    description: 'Subject + 喝 + 什么',
    explanation: '什么 stays in the object position in Chinese (unlike English where "what" moves to front).',
    example: { zh: '你喝什么', en: 'What do you drink?' },
    slots: [
      { role: 'subject', categories: ['person'] },
    ],
    fixedWords: [
      { word: '喝', pinyin: 'hē', meaning: 'drink' },
      { word: '什么', pinyin: 'shénme', meaning: 'what' },
    ],
    chineseOrder: ['subject', '喝', '什么'],
    englishPattern: 'What does {subject} drink?',
    difficulty: 2,
  },
  {
    id: 'what_want_eat',
    name: 'What do you want to eat?',
    description: 'Subject + 想 + 吃 + 什么',
    explanation: '想 + verb + 什么 = "What do you want to [verb]?"',
    example: { zh: '你想吃什么', en: 'What do you want to eat?' },
    slots: [
      { role: 'subject', categories: ['person'] },
    ],
    fixedWords: [
      { word: '想', pinyin: 'xiǎng', meaning: 'want to' },
      { word: '吃', pinyin: 'chī', meaning: 'eat' },
      { word: '什么', pinyin: 'shénme', meaning: 'what' },
    ],
    chineseOrder: ['subject', '想', '吃', '什么'],
    englishPattern: 'What does {subject} want to eat?',
    difficulty: 2,
  },
  {
    id: 'where_is',
    name: 'Where is [something]?',
    description: 'Subject + 在 + 哪儿',
    explanation: '哪儿 (nǎr) = "where". Chinese keeps the question word in place (no inversion).',
    example: { zh: '猫在哪儿', en: 'Where is the cat?' },
    slots: [
      { role: 'subject', categories: ['person', 'animal', 'locatable'] },
    ],
    fixedWords: [
      { word: '在', pinyin: 'zài', meaning: 'at/in' },
      { word: '哪儿', pinyin: 'nǎr', meaning: 'where' },
    ],
    chineseOrder: ['subject', '在', '哪儿'],
    englishPattern: 'Where is {subject}?',
    difficulty: 2,
  },

  // ========== Ch 15: 是...的 emphasis ==========
  {
    id: 'emphasis_time',
    name: 'Emphasize when someone came',
    description: 'Subject + 是 + Time + 来 + 的',
    explanation: '是...的 emphasizes WHEN something happened. The action (coming) is already known.',
    example: { zh: '我是昨天来的', en: 'I came yesterday' },
    slots: [
      { role: 'subject', categories: ['person'] },
      { role: 'time', categories: ['time'] },
    ],
    fixedWords: [
      { word: '是', pinyin: 'shì', meaning: '(emphasis)' },
      { word: '来', pinyin: 'lái', meaning: 'come' },
      { word: '的', pinyin: 'de', meaning: '(emphasis)' },
    ],
    chineseOrder: ['subject', '是', 'time', '来', '的'],
    englishPattern: '{subject} came {time}',
    difficulty: 3,
  },
  {
    id: 'emphasis_vehicle',
    name: 'Emphasize how someone came',
    description: 'Subject + 是 + 坐 + Vehicle + 来 + 的',
    explanation: '是...的 emphasizes HOW someone came. 坐 + vehicle = "by [vehicle]".',
    example: { zh: '我是坐飞机来的', en: 'I came by plane' },
    slots: [
      { role: 'subject', categories: ['person'] },
      { role: 'object', categories: ['vehicle'] },
    ],
    fixedWords: [
      { word: '是', pinyin: 'shì', meaning: '(emphasis)' },
      { word: '坐', pinyin: 'zuò', meaning: 'take/ride' },
      { word: '来', pinyin: 'lái', meaning: 'come' },
      { word: '的', pinyin: 'de', meaning: '(emphasis)' },
    ],
    chineseOrder: ['subject', '是', '坐', 'object', '来', '的'],
    englishPattern: '{subject} came by {object}',
    difficulty: 3,
  },
];

// ============================================================================
// TEMPLATE LOOKUP - For the GrammarTemplate interface
// ============================================================================

// Convert curated templates to GrammarTemplate format for display
function curatedToGrammar(ct: CuratedTemplate): GrammarTemplate {
  return {
    id: ct.id,
    name: ct.name,
    slots: ct.slots.map(s => ({
      role: s.role,
      pos: s.posFilter as any || ['pronoun', 'noun', 'adjective'],
    })),
    englishPattern: ct.englishPattern,
    example: ct.example,
    explanation: ct.explanation,
    difficulty: ct.difficulty,
  };
}

export function getTemplateById(id: string): GrammarTemplate | null {
  const template = CURATED_TEMPLATES.find(t => t.id === id);
  return template ? curatedToGrammar(template) : null;
}

// ============================================================================
// SENTENCE GENERATION
// ============================================================================

function findMatchingWords(
  knownVocab: Concept[],
  slot: TemplateSlot,
  usedWords: Set<string>
): Concept[] {
  return knownVocab.filter(word => {
    if (usedWords.has(word.word)) return false;
    if (word.paused) return false;
    
    const wordCategories = getCategories(word.word, word.category);
    const hasMatch = slot.categories.some(cat => wordCategories.includes(cat));
    
    if (!hasMatch) return false;
    
    if (slot.posFilter && slot.posFilter.length > 0) {
      if (!slot.posFilter.includes(word.part_of_speech)) return false;
    }
    
    return true;
  });
}

function canFillTemplate(knownVocab: Concept[], template: CuratedTemplate): boolean {
  const usedWords = new Set<string>();
  
  for (const slot of template.slots) {
    const matches = findMatchingWords(knownVocab, slot, usedWords);
    if (matches.length === 0) return false;
    usedWords.add(matches[0].word);
  }
  
  return true;
}

export function getAvailableTemplates(knownVocab: Concept[]): CuratedTemplate[] {
  return CURATED_TEMPLATES.filter(template => canFillTemplate(knownVocab, template));
}

// ============================================================================
// UNLOCK STATUS
// ============================================================================

export interface UnlockStatus {
  unlocked: boolean;
  availableTemplates: number;
  totalTemplates: number;
  missingRoles: string[];
}

export function checkSyntaxUnlock(knownVocab: Concept[]): UnlockStatus {
  const availableTemplates = getAvailableTemplates(knownVocab);
  const unlocked = availableTemplates.length >= 1;
  
  // Find which categories are missing
  const allCategories = new Set<string>();
  const availableCategories = new Set<string>();
  
  CURATED_TEMPLATES.forEach(t => {
    t.slots.forEach(s => s.categories.forEach(c => allCategories.add(c)));
  });
  
  knownVocab.filter(w => !w.paused).forEach(word => {
    getCategories(word.word, word.category).forEach(c => availableCategories.add(c));
  });
  
  const missingRoles = [...allCategories].filter(c => !availableCategories.has(c));
  
  return {
    unlocked,
    availableTemplates: availableTemplates.length,
    totalTemplates: CURATED_TEMPLATES.length,
    missingRoles,
  };
}

// ============================================================================
// MODALITY SELECTION
// ============================================================================

function pickChineseModality(learningFocus: Record<Modality, number>): ChineseModality {
  // Map learning focus to chinese modality weights
  const weights = {
    character: learningFocus.character || 0,
    pinyin: learningFocus.pinyin || 0,
    audio: learningFocus.audio || 0,
  };
  
  const total = weights.character + weights.pinyin + weights.audio;
  if (total === 0) return 'character';
  
  let random = Math.random() * total;
  
  if (random < weights.character) return 'character';
  random -= weights.character;
  if (random < weights.pinyin) return 'pinyin';
  return 'audio';
}

function pickDirection(directionRatio: SyntaxDirectionRatio): SyntaxDirection {
  const option = SYNTAX_DIRECTION_OPTIONS.find(o => o.value === directionRatio);
  if (!option) return 'english_to_chinese';
  
  const total = option.readingWeight + option.writingWeight;
  const random = Math.random() * total;
  
  // "reading" = Chinese→English (you read Chinese, produce English)
  // "writing" = English→Chinese (you read English, produce/write Chinese)
  // So readingWeight favors chinese_to_english
  // And writingWeight favors english_to_chinese
  if (random < option.writingWeight) {
    return 'english_to_chinese';
  }
  return 'chinese_to_english';
}

// ============================================================================
// MAIN EXERCISE GENERATOR
// ============================================================================

export function generateSentenceExercise(
  knownVocab: Concept[],
  learningFocus: Record<Modality, number>,
  directionRatio: SyntaxDirectionRatio
): SentenceExercise | null {
  const availableTemplates = getAvailableTemplates(knownVocab);
  
  if (availableTemplates.length === 0) {
    return null;
  }
  
  // Pick a random template
  const template = getRandomItem(availableTemplates);
  if (!template) return null;
  
  // Fill the slots
  const filledSlots: Map<string, Concept> = new Map();
  const usedWords = new Set<string>();
  
  for (const slot of template.slots) {
    const matches = findMatchingWords(knownVocab, slot, usedWords);
    if (matches.length === 0) return null;
    
    const selected = getRandomItem(matches);
    if (!selected) return null;
    
    filledSlots.set(slot.role, selected);
    usedWords.add(selected.word);
  }
  
  // Build Chinese sentence
  const chineseWords: string[] = [];
  const pinyinWords: string[] = [];
  const vocabularyIds: string[] = [];
  
  for (const item of template.chineseOrder) {
    const slotWord = filledSlots.get(item);
    if (slotWord) {
      chineseWords.push(slotWord.word);
      pinyinWords.push(slotWord.pinyin);
      vocabularyIds.push(slotWord.id);
    } else {
      // Fixed word
      const fixedWord = template.fixedWords.find(fw => fw.word === item);
      if (fixedWord) {
        chineseWords.push(fixedWord.word);
        pinyinWords.push(fixedWord.pinyin);
      }
    }
  }
  
  // Build English sentence
  // First, get the subject to determine verb conjugation
  const subjectWord = filledSlots.get('subject')?.word;
  const isFirstPerson = subjectWord === '我';
  const isSecondPerson = subjectWord === '你';
  const isPlural = subjectWord === '我们' || subjectWord === '你们' || subjectWord === '他们';
  const needsBaseVerb = isFirstPerson || isSecondPerson || isPlural;
  
  let english = template.englishPattern;
  
  // Replace slot placeholders with clean English
  filledSlots.forEach((concept, role) => {
    const position = (role === 'subject' || role === 'time') ? 'subject' : 'object';
    const cleanEnglish = getSentenceEnglish(concept.word, position, concept.meaning);
    english = english.replace(`{${role}}`, cleanEnglish);
  });
  
  // Fix verb conjugation based on subject
  if (needsBaseVerb) {
    // Convert 3rd person verbs to base form for I/you/we/they
    english = english.replace(' eats ', ' eat ');
    english = english.replace(' drinks ', ' drink ');
    english = english.replace(' goes to ', ' go to ');
    english = english.replace(' likes ', ' like ');
    english = english.replace(' reads ', ' read ');
    english = english.replace(' wants ', ' want ');
    english = english.replace(' has ', ' have ');
    english = english.replace(' takes ', ' take ');
    english = english.replace(' studies ', ' study ');
    english = english.replace(' also eats ', ' also eat ');
    english = english.replace(' is at ', ' am at ');
    english = english.replace(' is very ', ' am very ');
    english = english.replace(' is on ', ' am on ');
    english = english.replace(' is under ', ' am under ');
    english = english.replace(' is in front of ', ' am in front of ');
    english = english.replace(' is behind ', ' am behind ');
    english = english.replace(' is inside ', ' am inside ');
    english = english.replace(' is beside ', ' am beside ');
    
    // Fix negation: "doesn't" → "don't"
    english = english.replace(" doesn't ", " don't ");
    
    // Fix "Does I" → "Do I", "Does we" → "Do we", etc.
    english = english.replace(/^Does (I|you|we|you all|they) /, 'Do $1 ');

    // Generic is→am catch-all for 是/progressive/太/question patterns
    english = english.replace(/^Is /, 'Am ');
    english = english.replace(/ is /g, ' am ');
    english = english.replace(/ is\?/g, ' am?');
    // Generic does→do for 什么 questions ("What does I eat?" → "What do I eat?")
    english = english.replace(/ does /g, ' do ');
  }
  
  // Fix "we am" → "we are", "they am" → "they are"
  if (isPlural || isSecondPerson) {
    english = english.replace(' am at ', ' are at ');
    english = english.replace(' am very ', ' are very ');
    english = english.replace(' am on ', ' are on ');
    english = english.replace(' am under ', ' are under ');
    english = english.replace(' am in front of ', ' are in front of ');
    english = english.replace(' am behind ', ' are behind ');
    english = english.replace(' am inside ', ' are inside ');
    english = english.replace(' am beside ', ' are beside ');

    // Generic am→are catch-all for all new patterns
    english = english.replace(/^Am /, 'Are ');
    english = english.replace(/ am /g, ' are ');
    english = english.replace(/ am\?/g, ' are?');
  }
  
  english = english.charAt(0).toUpperCase() + english.slice(1);
  
  // Pick direction and modality
  const direction = pickDirection(directionRatio);
  const chineseModality = pickChineseModality(learningFocus);
  
  return {
    id: generateId(),
    templateId: template.id,
    english,
    chineseWords,
    pinyinWords,
    vocabularyIds,
    difficulty: template.difficulty,
    direction,
    chineseModality,
  };
}

// Legacy exports
export const GRAMMAR_TEMPLATES: GrammarTemplate[] = CURATED_TEMPLATES.map(curatedToGrammar);
