import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller.js';
import { authenticateJWT } from '../middlewares/auth.js';

const router = Router();

router.post('/register', AuthController.register);
router.post('/login', AuthController.login);
router.get('/me', authenticateJWT, AuthController.getMe);
router.post('/link-wallet', authenticateJWT, AuthController.linkWallet);

export default router;
