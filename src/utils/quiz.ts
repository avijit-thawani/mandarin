// Quiz generation utilities

import type { 
  Concept, 
  Modality, 
  QuizTaskType, 
  QuizQuestion, 
  QuizSession 
} from '../types/vocabulary';
import type { LearningFocus, OptionSelection, QuestionSelection } from '../types/settings';
import { parseTaskType, QUIZ_TASK_TYPES } from '../types/vocabulary';

// ═══════════════════════════════════════════════════════════
// TASK TYPE SELECTION
// ═══════════════════════════════════════════════════════════

/**
 * Get weight for a task type based on learning focus settings
 * Both question and answer modalities contribute to the weight
 */
function getTaskWeight(taskType: QuizTaskType, learningFocus: LearningFocus): number {
  const { question, answer } = parseTaskType(taskType);
  
  const questionWeight = learningFocus[question];
  const answerWeight = learningFocus[answer];
  
  // If either modality is 0 (skip), don't select this task type
  if (questionWeight === 0 || answerWeight === 0) {
    return 0;
  }
  
  // Combined weight (multiply for stronger preference when both are high)
  return questionWeight * answerWeight;
}

/**
 * Select a random task type weighted by learning focus
 * Expert mode: bias toward character-involved tasks (harder)
 */
export function selectTaskType(learningFocus: LearningFocus, expertMode: boolean = false): QuizTaskType {
  const weights = QUIZ_TASK_TYPES.map(taskType => {
    let weight = getTaskWeight(taskType, learningFocus);
    
    // Expert mode: boost character-involved tasks (they're harder)
    if (expertMode && weight > 0) {
      const { question, answer } = parseTaskType(taskType);
      if (question === 'character' || answer === 'character') {
        weight *= 2.5; // 2.5x boost for character tasks
      }
    }
    
    return { taskType, weight };
  }).filter(item => item.weight > 0);
  
  if (weights.length === 0) {
    // Fallback: character_to_meaning if all weights are 0
    return 'character_to_meaning';
  }
  
  const totalWeight = weights.reduce((sum, item) => sum + item.weight, 0);
  let random = Math.random() * totalWeight;
  
  for (const { taskType, weight } of weights) {
    random -= weight;
    if (random <= 0) {
      return taskType;
    }
  }
  
  return weights[weights.length - 1].taskType;
}

// ═══════════════════════════════════════════════════════════
// DISTRACTOR SELECTION
// ═══════════════════════════════════════════════════════════

/**
 * Get the value of a concept for a given modality (used for collision detection)
 * For audio, use the word since that's what gets spoken
 */
function getModalityValue(concept: Concept, modality: Modality): string {
  switch (modality) {
    case 'character':
      return concept.word;
    case 'pinyin':
      return concept.pinyin.toLowerCase(); // Normalize for comparison
    case 'meaning':
      return concept.meaning.toLowerCase(); // Normalize for comparison
    case 'audio':
      return concept.word; // Audio uses the character for TTS
    default:
      return '';
  }
}

/**
 * Check if a candidate would create a collision with target or selected distractors
 * 
 * A collision occurs when:
 * 1. Candidate has same value as target for ANSWER modality (duplicate option)
 * 2. Candidate has same value as target for QUESTION modality (equally correct answer)
 * 3. Candidate has same value as an already-selected distractor for ANSWER modality
 */
function hasCollision(
  candidate: Concept,
  target: Concept,
  selectedDistractors: Concept[],
  questionModality: Modality,
  answerModality: Modality
): boolean {
  const targetQuestionValue = getModalityValue(target, questionModality);
  const targetAnswerValue = getModalityValue(target, answerModality);
  const candidateQuestionValue = getModalityValue(candidate, questionModality);
  const candidateAnswerValue = getModalityValue(candidate, answerModality);
  
  // Check collision with target's question value (would make distractor also correct)
  if (candidateQuestionValue === targetQuestionValue) {
    return true;
  }
  
  // Check collision with target's answer value (duplicate display)
  if (candidateAnswerValue === targetAnswerValue) {
    return true;
  }
  
  // Check collision with already-selected distractors' answer values
  for (const selected of selectedDistractors) {
    if (candidateAnswerValue === getModalityValue(selected, answerModality)) {
      return true;
    }
  }
  
  return false;
}

/**
 * Calculate pinyin similarity score (0-1)
 * Higher = more similar (same tone, similar initial/final)
 */
function pinyinSimilarity(pinyin1: string, pinyin2: string): number {
  const p1 = pinyin1.toLowerCase();
  const p2 = pinyin2.toLowerCase();
  
  // Extract tone numbers (1-4) from pinyin if present
  const tone1 = p1.match(/[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]/);
  const tone2 = p2.match(/[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]/);
  
  let score = 0;
  
  // Same tone mark category adds similarity
  if (tone1 && tone2) {
    const toneMap: Record<string, number> = {
      'ā': 1, 'ē': 1, 'ī': 1, 'ō': 1, 'ū': 1, 'ǖ': 1,
      'á': 2, 'é': 2, 'í': 2, 'ó': 2, 'ú': 2, 'ǘ': 2,
      'ǎ': 3, 'ě': 3, 'ǐ': 3, 'ǒ': 3, 'ǔ': 3, 'ǚ': 3,
      'à': 4, 'è': 4, 'ì': 4, 'ò': 4, 'ù': 4, 'ǜ': 4,
    };
    if (toneMap[tone1[0]] === toneMap[tone2[0]]) {
      score += 0.3;
    }
  }
  
  // Same first character (initial consonant) adds similarity
  if (p1[0] === p2[0]) {
    score += 0.3;
  }
  
  // Similar length adds similarity
  if (Math.abs(p1.length - p2.length) <= 1) {
    score += 0.2;
  }
  
  // Same ending adds similarity
  if (p1.slice(-2) === p2.slice(-2)) {
    score += 0.2;
  }
  
  return score;
}

/**
 * Detect the character repetition pattern of a word.
 * Returns a normalized structure signature, e.g.:
 *   爸爸 → "AA", 谢谢 → "AA", 妈妈 → "AA"
 *   学生 → "AB", 一 → "A", 出租车 → "ABC"
 */
function charPattern(word: string): string {
  const chars = [...word]; // spread handles multi-byte correctly
  const map = new Map<string, string>();
  let nextLabel = 'A';
  return chars.map(ch => {
    if (!map.has(ch)) {
      map.set(ch, nextLabel);
      nextLabel = String.fromCharCode(nextLabel.charCodeAt(0) + 1);
    }
    return map.get(ch)!;
  }).join('');
}

/**
 * Select distractors for a quiz question
 * 
 * Strategy varies by difficulty:
 * - Easy: Prefer different length, different POS, far chapters (4 options)
 * - Hard: Prefer similar length, same POS, nearby chapters, similar pinyin,
 *         same semantic category, similar character structure (4 options)
 * - Expert: Same as hard + knowledge-matched distractors (6 options)
 * 
 * Always:
 * 1. Exclude candidates that would create collisions (same answer or question value)
 * 2. Apply difficulty-based scoring
 * 3. Random selection from weighted pool
 */
export function selectDistractors(
  target: Concept,
  allConcepts: Concept[],
  questionModality: Modality,
  answerModality: Modality,
  count: number = 3,
  optionSelection: OptionSelection = 'hard'
): Concept[] {
  // Exclude the target itself
  const candidates = allConcepts.filter(c => c.id !== target.id && !c.paused);
  
  const isEasy = optionSelection === 'easy';
  const isExpert = optionSelection === 'expert';
  const isHardOrExpert = optionSelection === 'hard' || optionSelection === 'expert';
  
  const targetPattern = charPattern(target.word);
  
  // Score candidates by difficulty-adjusted similarity
  const scored = candidates.map(candidate => {
    let score = 1; // Base score
    
    // === Semantic Category (strongest signal for hard/expert) ===
    // Hard/Expert: same category = semantically confusing = highest boost
    // Easy: different category = obviously unrelated = boost
    if (candidate.category === target.category) {
      score += isHardOrExpert ? 5 : -2;
    } else {
      score += isEasy ? 2 : 0;
    }
    
    // === Part of Speech ===
    if (candidate.part_of_speech === target.part_of_speech) {
      score += isHardOrExpert ? 3 : -1;
    } else {
      score += isEasy ? 2 : 0;
    }
    
    // === Character Structure Similarity ===
    // Prefer distractors with the same repetition pattern (AA, AB, ABC etc.)
    // Prevents the "spot the doubled character" shortcut
    if (isHardOrExpert && charPattern(candidate.word) === targetPattern) {
      score += 3;
    }
    
    // === Chapter Proximity ===
    const chapterDiff = Math.abs(candidate.chapter - target.chapter);
    if (isHardOrExpert) {
      if (chapterDiff <= 2) score += 2;
      else if (chapterDiff <= 5) score += 1;
    } else {
      if (chapterDiff >= 5) score += 2;
      else if (chapterDiff >= 3) score += 1;
    }
    
    // === Word Length Similarity ===
    const lengthDiff = Math.abs(candidate.word.length - target.word.length);
    if (isHardOrExpert) {
      if (lengthDiff === 0) score += 2;
      else if (lengthDiff === 1) score += 1;
    } else {
      if (lengthDiff >= 2) score += 2;
      else if (lengthDiff >= 1) score += 1;
    }
    
    // === Pinyin Similarity (Hard/Expert mode only) ===
    if (isHardOrExpert) {
      const pSim = pinyinSimilarity(candidate.pinyin, target.pinyin);
      score += pSim * 2; // Max +2 for very similar pinyin
    }
    
    // === Knowledge Matching (Expert mode only) ===
    if (isExpert) {
      const knowledgeDiff = Math.abs(candidate.knowledge - target.knowledge);
      if (knowledgeDiff <= 10) score += 3;
      else if (knowledgeDiff <= 20) score += 2;
      else if (knowledgeDiff <= 30) score += 1;
    }
    
    // Small random factor to avoid always picking same distractors
    score += Math.random() * 0.5;
    
    return { concept: candidate, score };
  });
  
  // Sort by score (descending)
  scored.sort((a, b) => b.score - a.score);
  
  // Select distractors one by one, checking for collisions
  const selectedDistractors: Concept[] = [];
  
  for (const { concept } of scored) {
    if (selectedDistractors.length >= count) break;
    
    // Skip if this candidate would create a collision
    if (hasCollision(concept, target, selectedDistractors, questionModality, answerModality)) {
      continue;
    }
    
    selectedDistractors.push(concept);
  }
  
  // Shuffle the final selection to add variety
  return shuffleArray(selectedDistractors);
}

// ═══════════════════════════════════════════════════════════
// QUIZ GENERATION
// ═══════════════════════════════════════════════════════════

/**
 * Get number of distractors based on option selection
 * Easy/Hard: 3 distractors (4 total options)
 * Expert: 5 distractors (6 total options)
 */
function getDistractorCount(optionSelection: OptionSelection): number {
  return optionSelection === 'expert' ? 5 : 3;
}

/**
 * Generate a single quiz question
 */
export function generateQuestion(
  concept: Concept,
  allConcepts: Concept[],
  learningFocus: LearningFocus,
  optionSelection: OptionSelection = 'hard'
): QuizQuestion {
  const isExpert = optionSelection === 'expert';
  const taskType = selectTaskType(learningFocus, isExpert);
  const { question: questionModality, answer: answerModality } = parseTaskType(taskType);
  
  // Select distractors with collision detection for both modalities
  // Expert mode: 5 distractors (6 total), otherwise 3 (4 total)
  const distractorCount = getDistractorCount(optionSelection);
  const distractors = selectDistractors(
    concept,
    allConcepts,
    questionModality,
    answerModality,
    distractorCount,
    optionSelection
  );
  
  // Create options array: correct answer + distractors
  const options = [concept, ...distractors];
  
  // Shuffle options
  const shuffledOptions = shuffleArray(options);
  const correctIndex = shuffledOptions.findIndex(o => o.id === concept.id);
  
  return {
    concept,
    taskType,
    questionModality,
    answerModality,
    options: shuffledOptions,
    correctIndex,
  };
}

/**
 * Generate a full quiz session
 */
export function generateQuizSession(
  concepts: Concept[],
  questionCount: number,
  learningFocus: LearningFocus,
  questionSelection: QuestionSelection = 'random',
  optionSelection: OptionSelection = 'hard'
): QuizSession {
  // Filter to non-paused concepts
  const availableConcepts = concepts.filter(c => !c.paused);
  
  if (availableConcepts.length === 0) {
    return {
      questions: [],
      currentIndex: 0,
      answers: [],
      startedAt: new Date().toISOString(),
      completedAt: null,
    };
  }
  
  // Select concepts based on strategy
  const selectedConcepts = selectConceptsByStrategy(
    availableConcepts,
    questionCount,
    questionSelection,
    learningFocus
  );
  
  // Generate questions
  const questions = selectedConcepts.map(concept =>
    generateQuestion(concept, availableConcepts, learningFocus, optionSelection)
  );
  
  return {
    questions,
    currentIndex: 0,
    answers: [],
    startedAt: new Date().toISOString(),
    completedAt: null,
  };
}

/**
 * Select concepts based on question selection strategy
 */
function selectConceptsByStrategy(
  concepts: Concept[],
  count: number,
  questionSelection: QuestionSelection,
  learningFocus: LearningFocus
): Concept[] {
  if (concepts.length === 0) return [];
  
  switch (questionSelection) {
    case 'weak':
      return selectWeakConcepts(concepts, count, learningFocus);
    case 'leastTested':
      return selectLeastTestedConcepts(concepts, count);
    case 'dueReview':
      return selectDueForReviewConcepts(concepts, count);
    case 'random':
    default:
      return selectRandomConcepts(concepts, count);
  }
}

/**
 * Select random concepts for a quiz session
 * Allows repeats if we need more questions than available concepts
 */
function selectRandomConcepts(concepts: Concept[], count: number): Concept[] {
  if (concepts.length === 0) return [];
  
  // Shuffle and repeat if needed
  const selected: Concept[] = [];
  let pool = shuffleArray([...concepts]);
  let poolIndex = 0;
  
  for (let i = 0; i < count; i++) {
    if (poolIndex >= pool.length) {
      // Reshuffle and restart
      pool = shuffleArray([...concepts]);
      poolIndex = 0;
    }
    selected.push(pool[poolIndex]);
    poolIndex++;
  }
  
  return selected;
}

/**
 * Select concepts with lowest knowledge (weak spots)
 * Weighted by learning focus to prioritize relevant modalities
 */
function selectWeakConcepts(
  concepts: Concept[],
  count: number,
  learningFocus: LearningFocus
): Concept[] {
  // Score each concept by weakness (lower knowledge = higher score)
  const scored = concepts.map(c => {
    // Weighted average of modality knowledge, inverted
    let weightedKnowledge = 0;
    let totalWeight = 0;
    
    const modalities = ['character', 'pinyin', 'meaning', 'audio'] as const;
    for (const mod of modalities) {
      const weight = learningFocus[mod];
      if (weight > 0) {
        weightedKnowledge += c.modality[mod].knowledge * weight;
        totalWeight += weight;
      }
    }
    
    const avgKnowledge = totalWeight > 0 ? weightedKnowledge / totalWeight : c.knowledge;
    
    // Invert: lower knowledge = higher score for selection
    // Add small random factor for variety
    const score = (100 - avgKnowledge) + Math.random() * 10;
    
    return { concept: c, score };
  });
  
  // Sort by score (descending = weakest first)
  scored.sort((a, b) => b.score - a.score);
  
  // Take top concepts, allow repeats if needed
  const selected: Concept[] = [];
  let idx = 0;
  
  for (let i = 0; i < count; i++) {
    if (idx >= scored.length) idx = 0; // Wrap around
    selected.push(scored[idx].concept);
    idx++;
  }
  
  return selected;
}

/**
 * Select concepts with fewest total attempts (ensure coverage)
 */
function selectLeastTestedConcepts(concepts: Concept[], count: number): Concept[] {
  // Score by total attempts across all modalities (fewer = higher priority)
  const scored = concepts.map(c => {
    const totalAttempts = 
      c.modality.character.attempts +
      c.modality.pinyin.attempts +
      c.modality.meaning.attempts +
      c.modality.audio.attempts;
    
    // Invert: fewer attempts = higher score
    // Add random factor for variety among equally-tested concepts
    const score = (1000 - totalAttempts) + Math.random() * 10;
    
    return { concept: c, score };
  });
  
  scored.sort((a, b) => b.score - a.score);
  
  const selected: Concept[] = [];
  let idx = 0;
  
  for (let i = 0; i < count; i++) {
    if (idx >= scored.length) idx = 0;
    selected.push(scored[idx].concept);
    idx++;
  }
  
  return selected;
}

/**
 * Select concepts that haven't been tested recently (spaced repetition)
 */
function selectDueForReviewConcepts(concepts: Concept[], count: number): Concept[] {
  const now = Date.now();
  
  // Score by time since last attempt (longer = higher priority)
  const scored = concepts.map(c => {
    // Find most recent attempt across all modalities
    const lastAttempts = [
      c.modality.character.lastAttempt,
      c.modality.pinyin.lastAttempt,
      c.modality.meaning.lastAttempt,
      c.modality.audio.lastAttempt,
    ].filter(Boolean) as string[];
    
    let score: number;
    
    if (lastAttempts.length === 0) {
      // Never tested = highest priority
      score = Infinity;
    } else {
      // Most recent attempt
      const mostRecent = Math.max(...lastAttempts.map(d => new Date(d).getTime()));
      const daysSince = (now - mostRecent) / (1000 * 60 * 60 * 24);
      score = daysSince;
    }
    
    // Add small random factor
    score += Math.random() * 0.5;
    
    return { concept: c, score };
  });
  
  scored.sort((a, b) => b.score - a.score);
  
  const selected: Concept[] = [];
  let idx = 0;
  
  for (let i = 0; i < count; i++) {
    if (idx >= scored.length) idx = 0;
    selected.push(scored[idx].concept);
    idx++;
  }
  
  return selected;
}

// ═══════════════════════════════════════════════════════════
// CONTENT GETTERS FOR QUIZ DISPLAY
// ═══════════════════════════════════════════════════════════

/**
 * Get the display content for a modality
 */
export function getModalityContent(concept: Concept, modality: Modality): string {
  switch (modality) {
    case 'character':
      return concept.word;
    case 'pinyin':
      return concept.pinyin;
    case 'meaning':
      return concept.meaning;
    case 'audio':
      return concept.word; // For audio, we use the word for TTS
    default:
      return '';
  }
}

/**
 * Check if a modality needs audio playback
 */
export function modalityNeedsAudio(modality: Modality): boolean {
  return modality === 'audio';
}

// ═══════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════

/**
 * Fisher-Yates shuffle
 */
export function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * Get task type display text
 */
export function getTaskTypeDisplay(taskType: QuizTaskType): string {
  const { question, answer } = parseTaskType(taskType);
  const labels: Record<Modality, string> = {
    character: 'Character',
    pinyin: 'Pinyin',
    meaning: 'Meaning',
    audio: 'Audio',
  };
  return `${labels[question]} → ${labels[answer]}`;
}

/**
 * Get question prompt based on task type
 */
export function getQuestionPrompt(taskType: QuizTaskType): string {
  const prompts: Record<string, string> = {
    'character_to_pinyin': 'What is the pinyin?',
    'character_to_meaning': 'What does this mean?',
    'character_to_audio': 'How is this pronounced?',
    'pinyin_to_character': 'Which character is this?',
    'pinyin_to_meaning': 'What does this mean?',
    'pinyin_to_audio': 'How is this pronounced?',
    'meaning_to_character': 'Which character means this?',
    'meaning_to_pinyin': 'What is the pinyin?',
    'meaning_to_audio': 'How do you say this?',
    'audio_to_character': 'Which character did you hear?',
    'audio_to_pinyin': 'What is the pinyin?',
    'audio_to_meaning': 'What does this mean?',
  };
  
  return prompts[taskType] || 'Select the correct answer';
}
