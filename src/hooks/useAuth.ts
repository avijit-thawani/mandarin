// Authentication hook for Supabase
import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import type { User, Session } from '@supabase/supabase-js';

// Dev user credentials (only used in development mode)
// Set these in .env to enable auto-login during development
const DEV_USER_EMAIL = import.meta.env.VITE_DEV_USER_EMAIL || '';
const DEV_USER_PASSWORD = import.meta.env.VITE_DEV_USER_PASSWORD || '';

// Guest mode storage key
const GUEST_MODE_KEY = 'langseed_guest_mode';

interface AuthState {
  user: User | null;
  session: Session | null;
  loading: boolean;
  error: string | null;
  isGuest: boolean;
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    user: null,
    session: null,
    loading: true,
    error: null,
    isGuest: false,
  });
  
  const autoLoginAttempted = useRef(false);
  
  // Check for existing guest session on mount
  useEffect(() => {
    const wasGuest = localStorage.getItem(GUEST_MODE_KEY) === 'true';
    if (wasGuest) {
      setState(prev => ({ ...prev, isGuest: true, loading: false }));
    }
  }, []);

  // Auto-login function for dev mode
  const autoLoginDev = useCallback(async () => {
    if (autoLoginAttempted.current) return;
    autoLoginAttempted.current = true;
    
    // Only auto-login in development mode with both email and password configured
    if (import.meta.env.MODE !== 'development' || !DEV_USER_EMAIL || !DEV_USER_PASSWORD) {
      console.log('[Auth] Auto-login skipped: not in dev mode or credentials not configured');
      return;
    }
    
    console.log('[Auth] Attempting auto-login for dev user...');
    
    const { data, error } = await supabase.auth.signInWithPassword({
      email: DEV_USER_EMAIL,
      password: DEV_USER_PASSWORD,
    });
    
    if (error) {
      console.warn('[Auth] Auto-login failed:', error.message);
      // Don't set error state - just let user login manually
    } else {
      console.log('[Auth] Auto-login successful');
      setState(prev => ({
        ...prev,
        user: data.user,
        session: data.session,
        loading: false,
      }));
    }
  }, []);

  useEffect(() => {
    // If already in guest mode, don't check Supabase
    const wasGuest = localStorage.getItem(GUEST_MODE_KEY) === 'true';
    if (wasGuest) {
      setState(prev => ({ ...prev, isGuest: true, loading: false }));
      return;
    }
    
    if (!isSupabaseConfigured()) {
      setState(prev => ({ ...prev, loading: false }));
      return;
    }

    // Get initial session
    supabase.auth.getSession().then(async ({ data: { session }, error }) => {
      if (error) {
        setState(prev => ({ ...prev, error: error.message, loading: false }));
      } else if (session) {
        // Already have a session
        setState({
          user: session.user,
          session,
          loading: false,
          error: null,
          isGuest: false,
        });
      } else {
        // No session - try auto-login in dev mode
        setState(prev => ({ ...prev, loading: false }));
        await autoLoginDev();
      }
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setState(prev => ({
          ...prev,
          user: session?.user ?? null,
          session,
        }));
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, [autoLoginDev]);

  const signIn = useCallback(async (email: string, password: string) => {
    setState(prev => ({ ...prev, loading: true, error: null }));
    
    // Clear guest mode when signing in
    localStorage.removeItem(GUEST_MODE_KEY);
    
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setState(prev => ({ ...prev, error: error.message, loading: false }));
      return { success: false, error: error.message };
    }

    setState(prev => ({
      ...prev,
      user: data.user,
      session: data.session,
      loading: false,
      isGuest: false,
    }));
    
    return { success: true, error: null };
  }, []);
  
  const signInAsGuest = useCallback(() => {
    localStorage.setItem(GUEST_MODE_KEY, 'true');
    setState(prev => ({
      ...prev,
      user: null,
      session: null,
      loading: false,
      error: null,
      isGuest: true,
    }));
    return { success: true, error: null };
  }, []);

  const signOut = useCallback(async () => {
    // In guest mode or local-only mode (Supabase not configured), clear local auth state.
    if (state.isGuest || !isSupabaseConfigured()) {
      localStorage.removeItem(GUEST_MODE_KEY);
      setState({
        user: null,
        session: null,
        loading: false,
        error: null,
        isGuest: false,
      });
      return { success: true, error: null };
    }
    
    setState(prev => ({ ...prev, loading: true }));

    try {
      const { error } = await supabase.auth.signOut();
      
      if (error) {
        setState(prev => ({ ...prev, error: error.message, loading: false }));
        return { success: false, error: error.message };
      }

      setState({
        user: null,
        session: null,
        loading: false,
        error: null,
        isGuest: false,
      });
      
      return { success: true, error: null };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to sign out';
      setState(prev => ({ ...prev, error: errorMsg, loading: false }));
      return { success: false, error: errorMsg };
    }
  }, [state.isGuest]);

  const clearError = useCallback(() => {
    setState(prev => ({ ...prev, error: null }));
  }, []);

  return {
    ...state,
    signIn,
    signInAsGuest,
    signOut,
    clearError,
    isAuthenticated: !!state.user || state.isGuest,
    isConfigured: isSupabaseConfigured(),
  };
}
