import React from 'react';
import { formatScorePercent } from '../utils/formatters.js';

export const SourceReference = ({ sources = [] }) => {
  if (!Array.isArray(sources) || sources.length === 0) {
    return null;
  }

  return (
    <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-800">
      <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">
        Retrieved Document Sources ({sources.length})
      </p>
      <div className="space-y-1.5">
        {sources.map((source, index) => {
          const pageLabel =
            source.page !== null && source.page !== undefined
              ? `Page ${source.page}`
              : 'Page not available';

          return (
            <div
              key={`${source.documentId || 'doc'}-${source.chunkIndex}-${index}`}
              className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-600 dark:text-slate-400 py-1"
            >
              <span className="font-medium text-slate-800 dark:text-slate-200 truncate max-w-[260px]">
                {source.filename || 'Document'}
              </span>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">{pageLabel}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">
                Chunk #{source.chunkIndex ?? 0}
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums text-[#0AAF29]">
                Relevance {formatScorePercent(source.score)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default SourceReference;
