import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Send, MessageSquare, FileText, Loader2 } from 'lucide-react';
import { chatApi, extractApiErrorMessage } from '../services/api.js';
import { AppLayout } from '../layouts/AppLayout.jsx';
import { Button } from '../components/Button.jsx';
import { ChatMessage } from '../components/ChatMessage.jsx';
import { LoadingSpinner } from '../components/LoadingSpinner.jsx';
import { EmptyState } from '../components/EmptyState.jsx';
import { ErrorMessage } from '../components/ErrorMessage.jsx';
import { formatFileSize, formatNumber } from '../utils/formatters.js';

export const ChatPage = () => {
  const { conversationId } = useParams();

  const [conversation, setConversation] = useState(null);
  const [document, setDocument] = useState(null);
  const [messages, setMessages] = useState([]);
  const [question, setQuestion] = useState('');
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  const fetchConversationData = useCallback(async () => {
    try {
      setLoadingInitial(true);
      setError('');
      const response = await chatApi.getConversation(conversationId);
      setConversation(response.conversation);
      setDocument(response.document);
      setMessages(Array.isArray(response.messages) ? response.messages : []);
    } catch (err) {
      setError(
        extractApiErrorMessage(err, 'Failed to load conversation history.')
      );
    } finally {
      setLoadingInitial(false);
    }
  }, [conversationId]);

  useEffect(() => {
    fetchConversationData();
  }, [fetchConversationData]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, sending, scrollToBottom]);

  const submitQuestion = async () => {
    const trimmedQuestion = question.trim();
    if (!trimmedQuestion || sending || !document) {
      return;
    }

    const tempUserMessage = {
      id: `temp-user-${Date.now()}`,
      role: 'user',
      content: trimmedQuestion,
      sources: [],
      createdAt: new Date().toISOString()
    };

    setQuestion('');
    setError('');
    setSending(true);
    setMessages((prev) => [...prev, tempUserMessage]);

    try {
      const response = await chatApi.askQuestion({
        documentId: document.id || document._id,
        conversationId,
        question: trimmedQuestion
      });

      const savedUserMsg = response.userMessage || tempUserMessage;
      const savedAssistantMsg = response.assistantMessage || {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: response.answer,
        sources: response.sources || [],
        createdAt: new Date().toISOString()
      };

      setMessages((prev) => [
        ...prev.filter((msg) => msg.id !== tempUserMessage.id),
        savedUserMsg,
        savedAssistantMsg
      ]);
    } catch (err) {
      setError(
        extractApiErrorMessage(
          err,
          'Failed to get an answer. Ensure Ollama and Qdrant are running.'
        )
      );
    } finally {
      setSending(false);
      textareaRef.current?.focus();
    }
  };

  const handleKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submitQuestion();
    }
  };

  const handleFormSubmit = (event) => {
    event.preventDefault();
    submitQuestion();
  };

  const docId = document?.id || document?._id;

  return (
    <AppLayout
      breadcrumbs={[
        { label: 'Documents', to: '/dashboard' },
        ...(document
          ? [{ label: document.originalName, to: `/documents/${docId}` }]
          : []),
        { label: conversation?.title || 'Document Chat' }
      ]}
      headerAction={
        docId ? (
          <Link
            to={`/documents/${docId}`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Document Info</span>
          </Link>
        ) : null
      }
    >
      <div className="flex-1 flex flex-col h-[calc(100vh-65px)]">
        {document ? (
          <div className="px-6 py-3 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-600 dark:text-slate-400">
              <span className="font-semibold text-slate-900 dark:text-slate-100">
                {document.originalName}
              </span>
              <span aria-hidden="true">·</span>
              <span className="uppercase font-mono">{document.fileType}</span>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">
                {formatFileSize(document.fileSize)}
              </span>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">
                {formatNumber(document.chunkCount)} chunks indexed
              </span>
            </div>

            <span className="text-xs text-[#0AAF29] font-medium">
              Local RAG Active (Qdrant + Ollama)
            </span>
          </div>
        ) : null}

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <div className="max-w-4xl mx-auto space-y-6">
            <ErrorMessage
              message={error}
              onDismiss={() => setError('')}
              onRetry={loadingInitial ? fetchConversationData : null}
            />

            {loadingInitial ? (
              <LoadingSpinner label="Loading conversation history..." />
            ) : messages.length === 0 ? (
              <EmptyState
                icon={MessageSquare}
                title={`Ask a question about ${document?.originalName || 'your document'}`}
                description="Your question will be embedded locally with Ollama, matched against document chunks in Qdrant, and answered strictly from retrieved context."
              />
            ) : (
              messages.map((msg) => (
                <ChatMessage key={msg.id || msg._id} message={msg} />
              ))
            )}

            {sending ? (
              <div className="flex items-center gap-2.5 text-xs text-slate-600 dark:text-slate-400 py-2">
                <Loader2 className="w-4 h-4 animate-spin text-[#0AAF29]" />
                <span>
                  Searching Qdrant vectors and generating answer with local Ollama LLM...
                </span>
              </div>
            ) : null}

            <div ref={messagesEndRef} />
          </div>
        </div>

        <div className="p-4 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800">
          <form
            onSubmit={handleFormSubmit}
            className="max-w-4xl mx-auto flex items-end gap-3"
          >
            <div className="flex-1">
              <label htmlFor="chat-question-input" className="sr-only">
                Ask a question about this document
              </label>
              <textarea
                id="chat-question-input"
                ref={textareaRef}
                rows={2}
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={sending || loadingInitial || !document}
                placeholder="Ask a question about the uploaded document... (Press Enter to send, Shift + Enter for new line)"
                className="w-full resize-none rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 text-sm px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#0AAF29] focus:border-transparent disabled:opacity-60"
              />
            </div>

            <Button
              type="submit"
              variant="primary"
              size="lg"
              loading={sending}
              disabled={!question.trim() || sending || loadingInitial || !document}
              aria-label="Send question"
            >
              <Send className="w-4 h-4" />
              <span>Send</span>
            </Button>
          </form>
        </div>
      </div>
    </AppLayout>
  );
};

export default ChatPage;
