// Pitch detection loop built on `pitchy` (McLeod Pitch Method).
// Emits "stable note" events when successive frames agree on the same MIDI note.

import { PitchDetector as Pitchy } from 'pitchy';
import { nearestMidi } from '../music/notes';
import type { MicStream } from './micInput';

export interface PitchFrame {
  frequency: number;
  clarity: number;
  midi: number;
  cents: number;
  rms: number;
}

export interface StableNoteEvent {
  midi: number;
  frequency: number;
  timestamp: number;
}

export interface PitchDetectorOptions {
  fftSize?: number;
  minClarity?: number;
  minRms?: number;
  stabilityFrames?: number;
  minFreq?: number;
  maxFreq?: number;
  onFrame?: (f: PitchFrame | null) => void;
  onStableNote?: (e: StableNoteEvent) => void;
}

export class PitchLoop {
  private analyser: AnalyserNode;
  private detector: Pitchy<Float32Array>;
  private buffer: Float32Array<ArrayBuffer>;
  private rafId: number | null = null;
  private consecutive: { midi: number; count: number } | null = null;
  private lastEmittedMidi: number | null = null;
  private running = false;
  private paused = false;

  constructor(private mic: MicStream, private opts: PitchDetectorOptions = {}) {
    const fftSize = opts.fftSize ?? 8192;
    this.analyser = mic.context.createAnalyser();
    this.analyser.fftSize = fftSize;
    this.analyser.smoothingTimeConstant = 0;
    mic.source.connect(this.analyser);
    this.buffer = new Float32Array(new ArrayBuffer(this.analyser.fftSize * 4));
    this.detector = Pitchy.forFloat32Array(this.analyser.fftSize);
    this.detector.minVolumeDecibels = -60;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.consecutive = null;
    this.lastEmittedMidi = null;
    const tick = () => {
      if (!this.running) return;
      if (!this.paused) this.processFrame();
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  stop() {
    this.running = false;
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.rafId = null;
    this.consecutive = null;
    this.lastEmittedMidi = null;
  }

  /** Stop processing frames without tearing down the audio graph. */
  pause() {
    this.paused = true;
    this.consecutive = null;
    this.lastEmittedMidi = null;
  }

  /** Resume processing. Clears any residual state so the next note is fresh. */
  resume() {
    this.paused = false;
    this.consecutive = null;
    this.lastEmittedMidi = null;
  }

  /** Allow the UI to read current RMS for a mic meter. */
  getRms(): number {
    this.analyser.getFloatTimeDomainData(this.buffer);
    return computeRms(this.buffer);
  }

  /** Reset the stable-note state so the next correct note is freshly emitted. */
  armForNextNote() {
    this.consecutive = null;
    this.lastEmittedMidi = null;
  }

  private processFrame() {
    const {
      minClarity = 0.9,
      minRms = 0.01,
      stabilityFrames = 3,
      minFreq = 25,
      maxFreq = 600,
      onFrame,
      onStableNote,
    } = this.opts;

    this.analyser.getFloatTimeDomainData(this.buffer);
    const rms = computeRms(this.buffer);

    if (rms < minRms) {
      this.consecutive = null;
      this.lastEmittedMidi = null;
      onFrame?.(null);
      return;
    }

    const [frequency, clarity] = this.detector.findPitch(
      this.buffer,
      this.mic.context.sampleRate
    );

    if (
      clarity < minClarity ||
      !isFinite(frequency) ||
      frequency < minFreq ||
      frequency > maxFreq
    ) {
      this.consecutive = null;
      onFrame?.(null);
      return;
    }

    const { midi, cents } = nearestMidi(frequency);
    const frame: PitchFrame = { frequency, clarity, midi, cents, rms };
    onFrame?.(frame);

    // Reject if far off a semitone center — implies unstable transient.
    if (Math.abs(cents) > 45) {
      this.consecutive = null;
      return;
    }

    if (this.consecutive && this.consecutive.midi === midi) {
      this.consecutive.count += 1;
    } else {
      this.consecutive = { midi, count: 1 };
    }

    if (
      this.consecutive.count >= stabilityFrames &&
      this.lastEmittedMidi !== midi
    ) {
      this.lastEmittedMidi = midi;
      onStableNote?.({ midi, frequency, timestamp: performance.now() });
    }
  }
}

function computeRms(buf: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
  return Math.sqrt(sum / buf.length);
}
