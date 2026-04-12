// Ear training screen: plays a reference tone + interval name,
// user plays the root note then the interval note.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useSettings, type TrainingMode } from '../settings/settingsStore';
import { useStatsStore } from '../stats/statsStore';
import { cancelSpeech } from '../audio/speech';
import { useMicStore, setOnStableNote } from '../audio/micStore';
import {
  EarSessionEngine,
  type EarEngineState,
  type EarRoundResult,
  type EarSessionConfig,
  describeEarRound,
} from '../game/earSessionEngine';
import { midiToNoteClass, midiToNoteName } from '../music/notes';
import { noteAt } from '../music/tunings';
import { Fretboard, type FretboardHighlight } from './Fretboard';
import { MicMeter } from './MicMeter';
import { FeedbackFlash, type FlashKind } from './FeedbackFlash';

export function EarTrainingScreen() {
  const settings = useSettings();
  const record = useStatsStore((s) => s.record);
  const getStats = () => useStatsStore.getState().stats;
  const micStore = useMicStore();
  const detected = useMicStore((s) => s.detected);
  const micOpen = useMicStore((s) => s.open);

  const [engineState, setEngineState] = useState<EarEngineState>({ kind: 'idle' });
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<FlashKind>(null);
  const [running, setRunning] = useState(false);
  const [correctCount, setCorrectCount] = useState(0);
  const lastCountedRoundRef = useRef<number>(0);

  const engineRef = useRef<EarSessionEngine | null>(null);

  const cfg: EarSessionConfig = useMemo(
    () => ({
      enabledIntervals: settings.enabledIntervals,
      direction: settings.earIntervalDirection,
    }),
    [settings]
  );

  useEffect(() => {
    setOnStableNote((e) => engineRef.current?.handleStableNote(e.midi));
    return () => setOnStableNote(null);
  }, []);

  const startSession = async () => {
    setError(null);
    setCorrectCount(0);
    lastCountedRoundRef.current = 0;
    const loop = micStore.loop;
    if (!loop) {
      setError('Microphone is not open');
      return;
    }
    const engine = new EarSessionEngine(cfg, {
      pitchLoop: loop,
      getStats,
      recordStat: record,
      onStateChange: (s) => {
        setEngineState(s);
        if (s.kind === 'done') {
          setRunning(false);
        } else if (s.kind === 'root-feedback') {
          setFlash('success');
        } else if (s.kind === 'feedback') {
          setFlash(s.result.correct ? 'success' : 'error');
          if (s.round !== lastCountedRoundRef.current) {
            lastCountedRoundRef.current = s.round;
            if (s.result.correct) setCorrectCount((c) => c + 1);
          }
        }
      },
    });
    engineRef.current = engine;
    setRunning(true);
    await engine.start();
  };

  const stopSession = () => {
    cancelSpeech();
    engineRef.current?.stop();
    engineRef.current = null;
    setRunning(false);
  };

  useEffect(() => {
    return () => {
      cancelSpeech();
      engineRef.current?.stop();
      engineRef.current = null;
    };
  }, []);

  // Build fretboard highlights based on hints and state.
  const highlights = useMemo(() => {
    const m = new Map<string, FretboardHighlight>();
    const tuning = settings.tuning;
    const numStrings = { '4-string': 4, '5-string': 5, '6-string': 6 }[tuning] ?? 4;

    const highlightPc = (pc: number, color: string, ring = false) => {
      for (let s = 0; s < numStrings; s++) {
        for (let f = settings.minFret; f <= settings.maxFret; f++) {
          if (noteAt(tuning, s, f) % 12 === pc) {
            m.set(`${s}:${f}`, { color, ring });
          }
        }
      }
    };

    if (engineState.kind === 'listening-root') {
      if (settings.showEarRootHint) {
        const rootPc = ((engineState.rootMidi % 12) + 12) % 12;
        highlightPc(rootPc, '#ff6b35', true);
      }
    } else if (engineState.kind === 'root-feedback') {
      const rootPc = ((engineState.rootMidi % 12) + 12) % 12;
      highlightPc(rootPc, '#22c55e');
    } else if (engineState.kind === 'listening-interval') {
      // Show root as completed (dim green).
      const rootPc = ((engineState.rootMidi % 12) + 12) % 12;
      highlightPc(rootPc, '#22c55e');
      // Show interval hint if enabled.
      if (settings.showEarIntervalHint) {
        const expectedPc = ((engineState.expectedMidi % 12) + 12) % 12;
        highlightPc(expectedPc, '#ff6b35', true);
      }
    } else if (engineState.kind === 'feedback' && engineState.result.correct) {
      const rootPc = ((engineState.result.rootMidi % 12) + 12) % 12;
      highlightPc(rootPc, '#22c55e');
      const expectedPc = ((engineState.result.expectedMidi % 12) + 12) % 12;
      highlightPc(expectedPc, '#22c55e');
    }

    return m;
  }, [engineState, settings.tuning, settings.minFret, settings.maxFret, settings.showEarRootHint, settings.showEarIntervalHint]);

  const roundNum = 'round' in engineState ? engineState.round : 0;

  return (
    <div className="flex flex-col gap-3 p-3 sm:gap-6 sm:p-6 max-w-5xl mx-auto">
      <FeedbackFlash kind={flash} />

      {engineState.kind === 'idle' && <ModeToggle />}

      {error && (
        <div className="rounded bg-red-900/40 border border-red-700 px-4 py-2 text-red-200">
          {error}
        </div>
      )}

      {engineState.kind === 'done' ? (
        <EarSessionSummary
          results={engineState.results}
          onDone={() => {
            setRunning(false);
            setEngineState({ kind: 'idle' });
          }}
        />
      ) : (
        <>
          <EarPromptDisplay
            state={engineState}
            showRootHint={settings.showEarRootHint}
            showIntervalHint={settings.showEarIntervalHint}
            onReplay={() => engineRef.current?.replay()}
          />

          <HintToggles />

          <div className="flex justify-center">
            <Fretboard
              tuning={settings.tuning}
              minFret={settings.minFret}
              maxFret={settings.maxFret}
              highlights={highlights}
              useFlats={false}
            />
          </div>

          <DetectedCard detected={detected} micOpen={micOpen} />

          <div className="flex flex-col gap-2 sm:gap-3">
            {running && (
              <div className="flex items-center gap-4 text-xs sm:text-sm text-neutral-400">
                <div>Round {roundNum}</div>
                <div>{correctCount} correct</div>
              </div>
            )}

            <div className="flex items-center justify-between">
              <MicMeter pitchLoop={micStore.loop} />
              <div className="flex gap-2">
                {!running && (
                  <button
                    onClick={() => micStore.toggleMic()}
                    className={`px-4 py-2 rounded text-sm ${
                      micOpen
                        ? 'bg-neutral-800 hover:bg-neutral-700'
                        : 'bg-red-900/60 hover:bg-red-900/80 text-red-300'
                    }`}
                  >
                    {micOpen ? 'Mic on' : 'Mic off'}
                  </button>
                )}
                {!running ? (
                  <button
                    onClick={startSession}
                    className="px-5 py-2 rounded bg-brand hover:bg-brand-dim font-semibold text-black"
                  >
                    Start session
                  </button>
                ) : (
                  <button
                    onClick={stopSession}
                    className="px-5 py-2 rounded bg-neutral-800 hover:bg-neutral-700"
                  >
                    End session
                  </button>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function HintToggles() {
  const settings = useSettings();
  return (
    <div className="flex justify-end gap-2">
      <HintToggle
        label="Root hint"
        active={settings.showEarRootHint}
        onToggle={() => settings.set('showEarRootHint', !settings.showEarRootHint)}
      />
      <HintToggle
        label="Interval hint"
        active={settings.showEarIntervalHint}
        onToggle={() => settings.set('showEarIntervalHint', !settings.showEarIntervalHint)}
      />
    </div>
  );
}

function HintToggle({ label, active, onToggle }: { label: string; active: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={active}
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
        active
          ? 'border-orange-500/60 bg-orange-500/15 text-orange-300 hover:bg-orange-500/20'
          : 'border-neutral-700 bg-neutral-900 text-neutral-400 hover:bg-neutral-800'
      }`}
    >
      <span
        className={`inline-block h-2 w-2 rounded-full ${
          active ? 'bg-orange-400' : 'bg-neutral-600'
        }`}
      />
      {label}: {active ? 'on' : 'off'}
    </button>
  );
}

function EarPromptDisplay({
  state,
  showRootHint,
  showIntervalHint,
  onReplay,
}: {
  state: EarEngineState;
  showRootHint: boolean;
  showIntervalHint: boolean;
  onReplay: () => void;
}) {
  if (state.kind === 'idle') {
    return (
      <div className="flex flex-col items-center gap-1 sm:gap-2">
        <div className="text-xs sm:text-sm uppercase tracking-widest text-neutral-500">Ready</div>
        <div className="text-7xl sm:text-[140px] leading-none font-display font-bold text-brand drop-shadow">
          —
        </div>
      </div>
    );
  }

  if (state.kind === 'done') return null;

  const interval = 'interval' in state ? state.interval : state.kind === 'feedback' ? state.result.interval : null;
  const rootMidi = 'rootMidi' in state ? state.rootMidi : state.kind === 'feedback' ? state.result.rootMidi : null;
  const expectedMidi = 'expectedMidi' in state ? state.expectedMidi : state.kind === 'feedback' ? state.result.expectedMidi : null;
  const direction = 'direction' in state ? state.direction : state.kind === 'feedback' ? state.result.direction : null;
  const isRoot = interval !== null && interval.semitones === 0;

  let statusText: string;
  let phase: 'prompting' | 'root' | 'root-ok' | 'interval' | 'done';
  if (state.kind === 'prompting') {
    statusText = 'Listen…';
    phase = 'prompting';
  } else if (state.kind === 'listening-root') {
    statusText = isRoot
      ? (state.lastWrongMidi !== undefined ? 'Try again' : 'Play the note')
      : (state.lastWrongMidi !== undefined ? 'Try again — play the root' : 'Play the root');
    phase = 'root';
  } else if (state.kind === 'root-feedback') {
    statusText = 'Root correct — now play the interval';
    phase = 'root-ok';
  } else if (state.kind === 'listening-interval') {
    statusText = state.recorded ? 'Try again' : 'Play the interval';
    phase = 'interval';
  } else {
    statusText = state.result.correct ? 'Correct!' : 'Wrong';
    phase = 'done';
  }

  const dirArrow = direction === 'ascending' ? '↑' : '↓';
  const rootName = rootMidi !== null ? midiToNoteClass(rootMidi, false) : '';
  const intervalNoteName = expectedMidi !== null ? midiToNoteClass(expectedMidi as number, false) : '';

  // Determine what to show in the large display area.
  let largeText: string;
  let subtitleText: string | null = null;

  if (isRoot) {
    // Root-only: just show "Root" or the hint note name.
    if (phase === 'root') {
      largeText = showRootHint ? rootName : '?';
      subtitleText = 'Match the note';
    } else if (phase === 'done' && state.kind === 'feedback') {
      largeText = rootName;
      subtitleText = null;
    } else {
      largeText = 'R';
      subtitleText = null;
    }
  } else if (phase === 'root') {
    largeText = showRootHint ? rootName : '?';
    subtitleText = `${interval?.label} ${dirArrow}`;
  } else if (phase === 'root-ok') {
    largeText = interval?.shortLabel ?? '—';
    subtitleText = `${interval?.label} ${dirArrow} from ${rootName}`;
  } else if (phase === 'interval') {
    largeText = showIntervalHint ? intervalNoteName : interval?.shortLabel ?? '—';
    subtitleText = `${interval?.label} ${dirArrow} from ${rootName}`;
  } else if (phase === 'done' && state.kind === 'feedback') {
    largeText = interval?.shortLabel ?? '—';
    subtitleText = `${interval?.label} ${dirArrow} from ${rootName}`;
  } else {
    // prompting phase
    largeText = interval?.shortLabel ?? '—';
    subtitleText = interval ? `${interval.label} ${dirArrow}` : null;
  }

  // Show a direction arrow after a wrong attempt — shortest chromatic distance, octave-agnostic.
  let wrongArrow: string | null = null;
  if (state.kind === 'listening-interval' && state.lastWrongMidi !== undefined) {
    const targetPc = ((state.expectedMidi % 12) + 12) % 12;
    const playedPc = ((state.lastWrongMidi % 12) + 12) % 12;
    const up = ((targetPc - playedPc) + 12) % 12;
    const down = ((playedPc - targetPc) + 12) % 12;
    if (up !== 0) wrongArrow = up <= down ? '↑' : '↓';
  } else if (state.kind === 'listening-root' && state.lastWrongMidi !== undefined) {
    const targetPc = ((state.rootMidi % 12) + 12) % 12;
    const playedPc = ((state.lastWrongMidi % 12) + 12) % 12;
    const up = ((targetPc - playedPc) + 12) % 12;
    const down = ((playedPc - targetPc) + 12) % 12;
    if (up !== 0) wrongArrow = up <= down ? '↑' : '↓';
  }

  return (
    <div className="flex flex-col items-center gap-1 sm:gap-2">
      <div className="text-xs sm:text-sm uppercase tracking-widest text-neutral-500">
        {statusText}
      </div>
      <div className="flex items-center gap-2 sm:gap-4">
        <div className="text-5xl sm:text-[100px] leading-none font-display font-bold text-brand drop-shadow">
          {largeText}
        </div>
        {wrongArrow && (
          <div className="text-4xl sm:text-7xl font-bold text-red-400 animate-pulse">
            {wrongArrow}
          </div>
        )}
      </div>
      {subtitleText && (
        <div className="text-base sm:text-xl text-neutral-300">
          {subtitleText}
        </div>
      )}
      {/* Phase dots: root → interval (only for non-root intervals) */}
      {!isRoot && phase !== 'prompting' && (
        <div className="flex items-center gap-2 mt-1">
          <div className="flex flex-col items-center gap-1">
            <div
              className={`h-3 w-3 rounded-full transition-colors ${
                phase === 'root'
                  ? 'bg-brand ring-2 ring-brand/50'
                  : 'bg-green-500'
              }`}
            />
            <span className="text-[10px] text-neutral-500">Root</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <div
              className={`h-3 w-3 rounded-full transition-colors ${
                phase === 'interval'
                  ? 'bg-brand ring-2 ring-brand/50'
                  : phase === 'done'
                  ? 'bg-green-500'
                  : 'bg-neutral-700'
              }`}
            />
            <span className="text-[10px] text-neutral-500">Interval</span>
          </div>
        </div>
      )}
      {state.kind === 'feedback' && !isRoot && (
        <div className="text-sm text-neutral-400">
          Expected {midiToNoteClass(state.result.expectedMidi, false)} — you played{' '}
          {midiToNoteClass(state.result.playedMidi, false)}{' '}
          {state.result.correct ? '✓' : '✗'} in {(state.result.ms / 1000).toFixed(2)}s
        </div>
      )}
      {state.kind === 'feedback' && isRoot && (
        <div className="text-sm text-neutral-400">
          {state.result.correct ? '✓' : '✗'} in {(state.result.ms / 1000).toFixed(2)}s
        </div>
      )}
      {(state.kind === 'listening-root' || state.kind === 'prompting') && (
        <button
          onClick={onReplay}
          className="mt-2 px-3 py-1.5 rounded-full border border-neutral-700 bg-neutral-900 text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 text-xs font-medium transition-colors"
        >
          ▶ Replay reference
        </button>
      )}
    </div>
  );
}

function DetectedCard({
  detected,
  micOpen,
}: {
  detected: { midi: number; frequency: number; cents: number } | null;
  micOpen: boolean;
}) {
  const name = detected ? midiToNoteName(detected.midi, false) : null;
  const freq = detected ? `${detected.frequency.toFixed(1)} Hz` : '—';
  const cents = detected ? `${detected.cents >= 0 ? '+' : ''}${detected.cents.toFixed(0)} ¢` : '—';
  return (
    <div className="rounded border border-neutral-800 bg-neutral-900/40 px-3 py-2 sm:px-4 sm:py-3">
      <div className="flex items-center justify-between gap-4">
        <div className="text-xs uppercase tracking-widest text-neutral-500">Detected</div>
        {!micOpen && <div className="text-xs text-neutral-500">Mic is off</div>}
      </div>
      <div className="flex items-baseline gap-3 sm:gap-6 mt-1">
        <div className="text-3xl sm:text-5xl font-bold text-neutral-100 min-w-[4ch]">{name ?? '—'}</div>
        <div className="flex flex-col text-xs text-neutral-400">
          <span>{freq}</span>
          <span>{cents}</span>
        </div>
      </div>
    </div>
  );
}


function EarSessionSummary({
  results,
  onDone,
}: {
  results: EarRoundResult[];
  onDone: () => void;
}) {
  const total = results.length;
  const correct = results.filter((r) => r.correct).length;
  const avgMs = total > 0 ? results.reduce((a, b) => a + b.ms, 0) / total : 0;
  const wrong = results.filter((r) => !r.correct).slice(0, 5);

  return (
    <div className="flex flex-col items-center gap-6">
      <h2 className="text-2xl sm:text-3xl font-bold text-brand">Session complete</h2>
      <div className="flex gap-4 sm:gap-8 text-center">
        <StatBlock label="Accuracy" value={`${total === 0 ? 0 : Math.round((correct / total) * 100)}%`} />
        <StatBlock label="Avg time" value={`${(avgMs / 1000).toFixed(2)}s`} />
        <StatBlock label="Intervals" value={`${correct}/${total}`} />
      </div>
      {wrong.length > 0 && (
        <div className="w-full max-w-md">
          <div className="text-sm uppercase tracking-widest text-neutral-500 mb-2">Missed</div>
          <ul className="space-y-1">
            {wrong.map((r, i) => (
              <li key={i} className="text-neutral-300 text-sm">
                {describeEarRound(r)}
              </li>
            ))}
          </ul>
        </div>
      )}
      <button
        onClick={onDone}
        className="px-5 py-2 rounded bg-brand hover:bg-brand-dim font-semibold text-black"
      >
        Done
      </button>
    </div>
  );
}

function StatBlock({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-2xl sm:text-4xl font-bold">{value}</div>
      <div className="text-xs uppercase tracking-widest text-neutral-500 mt-1">{label}</div>
    </div>
  );
}

function ModeToggle() {
  const settings = useSettings();
  const modes: { value: TrainingMode; label: string }[] = [
    { value: 'notes', label: 'Notes' },
    { value: 'chords', label: 'Chord Tones' },
    { value: 'ear', label: 'Ear Training' },
  ];
  return (
    <div className="flex justify-center">
      <div className="inline-flex rounded-full border border-neutral-700 bg-neutral-900 p-0.5">
        {modes.map((m) => (
          <button
            key={m.value}
            onClick={() => settings.set('trainingMode', m.value)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
              settings.trainingMode === m.value
                ? 'bg-brand text-black'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>
    </div>
  );
}
