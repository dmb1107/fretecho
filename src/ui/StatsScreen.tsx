// Heatmap view of per-position proficiency.

import { useState } from 'react';
import { useSettings } from '../settings/settingsStore';
import { proficiency, useStatsStore, keyFor } from '../stats/statsStore';
import { Fretboard, type FretboardHighlight } from './Fretboard';
import { allPositions, noteAt } from '../music/tunings';
import { midiToNoteClass } from '../music/notes';
import { INTERVALS } from '../music/intervals';

// Red -> Yellow -> Green gradient.
function colorForScore(score: number | null): string {
  if (score === null) return '#2a2a2a';
  const s = Math.max(0, Math.min(1, score));
  // Interpolate via HSL from 0° (red) to 130° (green).
  const hue = s * 130;
  return `hsl(${hue}, 70%, 50%)`;
}

// Pick a legible text color for a given cell background.
// Unseen (dark gray) needs light text; all gradient colors have 50% HSL
// lightness, so near-black text reads well across red/yellow/green.
function textColorForScore(score: number | null): string {
  return score === null ? '#e5e7eb' : '#0b0b0b';
}

export function StatsScreen() {
  const settings = useSettings();
  const stats = useStatsStore((s) => s.stats);
  const reset = useStatsStore((s) => s.reset);
  const [hover, setHover] = useState<{ s: number; f: number } | null>(null);

  const positions = allPositions(settings.tuning, settings.minFret, settings.maxFret);
  const highlights = new Map<string, FretboardHighlight>();
  for (const p of positions) {
    const stat = stats[keyFor(settings.tuning, p.stringIndex, p.fret)];
    const score = proficiency(stat);
    highlights.set(`${p.stringIndex}:${p.fret}`, {
      color: colorForScore(score),
      label: midiToNoteClass(noteAt(settings.tuning, p.stringIndex, p.fret)),
      textColor: textColorForScore(score),
    });
  }

  const hoverStat = hover ? stats[keyFor(settings.tuning, hover.s, hover.f)] : undefined;
  const hoverScore = hover ? proficiency(hoverStat) : null;

  // Totals are scoped to the current instrument (bass stats are shared across
  // 4-string / 5-string; guitar is its own namespace).
  const instrumentPrefix = `${settings.instrument}:`;
  const totalAttempts = Object.entries(stats)
    .filter(([k]) => k.startsWith(instrumentPrefix))
    .reduce((a, [, b]) => a + b.attempts, 0);
  const totalCorrect = Object.entries(stats)
    .filter(([k]) => k.startsWith(instrumentPrefix))
    .reduce((a, [, b]) => a + b.correct, 0);

  return (
    <div className="flex flex-col gap-3 p-3 sm:gap-6 sm:p-6 max-w-5xl mx-auto">
      <div className="flex items-end justify-between">
        <h2 className="text-lg sm:text-2xl font-bold">Proficiency heatmap</h2>
        <button
          onClick={() => {
            if (confirm('Reset all stats?')) reset();
          }}
          className="px-3 py-1.5 rounded bg-neutral-800 hover:bg-neutral-700 text-sm"
        >
          Reset stats
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2 sm:flex sm:gap-6 text-sm">
        <Card label="Attempts" value={String(totalAttempts)} />
        <Card label="Correct" value={String(totalCorrect)} />
        <Card
          label="Overall accuracy"
          value={`${totalAttempts === 0 ? 0 : Math.round((totalCorrect / totalAttempts) * 100)}%`}
        />
      </div>

      <div className="flex justify-center">
        <Fretboard
          tuning={settings.tuning}
          minFret={settings.minFret}
          maxFret={settings.maxFret}
          highlights={highlights}
          onCellClick={(s, f) => setHover({ s, f })}
        />
      </div>

      <div className="min-h-[60px] rounded border border-neutral-800 p-3 bg-neutral-900/40">
        {hover && hoverStat ? (
          <div className="text-sm text-neutral-300">
            <div className="font-semibold">
              String {hover.s + 1}, Fret {hover.f} — {midiToNoteClass(noteAt(settings.tuning, hover.s, hover.f))}
            </div>
            <div>
              {hoverStat.correct} / {hoverStat.attempts} correct ({Math.round((hoverStat.correct / hoverStat.attempts) * 100)}%),
              avg {(hoverStat.totalMs / hoverStat.attempts / 1000).toFixed(2)}s
              {hoverScore !== null && <> · score {Math.round(hoverScore * 100)}</>}
            </div>
          </div>
        ) : hover ? (
          <div className="text-sm text-neutral-500">
            String {hover.s + 1}, Fret {hover.f} — {midiToNoteClass(noteAt(settings.tuning, hover.s, hover.f))} — no attempts yet
          </div>
        ) : (
          <div className="text-sm text-neutral-500">Click a position to see its stats.</div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-xs text-neutral-500">
        <span>Low</span>
        <div
          className="h-3 w-24 sm:w-40 rounded"
          style={{ background: 'linear-gradient(to right, hsl(0,70%,50%), hsl(65,70%,50%), hsl(130,70%,50%))' }}
        />
        <span>High</span>
        <span className="ml-4">Gray = unseen</span>
      </div>

      <EarTrainingStats stats={stats} />
    </div>
  );
}

function EarTrainingStats({ stats }: { stats: Record<string, { attempts: number; correct: number; totalMs: number }> }) {
  const directions = ['ascending', 'descending'] as const;
  const earStats: { interval: typeof INTERVALS[number]; direction: string; dirLabel: string; stat: { attempts: number; correct: number; totalMs: number } }[] = [];

  for (const iv of INTERVALS) {
    for (const dir of directions) {
      const stat = stats[`ear:interval:${iv.id}:${dir}`];
      if (stat) earStats.push({ interval: iv, direction: dir, dirLabel: dir === 'ascending' ? '↑' : '↓', stat });
    }
    // Also check old format (no direction) for backwards compatibility.
    const oldStat = stats[`ear:interval:${iv.id}`];
    if (oldStat) earStats.push({ interval: iv, direction: '', dirLabel: '', stat: oldStat });
  }

  if (earStats.length === 0) return null;

  const totalAttempts = earStats.reduce((a, e) => a + e.stat.attempts, 0);
  const totalCorrect = earStats.reduce((a, e) => a + e.stat.correct, 0);

  return (
    <>
      <div className="mt-4 sm:mt-8 flex items-end justify-between">
        <h2 className="text-lg sm:text-2xl font-bold">Interval training</h2>
      </div>

      <div className="grid grid-cols-3 gap-2 sm:flex sm:gap-6 text-sm">
        <Card label="Attempts" value={String(totalAttempts)} />
        <Card label="Correct" value={String(totalCorrect)} />
        <Card
          label="Overall accuracy"
          value={`${totalAttempts === 0 ? 0 : Math.round((totalCorrect / totalAttempts) * 100)}%`}
        />
      </div>

      <div className="rounded border border-neutral-800 bg-neutral-900/40 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs uppercase tracking-widest text-neutral-500 border-b border-neutral-800">
              <th className="text-left px-3 py-2">Interval</th>
              <th className="text-center px-3 py-2">Dir</th>
              <th className="text-right px-3 py-2">Attempts</th>
              <th className="text-right px-3 py-2">Accuracy</th>
              <th className="text-right px-3 py-2">Avg time</th>
            </tr>
          </thead>
          <tbody>
            {earStats.map(({ interval, direction, dirLabel, stat }) => {
              const acc = Math.round((stat.correct / stat.attempts) * 100);
              const avg = (stat.totalMs / stat.attempts / 1000).toFixed(2);
              return (
                <tr key={`${interval.id}:${direction}`} className="border-b border-neutral-800/50 last:border-0">
                  <td className="px-3 py-2 text-neutral-200">{interval.shortLabel} — {interval.label}</td>
                  <td className="text-center px-3 py-2 text-neutral-400">{dirLabel || '—'}</td>
                  <td className="text-right px-3 py-2 text-neutral-400">{stat.attempts}</td>
                  <td className="text-right px-3 py-2 text-neutral-400">{acc}%</td>
                  <td className="text-right px-3 py-2 text-neutral-400">{avg}s</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-neutral-800 bg-neutral-900/40 px-2 py-1.5 sm:px-4 sm:py-2">
      <div className="text-[10px] sm:text-xs uppercase tracking-widest text-neutral-500">{label}</div>
      <div className="text-lg sm:text-2xl font-bold">{value}</div>
    </div>
  );
}
