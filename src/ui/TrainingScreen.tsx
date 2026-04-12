// Training screen: runs a session, displays prompt + fretboard + progress.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useSettings, type TrainingMode } from '../settings/settingsStore';
import { useStatsStore } from '../stats/statsStore';
import { cancelSpeech } from '../audio/speech';
import { useMicStore, setOnStableNote } from '../audio/micStore';
import {
  SessionEngine,
  type EngineState,
  type RoundResult,
  type SessionConfig,
  describeRound,
} from '../game/sessionEngine';
import { Fretboard, type FretboardHighlight } from './Fretboard';
import { MicMeter } from './MicMeter';
import { FeedbackFlash, type FlashKind } from './FeedbackFlash';
import { midiToNoteClass, midiToNoteName } from '../music/notes';
import { ChordTrainingScreen } from './ChordTrainingScreen';
import { EarTrainingScreen } from './EarTrainingScreen';

export function TrainingScreen() {
  const settings = useSettings();
  const micStore = useMicStore();

  // Auto-open mic once at the top level (survives mode switches).
  useEffect(() => {
    if (!micStore.open) {
      micStore.openMic(settings.inputDeviceId ?? undefined).catch(() => {});
    }
  }, []);

  if (settings.trainingMode === 'chords') {
    return <ChordTrainingScreen />;
  }
  if (settings.trainingMode === 'ear') {
    return <EarTrainingScreen />;
  }

  return <NoteTrainingScreen />;
}

function NoteTrainingScreen() {
  const settings = useSettings();
  const record = useStatsStore((s) => s.record);
  const getStats = () => useStatsStore.getState().stats;
  const micStore = useMicStore();
  const detected = useMicStore((s) => s.detected);
  const micOpen = useMicStore((s) => s.open);

  const [engineState, setEngineState] = useState<EngineState>({ kind: 'idle' });
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<FlashKind>(null);
  const [running, setRunning] = useState(false);
  const [correctCount, setCorrectCount] = useState(0);
  const lastCountedRoundRef = useRef<number>(0);

  const engineRef = useRef<SessionEngine | null>(null);

  const cfg: SessionConfig = useMemo(
    () => ({
      tuning: settings.tuning,
      allowAccidentals: settings.allowAccidentals,
      promptStyle: settings.promptStyle,
      focusWeakSpots: settings.focusWeakSpots,
      minFret: settings.minFret,
      maxFret: settings.maxFret,
    }),
    [settings]
  );

  // Wire up onStableNote to route to the engine.
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
    const engine = new SessionEngine(cfg, {
      pitchLoop: loop,
      getStats,
      recordStat: record,
      onStateChange: (s) => {
        setEngineState(s);
        if (s.kind === 'feedback') {
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

  // String to highlight on the fretboard: always reveal the target string
  // regardless of the hint setting. In "note-only" mode the player can play
  // the note on *any* string, so we don't pin them to a specific one.
  const highlightedString =
    cfg.promptStyle === 'note-only'
      ? undefined
      : engineState.kind === 'prompting' || engineState.kind === 'listening'
      ? engineState.target.stringIndex
      : engineState.kind === 'feedback'
      ? engineState.result.position.stringIndex
      : undefined;

  // Build fretboard highlights based on state.
  const highlights = useMemo(() => {
    const m = new Map<string, FretboardHighlight>();
    if (engineState.kind === 'prompting') {
      if (!settings.showHint) return m;
      const { target } = engineState;
      m.set(`${target.stringIndex}:${target.fret}`, { color: '#ff6b35', ring: true });
    } else if (engineState.kind === 'listening') {
      const { target, recorded } = engineState;
      // After a wrong first attempt, reveal the target in red regardless of
      // the hint setting so the player sees where they should have played.
      if (recorded) {
        m.set(`${target.stringIndex}:${target.fret}`, { color: '#ef4444' });
      } else if (settings.showHint) {
        m.set(`${target.stringIndex}:${target.fret}`, { color: '#ff6b35', ring: true });
      }
    } else if (engineState.kind === 'feedback') {
      const { result } = engineState;
      m.set(`${result.position.stringIndex}:${result.position.fret}`, {
        color: result.correct ? '#22c55e' : '#ef4444',
      });
    }
    return m;
  }, [engineState, settings.showHint]);

  const roundNum = 'round' in engineState ? engineState.round : 0;
  const currentText =
    engineState.kind === 'prompting' || engineState.kind === 'listening'
      ? engineState.text
      : engineState.kind === 'feedback'
      ? describeRound(cfg.tuning, engineState.result, engineState.result.useFlats)
      : null;

  const currentNoteLarge =
    engineState.kind === 'prompting' || engineState.kind === 'listening'
      ? midiToNoteClass(engineState.expectedMidi, engineState.useFlats)
      : engineState.kind === 'feedback'
      ? midiToNoteClass(engineState.result.expectedMidi, engineState.result.useFlats)
      : '—';

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
        <SessionSummary results={engineState.results} tuning={cfg.tuning} onDone={() => setEngineState({ kind: 'idle' })} />
      ) : (
        <>
          <div className="flex flex-col items-center gap-1 sm:gap-2">
            <div className="text-xs sm:text-sm uppercase tracking-widest text-neutral-500">
              {engineState.kind === 'idle'
                ? 'Ready'
                : engineState.kind === 'prompting'
                ? 'Prompting…'
                : engineState.kind === 'listening'
                ? engineState.recorded
                  ? 'Try again'
                  : 'Listening…'
                : 'Feedback'}
            </div>
            <div className="text-7xl sm:text-[140px] leading-none font-display font-bold text-brand drop-shadow">
              {currentNoteLarge}
            </div>
            {currentText && (
              <div className="text-base sm:text-xl text-neutral-300">{currentText}</div>
            )}
            {engineState.kind === 'listening' && engineState.lastWrongMidi !== undefined && (
              <div className="text-sm text-red-400">
                You played {midiToNoteName(engineState.lastWrongMidi, engineState.useFlats)} — find the correct position
              </div>
            )}
            {engineState.kind === 'feedback' && (
              <div className="text-sm text-neutral-400">
                You played{' '}
                {midiToNoteName(engineState.result.playedMidi, engineState.result.useFlats)} —{' '}
                {engineState.result.correct ? '✓ correct' : '✗ wrong'} in{' '}
                {(engineState.result.ms / 1000).toFixed(2)}s
              </div>
            )}
          </div>

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
              highlightedString={highlightedString}
              useFlats={
                engineState.kind === 'prompting' || engineState.kind === 'listening'
                  ? engineState.useFlats
                  : engineState.kind === 'feedback'
                  ? engineState.result.useFlats
                  : false
              }
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


function SessionSummary({
  results,
  tuning,
  onDone,
}: {
  results: RoundResult[];
  tuning: import('../music/tunings').TuningId;
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
        <Stat label="Accuracy" value={`${total === 0 ? 0 : Math.round((correct / total) * 100)}%`} />
        <Stat label="Avg time" value={`${(avgMs / 1000).toFixed(2)}s`} />
        <Stat label="Notes" value={`${correct}/${total}`} />
      </div>
      {wrong.length > 0 && (
        <div className="w-full max-w-md">
          <div className="text-sm uppercase tracking-widest text-neutral-500 mb-2">Missed</div>
          <ul className="space-y-1">
            {wrong.map((r, i) => (
              <li key={i} className="text-neutral-300 text-sm">
                {describeRound(tuning, r, r.useFlats)}
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

function Stat({ label, value }: { label: string; value: string }) {
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
