// Synthesized bass-like tones for ear training prompts.
// Sawtooth oscillator through a low-pass filter with a pluck-like envelope.

import { midiToFreq } from '../music/notes';

let ctx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

let lastReferenceMidi: number | null = null;

/**
 * Play a bass-like tone at the given MIDI note.
 * @param midi  MIDI note number (e.g. 28 = E1)
 * @param durationMs  total duration in ms (default 800)
 */
export function playTone(midi: number, durationMs = 800): void {
  const c = getCtx();
  const freq = midiToFreq(midi);
  const t0 = c.currentTime;
  const dur = durationMs / 1000;

  // Sawtooth oscillator — harmonically rich like a bass string.
  const osc = c.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.value = freq;

  // Low-pass filter softens the harsh upper harmonics.
  const filter = c.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = Math.min(freq * 4, 1200);
  filter.Q.value = 1;

  // Gain envelope: pluck-like attack → decay → sustain → release.
  const gain = c.createGain();
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(0.55, t0 + 0.005);          // 5ms attack
  gain.gain.linearRampToValueAtTime(0.40, t0 + 0.055);          // 50ms decay to ~70%
  gain.gain.setValueAtTime(0.40, t0 + dur - 0.15);              // hold sustain
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);       // 150ms release

  osc.connect(filter).connect(gain).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

/** Play a reference tone and remember it for replay. */
export function playReference(midi: number, durationMs = 800): void {
  lastReferenceMidi = midi;
  playTone(midi, durationMs);
}

/** Replay the last reference tone. Returns true if there was one to replay. */
export function replayReference(): boolean {
  if (lastReferenceMidi === null) return false;
  playTone(lastReferenceMidi);
  return true;
}
