// Interval definitions for ear training.

export interface IntervalDef {
  id: string;
  semitones: number;
  label: string;
  shortLabel: string;
  spokenLabel: string;
}

export const INTERVALS: IntervalDef[] = [
  { id: 'R',  semitones: 0,  label: 'Root',          shortLabel: 'R',  spokenLabel: 'root' },
  { id: 'm2', semitones: 1,  label: 'Minor 2nd',    shortLabel: 'm2', spokenLabel: 'minor second' },
  { id: 'M2', semitones: 2,  label: 'Major 2nd',    shortLabel: 'M2', spokenLabel: 'major second' },
  { id: 'm3', semitones: 3,  label: 'Minor 3rd',    shortLabel: 'm3', spokenLabel: 'minor third' },
  { id: 'M3', semitones: 4,  label: 'Major 3rd',    shortLabel: 'M3', spokenLabel: 'major third' },
  { id: 'P4', semitones: 5,  label: 'Perfect 4th',  shortLabel: 'P4', spokenLabel: 'perfect fourth' },
  { id: 'TT', semitones: 6,  label: 'Tritone',      shortLabel: 'TT', spokenLabel: 'tritone' },
  { id: 'P5', semitones: 7,  label: 'Perfect 5th',  shortLabel: 'P5', spokenLabel: 'perfect fifth' },
  { id: 'm6', semitones: 8,  label: 'Minor 6th',    shortLabel: 'm6', spokenLabel: 'minor sixth' },
  { id: 'M6', semitones: 9,  label: 'Major 6th',    shortLabel: 'M6', spokenLabel: 'major sixth' },
  { id: 'm7', semitones: 10, label: 'Minor 7th',    shortLabel: 'm7', spokenLabel: 'minor seventh' },
  { id: 'M7', semitones: 11, label: 'Major 7th',    shortLabel: 'M7', spokenLabel: 'major seventh' },
];

export const DEFAULT_ENABLED_INTERVALS = ['m2', 'M2', 'm3', 'M3', 'P4', 'TT', 'P5', 'm6', 'M6', 'm7', 'M7'];

const intervalsById = new Map(INTERVALS.map((i) => [i.id, i]));

export function getInterval(id: string): IntervalDef | undefined {
  return intervalsById.get(id);
}

/** Pick a random interval from the enabled set, avoiding the last-picked one. */
export function pickInterval(
  enabledIds: string[],
  lastId?: string,
): IntervalDef {
  const pool = INTERVALS.filter((i) => enabledIds.includes(i.id));
  if (pool.length === 0) return INTERVALS[6]; // fallback to P5
  if (pool.length === 1) return pool[0];
  const filtered = pool.filter((i) => i.id !== lastId);
  return filtered[Math.floor(Math.random() * filtered.length)];
}
