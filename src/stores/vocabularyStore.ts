// Vocabulary store with localStorage persistence + Supabase cloud sync
// Source of truth: Supabase vocabulary table. localStorage is a cache for instant boot.
//
// Known limitation: browser TTS mispronounces single-char polyphonic words
// (多音字) like 了/的/着. No workaround yet — see ttsService.ts for details.

import { useState, useEffect, useCallback, useMemo } from 'react';
import type { Concept, Modality, ProgressSnapshot } from '../types/vocabulary';
import { createInitialModality, computeConceptKnowledge, updateModalityScore, computeModalityAverages, countByKnowledge } from '../utils/knowledge';
import { fetchFromCloud, saveToCloud, type SyncResult } from '../lib/syncService';
import { supabase } from '../lib/supabase';
import type { LearningFocus } from '../types/settings';

const STORAGE_KEY = 'langseed_progress';
const LAST_SYNC_KEY = 'langseed_last_sync';
const PROGRESS_CACHE_KEY = 'langseed_progress_cache';
const PENDING_SYNC_KEY = 'langseed_pending_sync';

// Load progress from localStorage
function loadProgress(): { concepts: Concept[] } {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const data = JSON.parse(stored);
      return {
        concepts: data.concepts || [],
      };
    }
  } catch (e) {
    console.error('Failed to load progress:', e);
  }
  return { concepts: [] };
}

// Save progress to localStorage
function saveProgress(concepts: Concept[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      concepts,
      lastUpdated: new Date().toISOString(),
    }));
  } catch (e) {
    console.error('Failed to save progress:', e);
  }
}

// Load progress cache from localStorage
function loadProgressCache(): ProgressSnapshot[] {
  try {
    const stored = localStorage.getItem(PROGRESS_CACHE_KEY);
    if (stored) {
      const data = JSON.parse(stored);
      return data.snapshots || [];
    }
  } catch (e) {
    console.error('Failed to load progress cache:', e);
  }
  return [];
}

// Save progress snapshot to cache
function saveProgressSnapshot(snapshot: ProgressSnapshot): void {
  try {
    const existing = loadProgressCache();
    // Keep last 100 snapshots
    const updated = [...existing, snapshot].slice(-100);
    localStorage.setItem(PROGRESS_CACHE_KEY, JSON.stringify({
      snapshots: updated,
      lastUpdated: new Date().toISOString(),
    }));
  } catch (e) {
    console.error('Failed to save progress cache:', e);
  }
}

export interface VocabularyStore {
  // Data
  concepts: Concept[];
  
  // Computed
  addedWords: Set<string>;
  availableChapters: number[];
  studyingCount: number;  // Words not paused
  
  // Progress stats
  progressSnapshots: ProgressSnapshot[];
  
  // Sync state
  isSyncing: boolean;
  syncError: string | null;
  lastSyncTime: string | null;
  hasUnsyncedChanges: boolean;
  hasPendingSync: boolean;  // True if there are changes waiting to sync
  
  // Actions
  togglePaused: (conceptId: string) => void;
  setChapterPaused: (chapter: number, paused: boolean) => void;
  getConceptById: (id: string) => Concept | undefined;
  getConceptByWord: (word: string) => Concept | undefined;
  
  // Custom word management (for Chat tab)
  addCustomWord: (word: string, pinyin: string, meaning: string, partOfSpeech: string, category?: string) => Promise<void>;
  deleteCustomWord: (word: string) => Promise<void>;
  
  // Quiz actions
  updateModalityKnowledge: (
    conceptId: string,
    questionModality: Modality,
    answerModality: Modality,
    correct: boolean,
    learningFocus: LearningFocus
  ) => void;
  
  // Progress
  recordProgressSnapshot: (sessionAttempts: number, sessionCorrect: number) => void;
  getModalityAverages: () => Record<Modality, number>;
  getKnowledgeCounts: () => { above80: number; above50: number; below50: number };

  // Cloud sync actions
  syncToCloud: (userId: string) => Promise<SyncResult>;
  loadFromCloud: (userId: string) => Promise<void>;
  clearSyncError: () => void;
  resetProgress: () => void;
  markPendingSync: () => void;
  clearPendingSync: () => void;
}

export function useVocabularyStore(): VocabularyStore {
  const [concepts, setConcepts] = useState<Concept[]>([]);
  const [progressSnapshots, setProgressSnapshots] = useState<ProgressSnapshot[]>([]);
  const [initialized, setInitialized] = useState(false);
  
  // Sync state
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(() => {
    try {
      return localStorage.getItem(LAST_SYNC_KEY);
    } catch {
      return null;
    }
  });
  const [lastLocalChangeTime, setLastLocalChangeTime] = useState<string | null>(null);
  const [hasPendingSync, setHasPendingSync] = useState<boolean>(() => {
    try {
      return localStorage.getItem(PENDING_SYNC_KEY) === 'true';
    } catch {
      return false;
    }
  });

  // Load cached data on mount (instant boot from localStorage)
  useEffect(() => {
    const { concepts: loadedConcepts } = loadProgress();
    setConcepts(loadedConcepts);
    setProgressSnapshots(loadProgressCache());
    setInitialized(true);
  }, []);

  // Save data on change
  useEffect(() => {
    if (initialized) {
      saveProgress(concepts);
      setLastLocalChangeTime(new Date().toISOString());
    }
  }, [concepts, initialized]);
  
  // Track if there are unsynced changes
  const hasUnsyncedChanges = useMemo(() => {
    if (!lastLocalChangeTime) return false;
    if (!lastSyncTime) return concepts.length > 0;
    return new Date(lastLocalChangeTime) > new Date(lastSyncTime);
  }, [lastLocalChangeTime, lastSyncTime, concepts.length]);

  // Computed values
  const addedWords = useMemo(() => 
    new Set(concepts.map(c => c.word)),
    [concepts]
  );
  
  const studyingCount = useMemo(() => 
    concepts.filter(c => !c.paused).length,
    [concepts]
  );

  // Compute available chapters from loaded concepts
  const availableChapters = useMemo(() => {
    return [...new Set(concepts.map(c => c.chapter))].sort((a, b) => a - b);
  }, [concepts]);

  // Mark that there are changes waiting to sync
  const markPendingSync = useCallback(() => {
    setHasPendingSync(true);
    try {
      localStorage.setItem(PENDING_SYNC_KEY, 'true');
    } catch (e) {
      console.error('Failed to mark pending sync:', e);
    }
  }, []);
  
  // Clear pending sync flag
  const clearPendingSync = useCallback(() => {
    setHasPendingSync(false);
    try {
      localStorage.removeItem(PENDING_SYNC_KEY);
    } catch (e) {
      console.error('Failed to clear pending sync:', e);
    }
  }, []);

  const togglePaused = useCallback((conceptId: string) => {
    setConcepts(prev => prev.map(c => {
      if (c.id !== conceptId) return c;
      return { ...c, paused: !c.paused };
    }));
    markPendingSync();
  }, [markPendingSync]);

  const setChapterPaused = useCallback((chapter: number, paused: boolean) => {
    setConcepts(prev => prev.map(c => {
      if (c.chapter !== chapter || c.paused === paused) return c;
      return { ...c, paused };
    }));
    markPendingSync();
  }, [markPendingSync]);

  const getConceptById = useCallback((id: string) => 
    concepts.find(c => c.id === id),
    [concepts]
  );

  const getConceptByWord = useCallback((word: string) => 
    concepts.find(c => c.word === word),
    [concepts]
  );

  // Add a custom word via Chat (inserts into Supabase vocabulary + user_progress)
  const addCustomWord = useCallback(async (
    word: string,
    pinyin: string,
    meaning: string,
    partOfSpeech: string,
    category: string = 'other'
  ) => {
    // Insert into Supabase vocabulary table (source: 'chat')
    const { data: vocabRow, error: vocabError } = await supabase
      .from('vocabulary')
      .insert({ word, pinyin, meaning, part_of_speech: partOfSpeech, chapter: 0, source: 'chat', category })
      .select('id')
      .single();

    if (vocabError) {
      console.error('[VocabStore] Failed to insert custom word:', vocabError.message);
      throw new Error(vocabError.message);
    }

    const newConcept: Concept = {
      id: vocabRow.id,
      word,
      pinyin,
      part_of_speech: partOfSpeech as Concept['part_of_speech'],
      meaning,
      chapter: 0,
      source: 'chat',
      category: category as Concept['category'],
      modality: createInitialModality(0),
      knowledge: 50,
      paused: false,
    };

    setConcepts(prev => [...prev, newConcept]);
    markPendingSync();
  }, [markPendingSync]);

  // Delete a custom word (only source: 'chat' words)
  const deleteCustomWord = useCallback(async (word: string) => {
    const concept = concepts.find(c => c.word === word && c.source === 'chat');
    if (!concept) {
      console.warn(`[VocabStore] Cannot delete "${word}" — not a custom word or not found`);
      return;
    }

    // Delete user_progress first (FK constraint), then vocabulary
    const { error: progressError } = await supabase
      .from('user_progress')
      .delete()
      .eq('vocabulary_id', concept.id);

    if (progressError) {
      console.error('[VocabStore] Failed to delete user_progress:', progressError.message);
    }

    const { error: vocabError } = await supabase
      .from('vocabulary')
      .delete()
      .eq('id', concept.id);

    if (vocabError) {
      console.error('[VocabStore] Failed to delete vocabulary:', vocabError.message);
      throw new Error(vocabError.message);
    }

    setConcepts(prev => prev.filter(c => c.id !== concept.id));
  }, [concepts]);

  // Update modality knowledge after quiz answer
  // Updates BOTH question and answer modalities with different rates
  const updateModalityKnowledge = useCallback((
    conceptId: string,
    questionModality: Modality,
    answerModality: Modality,
    correct: boolean,
    learningFocus: LearningFocus
  ) => {
    setConcepts(prev => {
      const updatedConcepts = prev.map(c => {
        if (c.id !== conceptId) return c;
        
        // Update both modalities with different rates
        // Answer modality = higher rates (active recall)
        // Question modality = lower rates (passive recognition)
        let updatedModality = { ...c.modality };
        
        // Always update answer modality (primary test - higher rates)
        updatedModality[answerModality] = updateModalityScore(
          c.modality[answerModality], 
          correct, 
          true  // isAnswerModality = true (higher rates)
        );
        
        // Also update question modality if different (secondary benefit - lower rates)
        if (questionModality !== answerModality) {
          updatedModality[questionModality] = updateModalityScore(
            c.modality[questionModality], 
            correct, 
            false  // isAnswerModality = false (lower rates)
          );
        }
        
        // Recompute overall knowledge
        const newKnowledge = computeConceptKnowledge(updatedModality, learningFocus);
        
        return {
          ...c,
          modality: updatedModality,
          knowledge: newKnowledge,
        };
      });
      
      // Immediately save to localStorage to ensure persistence before navigation
      saveProgress(updatedConcepts);
      
      return updatedConcepts;
    });
    
    // Mark that we have changes to sync to cloud
    markPendingSync();
  }, [markPendingSync]);

  // Record a progress snapshot
  const recordProgressSnapshot = useCallback((sessionAttempts: number, sessionCorrect: number) => {
    const snapshot: ProgressSnapshot = {
      timestamp: new Date().toISOString(),
      totalWords: concepts.filter(c => !c.paused).length,
      wordsAbove50: concepts.filter(c => !c.paused && c.knowledge > 50).length,
      wordsAbove80: concepts.filter(c => !c.paused && c.knowledge > 80).length,
      avgKnowledge: computeModalityAverages(concepts.filter(c => !c.paused)),
      sessionAttempts,
      sessionCorrect,
    };
    
    saveProgressSnapshot(snapshot);
    setProgressSnapshots(prev => [...prev, snapshot].slice(-100));
  }, [concepts]);

  // Get modality averages for active concepts
  const getModalityAverages = useCallback(() => {
    return computeModalityAverages(concepts.filter(c => !c.paused));
  }, [concepts]);

  // Get knowledge counts
  const getKnowledgeCounts = useCallback(() => {
    return countByKnowledge(concepts.filter(c => !c.paused));
  }, [concepts]);

  const resetProgress = useCallback(() => {
    setConcepts([]);
    setProgressSnapshots([]);
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(PROGRESS_CACHE_KEY);
  }, []);

  // Cloud sync: Save to Supabase
  const syncToCloud = useCallback(async (userId: string): Promise<SyncResult> => {
    setIsSyncing(true);
    setSyncError(null);
    
    try {
      // Note: syncService needs to be updated to handle new concept structure
      const result = await saveToCloud(userId, concepts, []);
      
      if (result.success) {
        const now = new Date().toISOString();
        setLastSyncTime(now);
        localStorage.setItem(LAST_SYNC_KEY, now);
        // Clear pending sync flag on successful sync
        clearPendingSync();
      } else {
        setSyncError(result.error || 'Sync failed');
      }
      
      return result;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      setSyncError(errorMsg);
      return { success: false, error: errorMsg };
    } finally {
      setIsSyncing(false);
    }
  }, [concepts, clearPendingSync]);

  // Cloud sync: Load from Supabase (source of truth)
  const loadFromCloud = useCallback(async (userId: string): Promise<void> => {
    setIsSyncing(true);
    setSyncError(null);
    
    try {
      const { concepts: cloudConcepts, error } = await fetchFromCloud(userId);
      
      if (error) {
        setSyncError(error);
        return;
      }
      
      if (cloudConcepts.length > 0) {
        // Migrate old concepts to new structure if needed
        const migratedConcepts = cloudConcepts.map(c => {
          if (!c.modality) {
            return {
              ...c,
              modality: createInitialModality(c.chapter),
              knowledge: (c as unknown as { understanding?: number }).understanding ?? 50,
            };
          }
          return c;
        }) as Concept[];
        
        setConcepts(migratedConcepts);
        saveProgress(migratedConcepts);
        
        const now = new Date().toISOString();
        setLastSyncTime(now);
        localStorage.setItem(LAST_SYNC_KEY, now);
        clearPendingSync();
        
        console.log(`[VocabStore] Loaded ${migratedConcepts.length} concepts from cloud`);
      } else {
        console.log('[VocabStore] No cloud data found, keeping local data');
      }
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : 'Failed to load from cloud');
    } finally {
      setIsSyncing(false);
    }
  }, [clearPendingSync]);

  const clearSyncError = useCallback(() => {
    setSyncError(null);
  }, []);

  return {
    concepts,
    addedWords,
    availableChapters,
    studyingCount,
    progressSnapshots,
    // Sync state
    isSyncing,
    syncError,
    lastSyncTime,
    hasUnsyncedChanges,
    hasPendingSync,
    // Actions
    togglePaused,
    setChapterPaused,
    getConceptById,
    getConceptByWord,
    // Custom word management
    addCustomWord,
    deleteCustomWord,
    // Quiz actions
    updateModalityKnowledge,
    // Progress
    recordProgressSnapshot,
    getModalityAverages,
    getKnowledgeCounts,
    // Cloud sync
    syncToCloud,
    loadFromCloud,
    clearSyncError,
    resetProgress,
    markPendingSync,
    clearPendingSync,
  };
}
