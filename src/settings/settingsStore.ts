// User-configurable settings, persisted in localStorage.

import { create } from 'zustand';
import type { BassType } from '../music/tunings';
import type { PromptStyle } from '../game/sessionEngine';

export interface Settings {
  bass: BassType;
  notesPerSession: number;
  allowAccidentals: boolean;
  promptStyle: PromptStyle;
  focusWeakSpots: boolean;
  minFret: number;
  maxFret: number;
  showHint: boolean;
  inputDeviceId: string | null;
}

const DEFAULTS: Settings = {
  bass: '4-string',
  notesPerSession: 20,
  allowAccidentals: false,
  promptStyle: 'note-and-string',
  focusWeakSpots: false,
  minFret: 0,
  maxFret: 12,
  showHint: true,
  inputDeviceId: null,
};

const STORAGE_KEY = 'fretecho:settings:v1';

function load(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    return DEFAULTS;
  }
}

interface SettingsState extends Settings {
  set: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  reset: () => void;
}

export const useSettings = create<SettingsState>((set, get) => ({
  ...load(),
  set: (key, value) => {
    const next = { ...get(), [key]: value };
    persist(next);
    set({ [key]: value } as Partial<SettingsState>);
  },
  reset: () => {
    persist(DEFAULTS);
    set(DEFAULTS);
  },
}));

function persist(s: Settings) {
  const { bass, notesPerSession, allowAccidentals, promptStyle, focusWeakSpots, minFret, maxFret, showHint, inputDeviceId } = s;
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ bass, notesPerSession, allowAccidentals, promptStyle, focusWeakSpots, minFret, maxFret, showHint, inputDeviceId })
  );
}
