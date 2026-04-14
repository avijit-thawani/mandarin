// User settings types

export type ThemeType = 'light' | 'dark' | 'wooden' | 'ocean' | 'forest' | 'sunset' | 'sakura' | 'ink';

export type FocusLevel = 0 | 1 | 2 | 3; // 0 = ignore, 1 = low, 2 = medium, 3 = high

// Option selection - controls how confusing distractors/options are
// easy: 4 options, obvious wrong answers
// hard: 4 options, tricky distractors (same POS, similar pinyin)
// expert: 6 options, tricky distractors + knowledge-matched + character bias
export type OptionSelection = 'easy' | 'hard' | 'expert';

// Question selection - controls which concepts get quizzed
export type QuestionSelection = 'random' | 'weak' | 'leastTested' | 'dueReview';

export interface QuizSettings {
  questionSelection: QuestionSelection;  // Which concepts to quiz
  optionSelection: OptionSelection;      // How tricky the wrong options are
}

// Syntax exercise direction ratio (Reading = Chinese→English, Writing = English→Chinese)
// Values represent the ratio index in SYNTAX_DIRECTION_OPTIONS
export type SyntaxDirectionRatio = 0 | 1 | 2 | 3 | 4;

export interface SyntaxSettings {
  directionRatio: SyntaxDirectionRatio;  // Reading:Writing ratio slider position
  frequency: FocusLevel;                 // 0=skip, 1=low, 2=med, 3=high — controls syntax question mix in Quiz
}

export interface LearningFocus {
  character: FocusLevel;  // Hanzi recognition
  pinyin: FocusLevel;     // Pinyin recall
  meaning: FocusLevel;    // English meaning
  audio: FocusLevel;      // Audio/pronunciation
}

export type PinyinDisplay = 'tones' | 'numbers'; // māma vs ma1ma1

export type CharacterSize = 'small' | 'medium' | 'large';

export type AudioProvider = 'browser' | 'elevenlabs';

// Per-browser voice preferences (different browsers have different voice sets)
export type VoicesByBrowser = Partial<Record<string, string>>;

export interface AudioSettings {
  provider: AudioProvider;
  browserVoiceId: string;      // Legacy: single voice ID (for backwards compat)
  voicesByBrowser: VoicesByBrowser;  // NEW: voice preferences per browser type
  speechRate: number;          // 0.5 - 2.0 (1.0 = normal)
  // Future: elevenlabsVoiceId, elevenlabsApiKey
}

export interface UserSettings {
  // Review settings
  cardsPerSession: number;         // 5-50, default 10
  learningFocus: LearningFocus;
  
  // Quiz settings
  quiz: QuizSettings;              // Difficulty + selection strategy
  
  // Syntax settings
  syntax: SyntaxSettings;          // Sentence construction settings
  
  // Display preferences
  theme: ThemeType;
  pinyinDisplay: PinyinDisplay;
  characterSize: CharacterSize;
  autoPlayAudio: boolean;          // Auto-play when audio section revealed
  
  // Audio/TTS settings
  audio: AudioSettings;
  
  // Study preferences
  showExampleSentences: boolean;   // When available
  shuffleMode: boolean;            // Randomize card order vs sequential
  
  // Accessibility
  reducedMotion: boolean;          // Disable animations
}

export const DEFAULT_SETTINGS: UserSettings = {
  cardsPerSession: 10,
  learningFocus: {
    character: 2,
    pinyin: 3,
    meaning: 2,
    audio: 1,
  },
  quiz: {
    questionSelection: 'random',  // Random for now, ML will tune later
    optionSelection: 'hard',      // Default to hard (more learning value)
  },
  syntax: {
    directionRatio: 1,  // Default to 2:1 reading (English→Chinese more common)
    frequency: 1,       // Low by default — a few syntax questions mixed into each quiz
  },
  theme: 'dark',
  pinyinDisplay: 'tones',
  characterSize: 'medium',
  autoPlayAudio: false,
  audio: {
    provider: 'browser',
    browserVoiceId: '',  // Legacy field (for backwards compat)
    voicesByBrowser: {
      // User's preferred voices per browser (curated defaults)
      cursor: 'Chinese Taiwan',
      safari: 'com.apple.voice.compact.zh-TW.Meijia',
      chrome: '',  // Auto-select
      arc: '',     // Auto-select
      firefox: '', // Auto-select
      edge: '',    // Auto-select
    },
    speechRate: 0.9,     // Slightly slower for learning
  },
  showExampleSentences: true,
  shuffleMode: true,
  reducedMotion: false,
};

// Focus level labels for UI
export const FOCUS_LABELS: Record<FocusLevel, string> = {
  0: 'Skip',
  1: 'Low',
  2: 'Med',
  3: 'High',
};

export const FOCUS_DESCRIPTIONS: Record<keyof LearningFocus, string> = {
  character: 'Test character recognition',
  pinyin: 'Test pinyin recall',
  meaning: 'Test English meaning',
  audio: 'Test pronunciation',
};

export const THEME_META: Record<ThemeType, { name: string; emoji: string; description: string }> = {
  light: { name: 'Light', emoji: '☀️', description: 'Clean & bright' },
  dark: { name: 'Dark', emoji: '🌙', description: 'Easy on the eyes' },
  wooden: { name: 'Wooden', emoji: '📜', description: 'Warm parchment' },
  ocean: { name: 'Ocean', emoji: '🌊', description: 'Deep blue waters' },
  forest: { name: 'Terminal', emoji: '💻', description: 'Hacker green' },
  sunset: { name: 'Sunset', emoji: '🌅', description: 'Golden warmth' },
  sakura: { name: 'Sakura', emoji: '🌸', description: 'Soft pink' },
  ink: { name: 'Ink', emoji: '🖋️', description: 'High contrast B&W' },
};

// Speech rate presets
export const SPEECH_RATE_PRESETS = [
  { value: 0.5, label: '0.5x', description: 'Very Slow' },
  { value: 0.7, label: '0.7x', description: 'Slow' },
  { value: 0.9, label: '0.9x', description: 'Learning' },
  { value: 1.0, label: '1.0x', description: 'Normal' },
  { value: 1.2, label: '1.2x', description: 'Fast' },
  { value: 1.5, label: '1.5x', description: 'Very Fast' },
];

// Option selection labels (how tricky distractors are)
export const OPTION_SELECTION_META: Record<OptionSelection, { label: string; emoji: string; description: string }> = {
  easy: { label: 'Easy', emoji: '🌱', description: '4 options, obvious answers' },
  hard: { label: 'Hard', emoji: '🔥', description: '4 options, tricky distractors' },
  expert: { label: 'Expert', emoji: '💀', description: '6 options, character focus' },
};

// Question selection labels (which concepts to quiz)
export const QUESTION_SELECTION_META: Record<QuestionSelection, { label: string; emoji: string; description: string }> = {
  random: { label: 'Random', emoji: '🎲', description: 'Mix of everything' },
  weak: { label: 'Weak Spots', emoji: '🎯', description: 'Focus on low knowledge' },
  leastTested: { label: 'Coverage', emoji: '📊', description: 'Test untested words' },
  dueReview: { label: 'Due Review', emoji: '⏰', description: 'Words not seen recently' },
};

// Syntax frequency: how many syntax exercises are mixed into each quiz session
export const SYNTAX_FREQUENCY_META: Record<FocusLevel, { label: string; description: string; fraction: number }> = {
  0: { label: 'Skip', description: 'No syntax questions', fraction: 0 },
  1: { label: 'Low', description: '~20% syntax questions', fraction: 0.2 },
  2: { label: 'Med', description: '~35% syntax questions', fraction: 0.35 },
  3: { label: 'High', description: '~50% syntax questions', fraction: 0.5 },
};

// Syntax direction ratio options
// Reading = see Chinese, produce English (comprehension)
// Writing = see English, produce Chinese (production)
export const SYNTAX_DIRECTION_OPTIONS: Array<{
  value: SyntaxDirectionRatio;
  readingWeight: number;  // Weight for Chinese→English
  writingWeight: number;  // Weight for English→Chinese
  label: string;
}> = [
  { value: 0, readingWeight: 3, writingWeight: 1, label: 'Reading focus' },
  { value: 1, readingWeight: 2, writingWeight: 1, label: 'Balanced (reading)' },
  { value: 2, readingWeight: 1, writingWeight: 1, label: 'Equal' },
  { value: 3, readingWeight: 1, writingWeight: 2, label: 'Balanced (writing)' },
  { value: 4, readingWeight: 1, writingWeight: 3, label: 'Writing focus' },
];
