# FretEcho

**A call-and-response bass & guitar fretboard trainer that lives in your browser.**

FretEcho speaks a random note, you play it, and your microphone decides whether
you got it right. It keeps score of every position on the neck so you can see
exactly where your muscle memory is thin — and it weights future rounds toward
those weak spots.

No account, no install, no backend. Open the page, plug in your instrument, and
start drilling.

---

## Features

### Note Training
- **Spoken call-and-response.** A synthesized voice prompts a note and string
  (e.g. *"C on the A string"*) and listens via your mic for your answer.
- **Real pitch detection** — uses the McLeod Pitch Method
  ([`pitchy`](https://github.com/ianprime0509/pitchy)) against the Web Audio
  API's analyser node. Works down to low B on a 5-string bass.
- **Note-name validation.** Any octave of the target note counts as correct,
  so octave-doubling quirks on low strings don't cheat you out of points.
- **Keeps listening on a miss.** Wrong answer? The engine stays on the same
  round, reveals the correct position, and waits for you to find it.

### Chord Tone Training
- **Chord tone drills.** Prompts a chord (e.g. *C major*) and asks you to play
  each tone in sequence. Builds familiarity with chord shapes across the neck.

### Ear Training
- **Interval recognition.** Plays a synthesized reference tone and says "root"
  — you play that note. The app then names the interval (e.g. *"major third
  up"*) and you play it. Two-phase listening: root first, then interval.
- **Configurable intervals and direction** — ascending, descending, or random.
- **Direction arrow on wrong attempts.** After a miss, a large arrow shows
  whether the correct note is higher or lower (shortest chromatic distance,
  octave-agnostic).
- **Root and interval hint toggles.** Show or hide note positions on the
  fretboard for the root and/or interval independently.
- **Replay reference.** Re-hear the reference tone while listening for the root.
- **Stats by interval and direction.** Track accuracy and speed per interval,
  split by ascending/descending.

### Shared Features
- **Infinite sessions.** Train as long as you want — sessions run until you
  hit "End session."
- **Always-on mic.** The microphone opens automatically and shows a live
  detected-note readout at all times. Toggle the mic off/on if needed.
- **Shared mic across modes.** Switching between Notes, Chord Tones, and Ear
  Training reuses the same mic stream — no flash or re-permission prompt.
- **4-string, 5-string, and 6-string instruments** — bass (`E A D G`,
  `B E A D G`) and guitar (`E A D G B E`).
- **Weak-spot focus.** Toggles a weighted picker that biases future rounds
  toward positions you've missed or played slowly.
- **Single-beep errors.** If you sustain a wrong note, the error tone fires
  once and then shuts up. Play a *different* wrong note and it beeps again.
- **Mic-vs-speech deconfliction.** The pitch loop is paused while prompts
  are playing, with a guard window afterward so synthesized audio doesn't
  get judged as your performance. The detected-note display also clears
  during playback so it doesn't give away the answer.
- **Stats heatmap.** Per-position accuracy and speed, visualized on a
  fretboard.

## Why another fretboard trainer?

Most apps in this space are tap-the-answer quizzes. FretEcho closes the loop:
you actually play the note on the instrument, and the app actually listens.
That's what builds the ear -> hand -> fingerboard mapping you're after.

## Screenshot

![FretEcho training screen](./docs/screenshot.png)

## Getting started

### Prerequisites

- Node 18+
- A modern Chromium-based browser (Chrome / Edge / Arc / Brave) — Web Speech
  voice availability is best there
- A microphone near your amp or an audio interface routed as a mic input

### Run locally

```bash
npm install
npm run dev
```

Then open the URL Vite prints (usually `http://localhost:5173`) and grant mic
permission.

### Build for production

```bash
npm run build
npm run preview
```

The build is a fully static bundle under `dist/` — drop it on any static host
(GitHub Pages, Netlify, Cloudflare Pages, S3, your own nginx, etc.).

## How to use it

1. Go to **Settings** and pick your instrument (4-string bass, 5-string bass,
   or 6-string guitar), and whether to include sharps/flats.
2. Back on the **Train** tab, the mic opens automatically. You should see the
   detected pitch update in the "Detected" panel as you play.
3. Choose a mode — **Notes**, **Chord Tones**, or **Ear Training**.
4. Press **Start session**. Follow the prompts; correct answers advance to the
   next round. Wrong answers keep the round alive until you find the right note.
5. Check the **Stats** tab for your per-position heatmap and interval accuracy.

### Tips

- **Palm-mute everything except the string you're playing.** Sympathetic
  resonance from open strings can confuse any pitch detector, including this
  one.
- **Turn on "Focus on weak spots"** once you've built up a few sessions of
  stats. It's a more efficient drill than pure random.
- **For ear training**, start with just a few intervals enabled and add more
  as you get comfortable. Use the hint toggles to gradually remove training
  wheels.
- **If pronunciation sounds off**, FretEcho automatically picks a Google or
  Microsoft English voice when available (they handle single letters like
  "A" correctly). On macOS, install an enhanced English voice via
  *System Settings -> Accessibility -> Spoken Content -> System Voice ->
  Manage Voices* if only Apple voices are available.

## Tech stack

| Layer             | Tool                                     |
| ----------------- | ---------------------------------------- |
| Build / dev       | [Vite](https://vitejs.dev/)              |
| UI                | React 18 + TypeScript (strict)           |
| Styling           | Tailwind CSS                             |
| State             | [zustand](https://github.com/pmndrs/zustand) + `localStorage` |
| Pitch detection   | [`pitchy`](https://github.com/ianprime0509/pitchy) (McLeod Pitch Method) on Web Audio API |
| Speech            | Web Speech API (`SpeechSynthesis`)       |
| Reference tones   | Web Audio `OscillatorNode` (sawtooth)    |
| Feedback tones    | Web Audio `OscillatorNode`               |

Everything runs client-side. There is no server, no account, no telemetry.
Your practice data lives in `localStorage` and nowhere else.

## Project layout

```
src/
  audio/          # mic input, pitch loop, TTS, feedback tones, bass tone synth, shared mic store
  game/           # session engines (note, chord, ear), round picker
  music/          # MIDI / note-name math, tunings, intervals
  settings/       # zustand store for user settings
  stats/          # zustand store for per-position stats
  ui/             # React components (Training, Stats, Settings, Fretboard)
```

## Known limitations

- Pitch detection on very low strings (low B on a 5-string ~31 Hz) is near
  the floor of what consumer mics and the McLeod method can resolve reliably.
  FretEcho sidesteps this by validating on note name only, so an octave
  mis-read still counts as correct — but expect occasional flutter on the
  detected-note readout.
- Web Speech voice availability varies wildly across browsers and OSes. If a
  voice isn't reading "A" as "ay", try a different browser.
- Tested primarily in Chrome on macOS. Firefox has partial Web Speech support;
  Safari's pitch detection latency is higher.

## License

MIT — see [LICENSE](./LICENSE).
