import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { MessageSquare, Trash2, ArrowLeft, Plus } from 'lucide-react';
import {
  documentApi,
  chatApi,
  extractApiErrorMessage
} from '../services/api.js';
import { AppLayout } from '../layouts/AppLayout.jsx';
import { Button } from '../components/Button.jsx';
import { Modal } from '../components/Modal.jsx';
import { LoadingSpinner } from '../components/LoadingSpinner.jsx';
import { ErrorMessage } from '../components/ErrorMessage.jsx';
import {
  formatFileSize,
  formatDateTime,
  formatNumber
} from '../utils/formatters.js';

export const DocumentDetailPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  const [document, setDocument] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [startingChat, setStartingChat] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const loadDocumentDetails = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const response = await documentApi.getById(id);
      setDocument(response.document);
      setConversations(
        Array.isArray(response.conversations) ? response.conversations : []
      );
    } catch (err) {
      setError(extractApiErrorMessage(err, 'Failed to load document details.'));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadDocumentDetails();
  }, [loadDocumentDetails]);

  const handleStartNewChat = async () => {
    if (!document) {
      return;
    }
    try {
      setStartingChat(true);
      setError('');
      const response = await chatApi.createConversation({
        documentId: document.id || document._id,
        title: `Chat: ${document.originalName}`
      });
      const convId =
        response?.conversation?.id || response?.conversation?._id;
      if (convId) {
        navigate(`/chat/${convId}`);
      }
    } catch (err) {
      setError(
        extractApiErrorMessage(err, 'Unable to start a new chat conversation.')
      );
    } finally {
      setStartingChat(false);
    }
  };

  const handleDeleteDocument = async () => {
    if (!document) {
      return;
    }
    try {
      setDeleting(true);
      await documentApi.remove(document.id || document._id);
      navigate('/dashboard');
    } catch (err) {
      setError(extractApiErrorMessage(err, 'Failed to delete document.'));
      setDeleteModalOpen(false);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <AppLayout
      breadcrumbs={[
        { label: 'Documents', to: '/dashboard' },
        { label: document?.originalName || 'Document Details' }
      ]}
      headerAction={
        document?.processingStatus === 'completed' ? (
          <Button
            variant="primary"
            onClick={handleStartNewChat}
            loading={startingChat}
          >
            <MessageSquare className="w-4 h-4" />
            <span>Start Chat</span>
          </Button>
        ) : null
      }
    >
      <div className="p-6 max-w-5xl w-full mx-auto space-y-6">
        <div>
          <Link
            to="/dashboard"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 mb-3"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Documents</span>
          </Link>
        </div>

        <ErrorMessage
          message={error}
          onDismiss={() => setError('')}
          onRetry={loadDocumentDetails}
        />

        {loading ? (
          <LoadingSpinner label="Loading document metadata..." />
        ) : document ? (
          <>
            <div className="p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-5 border-b border-slate-200 dark:border-slate-800">
                <div className="min-w-0">
                  <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 break-words">
                    {document.originalName}
                  </h1>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500 dark:text-slate-400 mt-1.5">
                    <span
                      className={`font-medium capitalize ${
                        document.processingStatus === 'completed'
                          ? 'text-[#0AAF29]'
                          : document.processingStatus === 'processing'
                          ? 'text-amber-600 dark:text-amber-400'
                          : 'text-red-600 dark:text-red-400'
                      }`}
                    >
                      {document.processingStatus}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="uppercase font-mono">
                      {document.fileType}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="tabular-nums">
                      Uploaded {formatDateTime(document.createdAt)}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    variant="primary"
                    disabled={document.processingStatus !== 'completed'}
                    loading={startingChat}
                    onClick={handleStartNewChat}
                  >
                    <MessageSquare className="w-4 h-4" />
                    <span>Start Chat</span>
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setDeleteModalOpen(true)}
                    className="text-red-600 hover:text-red-700 dark:text-red-400"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>Delete</span>
                  </Button>
                </div>
              </div>

              <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                <div>
                  <dt className="text-xs text-slate-500 dark:text-slate-400 mb-1">
                    Document Name
                  </dt>
                  <dd className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                    {document.originalName}
                  </dd>
                </div>

                <div>
                  <dt className="text-xs text-slate-500 dark:text-slate-400 mb-1">
                    File Type
                  </dt>
                  <dd className="text-sm font-mono uppercase text-slate-900 dark:text-slate-100">
                    {document.fileType}
                  </dd>
                </div>

                <div>
                  <dt className="text-xs text-slate-500 dark:text-slate-400 mb-1">
                    File Size
                  </dt>
                  <dd className="text-sm font-mono tabular-nums text-slate-900 dark:text-slate-100">
                    {formatFileSize(document.fileSize)}
                  </dd>
                </div>

                <div>
                  <dt className="text-xs text-slate-500 dark:text-slate-400 mb-1">
                    Upload Date
                  </dt>
                  <dd className="text-sm tabular-nums text-slate-900 dark:text-slate-100">
                    {formatDateTime(document.createdAt)}
                  </dd>
                </div>

                <div>
                  <dt className="text-xs text-slate-500 dark:text-slate-400 mb-1">
                    Processing Status
                  </dt>
                  <dd className="text-sm font-medium capitalize text-slate-900 dark:text-slate-100">
                    {document.processingStatus}
                  </dd>
                </div>

                <div>
                  <dt className="text-xs text-slate-500 dark:text-slate-400 mb-1">
                    Extracted Text Length
                  </dt>
                  <dd className="text-sm font-mono tabular-nums text-slate-900 dark:text-slate-100">
                    {formatNumber(document.extractedTextLength)} characters
                  </dd>
                </div>

                <div>
                  <dt className="text-xs text-slate-500 dark:text-slate-400 mb-1">
                    Chunk Count
                  </dt>
                  <dd className="text-sm font-mono tabular-nums text-slate-900 dark:text-slate-100">
                    {formatNumber(document.chunkCount)} chunks in Qdrant
                  </dd>
                </div>
              </dl>

              {document.errorMessage ? (
                <div className="pt-4 border-t border-slate-200 dark:border-slate-800">
                  <p className="text-xs font-medium text-red-600 dark:text-red-400">
                    Processing Error: {document.errorMessage}
                  </p>
                </div>
              ) : null}
            </div>

            <div className="p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                    Conversations for this Document
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Continue an existing Q&amp;A thread or start a new conversation.
                  </p>
                </div>

                {document.processingStatus === 'completed' ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleStartNewChat}
                    loading={startingChat}
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>New Conversation</span>
                  </Button>
                ) : null}
              </div>

              {conversations.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400 py-4">
                  No conversations started for this document yet. Click &ldquo;Start Chat&rdquo; above to ask your first question.
                </p>
              ) : (
                <div className="divide-y divide-slate-200 dark:divide-slate-800">
                  {conversations.map((conv) => (
                    <div
                      key={conv.id || conv._id}
                      className="flex items-center justify-between py-3 gap-4"
                    >
                      <div className="min-w-0">
                        <Link
                          to={`/chat/${conv.id || conv._id}`}
                          className="text-sm font-medium text-slate-900 dark:text-slate-100 hover:text-[#0AAF29] dark:hover:text-[#0AAF29] truncate block"
                        >
                          {conv.title}
                        </Link>
                        <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums mt-0.5">
                          Last active {formatDateTime(conv.updatedAt)}
                        </p>
                      </div>

                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => navigate(`/chat/${conv.id || conv._id}`)}
                      >
                        Open Chat
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        ) : null}
      </div>

      <Modal
        isOpen={deleteModalOpen}
        onClose={() => {
          if (!deleting) {
            setDeleteModalOpen(false);
          }
        }}
        title="Delete Document"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setDeleteModalOpen(false)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={handleDeleteDocument}
              loading={deleting}
            >
              Delete Permanently
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
          Delete{' '}
          <strong className="font-semibold text-slate-900 dark:text-white">
            {document?.originalName}
          </strong>{' '}
          and remove all Qdrant vectors and conversation history?
        </p>
      </Modal>
    </AppLayout>
  );
};

export default DocumentDetailPage;
