import { useEffect, useState, useRef } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Navbar } from './components/Navbar';
import { HelpModal } from './components/HelpModal';
import { VocabularyPage } from './pages/VocabularyPage';
import { StudyPage } from './pages/StudyPage';
import { QuizPage, hasCompletedQuizToday } from './pages/QuizPage';
import { PinyinPage } from './pages/PinyinPage';
import { ProfilePage } from './pages/ProfilePage';
import { ChatPage } from './pages/ChatPage';
import { LoginPage } from './pages/LoginPage';
import { useVocabularyStore } from './stores/vocabularyStore';
import { useSettingsStore } from './stores/settingsStore';
import { useTodayFilterStore } from './stores/todayFilterStore';
import { useAuth } from './hooks/useAuth';
import { useStreak } from './hooks/useStreak';
import { clearNotifications } from './lib/pwaReminderService';
import { Loader2 } from 'lucide-react';

// Debounce delay for auto-sync (ms)
const AUTO_SYNC_DELAY = 3000;

const ONBOARDING_KEY = 'langseed_onboarding_seen';

const DISPLAY_NAMES: Record<string, string> = {
  'f547d7a2-1440-4c7a-ab74-130787ba9878': 'Niyati',
  'c9a42bea-bdff-4ab6-9ba4-f44596537258': 'Avi',
};

function getDisplayName(userId?: string, email?: string | null): string | undefined {
  if (userId && DISPLAY_NAMES[userId]) return DISPLAY_NAMES[userId];
  if (!email) return undefined;
  return email.split('@')[0];
}

function App() {
  const store = useVocabularyStore();
  const settingsStore = useSettingsStore();
  const todayFilter = useTodayFilterStore();
  const auth = useAuth();
  const syncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasLoadedFromCloud = useRef(false);
  
  // Load data from cloud on login
  useEffect(() => {
    if (auth.isAuthenticated && auth.user && !hasLoadedFromCloud.current) {
      hasLoadedFromCloud.current = true;
      store.loadFromCloud(auth.user.id);
      settingsStore.loadFromCloud(auth.user.id);
    }
  }, [auth.isAuthenticated, auth.user?.id]);
  
  // Auto-sync to cloud when there are pending changes (debounced)
  useEffect(() => {
    if (!auth.user || !store.hasPendingSync) {
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
  }, [auth.user, store.hasPendingSync]);
  
  // Sync immediately when page becomes hidden (user navigates away or closes tab)
  useEffect(() => {
    if (!auth.user) return;
    
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
  }, [auth.user, store.hasPendingSync]);

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
        loading={auth.loading}
        error={auth.error}
        onClearError={auth.clearError}
      />
    );
  }

  const handleSync = () => {
    if (auth.user) {
      store.syncToCloud(auth.user.id);
    }
  };

  const handleSettingsSave = async () => {
    if (auth.user) {
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
}: { 
  store: ReturnType<typeof useVocabularyStore>;
  settingsStore: ReturnType<typeof useSettingsStore>;
  todayFilter: ReturnType<typeof useTodayFilterStore>;
  auth: ReturnType<typeof useAuth>;
  onSync: () => void;
  onSettingsSave: () => Promise<void>;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  
  // Help modal state
  const [showHelpModal, setShowHelpModal] = useState(false);
  
  // Quiz completion state - re-check when route changes
  const [quizCompletedToday, setQuizCompletedToday] = useState(hasCompletedQuizToday());
  
  // Streak data (purely computed from quiz_attempts + cardsPerSession)
  const streakHook = useStreak(auth.user?.id, settingsStore.settings.cardsPerSession);
  
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
                onRefresh={auth.user ? () => store.loadFromCloud(auth.user!.id) : undefined}
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
                onStreakRefresh={streakHook.refresh}
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
          
          {/* Legacy: syntax is now integrated into quiz */}
          <Route path="/syntax" element={<Navigate to="/quiz" replace />} />
          
          <Route 
            path="/chat" 
            element={
              <ChatPage 
                store={store}
                userName={getDisplayName(auth.user?.id, auth.user?.email)}
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
                userEmail={auth.user?.email}
                userId={auth.user?.id ?? null}
                onShowHelp={() => setShowHelpModal(true)}
                onRefreshProgress={auth.user ? () => store.loadFromCloud(auth.user!.id) : undefined}
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
      
    </div>
  );
}

export default App;
