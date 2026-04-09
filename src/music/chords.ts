// Chord type definitions and helpers for the chord tone trainer.

import { NOTE_NAMES_SHARP, NOTE_NAMES_FLAT, isSharpOrFlat } from './notes';

export interface ChordType {
  id: string;
  label: string;
  /** TTS-friendly name, e.g. "major seven". */
  spokenLabel: string;
  /** Semitone intervals from the root. */
  intervals: number[];
  /** Human-readable tone labels in interval order. */
  toneLabels: string[];
}

export const CHORD_TYPES: Record<string, ChordType> = {
  maj: {
    id: 'maj',
    label: 'Major',
    spokenLabel: 'major',
    intervals: [0, 4, 7],
    toneLabels: ['R', '3', '5'],
  },
  min: {
    id: 'min',
    label: 'Minor',
    spokenLabel: 'minor',
    intervals: [0, 3, 7],
    toneLabels: ['R', 'b3', '5'],
  },
  maj7: {
    id: 'maj7',
    label: 'Major 7',
    spokenLabel: 'major seven',
    intervals: [0, 4, 7, 11],
    toneLabels: ['R', '3', '5', '7'],
  },
  min7: {
    id: 'min7',
    label: 'Minor 7',
    spokenLabel: 'minor seven',
    intervals: [0, 3, 7, 10],
    toneLabels: ['R', 'b3', '5', 'b7'],
  },
  dom7: {
    id: 'dom7',
    label: 'Dominant 7',
    spokenLabel: 'seven',
    intervals: [0, 4, 7, 10],
    toneLabels: ['R', '3', '5', 'b7'],
  },
  m7b5: {
    id: 'm7b5',
    label: 'Half-diminished',
    spokenLabel: 'minor seven flat five',
    intervals: [0, 3, 6, 10],
    toneLabels: ['R', 'b3', 'b5', 'b7'],
  },
  dim: {
    id: 'dim',
    label: 'Diminished',
    spokenLabel: 'diminished',
    intervals: [0, 3, 6],
    toneLabels: ['R', 'b3', 'b5'],
  },
  aug: {
    id: 'aug',
    label: 'Augmented',
    spokenLabel: 'augmented',
    intervals: [0, 4, 8],
    toneLabels: ['R', '3', '#5'],
  },
};

/** All chord type IDs in display order. */
export const CHORD_TYPE_IDS = Object.keys(CHORD_TYPES);

/** Default set of enabled chord types for new users. */
export const DEFAULT_ENABLED_CHORDS = ['maj', 'min', 'maj7', 'min7', 'dom7'];

export interface ChordPrompt {
  /** Root pitch class 0-11 (C=0). */
  rootPitchClass: number;
  rootName: string;
  chordType: ChordType;
  useFlats: boolean;
}

/** Pitch classes (mod 12) for each tone in the chord. */
export function chordTonePitchClasses(rootPitchClass: number, chord: ChordType): number[] {
  return chord.intervals.map((i) => (rootPitchClass + i) % 12);
}

/** Display name like "Cmaj7" or "Bbm7b5". */
export function chordDisplayName(rootName: string, chord: ChordType): string {
  const suffixes: Record<string, string> = {
    maj: '', min: 'm', maj7: 'maj7', min7: 'm7',
    dom7: '7', m7b5: 'm7b5', dim: 'dim', aug: 'aug',
  };
  return `${rootName}${suffixes[chord.id] ?? chord.id}`;
}

/** TTS-friendly chord name, e.g. "C major seven", "B flat minor". */
export function speakableChordName(rootName: string, chord: ChordType): string {
  const spokenRoot = speakableRootName(rootName);
  return `${spokenRoot} ${chord.spokenLabel}`;
}

function speakableRootName(name: string): string {
  const letter = name.charAt(0);
  const accidental = name.slice(1);
  // "A" alone is read as the article — append period to force letter reading.
  const spokenLetter = letter === 'A' ? 'A.' : letter;
  if (accidental === '#') return `${spokenLetter} sharp`;
  if (accidental === 'b') return `${spokenLetter} flat`;
  return spokenLetter;
}

/** Pick a random chord prompt, avoiding the previous one. */
export function pickChord(
  enabledTypes: string[],
  allowAccidentals: boolean,
  avoid?: ChordPrompt,
): ChordPrompt {
  const types = enabledTypes
    .map((id) => CHORD_TYPES[id])
    .filter((t): t is ChordType => t !== undefined);
  if (types.length === 0) throw new Error('No chord types enabled');

  // Build eligible root pitch classes.
  const roots: number[] = [];
  for (let pc = 0; pc < 12; pc++) {
    if (!allowAccidentals && isSharpOrFlat(pc)) continue;
    roots.push(pc);
  }
  if (roots.length === 0) throw new Error('No eligible root notes');

  // Pick randomly, avoiding the same chord twice in a row.
  for (let attempt = 0; attempt < 50; attempt++) {
    const rootPc = roots[Math.floor(Math.random() * roots.length)];
    const chordType = types[Math.floor(Math.random() * types.length)];
    if (
      avoid &&
      avoid.rootPitchClass === rootPc &&
      avoid.chordType.id === chordType.id
    ) {
      continue;
    }
    const useFlats = Math.random() < 0.5;
    const names = useFlats ? NOTE_NAMES_FLAT : NOTE_NAMES_SHARP;
    return { rootPitchClass: rootPc, rootName: names[rootPc], chordType, useFlats };
  }

  // Fallback (only if single chord + single root).
  const useFlats = Math.random() < 0.5;
  const names = useFlats ? NOTE_NAMES_FLAT : NOTE_NAMES_SHARP;
  return {
    rootPitchClass: roots[0],
    rootName: names[roots[0]],
    chordType: types[0],
    useFlats,
  };
}

/** Stats key for a chord tone. */
export function chordStatKey(rootName: string, chordTypeId: string, toneLabel: string): string {
  return `chord:${rootName}:${chordTypeId}:${toneLabel}`;
}
