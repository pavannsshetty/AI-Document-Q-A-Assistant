import React from 'react';
import { Link } from 'react-router-dom';
import { MessageSquare, Trash2, ArrowUpRight } from 'lucide-react';
import { Button } from './Button.jsx';
import { UploadProgressBar } from './UploadProgressBar.jsx';
import {
  formatFileSize,
  formatDate,
  formatNumber
} from '../utils/formatters.js';

const getStatusLabel = (status) => {
  if (status === 'completed') {
    return { text: 'Completed', colorClass: 'text-[#0AAF29]' };
  }
  if (status === 'processing') {
    return { text: 'Processing', colorClass: 'text-amber-600 dark:text-amber-400' };
  }
  return { text: 'Failed', colorClass: 'text-red-600 dark:text-red-400' };
};

export const DocumentCard = ({
  document,
  onOpenChat,
  onDelete,
  chatLoadingId = null
}) => {
  const docId = document.id || document._id;
  const statusInfo = getStatusLabel(document.processingStatus);
  const isReady = document.processingStatus === 'completed';
  const isProcessing = document.processingStatus === 'processing';
  const isStartingChat = chatLoadingId === docId;

  return (
    <div className="flex flex-col justify-between p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 transition-colors hover:border-slate-300 dark:hover:border-slate-700">
      <div>
        <div className="flex items-start justify-between gap-3 mb-2">
          <Link
            to={`/documents/${docId}`}
            className="text-base font-semibold text-slate-900 dark:text-slate-100 hover:text-[#0AAF29] dark:hover:text-[#0AAF29] transition-colors truncate"
            title={document.originalName}
          >
            {document.originalName}
          </Link>

          <Link
            to={`/documents/${docId}`}
            className="text-xs text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 inline-flex items-center gap-1 shrink-0"
          >
            <span>Details</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500 dark:text-slate-400 mb-4">
          <span className={`font-medium ${statusInfo.colorClass}`}>
            {statusInfo.text}
          </span>
          <span aria-hidden="true">·</span>
          <span className="uppercase font-mono">
            {document.fileType || 'FILE'}
          </span>
          <span aria-hidden="true">·</span>
          <span className="tabular-nums">
            {formatFileSize(document.fileSize)}
          </span>
          <span aria-hidden="true">·</span>
          <span className="tabular-nums">
            {formatNumber(document.chunkCount)} chunks
          </span>
          <span aria-hidden="true">·</span>
          <span className="tabular-nums">{formatDate(document.createdAt)}</span>
        </div>

        {isProcessing ? (
          <div className="mb-4">
            <UploadProgressBar
              compact
              stage={document.progressStage || 'embedding'}
              percent={document.progressPercent ?? 55}
              message={
                document.progressMessage ||
                'Extracting text, embedding chunks with Ollama, and indexing in Qdrant...'
              }
            />
          </div>
        ) : null}

        {document.processingStatus === 'failed' && document.errorMessage ? (
          <p className="text-xs text-red-600 dark:text-red-400 mb-4 line-clamp-2">
            {document.errorMessage}
          </p>
        ) : null}
      </div>

      <div className="flex items-center justify-between gap-2 pt-3 border-t border-slate-100 dark:border-slate-800/80">
        <Button
          variant="primary"
          size="sm"
          disabled={!isReady}
          loading={isStartingChat}
          onClick={() => onOpenChat(document)}
        >
          <MessageSquare className="w-3.5 h-3.5" />
          <span>Open Chat</span>
        </Button>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => onDelete(document)}
          aria-label={`Delete ${document.originalName}`}
          className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span>Delete</span>
        </Button>
      </div>
    </div>
  );
};

export default DocumentCard;
