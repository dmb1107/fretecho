// Short success/error tones synthesized with WebAudio. A dedicated context is
// fine here — separate from the mic context.

let ctx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

function blip(freq: number, startOffset: number, duration: number, type: OscillatorType = 'sine', gain = 0.15) {
  const c = getCtx();
  const t0 = c.currentTime + startOffset;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  g.gain.value = 0;
  g.gain.linearRampToValueAtTime(gain, t0 + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(g).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.02);
}

export function playSuccess() {
  blip(659.25, 0, 0.12, 'sine', 0.18);    // E5
  blip(987.77, 0.09, 0.16, 'sine', 0.18); // B5
}

export function playError() {
  blip(220, 0, 0.18, 'square', 0.1);   // A3
  blip(155.56, 0.08, 0.22, 'square', 0.1); // D#3
}
