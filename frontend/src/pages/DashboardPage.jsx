import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, Search, FileUp } from 'lucide-react';
import {
  documentApi,
  chatApi,
  extractApiErrorMessage
} from '../services/api.js';
import { AppLayout } from '../layouts/AppLayout.jsx';
import { Button } from '../components/Button.jsx';
import { Input } from '../components/Input.jsx';
import { Modal } from '../components/Modal.jsx';
import { DocumentList } from '../components/DocumentList.jsx';
import { LoadingSpinner } from '../components/LoadingSpinner.jsx';
import { ErrorMessage } from '../components/ErrorMessage.jsx';
import { UploadProgressBar } from '../components/UploadProgressBar.jsx';
import { formatFileSize, formatNumber } from '../utils/formatters.js';

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
const ALLOWED_EXTENSIONS = ['.pdf', '.docx', '.txt'];

const INITIAL_PROGRESS_STATE = {
  active: false,
  stage: 'uploading',
  percent: 0,
  message: 'Preparing document upload...',
  loadedBytes: 0,
  totalBytes: 0,
  processedChunks: 0,
  totalChunks: 0,
  extractedTextLength: 0
};

export const DashboardPage = () => {
  const navigate = useNavigate();

  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadError, setUploadError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(INITIAL_PROGRESS_STATE);

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [chatLoadingId, setChatLoadingId] = useState(null);

  const pollIntervalRef = useRef(null);

  const stopProgressPolling = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      stopProgressPolling();
    };
  }, [stopProgressPolling]);

  const fetchDocuments = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const response = await documentApi.list();
      setDocuments(Array.isArray(response?.documents) ? response.documents : []);
    } catch (err) {
      setError(extractApiErrorMessage(err, 'Failed to load documents.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  const filteredDocuments = useMemo(() => {
    return documents.filter((doc) => {
      const matchesSearch = searchQuery.trim()
        ? String(doc.originalName || '')
            .toLowerCase()
            .includes(searchQuery.trim().toLowerCase())
        : true;
      const matchesStatus =
        statusFilter === 'all' ? true : doc.processingStatus === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [documents, searchQuery, statusFilter]);

  const totalChunks = useMemo(() => {
    return documents.reduce((sum, doc) => sum + Number(doc.chunkCount || 0), 0);
  }, [documents]);

  const handleFileSelection = (event) => {
    setUploadError('');
    setUploadProgress(INITIAL_PROGRESS_STATE);
    const file = event.target.files?.[0];
    if (!file) {
      setSelectedFile(null);
      return;
    }

    const lowerName = file.name.toLowerCase();
    const hasValidExt = ALLOWED_EXTENSIONS.some((ext) => lowerName.endsWith(ext));
    if (!hasValidExt) {
      setUploadError('Invalid file format. Only .pdf, .docx, and .txt files are allowed.');
      setSelectedFile(null);
      return;
    }

    if (file.size > MAX_UPLOAD_BYTES) {
      setUploadError('File exceeds the 20 MB maximum upload limit.');
      setSelectedFile(null);
      return;
    }

    setSelectedFile(file);
  };

  const startProgressPolling = (uploadId, fileSize) => {
    stopProgressPolling();
    pollIntervalRef.current = setInterval(async () => {
      try {
        const res = await documentApi.getUploadProgress(uploadId);
        const serverProgress = res?.progress;
        if (!serverProgress) {
          return;
        }

        setUploadProgress((prev) => ({
          ...prev,
          active: true,
          stage: serverProgress.stage || prev.stage,
          percent: Math.max(prev.percent, Number(serverProgress.percent || 0)),
          message: serverProgress.message || prev.message,
          processedChunks:
            serverProgress.processedChunks ?? prev.processedChunks,
          totalChunks: serverProgress.totalChunks ?? prev.totalChunks,
          extractedTextLength:
            serverProgress.extractedTextLength ?? prev.extractedTextLength,
          loadedBytes: fileSize,
          totalBytes: fileSize
        }));

        if (
          serverProgress.stage === 'completed' ||
          serverProgress.stage === 'failed'
        ) {
          stopProgressPolling();
        }
      } catch {
        return;
      }
    }, 350);
  };

  const handleUploadSubmit = async (event) => {
    event.preventDefault();
    if (!selectedFile) {
      setUploadError('Please choose a PDF, DOCX, or TXT file to upload.');
      return;
    }

    const uploadId = `upload_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const fileSize = selectedFile.size;

    try {
      setUploading(true);
      setUploadError('');
      setUploadProgress({
        active: true,
        stage: 'uploading',
        percent: 2,
        message: `Uploading ${selectedFile.name} to server...`,
        loadedBytes: 0,
        totalBytes: fileSize,
        processedChunks: 0,
        totalChunks: 0,
        extractedTextLength: 0
      });

      startProgressPolling(uploadId, fileSize);

      const response = await documentApi.upload(selectedFile, {
        uploadId,
        onUploadProgress: (progressEvent) => {
          const loaded = Number(progressEvent.loaded || 0);
          const total = Number(progressEvent.total || fileSize || 1);
          const transferRatio = Math.min(1, loaded / total);
          const uploadPhasePercent = Math.max(2, Math.round(transferRatio * 20));

          setUploadProgress((prev) => {
            if (prev.stage !== 'uploading') {
              return {
                ...prev,
                loadedBytes: total,
                totalBytes: total
              };
            }
            return {
              ...prev,
              loadedBytes: loaded,
              totalBytes: total,
              percent: Math.max(prev.percent, uploadPhasePercent),
              message:
                transferRatio < 1
                  ? `Uploading ${selectedFile.name} (${Math.round(transferRatio * 100)}%)...`
                  : 'Upload complete. Extracting text and indexing vectors...'
            };
          });
        }
      });

      stopProgressPolling();

      setUploadProgress((prev) => ({
        ...prev,
        active: true,
        stage: 'completed',
        percent: 100,
        loadedBytes: fileSize,
        totalBytes: fileSize,
        processedChunks: response?.document?.chunkCount || prev.totalChunks,
        totalChunks: response?.document?.chunkCount || prev.totalChunks,
        extractedTextLength:
          response?.document?.extractedTextLength || prev.extractedTextLength,
        message: 'Document uploaded and indexed successfully.'
      }));

      if (response?.document) {
        setDocuments((prev) => [response.document, ...prev]);
      } else {
        await fetchDocuments();
      }

      setSelectedFile(null);
      setUploadModalOpen(false);
      setUploadProgress(INITIAL_PROGRESS_STATE);
    } catch (err) {
      stopProgressPolling();
      const errMsg = extractApiErrorMessage(
        err,
        'Document upload and indexing failed. Ensure Ollama and Qdrant are running.'
      );
      setUploadError(errMsg);
      setUploadProgress((prev) => ({
        ...prev,
        active: true,
        stage: 'failed',
        message: errMsg
      }));
      await fetchDocuments();
    } finally {
      setUploading(false);
    }
  };

  const handleOpenChat = async (document) => {
    const docId = document.id || document._id;
    try {
      setChatLoadingId(docId);
      setError('');
      const listResponse = await chatApi.listConversations(docId);
      const existing = listResponse?.conversations?.[0];
      if (existing) {
        navigate(`/chat/${existing.id || existing._id}`);
        return;
      }

      const createdResponse = await chatApi.createConversation({
        documentId: docId,
        title: `Chat: ${document.originalName}`
      });
      const convId =
        createdResponse?.conversation?.id || createdResponse?.conversation?._id;
      if (convId) {
        navigate(`/chat/${convId}`);
      }
    } catch (err) {
      setError(
        extractApiErrorMessage(err, 'Unable to open chat for this document.')
      );
    } finally {
      setChatLoadingId(null);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) {
      return;
    }
    const docId = deleteTarget.id || deleteTarget._id;
    try {
      setDeleting(true);
      setError('');
      await documentApi.remove(docId);
      setDocuments((prev) =>
        prev.filter((item) => (item.id || item._id) !== docId)
      );
      setDeleteTarget(null);
    } catch (err) {
      setError(extractApiErrorMessage(err, 'Failed to delete document.'));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <AppLayout
      breadcrumbs={[{ label: 'Documents' }]}
      headerAction={
        <Button
          variant="primary"
          size="md"
          onClick={() => {
            setSelectedFile(null);
            setUploadError('');
            setUploadProgress(INITIAL_PROGRESS_STATE);
            setUploadModalOpen(true);
          }}
        >
          <Upload className="w-4 h-4" />
          <span>Upload Document</span>
        </Button>
      }
    >
      <div className="p-6 max-w-7xl w-full mx-auto space-y-6">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-5 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
              Document Knowledge Base
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
              Upload PDF, DOCX, and TXT files to index embeddings locally in Qdrant and query with Ollama.
            </p>
          </div>

          <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
            <span className="tabular-nums">
              <strong className="font-semibold text-slate-900 dark:text-slate-100">
                {formatNumber(documents.length)}
              </strong>{' '}
              documents
            </span>
            <span aria-hidden="true">·</span>
            <span className="tabular-nums">
              <strong className="font-semibold text-slate-900 dark:text-slate-100">
                {formatNumber(totalChunks)}
              </strong>{' '}
              indexed chunks
            </span>
          </div>
        </div>

        <ErrorMessage
          message={error}
          onDismiss={() => setError('')}
          onRetry={fetchDocuments}
        />

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
          <div className="w-full sm:max-w-sm">
            <Input
              id="document-search"
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search documents by filename..."
              icon={Search}
            />
          </div>

          <div className="flex items-center gap-1 p-1 bg-slate-200/70 dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 self-start sm:self-auto">
            {[
              { id: 'all', label: 'All' },
              { id: 'completed', label: 'Completed' },
              { id: 'processing', label: 'Processing' },
              { id: 'failed', label: 'Failed' }
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setStatusFilter(tab.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                  statusFilter === tab.id
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <LoadingSpinner label="Loading your documents..." />
        ) : (
          <DocumentList
            documents={filteredDocuments}
            onOpenChat={handleOpenChat}
            onDelete={(doc) => setDeleteTarget(doc)}
            onOpenUpload={() => {
              setSelectedFile(null);
              setUploadError('');
              setUploadProgress(INITIAL_PROGRESS_STATE);
              setUploadModalOpen(true);
            }}
            chatLoadingId={chatLoadingId}
            searchQuery={searchQuery}
          />
        )}
      </div>

      <Modal
        isOpen={uploadModalOpen}
        onClose={() => {
          if (!uploading) {
            setUploadModalOpen(false);
            setUploadProgress(INITIAL_PROGRESS_STATE);
          }
        }}
        title="Upload Document"
        maxWidth="max-w-xl"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setUploadModalOpen(false);
                setUploadProgress(INITIAL_PROGRESS_STATE);
              }}
              disabled={uploading}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleUploadSubmit}
              loading={uploading}
              disabled={!selectedFile}
            >
              Upload &amp; Index
            </Button>
          </>
        }
      >
        <form onSubmit={handleUploadSubmit} className="space-y-4">
          <ErrorMessage
            message={uploadError}
            onDismiss={() => setUploadError('')}
          />

          <label
            htmlFor="document-file-input"
            className={`flex flex-col items-center justify-center p-6 border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-xl transition-colors bg-slate-50/60 dark:bg-slate-950/40 text-center ${
              uploading
                ? 'opacity-60 cursor-not-allowed'
                : 'cursor-pointer hover:border-[#0AAF29] dark:hover:border-[#0AAF29]'
            }`}
          >
            <FileUp className="w-8 h-8 text-[#0AAF29] mb-2.5" />
            <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
              {selectedFile ? selectedFile.name : 'Choose a PDF, DOCX, or TXT file'}
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400 mt-1 tabular-nums">
              {selectedFile
                ? `${formatFileSize(selectedFile.size)} selected`
                : 'Supported formats: .pdf, .docx, .txt · Maximum size: 20 MB'}
            </span>
            <input
              id="document-file-input"
              type="file"
              accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
              onChange={handleFileSelection}
              disabled={uploading}
              className="sr-only"
            />
          </label>

          {uploading || uploadProgress.active ? (
            <UploadProgressBar
              stage={uploadProgress.stage}
              percent={uploadProgress.percent}
              message={uploadProgress.message}
              loadedBytes={uploadProgress.loadedBytes}
              totalBytes={uploadProgress.totalBytes}
              processedChunks={uploadProgress.processedChunks}
              totalChunks={uploadProgress.totalChunks}
              extractedTextLength={uploadProgress.extractedTextLength}
            />
          ) : null}
        </form>
      </Modal>

      <Modal
        isOpen={Boolean(deleteTarget)}
        onClose={() => {
          if (!deleting) {
            setDeleteTarget(null);
          }
        }}
        title="Delete Document"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setDeleteTarget(null)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={handleConfirmDelete}
              loading={deleting}
            >
              Delete Permanently
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
          Are you sure you want to delete{' '}
          <strong className="font-semibold text-slate-900 dark:text-white">
            {deleteTarget?.originalName}
          </strong>
          ? This will permanently remove its vector embeddings from Qdrant as well as all associated conversations and messages from MongoDB.
        </p>
      </Modal>
    </AppLayout>
  );
};

export default DashboardPage;
