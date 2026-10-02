import mongoose from 'mongoose';

const pageTextSubSchema = new mongoose.Schema(
  {
    page: {
      type: Number,
      default: null
    },
    text: {
      type: String,
      required: true
    }
  },
  { _id: false }
);

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
    extractedPages: {
      type: [pageTextSubSchema],
      default: [],
      select: false
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
