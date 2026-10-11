import { Router } from 'express';
import { fundDevelopmentWallet } from '../services/devFaucet.service.js';

const router = Router();

router.post('/', async (req, res) => {
  try {
    const { walletAddress } = req.body;

    if (!walletAddress) {
      return res.status(400).json({
        error: 'walletAddress is required',
      });
    }

    const result = await fundDevelopmentWallet(walletAddress);

    return res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error('Development faucet error:', error);

    return res.status(400).json({
      success: false,
      error: error.message || 'Development faucet failed',
    });
  }
});

export default router;