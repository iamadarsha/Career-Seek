'use client';

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface Props {
  children?: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

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
              {this.state.error?.message || 'Unknown error'}
            </p>
          </div>
          <button
            onClick={this.handleReset}
            className="flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-apple font-semibold hover:bg-primary-hover transition-all shadow-sm active:scale-95"
          >
            <RotateCcw className="w-4 h-4" />
            Reload Page
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export function withErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  fallback?: ReactNode
) {
  return function WithErrorBoundary(props: P) {
    return (
      <ErrorBoundary fallback={fallback}>
        <Component {...props} />
      </ErrorBoundary>
    );
  };
}
