import { useState } from 'react';
import { updateSettings } from '../lib/api';
import type { Settings } from '../lib/types';

const TIMEZONES = [
  'Australia/Sydney',
  'Australia/Brisbane',
  'Australia/Adelaide',
  'Australia/Perth',
  'Pacific/Auckland',
  'Europe/Rome',
  'Europe/London',
  'America/New_York',
  'America/Los_Angeles',
  'UTC',
];

interface Props {
  settings: Settings;
  onSaved: (next: Settings) => void;
}

export default function SettingsForm({ settings, onSaved }: Props) {
  const [form, setForm] = useState({
    timezone: settings.timezone,
    window_start: settings.window_start.slice(0, 5),
    window_end: settings.window_end.slice(0, 5),
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (k: keyof typeof form, v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    setSaved(false);
  };

  const windowBad = form.window_start >= form.window_end;
  const canSave = !windowBad && !saving;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      const next = await updateSettings(settings.id, {
        timezone: form.timezone,
        window_start: form.window_start,
        window_end: form.window_end,
      });
      onSaved(next);
      setSaved(true);
    } catch {
      setError('Could not save settings. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="card settings" onSubmit={handleSubmit}>
      <h2 className="card__title">Settings</h2>

      <div className="settings__row settings__row--split">
        <label className="field">
          <span className="field__label">Window opens</span>
          <input
            type="time"
            className="field__input"
            value={form.window_start}
            onChange={(e) => set('window_start', e.target.value)}
          />
        </label>
        <label className="field">
          <span className="field__label">Window closes</span>
          <input
            type="time"
            className="field__input"
            value={form.window_end}
            onChange={(e) => set('window_end', e.target.value)}
          />
        </label>
      </div>
      {windowBad && (
        <p className="field__error">Closing time must be after opening time.</p>
      )}

      <label className="field">
        <span className="field__label">Timezone</span>
        <select
          className="field__input"
          value={form.timezone}
          onChange={(e) => set('timezone', e.target.value)}
        >
          {TIMEZONES.includes(form.timezone) ? null : (
            <option value={form.timezone}>{form.timezone}</option>
          )}
          {TIMEZONES.map((tz) => (
            <option key={tz} value={tz}>
              {tz}
            </option>
          ))}
        </select>
      </label>

      <p className="settings__note">
        Alerts are delivered over Telegram. Recipients are configured on the server
        (via the bot's chat IDs), not here.
      </p>

      <div className="settings__actions">
        <button type="submit" className="btn btn--primary" disabled={!canSave}>
          {saving ? 'Saving…' : 'Save settings'}
        </button>
        {saved && <span className="settings__saved">Saved ✓</span>}
        {error && <span className="field__error">{error}</span>}
      </div>
    </form>
  );
}
