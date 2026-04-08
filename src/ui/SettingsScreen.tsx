// Settings screen. Writes directly through to the zustand settings store.

import { useEffect, useState } from 'react';
import { useSettings } from '../settings/settingsStore';
import { listInputDevices } from '../audio/micInput';

export function SettingsScreen() {
  const s = useSettings();
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);

  useEffect(() => {
    // Ask for permission first so enumerateDevices returns labels.
    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((stream) => {
        stream.getTracks().forEach((t) => t.stop());
        return listInputDevices();
      })
      .then(setDevices)
      .catch(() => setDevices([]));
  }, []);

  return (
    <div className="flex flex-col gap-8 p-6 max-w-2xl mx-auto">
      <h2 className="text-2xl font-bold">Settings</h2>

      <Section title="Bass">
        <Radio
          value={s.bass}
          onChange={(v) => s.set('bass', v)}
          options={[
            { value: '4-string', label: '4-string (E A D G)' },
            { value: '5-string', label: '5-string (B E A D G)' },
          ]}
        />
      </Section>

      <Section title="Session">
        <Field label="Notes per session">
          <input
            type="number"
            min={1}
            max={200}
            value={s.notesPerSession}
            onChange={(e) => s.set('notesPerSession', Math.max(1, parseInt(e.target.value) || 1))}
            className="w-24 bg-neutral-900 border border-neutral-700 rounded px-2 py-1"
          />
        </Field>
        <Field label="Fret range">
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0}
              max={24}
              value={s.minFret}
              onChange={(e) => s.set('minFret', clamp(parseInt(e.target.value) || 0, 0, s.maxFret))}
              className="w-16 bg-neutral-900 border border-neutral-700 rounded px-2 py-1"
            />
            <span>to</span>
            <input
              type="number"
              min={0}
              max={24}
              value={s.maxFret}
              onChange={(e) => s.set('maxFret', clamp(parseInt(e.target.value) || 0, s.minFret, 24))}
              className="w-16 bg-neutral-900 border border-neutral-700 rounded px-2 py-1"
            />
          </div>
        </Field>
        <Toggle label="Allow sharps/flats" value={s.allowAccidentals} onChange={(v) => s.set('allowAccidentals', v)} />
        <Toggle
          label="Display accidentals as flats"
          value={s.useFlats}
          onChange={(v) => s.set('useFlats', v)}
          disabled={!s.allowAccidentals}
        />
        <Toggle label="Focus on weak spots" value={s.focusWeakSpots} onChange={(v) => s.set('focusWeakSpots', v)} />
        <Toggle label="Show hint on fretboard" value={s.showHint} onChange={(v) => s.set('showHint', v)} />
      </Section>

      <Section title="Prompt">
        <Radio
          value={s.promptStyle}
          onChange={(v) => s.set('promptStyle', v)}
          options={[
            { value: 'note-and-string', label: 'Note + octave + string ("C1 on the A string")' },
            { value: 'noteclass-and-string', label: 'Note + string ("C on the A string")' },
            { value: 'note-only', label: 'Note + octave only ("C1")' },
          ]}
        />
      </Section>

      <Section title="Microphone">
        <Field label="Input device">
          <select
            value={s.inputDeviceId ?? ''}
            onChange={(e) => s.set('inputDeviceId', e.target.value || null)}
            className="bg-neutral-900 border border-neutral-700 rounded px-2 py-1 w-full"
          >
            <option value="">System default</option>
            {devices.map((d) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label || `Device ${d.deviceId.slice(0, 6)}`}
              </option>
            ))}
          </select>
        </Field>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-sm uppercase tracking-widest text-neutral-500">{title}</h3>
      <div className="flex flex-col gap-3 rounded border border-neutral-800 bg-neutral-900/40 p-4">
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex items-center justify-between gap-4">
      <span className="text-neutral-300">{label}</span>
      <div>{children}</div>
    </label>
  );
}

function Toggle({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className={`flex items-center justify-between gap-4 ${disabled ? 'opacity-50' : ''}`}>
      <span className="text-neutral-300">{label}</span>
      <input type="checkbox" checked={value} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

function Radio<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; hint?: string }[];
}) {
  return (
    <div className="flex flex-col gap-2">
      {options.map((o) => (
        <label key={o.value} className="flex items-start gap-2 cursor-pointer">
          <input
            type="radio"
            checked={value === o.value}
            onChange={() => onChange(o.value)}
            className="mt-1"
          />
          <div>
            <div className="text-neutral-200">{o.label}</div>
            {o.hint && <div className="text-xs text-neutral-500">{o.hint}</div>}
          </div>
        </label>
      ))}
    </div>
  );
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}
