import React from 'react';
import { SourceReference } from './SourceReference.jsx';
import { formatDateTime } from '../utils/formatters.js';

export const ChatMessage = ({ message }) => {
  const isUser = message.role === 'user';

  return (
    <div
      className={`flex flex-col ${
        isUser ? 'items-end' : 'items-start'
      } w-full`}
    >
      <div className="flex items-center gap-2 mb-1 text-xs text-slate-500 dark:text-slate-400">
        <span className="font-medium text-slate-700 dark:text-slate-300">
          {isUser ? 'You' : 'Document Q&A Assistant'}
        </span>
        {message.createdAt ? (
          <>
            <span aria-hidden="true">·</span>
            <span className="tabular-nums">{formatDateTime(message.createdAt)}</span>
          </>
        ) : null}
      </div>

      <div
        className={`max-w-3xl rounded-xl px-4 py-3 text-sm leading-relaxed ${
          isUser
            ? 'bg-[#0AAF29] text-white'
            : 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-800'
        }`}
      >
        <div className="whitespace-pre-wrap break-words">{message.content}</div>
        {!isUser && Array.isArray(message.sources) && message.sources.length > 0 ? (
          <SourceReference sources={message.sources} />
        ) : null}
      </div>
    </div>
  );
};

export default ChatMessage;
