// Thin wrapper around Web Speech API SpeechSynthesis with voice selection.
// macOS Apple voices frequently mispronounce single letters (reading "A" as
// the indefinite article "a" instead of the letter name). Where possible we
// prefer Google / Microsoft network voices which handle letter names
// correctly, and we expose a voice picker in Settings for manual override.

export function speechSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

let cachedVoices: SpeechSynthesisVoice[] = [];
let voicesReadyPromise: Promise<SpeechSynthesisVoice[]> | null = null;

/** Get all available voices, waiting for the voiceschanged event if needed. */
export function getVoices(): Promise<SpeechSynthesisVoice[]> {
  if (!speechSupported()) return Promise.resolve([]);
  if (cachedVoices.length > 0) return Promise.resolve(cachedVoices);
  if (voicesReadyPromise) return voicesReadyPromise;
  voicesReadyPromise = new Promise((resolve) => {
    const populate = () => {
      cachedVoices = window.speechSynthesis.getVoices();
      if (cachedVoices.length > 0) resolve(cachedVoices);
    };
    populate();
    if (cachedVoices.length === 0) {
      window.speechSynthesis.onvoiceschanged = () => {
        populate();
      };
      // Fallback: resolve after a short delay even if no event fires.
      setTimeout(() => {
        cachedVoices = window.speechSynthesis.getVoices();
        resolve(cachedVoices);
      }, 500);
    }
  });
  return voicesReadyPromise;
}

// macOS ships a pile of "novelty" voices (Zarvox, Bahh, Trinoids, Cellos,
// Whisper, Bells, Bubbles, etc.) that are useless for training. Browsers
// expose them in the same list as the real speech voices, so we explicitly
// reject them in fallback selection.
const NOVELTY_VOICE_PATTERN =
  /\b(Albert|Bad News|Bahh|Bells|Boing|Bubbles|Cellos|Deranged|Good News|Hysterical|Jester|Organ|Pipe Organ|Trinoids|Whisper|Zarvox|Junior|Ralph|Kathy|Princess|Superstar|Wobble)\b/i;

/** Pick a default voice that sounds reasonable and handles letter names. */
export function pickDefaultVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  if (voices.length === 0) return null;

  // 1. Preferred: Chrome/Edge's Google and Microsoft English voices — these
  //    are the highest quality and handle letter names correctly.
  const preferences: RegExp[] = [
    /Google US English$/i,
    /Google US English/i,
    /Google UK English Female/i,
    /Google UK English/i,
    /^Google.*English/i,
    /Microsoft.*Aria/i,
    /Microsoft.*Jenny/i,
    /Microsoft.*Zira/i,
    /Microsoft.*David/i,
  ];
  for (const p of preferences) {
    const v = voices.find((v) => p.test(v.name));
    if (v) return v;
  }

  // 2. Fallback (e.g. Firefox / Safari where only OS voices are exposed):
  //    prefer the standard macOS English voices in quality order. The
  //    "A." phonetic hack in sessionEngine handles letter pronunciation, so
  //    these are fine for our prompts.
  const applePreferences: RegExp[] = [
    /^Samantha/i,
    /^Alex/i,
    /^Victoria/i,
    /^Daniel/i,
    /^Karen/i,
    /^Moira/i,
    /^Tessa/i,
    /^Fiona/i,
    /^Fred/i,
  ];
  for (const p of applePreferences) {
    const v = voices.find((v) => p.test(v.name));
    if (v) return v;
  }

  // 3. Last resort: any English voice that isn't one of the novelty voices.
  const english = voices.filter((v) => v.lang.startsWith('en'));
  const usable = english.filter((v) => !NOVELTY_VOICE_PATTERN.test(v.name));
  return usable[0] ?? english[0] ?? voices[0];
}

function findVoiceByName(voices: SpeechSynthesisVoice[], name: string | null): SpeechSynthesisVoice | null {
  if (!name) return null;
  return voices.find((v) => v.name === name) ?? null;
}

/**
 * Pre-warm the voice list so the first real `speak()` call doesn't pay the
 * cost of waiting for `voiceschanged`. We used to also queue a silent
 * utterance here, but Chrome has a well-known bug where calling
 * `cancel()` immediately before `speak()` drops the new utterance — and
 * that's exactly the pattern that happens when the first prompt comes in.
 */
export function prewarmSpeech() {
  if (!speechSupported()) return;
  void getVoices();
}

export interface SpeakOptions {
  rate?: number;
  lang?: string;
  /** Voice name from `speechSynthesis.getVoices()`. If null/missing a default is picked. */
  voiceName?: string | null;
}

/**
 * Cancel any in-flight speech. Safe to call anywhere; we use it when ending
 * a session or unmounting the training screen so the engine's awaited
 * `speak()` promise doesn't get stranded if Chrome's `SpeechSynthesis`
 * global gets stuck mid-utterance.
 */
export function cancelSpeech() {
  if (!speechSupported()) return;
  try {
    window.speechSynthesis.cancel();
  } catch {
    /* ignore */
  }
}

export async function speak(text: string, opts: SpeakOptions = {}): Promise<void> {
  if (!speechSupported()) return;
  const voices = await getVoices();
  const chosen =
    findVoiceByName(voices, opts.voiceName ?? null) ?? pickDefaultVoice(voices);
  return new Promise((resolve) => {
    const u = new SpeechSynthesisUtterance(text);
    u.rate = opts.rate ?? 0.9;
    u.pitch = 1;
    u.lang = opts.lang ?? (chosen?.lang ?? 'en-US');
    if (chosen) u.voice = chosen;

    // Chrome occasionally fails to fire onend/onerror after a cancel() — if
    // that happens the promise hangs forever and the session engine gets
    // stuck. Budget a safety timeout proportional to the utterance length
    // (roughly 120 ms per character + 1 s overhead) so we always make
    // forward progress.
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      clearTimeout(safetyTimer);
      resolve();
    };
    const safetyMs = Math.max(2000, text.length * 120 + 1000);
    const safetyTimer = setTimeout(done, safetyMs);

    u.onend = done;
    u.onerror = done;
    try {
      // Only cancel if something is actually queued. Calling cancel()
      // immediately before speak() in the same tick is a Chrome footgun
      // that silently drops the new utterance.
      const synth = window.speechSynthesis;
      if (synth.speaking || synth.pending) synth.cancel();
      synth.speak(u);
    } catch {
      done();
    }
  });
}
