// Ear training session engine: plays a reference tone, speaks an interval,
// then the user plays the root note followed by the interval note.
// For root-only (0 semitones), the round completes after the root.

import type { PitchLoop } from '../audio/pitchDetector';
import { cancelSpeech, prewarmSpeech, speak } from '../audio/speech';
import { playError, playSuccess } from '../audio/feedbackTones';
import { playReference, replayReference } from '../audio/bassTone';
import { pickInterval, type IntervalDef } from '../music/intervals';
import { midiToNoteClass } from '../music/notes';
import type { IntervalDirection } from '../settings/settingsStore';
import type { StatsMap } from '../stats/statsStore';

export interface EarSessionConfig {
  enabledIntervals: string[];
  direction: IntervalDirection;
}

export interface EarRoundResult {
  interval: IntervalDef;
  rootMidi: number;
  expectedMidi: number;
  playedMidi: number;
  correct: boolean;
  ms: number;
  direction: 'ascending' | 'descending';
}

export type EarEngineState =
  | { kind: 'idle' }
  | {
      kind: 'prompting';
      round: number;
      interval: IntervalDef;
      rootMidi: number;
      direction: 'ascending' | 'descending';
    }
  | {
      kind: 'listening-root';
      round: number;
      interval: IntervalDef;
      rootMidi: number;
      expectedMidi: number;
      direction: 'ascending' | 'descending';
      startedAt: number;
      recorded: boolean;
      lastWrongMidi?: number;
    }
  | {
      kind: 'root-feedback';
      round: number;
      interval: IntervalDef;
      rootMidi: number;
      expectedMidi: number;
      direction: 'ascending' | 'descending';
    }
  | {
      kind: 'listening-interval';
      round: number;
      interval: IntervalDef;
      rootMidi: number;
      expectedMidi: number;
      direction: 'ascending' | 'descending';
      startedAt: number;
      recorded: boolean;
      lastWrongMidi?: number;
    }
  | {
      kind: 'feedback';
      round: number;
      result: EarRoundResult;
    }
  | { kind: 'done'; results: EarRoundResult[] };

export interface EarEngineDeps {
  pitchLoop: PitchLoop;
  getStats: () => StatsMap;
  recordStat: (key: string, correct: boolean, ms: number) => void;
  onStateChange: (s: EarEngineState) => void;
}

// Root notes span E1 (28) to G2 (43) — the bass's fundamental range.
const ROOT_MIN = 28;
const ROOT_MAX = 43;
// Keep the target note within the detectable bass range.
const TARGET_MAX = 55; // G3

export class EarSessionEngine {
  private state: EarEngineState = { kind: 'idle' };
  private results: EarRoundResult[] = [];
  private round = 0;
  private stopped = false;
  private lastIntervalId: string | undefined;

  constructor(private cfg: EarSessionConfig, private deps: EarEngineDeps) {}

  async start() {
    this.stopped = false;
    this.results = [];
    this.round = 0;
    this.lastIntervalId = undefined;
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
    if (this.state.kind === 'listening-root') {
      this.judgeRoot(midi);
    } else if (this.state.kind === 'listening-interval') {
      this.judgeInterval(midi);
    }
  };

  /** Replay the current reference tone (user-triggered). */
  replay() {
    if (this.state.kind !== 'listening-root' && this.state.kind !== 'listening-interval') return;
    // Save state so we can restore after replay.
    const savedState = this.state;
    this.deps.pitchLoop.pause();
    // Transition to prompting so handleStableNote ignores any detection.
    this.setState({
      kind: 'prompting',
      round: this.round,
      interval: savedState.interval,
      rootMidi: savedState.rootMidi,
      direction: savedState.direction,
    });
    replayReference();
    // Wait for tone (800ms) + analyser buffer flush (1200ms).
    setTimeout(() => {
      if (this.stopped) return;
      this.deps.pitchLoop.resume();
      this.deps.pitchLoop.armForNextNote();
      this.setState(savedState);
    }, 2000);
  }

  private async nextRound() {
    if (this.stopped) return;
    this.round += 1;

    const interval = pickInterval(this.cfg.enabledIntervals, this.lastIntervalId);
    this.lastIntervalId = interval.id;

    const isRoot = interval.semitones === 0;
    const direction = isRoot ? 'ascending' as const : this.resolveDirection();

    // Pick a random root that keeps the target in range.
    const maxRoot = direction === 'ascending'
      ? Math.min(ROOT_MAX, TARGET_MAX - interval.semitones)
      : ROOT_MAX;
    const minRoot = direction === 'descending'
      ? Math.max(ROOT_MIN, ROOT_MIN + interval.semitones)
      : ROOT_MIN;
    const rootMidi = minRoot + Math.floor(Math.random() * (maxRoot - minRoot + 1));

    const expectedMidi = direction === 'ascending'
      ? rootMidi + interval.semitones
      : rootMidi - interval.semitones;

    this.setState({
      kind: 'prompting',
      round: this.round,
      interval,
      rootMidi,
      direction,
    });

    // Pause pitch loop so the synth tone + TTS don't trigger detection.
    this.deps.pitchLoop.pause();

    // Play the reference tone.
    playReference(rootMidi);

    if (isRoot) {
      // Root-only: no TTS needed, just wait for tone + buffer flush.
      await sleep(1500);
    } else {
      // Let the tone ring, then speak the note name so the user knows what root to play.
      await sleep(900);
      if (this.stopped) return;

      await speak('root');
      if (this.stopped) return;

      // Flush analyser buffer.
      await sleep(300);
    }
    if (this.stopped) return;

    this.deps.pitchLoop.resume();
    this.deps.pitchLoop.armForNextNote();

    // Listen for the root note.
    this.setState({
      kind: 'listening-root',
      round: this.round,
      interval,
      rootMidi,
      expectedMidi,
      direction,
      startedAt: performance.now(),
      recorded: false,
    });
  }

  private judgeRoot(playedMidi: number) {
    if (this.state.kind !== 'listening-root') return;
    const {
      interval, rootMidi, expectedMidi, direction,
      startedAt, recorded, lastWrongMidi,
    } = this.state;

    const playedPc = ((playedMidi % 12) + 12) % 12;
    const rootPc = ((rootMidi % 12) + 12) % 12;
    const correct = playedPc === rootPc;

    if (correct) {
      this.deps.pitchLoop.pause();
      playSuccess();

      // For root-only intervals (0 semitones), the round is complete.
      if (interval.semitones === 0) {
        const ms = performance.now() - startedAt;
        if (!recorded) {
          const result: EarRoundResult = {
            interval, rootMidi, expectedMidi, playedMidi, correct: true, ms, direction,
          };
          this.results.push(result);
          this.deps.recordStat(`ear:interval:${interval.id}`, true, ms);
        }
        this.setState({
          kind: 'feedback',
          round: this.round,
          result: { interval, rootMidi, expectedMidi, playedMidi, correct: true, ms, direction },
        });
        setTimeout(() => {
          if (!this.stopped) this.nextRound();
        }, 650);
        return;
      }

      // Non-root interval: speak interval name, then start listening.
      this.setState({
        kind: 'root-feedback',
        round: this.round,
        interval,
        rootMidi,
        expectedMidi,
        direction,
      });

      const dirWord = direction === 'ascending' ? 'up' : 'down';
      speak(`${interval.spokenLabel} ${dirWord}`).then(() => {
        if (this.stopped) return;
        if (this.state.kind !== 'root-feedback') return;
        sleep(300).then(() => {
          if (this.stopped) return;
          if (this.state.kind !== 'root-feedback') return;
          this.deps.pitchLoop.resume();
          this.deps.pitchLoop.armForNextNote();
          this.setState({
            kind: 'listening-interval',
            round: this.round,
            interval,
            rootMidi,
            expectedMidi,
            direction,
            startedAt: performance.now(),
            recorded: false,
          });
        });
      });
      return;
    }

    // Wrong root — stay listening.
    const lastWrongPc = lastWrongMidi !== undefined ? ((lastWrongMidi % 12) + 12) % 12 : undefined;
    const samePcAsLastWrong = lastWrongPc !== undefined && playedPc === lastWrongPc;
    if (!samePcAsLastWrong) playError();

    this.setState({
      kind: 'listening-root',
      round: this.round,
      interval,
      rootMidi,
      expectedMidi,
      direction,
      startedAt,
      recorded: true,
      lastWrongMidi: playedMidi,
    });

    this.deps.pitchLoop.pause();
    setTimeout(() => {
      if (this.stopped) return;
      if (this.state.kind !== 'listening-root') return;
      this.deps.pitchLoop.resume();
      this.deps.pitchLoop.armForNextNote();
    }, 400);
  }

  private judgeInterval(playedMidi: number) {
    if (this.state.kind !== 'listening-interval') return;
    const {
      interval, rootMidi, expectedMidi, direction,
      startedAt, recorded, lastWrongMidi,
    } = this.state;

    const playedPc = ((playedMidi % 12) + 12) % 12;
    const expectedPc = ((expectedMidi % 12) + 12) % 12;

    // Ignore sustain/ring from the root note — don't count it as wrong.
    const rootPc = ((rootMidi % 12) + 12) % 12;
    if (playedPc === rootPc) return;

    const ms = performance.now() - startedAt;
    const correct = playedPc === expectedPc;

    if (!recorded) {
      const statKey = `ear:interval:${interval.id}:${direction}`;
      const result: EarRoundResult = {
        interval, rootMidi, expectedMidi, playedMidi, correct, ms, direction,
      };
      this.results.push(result);
      this.deps.recordStat(statKey, correct, ms);
    }

    if (correct) {
      this.deps.pitchLoop.pause();
      playSuccess();
      this.setState({
        kind: 'feedback',
        round: this.round,
        result: { interval, rootMidi, expectedMidi, playedMidi, correct, ms, direction },
      });
      setTimeout(() => {
        if (!this.stopped) this.nextRound();
      }, 650);
      return;
    }

    // Wrong — stay listening.
    const lastWrongPc = lastWrongMidi !== undefined ? ((lastWrongMidi % 12) + 12) % 12 : undefined;
    const samePcAsLastWrong = lastWrongPc !== undefined && playedPc === lastWrongPc;
    if (!samePcAsLastWrong) playError();

    this.setState({
      kind: 'listening-interval',
      round: this.round,
      interval,
      rootMidi,
      expectedMidi,
      direction,
      startedAt,
      recorded: true,
      lastWrongMidi: playedMidi,
    });

    this.deps.pitchLoop.pause();
    setTimeout(() => {
      if (this.stopped) return;
      if (this.state.kind !== 'listening-interval') return;
      this.deps.pitchLoop.resume();
      this.deps.pitchLoop.armForNextNote();
    }, 400);
  }

  private resolveDirection(): 'ascending' | 'descending' {
    if (this.cfg.direction === 'random') {
      return Math.random() < 0.5 ? 'ascending' : 'descending';
    }
    return this.cfg.direction;
  }

  private setState(s: EarEngineState) {
    this.state = s;
    this.deps.onStateChange(s);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Describe a round result for the session summary. */
export function describeEarRound(r: EarRoundResult): string {
  if (r.interval.semitones === 0) {
    const root = midiToNoteClass(r.rootMidi, false);
    return r.correct ? `Root ${root} — correct` : `Root ${root} — missed`;
  }
  const dir = r.direction === 'ascending' ? '↑' : '↓';
  const expected = midiToNoteClass(r.expectedMidi, false);
  const root = midiToNoteClass(r.rootMidi, false);
  if (r.correct) {
    return `${r.interval.label} ${dir} from ${root} — correct (${expected})`;
  }
  const played = midiToNoteClass(r.playedMidi, false);
  return `${r.interval.label} ${dir} from ${root} — played ${played}, expected ${expected}`;
}
