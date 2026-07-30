// Settings store with localStorage persistence + Supabase cloud sync
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { UserSettings, ThemeType, FocusLevel, LearningFocus, AudioSettings, QuizSettings, SyntaxSettings, TriviaSettings } from '../types/settings';
import { DEFAULT_SETTINGS, THEME_PICKER_ENABLED, FORCED_THEME } from '../types/settings';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

const SETTINGS_KEY = 'langseed_settings';
const SETTINGS_SYNC_KEY = 'langseed_settings_sync';

// Themes that no longer exist, mapped to their closest surviving equivalent.
// Stored settings (localStorage and Supabase) can still reference them, and an
// unknown data-theme silently falls back to daisyUI's default, so remap on read.
const RETIRED_THEMES: Record<string, ThemeType> = {
  sunset: 'wooden', // both warm light themes; sunset's primary collided with error red
};

export function migrateTheme(theme: string | undefined): ThemeType {
  if (!theme) return DEFAULT_SETTINGS.theme;
  return RETIRED_THEMES[theme] ?? (theme as ThemeType);
}

/**
 * The theme actually applied to the document.
 *
 * While THEME_PICKER_ENABLED is false everyone gets FORCED_THEME regardless of what
 * they picked before. The stored preference is deliberately left untouched (rather
 * than rewritten to duo) so re-enabling the picker restores each user's old choice
 * instead of stranding everyone on duo.
 */
export function activeTheme(stored: ThemeType): ThemeType {
  return THEME_PICKER_ENABLED ? stored : FORCED_THEME;
}

// Load settings from localStorage
function loadSettings(): UserSettings {
  try {
    const stored = localStorage.getItem(SETTINGS_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      // Merge with defaults to handle new settings added over time
      const merged = { ...DEFAULT_SETTINGS, ...parsed };
      return { ...merged, theme: migrateTheme(merged.theme) };
    }
  } catch (e) {
    console.error('Failed to load settings:', e);
  }
  return DEFAULT_SETTINGS;
}

// Save settings to localStorage
function saveSettings(settings: UserSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch (e) {
    console.error('Failed to save settings:', e);
  }
}

export interface SettingsStore {
  // Data
  settings: UserSettings;
  
  // Sync state
  isSyncing: boolean;
  syncError: string | null;
  lastSyncTime: string | null;
  hasUnsyncedChanges: boolean;
  
  // Settings actions
  updateSettings: (partial: Partial<UserSettings>) => void;
  setTheme: (theme: ThemeType) => void;
  setCardsPerSession: (count: number) => void;
  setLearningFocus: (field: keyof LearningFocus, level: FocusLevel) => void;
  setAudioSettings: (partial: Partial<AudioSettings>) => void;
  setQuizSettings: (partial: Partial<QuizSettings>) => void;
  setSyntaxSettings: (partial: Partial<SyntaxSettings>) => void;
  setTriviaSettings: (partial: Partial<TriviaSettings>) => void;
  resetToDefaults: () => void;
  
  // Cloud sync
  syncToCloud: (userId: string) => Promise<{ success: boolean; error?: string }>;
  loadFromCloud: (userId: string) => Promise<void>;
  clearSyncError: () => void;
}

export function useSettingsStore(): SettingsStore {
  const [settings, setSettings] = useState<UserSettings>(loadSettings);
  const [initialized, setInitialized] = useState(false);
  
  // Track if we're loading from cloud (to avoid marking as "local change")
  const isLoadingFromCloud = useRef(false);
  
  // Sync state
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(() => {
    try {
      return localStorage.getItem(SETTINGS_SYNC_KEY);
    } catch {
      return null;
    }
  });
  const [lastLocalChangeTime, setLastLocalChangeTime] = useState<string | null>(null);

  // Mark as initialized
  useEffect(() => {
    setInitialized(true);
  }, []);

  // Save settings on change (but not when loading from cloud)
  useEffect(() => {
    if (initialized) {
      saveSettings(settings);
      // Only mark as local change if not loading from cloud
      if (!isLoadingFromCloud.current) {
        setLastLocalChangeTime(new Date().toISOString());
      }
    }
  }, [settings, initialized]);

  // Apply theme to document
  useEffect(() => {
    const theme = activeTheme(settings.theme);
    document.documentElement.setAttribute('data-theme', theme);
    // Also update color-scheme for system UI elements
    // Must match each theme's `color-scheme` in index.css. Previously listed
    // wooden (a light theme) and omitted ocean (a dark one).
    const isDark = ['dark', 'ocean', 'forest', 'ink'].includes(theme);
    document.documentElement.style.colorScheme = isDark ? 'dark' : 'light';
  }, [settings.theme]);

  // Apply character size
  useEffect(() => {
    document.documentElement.setAttribute('data-char-size', settings.characterSize);
  }, [settings.characterSize]);

  // Apply reduced motion
  useEffect(() => {
    if (settings.reducedMotion) {
      document.documentElement.classList.add('reduce-motion');
    } else {
      document.documentElement.classList.remove('reduce-motion');
    }
  }, [settings.reducedMotion]);

  // Track unsynced changes
  const hasUnsyncedChanges = useMemo(() => {
    if (!lastLocalChangeTime) return false;
    if (!lastSyncTime) return true;
    return new Date(lastLocalChangeTime) > new Date(lastSyncTime);
  }, [lastLocalChangeTime, lastSyncTime]);

  // Actions
  const updateSettings = useCallback((partial: Partial<UserSettings>) => {
    setSettings(prev => ({ ...prev, ...partial }));
  }, []);

  const setTheme = useCallback((theme: ThemeType) => {
    setSettings(prev => ({ ...prev, theme }));
  }, []);

  const setCardsPerSession = useCallback((count: number) => {
    // Clamp between 5 and 50
    const clamped = Math.max(5, Math.min(50, count));
    setSettings(prev => ({ ...prev, cardsPerSession: clamped }));
  }, []);

  const setLearningFocus = useCallback((field: keyof LearningFocus, level: FocusLevel) => {
    setSettings(prev => ({
      ...prev,
      learningFocus: { ...prev.learningFocus, [field]: level },
    }));
  }, []);

  const setAudioSettings = useCallback((partial: Partial<AudioSettings>) => {
    setSettings(prev => ({
      ...prev,
      audio: { ...prev.audio, ...partial },
    }));
  }, []);

  const setQuizSettings = useCallback((partial: Partial<QuizSettings>) => {
    setSettings(prev => ({
      ...prev,
      quiz: { ...prev.quiz, ...partial },
    }));
  }, []);

  const setSyntaxSettings = useCallback((partial: Partial<SyntaxSettings>) => {
    setSettings(prev => ({
      ...prev,
      syntax: { ...prev.syntax, ...partial },
    }));
  }, []);

  const setTriviaSettings = useCallback((partial: Partial<TriviaSettings>) => {
    setSettings(prev => ({
      ...prev,
      trivia: { ...prev.trivia, ...partial },
    }));
  }, []);

  const resetToDefaults = useCallback(() => {
    setSettings(DEFAULT_SETTINGS);
  }, []);

  // Cloud sync: Save to Supabase
  const syncToCloud = useCallback(async (userId: string): Promise<{ success: boolean; error?: string }> => {
    if (!isSupabaseConfigured()) {
      return { success: false, error: 'Supabase not configured' };
    }

    setIsSyncing(true);
    setSyncError(null);

    try {
      // Upsert settings (insert or update)
      const { error } = await supabase
        .from('user_settings')
        .upsert({
          user_id: userId,
          settings: settings,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'user_id',
        });

      if (error) {
        setSyncError(error.message);
        return { success: false, error: error.message };
      }

      const now = new Date().toISOString();
      setLastSyncTime(now);
      localStorage.setItem(SETTINGS_SYNC_KEY, now);
      
      return { success: true };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      setSyncError(errorMsg);
      return { success: false, error: errorMsg };
    } finally {
      setIsSyncing(false);
    }
  }, [settings]);

  // Cloud sync: Load from Supabase
  const loadFromCloud = useCallback(async (userId: string): Promise<void> => {
    if (!isSupabaseConfigured()) return;

    setIsSyncing(true);
    setSyncError(null);
    isLoadingFromCloud.current = true;

    try {
      const { data, error } = await supabase
        .from('user_settings')
        .select('settings')
        .eq('user_id', userId)
        .single();

      if (error) {
        // PGRST116 = no rows found, which is fine for new users
        if (error.code !== 'PGRST116') {
          setSyncError(error.message);
        }
        return;
      }

      if (data?.settings) {
        // Merge cloud settings with defaults (handles new fields)
        const merged = { ...DEFAULT_SETTINGS, ...data.settings };
        const cloudSettings = { ...merged, theme: migrateTheme(merged.theme) };
        setSettings(cloudSettings);
        
        const now = new Date().toISOString();
        setLastSyncTime(now);
        localStorage.setItem(SETTINGS_SYNC_KEY, now);
        
        console.log('[Settings] Loaded from cloud:', cloudSettings.audio?.browserVoiceId);
      }
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : 'Failed to load settings');
    } finally {
      setIsSyncing(false);
      // Reset flag after a short delay to allow the useEffect to run
      setTimeout(() => {
        isLoadingFromCloud.current = false;
      }, 100);
    }
  }, []);

  const clearSyncError = useCallback(() => {
    setSyncError(null);
  }, []);

  return {
    settings,
    isSyncing,
    syncError,
    lastSyncTime,
    hasUnsyncedChanges,
    updateSettings,
    setTheme,
    setCardsPerSession,
    setLearningFocus,
    setAudioSettings,
    setQuizSettings,
    setSyntaxSettings,
    setTriviaSettings,
    resetToDefaults,
    syncToCloud,
    loadFromCloud,
    clearSyncError,
  };
}
