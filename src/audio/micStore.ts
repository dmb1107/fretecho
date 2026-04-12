// Shared microphone state — survives screen switches.

import { create } from 'zustand';
import { openMic, type MicStream } from './micInput';
import { PitchLoop, type PitchFrame, type StableNoteEvent } from './pitchDetector';

interface MicState {
  mic: MicStream | null;
  loop: PitchLoop | null;
  open: boolean;
  detected: { midi: number; frequency: number; cents: number } | null;
}

interface MicStore extends MicState {
  /** Open the mic and start the pitch loop. No-op if already open. */
  openMic: (deviceId?: string) => Promise<void>;
  /** Close the mic and stop the pitch loop. */
  closeMic: () => void;
  /** Toggle mic on/off. */
  toggleMic: (deviceId?: string) => Promise<void>;
}

// Mutable callback refs — screens set these to route events.
let onStableNoteRef: ((e: StableNoteEvent) => void) | null = null;
let onFrameRef: ((f: PitchFrame | null) => void) | null = null;

export function setOnStableNote(fn: ((e: StableNoteEvent) => void) | null) {
  onStableNoteRef = fn;
}

export function setOnFrame(fn: ((f: PitchFrame | null) => void) | null) {
  onFrameRef = fn;
}

export const useMicStore = create<MicStore>((set, get) => ({
  mic: null,
  loop: null,
  open: false,
  detected: null,

  openMic: async (deviceId?: string) => {
    if (get().open) return;
    const mic = await openMic(deviceId);
    const loop = new PitchLoop(mic, {
      onStableNote: (e) => onStableNoteRef?.(e),
      onFrame: (f) => {
        onFrameRef?.(f);
        set({
          detected: f ? { midi: f.midi, frequency: f.frequency, cents: f.cents } : null,
        });
      },
    });
    loop.start();
    set({ mic, loop, open: true });
  },

  closeMic: () => {
    const { loop, mic } = get();
    loop?.stop();
    mic?.stop();
    set({ mic: null, loop: null, open: false, detected: null });
  },

  toggleMic: async (deviceId?: string) => {
    if (get().open) {
      get().closeMic();
    } else {
      await get().openMic(deviceId);
    }
  },
}));
