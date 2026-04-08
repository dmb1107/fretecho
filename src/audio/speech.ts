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

/** Pick a default voice that handles letter-name pronunciation well. */
export function pickDefaultVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  if (voices.length === 0) return null;
  const preferences: RegExp[] = [
    /Google US English$/i,
    /Google US English/i,
    /Google UK English Female/i,
    /Google UK English/i,
    /^Google/i,
    /Microsoft.*Aria/i,
    /Microsoft.*Jenny/i,
    /Microsoft.*Zira/i,
    /Microsoft.*David/i,
  ];
  for (const p of preferences) {
    const v = voices.find((v) => p.test(v.name));
    if (v) return v;
  }
  // Last resort: first English voice, avoiding obviously bad Apple voices for
  // single-letter pronunciation.
  const english = voices.filter((v) => v.lang.startsWith('en'));
  const nonApple = english.filter((v) => !/\b(Samantha|Alex|Fiona|Karen|Daniel|Moira|Tessa)\b/i.test(v.name));
  return nonApple[0] ?? english[0] ?? voices[0];
}

function findVoiceByName(voices: SpeechSynthesisVoice[], name: string | null): SpeechSynthesisVoice | null {
  if (!name) return null;
  return voices.find((v) => v.name === name) ?? null;
}

/** Pre-warm the synthesizer so the first real utterance isn't delayed. */
export function prewarmSpeech() {
  if (!speechSupported()) return;
  void getVoices();
  const u = new SpeechSynthesisUtterance(' ');
  u.volume = 0;
  window.speechSynthesis.speak(u);
}

export interface SpeakOptions {
  rate?: number;
  lang?: string;
  /** Voice name from `speechSynthesis.getVoices()`. If null/missing a default is picked. */
  voiceName?: string | null;
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
    u.onend = () => resolve();
    u.onerror = () => resolve();
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  });
}
