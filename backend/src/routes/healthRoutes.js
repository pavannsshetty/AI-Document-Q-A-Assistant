import { Router } from 'express';
import { getSystemHealth } from '../controllers/healthController.js';

const router = Router();

router.get('/', getSystemHealth);

export default router;
