'use client';

import React from 'react';

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Globe rendering error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="w-full h-full flex items-center justify-center bg-gray-900">
          <div className="bg-black/90 backdrop-blur-sm rounded-lg p-8 text-white text-center max-w-md">
            <div className="text-4xl mb-4">⚠️</div>
            <div className="text-xl font-bold mb-2">Rendering Error</div>
            <div className="text-gray-400 mb-4">
              The visualization encountered an error. This usually happens with large datasets.
            </div>
            <div className="text-sm text-left bg-gray-800 rounded p-3 font-mono">
              <div className="text-red-400 mb-2">Error: {this.state.error?.message}</div>
              <div className="text-blue-400 mb-1"># Try refreshing the page</div>
              <div className="text-blue-400"># Or reduce the dataset size</div>
            </div>
            <button 
              onClick={() => window.location.reload()}
              className="mt-4 bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded text-white"
            >
              Refresh Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}