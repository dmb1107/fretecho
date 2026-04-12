// Chord tone trainer session engine: call-and-response with multi-tone rounds.
// Parallel to SessionEngine but manages chord → tone-by-tone validation.

import type { TuningId } from '../music/tunings';
import type { PitchLoop } from '../audio/pitchDetector';
import { cancelSpeech, prewarmSpeech, speak } from '../audio/speech';
import { midiToNoteClass, speakableNoteName } from '../music/notes';
import { playError, playSuccess } from '../audio/feedbackTones';
import {
  pickChord,
  chordTonePitchClasses,
  chordDisplayName,
  speakableChordName,
  chordStatKey,
  type ChordPrompt,
} from '../music/chords';
import type { StatsMap } from '../stats/statsStore';

export interface ChordSessionConfig {
  tuning: TuningId;
  enabledChordTypes: string[];
  allowAccidentals: boolean;
  minFret: number;
  maxFret: number;
  focusWeakSpots: boolean;
  showHint: boolean;
}

export interface ToneResult {
  toneIndex: number;
  toneLabel: string;
  expectedPitchClass: number;
  playedMidi: number;
  correct: boolean; // first attempt correct
  ms: number;
}

export interface ChordRoundResult {
  chord: ChordPrompt;
  tones: ToneResult[];
  allCorrectFirstTry: boolean;
  totalMs: number;
}

export type ChordEngineState =
  | { kind: 'idle' }
  | { kind: 'prompting'; round: number; chord: ChordPrompt; displayName: string }
  | {
      kind: 'listening';
      round: number;
      chord: ChordPrompt;
      displayName: string;
      toneIndex: number;
      expectedPitchClass: number;
      toneLabel: string;
      startedAt: number;
      recorded: boolean;
      lastWrongPitchClass?: number;
      prevTonePitchClass?: number;
      completedTones: number[];
    }
  | {
      kind: 'tone-feedback';
      round: number;
      chord: ChordPrompt;
      displayName: string;
      toneIndex: number;
      completedTones: number[];
    }
  | { kind: 'feedback'; round: number; chord: ChordPrompt; displayName: string; allCorrectFirstTry: boolean }
  | { kind: 'done'; results: ChordRoundResult[] };

export interface ChordEngineDeps {
  pitchLoop: PitchLoop;
  getStats: () => StatsMap;
  recordStat: (key: string, correct: boolean, ms: number) => void;
  onStateChange: (s: ChordEngineState) => void;
}

export class ChordSessionEngine {
  private state: ChordEngineState = { kind: 'idle' };
  private results: ChordRoundResult[] = [];
  private round = 0;
  private stopped = false;
  private currentToneResults: ToneResult[] = [];

  constructor(private cfg: ChordSessionConfig, private deps: ChordEngineDeps) {}

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
    cancelSpeech();
    this.deps.pitchLoop.stop();
    this.setState({ kind: 'done', results: this.results });
  }

  /** Route from PitchLoop's onStableNote. */
  handleStableNote = (midi: number) => {
    if (this.state.kind !== 'listening') return;
    this.judge(midi);
  };

  private async nextRound() {
    if (this.stopped) return;
    this.round += 1;
    this.currentToneResults = [];

    const lastChord =
      this.state.kind !== 'idle' && 'chord' in this.state ? this.state.chord : undefined;
    const chord = pickChord(this.cfg.enabledChordTypes, this.cfg.allowAccidentals, lastChord);
    const displayName = chordDisplayName(chord.rootName, chord.chordType);
    const speakText = speakableChordName(chord.rootName, chord.chordType);

    this.setState({ kind: 'prompting', round: this.round, chord, displayName });

    // Pause pitch loop during speech.
    this.deps.pitchLoop.pause();
    await speak(speakText);
    if (this.stopped) return;

    // Flush analyser buffer tail.
    await sleep(300);
    if (this.stopped) return;

    this.deps.pitchLoop.resume();
    this.deps.pitchLoop.armForNextNote();
    this.listenForTone(chord, displayName, 0, []);
  }

  private listenForTone(chord: ChordPrompt, displayName: string, toneIndex: number, completedTones: number[]) {
    const pitchClasses = chordTonePitchClasses(chord.rootPitchClass, chord.chordType);
    const expectedPitchClass = pitchClasses[toneIndex];
    const toneLabel = chord.chordType.toneLabels[toneIndex];
    const prevTonePitchClass = toneIndex > 0 ? pitchClasses[toneIndex - 1] : undefined;

    this.setState({
      kind: 'listening',
      round: this.round,
      chord,
      displayName,
      toneIndex,
      expectedPitchClass,
      toneLabel,
      startedAt: performance.now(),
      recorded: false,
      prevTonePitchClass,
      completedTones,
    });
  }

  private judge(playedMidi: number) {
    if (this.state.kind !== 'listening') return;
    const {
      chord, displayName, toneIndex, expectedPitchClass, toneLabel,
      startedAt, recorded, lastWrongPitchClass, prevTonePitchClass, completedTones,
    } = this.state;
    const playedPc = ((playedMidi % 12) + 12) % 12;

    // Ignore sustain/ring from the previous chord tone — don't count it as wrong.
    if (prevTonePitchClass !== undefined && playedPc === prevTonePitchClass) return;

    const ms = performance.now() - startedAt;
    const correct = playedPc === expectedPitchClass;

    // Record stats on first attempt only.
    if (!recorded) {
      const toneResult: ToneResult = {
        toneIndex, toneLabel, expectedPitchClass, playedMidi, correct, ms,
      };
      this.currentToneResults.push(toneResult);
      this.deps.recordStat(
        chordStatKey(chord.rootName, chord.chordType.id, toneLabel),
        correct,
        ms,
      );
    }

    if (correct) {
      this.deps.pitchLoop.pause();
      playSuccess();

      const newCompleted = [...completedTones, expectedPitchClass];
      const isLastTone = toneIndex >= chord.chordType.intervals.length - 1;

      const noteName = speakableNoteName(midiToNoteClass(playedMidi, chord.useFlats));

      if (isLastTone) {
        // Round complete — speak the played note name, then start next round.
        const allCorrect = this.currentToneResults.every((t) => t.correct);
        const totalMs = this.currentToneResults.reduce((a, t) => a + t.ms, 0);
        this.results.push({
          chord,
          tones: [...this.currentToneResults],
          allCorrectFirstTry: allCorrect,
          totalMs,
        });
        this.setState({
          kind: 'feedback',
          round: this.round,
          chord,
          displayName,
          allCorrectFirstTry: allCorrect,
        });
        speak(noteName).then(() => {
          if (this.stopped) return sleep(0);
          return sleep(200);
        }).then(() => {
          if (!this.stopped) this.nextRound();
        });
      } else {
        // Advance to next tone — speak the played note name first.
        this.setState({
          kind: 'tone-feedback',
          round: this.round,
          chord,
          displayName,
          toneIndex,
          completedTones: newCompleted,
        });
        speak(noteName).then(() => {
          if (this.stopped) return;
          if (this.state.kind !== 'tone-feedback') return;
          return sleep(200);
        }).then(() => {
          if (this.stopped) return;
          if (this.state.kind !== 'tone-feedback') return;
          this.deps.pitchLoop.resume();
          this.deps.pitchLoop.armForNextNote();
          this.listenForTone(chord, displayName, toneIndex + 1, newCompleted);
        });
      }
      return;
    }

    // Wrong attempt: stay listening.
    const samePcAsLastWrong =
      lastWrongPitchClass !== undefined && playedPc === lastWrongPitchClass;
    if (!samePcAsLastWrong) playError();

    this.setState({
      kind: 'listening',
      round: this.round,
      chord,
      displayName,
      toneIndex,
      expectedPitchClass,
      toneLabel,
      startedAt,
      recorded: true,
      lastWrongPitchClass: playedPc,
      completedTones,
    });

    // Brief pause so the error tone doesn't trigger another judgment.
    this.deps.pitchLoop.pause();
    setTimeout(() => {
      if (this.stopped) return;
      if (this.state.kind !== 'listening') return;
      this.deps.pitchLoop.resume();
      this.deps.pitchLoop.armForNextNote();
    }, 400);
  }

  private setState(s: ChordEngineState) {
    this.state = s;
    this.deps.onStateChange(s);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Describe a chord round result for the session summary. */
export function describeChordRound(r: ChordRoundResult): string {
  const name = chordDisplayName(r.chord.rootName, r.chord.chordType);
  const missed = r.tones.filter((t) => !t.correct).map((t) => t.toneLabel);
  if (missed.length === 0) return `${name} — all correct`;
  return `${name} — missed: ${missed.join(', ')}`;
}
