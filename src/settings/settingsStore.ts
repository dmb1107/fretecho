// User-configurable settings, persisted in localStorage.

import { create } from 'zustand';
import { instrumentOf, tuningsFor, type Instrument, type TuningId } from '../music/tunings';
import type { PromptStyle } from '../game/sessionEngine';
import { DEFAULT_ENABLED_CHORDS } from '../music/chords';
import { DEFAULT_ENABLED_INTERVALS } from '../music/intervals';

export type TrainingMode = 'notes' | 'chords' | 'ear';
export type IntervalDirection = 'ascending' | 'descending' | 'random';

export interface Settings {
  instrument: Instrument;
  tuning: TuningId;
  notesPerSession: number;
  allowAccidentals: boolean;
  promptStyle: PromptStyle;
  focusWeakSpots: boolean;
  minFret: number;
  maxFret: number;
  showHint: boolean;
  inputDeviceId: string | null;
  trainingMode: TrainingMode;
  chordsPerSession: number;
  enabledChordTypes: string[];
  // Ear training
  earIntervalDirection: IntervalDirection;
  enabledIntervals: string[];
  showEarRootHint: boolean;
  showEarIntervalHint: boolean;
}

/** Default max fret per instrument (min always starts at 0). */
export const DEFAULT_MAX_FRET: Record<Instrument, number> = {
  bass: 12,
  guitar: 15,
};

const DEFAULTS: Settings = {
  instrument: 'bass',
  tuning: '4-string',
  notesPerSession: 20,
  allowAccidentals: true,
  promptStyle: 'noteclass-and-string',
  focusWeakSpots: false,
  minFret: 0,
  maxFret: DEFAULT_MAX_FRET.bass,
  showHint: false,
  inputDeviceId: null,
  trainingMode: 'notes',
  chordsPerSession: 10,
  enabledChordTypes: [...DEFAULT_ENABLED_CHORDS],
  earIntervalDirection: 'random',
  enabledIntervals: [...DEFAULT_ENABLED_INTERVALS],
  showEarRootHint: false,
  showEarIntervalHint: false,
};

const STORAGE_KEY = 'fretecho:settings:v4';
const V3_KEY = 'fretecho:settings:v3';
const V2_KEY = 'fretecho:settings:v2';
const LEGACY_KEY = 'fretecho:settings:v1';

function load(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Settings>) };
    }
    // Migrate from v3 (no ear training settings).
    const v3 = localStorage.getItem(V3_KEY);
    if (v3) {
      const migrated = { ...DEFAULTS, ...(JSON.parse(v3) as Partial<Settings>) };
      persist(migrated);
      return migrated;
    }
    // Migrate from v2 (no chord settings).
    const v2 = localStorage.getItem(V2_KEY);
    if (v2) {
      const migrated = { ...DEFAULTS, ...(JSON.parse(v2) as Partial<Settings>) };
      persist(migrated);
      return migrated;
    }
    // Migrate from v1 (had `bass: '4-string' | '5-string'`).
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy) {
      const parsed = JSON.parse(legacy) as Partial<Settings> & { bass?: TuningId };
      const tuning: TuningId = parsed.bass ?? DEFAULTS.tuning;
      const migrated: Settings = {
        ...DEFAULTS,
        ...parsed,
        instrument: instrumentOf(tuning),
        tuning,
      };
      delete (migrated as unknown as { bass?: unknown }).bass;
      persist(migrated);
      return migrated;
    }
    return DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

interface SettingsState extends Settings {
  set: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  setInstrument: (instrument: Instrument) => void;
  reset: () => void;
}

export const useSettings = create<SettingsState>((set, get) => ({
  ...load(),
  set: (key, value) => {
    const next = { ...get(), [key]: value } as Settings;
    persist(next);
    set({ [key]: value } as Partial<SettingsState>);
  },
  setInstrument: (instrument) => {
    const current = get();
    if (current.instrument === instrument) return;

    // Pick the first tuning for the new instrument.
    const firstTuning = tuningsFor(instrument)[0].id;

    // Only auto-adjust max fret if the user is on the previous instrument's default.
    const prevDefault = DEFAULT_MAX_FRET[current.instrument];
    const maxFret =
      current.maxFret === prevDefault && current.minFret === 0
        ? DEFAULT_MAX_FRET[instrument]
        : current.maxFret;

    const next: Settings = { ...current, instrument, tuning: firstTuning, maxFret };
    persist(next);
    set({ instrument, tuning: firstTuning, maxFret });
  },
  reset: () => {
    persist(DEFAULTS);
    set(DEFAULTS);
  },
}));

function persist(s: Settings) {
  const {
    instrument,
    tuning,
    notesPerSession,
    allowAccidentals,
    promptStyle,
    focusWeakSpots,
    minFret,
    maxFret,
    showHint,
    inputDeviceId,
    trainingMode,
    chordsPerSession,
    enabledChordTypes,
    earIntervalDirection,
    enabledIntervals,
    showEarRootHint,
    showEarIntervalHint,
  } = s;
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      instrument,
      tuning,
      notesPerSession,
      allowAccidentals,
      promptStyle,
      focusWeakSpots,
      minFret,
      maxFret,
      showHint,
      inputDeviceId,
      trainingMode,
      chordsPerSession,
      enabledChordTypes,
      earIntervalDirection,
      enabledIntervals,
      showEarRootHint,
      showEarIntervalHint,
    })
  );
}
