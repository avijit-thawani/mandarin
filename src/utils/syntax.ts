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
