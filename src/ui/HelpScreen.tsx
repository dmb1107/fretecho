// Help / instructions screen — explains how to use FretEcho.

export function HelpScreen() {
  return (
    <div className="flex flex-col gap-4 p-3 sm:gap-8 sm:p-6 max-w-3xl mx-auto text-neutral-300">
      <header className="flex flex-col gap-2">
        <h2 className="text-2xl sm:text-3xl font-bold text-brand">How to use FretEcho</h2>
        <p className="text-neutral-400">
          FretEcho calls out a note; you play it on your instrument.
        </p>
      </header>

      <Section title="Getting started">
        <Ol>
          <li>In <Kbd>Settings</Kbd>, choose your instrument and mic input.</li>
          <li>In <Kbd>Train</Kbd>, hit <Kbd>Start session</Kbd> and play each note you hear.</li>
          <li>Right = green, wrong = red and the fret is shown. Keep trying until you get it.</li>
        </Ol>
      </Section>

      <Section title="Chord tone trainer">
        <Ol>
          <li>Switch to <Kbd>Chord Tones</Kbd> mode using the toggle at the top of the Train tab.</li>
          <li>The app calls out a chord (e.g. "C major seven") and you play each tone in order: root, 3rd, 5th, 7th.</li>
          <li>Any octave counts — play the correct pitch class on any string.</li>
          <li>Choose which chord types to practice in <Kbd>Settings</Kbd>.</li>
        </Ol>
      </Section>

      <Section title="Good to know">
        <Ul>
          <li>Scoring is by note name — any octave of the right note counts.</li>
          <li>Only your first attempt on each note is scored.</li>
          <li>The <Kbd>Stats</Kbd> tab shows a heatmap of your weak spots. Enable <em>Focus on weak spots</em> in Settings to drill them.</li>
          <li>Everything is stored locally in your browser.</li>
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
