import { Router } from 'express';
import {
  uploadDocument,
  getDocumentUploadProgress,
  getUserDocuments,
  getDocumentById,
  deleteDocument
} from '../controllers/documentController.js';
import { authenticate } from '../middleware/authMiddleware.js';
import { uploadSingleDocument } from '../middleware/uploadMiddleware.js';

const router = Router();

router.use(authenticate);

router.get('/upload-progress/:uploadId', getDocumentUploadProgress);
router.post('/upload', uploadSingleDocument, uploadDocument);
router.get('/', getUserDocuments);
router.get('/:id', getDocumentById);
router.delete('/:id', deleteDocument);

export default router;
