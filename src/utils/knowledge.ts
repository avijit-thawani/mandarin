// Knowledge scoring utilities for modality-based learning

import type { ModalityScore, Modality, ConceptModality, Concept } from '../types/vocabulary';
import type { LearningFocus } from '../types/settings';
import { createDefaultModalityScore } from '../types/vocabulary';

// ═══════════════════════════════════════════════════════════
// INITIAL KNOWLEDGE (Chapter-based Prior)
// ═══════════════════════════════════════════════════════════

/**
 * Calculate initial knowledge based on chapter (word frequency proxy)
 * Earlier chapters = more common words = easier = higher prior
 * 
 * Chapter 1: 70 (你, 好, 您 - very common)
 * Chapter 8: 50 (medium frequency)
 * Chapter 15: 30 (less common)
 */
export function getInitialKnowledge(chapter: number): number {
  // Linear interpolation: chapter 1 → 70, chapter 15 → 30
  const minKnowledge = 30;
  const maxKnowledge = 70;
  const minChapter = 1;
  const maxChapter = 15;
  
  // Clamp chapter to valid range
  const clampedChapter = Math.max(minChapter, Math.min(maxChapter, chapter));
  
  // Interpolate (higher chapter = lower knowledge)
  const ratio = (clampedChapter - minChapter) / (maxChapter - minChapter);
  return Math.round(maxKnowledge - ratio * (maxKnowledge - minKnowledge));
}

/**
 * Create initial modality scores for a new concept
 */
export function createInitialModality(chapter: number): ConceptModality {
  const initialKnowledge = getInitialKnowledge(chapter);
  return {
    character: createDefaultModalityScore(initialKnowledge),
    pinyin: createDefaultModalityScore(initialKnowledge),
    meaning: createDefaultModalityScore(initialKnowledge),
    audio: createDefaultModalityScore(initialKnowledge),
  };
}

// ═══════════════════════════════════════════════════════════
// KNOWLEDGE UPDATE FORMULA
// ═══════════════════════════════════════════════════════════

// Update rates for different scenarios
const UPDATE_RATES = {
  // Answer modality (active recall - primary test)
  answer: {
    gain: 0.25,    // 25% toward 100 on correct
    loss: 0.175,   // 17.5% toward 0 on incorrect
  },
  // Question modality (passive recognition - secondary benefit)
  question: {
    gain: 0.12,    // 12% toward 100 on correct (you recognized it)
    loss: 0.08,    // 8% toward 0 on incorrect (might still know it)
  },
};

/**
 * Update modality knowledge after a quiz answer
 * 
 * Asymmetric update:
 * - Correct: Move toward 100 (successes boost confidence)
 * - Incorrect: Move toward 0 (mistakes hurt less than successes help)
 * 
 * @param isAnswerModality - true for answer modality (higher rates), false for question modality (lower rates)
 */
export function updateKnowledge(current: number, correct: boolean, isAnswerModality: boolean = true): number {
  const rates = isAnswerModality ? UPDATE_RATES.answer : UPDATE_RATES.question;
  
  let newKnowledge: number;
  
  if (correct) {
    // Move toward 100
    newKnowledge = current + (100 - current) * rates.gain;
  } else {
    // Move toward 0 (but gentler)
    newKnowledge = current - current * rates.loss;
  }
  
  // Clamp to 0-100 and round
  return Math.round(Math.max(0, Math.min(100, newKnowledge)));
}

/**
 * Update a modality score after a quiz answer
 * @param isAnswerModality - true for answer modality (higher rates), false for question modality (lower rates)
 */
export function updateModalityScore(
  current: ModalityScore,
  correct: boolean,
  isAnswerModality: boolean = true
): ModalityScore {
  return {
    knowledge: updateKnowledge(current.knowledge, correct, isAnswerModality),
    attempts: current.attempts + 1,
    successes: current.successes + (correct ? 1 : 0),
    lastAttempt: new Date().toISOString(),
  };
}

// ═══════════════════════════════════════════════════════════
// KNOWLEDGE DECAY (selection-time only, not persisted)
// ═══════════════════════════════════════════════════════════

// Mastered words that aren't revisited slowly "fade" so they resurface in
// harder quiz selection. This decay is applied virtually during question
// selection only — it is never written back to stored knowledge, so it cannot
// corrupt user_progress or trigger destructive sync writes.
export const KNOWLEDGE_DECAY_PER_DAY = 1.5; // points lost per idle day
export const KNOWLEDGE_DECAY_FLOOR = 40;    // decay never pushes below this

/**
 * Effective knowledge for a modality at selection time.
 * High scores that haven't been tested recently fade toward KNOWLEDGE_DECAY_FLOOR,
 * making stale "mastered" words eligible for harder quizzes again.
 * Words already at/below the floor are unaffected.
 */
export function effectiveKnowledge(score: ModalityScore, now: number = Date.now()): number {
  if (!score.lastAttempt) return score.knowledge;
  const days = (now - new Date(score.lastAttempt).getTime()) / (1000 * 60 * 60 * 24);
  if (days <= 0) return score.knowledge;
  const decayed = score.knowledge - days * KNOWLEDGE_DECAY_PER_DAY;
  const floor = Math.min(score.knowledge, KNOWLEDGE_DECAY_FLOOR);
  return Math.round(Math.max(floor, decayed));
}

// ═══════════════════════════════════════════════════════════
// OVERALL KNOWLEDGE COMPUTATION
// ═══════════════════════════════════════════════════════════

/**
 * Compute overall concept knowledge as weighted average of modalities
 * Weighted by user's Learning Focus settings
 */
export function computeConceptKnowledge(
  modality: ConceptModality,
  learningFocus: LearningFocus
): number {
  const weights = {
    character: learningFocus.character,
    pinyin: learningFocus.pinyin,
    meaning: learningFocus.meaning,
    audio: learningFocus.audio,
  };
  
  // Sum of (knowledge * weight) / sum of weights
  let weightedSum = 0;
  let totalWeight = 0;
  
  for (const mod of ['character', 'pinyin', 'meaning', 'audio'] as const) {
    const weight = weights[mod];
    if (weight > 0) {
      weightedSum += modality[mod].knowledge * weight;
      totalWeight += weight;
    }
  }
  
  if (totalWeight === 0) {
    // Fallback: equal weights if all focus levels are 0
    return Math.round(
      (modality.character.knowledge + modality.pinyin.knowledge + 
       modality.meaning.knowledge + modality.audio.knowledge) / 4
    );
  }
  
  return Math.round(weightedSum / totalWeight);
}

// ═══════════════════════════════════════════════════════════
// STATISTICS HELPERS
// ═══════════════════════════════════════════════════════════

/**
 * Calculate success rate for a modality (0-100)
 */
export function getSuccessRate(modality: ModalityScore): number {
  if (modality.attempts === 0) return 0;
  return Math.round((modality.successes / modality.attempts) * 100);
}

/**
 * Get average knowledge across all modalities for a concept
 */
export function getAverageKnowledge(modality: ConceptModality): number {
  return Math.round(
    (modality.character.knowledge + modality.pinyin.knowledge + 
     modality.meaning.knowledge + modality.audio.knowledge) / 4
  );
}

/**
 * Compute modality averages across all concepts
 * Only includes concepts that have been tested (attempts > 0) for each modality
 * Untested modalities are excluded from the average to avoid skewing by defaults
 */
export function computeModalityAverages(concepts: Concept[]): Record<Modality, number> {
  if (concepts.length === 0) {
    return { character: 0, pinyin: 0, meaning: 0, audio: 0 };
  }
  
  // Track sum and count separately for each modality (only tested ones)
  const stats = {
    character: { sum: 0, count: 0 },
    pinyin: { sum: 0, count: 0 },
    meaning: { sum: 0, count: 0 },
    audio: { sum: 0, count: 0 },
  };
  
  for (const concept of concepts) {
    // Only include modalities that have been tested (attempts > 0)
    if (concept.modality.character.attempts > 0) {
      stats.character.sum += concept.modality.character.knowledge;
      stats.character.count++;
    }
    if (concept.modality.pinyin.attempts > 0) {
      stats.pinyin.sum += concept.modality.pinyin.knowledge;
      stats.pinyin.count++;
    }
    if (concept.modality.meaning.attempts > 0) {
      stats.meaning.sum += concept.modality.meaning.knowledge;
      stats.meaning.count++;
    }
    if (concept.modality.audio.attempts > 0) {
      stats.audio.sum += concept.modality.audio.knowledge;
      stats.audio.count++;
    }
  }
  
  return {
    character: stats.character.count > 0 ? Math.round(stats.character.sum / stats.character.count) : 0,
    pinyin: stats.pinyin.count > 0 ? Math.round(stats.pinyin.sum / stats.pinyin.count) : 0,
    meaning: stats.meaning.count > 0 ? Math.round(stats.meaning.sum / stats.meaning.count) : 0,
    audio: stats.audio.count > 0 ? Math.round(stats.audio.sum / stats.audio.count) : 0,
  };
}

/**
 * Count concepts by knowledge threshold
 */
export function countByKnowledge(concepts: Concept[]): {
  above80: number;
  above50: number;
  below50: number;
} {
  let above80 = 0;
  let above50 = 0;
  let below50 = 0;
  
  for (const c of concepts) {
    if (c.knowledge >= 80) above80++;
    else if (c.knowledge >= 50) above50++;
    else below50++;
  }
  
  return { above80, above50, below50 };
}

// ═══════════════════════════════════════════════════════════
// PREDICTION (for future calibration)
// ═══════════════════════════════════════════════════════════

/**
 * Predict probability of correct answer for a quiz task
 * Uses the answer modality's knowledge score
 */
export function predictCorrect(concept: Concept, answerModality: Modality): number {
  return concept.modality[answerModality].knowledge;
}
