// Help / instructions screen — explains how to use FretEcho.

export function HelpScreen() {
  return (
    <div className="flex flex-col gap-4 p-3 sm:gap-8 sm:p-6 max-w-3xl mx-auto text-neutral-300">
      <header className="flex flex-col gap-2">
        <h2 className="text-2xl sm:text-3xl font-bold text-brand">How to use FretEcho</h2>
        <p className="text-neutral-400">
          FretEcho listens to your instrument via microphone and gives you
          call-and-response drills across three training modes.
        </p>
      </header>

      <Section title="Getting started">
        <Ol>
          <li>In <Kbd>Settings</Kbd>, choose your instrument, tuning, and mic input.</li>
          <li>Return to <Kbd>Train</Kbd> — the mic opens automatically and the Detected panel shows what you're playing.</li>
          <li>Pick a mode, hit <Kbd>Start session</Kbd>, and follow the prompts. Sessions run until you hit <Kbd>End session</Kbd>.</li>
        </Ol>
      </Section>

      <Section title="Note training">
        <Ul>
          <li>The app calls out a note and string (e.g. <em>"C on the A string"</em>). Play it.</li>
          <li>Any octave of the correct note counts. Wrong notes keep the round alive — find the right one to advance.</li>
          <li>Turn on <Kbd>Hints: on</Kbd> to see the target note highlighted on the fretboard.</li>
        </Ul>
      </Section>

      <Section title="Chord tone training">
        <Ul>
          <li>The app calls out a chord (e.g. <em>"A major"</em>) and you play each tone in order: root, 3rd, 5th, etc.</li>
          <li>After each correct tone the app speaks the note name, then prompts the next one.</li>
          <li>Any octave of the correct pitch class counts on any string.</li>
          <li>Configure which chord types to practice in <Kbd>Settings</Kbd>.</li>
        </Ul>
      </Section>

      <Section title="Ear training">
        <Ol>
          <li>The app plays a reference tone and says <em>"root"</em>. Play that note on your instrument.</li>
          <li>Once you play the root, the app names the interval (e.g. <em>"major third up"</em>). Play the interval note.</li>
          <li>Use <Kbd>▶ Replay reference</Kbd> if you need to hear the root tone again.</li>
          <li>A direction arrow appears after a wrong attempt to show whether the correct note is higher or lower.</li>
        </Ol>
        <p className="text-sm text-neutral-400 mt-3">
          Enable <Kbd>Root hint</Kbd> or <Kbd>Interval hint</Kbd> to see matching fretboard positions highlighted.
          Configure intervals and direction (ascending / descending / random) in <Kbd>Settings</Kbd>.
        </p>
      </Section>

      <Section title="Good to know">
        <Ul>
          <li>Only your first attempt on each note or tone is counted toward stats.</li>
          <li>The mic is paused while the app is speaking so it can't hear its own output.</li>
          <li>The <Kbd>Stats</Kbd> tab shows a heatmap of accuracy and speed. Enable <em>Focus on weak spots</em> in Settings to bias rounds toward your problem areas.</li>
          <li>Everything is stored locally in your browser — no account, no server.</li>
        </Ul>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-sm uppercase tracking-widest text-neutral-500">{title}</h3>
      <div className="rounded border border-neutral-800 bg-neutral-900/40 p-4">
        {children}
      </div>
    </section>
  );
}

function Ul({ children }: { children: React.ReactNode }) {
  return <ul className="list-disc pl-5 space-y-2 text-sm leading-relaxed">{children}</ul>;
}

function Ol({ children }: { children: React.ReactNode }) {
  return <ol className="list-decimal pl-5 space-y-2 text-sm leading-relaxed">{children}</ol>;
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="px-1.5 py-0.5 rounded border border-neutral-700 bg-neutral-800 text-xs text-neutral-200 font-mono">
      {children}
    </kbd>
  );
}
