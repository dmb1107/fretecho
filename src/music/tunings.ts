import { noteToMidi } from './notes';

export type BassType = '4-string' | '5-string';

/** Strings are listed from LOWEST pitch to HIGHEST pitch (index 0 = lowest). */
export const TUNINGS: Record<BassType, string[]> = {
  '4-string': ['E1', 'A1', 'D2', 'G2'],
  '5-string': ['B0', 'E1', 'A1', 'D2', 'G2'],
};

/** Human-readable string label (thickest = "B" or "E"). */
export function stringLabel(bass: BassType, stringIndex: number): string {
  const open = TUNINGS[bass][stringIndex];
  // Drop octave for display.
  return open.replace(/-?\d+$/, '');
}

/** MIDI note at (stringIndex, fret). */
export function noteAt(bass: BassType, stringIndex: number, fret: number): number {
  return noteToMidi(TUNINGS[bass][stringIndex]) + fret;
}

export interface Position {
  stringIndex: number;
  fret: number;
}

/** All (string, fret) positions in the given fret range, inclusive. */
export function allPositions(bass: BassType, minFret: number, maxFret: number): Position[] {
  const positions: Position[] = [];
  const numStrings = TUNINGS[bass].length;
  for (let s = 0; s < numStrings; s++) {
    for (let f = minFret; f <= maxFret; f++) {
      positions.push({ stringIndex: s, fret: f });
    }
  }
  return positions;
}

export function positionKey(bass: BassType, p: Position): string {
  return `${bass}:${p.stringIndex}:${p.fret}`;
}
