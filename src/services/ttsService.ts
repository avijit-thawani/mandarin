// Text-to-Speech Service - Browser Speech API implementation
// Provides Chinese pronunciation for vocabulary words

export interface TTSVoice {
  id: string;           // Unique voice URI
  name: string;         // Display name
  lang: string;         // Language code (zh-CN, zh-TW, etc.)
  gender?: 'male' | 'female' | 'unknown';
  localService: boolean; // True if offline-capable
}

export interface TTSOptions {
  rate?: number;        // 0.1 - 10 (default 1.0)
  pitch?: number;       // 0 - 2 (default 1.0)
  volume?: number;      // 0 - 1 (default 1.0)
  voiceId?: string;     // Voice URI to use
}

// Browser type for per-browser voice preferences
export type BrowserType = 'safari' | 'chrome' | 'firefox' | 'cursor' | 'arc' | 'edge' | 'unknown';

// Detect current browser type from user agent
export function detectBrowser(): BrowserType {
  if (typeof navigator === 'undefined') return 'unknown';
  
  const ua = navigator.userAgent.toLowerCase();
  
  // Debug: log user agent on first call
  if (typeof window !== 'undefined' && !(window as unknown as { __browserDetected?: boolean }).__browserDetected) {
    console.log('[TTS] User agent:', navigator.userAgent);
    (window as unknown as { __browserDetected?: boolean }).__browserDetected = true;
  }
  
  // Order matters - more specific checks first
  // Cursor Browser uses Electron with specific identifiers
  if (ua.includes('cursor') || ua.includes('electron')) return 'cursor';
  if (ua.includes('arc/')) return 'arc';
  if (ua.includes('edg/')) return 'edge';
  if (ua.includes('firefox')) return 'firefox';
  if (ua.includes('chrome') && !ua.includes('chromium')) return 'chrome';
  if (ua.includes('safari') && !ua.includes('chrome')) return 'safari';
  
  return 'unknown';
}

// Get display name for browser type
export function getBrowserDisplayName(browser: BrowserType): string {
  const names: Record<BrowserType, string> = {
    safari: 'Safari',
    chrome: 'Chrome',
    firefox: 'Firefox',
    cursor: 'Cursor Browser',
    arc: 'Arc',
    edge: 'Edge',
    unknown: 'Browser',
  };
  return names[browser];
}

// Default voice preferences per browser (curated by user preference)
// These are voice URIs that work well on each platform
export const DEFAULT_VOICES_BY_BROWSER: Partial<Record<BrowserType, string>> = {
  cursor: 'Chinese Taiwan',  // User's preferred voice for Cursor
  safari: 'com.apple.voice.compact.zh-TW.Meijia',  // Meijia for Safari/macOS
  chrome: '',  // Let Chrome auto-select
  arc: '',     // Let Arc auto-select
};

// Helper to get the voice ID for the current browser from audio settings
// Used by components that need to play audio
export function getVoiceForCurrentBrowser(audioSettings: {
  browserVoiceId?: string;
  voicesByBrowser?: Partial<Record<string, string>>;
}): string | undefined {
  const browser = detectBrowser();
  const voicesByBrowser = audioSettings?.voicesByBrowser || {};
  
  // Try browser-specific voice first
  const browserVoice = voicesByBrowser[browser];
  if (browserVoice !== undefined && browserVoice !== '') {
    return browserVoice;
  }
  
  // Fall back to legacy field
  if (audioSettings?.browserVoiceId) {
    return audioSettings.browserVoiceId;
  }
  
  // Return undefined to let the TTS system auto-select
  return undefined;
}

// Singleton state
let cachedVoices: TTSVoice[] = [];
let voicesLoaded = false;
let voiceLoadPromise: Promise<TTSVoice[]> | null = null;

// Check if browser supports Speech Synthesis
export function isTTSSupported(): boolean {
  return typeof window !== 'undefined' && 
         'speechSynthesis' in window &&
         'SpeechSynthesisUtterance' in window;
}

// Get available Chinese voices
export async function getChineseVoices(): Promise<TTSVoice[]> {
  if (!isTTSSupported()) {
    return [];
  }

  // Return cached if already loaded
  if (voicesLoaded && cachedVoices.length > 0) {
    return cachedVoices;
  }

  // If already loading, wait for it
  if (voiceLoadPromise) {
    return voiceLoadPromise;
  }

  // Load voices (they may load async on some browsers)
  voiceLoadPromise = new Promise((resolve) => {
    const loadVoices = () => {
      const allVoices = window.speechSynthesis.getVoices();
      
      // Filter for Chinese voices
      const chineseVoices = allVoices
        .filter(v => v.lang.startsWith('zh') || v.lang.includes('Chinese'))
        .map(v => ({
          id: v.voiceURI,
          name: formatVoiceName(v.name, v.lang),
          lang: v.lang,
          gender: guessGender(v.name),
          localService: v.localService,
        }));

      cachedVoices = chineseVoices;
      voicesLoaded = true;
      resolve(chineseVoices);
    };

    // Some browsers load voices async
    if (window.speechSynthesis.getVoices().length > 0) {
      loadVoices();
    } else {
      window.speechSynthesis.onvoiceschanged = loadVoices;
      // Timeout fallback
      setTimeout(() => {
        if (!voicesLoaded) {
          loadVoices();
        }
      }, 1000);
    }
  });

  return voiceLoadPromise;
}

// Format voice name for display
function formatVoiceName(name: string, lang: string): string {
  // Clean up common prefixes
  let displayName = name
    .replace('Microsoft ', '')
    .replace('Google ', '')
    .replace('Apple ', '')
    .replace(' Online (Natural)', '')
    .replace(' (Natural)', '');
  
  // Add language hint
  const langHint = lang === 'zh-TW' ? '(Taiwan)' : 
                   lang === 'zh-HK' ? '(HK)' : 
                   lang === 'zh-CN' ? '(Mainland)' : '';
  
  if (langHint && !displayName.includes(langHint)) {
    displayName = `${displayName} ${langHint}`;
  }
  
  return displayName;
}

// Guess gender from voice name (heuristic)
function guessGender(name: string): 'male' | 'female' | 'unknown' {
  const lowerName = name.toLowerCase();
  
  // Common female names in TTS
  const femaleIndicators = ['female', 'woman', 'xiaoxiao', 'xiaoyi', 'xiaomo', 'yunxi', 
    'huihui', 'yaoyao', 'tingting', 'ting-ting', 'meijia', 'siqi'];
  
  // Common male names in TTS
  const maleIndicators = ['male', 'man', 'yunyang', 'yunze', 'yunjian', 'kangkang'];
  
  if (femaleIndicators.some(f => lowerName.includes(f))) return 'female';
  if (maleIndicators.some(m => lowerName.includes(m))) return 'male';
  
  return 'unknown';
}

// Get the native SpeechSynthesisVoice by URI
function getNativeVoice(voiceId: string): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices();
  return voices.find(v => v.voiceURI === voiceId) || null;
}

// Pre-recorded audio for polyphonic characters whose browser TTS reading is
// completely wrong (e.g. 了→"liǎo" instead of "le").  Generated via macOS
// `say -v Tingting` with a context phrase, then trimmed to the target syllable
// with ffmpeg.  See scripts/generate_polyphonic_audio.sh for regeneration.
const STATIC_AUDIO: Record<string, string> = {
  '了': '/audio/tts/le.mp3',
  '的': '/audio/tts/de.mp3',
  '地': '/audio/tts/de_adverb.mp3',
  '得': '/audio/tts/de_complement.mp3',
  '着': '/audio/tts/zhe.mp3',
};

// Play a pre-recorded static audio file with user's rate/volume settings
async function playStaticAudio(path: string, options: TTSOptions): Promise<void> {
  const audio = new Audio(path);
  audio.playbackRate = options.rate ?? 0.9;
  audio.volume = options.volume ?? 1.0;
  return new Promise<void>((resolve, reject) => {
    audio.onended = () => resolve();
    audio.onerror = () => reject(new Error(`Static audio failed: ${path}`));
    audio.play().catch(reject);
  });
}

// Generous timeout so we catch browsers that silently swallow speech requests
const SPEAK_TIMEOUT_MS = 10_000;

// Internal: perform one TTS attempt with a safety timeout
async function speakOnce(
  text: string,
  options: TTSOptions,
  chineseVoices: TTSVoice[],
): Promise<void> {
  // Use pre-recorded clip for polyphonic characters
  const staticPath = STATIC_AUDIO[text];
  if (staticPath) {
    await playStaticAudio(staticPath, options);
    return;
  }

  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);

  let selectedVoice: SpeechSynthesisVoice | null = null;

  if (options.voiceId) {
    selectedVoice = getNativeVoice(options.voiceId);
  }

  if (!selectedVoice && chineseVoices.length > 0) {
    selectedVoice = getNativeVoice(chineseVoices[0].id);
  }

  if (selectedVoice) {
    utterance.voice = selectedVoice;
  }

  utterance.rate = options.rate ?? 0.9;
  utterance.pitch = options.pitch ?? 1.0;
  utterance.volume = options.volume ?? 1.0;
  utterance.lang = 'zh-CN';

  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        window.speechSynthesis.cancel();
        reject(new Error('TTS timed out — browser may not support this voice'));
      }
    }, SPEAK_TIMEOUT_MS);

    utterance.onend = () => {
      if (!settled) { settled = true; clearTimeout(timer); resolve(); }
    };
    utterance.onerror = (event) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        if (event.error === 'canceled') { resolve(); }
        else { reject(new Error(`TTS error: ${event.error}`)); }
      }
    };

    window.speechSynthesis.speak(utterance);
  });
}

// Speak text with Chinese TTS.
// If the user-configured voice isn't available on this browser, proactively
// resets to auto-select.  On any playback failure, resets and retries once
// with the auto-selected voice so the user still hears something.
export async function speak(
  text: string,
  options: TTSOptions = {}
): Promise<void> {
  if (!isTTSSupported()) {
    console.warn('TTS not supported in this browser');
    return;
  }

  const chineseVoices = await getChineseVoices();

  // Proactive check: if the stored voice doesn't exist in this browser, reset
  // immediately so we don't even attempt a doomed playback.
  let effectiveOptions = options;
  if (options.voiceId && !getNativeVoice(options.voiceId)) {
    console.warn('[TTS] Configured voice', options.voiceId, 'not found in this browser — resetting to auto');
    resetVoiceForCurrentBrowser();
    effectiveOptions = { ...options, voiceId: undefined };
  }

  try {
    await speakOnce(text, effectiveOptions, chineseVoices);
  } catch (firstError) {
    if (!effectiveOptions.voiceId) {
      throw firstError;
    }

    console.warn('[TTS] Playback failed with voice', effectiveOptions.voiceId, '— resetting to auto and retrying');
    resetVoiceForCurrentBrowser();

    await speakOnce(text, { ...effectiveOptions, voiceId: undefined }, chineseVoices);
  }
}

// Stop any ongoing speech
export function stopSpeaking(): void {
  if (isTTSSupported()) {
    window.speechSynthesis.cancel();
  }
}

// Check if currently speaking
export function isSpeaking(): boolean {
  if (!isTTSSupported()) return false;
  return window.speechSynthesis.speaking;
}

// Get the best default voice (prefer zh-CN, female, local)
export async function getDefaultVoice(): Promise<TTSVoice | null> {
  const voices = await getChineseVoices();
  if (voices.length === 0) return null;

  // Priority: zh-CN > zh-TW > other
  // Then: local > online
  // Then: female > unknown > male (arbitrary preference for language learning)
  
  const sorted = [...voices].sort((a, b) => {
    // Language priority
    const langOrder = (lang: string) => {
      if (lang === 'zh-CN') return 0;
      if (lang === 'zh-TW') return 1;
      return 2;
    };
    const langDiff = langOrder(a.lang) - langOrder(b.lang);
    if (langDiff !== 0) return langDiff;

    // Local service priority
    if (a.localService && !b.localService) return -1;
    if (!a.localService && b.localService) return 1;

    return 0;
  });

  return sorted[0];
}

// Reset voice preference for current browser to auto-select (empty string).
// Called automatically when TTS fails, so the next attempt uses the browser's best voice.
export function resetVoiceForCurrentBrowser(): void {
  try {
    const stored = localStorage.getItem('langseed_settings');
    if (!stored) return;
    
    const settings = JSON.parse(stored);
    const browser = detectBrowser();
    
    if (settings.audio?.voicesByBrowser?.[browser]) {
      const oldVoice = settings.audio.voicesByBrowser[browser];
      settings.audio.voicesByBrowser[browser] = '';
      localStorage.setItem('langseed_settings', JSON.stringify(settings));
      console.warn(`[TTS] Voice "${oldVoice}" failed on ${browser} — reset to auto-select. Reload to pick up the change in UI.`);
    }
  } catch (e) {
    console.error('[TTS] Failed to reset voice setting:', e);
  }
}

// Export a hook-friendly version for React components
export function createTTSPlayer() {
  let currentOptions: TTSOptions = {};

  return {
    setOptions(options: TTSOptions) {
      currentOptions = { ...currentOptions, ...options };
    },
    
    async play(text: string, overrides?: TTSOptions) {
      await speak(text, { ...currentOptions, ...overrides });
    },
    
    stop() {
      stopSpeaking();
    },
    
    get isSpeaking() {
      return isSpeaking();
    }
  };
}
