import mongoose from 'mongoose';

const sourceSubSchema = new mongoose.Schema(
  {
    documentId: {
      type: String,
      required: true
    },
    filename: {
      type: String,
      required: true
    },
    page: {
      type: Number,
      default: null
    },
    chunkIndex: {
      type: Number,
      required: true
    },
    score: {
      type: Number,
      required: true
    }
  },
  { _id: false }
);

const messageSchema = new mongoose.Schema(
  {
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Conversation',
      required: true,
      index: true
    },
    role: {
      type: String,
      enum: ['user', 'assistant'],
      required: true
    },
    content: {
      type: String,
      required: true
    },
    sources: {
      type: [sourceSubSchema],
      default: []
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  },
  {
    versionKey: false
  }
);

export const Message = mongoose.models.Message || mongoose.model('Message', messageSchema);
