import { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  Save, 
  RefreshCw, 
  LogOut, 
  Loader2, 
  Check, 
  AlertTriangle,
  Minus,
  Plus,
  Volume2,
  VolumeX,
  Eye,
  Sparkles,
  Type,
  Moon,
  Sun,
  Play,
  Mic,
  HelpCircle,
  Flame,
  Snowflake,
  Zap,
  TrendingUp,
  BarChart3,
  Layers,
  Bell,
  BellOff,
} from 'lucide-react';
import type { SettingsStore } from '../stores/settingsStore';
import type { VocabularyStore } from '../stores/vocabularyStore';
import type { StreakData } from '../hooks/useStreak';
import type { 
  ThemeType, 
  FocusLevel, 
  LearningFocus, 
  PinyinDisplay,
} from '../types/settings';
import { FOCUS_LABELS, FOCUS_DESCRIPTIONS, THEME_META, SPEECH_RATE_PRESETS, SYNTAX_DIRECTION_OPTIONS } from '../types/settings';
import type { SyntaxDirectionRatio } from '../types/settings';
import { MODALITY_INFO, type Modality } from '../types/vocabulary';
import { 
  getChineseVoices, 
  speak, 
  stopSpeaking, 
  isTTSSupported,
  detectBrowser,
  getBrowserDisplayName,
  type TTSVoice,
  type BrowserType,
} from '../services/ttsService';
import { useNavigate } from 'react-router-dom';
import { ProgressTimeline } from '../components/ProgressTimeline';
import {
  isReminderSupported,
  getReminderSettings,
  enableReminders,
  disableReminders,
  updateReminderSchedule,
  sendTestReminder,
  clearNotifications,
  getBrowserTimezone,
} from '../lib/pwaReminderService';

interface ProfilePageProps {
  settingsStore: SettingsStore;
  vocabStore: VocabularyStore;
  onSave: () => Promise<void>;
  onLogout: () => void;
  userEmail?: string;
  userId: string | null;
  onShowHelp?: () => void;
  onRefreshProgress?: () => Promise<void>;
  isGuest?: boolean;
  streakData?: StreakData & { completeRecoveryQuiz: () => void; refresh: () => void };
}

// Progress bar component - uses CSS variables for reliable theming
function ProgressBar({ value, max = 100, color = 'primary', size = 'md' }: { 
  value: number; 
  max?: number; 
  color?: 'primary' | 'secondary' | 'accent' | 'success' | 'warning' | 'error' | 'info';
  size?: 'sm' | 'md';
}) {
  const percentage = Math.min(100, Math.max(0, (value / max) * 100));
  const heightClass = size === 'sm' ? 'h-2' : 'h-3';
  
  // Map color names to daisyUI CSS variable names
  const colorVar = `var(--color-${color})`;
  
  return (
    <div className={`w-full bg-base-300 rounded-full ${heightClass} overflow-hidden`}>
      <div 
        className={`${heightClass} rounded-full transition-all duration-500`}
        style={{ 
          width: `${percentage}%`,
          backgroundColor: colorVar,
        }}
      />
    </div>
  );
}

export function ProfilePage({ settingsStore, vocabStore, onSave, onLogout, userEmail, userId, onShowHelp, onRefreshProgress, isGuest, streakData }: ProfilePageProps) {
  const navigate = useNavigate();
  const { settings, isSyncing, syncError, hasUnsyncedChanges, lastSyncTime } = settingsStore;
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  
  // TTS state
  const [availableVoices, setAvailableVoices] = useState<TTSVoice[]>([]);
  const [voicesLoading, setVoicesLoading] = useState(true);
  const [testingVoice, setTestingVoice] = useState(false);
  const ttsSupported = isTTSSupported();
  
  // Browser detection
  const [currentBrowser] = useState<BrowserType>(() => detectBrowser());
  const browserDisplayName = getBrowserDisplayName(currentBrowser);
  
  // Progress refresh state
  const [isRefreshingProgress, setIsRefreshingProgress] = useState(false);
  const [reminderSupported] = useState<boolean>(() => isReminderSupported());
  const [reminderEnabled, setReminderEnabled] = useState(false);
  const [reminderBusy, setReminderBusy] = useState(false);
  const [reminderError, setReminderError] = useState<string | null>(null);
  const [reminderMessage, setReminderMessage] = useState<string | null>(null);
  const [reminderTime, setReminderTime] = useState('16:00');
  const [reminderTimezone, setReminderTimezone] = useState(() => getBrowserTimezone());
  
  // Progress stats (computed from cached/current data)
  const progressStats = useMemo(() => {
    const modalityAvgs = vocabStore.getModalityAverages();
    const knowledgeCounts = vocabStore.getKnowledgeCounts();
    const totalStudying = vocabStore.studyingCount;
    const totalUnknown = vocabStore.concepts.filter(c => c.paused).length;
    
    return {
      modalityAvgs,
      knowledgeCounts,
      totalStudying,
      totalUnknown,
      overallAvg: totalStudying > 0 
        ? Math.round((modalityAvgs.character + modalityAvgs.pinyin + modalityAvgs.meaning + modalityAvgs.audio) / 4)
        : 0,
    };
  }, [vocabStore]);
  
  // Refresh progress on mount
  // Only refresh if there are no local unsaved changes to avoid overwriting quiz results
  const handleRefreshProgress = useCallback(async () => {
    if (!onRefreshProgress || isRefreshingProgress) return;
    // Don't overwrite local changes with cloud data
    if (vocabStore.hasUnsyncedChanges) return;
    setIsRefreshingProgress(true);
    try {
      await onRefreshProgress();
    } finally {
      setIsRefreshingProgress(false);
    }
  }, [onRefreshProgress, isRefreshingProgress, vocabStore.hasUnsyncedChanges]);
  
  // Auto-refresh progress when page mounts (only if no local changes)
  useEffect(() => {
    handleRefreshProgress();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!userId || isGuest || !reminderSupported) return;
    let isMounted = true;

    getReminderSettings(userId)
      .then((reminderSettings) => {
        if (isMounted) {
          setReminderEnabled(reminderSettings.enabled);
          const hh = String(reminderSettings.hour).padStart(2, '0');
          const mm = String(reminderSettings.minute).padStart(2, '0');
          setReminderTime(`${hh}:${mm}`);
          setReminderTimezone(reminderSettings.timezone || getBrowserTimezone());
        }
      })
      .catch((error) => {
        if (isMounted) {
          setReminderError(error instanceof Error ? error.message : 'Failed to load reminder status.');
        }
      });

    return () => {
      isMounted = false;
    };
  }, [userId, isGuest, reminderSupported]);

  const handleEnableReminders = async () => {
    if (!userId) return;
    setReminderBusy(true);
    setReminderError(null);
    setReminderMessage(null);
    try {
      const [hourRaw, minuteRaw] = reminderTime.split(':');
      await enableReminders(userId, {
        timezone: reminderTimezone,
        hour: Number(hourRaw),
        minute: Number(minuteRaw),
      });
      setReminderEnabled(true);
      setReminderMessage('Reminders enabled. You can now send a test push.');
    } catch (error) {
      setReminderError(error instanceof Error ? error.message : 'Failed to enable reminders.');
    } finally {
      setReminderBusy(false);
    }
  };

  const handleDisableReminders = async () => {
    if (!userId) return;
    setReminderBusy(true);
    setReminderError(null);
    setReminderMessage(null);
    try {
      await disableReminders(userId);
      setReminderEnabled(false);
      setReminderMessage('Reminders disabled on this device.');
    } catch (error) {
      setReminderError(error instanceof Error ? error.message : 'Failed to disable reminders.');
    } finally {
      setReminderBusy(false);
    }
  };

  const handleSaveReminderSchedule = async () => {
    if (!userId) return;
    setReminderBusy(true);
    setReminderError(null);
    setReminderMessage(null);
    try {
      const [hourRaw, minuteRaw] = reminderTime.split(':');
      await updateReminderSchedule(userId, {
        timezone: reminderTimezone.trim(),
        hour: Number(hourRaw),
        minute: Number(minuteRaw),
      });
      setReminderMessage('Reminder schedule saved for this device.');
    } catch (error) {
      setReminderError(error instanceof Error ? error.message : 'Failed to save reminder schedule.');
    } finally {
      setReminderBusy(false);
    }
  };

  const handleSendTestReminder = async () => {
    if (!userId) return;
    setReminderBusy(true);
    setReminderError(null);
    setReminderMessage(null);
    try {
      await sendTestReminder(userId);
      setReminderMessage('Test reminder requested. Check your phone notifications in a few seconds.');
    } catch (error) {
      setReminderError(error instanceof Error ? error.message : 'Failed to trigger test reminder.');
    } finally {
      setReminderBusy(false);
    }
  };

  const handleWithdrawNotification = async () => {
    setReminderError(null);
    setReminderMessage(null);
    try {
      await clearNotifications();
      setReminderMessage('Notification withdrawn. If one was showing, it should be gone now.');
    } catch (error) {
      setReminderError(error instanceof Error ? error.message : 'Failed to withdraw notification.');
    }
  };
  
  // Get current voice for this browser
  const getCurrentVoiceId = (): string => {
    const voicesByBrowser = settings.audio.voicesByBrowser || {};
    const browserVoice = voicesByBrowser[currentBrowser];
    if (browserVoice !== undefined) return browserVoice;
    return settings.audio.browserVoiceId || '';
  };
  
  const setCurrentVoiceId = (voiceId: string) => {
    const voicesByBrowser = { ...(settings.audio.voicesByBrowser || {}) };
    voicesByBrowser[currentBrowser] = voiceId;
    settingsStore.setAudioSettings({ 
      voicesByBrowser,
      browserVoiceId: voiceId,
    });
  };

  // Load voices
  useEffect(() => {
    if (!ttsSupported) {
      setVoicesLoading(false);
      return;
    }
    getChineseVoices().then(voices => {
      setAvailableVoices(voices);
      setVoicesLoading(false);
    });
  }, [ttsSupported]);

  const handleTestVoice = async () => {
    if (testingVoice) {
      stopSpeaking();
      setTestingVoice(false);
      return;
    }
    
    setTestingVoice(true);
    try {
      await speak('你好，我是你的中文老师。', {
        voiceId: getCurrentVoiceId() || undefined,
        rate: settings.audio.speechRate,
      });
    } finally {
      setTestingVoice(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveSuccess(false);
    try {
      await onSave();
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  const formatLastSync = (time: string | null) => {
    if (!time) return 'Never synced';
    const date = new Date(time);
    const now = new Date();
    const diffMins = Math.floor((now.getTime() - date.getTime()) / 60000);
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return date.toLocaleDateString();
  };

  const themes: ThemeType[] = ['light', 'dark', 'wooden', 'ocean', 'forest', 'sunset', 'sakura', 'ink'];
  const focusLevels: FocusLevel[] = [0, 1, 2, 3];
  const focusFields: (keyof LearningFocus)[] = ['character', 'pinyin', 'meaning', 'audio'];
  const modalities: Modality[] = ['character', 'pinyin', 'meaning', 'audio'];

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <header className="flex-shrink-0 bg-base-100 border-b border-base-300 px-4 py-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">Profile</h1>
            <p className="text-sm text-base-content/60">
              Progress & Settings
            </p>
          </div>
          
          <div className="flex items-center gap-2">
            {onShowHelp && (
              <button
                className="btn btn-sm btn-ghost btn-circle text-base-content/50 hover:text-primary"
                onClick={onShowHelp}
                title="Help"
              >
                <HelpCircle className="w-5 h-5" />
              </button>
            )}
            
            {!isGuest && (
              <button
                className={`btn btn-sm gap-2 ${
                  saveSuccess ? 'btn-success' : 
                  syncError ? 'btn-error' : 
                  hasUnsyncedChanges ? 'btn-warning' : 
                  'btn-primary'
                }`}
                onClick={handleSave}
                disabled={saving || isSyncing}
              >
                {saving || isSyncing ? (
                  <><Loader2 className="w-4 h-4 animate-spin" />Saving...</>
                ) : saveSuccess ? (
                  <><Check className="w-4 h-4" />Saved</>
                ) : syncError ? (
                  <><AlertTriangle className="w-4 h-4" />Retry</>
                ) : (
                  <><Save className="w-4 h-4" />Save</>
                )}
              </button>
            )}
            {isGuest && (
              <span className="badge badge-warning badge-outline gap-1">Guest Mode</span>
            )}
          </div>
        </div>
        
        {!isGuest && (
          <>
            <div className="flex items-center gap-2 mt-2 text-xs text-base-content/50">
              <span>Last saved: {formatLastSync(lastSyncTime)}</span>
              {hasUnsyncedChanges && (
                <span className="badge badge-xs badge-warning">unsaved changes</span>
              )}
            </div>
            
            {syncError && (
              <div className="alert alert-error alert-sm mt-2 py-2">
                <AlertTriangle className="w-4 h-4" />
                <span className="text-sm">{syncError}</span>
                <button className="btn btn-ghost btn-xs" onClick={settingsStore.clearSyncError}>
                  Dismiss
                </button>
              </div>
            )}
          </>
        )}
        {isGuest && (
          <p className="text-xs text-base-content/50 mt-2">
            Progress saved locally on this device
          </p>
        )}
      </header>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-auto px-4 py-4 space-y-6">
        
        {/* ========== PROGRESS DASHBOARD ========== */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-success" />
              Your Progress
            </h2>
            {isRefreshingProgress && (
              <span className="flex items-center gap-1.5 text-xs text-base-content/50">
                <Loader2 className="w-3 h-3 animate-spin" />
                Syncing...
              </span>
            )}
          </div>
          
          {progressStats.totalStudying === 0 ? (
            <div className="bg-base-200 rounded-xl p-6 text-center">
              <div className="text-4xl mb-3">📚</div>
              <p className="text-base-content/60">
                Import some vocabulary to start tracking progress!
              </p>
            </div>
          ) : (
            <>
              {/* Overview Stats */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-base-200 rounded-xl p-4 text-center">
                  <div className="text-2xl font-bold text-warning">
                    {progressStats.knowledgeCounts.above50 + progressStats.knowledgeCounts.below50}
                  </div>
                  <div className="text-xs text-base-content/60">Learning</div>
                </div>
                <div className="bg-base-200 rounded-xl p-4 text-center">
                  <div className="text-2xl font-bold text-success">
                    {progressStats.knowledgeCounts.above80}
                  </div>
                  <div className="text-xs text-base-content/60">Confident</div>
                </div>
                <div className="bg-base-200 rounded-xl p-4 text-center">
                  <div className="text-2xl font-bold text-base-content/40">
                    {progressStats.totalUnknown}
                  </div>
                  <div className="text-xs text-base-content/60">Unknown</div>
                </div>
              </div>
              
              {/* Modality Breakdown */}
              <div className="bg-base-200 rounded-xl p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-medium flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-base-content/60" />
                    Modality Breakdown
                    {isRefreshingProgress && (
                      <Loader2 className="w-3 h-3 animate-spin text-base-content/40" />
                    )}
                  </h3>
                  <span className="text-sm text-base-content/60">
                    Avg: {progressStats.overallAvg}%
                  </span>
                </div>
                
                <div className="space-y-3">
                  {modalities.map((modality) => {
                    const info = MODALITY_INFO[modality];
                    const value = progressStats.modalityAvgs[modality];
                    
                    return (
                      <div key={modality} className="space-y-1">
                        <div className="flex items-center justify-between text-sm">
                          <span className="flex items-center gap-2">
                            <span>{info.emoji}</span>
                            <span>{info.label}</span>
                          </span>
                          <span className="font-medium text-primary">
                            {value}%
                          </span>
                        </div>
                        <ProgressBar value={value} color="primary" size="sm" />
                      </div>
                    );
                  })}
                </div>
              </div>
              
              {/* Streak Recovery */}
              {streakData && !streakData.loading && (
                <div className="bg-base-200 rounded-xl p-4 space-y-3">
                  <div className="flex items-center gap-3">
                    <div className={`flex items-center justify-center w-10 h-10 rounded-full ${
                      streakData.isStreakBroken
                        ? 'bg-base-300'
                        : streakData.streak > 0
                          ? 'bg-gradient-to-br from-orange-500 to-amber-400'
                          : 'bg-base-300'
                    }`}>
                      {streakData.isStreakBroken ? (
                        <Snowflake className="w-5 h-5 text-base-content/40" />
                      ) : (
                        <Flame className={`w-5 h-5 ${streakData.streak > 0 ? 'text-white' : 'text-base-content/40'}`} />
                      )}
                    </div>
                    <div className="flex-1">
                      <div className="font-bold text-lg">
                        {streakData.isStreakBroken ? 'Streak Broken' : `${streakData.streak} Day${streakData.streak !== 1 ? 's' : ''}`}
                      </div>
                      <div className="text-xs text-base-content/60">
                        {streakData.bestStreak > 0 && `Best: ${streakData.bestStreak} day${streakData.bestStreak !== 1 ? 's' : ''}`}
                      </div>
                    </div>
                    {streakData.todayAttempts > 0 && (
                      <div className="text-right">
                        <div className="text-sm font-medium">{streakData.todayAttempts} Qs</div>
                        <div className="text-xs text-success">{streakData.todayAccuracy}%</div>
                      </div>
                    )}
                  </div>

                  {streakData.isStreakBroken && streakData.missedDays.length > 0 && (
                    <div className="bg-base-300 rounded-lg p-3 space-y-3">
                      <div className="flex items-center gap-2">
                        <Zap className="w-4 h-4 text-warning" />
                        <span className="font-medium text-sm">Resume Your Streak</span>
                      </div>
                      <p className="text-xs text-base-content/60">
                        You missed {streakData.missedDays.length} day{streakData.missedDays.length !== 1 ? 's' : ''}.
                        Complete {streakData.recoveryQuizzesNeeded - streakData.recoveryQuizzesCompleted} extra
                        {' '}quiz{(streakData.recoveryQuizzesNeeded - streakData.recoveryQuizzesCompleted) !== 1 ? 'zes' : ''} to
                        recover — one per missed day.
                      </p>
                      {streakData.recoveryQuizzesCompleted > 0 && (
                        <div className="space-y-1.5">
                          <div className="flex justify-between text-xs text-base-content/60">
                            <span>Recovery progress</span>
                            <span>{streakData.recoveryQuizzesCompleted}/{streakData.recoveryQuizzesNeeded}</span>
                          </div>
                          <div className="w-full bg-base-100 rounded-full h-2">
                            <div
                              className="bg-warning rounded-full h-2 transition-all duration-500"
                              style={{ width: `${(streakData.recoveryQuizzesCompleted / streakData.recoveryQuizzesNeeded) * 100}%` }}
                            />
                          </div>
                        </div>
                      )}
                      <button
                        onClick={() => navigate('/quiz?recovery=true')}
                        className="btn btn-warning btn-sm w-full"
                      >
                        <Flame className="w-4 h-4" />
                        {streakData.recoveryQuizzesCompleted > 0 ? 'Continue Recovery' : 'Start Recovery Quiz'}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Activity Timeline */}
              <ProgressTimeline userId={userId} isGuest={isGuest} />
            </>
          )}
        </section>

        {/* ========== REVIEW SETTINGS ========== */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            Quiz Settings
          </h2>
          
          {/* Cards per Session */}
          <div className="bg-base-200 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <div>
                <h3 className="font-medium">Questions per Quiz</h3>
                <p className="text-sm text-base-content/60">
                  How many questions in each quiz session
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  className="btn btn-sm btn-circle btn-ghost"
                  onClick={() => settingsStore.setCardsPerSession(settings.cardsPerSession - 5)}
                  disabled={settings.cardsPerSession <= 5}
                >
                  <Minus className="w-4 h-4" />
                </button>
                <span className="text-2xl font-bold min-w-12 text-center">
                  {settings.cardsPerSession}
                </span>
                <button
                  className="btn btn-sm btn-circle btn-ghost"
                  onClick={() => settingsStore.setCardsPerSession(settings.cardsPerSession + 5)}
                  disabled={settings.cardsPerSession >= 50}
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>
            <input
              type="range"
              min="5"
              max="50"
              step="5"
              value={settings.cardsPerSession}
              onChange={(e) => settingsStore.setCardsPerSession(Number(e.target.value))}
              className="range range-primary range-sm w-full"
            />
          </div>
        </section>

        {/* ========== LEARNING FOCUS ========== */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Eye className="w-5 h-5 text-secondary" />
            Learning Focus
          </h2>
          <p className="text-sm text-base-content/60 -mt-2">
            Set priority for what gets tested in Quiz. Higher = tested more often.
          </p>
          
          <div className="space-y-3">
            {focusFields.map((field) => (
              <div key={field} className="bg-base-200 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="font-medium flex items-center gap-2">
                      <span>{MODALITY_INFO[field].emoji}</span>
                      <span className="capitalize">{field}</span>
                    </h3>
                    <p className="text-xs text-base-content/60">
                      {FOCUS_DESCRIPTIONS[field]}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  {focusLevels.map((level) => (
                    <button
                      key={level}
                      className="focus-btn flex-1"
                      data-level={level}
                      data-active={settings.learningFocus[field] === level}
                      onClick={() => settingsStore.setLearningFocus(field, level)}
                    >
                      {FOCUS_LABELS[level]}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ========== SYNTAX SETTINGS ========== */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Layers className="w-5 h-5 text-accent" />
            Syntax Practice
          </h2>
          
          {/* Reading vs Writing balance */}
          <div className="bg-base-200 rounded-xl p-4">
            <div className="mb-3">
              <h3 className="font-medium">Exercise Direction</h3>
              <p className="text-sm text-base-content/60">
                Balance between comprehension (reading) and production (writing)
              </p>
            </div>
            
            {/* Slider with labels */}
            <div className="space-y-2">
              <div className="flex justify-between text-sm text-base-content/70">
                <span className="flex items-center gap-1">
                  📖 Reading
                  <span className="text-xs text-base-content/50">(CN→EN)</span>
                </span>
                <span className="flex items-center gap-1">
                  <span className="text-xs text-base-content/50">(EN→CN)</span>
                  Writing ✍️
                </span>
              </div>
              
              <input
                type="range"
                min="0"
                max="4"
                step="1"
                value={settings.syntax?.directionRatio ?? 1}
                onChange={(e) => settingsStore.setSyntaxSettings({ 
                  directionRatio: Number(e.target.value) as SyntaxDirectionRatio 
                })}
                className="range range-accent range-sm w-full"
              />
              
              {/* Tick marks */}
              <div className="flex justify-between px-1">
                {SYNTAX_DIRECTION_OPTIONS.map((_, idx) => (
                  <span 
                    key={idx}
                    className={`text-xs ${
                      (settings.syntax?.directionRatio ?? 1) === idx 
                        ? 'text-accent font-medium' 
                        : 'text-base-content/40'
                    }`}
                  >
                    |
                  </span>
                ))}
              </div>
              
              {/* Current selection label */}
              <div className="text-center">
                <span className="badge badge-accent badge-sm">
                  {SYNTAX_DIRECTION_OPTIONS[settings.syntax?.directionRatio ?? 1]?.label ?? 'Balanced'}
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* ========== THEME SELECTION ========== */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            {settings.theme === 'light' || settings.theme === 'sakura' ? (
              <Sun className="w-5 h-5 text-warning" />
            ) : (
              <Moon className="w-5 h-5 text-info" />
            )}
            Theme
          </h2>
          
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {themes.map((theme) => {
              const meta = THEME_META[theme];
              const isSelected = settings.theme === theme;
              
              return (
                <button
                  key={theme}
                  className={`theme-card border-base-300 ${
                    isSelected ? 'bg-primary/10 border-primary' : 'bg-base-200 hover:bg-base-300'
                  }`}
                  data-selected={isSelected}
                  onClick={() => settingsStore.setTheme(theme)}
                >
                  <div className="text-2xl mb-1">{meta.emoji}</div>
                  <div className="font-medium text-sm">{meta.name}</div>
                  <div className="text-xs text-base-content/60">{meta.description}</div>
                  {isSelected && (
                    <div className="mt-2">
                      <Check className="w-4 h-4 text-primary mx-auto" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </section>

        {/* ========== DISPLAY SETTINGS ========== */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Type className="w-5 h-5 text-accent" />
            Display
          </h2>
          
          {/* Character Size */}
          <div className="bg-base-200 rounded-xl p-4">
            <h3 className="font-medium mb-3">Character Size</h3>
            <div className="flex gap-2">
              {(['small', 'medium', 'large'] as const).map((size) => (
                <button
                  key={size}
                  className={`btn flex-1 h-16 flex-col ${
                    settings.characterSize === size ? 'btn-primary' : 'btn-ghost'
                  }`}
                  onClick={() => settingsStore.updateSettings({ characterSize: size })}
                >
                  <span className="hanzi" style={{ 
                    fontSize: size === 'small' ? '1.25rem' : size === 'medium' ? '1.75rem' : '2.5rem' 
                  }}>字</span>
                  <span className="text-xs opacity-60 capitalize">{size}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Pinyin Display */}
          <div className="bg-base-200 rounded-xl p-4">
            <h3 className="font-medium mb-3">Pinyin Display</h3>
            <div className="flex gap-2">
              {(['tones', 'numbers'] as PinyinDisplay[]).map((display) => (
                <button
                  key={display}
                  className={`btn flex-1 ${
                    settings.pinyinDisplay === display ? 'btn-primary' : 'btn-ghost'
                  }`}
                  onClick={() => settingsStore.updateSettings({ pinyinDisplay: display })}
                >
                  <span className="pinyin">
                    {display === 'tones' ? 'māma' : 'ma1ma'}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* ========== AUDIO / TTS SETTINGS ========== */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Mic className="w-5 h-5 text-info" />
            Audio & Pronunciation
          </h2>
          
          {!ttsSupported ? (
            <div className="alert alert-warning">
              <AlertTriangle className="w-4 h-4" />
              <span>Your browser doesn't support text-to-speech.</span>
            </div>
          ) : (
            <>
              {/* Voice Selection */}
              <div className="bg-base-200 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="font-medium">Chinese Voice</h3>
                    <p className="text-sm text-base-content/60">
                      {voicesLoading ? 'Loading...' : 
                       `${availableVoices.length} voice${availableVoices.length !== 1 ? 's' : ''}`}
                    </p>
                    <p className="text-xs text-base-content/40 mt-1">
                      Saving for: <span className="font-medium text-info">{browserDisplayName}</span>
                    </p>
                  </div>
                  <button
                    className={`btn btn-sm btn-circle ${testingVoice ? 'btn-error' : 'btn-info'}`}
                    onClick={handleTestVoice}
                    disabled={voicesLoading || availableVoices.length === 0}
                  >
                    <Play className={`w-4 h-4 ${testingVoice ? 'hidden' : ''}`} />
                    {testingVoice && <span className="loading loading-spinner loading-xs" />}
                  </button>
                </div>
                
                {availableVoices.length > 0 && (
                  <select
                    className="select select-bordered w-full"
                    value={getCurrentVoiceId()}
                    onChange={(e) => setCurrentVoiceId(e.target.value)}
                  >
                    <option value="">Auto (best available)</option>
                    {availableVoices.map((voice) => (
                      <option key={voice.id} value={voice.id}>
                        {voice.name}
                        {voice.gender !== 'unknown' && ` (${voice.gender})`}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Speech Rate */}
              <div className="bg-base-200 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-medium">Speech Speed</h3>
                  <span className="text-xl font-bold text-info">
                    {settings.audio.speechRate}x
                  </span>
                </div>
                <div className="flex gap-2 flex-wrap">
                  {SPEECH_RATE_PRESETS.map((preset) => (
                    <button
                      key={preset.value}
                      className={`btn btn-sm ${
                        settings.audio.speechRate === preset.value ? 'btn-info' : 'btn-ghost'
                      }`}
                      onClick={() => settingsStore.setAudioSettings({ speechRate: preset.value })}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Auto-play */}
              <div className="bg-base-200 rounded-xl p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {settings.autoPlayAudio ? (
                    <Volume2 className="w-5 h-5 text-info" />
                  ) : (
                    <VolumeX className="w-5 h-5 text-base-content/60" />
                  )}
                  <div>
                    <h3 className="font-medium">Auto-play Audio</h3>
                    <p className="text-sm text-base-content/60">
                      Play pronunciation automatically
                    </p>
                  </div>
                </div>
                <input
                  type="checkbox"
                  className="toggle toggle-info"
                  checked={settings.autoPlayAudio}
                  onChange={(e) => settingsStore.updateSettings({ autoPlayAudio: e.target.checked })}
                />
              </div>
            </>
          )}
        </section>

        {/* ========== ACCOUNT ========== */}
        {!isGuest && (
          <section className="space-y-4">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              {reminderEnabled ? (
                <Bell className="w-5 h-5 text-success" />
              ) : (
                <BellOff className="w-5 h-5 text-base-content/60" />
              )}
              PWA Reminders
            </h2>

            <div className="bg-base-200 rounded-xl p-4 space-y-3">
              {!reminderSupported ? (
                <div className="alert alert-warning py-2">
                  <AlertTriangle className="w-4 h-4" />
                  <span className="text-sm">Push notifications are not supported in this browser.</span>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-base-content/70">Status</span>
                    <span className={`badge ${reminderEnabled ? 'badge-success' : 'badge-ghost'}`}>
                      {reminderEnabled ? 'Enabled' : 'Disabled'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-base-content/70">Permission</span>
                    <span className="text-sm font-medium capitalize">
                      {typeof Notification !== 'undefined' ? Notification.permission : 'unknown'}
                    </span>
                  </div>
                  <p className="text-xs text-base-content/60">
                    Install this app to your home screen for the best reminder behavior.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <label className="form-control">
                      <span className="label-text text-xs text-base-content/60 mb-1">Daily reminder time</span>
                      <input
                        type="time"
                        className="input input-bordered input-sm"
                        value={reminderTime}
                        onChange={(e) => setReminderTime(e.target.value)}
                        disabled={reminderBusy}
                      />
                    </label>
                    <label className="form-control">
                      <span className="label-text text-xs text-base-content/60 mb-1">Timezone (IANA)</span>
                      <input
                        type="text"
                        className="input input-bordered input-sm"
                        value={reminderTimezone}
                        onChange={(e) => setReminderTimezone(e.target.value)}
                        placeholder="Asia/Kolkata"
                        disabled={reminderBusy}
                      />
                    </label>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      className="btn btn-ghost btn-xs"
                      type="button"
                      onClick={() => setReminderTimezone(getBrowserTimezone())}
                      disabled={reminderBusy}
                    >
                      Use device timezone
                    </button>
                    <button
                      className="btn btn-accent btn-xs"
                      type="button"
                      onClick={handleSaveReminderSchedule}
                      disabled={!reminderEnabled || reminderBusy}
                    >
                      {reminderBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                      Save schedule
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {!reminderEnabled ? (
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={handleEnableReminders}
                        disabled={reminderBusy}
                      >
                        {reminderBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bell className="w-4 h-4" />}
                        Enable reminders
                      </button>
                    ) : (
                      <button
                        className="btn btn-outline btn-sm"
                        onClick={handleDisableReminders}
                        disabled={reminderBusy}
                      >
                        {reminderBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <BellOff className="w-4 h-4" />}
                        Disable
                      </button>
                    )}

                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={handleSendTestReminder}
                      disabled={!reminderEnabled || reminderBusy}
                    >
                      {reminderBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bell className="w-4 h-4" />}
                      Send test push
                    </button>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={handleWithdrawNotification}
                      disabled={!reminderEnabled}
                      title="Dismiss any visible reminder notification (simulates streak completion)"
                    >
                      <BellOff className="w-4 h-4" />
                      Withdraw
                    </button>
                  </div>

                  {reminderMessage && (
                    <div className="alert alert-success py-2">
                      <Check className="w-4 h-4" />
                      <span className="text-sm">{reminderMessage}</span>
                    </div>
                  )}
                  {reminderError && (
                    <div className="alert alert-error py-2">
                      <AlertTriangle className="w-4 h-4" />
                      <span className="text-sm">{reminderError}</span>
                    </div>
                  )}
                </>
              )}
            </div>
          </section>
        )}

        {/* ========== ACCOUNT ========== */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold">Account</h2>
          
          <div className="bg-base-200 rounded-xl p-4 space-y-4">
            {isGuest ? (
              <>
                <div className="flex items-start gap-3">
                  <div className="badge badge-warning badge-lg">Guest</div>
                  <div className="flex-1">
                    <p className="font-medium">Guest Mode</p>
                    <p className="text-sm text-base-content/60">
                      Your progress is saved locally on this device only.
                    </p>
                  </div>
                </div>
                
                <div className="alert alert-info py-3">
                  <div className="text-left">
                    <p className="text-sm font-medium">🔒 Want cloud sync?</p>
                    <p className="text-xs opacity-80 mt-1">
                      Access is invite-only.{' '}
                      <a 
                        href="https://github.com/avi-otterai/mandarin/issues"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="link link-hover font-medium"
                      >
                        Open an issue on GitHub
                      </a>
                      {' '}to request an account.
                    </p>
                  </div>
                </div>
                
                <button
                  className="btn btn-outline btn-warning w-full"
                  onClick={onLogout}
                >
                  <LogOut className="w-4 h-4" />
                  Exit Guest Mode
                </button>
              </>
            ) : (
              <>
                {userEmail && (
                  <div>
                    <p className="text-sm text-base-content/60">Signed in as</p>
                    <p className="font-medium">{userEmail}</p>
                  </div>
                )}
                
                <button
                  className="btn btn-outline btn-error w-full"
                  onClick={onLogout}
                >
                  <LogOut className="w-4 h-4" />
                  Sign Out
                </button>
              </>
            )}
          </div>
          
          <button
            className="btn btn-ghost btn-sm w-full text-base-content/60"
            onClick={() => {
              if (confirm('Reset all settings to defaults?')) {
                settingsStore.resetToDefaults();
              }
            }}
          >
            <RefreshCw className="w-4 h-4" />
            Reset to Defaults
          </button>
        </section>

        <div className="h-4" />
      </div>
    </div>
  );
}
