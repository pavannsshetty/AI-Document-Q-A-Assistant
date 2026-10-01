const progressStore = new Map();

const PROGRESS_TTL_MS = 15 * 60 * 1000;

const cleanupExpiredEntries = () => {
  const now = Date.now();
  for (const [key, entry] of progressStore.entries()) {
    if (now - entry.updatedAtMs > PROGRESS_TTL_MS) {
      progressStore.delete(key);
    }
  }
};

export const initUploadProgress = ({ uploadId, userId, filename, fileSize = 0 }) => {
  if (!uploadId) {
    return null;
  }
  cleanupExpiredEntries();
  const now = new Date().toISOString();
  const state = {
    uploadId: String(uploadId),
    userId: String(userId),
    filename: String(filename || 'Document'),
    fileSize: Number(fileSize || 0),
    stage: 'uploading',
    percent: 15,
    message: 'File received by server. Preparing document parser...',
    processedChunks: 0,
    totalChunks: 0,
    extractedTextLength: 0,
    documentId: null,
    error: null,
    startedAt: now,
    updatedAt: now,
    updatedAtMs: Date.now()
  };
  progressStore.set(String(uploadId), state);
  return { ...state };
};

export const updateUploadProgress = (uploadId, updates = {}) => {
  if (!uploadId) {
    return null;
  }
  const key = String(uploadId);
  const existing = progressStore.get(key);
  if (!existing) {
    return null;
  }

  const updated = {
    ...existing,
    ...updates,
    percent:
      updates.percent !== undefined
        ? Math.max(0, Math.min(100, Math.round(Number(updates.percent))))
        : existing.percent,
    updatedAt: new Date().toISOString(),
    updatedAtMs: Date.now()
  };

  progressStore.set(key, updated);
  return { ...updated };
};

export const getUploadProgress = (uploadId, userId) => {
  if (!uploadId) {
    return null;
  }
  const existing = progressStore.get(String(uploadId));
  if (!existing) {
    return null;
  }
  if (userId && existing.userId !== String(userId)) {
    return null;
  }
  const { updatedAtMs, ...publicState } = existing;
  return publicState;
};
