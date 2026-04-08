// Per-position stats with localStorage persistence.
// Key shape: `${bassType}:${stringIndex}:${fret}`.

import { create } from 'zustand';
import type { BassType } from '../music/tunings';

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

const STORAGE_KEY = 'fretecho:stats:v1';

function loadStats(): StatsMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as StatsMap;
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

export function keyFor(bass: BassType, stringIndex: number, fret: number) {
  return `${bass}:${stringIndex}:${fret}`;
}
