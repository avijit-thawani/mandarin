// Syntax exercise types for sentence construction

import type { PartOfSpeech } from './vocabulary';

// ═══════════════════════════════════════════════════════════
// GRAMMAR TEMPLATES
// ═══════════════════════════════════════════════════════════

export interface SlotDefinition {
  role: string;
  pos: PartOfSpeech[];
  semantic?: string;
}

export interface GrammarTemplate {
  id: string;
  name: string;
  slots: SlotDefinition[];
  chinesePattern?: string;
  suffix?: string;
  englishPattern: string;
  example: { zh: string; en: string };
  explanation: string;
  difficulty: 1 | 2 | 3;
}

// ═══════════════════════════════════════════════════════════
// SENTENCE EXERCISE
// ═══════════════════════════════════════════════════════════

// Direction of the exercise
export type SyntaxDirection = 'english_to_chinese' | 'chinese_to_english';

// What modality to show/require for Chinese
export type ChineseModality = 'character' | 'pinyin' | 'audio';

// A generated sentence exercise
export interface SentenceExercise {
  id: string;
  
  // Template info
  templateId: string;
  
  // The sentence
  english: string;
  chineseWords: string[];
  pinyinWords: string[];
  
  // Metadata
  vocabularyIds: string[];
  difficulty: 1 | 2 | 3;
  
  // Direction & modality (determined at exercise time)
  direction: SyntaxDirection;
  chineseModality: ChineseModality;
}

// ═══════════════════════════════════════════════════════════
// SESSION STATE
// ═══════════════════════════════════════════════════════════

export interface SyntaxSessionState {
  currentExercise: SentenceExercise | null;
  userOrder: string[];
  submitted: boolean;
  correct: boolean | null;
}

// ═══════════════════════════════════════════════════════════
// SEMANTIC CATEGORIES
// ═══════════════════════════════════════════════════════════

export const SEMANTIC_TAGS: Record<string, string[]> = {
  time: ['今天', '明天', '昨天', '现在', '上午', '下午', '晚上', '早上', '凌晨', '星期', '月', '年', '小时', '分钟', '中午'],
  place: ['家', '学校', '医院', '商店', '饭店', '银行', '大学', '中国', '美国'],
  food: ['苹果', '茶', '水', '米饭', '菜', '鱼', '水果', '饭', '中国菜'],
  drink: ['茶', '水'],
  person: ['我', '你', '他', '她', '我们', '你们', '他们', '爸爸', '妈妈', '老师', '学生', '医生', '朋友', '同学', '儿子', '先生', '小姐'],
  readable: ['书', '汉字'],
  watchable: ['电视', '电影'],
  furniture: ['椅子', '桌子'],
  locatable: ['猫', '狗', '书', '电脑'],
  location_word: ['上面', '下面', '前面', '后面', '里面', '外面', '左边', '右边', '旁边', '对面'],
};

export function hasSemanticTag(word: string, tag: string): boolean {
  return SEMANTIC_TAGS[tag]?.includes(word) ?? false;
}
