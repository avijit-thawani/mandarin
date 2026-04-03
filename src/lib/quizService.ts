// Quiz service for Supabase quiz attempt writes

import { supabase, isSupabaseConfigured } from './supabase';
import type { QuizAttempt, Modality, Concept } from '../types/vocabulary';
import type { OptionSelection, QuestionSelection } from '../types/settings';

/**
 * Context snapshot for ML feature logging
 * Flexible JSON structure - can add/remove fields without migrations
 */
export interface QuizAttemptContext {
  // Concept knowledge at time of question
  conceptKnowledge: {
    questionModality: number;
    answerModality: number;
    overall: number;
  };
  
  // User's average modality scores across all concepts
  userAverages: {
    character: number;
    pinyin: number;
    meaning: number;
    audio: number;
  };
  
  // Distractor knowledge scores (for ML to learn which distractors are confusing)
  distractors: Array<{
    id: string;
    knowledge: number;
  }>;
  
  // Quiz settings at time of question
  settings: {
    questionSelection: QuestionSelection;
    optionSelection: OptionSelection;
  };
  
  // Timing info
  daysSinceLastAttempt: number | null;
}

/**
 * Build context object for a quiz attempt
 */
export function buildQuizContext(
  concept: Concept,
  questionModality: Modality,
  answerModality: Modality,
  distractors: Concept[],
  userAverages: Record<Modality, number>,
  questionSelection: QuestionSelection,
  optionSelection: OptionSelection
): QuizAttemptContext {
  // Calculate days since last attempt on answer modality
  const lastAttempt = concept.modality[answerModality].lastAttempt;
  let daysSinceLastAttempt: number | null = null;
  if (lastAttempt) {
    const msPerDay = 1000 * 60 * 60 * 24;
    daysSinceLastAttempt = Math.round((Date.now() - new Date(lastAttempt).getTime()) / msPerDay * 10) / 10;
  }
  
  return {
    conceptKnowledge: {
      questionModality: concept.modality[questionModality].knowledge,
      answerModality: concept.modality[answerModality].knowledge,
      overall: concept.knowledge,
    },
    userAverages: {
      character: userAverages.character,
      pinyin: userAverages.pinyin,
      meaning: userAverages.meaning,
      audio: userAverages.audio,
    },
    distractors: distractors.map(d => ({
      id: d.id,
      knowledge: d.knowledge,
    })),
    settings: {
      questionSelection,
      optionSelection,
    },
    daysSinceLastAttempt,
  };
}

/**
 * Save a quiz attempt to Supabase (async, non-blocking)
 * Returns immediately - doesn't wait for server response
 * 
 * NOTE: Database schema uses vocabulary_id, task_type, knowledge_before/after
 * We store additional info (options, selected index, prediction) in context JSON
 */
export function saveQuizAttempt(
  userId: string,
  vocabularyId: string,
  questionModality: Modality,
  answerModality: Modality,
  optionConceptIds: [string, string, string, string],
  selectedIndex: 0 | 1 | 2 | 3,
  correct: boolean,
  predictedCorrect: number,
  context?: QuizAttemptContext
): void {
  if (!isSupabaseConfigured()) {
    console.warn('[QuizService] Supabase not configured, skipping save');
    return;
  }

  // Build task type from modalities
  const taskType = `${questionModality}_to_${answerModality}`;
  
  // Get knowledge values from context (or use defaults)
  const knowledgeBefore = context?.conceptKnowledge.answerModality ?? 50;
  const knowledgeAfter = correct 
    ? Math.round(knowledgeBefore + (100 - knowledgeBefore) * 0.25)
    : Math.round(knowledgeBefore - knowledgeBefore * 0.175);
  
  // Extend context with additional info not in schema columns
  const extendedContext = {
    ...context,
    optionIds: optionConceptIds,
    selectedIndex,
    predictedCorrect,
  };

  // Fire and forget - don't await
  supabase
    .from('quiz_attempts')
    .insert({
      user_id: userId,
      vocabulary_id: vocabularyId,
      task_type: taskType,
      question_modality: questionModality,
      answer_modality: answerModality,
      correct,
      knowledge_before: knowledgeBefore,
      knowledge_after: knowledgeAfter,
      context: extendedContext,
    })
    .then(({ error }) => {
      if (error) {
        console.error('[QuizService] Failed to save quiz attempt:', error);
      }
    });
}

/**
 * Fetch quiz attempts for a user (for progress computation)
 */
export async function fetchQuizAttempts(
  userId: string,
  limit: number = 1000
): Promise<{ attempts: QuizAttempt[]; error: string | null }> {
  if (!isSupabaseConfigured()) {
    return { attempts: [], error: 'Supabase not configured' };
  }

  try {
    const { data, error } = await supabase
      .from('quiz_attempts')
      .select('*')
      .eq('user_id', userId)
      .order('timestamp', { ascending: false })
      .limit(limit);

    if (error) {
      return { attempts: [], error: error.message };
    }

    // Map database columns to TypeScript interface
    const attempts: QuizAttempt[] = (data || []).map((row: {
      id: string;
      user_id: string;
      timestamp: string;
      concept_id: string;
      question_modality: string;
      answer_modality: string;
      option_concept_ids: string[];
      selected_index: number;
      correct: boolean;
      predicted_correct: number;
    }) => ({
      id: row.id,
      userId: row.user_id,
      timestamp: row.timestamp,
      conceptId: row.concept_id,
      questionModality: row.question_modality as Modality,
      answerModality: row.answer_modality as Modality,
      optionConceptIds: row.option_concept_ids as [string, string, string, string],
      selectedIndex: row.selected_index as 0 | 1 | 2 | 3,
      correct: row.correct,
      predictedCorrect: row.predicted_correct,
    }));

    return { attempts, error: null };
  } catch (err) {
    return {
      attempts: [],
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

/**
 * Get quiz stats for a date range
 */
export async function getQuizStats(
  userId: string,
  startDate: Date,
  endDate: Date = new Date()
): Promise<{
  totalAttempts: number;
  totalCorrect: number;
  byDate: Record<string, { attempts: number; correct: number }>;
  error: string | null;
}> {
  if (!isSupabaseConfigured()) {
    return {
      totalAttempts: 0,
      totalCorrect: 0,
      byDate: {},
      error: 'Supabase not configured',
    };
  }

  try {
    const { data, error } = await supabase
      .from('quiz_attempts')
      .select('created_at, correct')
      .eq('user_id', userId)
      .gte('created_at', startDate.toISOString())
      .lte('created_at', endDate.toISOString())
      .limit(10000);

    if (error) {
      return {
        totalAttempts: 0,
        totalCorrect: 0,
        byDate: {},
        error: error.message,
      };
    }

    const attempts = data || [];
    const byDate: Record<string, { attempts: number; correct: number }> = {};
    let totalCorrect = 0;

    if (attempts.length > 0) {
      const sample = attempts[0].created_at;
      console.log('[getQuizStats] raw created_at sample:', JSON.stringify(sample), 'type:', typeof sample);
    }

    for (const attempt of attempts) {
      const raw = String(attempt.created_at);
      const date = raw.substring(0, 10);
      if (!byDate[date]) {
        byDate[date] = { attempts: 0, correct: 0 };
      }
      byDate[date].attempts++;
      if (attempt.correct) {
        byDate[date].correct++;
        totalCorrect++;
      }
    }

    console.log('[getQuizStats]', attempts.length, 'rows,', Object.keys(byDate).length, 'days');

    return {
      totalAttempts: attempts.length,
      totalCorrect,
      byDate,
      error: null,
    };
  } catch (err) {
    return {
      totalAttempts: 0,
      totalCorrect: 0,
      byDate: {},
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

/**
 * Get today's quiz count
 */
export async function getTodayQuizCount(userId: string): Promise<number> {
  if (!isSupabaseConfigured()) return 0;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  try {
    const { count, error } = await supabase
      .from('quiz_attempts')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('timestamp', today.toISOString());

    if (error) {
      console.error('[QuizService] Error getting today count:', error);
      return 0;
    }

    return count || 0;
  } catch {
    return 0;
  }
}
