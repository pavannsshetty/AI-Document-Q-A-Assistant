import React from 'react';
import { CheckCircle2, Loader2, AlertCircle, Circle } from 'lucide-react';
import { formatFileSize, formatNumber } from '../utils/formatters.js';

const PIPELINE_STEPS = [
  { id: 'uploading', label: 'Uploading File' },
  { id: 'extracting', label: 'Extracting Text' },
  { id: 'chunking', label: 'Splitting Chunks' },
  { id: 'embedding', label: 'Ollama Embeddings' },
  { id: 'indexing', label: 'Qdrant Indexing' }
];

const STAGE_ORDER = {
  uploading: 0,
  extracting: 1,
  chunking: 2,
  embedding: 3,
  indexing: 4,
  completed: 5
};

export const UploadProgressBar = ({
  stage = 'uploading',
  percent = 0,
  message = 'Processing document...',
  loadedBytes = 0,
  totalBytes = 0,
  processedChunks = 0,
  totalChunks = 0,
  extractedTextLength = 0,
  compact = false
}) => {
  const clampedPercent = Math.max(0, Math.min(100, Math.round(Number(percent) || 0)));
  const isFailed = stage === 'failed';
  const isCompleted = stage === 'completed' || clampedPercent >= 100;
  const activeStageIndex =
    STAGE_ORDER[stage] !== undefined ? STAGE_ORDER[stage] : 0;

  const barColorClass = isFailed
    ? 'bg-red-600 dark:bg-red-500'
    : 'bg-[#0AAF29]';

  if (compact) {
    return (
      <div className="space-y-1.5 py-1">
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="text-slate-600 dark:text-slate-400 truncate">
            {message}
          </span>
          <span className="font-mono tabular-nums font-medium text-slate-900 dark:text-slate-100 shrink-0">
            {clampedPercent}%
          </span>
        </div>
        <div
          role="progressbar"
          aria-valuenow={clampedPercent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Document processing progress"
          className="w-full h-1.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden"
        >
          <div
            className={`h-full transition-all duration-200 ease-out ${barColorClass}`}
            style={{ width: `${clampedPercent}%` }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="p-3.5 sm:p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-3.5 sm:space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">
            {isFailed
              ? 'Processing Interrupted'
              : isCompleted
              ? 'Indexing Complete'
              : 'RAG Processing Pipeline'}
          </p>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5 leading-relaxed break-words overflow-wrap-anywhere">
            {message}
          </p>
        </div>

        <span
          className={`text-sm font-mono tabular-nums font-semibold shrink-0 ${
            isFailed
              ? 'text-red-600 dark:text-red-400'
              : 'text-[#0AAF29]'
          }`}
        >
          {clampedPercent}%
        </span>
      </div>

      <div
        role="progressbar"
        aria-valuenow={clampedPercent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Document upload and indexing progress"
        className="w-full h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden"
      >
        <div
          className={`h-full transition-all duration-200 ease-out ${barColorClass}`}
          style={{ width: `${clampedPercent}%` }}
        />
      </div>

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
        {totalBytes > 0 ? (
          <span className="font-mono tabular-nums">
            Upload: {formatFileSize(Math.min(loadedBytes, totalBytes))} / {formatFileSize(totalBytes)}
          </span>
        ) : null}

        {extractedTextLength > 0 ? (
          <>
            {totalBytes > 0 ? <span aria-hidden="true">·</span> : null}
            <span className="font-mono tabular-nums">
              {formatNumber(extractedTextLength)} chars extracted
            </span>
          </>
        ) : null}

        {totalChunks > 0 ? (
          <>
            {totalBytes > 0 || extractedTextLength > 0 ? (
              <span aria-hidden="true">·</span>
            ) : null}
            <span className="font-mono tabular-nums">
              Chunks embedded: {formatNumber(processedChunks)} / {formatNumber(totalChunks)}
            </span>
          </>
        ) : null}
      </div>

      <div className="pt-3 border-t border-slate-200 dark:border-slate-800 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
        {PIPELINE_STEPS.map((step, index) => {
          const isStepDone = isCompleted || (!isFailed && index < activeStageIndex);
          const isStepCurrent = !isCompleted && index === activeStageIndex;
          const isStepFailed = isFailed && index === activeStageIndex;

          return (
            <div
              key={step.id}
              className="flex items-center gap-1.5 text-xs"
            >
              {isStepDone ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-[#0AAF29] shrink-0" />
              ) : isStepFailed ? (
                <AlertCircle className="w-3.5 h-3.5 text-red-600 dark:text-red-400 shrink-0" />
              ) : isStepCurrent ? (
                <Loader2 className="w-3.5 h-3.5 text-[#0AAF29] animate-spin shrink-0" />
              ) : (
                <Circle className="w-3.5 h-3.5 text-slate-300 dark:text-slate-700 shrink-0" />
              )}
              <span
                className={`truncate ${
                  isStepDone || isStepCurrent
                    ? 'font-medium text-slate-900 dark:text-slate-100'
                    : isStepFailed
                    ? 'font-medium text-red-600 dark:text-red-400'
                    : 'text-slate-400 dark:text-slate-500'
                }`}
              >
                {step.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default UploadProgressBar;
