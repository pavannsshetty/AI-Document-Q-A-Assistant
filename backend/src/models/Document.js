import mongoose from 'mongoose';

const documentSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    originalName: {
      type: String,
      required: true,
      trim: true
    },
    storedName: {
      type: String,
      default: null
    },
    fileType: {
      type: String,
      enum: ['pdf', 'docx', 'txt'],
      required: true
    },
    fileSize: {
      type: Number,
      required: true
    },
    extractedTextLength: {
      type: Number,
      default: 0
    },
    chunkCount: {
      type: Number,
      default: 0
    },
    processingStatus: {
      type: String,
      enum: ['processing', 'completed', 'failed'],
      default: 'processing',
      index: true
    },
    errorMessage: {
      type: String,
      default: null
    }
  },
  {
    timestamps: true
  }
);

export const Document = mongoose.models.Document || mongoose.model('Document', documentSchema);
