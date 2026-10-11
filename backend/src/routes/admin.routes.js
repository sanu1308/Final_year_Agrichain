import { Router } from 'express';
import { AdminController } from '../controllers/admin.controller.js';
import { authenticateJWT, authorizeRoles } from '../middlewares/auth.js';

const router = Router();

router.use(authenticateJWT);
router.use(authorizeRoles(['ADMIN']));

router.get('/stats', AdminController.getStats);
router.get('/price-spread', AdminController.getPriceSpread);
router.patch('/verify-user/:id', AdminController.verifyUser);

export default router;
