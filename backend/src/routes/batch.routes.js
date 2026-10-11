//```js
import { Router } from 'express';
import { BatchController } from '../controllers/batch.controller.js';
import {
  requireAuth,
  requireRole,
  requireWalletMatch,
} from '../middlewares/auth.js';

const router = Router();

// Create a new batch draft
router.post(
  '/',
  requireAuth,
  requireRole('FARMER', 'ADMIN'),
  requireWalletMatch,
  BatchController.createDraft
);

// Delete a failed, unconfirmed batch draft
router.delete(
  '/:id/failed-draft',
  requireAuth,
  requireRole('FARMER', 'ADMIN'),
  BatchController.deleteFailedDraft
);

// Confirm a batch after successful blockchain transaction
router.put(
  '/:id/confirm',
  requireAuth,
  requireRole('FARMER', 'ADMIN'),
  requireWalletMatch,
  BatchController.confirmOnChain
);

// Get all batches accessible to the logged-in user
router.get(
  '/',
  requireAuth,
  BatchController.getBatches
);

// Get one batch by ID
router.get(
  '/:id',
  requireAuth,
  BatchController.getBatchById
);

// Transfer batch custody
router.post(
  '/:id/transfer',
  requireAuth,
  requireRole('FARMER', 'DISTRIBUTOR', 'RETAILER', 'ADMIN'),
  requireWalletMatch,
  BatchController.recordCustodyEvent
);

// Validate purchase lot
router.post(
  '/:id/purchase-lot/validate',
  requireAuth,
  requireRole('DISTRIBUTOR', 'RETAILER'),
  requireWalletMatch,
  BatchController.validateLotPurchase
);

// Purchase a lot
router.post(
  '/:id/purchase-lot',
  requireAuth,
  requireRole('DISTRIBUTOR', 'RETAILER'),
  requireWalletMatch,
  BatchController.purchaseLot
);

export default router;