import { supabase, isSupabaseConfigured } from './supabase';

const SW_PATH = '/sw.js';
const REMINDER_TAG = 'mandarin-reminder';
const DEFAULT_REMINDER_HOUR = 16;
const DEFAULT_REMINDER_MINUTE = 0;

export interface ReminderSettings {
  enabled: boolean;
  timezone: string;
  hour: number;
  minute: number;
}

export function isReminderSupported(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

export async function registerReminderServiceWorker(): Promise<void> {
  if (!isReminderSupported()) return;

  const registration = await navigator.serviceWorker.register(SW_PATH);

  registration.addEventListener('updatefound', () => {
    const newWorker = registration.installing;
    if (!newWorker) return;
    newWorker.addEventListener('statechange', () => {
      if (newWorker.state === 'activated' && navigator.serviceWorker.controller) {
        console.log('[PWA] New version available, reloading...');
        window.location.reload();
      }
    });
  });
}

function toUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const output = new Uint8Array(rawData.length);
  for (let index = 0; index < rawData.length; index += 1) {
    output[index] = rawData.charCodeAt(index);
  }
  return output;
}

function getSubscriptionKeys(subscription: PushSubscription): {
  p256dh: string;
  auth: string;
} {
  const p256dhRaw = subscription.getKey('p256dh');
  const authRaw = subscription.getKey('auth');
  if (!p256dhRaw || !authRaw) {
    throw new Error('Missing push subscription keys.');
  }

  const p256dh = btoa(String.fromCharCode(...new Uint8Array(p256dhRaw)));
  const auth = btoa(String.fromCharCode(...new Uint8Array(authRaw)));
  return { p256dh, auth };
}

function getInferredTimezone(): string {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return tz || 'UTC';
}

function isValidTimezone(value: string): boolean {
  try {
    Intl.DateTimeFormat('en-US', { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

function normalizeHour(value: number | undefined): number {
  if (!Number.isFinite(value)) return DEFAULT_REMINDER_HOUR;
  return Math.max(0, Math.min(23, Math.floor(value as number)));
}

function normalizeMinute(value: number | undefined): number {
  if (!Number.isFinite(value)) return DEFAULT_REMINDER_MINUTE;
  return Math.max(0, Math.min(59, Math.floor(value as number)));
}

async function getCurrentSubscriptionEndpoint(): Promise<string | null> {
  if (!isReminderSupported()) return null;
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  return subscription?.endpoint ?? null;
}

export async function getReminderSettings(userId: string): Promise<ReminderSettings> {
  if (!isSupabaseConfigured()) {
    return {
      enabled: false,
      timezone: getInferredTimezone(),
      hour: DEFAULT_REMINDER_HOUR,
      minute: DEFAULT_REMINDER_MINUTE,
    };
  }

  const endpoint = await getCurrentSubscriptionEndpoint();

  let query = supabase
    .from('push_subscriptions')
    .select('is_active, reminder_timezone, reminder_hour_local, reminder_minute_local')
    .eq('user_id', userId);

  if (endpoint) {
    query = query.eq('endpoint', endpoint);
  } else {
    query = query.eq('is_active', true);
  }

  const { data, error } = await query.limit(1).maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    return {
      enabled: false,
      timezone: getInferredTimezone(),
      hour: DEFAULT_REMINDER_HOUR,
      minute: DEFAULT_REMINDER_MINUTE,
    };
  }

  return {
    enabled: Boolean(data.is_active),
    timezone: data.reminder_timezone || getInferredTimezone(),
    hour: Number.isFinite(data.reminder_hour_local)
      ? data.reminder_hour_local
      : DEFAULT_REMINDER_HOUR,
    minute: Number.isFinite(data.reminder_minute_local)
      ? data.reminder_minute_local
      : DEFAULT_REMINDER_MINUTE,
  };
}

export async function enableReminders(
  userId: string,
  schedule?: { timezone?: string; hour?: number; minute?: number }
): Promise<void> {
  if (!isReminderSupported()) {
    throw new Error('This browser does not support push notifications.');
  }

  const vapidPublicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
  if (!vapidPublicKey) {
    throw new Error('Missing VITE_VAPID_PUBLIC_KEY in environment.');
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('Notification permission not granted.');
  }

  const registration = await navigator.serviceWorker.ready;
  const existingSubscription = await registration.pushManager.getSubscription();

  const subscription =
    existingSubscription ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: toUint8Array(vapidPublicKey) as unknown as BufferSource,
    }));

  const keys = getSubscriptionKeys(subscription);

  if (!isSupabaseConfigured()) {
    throw new Error('Supabase is not configured.');
  }

  const timezone = schedule?.timezone && isValidTimezone(schedule.timezone)
    ? schedule.timezone
    : getInferredTimezone();
  const hour = normalizeHour(schedule?.hour);
  const minute = normalizeMinute(schedule?.minute);

  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      user_id: userId,
      endpoint: subscription.endpoint,
      p256dh_key: keys.p256dh,
      auth_key: keys.auth,
      user_agent: navigator.userAgent,
      is_active: true,
      reminder_timezone: timezone,
      reminder_hour_local: hour,
      reminder_minute_local: minute,
      updated_at: new Date().toISOString(),
      last_tested_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,endpoint' }
  );

  if (error) {
    throw new Error(error.message);
  }
}

export async function disableReminders(userId: string): Promise<void> {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase is not configured.');
  }

  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();

  if (subscription) {
    await subscription.unsubscribe();
    const { error } = await supabase
      .from('push_subscriptions')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('endpoint', subscription.endpoint);

    if (error) {
      throw new Error(error.message);
    }
  }
}

export async function updateReminderSchedule(
  userId: string,
  schedule: { timezone: string; hour: number; minute: number }
): Promise<void> {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase is not configured.');
  }

  if (!isValidTimezone(schedule.timezone)) {
    throw new Error('Invalid timezone.');
  }

  const endpoint = await getCurrentSubscriptionEndpoint();
  if (!endpoint) {
    throw new Error('Enable reminders on this device first.');
  }

  const hour = normalizeHour(schedule.hour);
  const minute = normalizeMinute(schedule.minute);

  const { error } = await supabase
    .from('push_subscriptions')
    .update({
      reminder_timezone: schedule.timezone,
      reminder_hour_local: hour,
      reminder_minute_local: minute,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .eq('endpoint', endpoint);

  if (error) {
    throw new Error(error.message);
  }
}

export function getBrowserTimezone(): string {
  return getInferredTimezone();
}

/**
 * Dismiss any visible reminder notifications from the notification tray.
 * Uses getNotifications() directly from the page context — doesn't require
 * the service worker to be awake (postMessage fails when SW is suspended on mobile).
 */
export async function clearNotifications(): Promise<void> {
  if (!isReminderSupported()) return;
  try {
    const registration = await navigator.serviceWorker.ready;
    const notifications = await registration.getNotifications({ tag: REMINDER_TAG });
    notifications.forEach(n => n.close());
  } catch (err) {
    console.warn('[PWA] Failed to clear notifications:', err);
  }
}

export async function sendTestReminder(userId: string): Promise<void> {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase is not configured.');
  }

  const { error } = await supabase.functions.invoke('send-reminders', {
    body: {
      force: true,
      userId,
    },
  });

  if (error) {
    throw new Error(error.message);
  }
}
