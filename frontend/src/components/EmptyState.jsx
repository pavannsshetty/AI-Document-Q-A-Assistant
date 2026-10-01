import React from 'react';

export const EmptyState = ({
  icon: Icon = null,
  title,
  description,
  action = null
}) => {
  return (
    <div className="flex flex-col items-center justify-center text-center py-12 px-6 rounded-xl border border-dashed border-slate-300 dark:border-slate-800 bg-white/50 dark:bg-slate-900/40">
      {Icon ? (
        <div className="w-11 h-11 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-[#0AAF29] mb-4">
          <Icon className="w-5 h-5" />
        </div>
      ) : null}
      <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-1.5">
        {title}
      </h3>
      {description ? (
        <p className="text-sm text-slate-600 dark:text-slate-400 max-w-md mb-5">
          {description}
        </p>
      ) : null}
      {action ? <div>{action}</div> : null}
    </div>
  );
};

export default EmptyState;
