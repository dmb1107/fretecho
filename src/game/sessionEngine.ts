// Session engine: call-and-response round loop.
// Stateless-ish — holds internal state but exposes a React-friendly event API.

import type { TuningId, Position } from '../music/tunings';
import { noteAt, positionKey, stringLabel } from '../music/tunings';
import { midiToNoteName } from '../music/notes';
import type { PitchLoop } from '../audio/pitchDetector';
import { cancelSpeech, prewarmSpeech, speak } from '../audio/speech';
import { playError, playSuccess } from '../audio/feedbackTones';
import { pickNext } from './weakSpotPicker';
import type { StatsMap } from '../stats/statsStore';

export type PromptStyle =
  | 'note-and-string' // "C1 on the A string"
  | 'noteclass-and-string' // "C on the A string"
  | 'note-only'; // "C1"

export interface SessionConfig {
  tuning: TuningId;
  notesPerSession: number;
  allowAccidentals: boolean;
  promptStyle: PromptStyle;
  focusWeakSpots: boolean;
  minFret: number;
  maxFret: number;
}

export interface RoundResult {
  position: Position;
  expectedMidi: number;
  playedMidi: number;
  correct: boolean;
  ms: number;
  /** Whether this round's note was displayed/spoken using flats (vs sharps). */
  useFlats: boolean;
}

export type EngineState =
  | { kind: 'idle' }
  | {
      kind: 'prompting';
      round: number;
      target: Position;
      expectedMidi: number;
      text: string;
      useFlats: boolean;
    }
  | {
      kind: 'listening';
      round: number;
      target: Position;
      expectedMidi: number;
      text: string;
      startedAt: number;
      recorded: boolean;
      lastWrongMidi?: number;
      useFlats: boolean;
    }
  | { kind: 'feedback'; round: number; result: RoundResult }
  | { kind: 'done'; results: RoundResult[] };

export interface EngineDeps {
  pitchLoop: PitchLoop;
  getStats: () => StatsMap;
  recordStat: (key: string, correct: boolean, ms: number) => void;
  onStateChange: (s: EngineState) => void;
}

export class SessionEngine {
  private state: EngineState = { kind: 'idle' };
  private results: RoundResult[] = [];
  private round = 0;
  private stopped = false;

  constructor(private cfg: SessionConfig, private deps: EngineDeps) {}

  async start() {
    this.stopped = false;
    this.results = [];
    this.round = 0;
    prewarmSpeech();
    this.deps.pitchLoop.start();
    await this.nextRound();
  }

  stop() {
    this.stopped = true;
    // Abort any in-flight speech so the awaited `speak()` inside nextRound
    // resolves immediately and the engine exits cleanly.
    cancelSpeech();
    this.deps.pitchLoop.stop();
    this.setState({ kind: 'done', results: this.results });
  }

  /** Route this from PitchLoop's onStableNote. */
  handleStableNote = (midi: number) => {
    if (this.state.kind !== 'listening') return;
    this.judge(midi);
  };

  private async nextRound() {
    if (this.stopped) return;
    if (this.round >= this.cfg.notesPerSession) {
      this.deps.pitchLoop.stop();
      this.setState({ kind: 'done', results: this.results });
      return;
    }
    this.round += 1;

    const last = this.state.kind !== 'idle' && 'target' in this.state ? this.state.target : undefined;
    const target = pickNext(
      {
        tuning: this.cfg.tuning,
        minFret: this.cfg.minFret,
        maxFret: this.cfg.maxFret,
        allowAccidentals: this.cfg.allowAccidentals,
        focusWeakSpots: this.cfg.focusWeakSpots,
        stats: this.deps.getStats(),
      },
      last
    );
    const expectedMidi = noteAt(this.cfg.tuning, target.stringIndex, target.fret);
    // Randomly alternate between sharp/flat naming each round (only matters
    // when the note is an accidental). For natural notes both spellings are
    // identical so the coin flip is harmless.
    const useFlats = Math.random() < 0.5;
    const text = this.promptText(target, expectedMidi, useFlats);
    const speakTextStr = this.speakText(target, expectedMidi, useFlats);

    this.setState({ kind: 'prompting', round: this.round, target, expectedMidi, text, useFlats });

    // Pause the pitch loop so the mic doesn't detect the synthesized speech
    // (speech formants sit in the bass frequency range and pitchy locks on).
    this.deps.pitchLoop.pause();
    await speak(speakTextStr);
    if (this.stopped) return;

    // Wait long enough for the analyser's time-domain buffer (~186 ms at
    // fftSize 8192 / 44.1 kHz) to flush the tail of the spoken word before
    // we start listening for the user's played note.
    await sleep(300);
    if (this.stopped) return;

    this.deps.pitchLoop.resume();
    this.deps.pitchLoop.armForNextNote();
    this.setState({
      kind: 'listening',
      round: this.round,
      target,
      expectedMidi,
      text,
      startedAt: performance.now(),
      recorded: false,
      useFlats,
    });
  }

  private judge(playedMidi: number) {
    if (this.state.kind !== 'listening') return;
    const { target, expectedMidi, startedAt, recorded, round, text, lastWrongMidi, useFlats } = this.state;
    const ms = performance.now() - startedAt;
    // Note-name validation only: accept any octave.
    const correct = ((playedMidi % 12) + 12) % 12 === ((expectedMidi % 12) + 12) % 12;

    // Only the first attempt of a round is recorded in stats.
    if (!recorded) {
      const result: RoundResult = { position: target, expectedMidi, playedMidi, correct, ms, useFlats };
      this.results.push(result);
      this.deps.recordStat(positionKey(this.cfg.tuning, target), correct, ms);
    }

    if (correct) {
      // Pause loop so the success tone isn't detected as the next note.
      this.deps.pitchLoop.pause();
      playSuccess();
      // Use the originally recorded result if we already had a wrong first
      // attempt — stats should reflect that the round was initially missed.
      const headResult: RoundResult = recorded
        ? { position: target, expectedMidi, playedMidi, correct: false, ms, useFlats }
        : { position: target, expectedMidi, playedMidi, correct: true, ms, useFlats };
      this.setState({ kind: 'feedback', round, result: headResult });
      setTimeout(() => {
        if (!this.stopped) this.nextRound();
      }, 650);
      return;
    }

    // Wrong attempt: stay listening, show the correct position highlighted,
    // and keep waiting for the player to find the right note. Suppress the
    // error tone when the player is sustaining the *same* wrong note, but
    // still beep if they move to a different wrong note.
    const samePitchClassAsLastWrong =
      lastWrongMidi !== undefined &&
      ((playedMidi % 12) + 12) % 12 === ((lastWrongMidi % 12) + 12) % 12;
    if (!samePitchClassAsLastWrong) playError();
    this.setState({
      kind: 'listening',
      round,
      target,
      expectedMidi,
      text,
      startedAt,
      recorded: true,
      lastWrongMidi: playedMidi,
      useFlats,
    });

    // Brief pause so the error tone bleed doesn't trigger another judgment,
    // then resume listening.
    this.deps.pitchLoop.pause();
    setTimeout(() => {
      if (this.stopped) return;
      if (this.state.kind !== 'listening') return;
      this.deps.pitchLoop.resume();
      this.deps.pitchLoop.armForNextNote();
    }, 400);
  }

  /** Human-readable prompt for display in the UI. */
  private promptText(pos: Position, expectedMidi: number, useFlats: boolean): string {
    const fullName = midiToNoteName(expectedMidi, useFlats);
    const classOnly = fullName.replace(/-?\d+$/, '');
    const str = stringLabel(this.cfg.tuning, pos.stringIndex);
    switch (this.cfg.promptStyle) {
      case 'note-only':
        return fullName;
      case 'noteclass-and-string':
        return `${classOnly} on the ${str} string`;
      case 'note-and-string':
      default:
        return `${fullName} on the ${str} string`;
    }
  }

  /** TTS-friendly prompt with phonetic hacks (e.g. "A." for the letter A). */
  private speakText(pos: Position, expectedMidi: number, useFlats: boolean): string {
    const fullName = midiToNoteName(expectedMidi, useFlats);
    const spokenWithOctave = speakableNote(fullName);
    const spokenClassOnly = speakableNoteClass(fullName);
    const str = stringLabel(this.cfg.tuning, pos.stringIndex);
    // "A" as a bare letter gets read as the English article ("uh"). Appending
    // a period forces most TTS engines (Google, Microsoft) to read it as the
    // letter name ("ay").
    const spokenStr = str === 'A' ? 'A.' : str;
    switch (this.cfg.promptStyle) {
      case 'note-only':
        return spokenWithOctave;
      case 'noteclass-and-string':
        return `${spokenClassOnly} on the ${spokenStr} string`;
      case 'note-and-string':
      default:
        return `${spokenWithOctave} on the ${spokenStr} string`;
    }
  }

  private setState(s: EngineState) {
    this.state = s;
    this.deps.onStateChange(s);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Convert a note name like "B1" / "F#2" / "Bb0" into something the TTS engine
 * pronounces clearly with its octave. e.g. "B one", "F sharp two", "B flat zero".
 */
function speakableNote(nameWithOctave: string): string {
  const m = /^([A-G])([#b]?)(-?\d+)$/.exec(nameWithOctave);
  if (!m) return nameWithOctave;
  const letter = m[1];
  const accidental = m[2];
  const octave = parseInt(m[3], 10);
  // "A" as a bare letter gets read as the English article. Appending a period
  // forces most TTS engines to read it as the letter name.
  const spokenLetter = letter === 'A' ? 'A.' : letter;
  let head = spokenLetter;
  if (accidental === '#') head = `${spokenLetter} sharp`;
  else if (accidental === 'b') head = `${spokenLetter} flat`;
  return `${head} ${octaveWord(octave)}`;
}

/** Same as speakableNote but without the octave suffix. */
function speakableNoteClass(nameWithOctave: string): string {
  const m = /^([A-G])([#b]?)(-?\d+)$/.exec(nameWithOctave);
  if (!m) return nameWithOctave;
  const letter = m[1];
  const accidental = m[2];
  const spokenLetter = letter === 'A' ? 'A.' : letter;
  if (accidental === '#') return `${spokenLetter} sharp`;
  if (accidental === 'b') return `${spokenLetter} flat`;
  return spokenLetter;
}

function octaveWord(n: number): string {
  const words: Record<number, string> = {
    [-1]: 'minus one',
    0: 'zero',
    1: 'one',
    2: 'two',
    3: 'three',
    4: 'four',
    5: 'five',
    6: 'six',
  };
  return words[n] ?? String(n);
}

/** Exposed for Stats / session summary. */
export function describeRound(tuning: TuningId, r: RoundResult, useFlats: boolean): string {
  const str = stringLabel(tuning, r.position.stringIndex);
  const note = midiToNoteName(r.expectedMidi, useFlats);
  return `${note} (${str} string, fret ${r.position.fret})`;
}
