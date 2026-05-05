'use client';

import { useEffect } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="apple-card flex min-h-[400px] flex-col items-center justify-center p-8 text-center animate-in fade-in zoom-in duration-300">
      <div className="mb-6 rounded-apple bg-danger-bg p-4 text-danger">
        <AlertTriangle className="w-10 h-10" />
      </div>
      <h2 className="text-2xl font-bold text-foreground mb-2">Review Error</h2>
      <p className="text-muted-foreground max-w-md mb-8">
        We encountered an error while loading your job opportunities. This could be due to a malformed scan result or a database lock.
      </p>
      <div className="bg-danger-bg/50 p-4 rounded-apple border border-danger-border text-left mb-8 w-full overflow-auto max-h-40">
        <p className="text-xs font-mono text-danger whitespace-pre-wrap">
          {error.message || 'Unknown error'}
        </p>
      </div>
      <button
        onClick={() => reset()}
        className="design-button-primary px-6 py-3 font-semibold active:scale-95"
      >
        <RotateCcw className="w-4 h-4" />
        Retry Loading Jobs
      </button>
    </div>
  );
}
