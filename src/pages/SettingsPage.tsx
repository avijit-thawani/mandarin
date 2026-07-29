import { useState, useEffect } from 'react';
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
  Shuffle,
  Sparkles,
  Type,
  Moon,
  Sun,
  Play,
  Mic,
  HelpCircle,
} from 'lucide-react';
import type { SettingsStore } from '../stores/settingsStore';
import type { 
  ThemeType, 
  FocusLevel, 
  LearningFocus, 
  PinyinDisplay,
} from '../types/settings';
import { FOCUS_LABELS, FOCUS_DESCRIPTIONS, THEME_META, SPEECH_RATE_PRESETS } from '../types/settings';
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

interface SettingsPageProps {
  settingsStore: SettingsStore;
  onSave: () => Promise<void>;
  onLogout: () => void;
  userEmail?: string;
  onShowHelp?: () => void;
}

export function SettingsPage({ settingsStore, onSave, onLogout, userEmail, onShowHelp }: SettingsPageProps) {
  const { settings, isSyncing, syncError, hasUnsyncedChanges, lastSyncTime } = settingsStore;
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  
  // TTS state
  const [availableVoices, setAvailableVoices] = useState<TTSVoice[]>([]);
  const [voicesLoading, setVoicesLoading] = useState(true);
  const [testingVoice, setTestingVoice] = useState(false);
  const ttsSupported = isTTSSupported();
  
  // Browser detection for per-browser voice preferences
  const [currentBrowser] = useState<BrowserType>(() => detectBrowser());
  const browserDisplayName = getBrowserDisplayName(currentBrowser);
  
  // Get current voice for this browser (with fallback to legacy field)
  const getCurrentVoiceId = (): string => {
    const voicesByBrowser = settings.audio.voicesByBrowser || {};
    const browserVoice = voicesByBrowser[currentBrowser];
    // Use browser-specific voice if set, otherwise fall back to legacy field
    if (browserVoice !== undefined) return browserVoice;
    return settings.audio.browserVoiceId || '';
  };
  
  // Set voice for current browser
  const setCurrentVoiceId = (voiceId: string) => {
    const voicesByBrowser = { ...(settings.audio.voicesByBrowser || {}) };
    voicesByBrowser[currentBrowser] = voiceId;
    settingsStore.setAudioSettings({ 
      voicesByBrowser,
      browserVoiceId: voiceId, // Also update legacy field for backwards compat
    });
  };

  // Load available voices on mount
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

  // Test voice preview
  const handleTestVoice = async () => {
    if (testingVoice) {
      stopSpeaking();
      setTestingVoice(false);
      return;
    }
    
    setTestingVoice(true);
    try {
      const voiceId = getCurrentVoiceId();
      await speak('你好，我是你的中文老师。', {
        voiceId: voiceId || undefined,
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

  const themes: ThemeType[] = ['light', 'dark', 'duo', 'wooden', 'ocean', 'forest', 'sakura', 'ink'];
  const focusLevels: FocusLevel[] = [0, 1, 2, 3];
  const focusFields: (keyof LearningFocus)[] = ['character', 'pinyin', 'meaning', 'audio'];

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <header className="flex-shrink-0 bg-base-100 border-b border-base-300 px-4 py-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">Settings</h1>
            <p className="text-sm text-base-content/60">
              Customize your learning experience
            </p>
          </div>
          
          <div className="flex items-center gap-2">
            {onShowHelp && (
              <button
                className="btn btn-sm btn-ghost btn-circle text-base-content/50 hover:text-primary"
                onClick={onShowHelp}
                title="Help & Guide"
              >
                <HelpCircle className="w-5 h-5" />
              </button>
            )}
            
            {/* Save Button */}
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
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Saving...
                </>
              ) : saveSuccess ? (
                <>
                  <Check className="w-4 h-4" />
                  Saved
                </>
              ) : syncError ? (
                <>
                  <AlertTriangle className="w-4 h-4" />
                  Retry
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Save
                </>
              )}
            </button>
          </div>
        </div>
        
        {/* Sync status */}
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
            <button 
              className="btn btn-ghost btn-xs"
              onClick={settingsStore.clearSyncError}
            >
              Dismiss
            </button>
          </div>
        )}
      </header>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-auto px-4 py-4 space-y-6">
        
        {/* ========== REVIEW SETTINGS ========== */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            Review Settings
          </h2>
          
          {/* Cards per Session */}
          <div className="bg-base-200 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <div>
                <h3 className="font-medium">Cards per Session</h3>
                <p className="text-sm text-base-content/60">
                  Number of cards to review each session
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
            <div className="flex justify-between text-xs text-base-content/50 mt-1">
              <span>5</span>
              <span>50</span>
            </div>
          </div>

          {/* Shuffle Mode */}
          <div className="bg-base-200 rounded-xl p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Shuffle className="w-5 h-5 text-base-content/60" />
              <div>
                <h3 className="font-medium">Shuffle Cards</h3>
                <p className="text-sm text-base-content/60">
                  Randomize order each session
                </p>
              </div>
            </div>
            <input
              type="checkbox"
              className="toggle toggle-primary"
              checked={settings.shuffleMode}
              onChange={(e) => settingsStore.updateSettings({ shuffleMode: e.target.checked })}
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
            Set priority for what gets tested. Higher = tested more often.
          </p>
          
          <div className="space-y-3">
            {focusFields.map((field) => (
              <div key={field} className="bg-base-200 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="font-medium capitalize">{field}</h3>
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
              <button
                className={`btn flex-1 h-16 ${
                  settings.characterSize === 'small' ? 'btn-primary' : 'btn-ghost'
                }`}
                onClick={() => settingsStore.updateSettings({ characterSize: 'small' })}
              >
                <span className="hanzi" style={{ fontSize: '1.25rem' }}>字</span>
                <span className="text-xs opacity-60">Small</span>
              </button>
              <button
                className={`btn flex-1 h-16 ${
                  settings.characterSize === 'medium' ? 'btn-primary' : 'btn-ghost'
                }`}
                onClick={() => settingsStore.updateSettings({ characterSize: 'medium' })}
              >
                <span className="hanzi" style={{ fontSize: '1.75rem' }}>字</span>
                <span className="text-xs opacity-60">Medium</span>
              </button>
              <button
                className={`btn flex-1 h-16 ${
                  settings.characterSize === 'large' ? 'btn-primary' : 'btn-ghost'
                }`}
                onClick={() => settingsStore.updateSettings({ characterSize: 'large' })}
              >
                <span className="hanzi" style={{ fontSize: '2.5rem' }}>字</span>
                <span className="text-xs opacity-60">Large</span>
              </button>
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

          {/* Show Example Sentences */}
          <div className="bg-base-200 rounded-xl p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Eye className="w-5 h-5 text-base-content/60" />
              <div>
                <h3 className="font-medium">Example Sentences</h3>
                <p className="text-sm text-base-content/60">
                  Show usage examples when available
                </p>
              </div>
            </div>
            <input
              type="checkbox"
              className="toggle toggle-primary"
              checked={settings.showExampleSentences}
              onChange={(e) => settingsStore.updateSettings({ showExampleSentences: e.target.checked })}
            />
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
              <span>Your browser doesn't support text-to-speech. Try Chrome or Safari.</span>
            </div>
          ) : (
            <>
              {/* Voice Selection */}
              <div className="bg-base-200 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="font-medium">Chinese Voice</h3>
                    <p className="text-sm text-base-content/60">
                      {voicesLoading ? 'Loading voices...' : 
                       availableVoices.length === 0 ? 'No Chinese voices found' :
                       `${availableVoices.length} voice${availableVoices.length > 1 ? 's' : ''} available`}
                    </p>
                    <p className="text-xs text-base-content/40 mt-1">
                      Saving for: <span className="font-medium text-info">{browserDisplayName}</span>
                    </p>
                  </div>
                  <button
                    className={`btn btn-sm btn-circle ${testingVoice ? 'btn-error' : 'btn-info'}`}
                    onClick={handleTestVoice}
                    disabled={voicesLoading || availableVoices.length === 0}
                    title={testingVoice ? 'Stop' : 'Test voice'}
                  >
                    <Play className={`w-4 h-4 ${testingVoice ? 'hidden' : ''}`} />
                    {testingVoice && <span className="loading loading-spinner loading-xs" />}
                  </button>
                </div>
                
                {availableVoices.length > 0 && (
                  <>
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
                          {voice.localService && ' • Offline'}
                        </option>
                      ))}
                    </select>
                    {/* Show if saved voice doesn't match any available voice */}
                    {getCurrentVoiceId() && !availableVoices.some(v => v.id === getCurrentVoiceId()) && (
                      <p className="text-xs text-warning mt-2">
                        ⚠️ Saved voice "{getCurrentVoiceId()}" not found in this browser. 
                        Select a new voice to update.
                      </p>
                    )}
                  </>
                )}
              </div>

              {/* Speech Rate */}
              <div className="bg-base-200 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="font-medium">Speech Speed</h3>
                    <p className="text-sm text-base-content/60">
                      {SPEECH_RATE_PRESETS.find(p => p.value === settings.audio.speechRate)?.description || 
                       `${settings.audio.speechRate}x`}
                    </p>
                  </div>
                  <span className="text-xl font-bold text-info">
                    {settings.audio.speechRate}x
                  </span>
                </div>
                
                <div className="flex gap-2 flex-wrap">
                  {SPEECH_RATE_PRESETS.map((preset) => (
                    <button
                      key={preset.value}
                      className={`btn btn-sm ${
                        settings.audio.speechRate === preset.value 
                          ? 'btn-info' 
                          : 'btn-ghost'
                      }`}
                      onClick={() => settingsStore.setAudioSettings({ speechRate: preset.value })}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Auto-play Audio (moved here for context) */}
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
                      Play pronunciation when revealed
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

        {/* ========== ACCESSIBILITY ========== */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold">Accessibility</h2>
          
          <div className="bg-base-200 rounded-xl p-4 flex items-center justify-between">
            <div>
              <h3 className="font-medium">Reduced Motion</h3>
              <p className="text-sm text-base-content/60">
                Minimize animations
              </p>
            </div>
            <input
              type="checkbox"
              className="toggle toggle-primary"
              checked={settings.reducedMotion}
              onChange={(e) => settingsStore.updateSettings({ reducedMotion: e.target.checked })}
            />
          </div>
        </section>

        {/* ========== ACCOUNT ========== */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold">Account</h2>
          
          <div className="bg-base-200 rounded-xl p-4 space-y-4">
            {userEmail && (
              <div>
                <p className="text-sm text-base-content/60">Signed in as</p>
                <p className="font-medium">{userEmail}</p>
              </div>
            )}
            
            <div className="flex gap-2">
              <button
                className="btn btn-outline btn-error flex-1"
                onClick={onLogout}
              >
                <LogOut className="w-4 h-4" />
                Sign Out
              </button>
            </div>
          </div>
          
          {/* Reset to Defaults */}
          <button
            className="btn btn-ghost btn-sm w-full text-base-content/60"
            onClick={() => {
              if (confirm('Reset all settings to defaults? This cannot be undone.')) {
                settingsStore.resetToDefaults();
              }
            }}
          >
            <RefreshCw className="w-4 h-4" />
            Reset to Defaults
          </button>
        </section>

        {/* Bottom padding for scroll */}
        <div className="h-4" />
      </div>
    </div>
  );
}
