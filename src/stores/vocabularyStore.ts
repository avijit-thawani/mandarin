// Vocabulary store with localStorage persistence + Supabase cloud sync
// Manages concepts with modality-level knowledge tracking

import { useState, useEffect, useCallback, useMemo } from 'react';
import type { Concept, VocabWord, Modality, ProgressSnapshot } from '../types/vocabulary';
import { createInitialModality, computeConceptKnowledge, updateModalityScore, computeModalityAverages, countByKnowledge } from '../utils/knowledge';
import { fetchFromCloud, saveToCloud, type SyncResult } from '../lib/syncService';
import type { LearningFocus } from '../types/settings';
import hsk1Data from '../data/hsk1_vocabulary.json';

const STORAGE_KEY = 'langseed_progress';
const LAST_SYNC_KEY = 'langseed_last_sync';
const PROGRESS_CACHE_KEY = 'langseed_progress_cache';
const PENDING_SYNC_KEY = 'langseed_pending_sync';

// Generate UUID (compatible with Supabase)
function generateId(): string {
  return crypto.randomUUID();
}

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
  hsk1Vocab: VocabWord[];
  
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
  importHSK1: () => void;
  importChapters: (fromChapter: number, toChapter: number, startStudying?: boolean) => void;
  removeChapters: (fromChapter: number, toChapter: number) => void;
  togglePaused: (conceptId: string) => void;
  setChapterPaused: (chapter: number, paused: boolean) => void;
  getConceptById: (id: string) => Concept | undefined;
  getConceptByWord: (word: string) => Concept | undefined;
  
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
  markPendingSync: () => void;  // Mark that there are changes to sync
  clearPendingSync: () => void;  // Clear pending sync flag
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

  // Load data on mount
  useEffect(() => {
    const { concepts: loadedConcepts } = loadProgress();
    
    // Sync meanings from source JSON (ensures meanings are up-to-date after JSON edits)
    const vocab = hsk1Data as VocabWord[];
    const vocabMap = new Map(vocab.map(v => [v.word, v]));
    const validWords = new Set(vocab.map(v => v.word));
    const existingWords = new Set(loadedConcepts.map(c => c.word));
    
    // Filter out concepts that no longer exist in source JSON (deleted vocabulary)
    // and update meanings for remaining concepts
    const filteredConcepts = loadedConcepts.filter(c => {
      if (!validWords.has(c.word)) {
        console.log(`[VocabStore] Removing deleted vocabulary: ${c.word}`);
        return false;
      }
      return true;
    });
    
    // Update meanings for existing concepts
    const updatedConcepts = filteredConcepts.map(c => {
      const sourceWord = vocabMap.get(c.word);
      if (sourceWord && sourceWord.meaning !== c.meaning) {
        return { ...c, meaning: sourceWord.meaning };
      }
      return c;
    });
    
    const removedCount = loadedConcepts.length - filteredConcepts.length;
    if (removedCount > 0) {
      console.log(`[VocabStore] Removed ${removedCount} deleted vocabulary items`);
    }
    
    // Auto-merge: Find chapters user has imported and add any new vocabulary from those chapters
    const importedChapters = new Set(filteredConcepts.map(c => c.chapter).filter(ch => ch > 0));
    // Repair legacy guest-seeded data: chapter-1-only users should still see full chapter catalog.
    // Missing words are added as paused, so quiz/study pool behavior remains controlled.
    const shouldBackfillAllChapters = importedChapters.size === 1 && importedChapters.has(1);
    const maxImportedChapter = Math.max(...importedChapters, 0);
    const newVocab: Concept[] = [];
    
    vocab.forEach(word => {
      // Skip if word already exists
      if (existingWords.has(word.word)) return;
      
      // For positive chapters (HSK words): add if chapter is imported
      // For negative chapters (compound phrases): add if |chapter| <= max imported chapter
      const shouldAdd = shouldBackfillAllChapters
        ? true
        : word.chapter > 0
          ? importedChapters.has(word.chapter)
          : Math.abs(word.chapter) <= maxImportedChapter;
      
      if (shouldAdd) {
        console.log(`[VocabStore] Auto-adding new vocabulary: ${word.word} (ch ${word.chapter})`);
        newVocab.push({
          ...word,
          id: generateId(),
          modality: createInitialModality(Math.abs(word.chapter)),
          knowledge: 50,
          paused: true,  // New words start paused
        });
      }
    });
    
    if (newVocab.length > 0) {
      console.log(`[VocabStore] Added ${newVocab.length} new vocabulary items from updated JSON`);
    }
    
    setConcepts([...updatedConcepts, ...newVocab]);
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

  // Get all available chapters from HSK1 data
  const availableChapters = useMemo(() => {
    const vocab = hsk1Data as VocabWord[];
    return [...new Set(vocab.map(w => w.chapter))].sort((a, b) => a - b);
  }, []);

  // Actions
  const importHSK1 = useCallback(() => {
    const vocab = hsk1Data as VocabWord[];
    const newConcepts: Concept[] = [];
    
    vocab.forEach(word => {
      if (!addedWords.has(word.word)) {
        newConcepts.push({
          ...word,
          id: generateId(),
          modality: createInitialModality(word.chapter),
          knowledge: 50, // Will be computed properly when learningFocus is available
          paused: true,  // Words start as "unknown" - user checks to make them "studying"
        });
      }
    });
    
    setConcepts(prev => [...prev, ...newConcepts]);
  }, [addedWords]);

  const importChapters = useCallback((fromChapter: number, toChapter: number, startStudying = false) => {
    const vocab = hsk1Data as VocabWord[];
    const newConcepts: Concept[] = [];
    const isInitialChapterOneSeed = concepts.length === 0 && fromChapter === 1 && toChapter === 1;
    
    vocab.forEach(word => {
      if (addedWords.has(word.word)) return;

      // Bootstrap behavior for first-time users:
      // - Chapter 1 starts as known (checked)
      // - Other chapters stay unknown (unchecked) but visible in Vocabulary
      const shouldInclude = isInitialChapterOneSeed
        ? true
        : word.chapter >= fromChapter && word.chapter <= toChapter;

      if (shouldInclude) {
        const shouldStartStudying = isInitialChapterOneSeed
          ? startStudying && word.chapter === 1
          : startStudying;

        newConcepts.push({
          ...word,
          id: generateId(),
          modality: createInitialModality(word.chapter),
          knowledge: 50,
          paused: !shouldStartStudying,  // If studying, keep checked; otherwise unchecked
        });
      }
    });
    
    setConcepts(prev => [...prev, ...newConcepts]);
  }, [addedWords, concepts.length]);

  const removeChapters = useCallback((fromChapter: number, toChapter: number) => {
    setConcepts(prev => prev.filter(c => c.chapter < fromChapter || c.chapter > toChapter));
  }, []);

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

  // Cloud sync: Load from Supabase
  // This function loads cloud data and uses it as the source of truth
  // Local changes should be synced to cloud before calling this
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
          // If concept doesn't have modality field, create it
          if (!c.modality) {
            return {
              ...c,
              modality: createInitialModality(c.chapter),
              knowledge: (c as unknown as { understanding?: number }).understanding ?? 50, // Use old understanding or default
            };
          }
          return c;
        }) as Concept[];
        
        // Auto-merge: Add any NEW vocabulary from JSON that doesn't exist in cloud
        // and remove any vocabulary that no longer exists in JSON
        const vocab = hsk1Data as VocabWord[];
        const validWords = new Set(vocab.map(v => v.word));
        
        // Filter out concepts that no longer exist in source JSON (deleted vocabulary)
        const filteredConcepts = migratedConcepts.filter(c => {
          if (!validWords.has(c.word)) {
            console.log(`[VocabStore] Removing deleted vocabulary from cloud data: ${c.word}`);
            return false;
          }
          return true;
        });
        
        const removedCount = migratedConcepts.length - filteredConcepts.length;
        if (removedCount > 0) {
          console.log(`[VocabStore] Removed ${removedCount} deleted vocabulary items from cloud data`);
        }
        
        const existingWords = new Set(filteredConcepts.map(c => c.word));
        const importedChapters = new Set(filteredConcepts.map(c => c.chapter).filter(ch => ch > 0));
        // Repair legacy guest-seeded data that synced chapter 1 only.
        const shouldBackfillAllChapters = importedChapters.size === 1 && importedChapters.has(1);
        const maxImportedChapter = Math.max(...importedChapters, 0);
        const newVocab: Concept[] = [];
        
        vocab.forEach(word => {
          // Skip if word already exists
          if (existingWords.has(word.word)) return;
          
          // For positive chapters (HSK words): add if chapter is imported
          // For negative chapters (compound phrases): add if |chapter| <= max imported chapter
          const shouldAdd = shouldBackfillAllChapters
            ? true
            : word.chapter > 0
              ? importedChapters.has(word.chapter)
              : Math.abs(word.chapter) <= maxImportedChapter;
          
          if (shouldAdd) {
            console.log(`[VocabStore] Auto-adding new vocabulary from JSON: ${word.word} (ch ${word.chapter})`);
            newVocab.push({
              ...word,
              id: generateId(),
              modality: createInitialModality(Math.abs(word.chapter)),
              knowledge: 50,
              paused: true,  // New words start paused
            });
          }
        });
        
        const mergedConcepts = [...filteredConcepts, ...newVocab];
        
        if (newVocab.length > 0) {
          console.log(`[VocabStore] Added ${newVocab.length} new vocabulary items from updated JSON`);
        }
        
        // Set the merged data
        setConcepts(mergedConcepts);
        
        // Save to localStorage so it persists
        saveProgress(mergedConcepts);
        
        const now = new Date().toISOString();
        setLastSyncTime(now);
        localStorage.setItem(LAST_SYNC_KEY, now);
        
        // Clear pending sync since we just loaded fresh data
        clearPendingSync();
        
        console.log(`[VocabStore] Loaded ${filteredConcepts.length} from cloud + ${newVocab.length} new = ${mergedConcepts.length} total`);
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
    hsk1Vocab: hsk1Data as VocabWord[],
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
    importHSK1,
    importChapters,
    removeChapters,
    togglePaused,
    setChapterPaused,
    getConceptById,
    getConceptByWord,
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
