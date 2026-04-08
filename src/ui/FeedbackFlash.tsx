// Full-screen colored flash layer for success/error feedback.

import { useEffect, useState } from 'react';

export type FlashKind = 'success' | 'error' | null;

export function FeedbackFlash({ kind }: { kind: FlashKind }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!kind) return;
    setVisible(true);
    const t = setTimeout(() => setVisible(false), 400);
    return () => clearTimeout(t);
  }, [kind]);

  if (!kind || !visible) return null;
  const color = kind === 'success' ? 'rgba(34,197,94,0.25)' : 'rgba(239,68,68,0.25)';
  return (
    <div
      className="pointer-events-none fixed inset-0 transition-opacity"
      style={{ background: color, animation: 'fadeOut 400ms ease-out forwards' }}
    />
  );
}
