import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';

export function Toast({
  msg,
  ok,
  onDismiss,
}: {
  msg: string;
  ok: boolean;
  onDismiss: () => void;
}) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 4000);
    return () => clearTimeout(t);
  }, [onDismiss]);

  return createPortal(
    <div
      className={`fixed bottom-5 right-5 z-50 max-w-sm px-4 py-3 rounded-xl border shadow-xl shadow-black/50 text-sm leading-snug ${
        ok
          ? 'bg-emerald-950/95 border-emerald-700/60 text-emerald-200'
          : 'bg-red-950/95 border-red-700/60 text-red-200'
      }`}
    >
      {msg}
    </div>,
    document.body,
  );
}
