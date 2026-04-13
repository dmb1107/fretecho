// Chord tone training screen: plays a chord name, user plays each tone in sequence.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useSettings, type TrainingMode } from '../settings/settingsStore';
import { useStatsStore } from '../stats/statsStore';
import { cancelSpeech } from '../audio/speech';
import { useMicStore, setOnStableNote } from '../audio/micStore';
import {
  ChordSessionEngine,
  type ChordEngineState,
  type ChordRoundResult,
  type ChordSessionConfig,
  describeChordRound,
} from '../game/chordSessionEngine';
import { noteAt } from '../music/tunings';
import { midiToNoteName } from '../music/notes';
import { Fretboard, type FretboardHighlight } from './Fretboard';
import { MicMeter } from './MicMeter';
import { FeedbackFlash, type FlashKind } from './FeedbackFlash';

export function ChordTrainingScreen() {
  const settings = useSettings();
  const record = useStatsStore((s) => s.record);
  const getStats = () => useStatsStore.getState().stats;
  const micStore = useMicStore();
  const detected = useMicStore((s) => s.detected);
  const micOpen = useMicStore((s) => s.open);

  const [engineState, setEngineState] = useState<ChordEngineState>({ kind: 'idle' });
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<FlashKind>(null);
  const [running, setRunning] = useState(false);
  const [correctCount, setCorrectCount] = useState(0);
  const lastCountedRoundRef = useRef<number>(0);

  const engineRef = useRef<ChordSessionEngine | null>(null);

  const cfg: ChordSessionConfig = useMemo(
    () => ({
      tuning: settings.tuning,
      enabledChordTypes: settings.enabledChordTypes,
      allowAccidentals: settings.allowAccidentals,
      minFret: settings.minFret,
      maxFret: settings.maxFret,
      focusWeakSpots: settings.focusWeakSpots,
      showHint: settings.showHint,
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
    const engine = new ChordSessionEngine(cfg, {
      pitchLoop: loop,
      getStats,
      recordStat: record,
      onStateChange: (s) => {
        setEngineState(s);
        if (s.kind === 'tone-feedback') {
          setFlash('success');
        } else if (s.kind === 'feedback') {
          setFlash(s.allCorrectFirstTry ? 'success' : 'error');
          if (s.round !== lastCountedRoundRef.current) {
            lastCountedRoundRef.current = s.round;
            if (s.allCorrectFirstTry) setCorrectCount((c) => c + 1);
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

  // Build fretboard highlights: show all positions matching the expected pitch class.
  const highlights = useMemo(() => {
    const m = new Map<string, FretboardHighlight>();
    if (engineState.kind !== 'listening' && engineState.kind !== 'tone-feedback') return m;

    const tuning = cfg.tuning;
    const numStrings = { '4-string': 4, '5-string': 5, '6-string': 6 }[tuning] ?? 4;

    if (engineState.kind === 'listening') {
      const { expectedPitchClass, recorded, completedTones } = engineState;

      // Show completed tones in dim green.
      for (const pc of completedTones) {
        for (let s = 0; s < numStrings; s++) {
          for (let f = cfg.minFret; f <= cfg.maxFret; f++) {
            if (noteAt(tuning, s, f) % 12 === pc) {
              m.set(`${s}:${f}`, { color: '#22c55e', ring: true, textColor: '#4ade80' });
            }
          }
        }
      }

      // Show current expected tone.
      if (recorded || settings.showHint) {
        const color = recorded ? '#ef4444' : '#ff6b35';
        for (let s = 0; s < numStrings; s++) {
          for (let f = cfg.minFret; f <= cfg.maxFret; f++) {
            if (noteAt(tuning, s, f) % 12 === expectedPitchClass) {
              m.set(`${s}:${f}`, { color, ring: !recorded });
            }
          }
        }
      }
    } else if (engineState.kind === 'tone-feedback') {
      // Flash completed tones green.
      const { completedTones } = engineState;
      for (const pc of completedTones) {
        for (let s = 0; s < numStrings; s++) {
          for (let f = cfg.minFret; f <= cfg.maxFret; f++) {
            if (noteAt(tuning, s, f) % 12 === pc) {
              m.set(`${s}:${f}`, { color: '#22c55e' });
            }
          }
        }
      }
    }
    return m;
  }, [engineState, settings.showHint, cfg.tuning, cfg.minFret, cfg.maxFret]);

  const useFlats =
    engineState.kind !== 'idle' && engineState.kind !== 'done' && 'chord' in engineState
      ? engineState.chord.useFlats
      : false;

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
        <ChordSessionSummary
          results={engineState.results}
          onDone={() => setEngineState({ kind: 'idle' })}
        />
      ) : (
        <>
          <ChordPromptDisplay state={engineState} />

          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => settings.set('showHint', !settings.showHint)}
              aria-pressed={settings.showHint}
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                settings.showHint
                  ? 'border-orange-500/60 bg-orange-500/15 text-orange-300 hover:bg-orange-500/20'
                  : 'border-neutral-700 bg-neutral-900 text-neutral-400 hover:bg-neutral-800'
              }`}
            >
              <span
                className={`inline-block h-2 w-2 rounded-full ${
                  settings.showHint ? 'bg-orange-400' : 'bg-neutral-600'
                }`}
              />
              {settings.showHint ? 'Hints: on' : 'Hints: off'}
            </button>
          </div>

          <div className="flex justify-center">
            <Fretboard
              tuning={cfg.tuning}
              minFret={cfg.minFret}
              maxFret={cfg.maxFret}
              highlights={highlights}
              useFlats={useFlats}
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
                    onClick={() => micStore.toggleMic(settings.inputDeviceId ?? undefined)}
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

function ChordPromptDisplay({ state }: { state: ChordEngineState }) {
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

  const { chord, displayName } = state;
  const toneCount = chord.chordType.intervals.length;

  let statusText: string;
  let toneLabel: string | null = null;
  let toneIndex = 0;
  let completedCount = 0;

  if (state.kind === 'prompting') {
    statusText = 'Prompting…';
  } else if (state.kind === 'listening') {
    statusText = state.recorded ? 'Try again' : 'Listening…';
    toneLabel = state.toneLabel;
    toneIndex = state.toneIndex;
    completedCount = state.completedTones.length;
  } else if (state.kind === 'tone-feedback') {
    statusText = 'Correct!';
    toneIndex = state.toneIndex;
    completedCount = state.completedTones.length;
  } else {
    // feedback
    statusText = state.allCorrectFirstTry ? 'All tones correct!' : 'Round complete';
    completedCount = toneCount;
  }

  return (
    <div className="flex flex-col items-center gap-1 sm:gap-2">
      <div className="text-xs sm:text-sm uppercase tracking-widest text-neutral-500">
        {statusText}
      </div>
      <div className="text-5xl sm:text-[100px] leading-none font-display font-bold text-brand drop-shadow">
        {displayName}
      </div>
      {toneLabel && (
        <div className="text-2xl sm:text-4xl font-bold text-neutral-100 mt-1">
          Play: {toneLabel}
        </div>
      )}
      <ToneDots total={toneCount} completed={completedCount} current={toneLabel ? toneIndex : -1} labels={chord.chordType.toneLabels} />
      {state.kind === 'listening' && state.lastWrongPitchClass !== undefined && (
        <div className="text-sm text-red-400">
          Wrong note — find the {state.toneLabel}
        </div>
      )}
    </div>
  );
}

function ToneDots({
  total,
  completed,
  current,
  labels,
}: {
  total: number;
  completed: number;
  current: number;
  labels: string[];
}) {
  return (
    <div className="flex items-center gap-2 mt-2">
      {Array.from({ length: total }).map((_, i) => {
        const isCompleted = i < completed;
        const isCurrent = i === current;
        return (
          <div key={i} className="flex flex-col items-center gap-1">
            <div
              className={`h-3 w-3 rounded-full transition-colors ${
                isCompleted
                  ? 'bg-green-500'
                  : isCurrent
                  ? 'bg-brand ring-2 ring-brand/50'
                  : 'bg-neutral-700'
              }`}
            />
            <span className="text-[10px] text-neutral-500">{labels[i]}</span>
          </div>
        );
      })}
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


function ChordSessionSummary({
  results,
  onDone,
}: {
  results: ChordRoundResult[];
  onDone: () => void;
}) {
  const total = results.length;
  const correct = results.filter((r) => r.allCorrectFirstTry).length;
  const totalTones = results.reduce((a, r) => a + r.tones.length, 0);
  const correctTones = results.reduce((a, r) => a + r.tones.filter((t) => t.correct).length, 0);
  const avgMs = totalTones > 0 ? results.reduce((a, r) => a + r.totalMs, 0) / totalTones : 0;
  const missed = results.filter((r) => !r.allCorrectFirstTry).slice(0, 5);

  return (
    <div className="flex flex-col items-center gap-6">
      <h2 className="text-2xl sm:text-3xl font-bold text-brand">Session complete</h2>
      <div className="flex gap-4 sm:gap-8 text-center">
        <StatBlock label="Chords" value={`${correct}/${total}`} />
        <StatBlock label="Tones" value={`${totalTones === 0 ? 0 : Math.round((correctTones / totalTones) * 100)}%`} />
        <StatBlock label="Avg time" value={`${(avgMs / 1000).toFixed(2)}s`} />
      </div>
      {missed.length > 0 && (
        <div className="w-full max-w-md">
          <div className="text-sm uppercase tracking-widest text-neutral-500 mb-2">Struggled with</div>
          <ul className="space-y-1">
            {missed.map((r, i) => (
              <li key={i} className="text-neutral-300 text-sm">
                {describeChordRound(r)}
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
    { value: 'ear', label: 'Intervals' },
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
