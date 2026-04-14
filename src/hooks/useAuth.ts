// Authentication hook for Supabase
import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import type { User, Session } from '@supabase/supabase-js';

const DEV_USER_EMAIL = import.meta.env.VITE_DEV_USER_EMAIL || '';
const DEV_USER_PASSWORD = import.meta.env.VITE_DEV_USER_PASSWORD || '';

interface AuthState {
  user: User | null;
  session: Session | null;
  loading: boolean;
  error: string | null;
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    user: null,
    session: null,
    loading: true,
    error: null,
  });
  
  const autoLoginAttempted = useRef(false);

  const autoLoginDev = useCallback(async () => {
    if (autoLoginAttempted.current) return;
    autoLoginAttempted.current = true;
    
    if (import.meta.env.MODE !== 'development' || !DEV_USER_EMAIL || !DEV_USER_PASSWORD) {
      return;
    }
    
    const { data, error } = await supabase.auth.signInWithPassword({
      email: DEV_USER_EMAIL,
      password: DEV_USER_PASSWORD,
    });
    
    if (error) {
      console.warn('[Auth] Auto-login failed:', error.message);
    } else {
      setState(prev => ({
        ...prev,
        user: data.user,
        session: data.session,
        loading: false,
      }));
    }
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setState(prev => ({ ...prev, loading: false }));
      return;
    }

    supabase.auth.getSession().then(async ({ data: { session }, error }) => {
      if (error) {
        setState(prev => ({ ...prev, error: error.message, loading: false }));
      } else if (session) {
        setState({
          user: session.user,
          session,
          loading: false,
          error: null,
        });
      } else {
        setState(prev => ({ ...prev, loading: false }));
        await autoLoginDev();
      }
    });

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
    }));
    
    return { success: true, error: null };
  }, []);

  const signOut = useCallback(async () => {
    if (!isSupabaseConfigured()) {
      setState({ user: null, session: null, loading: false, error: null });
      return { success: true, error: null };
    }
    
    setState(prev => ({ ...prev, loading: true }));

    try {
      const { error } = await supabase.auth.signOut();
      
      if (error) {
        setState(prev => ({ ...prev, error: error.message, loading: false }));
        return { success: false, error: error.message };
      }

      setState({ user: null, session: null, loading: false, error: null });
      return { success: true, error: null };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to sign out';
      setState(prev => ({ ...prev, error: errorMsg, loading: false }));
      return { success: false, error: errorMsg };
    }
  }, []);

  const clearError = useCallback(() => {
    setState(prev => ({ ...prev, error: null }));
  }, []);

  return {
    ...state,
    signIn,
    signOut,
    clearError,
    isAuthenticated: !!state.user,
    isConfigured: isSupabaseConfigured(),
  };
}
