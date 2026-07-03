// Scheduled Edge Function. Invoked every ~5 minutes by pg_cron (see
// supabase/migrations/0002_scheduler.sql). Evaluates the check-in window for today and
// sends any due notifications via the configured provider. Idempotent by construction:
// per-day flags in daily_status gate every send, so frequent polling is safe.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { providerFromEnv } from '../_shared/notifications.ts';
import {
  runCheckWindow,
  type CheckWindowRepo,
  type DailyStatusRow,
  type NotificationLogInput,
  type SettingsRow,
} from '../_shared/scheduler.ts';

const env = (k: string) => Deno.env.get(k);

function makeRepo(
  supabase: ReturnType<typeof createClient>
): CheckWindowRepo {
  const emptyDaily: DailyStatusRow = {
    reminder_sent_at: null,
    missed_alert_sent_at: null,
    late_checkin_notified_at: null,
  };

  return {
    async getSettings() {
      const { data, error } = await supabase
        .from('settings')
        .select('timezone, window_start, window_end')
        .single();
      if (error) throw error;
      return data as unknown as SettingsRow;
    },
    async getNonna() {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, display_name')
        .eq('role', 'nonna')
        .single();
      if (error) throw error;
      return data as unknown as { id: string; display_name: string };
    },
    async getCheckinForDate(profileId, date) {
      const { data, error } = await supabase
        .from('checkins')
        .select('checked_in_at')
        .eq('profile_id', profileId)
        .eq('checkin_date', date)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as { checked_in_at: string } | null) ?? null;
    },
    async getDailyStatus(date) {
      const { data, error } = await supabase
        .from('daily_status')
        .select('reminder_sent_at, missed_alert_sent_at, late_checkin_notified_at')
        .eq('checkin_date', date)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as DailyStatusRow) ?? emptyDaily;
    },
    async setReminderSent(date, atIso) {
      const { error } = await supabase
        .from('daily_status')
        .upsert({ checkin_date: date, reminder_sent_at: atIso }, { onConflict: 'checkin_date' });
      if (error) throw error;
    },
    async setMissedAlertSent(date, atIso) {
      const { error } = await supabase
        .from('daily_status')
        .upsert({ checkin_date: date, missed_alert_sent_at: atIso }, { onConflict: 'checkin_date' });
      if (error) throw error;
    },
    async setLateNotified(date, atIso) {
      const { error } = await supabase
        .from('daily_status')
        .upsert(
          { checkin_date: date, late_checkin_notified_at: atIso },
          { onConflict: 'checkin_date' }
        );
      if (error) throw error;
    },
    async logNotification(row: NotificationLogInput) {
      const { error } = await supabase.from('notifications_log').insert(row);
      if (error) throw error;
    },
    formatTime(iso, tz) {
      return new Intl.DateTimeFormat('en-AU', {
        timeZone: tz,
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      }).format(new Date(iso));
    },
  };
}

Deno.serve(async (req) => {
  // Simple shared-secret guard so the endpoint can't be triggered by strangers.
  const secret = env('CRON_SECRET');
  if (secret && req.headers.get('x-cron-secret') !== secret) {
    return new Response('Unauthorized', { status: 401 });
  }

  const supabaseUrl = env('SUPABASE_URL');
  const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) {
    return new Response('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY', {
      status: 500,
    });
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  try {
    const repo = makeRepo(supabase);
    const provider = providerFromEnv({
      NOTIFY_PROVIDER: env('NOTIFY_PROVIDER'),
      TELEGRAM_BOT_TOKEN: env('TELEGRAM_BOT_TOKEN'),
    });

    // Recipient chat IDs come from env — never hardcoded. Grandma=Nonna, Mum=Iliana.
    const recipients = {
      nonna: env('TELEGRAM_GRANDMA_CHAT_ID') ?? null,
      iliana: env('TELEGRAM_MUM_CHAT_ID') ?? null,
    };

    // Allow the caller to pass an explicit `now` (for manual testing); default to real time.
    let now = new Date();
    if (req.method === 'POST') {
      const body = await req.json().catch(() => ({}));
      if (body?.now) now = new Date(body.now);
    }

    const summary = await runCheckWindow(repo, provider, recipients, now);
    return new Response(JSON.stringify(summary), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
