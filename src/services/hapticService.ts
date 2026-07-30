// Haptic feedback via the Vibration API.
//
// Only Android Chrome/Firefox actually vibrate — iOS Safari has no Vibration API,
// so every call is a silent no-op there and callers must never depend on it firing.
// Respects the `reduce-motion` class that settingsStore puts on <html> for the
// reducedMotion accessibility setting.

type HapticPattern = 'tap' | 'select' | 'correct' | 'wrong' | 'complete';

// Durations in ms; arrays are vibrate/pause/vibrate sequences.
const PATTERNS: Record<HapticPattern, number | number[]> = {
  tap: 8,
  select: 14,
  correct: [12, 40, 24],
  wrong: [50, 60, 50],
  complete: [16, 50, 16, 50, 40],
};

function isEnabled(): boolean {
  if (typeof window === 'undefined' || !('vibrate' in navigator)) return false;
  return !document.documentElement.classList.contains('reduce-motion');
}

export function haptic(pattern: HapticPattern): void {
  if (!isEnabled()) return;
  try {
    navigator.vibrate(PATTERNS[pattern]);
  } catch {
    // Vibration can throw if the document isn't user-activated yet; feedback is
    // never load-bearing, so swallow it.
  }
}
