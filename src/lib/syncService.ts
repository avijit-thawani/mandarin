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

// Build vocabulary lookup maps keyed by word (resilient to meaning/pinyin drift)
function buildVocabMaps(vocabRows: Array<{ id: string; word: string; pinyin: string; meaning: string }>) {
  // Primary: word -> id (works when word is unique, which covers most HSK vocab)
  // Secondary: word|pinyin -> id (disambiguates homophones)
  // Tertiary: word|pinyin|meaning -> id (exact match, least resilient)
  const byWord = new Map<string, string[]>();
  const byWordPinyin = new Map<string, string>();
  const byExact = new Map<string, string>();

  for (const row of vocabRows) {
    const wordEntries = byWord.get(row.word) || [];
    wordEntries.push(row.id);
    byWord.set(row.word, wordEntries);
    byWordPinyin.set(`${row.word}|${row.pinyin}`, row.id);
    byExact.set(`${row.word}|${row.pinyin}|${row.meaning}`, row.id);
  }

  return { byWord, byWordPinyin, byExact };
}

function resolveVocabularyId(
  concept: Concept,
  maps: ReturnType<typeof buildVocabMaps>
): string | undefined {
  // Try exact match first
  const exactKey = `${concept.word}|${concept.pinyin}|${concept.meaning}`;
  if (maps.byExact.has(exactKey)) return maps.byExact.get(exactKey);

  // Fall back to word+pinyin (handles meaning drift from trimming)
  const wpKey = `${concept.word}|${concept.pinyin}`;
  if (maps.byWordPinyin.has(wpKey)) return maps.byWordPinyin.get(wpKey);

  // Fall back to word alone if unambiguous
  const wordEntries = maps.byWord.get(concept.word);
  if (wordEntries && wordEntries.length === 1) return wordEntries[0];

  return undefined;
}

// Save all data to Supabase using UPSERT (never deletes existing progress)
export async function saveToCloud(
  userId: string,
  concepts: Concept[],
  _srsRecords: unknown[] = []
): Promise<SyncResult> {
  if (!isSupabaseConfigured()) {
    return { success: false, error: 'Supabase not configured' };
  }

  try {
    // Fetch all vocabulary for lookup
    const { data: vocabRows, error: vocabError } = await supabase
      .from('vocabulary')
      .select('id, word, pinyin, meaning');

    if (vocabError) {
      return { success: false, error: vocabError.message };
    }

    const maps = buildVocabMaps(vocabRows || []);

    // Resolve vocabulary IDs for all concepts
    const progressUpserts: Array<{
      user_id: string;
      vocabulary_id: string;
      knowledge: number;
      modality: ConceptModality;
      paused: boolean;
    }> = [];
    const resolvedVocabIds = new Set<string>();
    let skipped = 0;

    for (const concept of concepts) {
      const vocabularyId = resolveVocabularyId(concept, maps);

      if (!vocabularyId) {
        console.warn(`[Sync] No vocabulary match for "${concept.word}" (${concept.pinyin}) — skipping, not creating duplicates`);
        skipped++;
        continue;
      }

      // Deduplicate: if we already have a record for this vocabulary_id, skip
      if (resolvedVocabIds.has(vocabularyId)) continue;
      resolvedVocabIds.add(vocabularyId);

      progressUpserts.push({
        user_id: userId,
        vocabulary_id: vocabularyId,
        knowledge: concept.knowledge,
        modality: concept.modality,
        paused: concept.paused,
      });
    }

    if (skipped > 0) {
      console.warn(`[Sync] Skipped ${skipped} concepts with no vocabulary match`);
    }

    // UPSERT: insert or update on (user_id, vocabulary_id) unique constraint
    // This never deletes existing progress — only updates or adds
    if (progressUpserts.length > 0) {
      const BATCH_SIZE = 200;
      for (let i = 0; i < progressUpserts.length; i += BATCH_SIZE) {
        const batch = progressUpserts.slice(i, i + BATCH_SIZE);
        const { error: upsertError } = await supabase
          .from('user_progress')
          .upsert(batch, { onConflict: 'user_id,vocabulary_id' });

        if (upsertError) {
          return { success: false, error: upsertError.message };
        }
      }
    }

    return {
      success: true,
      conceptsUploaded: progressUpserts.length,
    };
  } catch (err) {
    return { 
      success: false, 
      error: err instanceof Error ? err.message : 'Unknown error' 
    };
  }
}
