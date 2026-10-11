import { Router } from 'express';
import authRoutes from './auth.routes.js';
import batchRoutes from './batch.routes.js';
import publicRoutes from './public.routes.js';
import adminRoutes from './admin.routes.js';
import devFaucetRoutes from './devFaucet.routes.js';

const router = Router();

router.use('/auth', authRoutes);
router.use('/batches', batchRoutes);
router.use('/public', publicRoutes);
router.use('/admin', adminRoutes);
router.use('/dev/faucet', devFaucetRoutes);

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({
    status: 'online',
    service: 'AgriChain Backend API',
    timestamp: new Date().toISOString(),
  });
});

export default router;
