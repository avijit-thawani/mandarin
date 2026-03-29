import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import webpush from 'npm:web-push@3.6.7';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface PushRow {
  id: number;
  user_id: string;
  endpoint: string;
  p256dh_key: string;
  auth_key: string;
  reminder_hour_local: number | null;
  reminder_minute_local: number | null;
  reminder_timezone: string | null;
  last_sent_at: string | null;
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}

function getLocalParts(date: Date, timeZone: string): {
  hour: number;
  minute: number;
  localDate: string;
} {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const hour = Number(get('hour'));
  const minute = Number(get('minute'));
  const localDate = `${get('year')}-${get('month')}-${get('day')}`;
  return { hour, minute, localDate };
}

function shouldSendNow(
  row: PushRow,
  now: Date,
  checkWindowMinutes: number
): { send: boolean; timezone: string } {
  const timezone = row.reminder_timezone || 'UTC';
  const targetHour = Number.isFinite(row.reminder_hour_local ?? NaN) ? (row.reminder_hour_local as number) : 16;
  const targetMinute = Number.isFinite(row.reminder_minute_local ?? NaN) ? (row.reminder_minute_local as number) : 0;
  let nowLocal: ReturnType<typeof getLocalParts>;
  let effectiveTimezone = timezone;
  try {
    nowLocal = getLocalParts(now, timezone);
  } catch {
    effectiveTimezone = 'UTC';
    nowLocal = getLocalParts(now, effectiveTimezone);
  }
  const nowMinutes = nowLocal.hour * 60 + nowLocal.minute;
  const targetMinutes = targetHour * 60 + targetMinute;

  if (nowMinutes < targetMinutes || nowMinutes > targetMinutes + checkWindowMinutes) {
    return { send: false, timezone: effectiveTimezone };
  }

  if (!row.last_sent_at) {
    return { send: true, timezone: effectiveTimezone };
  }

  const lastSentLocal = getLocalParts(new Date(row.last_sent_at), effectiveTimezone);
  if (lastSentLocal.localDate === nowLocal.localDate) {
    const lastSentMinutes = lastSentLocal.hour * 60 + lastSentLocal.minute;
    if (lastSentMinutes >= targetMinutes) {
      return { send: false, timezone: effectiveTimezone };
    }
  }

  return { send: true, timezone: effectiveTimezone };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return json(405, { error: 'Method not allowed' });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY');
  const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY');
  const vapidSubject = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:notifications@example.com';
  const cronSecret = Deno.env.get('CRON_SECRET') ?? '';
  const defaultCheckWindow = Number(Deno.env.get('REMINDER_CHECK_WINDOW_MINUTES') ?? 60);

  if (
    !supabaseUrl ||
    !supabaseAnonKey ||
    !supabaseServiceRoleKey ||
    !vapidPublicKey ||
    !vapidPrivateKey
  ) {
    return json(500, { error: 'Missing required environment variables.' });
  }

  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

  const admin = createClient(supabaseUrl, supabaseServiceRoleKey);

  let payload: { force?: boolean; userId?: string; title?: string; body?: string; url?: string; checkWindowMinutes?: number } = {};
  try {
    payload = await req.json();
  } catch {
    payload = {};
  }

  const force = Boolean(payload.force);
  const suppliedUserId = payload.userId;
  const checkWindowMinutes = Number.isFinite(payload.checkWindowMinutes) ? payload.checkWindowMinutes! : defaultCheckWindow;

  const authHeader = req.headers.get('Authorization') ?? '';
  const cronHeader = req.headers.get('x-cron-secret') ?? '';
  const isCronCall = cronSecret.length > 0 && cronHeader === cronSecret;

  const isServiceRoleCall = authHeader === `Bearer ${supabaseServiceRoleKey}`;

  let authenticatedUserId: string | null = null;
  if (authHeader && !isServiceRoleCall) {
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
    });
    const {
      data: { user },
    } = await userClient.auth.getUser();
    authenticatedUserId = user?.id ?? null;
  }

  const isAdminCall = isCronCall || isServiceRoleCall;

  if (!isAdminCall && !authenticatedUserId) {
    return json(401, { error: 'Unauthorized. Provide a valid JWT, cron secret, or service role key.' });
  }

  if (force && !isAdminCall && !authenticatedUserId) {
    return json(403, { error: 'Force send requires admin or user auth.' });
  }

  const targetUserId = authenticatedUserId ?? suppliedUserId ?? null;

  let query = admin
    .from('push_subscriptions')
    .select('id, user_id, endpoint, p256dh_key, auth_key, reminder_hour_local, reminder_minute_local, reminder_timezone, last_sent_at')
    .eq('is_active', true);

  if (targetUserId) {
    query = query.eq('user_id', targetUserId);
  }

  const { data: subscriptions, error: fetchError } = await query;
  if (fetchError) {
    return json(500, { error: fetchError.message });
  }

  const rows = (subscriptions as PushRow[]) ?? [];
  if (rows.length === 0) {
    return json(200, { sent: 0, skipped: false, reason: 'No active subscriptions found.' });
  }

  const title = payload.title ?? 'Mandarin reminder';
  const body = payload.body ?? 'Time for a quick review session.';
  const url = payload.url ?? '/study';
  const notificationPayload = JSON.stringify({ title, body, url });

  const now = new Date();
  let sent = 0;
  let skippedBySchedule = 0;
  const deactivateIds: number[] = [];
  const sentIds: number[] = [];
  const pushResults: unknown[] = [];

  for (const row of rows) {
    if (!force) {
      const scheduleDecision = shouldSendNow(row, now, Math.max(0, checkWindowMinutes));
      if (!scheduleDecision.send) {
        skippedBySchedule += 1;
        continue;
      }
    }

    const subscription = {
      endpoint: row.endpoint,
      keys: {
        p256dh: row.p256dh_key,
        auth: row.auth_key,
      },
    };

    try {
      const result = await webpush.sendNotification(subscription, notificationPayload, {
        TTL: 14400,
        urgency: 'high',
      });
      sent += 1;
      sentIds.push(row.id);
      pushResults.push({ id: row.id, status: result.statusCode, body: result.body });
    } catch (error) {
      const statusCode =
        typeof error === 'object' && error !== null && 'statusCode' in error
          ? Number((error as { statusCode?: number }).statusCode)
          : 0;
      const errBody = typeof error === 'object' && error !== null && 'body' in error
        ? String((error as { body?: string }).body)
        : String(error);
      pushResults.push({ id: row.id, status: statusCode, error: errBody });
      if (statusCode === 404 || statusCode === 410) {
        deactivateIds.push(row.id);
      }
    }
  }

  if (deactivateIds.length > 0) {
    await admin
      .from('push_subscriptions')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .in('id', deactivateIds);
  }

  if (sentIds.length > 0) {
    const tsField = force ? 'last_tested_at' : 'last_sent_at';
    await admin
      .from('push_subscriptions')
      .update({ [tsField]: now.toISOString(), updated_at: now.toISOString() })
      .in('id', sentIds);
  }

  return json(200, {
    sent,
    attempted: rows.length,
    skippedBySchedule,
    deactivated: deactivateIds.length,
    force,
    pushResults,
  });
});
