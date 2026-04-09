// Per-position stats with localStorage persistence.
// Key shape: `${instrument}:${openStringNote}:${fret}`
// e.g. `bass:A1:3`, `guitar:E4:7`. Keyed by open-string note (not stringIndex)
// so the same physical position shares stats across tunings of the same
// instrument — a 4-string and 5-string bass both store "A string, fret 3"
// under the same key.

import { create } from 'zustand';
import { TUNINGS, type TuningId } from '../music/tunings';

export interface PositionStat {
  attempts: number;
  correct: number;
  totalMs: number;
  lastSeen: number;
}

export type StatsMap = Record<string, PositionStat>;

interface StatsState {
  stats: StatsMap;
  record: (key: string, correct: boolean, ms: number) => void;
  reset: () => void;
}

const STORAGE_KEY = 'fretecho:stats:v2';
const LEGACY_KEY = 'fretecho:stats:v1';

function loadStats(): StatsMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as StatsMap;

    // Migrate v1 keys (`${tuningId}:${stringIndex}:${fret}`) to v2
    // (`${instrument}:${openStringNote}:${fret}`). Stats for the shared
    // strings between 4-string and 5-string bass are merged.
    const legacyRaw = localStorage.getItem(LEGACY_KEY);
    if (!legacyRaw) return {};
    const legacy = JSON.parse(legacyRaw) as StatsMap;
    const migrated: StatsMap = {};
    for (const [oldKey, stat] of Object.entries(legacy)) {
      const m = /^(.+?):(\d+):(\d+)$/.exec(oldKey);
      if (!m) continue;
      const tuningId = m[1] as TuningId;
      const stringIndex = parseInt(m[2], 10);
      const fret = parseInt(m[3], 10);
      const def = TUNINGS[tuningId];
      if (!def) continue; // unknown legacy tuning id — drop
      const openString = def.strings[stringIndex];
      if (!openString) continue;
      const newKey = `${def.instrument}:${openString}:${fret}`;
      const existing = migrated[newKey];
      migrated[newKey] = existing
        ? {
            attempts: existing.attempts + stat.attempts,
            correct: existing.correct + stat.correct,
            totalMs: existing.totalMs + stat.totalMs,
            lastSeen: Math.max(existing.lastSeen, stat.lastSeen),
          }
        : { ...stat };
    }
    // Persist migrated copy so we don't re-migrate next load.
    saveStats(migrated);
    return migrated;
  } catch {
    return {};
  }
}

function saveStats(stats: StatsMap) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stats));
  } catch {
    /* ignore quota errors */
  }
}

export const useStatsStore = create<StatsState>((set, get) => ({
  stats: loadStats(),
  record: (key, correct, ms) => {
    const prev = get().stats[key] ?? { attempts: 0, correct: 0, totalMs: 0, lastSeen: 0 };
    const next: PositionStat = {
      attempts: prev.attempts + 1,
      correct: prev.correct + (correct ? 1 : 0),
      totalMs: prev.totalMs + ms,
      lastSeen: Date.now(),
    };
    const newStats = { ...get().stats, [key]: next };
    saveStats(newStats);
    set({ stats: newStats });
  },
  reset: () => {
    saveStats({});
    set({ stats: {} });
  },
}));

/** Proficiency score in [0, 1]. Higher is better. */
export function proficiency(stat: PositionStat | undefined): number | null {
  if (!stat || stat.attempts < 1) return null;
  const accuracy = stat.correct / stat.attempts;
  const avgMs = stat.totalMs / stat.attempts;
  // Speed score: 1.5s → 1.0, 5s → 0.0.
  const speed = clamp(1 - (avgMs - 1500) / 3500, 0, 1);
  return clamp(accuracy * 0.65 + speed * 0.35, 0, 1);
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

export function keyFor(tuning: TuningId, stringIndex: number, fret: number) {
  const def = TUNINGS[tuning];
  const openString = def.strings[stringIndex];
  return `${def.instrument}:${openString}:${fret}`;
}
