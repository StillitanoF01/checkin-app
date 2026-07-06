import { useState } from 'react';
import { updateSettings } from '../lib/api';
import type { Settings } from '../lib/types';

// This family only needs Australian zones (where Nonna/Iliana are) and Italy's single
// IANA zone (Europe/Rome covers the whole country — there's no separate Milan/Rome split).
const TIMEZONES = [
  'Australia/Sydney',
  'Australia/Melbourne',
  'Australia/Brisbane',
  'Australia/Adelaide',
  'Australia/Perth',
  'Australia/Darwin',
  'Australia/Hobart',
  'Europe/Rome',
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
    night_window_start: settings.night_window_start.slice(0, 5),
    night_window_end: settings.night_window_end.slice(0, 5),
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (k: keyof typeof form, v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    setSaved(false);
  };

  const windowBad = form.window_start >= form.window_end;
  const nightWindowBad = form.night_window_start >= form.night_window_end;
  const canSave = !windowBad && !nightWindowBad && !saving;

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
        night_window_start: form.night_window_start,
        night_window_end: form.night_window_end,
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

      <h3 className="settings__subtitle">Morning check-in</h3>
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

      <h3 className="settings__subtitle">Goodnight check-in</h3>
      <div className="settings__row settings__row--split">
        <label className="field">
          <span className="field__label">Window opens</span>
          <input
            type="time"
            className="field__input"
            value={form.night_window_start}
            onChange={(e) => set('night_window_start', e.target.value)}
          />
        </label>
        <label className="field">
          <span className="field__label">Window closes</span>
          <input
            type="time"
            className="field__input"
            value={form.night_window_end}
            onChange={(e) => set('night_window_end', e.target.value)}
          />
        </label>
      </div>
      {nightWindowBad && (
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
