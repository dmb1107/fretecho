// Weighted random picker that favors weak or unseen fretboard positions.

import type { BassType, Position } from '../music/tunings';
import { allPositions, positionKey } from '../music/tunings';
import { isSharpOrFlat } from '../music/notes';
import { noteAt } from '../music/tunings';
import { proficiency, type StatsMap } from '../stats/statsStore';

export interface PickerOptions {
  bass: BassType;
  minFret: number;
  maxFret: number;
  allowAccidentals: boolean;
  focusWeakSpots: boolean;
  stats: StatsMap;
}

/** Build the pool of eligible positions given current settings. */
export function eligiblePositions(opts: PickerOptions): Position[] {
  const { bass, minFret, maxFret, allowAccidentals } = opts;
  const pool = allPositions(bass, minFret, maxFret);
  if (allowAccidentals) return pool;
  return pool.filter((p) => !isSharpOrFlat(noteAt(bass, p.stringIndex, p.fret)));
}

/** Pick the next target. Focus mode biases toward weak / unseen positions. */
export function pickNext(opts: PickerOptions, avoid?: Position): Position {
  const pool = eligiblePositions(opts);
  if (pool.length === 0) throw new Error('No eligible positions');

  const weights = pool.map((p) => weightFor(p, opts));
  if (avoid) {
    const idx = pool.findIndex((p) => p.stringIndex === avoid.stringIndex && p.fret === avoid.fret);
    if (idx >= 0 && pool.length > 1) weights[idx] = 0;
  }

  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return pool[Math.floor(Math.random() * pool.length)];

  let r = Math.random() * total;
  for (let i = 0; i < pool.length; i++) {
    r -= weights[i];
    if (r <= 0) return pool[i];
  }
  return pool[pool.length - 1];
}

function weightFor(pos: Position, opts: PickerOptions): number {
  const key = positionKey(opts.bass, pos);
  const stat = opts.stats[key];
  if (!opts.focusWeakSpots) return 1;
  if (!stat || stat.attempts < 3) return 3; // prioritize under-sampled positions
  const score = proficiency(stat);
  if (score === null) return 3;
  // Weight inversely proportional to proficiency. Clamp so strong spots still appear.
  return 0.25 + (1 - score) * 3;
}
