import React from 'react';
import { FileText, Upload } from 'lucide-react';
import { DocumentCard } from './DocumentCard.jsx';
import { EmptyState } from './EmptyState.jsx';
import { Button } from './Button.jsx';

export const DocumentList = ({
  documents = [],
  onOpenChat,
  onDelete,
  onReindex = null,
  onOpenUpload,
  chatLoadingId = null,
  reindexingId = null,
  searchQuery = ''
}) => {
  if (!Array.isArray(documents) || documents.length === 0) {
    return (
      <EmptyState
        icon={FileText}
        title={
          searchQuery
            ? 'No matching documents found'
            : 'No documents uploaded yet'
        }
        description={
          searchQuery
            ? `No uploaded documents matched "${searchQuery}". Try clearing your search filter.`
            : 'Upload a PDF, DOCX, or TXT document to extract text, index local embeddings in Qdrant, and start asking questions with Ollama.'
        }
        action={
          !searchQuery && onOpenUpload ? (
            <Button variant="primary" onClick={onOpenUpload}>
              <Upload className="w-4 h-4" />
              <span>Upload Document</span>
            </Button>
          ) : null
        }
      />
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {documents.map((doc) => (
        <DocumentCard
          key={doc.id || doc._id}
          document={doc}
          onOpenChat={onOpenChat}
          onDelete={onDelete}
          onReindex={onReindex}
          chatLoadingId={chatLoadingId}
          reindexingId={reindexingId}
        />
      ))}
    </div>
  );
};

export default DocumentList;
