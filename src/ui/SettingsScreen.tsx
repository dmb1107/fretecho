// Settings screen. Writes directly through to the zustand settings store.

import { useEffect, useState } from 'react';
import { useSettings } from '../settings/settingsStore';
import { listInputDevices } from '../audio/micInput';
import { tuningsFor } from '../music/tunings';
import { CHORD_TYPES, CHORD_TYPE_IDS } from '../music/chords';
import { INTERVALS } from '../music/intervals';

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
    <div className="flex flex-col gap-4 p-3 sm:gap-8 sm:p-6 max-w-2xl mx-auto">
      <h2 className="text-lg sm:text-2xl font-bold">Settings</h2>

      <Section title="Instrument">
        <Radio
          value={s.instrument}
          onChange={(v) => s.setInstrument(v)}
          options={[
            { value: 'bass', label: 'Bass' },
            { value: 'guitar', label: 'Guitar' },
          ]}
        />
        <div className="mt-2 border-t border-neutral-800 pt-3">
          <Radio
            value={s.tuning}
            onChange={(v) => s.set('tuning', v)}
            options={tuningsFor(s.instrument).map((t) => ({ value: t.id, label: t.label }))}
          />
        </div>
      </Section>

      <Section title="Session">
        <Toggle label="Allow sharps/flats" value={s.allowAccidentals} onChange={(v) => s.set('allowAccidentals', v)} />
        <Toggle label="Focus on weak spots" value={s.focusWeakSpots} onChange={(v) => s.set('focusWeakSpots', v)} />
      </Section>

      <Section title="Chord training">
        <div className="flex flex-col gap-2">
          <span className="text-neutral-300">Chord types</span>
          {CHORD_TYPE_IDS.map((id) => {
            const ct = CHORD_TYPES[id];
            const enabled = s.enabledChordTypes.includes(id);
            return (
              <label key={id} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={() => {
                    const next = enabled
                      ? s.enabledChordTypes.filter((t) => t !== id)
                      : [...s.enabledChordTypes, id];
                    // Don't allow disabling all chord types.
                    if (next.length > 0) s.set('enabledChordTypes', next);
                  }}
                />
                <span className="text-neutral-200">{ct.label}</span>
              </label>
            );
          })}
        </div>
      </Section>

      <Section title="Interval training">
        <Field label="Direction">
          <select
            value={s.earIntervalDirection}
            onChange={(e) => s.set('earIntervalDirection', e.target.value as 'ascending' | 'descending' | 'random')}
            className="bg-neutral-900 border border-neutral-700 rounded px-2 py-1"
          >
            <option value="ascending">Ascending</option>
            <option value="descending">Descending</option>
            <option value="random">Random</option>
          </select>
        </Field>
        <div className="flex flex-col gap-2">
          <span className="text-neutral-300">Intervals</span>
          {INTERVALS.map((iv) => {
            const enabled = s.enabledIntervals.includes(iv.id);
            return (
              <label key={iv.id} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={() => {
                    const next = enabled
                      ? s.enabledIntervals.filter((t) => t !== iv.id)
                      : [...s.enabledIntervals, iv.id];
                    if (next.length > 0) s.set('enabledIntervals', next);
                  }}
                />
                <span className="text-neutral-200">{iv.shortLabel} — {iv.label}</span>
              </label>
            );
          })}
        </div>
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

