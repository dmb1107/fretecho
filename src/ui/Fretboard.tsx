// Reusable SVG fretboard. Low string at the bottom, high string at the top.
// Used for training hint display and the stats heatmap.

import { TUNINGS, type TuningId, stringLabel, noteAt } from '../music/tunings';
import { midiToNoteClass } from '../music/notes';

export interface FretboardHighlight {
  color: string;
  label?: string;
  ring?: boolean;
  textColor?: string;
}

export interface FretboardProps {
  tuning: TuningId;
  minFret: number;
  maxFret: number;
  highlights?: Map<string, FretboardHighlight>; // key = `${stringIndex}:${fret}`
  highlightedString?: number;
  useFlats?: boolean;
  showNoteNames?: boolean;
  onCellClick?: (stringIndex: number, fret: number) => void;
}

const INLAYS_SINGLE = [3, 5, 7, 9, 15, 17, 19, 21];
const INLAYS_DOUBLE = [12, 24];

export function Fretboard(props: FretboardProps) {
  const { tuning, minFret, maxFret, highlights, highlightedString, useFlats, showNoteNames, onCellClick } = props;
  const numStrings = TUNINGS[tuning].strings.length;

  // If minFret === 0, we render an "open string" column *outside* (left of)
  // the nut. The fretboard body itself only contains fretted positions
  // (fret 1..maxFret in that case).
  const showOpen = minFret === 0;
  const bodyStartFret = showOpen ? 1 : minFret;
  const bodyFrets = maxFret - bodyStartFret + 1;

  const cellW = 56;
  const openW = 48; // width of the open-string area to the left of the nut
  const cellH = 42;
  const padX = 52; // wide enough for "low E" / "high E" labels
  const padY = 24;
  const openOffset = showOpen ? openW : 0;
  const bodyStartX = padX + openOffset;
  const bodyEndX = bodyStartX + bodyFrets * cellW;
  const width = bodyEndX + padX;
  const height = padY * 2 + (numStrings - 1) * cellH + 8;

  // Strings are drawn high-to-low visually (index 0 = lowest pitch at bottom).
  const yForStringIndex = (s: number) => padY + (numStrings - 1 - s) * cellH;
  const xForFret = (fret: number) => {
    if (fret === 0 && showOpen) return padX + openW / 2;
    const col = fret - bodyStartFret;
    return bodyStartX + col * cellW + cellW / 2;
  };
  const fretLineX = (colBoundary: number) => bodyStartX + colBoundary * cellW;

  const bodyFretList = Array.from({ length: bodyFrets }, (_, i) => bodyStartFret + i);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full max-w-4xl select-none"
      style={{ fontFamily: 'ui-sans-serif, system-ui, sans-serif' }}
    >
      {/* Fretboard body background — only covers fretted positions */}
      <rect
        x={bodyStartX}
        y={padY - 10}
        width={bodyFrets * cellW}
        height={(numStrings - 1) * cellH + 20}
        fill="#1c1410"
        stroke="#3a2a22"
        rx={4}
      />

      {/* Inlay dots (body frets only) */}
      {bodyFretList.map((fret, col) => {
        const cx = bodyStartX + col * cellW + cellW / 2;
        const cy = padY + ((numStrings - 1) * cellH) / 2;
        if (INLAYS_DOUBLE.includes(fret)) {
          return (
            <g key={`inlay-${fret}`}>
              <circle cx={cx} cy={cy - 10} r={4} fill="#4a3a2e" />
              <circle cx={cx} cy={cy + 10} r={4} fill="#4a3a2e" />
            </g>
          );
        }
        if (INLAYS_SINGLE.includes(fret)) {
          return <circle key={`inlay-${fret}`} cx={cx} cy={cy} r={5} fill="#4a3a2e" />;
        }
        return null;
      })}

      {/* Fret lines (body frets only). Index 0 is the nut when showOpen. */}
      {Array.from({ length: bodyFrets + 1 }).map((_, i) => {
        const x = fretLineX(i);
        const isNut = showOpen && i === 0;
        return (
          <line
            key={`fret-${i}`}
            x1={x}
            y1={padY - 10}
            x2={x}
            y2={padY + (numStrings - 1) * cellH + 10}
            stroke={isNut ? '#e5d2b5' : '#7a6555'}
            strokeWidth={isNut ? 5 : 2}
          />
        );
      })}

      {/* Strings. When showOpen, string lines start at the nut (bodyStartX);
          the open-string area to the left is rendered as free-floating
          markers, not part of the string. */}
      {Array.from({ length: numStrings }).map((_, s) => {
        const y = yForStringIndex(s);
        // Thicker low strings.
        const thickness = 1 + (numStrings - 1 - s) * 0.7;
        const isHighlighted = highlightedString === s;
        return (
          <g key={`string-${s}`}>
            {isHighlighted && (
              <line
                x1={bodyStartX}
                y1={y}
                x2={bodyEndX}
                y2={y}
                stroke="#ff6b35"
                strokeWidth={thickness + 4}
                opacity={0.35}
              />
            )}
            <line
              x1={bodyStartX}
              y1={y}
              x2={bodyEndX}
              y2={y}
              stroke={isHighlighted ? '#ff6b35' : '#c8b89a'}
              strokeWidth={thickness}
            />
          </g>
        );
      })}

      {/* String labels on the far left */}
      {Array.from({ length: numStrings }).map((_, s) => (
        <text
          key={`lab-${s}`}
          x={padX - 6}
          y={yForStringIndex(s) + 4}
          fill={highlightedString === s ? '#ff6b35' : '#9ca3af'}
          fontSize={13}
          fontWeight={highlightedString === s ? 700 : 400}
          textAnchor="end"
        >
          {stringLabel(tuning, s)}
        </text>
      ))}

      {/* Fret numbers for body frets */}
      {bodyFretList.map((fret, col) => (
        <text
          key={`fretnum-${fret}`}
          x={bodyStartX + col * cellW + cellW / 2}
          y={height - 6}
          fill="#6b7280"
          fontSize={11}
          textAnchor="middle"
        >
          {fret}
        </text>
      ))}
      {/* Fret number for the open column */}
      {showOpen && (
        <text
          x={padX + openW / 2}
          y={height - 6}
          fill="#6b7280"
          fontSize={11}
          textAnchor="middle"
        >
          0
        </text>
      )}

      {/* Cells (highlights + optional note names) */}
      {Array.from({ length: numStrings }).flatMap((_, s) => {
        const fretsForCells = showOpen ? [0, ...bodyFretList] : bodyFretList;
        return fretsForCells.map((fret) => {
          const key = `${s}:${fret}`;
          const hl = highlights?.get(key);
          const cx = xForFret(fret);
          const cy = yForStringIndex(s);
          const label =
            hl?.label ??
            (showNoteNames ? midiToNoteClass(noteAt(tuning, s, fret), useFlats) : undefined);
          return (
            <g
              key={`cell-${s}-${fret}`}
              onClick={onCellClick ? () => onCellClick(s, fret) : undefined}
              style={onCellClick ? { cursor: 'pointer' } : undefined}
            >
              {hl && (
                <circle
                  cx={cx}
                  cy={cy}
                  r={15}
                  fill={hl.ring ? 'transparent' : hl.color}
                  stroke={hl.color}
                  strokeWidth={hl.ring ? 3 : 1}
                  opacity={0.95}
                />
              )}
              {label && (
                <text
                  x={cx}
                  y={cy + 4}
                  textAnchor="middle"
                  fontSize={12}
                  fill={hl?.textColor ?? (hl ? '#0b0b0b' : '#9ca3af')}
                  fontWeight={hl ? 700 : 400}
                >
                  {label}
                </text>
              )}
            </g>
          );
        });
      })}
    </svg>
  );
}
