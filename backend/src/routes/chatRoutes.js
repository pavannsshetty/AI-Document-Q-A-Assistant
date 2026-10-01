import { Router } from 'express';
import {
  askQuestion,
  createConversation,
  getUserConversations,
  getConversationById,
  deleteConversation
} from '../controllers/chatController.js';
import { authenticate } from '../middleware/authMiddleware.js';

const router = Router();

router.use(authenticate);

router.post('/', askQuestion);
router.post('/conversations', createConversation);
router.get('/conversations', getUserConversations);
router.get('/conversations/:conversationId', getConversationById);
router.delete('/conversations/:conversationId', deleteConversation);

export default router;
