import { noteToMidi } from './notes';

export type Instrument = 'bass' | 'guitar';
export type TuningId = '4-string' | '5-string' | '6-string';

export interface TuningDef {
  id: TuningId;
  instrument: Instrument;
  label: string;
  /** Strings listed from LOWEST pitch to HIGHEST pitch (index 0 = lowest). */
  strings: string[];
}

export const TUNINGS: Record<TuningId, TuningDef> = {
  '4-string': {
    id: '4-string',
    instrument: 'bass',
    label: '4-string (E A D G)',
    strings: ['E1', 'A1', 'D2', 'G2'],
  },
  '5-string': {
    id: '5-string',
    instrument: 'bass',
    label: '5-string (B E A D G)',
    strings: ['B0', 'E1', 'A1', 'D2', 'G2'],
  },
  '6-string': {
    id: '6-string',
    instrument: 'guitar',
    label: '6-string (E A D G B E)',
    strings: ['E2', 'A2', 'D3', 'G3', 'B3', 'E4'],
  },
};

export function tuningsFor(instrument: Instrument): TuningDef[] {
  return Object.values(TUNINGS).filter((t) => t.instrument === instrument);
}

export function instrumentOf(tuning: TuningId): Instrument {
  return TUNINGS[tuning].instrument;
}

/** Human-readable string label (thickest = "B" or "E"). */
export function stringLabel(tuning: TuningId, stringIndex: number): string {
  const open = TUNINGS[tuning].strings[stringIndex];
  // Drop octave for display.
  return open.replace(/-?\d+$/, '');
}

/** MIDI note at (stringIndex, fret). */
export function noteAt(tuning: TuningId, stringIndex: number, fret: number): number {
  return noteToMidi(TUNINGS[tuning].strings[stringIndex]) + fret;
}

export interface Position {
  stringIndex: number;
  fret: number;
}

/** All (string, fret) positions in the given fret range, inclusive. */
export function allPositions(tuning: TuningId, minFret: number, maxFret: number): Position[] {
  const positions: Position[] = [];
  const numStrings = TUNINGS[tuning].strings.length;
  for (let s = 0; s < numStrings; s++) {
    for (let f = minFret; f <= maxFret; f++) {
      positions.push({ stringIndex: s, fret: f });
    }
  }
  return positions;
}

/**
 * Stats key for a position. Scoped by instrument and by the open-string note
 * (not stringIndex), so the same physical position shares stats across tunings
 * of the same instrument — e.g. "A string, fret 3" on a 4-string and 5-string
 * bass both map to the same key. Guitar stays in its own namespace.
 */
export function positionKey(tuning: TuningId, p: Position): string {
  const def = TUNINGS[tuning];
  const openString = def.strings[p.stringIndex];
  return `${def.instrument}:${openString}:${p.fret}`;
}
