import { Router } from 'express';
import {
  registerUser,
  loginUser,
  getCurrentUser
} from '../controllers/authController.js';
import { authenticate } from '../middleware/authMiddleware.js';

const router = Router();

router.post('/register', registerUser);
router.post('/login', loginUser);
router.get('/me', authenticate, getCurrentUser);

export default router;
