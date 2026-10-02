import React from 'react';

export const EmptyState = ({
  icon: Icon = null,
  title,
  description,
  action = null
}) => {
  return (
    <div className="flex flex-col items-center justify-center text-center py-8 sm:py-12 px-4 sm:px-6 rounded-xl border border-dashed border-slate-300 dark:border-slate-800 bg-white/50 dark:bg-slate-900/40 min-w-0 max-w-full">
      {Icon ? (
        <div className="w-11 h-11 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-[#0AAF29] mb-3.5 sm:mb-4 shrink-0">
          <Icon className="w-5 h-5" />
        </div>
      ) : null}
      <h3 className="text-sm sm:text-base font-semibold text-slate-900 dark:text-slate-100 mb-1.5 break-words max-w-full">
        {title}
      </h3>
      {description ? (
        <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 max-w-md mb-5 leading-relaxed break-words">
          {description}
        </p>
      ) : null}
      {action ? (
        <div className="w-full sm:w-auto flex flex-col sm:flex-row items-center justify-center gap-2">
          {action}
        </div>
      ) : null}
    </div>
  );
};

export default EmptyState;
