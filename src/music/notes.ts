// Note <-> MIDI <-> frequency utilities. MIDI 69 = A4 = 440 Hz.

export const NOTE_NAMES_SHARP = [
  'C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B',
] as const;

export const NOTE_NAMES_FLAT = [
  'C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B',
] as const;

export type NoteName = typeof NOTE_NAMES_SHARP[number];

export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export function freqToMidi(freq: number): number {
  return 69 + 12 * Math.log2(freq / 440);
}

/** Round a (possibly fractional) MIDI number to the nearest integer semitone. */
export function nearestMidi(freq: number): { midi: number; cents: number } {
  const exact = freqToMidi(freq);
  const midi = Math.round(exact);
  const cents = (exact - midi) * 100;
  return { midi, cents };
}

export function midiToNoteName(midi: number, useFlats = false): string {
  const names = useFlats ? NOTE_NAMES_FLAT : NOTE_NAMES_SHARP;
  const pc = ((midi % 12) + 12) % 12;
  const octave = Math.floor(midi / 12) - 1;
  return `${names[pc]}${octave}`;
}

/** Just the pitch class name, no octave. */
export function midiToNoteClass(midi: number, useFlats = false): string {
  const names = useFlats ? NOTE_NAMES_FLAT : NOTE_NAMES_SHARP;
  const pc = ((midi % 12) + 12) % 12;
  return names[pc];
}

/** Parse a note like "E1", "A#2", "Bb0" to MIDI. */
export function noteToMidi(note: string): number {
  const m = /^([A-Ga-g])([#b]?)(-?\d+)$/.exec(note);
  if (!m) throw new Error(`Invalid note: ${note}`);
  const letter = m[1].toUpperCase();
  const accidental = m[2];
  const octave = parseInt(m[3], 10);
  const letterPc: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  let pc = letterPc[letter];
  if (accidental === '#') pc += 1;
  if (accidental === 'b') pc -= 1;
  return (octave + 1) * 12 + pc;
}

export function isSharpOrFlat(midi: number): boolean {
  const pc = ((midi % 12) + 12) % 12;
  return [1, 3, 6, 8, 10].includes(pc);
}
