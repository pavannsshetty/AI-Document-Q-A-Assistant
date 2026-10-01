import React from 'react';
import { AlertCircle, X } from 'lucide-react';

export const ErrorMessage = ({ message, onDismiss = null, onRetry = null }) => {
  if (!message) {
    return null;
  }

  return (
    <div
      role="alert"
      className="flex items-start justify-between gap-3 p-4 rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50/80 dark:bg-red-950/40 text-red-800 dark:text-red-200 text-sm"
    >
      <div className="flex items-start gap-2.5">
        <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="leading-relaxed">{message}</p>
          {onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className="text-xs font-medium underline hover:no-underline cursor-pointer"
            >
              Try again
            </button>
          ) : null}
        </div>
      </div>

      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss error"
          className="text-red-500 hover:text-red-700 dark:hover:text-red-300 p-0.5 cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      ) : null}
    </div>
  );
};

export default ErrorMessage;
