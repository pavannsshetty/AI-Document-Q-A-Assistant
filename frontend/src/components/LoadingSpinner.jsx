import React from 'react';
import { Loader2 } from 'lucide-react';

export const LoadingSpinner = ({
  label = 'Loading...',
  size = 'md',
  fullScreen = false
}) => {
  const sizeMap = {
    sm: 'w-4 h-4',
    md: 'w-6 h-6',
    lg: 'w-8 h-8'
  };

  const spinnerSize = sizeMap[size] || sizeMap.md;

  const content = (
    <div className="flex flex-col items-center justify-center gap-3 py-8 text-center">
      <Loader2 className={`${spinnerSize} animate-spin text-[#0AAF29]`} />
      {label ? (
        <p className="text-sm text-slate-600 dark:text-slate-400">{label}</p>
      ) : null}
    </div>
  );

  if (fullScreen) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        {content}
      </div>
    );
  }

  return content;
};

export default LoadingSpinner;
