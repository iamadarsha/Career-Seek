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
    <div className="flex flex-col items-center justify-center min-h-[400px] p-8 text-center bg-card border border-red-200 rounded-apple-lg shadow-sm animate-in fade-in zoom-in duration-300">
      <div className="p-4 bg-red-50 rounded-full text-red-500 mb-6">
        <AlertTriangle className="w-10 h-10" />
      </div>
      <h2 className="text-2xl font-bold tracking-tight text-foreground mb-2">Something went wrong</h2>
      <p className="text-muted-foreground max-w-md mb-8">
        The application encountered an unexpected error. This might be due to a background job conflict or a network issue.
      </p>
      <div className="bg-red-50/50 p-4 rounded-apple border border-red-100 text-left mb-8 w-full overflow-auto max-h-40">
        <p className="text-xs font-mono text-red-700 whitespace-pre-wrap">
          {error.message || 'Unknown error'}
        </p>
      </div>
      <button
        onClick={() => reset()}
        className="flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-apple font-semibold hover:bg-primary-hover transition-all shadow-sm active:scale-95"
      >
        <RotateCcw className="w-4 h-4" />
        Try Again
      </button>
    </div>
  );
}
