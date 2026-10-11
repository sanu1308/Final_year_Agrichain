import { Router } from 'express';
import { PublicController } from '../controllers/public.controller.js';

const router = Router();

// Consumer public verification route (zero login, zero wallet needed)
router.get('/verify/:batchId', PublicController.verifyBatch);

// Consumer QR scan logging
router.post('/scan/:batchId', PublicController.recordScan);

export default router;
