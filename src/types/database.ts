// Supabase database types - matches normalized schema

export interface Database {
  public: {
    Tables: {
      // Static vocabulary reference data (shared across all users)
      vocabulary: {
        Row: {
          id: string;
          word: string;
          pinyin: string;
          part_of_speech: string;
          meaning: string;
          chapter: number;
          source: string;
          category: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          word: string;
          pinyin: string;
          part_of_speech: string;
          meaning: string;
          chapter: number;
          source?: string;
          category?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          word?: string;
          pinyin?: string;
          part_of_speech?: string;
          meaning?: string;
          chapter?: number;
          source?: string;
          category?: string;
          created_at?: string;
        };
      };
      
      // User-specific learning progress
      user_progress: {
        Row: {
          id: string;
          user_id: string;
          vocabulary_id: string;
          knowledge: number;
          modality: Record<string, unknown>;
          paused: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          vocabulary_id: string;
          knowledge?: number;
          modality?: Record<string, unknown>;
          paused?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          vocabulary_id?: string;
          knowledge?: number;
          modality?: Record<string, unknown>;
          paused?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      
      // User settings/preferences
      user_settings: {
        Row: {
          user_id: string;
          settings: Record<string, unknown>;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          settings?: Record<string, unknown>;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          settings?: Record<string, unknown>;
          created_at?: string;
          updated_at?: string;
        };
      };
      
      // Quiz attempt records for analytics
      quiz_attempts: {
        Row: {
          id: string;
          user_id: string;
          vocabulary_id: string;
          task_type: string;
          question_modality: string;
          answer_modality: string;
          correct: boolean;
          response_time_ms: number | null;
          knowledge_before: number;
          knowledge_after: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          vocabulary_id: string;
          task_type: string;
          question_modality: string;
          answer_modality: string;
          correct: boolean;
          response_time_ms?: number | null;
          knowledge_before: number;
          knowledge_after: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          vocabulary_id?: string;
          task_type?: string;
          question_modality?: string;
          answer_modality?: string;
          correct?: boolean;
          response_time_ms?: number | null;
          knowledge_before?: number;
          knowledge_after?: number;
          created_at?: string;
        };
      };

      // Web push subscriptions per user/device
      push_subscriptions: {
        Row: {
          id: number;
          user_id: string;
          endpoint: string;
          p256dh_key: string;
          auth_key: string;
          user_agent: string | null;
          is_active: boolean;
          reminder_hour_local: number;
          reminder_minute_local: number;
          reminder_timezone: string;
          last_tested_at: string | null;
          last_sent_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: number;
          user_id: string;
          endpoint: string;
          p256dh_key: string;
          auth_key: string;
          user_agent?: string | null;
          is_active?: boolean;
          reminder_hour_local?: number;
          reminder_minute_local?: number;
          reminder_timezone?: string;
          last_tested_at?: string | null;
          last_sent_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: number;
          user_id?: string;
          endpoint?: string;
          p256dh_key?: string;
          auth_key?: string;
          user_agent?: string | null;
          is_active?: boolean;
          reminder_hour_local?: number;
          reminder_minute_local?: number;
          reminder_timezone?: string;
          last_tested_at?: string | null;
          last_sent_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
    };
  };
}

// Helper types for easier access
export type VocabularyRow = Database['public']['Tables']['vocabulary']['Row'];
export type VocabularyInsert = Database['public']['Tables']['vocabulary']['Insert'];
export type UserProgressRow = Database['public']['Tables']['user_progress']['Row'];
export type UserProgressInsert = Database['public']['Tables']['user_progress']['Insert'];
export type UserSettingsRow = Database['public']['Tables']['user_settings']['Row'];
export type QuizAttemptRow = Database['public']['Tables']['quiz_attempts']['Row'];
export type QuizAttemptInsert = Database['public']['Tables']['quiz_attempts']['Insert'];
export type PushSubscriptionRow = Database['public']['Tables']['push_subscriptions']['Row'];
