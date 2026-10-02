import React, { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { formatScorePercent } from '../utils/formatters.js';

export const SourceReference = ({ sources = [] }) => {
  const [expanded, setExpanded] = useState(false);

  if (!Array.isArray(sources) || sources.length === 0) {
    return null;
  }

  const primarySource = sources[0];
  const primaryPageLabel =
    primarySource.page !== null && primarySource.page !== undefined
      ? `Page ${primarySource.page}`
      : null;

  return (
    <div className="mt-3 pt-2.5 border-t border-slate-200 dark:border-slate-800 min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 dark:text-slate-400">
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 min-w-0">
          <span className="font-medium text-slate-500 dark:text-slate-400">
            Source:
          </span>
          <span className="font-medium text-slate-800 dark:text-slate-200 truncate max-w-[160px] xs:max-w-[210px] sm:max-w-[260px]">
            {primarySource.filename || 'Document'}
          </span>
          {primaryPageLabel ? (
            <>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">{primaryPageLabel}</span>
            </>
          ) : null}
          <span aria-hidden="true">·</span>
          <span className="font-mono tabular-nums">
            Chunk #{primarySource.chunkIndex ?? 0}
          </span>
        </div>

        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          aria-expanded={expanded}
          className="inline-flex items-center gap-1 min-h-[32px] px-2 py-1 -mr-1 rounded-md text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
        >
          <span>
            {expanded
              ? `Hide sources (${sources.length})`
              : `View sources (${sources.length})`}
          </span>
          {expanded ? (
            <ChevronUp className="w-3.5 h-3.5 shrink-0" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5 shrink-0" />
          )}
        </button>
      </div>

      {expanded ? (
        <div className="mt-2.5 pt-2.5 border-t border-slate-100 dark:border-slate-800/80 min-w-0">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
            Retrieved Document Sources ({sources.length})
          </p>
          <div className="space-y-1.5 sm:space-y-1">
            {sources.map((source, index) => {
              const pageLabel =
                source.page !== null && source.page !== undefined
                  ? `Page ${source.page}`
                  : 'Page not available';

              return (
                <div
                  key={`${source.documentId || 'doc'}-${source.chunkIndex}-${index}`}
                  className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-600 dark:text-slate-400 py-0.5 min-w-0"
                >
                  <span className="font-medium text-slate-800 dark:text-slate-200 truncate max-w-[180px] sm:max-w-[260px]">
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
      ) : null}
    </div>
  );
};

export default SourceReference;
