// Live mic level bar. Reads RMS from a PitchLoop ref every animation frame.

import { useEffect, useRef, useState } from 'react';
import type { PitchLoop } from '../audio/pitchDetector';

export function MicMeter({ pitchLoop }: { pitchLoop: PitchLoop | null }) {
  const [level, setLevel] = useState(0);
  const raf = useRef<number | null>(null);

  useEffect(() => {
    if (!pitchLoop) return;
    const tick = () => {
      const rms = pitchLoop.getRms();
      // Map RMS ~0..0.3 -> 0..1.
      setLevel(Math.min(1, rms / 0.3));
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current !== null) cancelAnimationFrame(raf.current);
    };
  }, [pitchLoop]);

  const segments = 12;
  const lit = Math.round(level * segments);

  return (
    <div className="flex items-center gap-1" aria-label="Microphone level">
      {Array.from({ length: segments }).map((_, i) => (
        <div
          key={i}
          className="h-4 w-2 rounded-sm"
          style={{
            background:
              i < lit
                ? i > segments - 3
                  ? '#ef4444'
                  : i > segments - 5
                  ? '#f59e0b'
                  : '#22c55e'
                : '#2a2a2a',
          }}
        />
      ))}
    </div>
  );
}
