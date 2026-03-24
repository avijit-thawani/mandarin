// Sync service for Supabase cloud storage (normalized schema)
import { supabase, isSupabaseConfigured } from './supabase';
import type { Concept, ConceptModality } from '../types/vocabulary';
import { createInitialModality } from '../utils/knowledge';

export interface SyncResult {
  success: boolean;
  error?: string;
  conceptsUploaded?: number;
}

// Check if modality object is valid (has all required fields with proper structure)
function isValidModality(modality: unknown): modality is ConceptModality {
  if (!modality || typeof modality !== 'object') return false;
  const m = modality as Record<string, unknown>;
  const requiredKeys = ['character', 'pinyin', 'meaning', 'audio'];
  for (const key of requiredKeys) {
    const score = m[key];
    if (!score || typeof score !== 'object') return false;
    const s = score as Record<string, unknown>;
    if (typeof s.knowledge !== 'number') return false;
  }
  return true;
}

// Type for the joined query result (Supabase returns single relations as objects)
interface JoinedProgressRow {
  id: string;
  vocabulary_id: string;
  knowledge: number;
  modality: ConceptModality | Record<string, never>;
  paused: boolean;
  vocabulary: {
    id: string;
    word: string;
    pinyin: string;
    part_of_speech: string;
    meaning: string;
    chapter: number;
    source: string;
  } | null;
}

// Convert joined row to local Concept format
function rowToConcept(row: JoinedProgressRow): Concept | null {
  const vocab = row.vocabulary;
  if (!vocab) return null; // Skip if vocabulary relation is missing
  // Handle migration from empty modality
  const modality = isValidModality(row.modality) ? row.modality : createInitialModality(vocab.chapter);
  
  return {
    id: row.vocabulary_id,
    word: vocab.word,
    pinyin: vocab.pinyin,
    part_of_speech: vocab.part_of_speech as Concept['part_of_speech'],
    meaning: vocab.meaning,
    chapter: vocab.chapter,
    source: vocab.source,
    category: 'other' as const, // Enriched from local JSON by store sync
    modality,
    knowledge: row.knowledge,
    paused: row.paused,
  };
}

// Fetch all data from Supabase for the current user
export async function fetchFromCloud(userId: string): Promise<{
  concepts: Concept[];
  error?: string;
}> {
  if (!isSupabaseConfigured()) {
    return { concepts: [], error: 'Supabase not configured' };
  }

  try {
    // Fetch user_progress with joined vocabulary data
    const { data: progressRows, error: progressError } = await supabase
      .from('user_progress')
      .select(`
        id,
        vocabulary_id,
        knowledge,
        modality,
        paused,
        vocabulary (
          id,
          word,
          pinyin,
          part_of_speech,
          meaning,
          chapter,
          source
        )
      `)
      .eq('user_id', userId);

    if (progressError) {
      return { concepts: [], error: progressError.message };
    }

    const concepts = (progressRows as unknown as JoinedProgressRow[] || [])
      .map(rowToConcept)
      .filter((c): c is Concept => c !== null);
    
    return { concepts };
  } catch (err) {
    return { 
      concepts: [], 
      error: err instanceof Error ? err.message : 'Unknown error' 
    };
  }
}

// Get or create vocabulary entry for a word
async function getOrCreateVocabularyId(concept: Concept): Promise<string | undefined> {
  // First, try to find existing vocabulary entry
  const { data: existing, error: findError } = await supabase
    .from('vocabulary')
    .select('id')
    .eq('word', concept.word)
    .eq('pinyin', concept.pinyin)
    .eq('meaning', concept.meaning)
    .single();

  if (existing && !findError) {
    return existing.id;
  }

  // If not found, create it (this should rarely happen as vocabulary is pre-populated)
  const { data: created, error: createError } = await supabase
    .from('vocabulary')
    .insert({
      word: concept.word,
      pinyin: concept.pinyin,
      part_of_speech: concept.part_of_speech,
      meaning: concept.meaning,
      chapter: concept.chapter,
      source: concept.source,
    })
    .select('id')
    .single();

  if (createError) {
    console.error('Failed to create vocabulary entry:', createError);
    return undefined;
  }

  return created?.id;
}

// Save all data to Supabase (upsert)
export async function saveToCloud(
  userId: string,
  concepts: Concept[],
  _srsRecords: unknown[] = []  // Legacy parameter, ignored
): Promise<SyncResult> {
  if (!isSupabaseConfigured()) {
    return { success: false, error: 'Supabase not configured' };
  }

  try {
    // Build a map of word+pinyin+meaning to vocabulary_id
    const { data: vocabRows, error: vocabError } = await supabase
      .from('vocabulary')
      .select('id, word, pinyin, meaning');

    if (vocabError) {
      return { success: false, error: vocabError.message };
    }

    const vocabMap = new Map<string, string>();
    for (const row of vocabRows || []) {
      const key = `${row.word}|${row.pinyin}|${row.meaning}`;
      vocabMap.set(key, row.id);
    }

    // Delete existing progress for this user (clean sync)
    const { error: deleteError } = await supabase
      .from('user_progress')
      .delete()
      .eq('user_id', userId);

    if (deleteError) {
      return { success: false, error: deleteError.message };
    }

    // Prepare progress records
    const progressInserts: Array<{
      user_id: string;
      vocabulary_id: string;
      knowledge: number;
      modality: ConceptModality;
      paused: boolean;
    }> = [];

    for (const concept of concepts) {
      const key = `${concept.word}|${concept.pinyin}|${concept.meaning}`;
      let vocabularyId = vocabMap.get(key);

      // If vocabulary doesn't exist, create it
      if (!vocabularyId) {
        vocabularyId = await getOrCreateVocabularyId(concept);
        if (!vocabularyId) {
          console.warn(`Skipping concept "${concept.word}" - couldn't get vocabulary ID`);
          continue;
        }
      }

      progressInserts.push({
        user_id: userId,
        vocabulary_id: vocabularyId,
        knowledge: concept.knowledge,
        modality: concept.modality,
        paused: concept.paused,
      });
    }

    // Insert progress records
    if (progressInserts.length > 0) {
      const { error: insertError } = await supabase
        .from('user_progress')
        .insert(progressInserts);

      if (insertError) {
        return { success: false, error: insertError.message };
      }
    }

    return {
      success: true,
      conceptsUploaded: progressInserts.length,
    };
  } catch (err) {
    return { 
      success: false, 
      error: err instanceof Error ? err.message : 'Unknown error' 
    };
  }
}
