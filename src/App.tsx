import { useEffect, useState, useRef } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Navbar } from './components/Navbar';
import { HelpModal } from './components/HelpModal';
import { VocabularyPage } from './pages/VocabularyPage';
import { StudyPage } from './pages/StudyPage';
import { QuizPage, hasCompletedQuizToday } from './pages/QuizPage';
import { SyntaxPage } from './pages/SyntaxPage';
import { PinyinPage } from './pages/PinyinPage';
import { ProfilePage } from './pages/ProfilePage';
import { LoginPage } from './pages/LoginPage';
import { useVocabularyStore } from './stores/vocabularyStore';
import { useSettingsStore } from './stores/settingsStore';
import { useTodayFilterStore } from './stores/todayFilterStore';
import { useAuth } from './hooks/useAuth';
import { useStreak } from './hooks/useStreak';
import { clearNotifications } from './lib/pwaReminderService';
import { Loader2, Zap } from 'lucide-react';

// Dev mode detection
const IS_DEV = import.meta.env.MODE === 'development';
const IS_LOCALHOST = typeof window !== 'undefined' && 
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
const DEV_USER_EMAIL = import.meta.env.VITE_DEV_USER_EMAIL || '';
const DEV_USER_PASSWORD = import.meta.env.VITE_DEV_USER_PASSWORD || '';

// Debounce delay for auto-sync (ms)
const AUTO_SYNC_DELAY = 3000;

const ONBOARDING_KEY = 'langseed_onboarding_seen';

function App() {
  const store = useVocabularyStore();
  const settingsStore = useSettingsStore();
  const todayFilter = useTodayFilterStore();
  const auth = useAuth();
  const syncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasLoadedFromCloud = useRef(false);
  
  // Load data from cloud on login (skip for guest mode)
  useEffect(() => {
    if (auth.isAuthenticated && auth.user && !auth.isGuest && !hasLoadedFromCloud.current) {
      hasLoadedFromCloud.current = true;
      // Load from cloud - this will overwrite localStorage with cloud data
      // This ensures we always start with the latest cloud state
      store.loadFromCloud(auth.user.id);
      settingsStore.loadFromCloud(auth.user.id);
    }
    // For guest mode, initialize with chapter 1 if no data exists
    // Pass true to startStudying so chapter 1 words are marked as studying (not paused)
    if (auth.isGuest && store.concepts.length === 0) {
      store.importChapters(1, 1, true);
    }
  }, [auth.isAuthenticated, auth.user?.id, auth.isGuest]);
  
  // Auto-sync to cloud when there are pending changes (debounced)
  useEffect(() => {
    // Only auto-sync for authenticated (non-guest) users with pending changes
    if (!auth.user || auth.isGuest || !store.hasPendingSync) {
      return;
    }
    
    // Clear any existing timeout
    if (syncTimeoutRef.current) {
      clearTimeout(syncTimeoutRef.current);
    }
    
    // Set a new timeout to sync after delay
    syncTimeoutRef.current = setTimeout(() => {
      console.log('[App] Auto-syncing progress to cloud...');
      store.syncToCloud(auth.user!.id).then(result => {
        if (result.success) {
          console.log('[App] Auto-sync successful');
        } else {
          console.warn('[App] Auto-sync failed:', result.error);
        }
      });
    }, AUTO_SYNC_DELAY);
    
    // Cleanup timeout on unmount
    return () => {
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
      }
    };
  }, [auth.user, auth.isGuest, store.hasPendingSync]);
  
  // Sync immediately when page becomes hidden (user navigates away or closes tab)
  useEffect(() => {
    if (!auth.user || auth.isGuest) return;
    
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden' && store.hasPendingSync) {
        // Use sendBeacon for reliable sync when page is closing
        // Fall back to regular sync if sendBeacon not available
        console.log('[App] Page hidden, syncing progress...');
        store.syncToCloud(auth.user!.id);
      }
    };
    
    const handleBeforeUnload = () => {
      if (store.hasPendingSync) {
        console.log('[App] Page unloading, syncing progress...');
        store.syncToCloud(auth.user!.id);
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('beforeunload', handleBeforeUnload);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [auth.user, auth.isGuest, store.hasPendingSync]);

  // Show loading state while checking auth
  if (auth.loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-base-100">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto mb-4" />
          <p className="text-base-content/60">Loading...</p>
        </div>
      </div>
    );
  }

  // Show login page if not authenticated
  if (auth.isConfigured && !auth.isAuthenticated) {
    return (
      <LoginPage
        onLogin={auth.signIn}
        onGuestLogin={auth.signInAsGuest}
        loading={auth.loading}
        error={auth.error}
        onClearError={auth.clearError}
      />
    );
  }

  const handleSync = () => {
    // Don't sync for guest users
    if (auth.user && !auth.isGuest) {
      store.syncToCloud(auth.user.id);
    }
  };

  const handleSettingsSave = async () => {
    // Don't sync for guest users
    if (auth.user && !auth.isGuest) {
      await settingsStore.syncToCloud(auth.user.id);
    }
  };
  
  return (
    <BrowserRouter>
      <AppContent 
        store={store}
        settingsStore={settingsStore}
        todayFilter={todayFilter}
        auth={auth} 
        onSync={handleSync}
        onSettingsSave={handleSettingsSave}
        isGuest={auth.isGuest}
      />
    </BrowserRouter>
  );
}

// Inner component to access useLocation inside BrowserRouter
function AppContent({ 
  store,
  settingsStore,
  todayFilter,
  auth, 
  onSync,
  onSettingsSave,
  isGuest,
}: { 
  store: ReturnType<typeof useVocabularyStore>;
  settingsStore: ReturnType<typeof useSettingsStore>;
  todayFilter: ReturnType<typeof useTodayFilterStore>;
  auth: ReturnType<typeof useAuth>;
  onSync: () => void;
  onSettingsSave: () => Promise<void>;
  isGuest: boolean;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  
  // Help modal state
  const [showHelpModal, setShowHelpModal] = useState(false);
  
  // Quiz completion state - re-check when route changes
  const [quizCompletedToday, setQuizCompletedToday] = useState(hasCompletedQuizToday());
  
  // Streak data (purely computed from quiz_attempts + cardsPerSession)
  const streakHook = useStreak(auth.user?.id, isGuest, settingsStore.settings.cardsPerSession);
  
  useEffect(() => {
    // Re-check quiz completion when navigating away from quiz
    const completed = hasCompletedQuizToday();
    setQuizCompletedToday(completed);
    // Refresh streak data when navigating (catches quiz completions)
    if (location.pathname !== '/quiz') {
      streakHook.refresh();
    }
    // Withdraw reminder notifications once the user has studied today
    if (completed) {
      clearNotifications();
    }
  }, [location.pathname]);
  
  // Auto-show help modal for new users
  useEffect(() => {
    const hasSeenOnboarding = localStorage.getItem(ONBOARDING_KEY);
    if (!hasSeenOnboarding) {
      const timer = setTimeout(() => setShowHelpModal(true), 500);
      return () => clearTimeout(timer);
    }
  }, []);
  
  const handleCloseHelp = () => {
    setShowHelpModal(false);
    localStorage.setItem(ONBOARDING_KEY, 'true');
  };
  
  return (
    <div className="h-dvh flex flex-col bg-base-100 text-base-content overflow-hidden">
      {/* Help modal */}
      <HelpModal isOpen={showHelpModal} onClose={handleCloseHelp} />
      
      {/* Main content area */}
      <main className="flex-1 overflow-hidden pb-16">
        <Routes>
          {/* Default to Quiz tab */}
          <Route path="/" element={<Navigate to="/quiz" replace />} />
          
          <Route 
            path="/vocab" 
            element={
              <VocabularyPage 
                store={store} 
                settingsStore={settingsStore}
                todayFilter={todayFilter}
                onSync={onSync}
                onShowHelp={() => setShowHelpModal(true)}
                onRefresh={auth.user && !isGuest ? () => store.loadFromCloud(auth.user!.id) : undefined}
                isGuest={isGuest}
              />
            } 
          />
          
          <Route 
            path="/study" 
            element={
              <StudyPage 
                store={store} 
                settingsStore={settingsStore}
                todayFilter={todayFilter}
                onShowHelp={() => setShowHelpModal(true)}
              />
            } 
          />
          
          <Route 
            path="/quiz" 
            element={
              <QuizPage 
                store={store} 
                settingsStore={settingsStore}
                todayFilter={todayFilter}
                onShowHelp={() => setShowHelpModal(true)}
              />
            } 
          />
          
          <Route 
            path="/pinyin" 
            element={
              <PinyinPage 
                store={store} 
                settingsStore={settingsStore} 
              />
            } 
          />
          
          <Route 
            path="/syntax" 
            element={
              <SyntaxPage 
                store={store} 
                settingsStore={settingsStore} 
                onShowHelp={() => setShowHelpModal(true)}
              />
            } 
          />
          
          <Route 
            path="/profile" 
            element={
              <ProfilePage 
                settingsStore={settingsStore}
                vocabStore={store}
                onSave={onSettingsSave}
                onLogout={() => auth.signOut()}
                userEmail={isGuest ? undefined : auth.user?.email}
                userId={auth.user?.id ?? null}
                onShowHelp={() => setShowHelpModal(true)}
                onRefreshProgress={auth.user && !isGuest ? () => store.loadFromCloud(auth.user!.id) : undefined}
                isGuest={isGuest}
                streakData={streakHook}
              />
            } 
          />
          
          {/* Legacy routes - redirect to new names */}
          <Route path="/revise" element={<Navigate to="/study" replace />} />
          <Route path="/settings" element={<Navigate to="/profile" replace />} />
        </Routes>
      </main>
      
      {/* Fixed bottom navigation */}
      <Navbar 
        hasUnsyncedSettings={settingsStore.hasUnsyncedChanges}
        quizCompletedToday={quizCompletedToday}
        streak={streakHook.loading ? undefined : streakHook.streak}
        isStreakBroken={streakHook.isStreakBroken}
        onStreakClick={() => navigate('/profile')}
      />
      
      {/* Dev Mode Toggle (localhost only) */}
      {IS_DEV && IS_LOCALHOST && DEV_USER_EMAIL && DEV_USER_PASSWORD && (
        <DevModeToggle
          isGuest={isGuest}
          onSwitchToGuest={auth.signInAsGuest}
          onSwitchToDevUser={() => auth.signIn(DEV_USER_EMAIL, DEV_USER_PASSWORD)}
        />
      )}
    </div>
  );
}

// Simple dev mode toggle at top center (localhost only)
function DevModeToggle({
  isGuest,
  onSwitchToGuest,
  onSwitchToDevUser,
}: {
  isGuest: boolean;
  onSwitchToGuest: () => void;
  onSwitchToDevUser: () => void;
}) {
  const handleToggle = async () => {
    if (isGuest) {
      await onSwitchToDevUser();
    } else {
      onSwitchToGuest();
    }
    // Force refresh to ensure clean state
    window.location.reload();
  };
  
  return (
    <div className="fixed top-2 left-1/2 -translate-x-1/2 z-50">
      <button
        onClick={handleToggle}
        className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium transition-all ${
          isGuest 
            ? 'bg-secondary/20 text-secondary hover:bg-secondary/30' 
            : 'bg-warning/20 text-warning hover:bg-warning/30'
        }`}
        title={isGuest ? 'Switch to Dev User' : 'Switch to Guest'}
      >
        <Zap className="w-3 h-3" />
        <span>{isGuest ? 'Guest' : 'Dev'}</span>
      </button>
    </div>
  );
}

export default App;
