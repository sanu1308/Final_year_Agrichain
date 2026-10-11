import { ethers } from 'ethers';
import { z } from 'zod';
import { User } from '../models/User.js';
import { Batch } from '../models/Batch.js';
import { SupplyChainEvent } from '../models/SupplyChainEvent.js';
import { QRCodeService } from '../services/qr.service.js';
import { BlockchainService } from '../services/blockchain.service.js';
import { getContractInstance } from '../lib/web3.js';

const createBatchSchema = z.object({
  productName: z.string().min(2),
  category: z.string().min(2),
  description: z.string().optional(),
  originLocation: z.string().min(2),
  farmName: z.string().min(2),
  farmLatitude: z.number().optional(),
  farmLongitude: z.number().optional(),
  quantity: z.number().positive(),
  unit: z.string().default('kg'),
  qualityGrade: z
    .enum([
      'GRADE_A',
      'GRADE_B',
      'GRADE_C',
      'PREMIUM',
      'EXPORT_QUALITY',
    ])
    .default('GRADE_A'),
  harvestDate: z.string(),
  expiryDate: z.string().optional(),
  images: z.array(z.string()).default([]),
  farmerWallet: z.string().optional(),
  initialPrice: z.number().positive(), // currently stored as price value / 100 from blockchain
});

const confirmBatchSchema = z.object({
  blockchainBatchId: z.number().int().positive(),
  creationTxHash: z.string().min(10),
  blockNumber: z.number().optional(),
});

const transferEventSchema = z.object({
  toAddress: z.string().optional(),
  pricePerUnit: z.number().positive(),
  newStatus: z.enum([
    'HARVESTED',
    'IN_TRANSIT',
    'WITH_DISTRIBUTOR',
    'IN_TRANSIT_TO_RETAILER',
    'WITH_RETAILER',
    'SOLD',
    'RECALLED',
  ]),
  location: z.string(),
  notes: z.string().optional(),
  temperatureC: z.number().optional(),
  humidityPercent: z.number().optional(),
  txHash: z.string().min(10, 'A valid confirmed transaction hash is required'),
});

const lotPurchaseSchema = z.object({
  purchaseQuantity: z.number().int().positive(),
  pricePerUnit: z.number().positive(),
  newStatus: z.enum(['IN_TRANSIT', 'WITH_DISTRIBUTOR', 'WITH_RETAILER']),
  location: z.string().min(1),
  notes: z.string().optional(),
  txHash: z.string().min(10),
});

const chainStatusMap = {
  0: 'HARVESTED',
  1: 'IN_TRANSIT',
  2: 'WITH_DISTRIBUTOR',
  3: 'WITH_RETAILER',
  4: 'SOLD',
  5: 'RECALLED',
};

export class BatchController {
  /**
   * Farmer creates an initial batch draft in database
   */
  static async createDraft(req, res) {
    try {
      if (
        !req.user ||
        (req.user.role !== 'FARMER' && req.user.role !== 'ADMIN')
      ) {
        res.status(403).json({
          error: 'Only farmers can register produce batches',
        });
        return;
      }

      const farmerUser = await User.findById(req.user.id);

      if (!farmerUser || farmerUser.isActive === false) {
        res.status(403).json({
          error: 'User account is inactive or not found',
        });
        return;
      }

      if (!farmerUser.walletAddress) {
        res.status(400).json({
          error:
            'Please connect and register your MetaMask wallet before performing blockchain transactions.',
        });
        return;
      }

      const parsed = createBatchSchema.safeParse(req.body);

      if (!parsed.success) {
        res.status(400).json({
          error: 'Validation failed',
          details: parsed.error.format(),
        });
        return;
      }

      const data = parsed.data;

      const normalizedFarmerWallet = ethers.getAddress(
        farmerUser.walletAddress
      );

      if (data.farmerWallet) {
        try {
          const clientWallet = ethers.getAddress(data.farmerWallet);

          if (clientWallet !== normalizedFarmerWallet) {
            res.status(403).json({
              error:
                'Please connect the MetaMask wallet registered with this account.',
              registeredWallet: normalizedFarmerWallet,
              attemptedWallet: clientWallet,
            });
            return;
          }
        } catch {
          res.status(400).json({
            error: 'Invalid farmer wallet address format',
          });
          return;
        }
      }

      const batch = await Batch.create({
        productName: data.productName,
        category: data.category,
        description: data.description,
        originLocation: data.originLocation,
        farmName: data.farmName,
        farmLatitude: data.farmLatitude,
        farmLongitude: data.farmLongitude,
        quantity: data.quantity,
        originalQuantity: data.quantity,
        remainingQuantity: data.quantity,
        soldQuantity: 0,
        unit: data.unit,
        qualityGrade: data.qualityGrade,
        harvestDate: new Date(data.harvestDate),
        expiryDate: data.expiryDate
          ? new Date(data.expiryDate)
          : null,
        images: data.images,
        farmerId: req.user.id,
        farmerWallet: normalizedFarmerWallet,
        currentOwnerWallet: normalizedFarmerWallet,
        status: 'HARVESTED',
      });

      res.status(201).json({
        message:
          'Draft batch created. Please sign on-chain transaction to register.',
        batch,
      });
    } catch (error) {
      console.error('Create draft error:', error);

      res.status(500).json({
        error: 'Failed to create batch',
        message: error.message,
      });
    }
  }

  
  /**
   * Safely delete a failed, unconfirmed database draft.
   *
   * A draft is eligible for deletion only if it:
   * - belongs to the logged-in farmer (or the user is an ADMIN);
   * - has never been confirmed on-chain;
   * - has no blockchain transaction hash or block number;
   * - has no blockchain batch ID;
   * - has no recorded supply-chain events.
   */
  static async deleteFailedDraft(req, res) {
    try {
      const { id } = req.params;
      const userId = String(req.user?.id ?? '');
      const userRole = req.user?.role;

      if (!userId) {
        res.status(401).json({
          error: 'Authentication is required.',
        });
        return;
      }

      const batch = await Batch.findById(id);

      if (!batch) {
        res.status(404).json({
          error: 'Batch draft not found.',
        });
        return;
      }

      // Only the batch's farmer or an admin may delete it.
      if (
        String(batch.farmerId) !== userId &&
        userRole !== 'ADMIN'
      ) {
        res.status(403).json({
          error: 'You are not allowed to delete this batch draft.',
        });
        return;
      }

      // Never delete a batch already marked as synchronized.
      // Also protect records containing any blockchain reference.
      const hasBlockchainReference =
        batch.isSyncWithChain === true ||
        batch.blockchainBatchId !== null &&
          batch.blockchainBatchId !== undefined ||
        Boolean(batch.creationTxHash) ||
        batch.blockNumber !== null &&
          batch.blockNumber !== undefined;

      if (hasBlockchainReference) {
        res.status(409).json({
          error:
            'This batch contains blockchain references and cannot be deleted as a failed draft.',
        });
        return;
      }

      // A recorded event means this record may already be in use.
      const existingEvent = await SupplyChainEvent.findOne({
        batchId: batch.id,
      });

      if (existingEvent) {
        res.status(409).json({
          error:
            'This batch has supply-chain events and cannot be deleted.',
        });
        return;
      }

      // Delete only the eligible database draft.
      await Batch.deleteOne({
        _id: batch._id,
        isSyncWithChain: { $ne: true },
        blockchainBatchId: { $exists: false },
        creationTxHash: null,
        blockNumber: null,
      });

      res.json({
        success: true,
        message: 'Failed batch draft deleted successfully.',
        deletedBatchId: batch.id,
      });
    } catch (error) {
      console.error('Delete failed draft error:', error);

      res.status(500).json({
        error: 'Failed to delete batch draft.',
        message: error.message,
      });
    }
  }


  /**
   * After the on-chain createBatch tx succeeds in MetaMask,
   * link blockchainBatchId & generate QR code
   */
  static async confirmOnChain(req, res) {
    try {
      const { id } = req.params;

      const parsed = confirmBatchSchema.safeParse(req.body);

      if (!parsed.success) {
        res.status(400).json({
          error: 'Invalid confirmation payload',
          details: parsed.error.format(),
        });
        return;
      }

      const {
        blockchainBatchId,
        creationTxHash,
        blockNumber,
      } = parsed.data;

      // ---------------------------------------------------------
      // 1. Verify batch exists in database
      // ---------------------------------------------------------
      const existing = await Batch.findById(id);

      if (!existing) {
        res.status(404).json({
          error: 'Batch draft not found',
        });
        return;
      }

      // ---------------------------------------------------------
      // 2. Verify farmer account
      // ---------------------------------------------------------
      const farmerUser = await User.findById(req.user.id);

      if (!farmerUser || farmerUser.isActive === false) {
        res.status(403).json({
          error: 'User account is inactive or not found',
        });
        return;
      }

      if (
        existing.farmerId !== req.user.id &&
        req.user.role !== 'ADMIN'
      ) {
        res.status(403).json({
          error: 'Only the creating farmer can confirm this batch.',
        });
        return;
      }

      if (!farmerUser.walletAddress) {
        res.status(400).json({
          error:
            'Please connect and register your MetaMask wallet before performing blockchain transactions.',
        });
        return;
      }

      const registeredFarmerWallet = ethers.getAddress(
        farmerUser.walletAddress
      );

      // ---------------------------------------------------------
      // 3. Verify blockchain transaction
      // ---------------------------------------------------------
      const txVerification = await BlockchainService.verifyBatchTransaction(
        creationTxHash,
        blockchainBatchId
      );

      if (!txVerification.verified) {
        res.status(400).json({
          error:
            'Creation transaction verification failed or reverted on-chain.',
        });
        return;
      }

      if (txVerification.eventName !== 'BatchCreated') {
        res.status(400).json({
          error: 'Creation transaction does not contain a BatchCreated event for this batch.',
        });
        return;
      }

      // Verify transaction sender
      if (
        txVerification.from &&
        ethers.getAddress(txVerification.from) !==
          registeredFarmerWallet
      ) {
        res.status(403).json({
          error:
            'Please connect the MetaMask wallet registered with this account.',
          registeredWallet: registeredFarmerWallet,
          transactionSender: ethers.getAddress(
            txVerification.from
          ),
        });
        return;
      }

      // ---------------------------------------------------------
      // 4. Fetch and verify batch from blockchain
      // ---------------------------------------------------------
      const onChainData =
        await BlockchainService.fetchOnChainBatch(
          blockchainBatchId
        );

      if (!onChainData) {
        res.status(400).json({
          error: `Batch #${blockchainBatchId} does not exist on the blockchain. Transaction must be successfully confirmed on-chain before database registration.`,
        });
        return;
      }

      // Verify farmer on blockchain
      if (
        ethers.getAddress(onChainData.farmer) !==
        registeredFarmerWallet
      ) {
        res.status(403).json({
          error:
            'Please connect the MetaMask wallet registered with this account.',
          registeredWallet: registeredFarmerWallet,
          onChainFarmer: ethers.getAddress(
            onChainData.farmer
          ),
        });
        return;
      }

      // ---------------------------------------------------------
      // 5. Generate QR code
      // ---------------------------------------------------------
      const qrCodeUrl =
        await QRCodeService.generateBatchQRCode(
          blockchainBatchId
        );

      // Blockchain stores price as integer * 100.
      // Convert it back to the application's price-per-unit value.
      const initialPrice =
        Number(onChainData.currentPrice) / 100;

      // ---------------------------------------------------------
      // 6. Clear stale blockchain batch references
      // ---------------------------------------------------------
      await Batch.updateMany(
        {
          _id: { $ne: id },
          blockchainBatchId,
        },
        {
          $unset: {
            blockchainBatchId: 1,
          },
          $set: {
            isSyncWithChain: false,
          },
        }
      );

      // ---------------------------------------------------------
      // 7. Update MongoDB batch
      // ---------------------------------------------------------
      const updatedBatch =
        await Batch.findByIdAndUpdate(
          id,
          {
            blockchainBatchId,
            creationTxHash,
            blockNumber: blockNumber || null,
            qrCodeUrl,
            isSyncWithChain: true,
            status: 'HARVESTED',
            farmerWallet: registeredFarmerWallet,
            currentOwnerWallet: registeredFarmerWallet,
            originalQuantity: existing.originalQuantity ?? existing.quantity,
            remainingQuantity: existing.quantity,
            soldQuantity: 0,
          },
          {
            new: true,
          }
        );

      if (!updatedBatch) {
        res.status(404).json({
          error: 'Batch could not be updated after confirmation.',
        });
        return;
      }

      // ---------------------------------------------------------
      // 8. Record initial CREATION event
      // ---------------------------------------------------------
      const existingCreationEvent = await SupplyChainEvent.findOne({
        batchId: updatedBatch.id,
        txHash: creationTxHash,
      });

      if (!existingCreationEvent) {
        await SupplyChainEvent.create({
          batchId: updatedBatch.id,
          eventType: 'CREATION',
          fromAddress:
            '0x0000000000000000000000000000000000000000',
          toAddress: updatedBatch.farmerWallet,
          pricePerUnit: initialPrice,
          currency: 'INR',
          quantity: updatedBatch.quantity,
          location: updatedBatch.originLocation,
          notes: `Harvested at ${updatedBatch.farmName}. Registered on-chain (Batch #${blockchainBatchId})`,
          txHash: creationTxHash,
          actorId: req.user?.id,
        });
      }

      // ---------------------------------------------------------
      // 9. IMPORTANT:
      // Re-fetch batch WITH events after creating the event.
      //
      // Earlier code returned `updatedBatch` directly.
      // That object did not contain the newly-created event,
      // therefore frontend received:
      //
      // activeQRModal.events[0] === undefined
      //
      // and showed "Price unavailable".
      // ---------------------------------------------------------
      const batchWithEvents =
        await Batch.findById(id)
          .populate(
            'farmer',
            'name organization email'
          )
          .populate({
            path: 'events',
            options: {
              sort: {
                timestamp: -1,
              },
              limit: 1,
            },
          });

      // ---------------------------------------------------------
      // 10. Return fully populated batch
      // ---------------------------------------------------------
      res.json({
        message:
          'Batch successfully verified and published to blockchain',
        batch: batchWithEvents,
      });
    } catch (error) {
      console.error(
        'Confirm on-chain error:',
        error
      );

      res.status(500).json({
        error:
          'Failed to confirm on-chain batch',
        message: error.message,
      });
    }
  }

  /**
   * Retrieves list of batches with optional role-based filtering
   */
  static async getBatches(req, res) {
    try {
      const user = req.user;

      let filter = {};

      if (user) {
        if (user.role === 'FARMER') {
          filter = {
            farmerId: user.id,
          };
        } else if (
          user.role === 'DISTRIBUTOR' ||
          user.role === 'RETAILER'
        ) {
          if (user.walletAddress) {
            const normalized = ethers.getAddress(
              user.walletAddress
            );

            filter = {
              $or: [
                {
                  currentOwnerWallet: normalized,
                },
                {
                  currentOwnerWallet:
                    normalized.toLowerCase(),
                },
                {
                  isSyncWithChain: true,
                },
              ],
            };
          }
        }
      }

      let totalBatchesOnChain = null;

      try {
        const contract = getContractInstance();

        totalBatchesOnChain = Number(
          await contract.getTotalBatches()
        );
      } catch (e) {
        // Contract might be unavailable temporarily.
      }

      const batches = await Batch.find(filter)
        .sort({
          createdAt: -1,
        })
        .populate(
          'farmer',
          'name organization email'
        )
        .populate({
          path: 'events',
          options: {
            sort: {
              timestamp: -1,
            },
            limit: 1,
          },
        });

      const enrichedBatches = batches.map(
        (batch) => {
          const bObj = batch.toObject
            ? batch.toObject()
            : batch;

          let isStaleOnChain = false;

          if (
            totalBatchesOnChain !== null &&
            bObj.blockchainBatchId
          ) {
            isStaleOnChain =
              bObj.blockchainBatchId >
              totalBatchesOnChain;
          }

          return {
            ...bObj,
            isStaleOnChain,
          };
        }
      );

      res.json({
        batches: enrichedBatches,
        totalBatchesOnChain,
      });
    } catch (error) {
      res.status(500).json({
        error: 'Failed to fetch batches',
        message: error.message,
      });
    }
  }

  /**
   * Get batch details by DB ID or Blockchain Batch ID
   */
  static async getBatchById(req, res) {
    try {
      const { id } = req.params;

      const isNumeric = !isNaN(Number(id));

      const queryConditions = [
        {
          _id: id,
        },
      ];

      if (isNumeric) {
        queryConditions.push({
          blockchainBatchId: Number(id),
        });
      }

      const batch = await Batch.findOne({
        $or: queryConditions,
      })
        .populate(
          'farmer',
          'id name organization isVerified email'
        )
        .populate({
          path: 'events',
          options: {
            sort: {
              timestamp: 1,
            },
          },
        });

      if (!batch) {
        res.status(404).json({
          error: 'Batch not found',
        });
        return;
      }

      // Check on-chain sync
      let onChainData = null;

      if (batch.blockchainBatchId) {
        onChainData =
          await BlockchainService.fetchOnChainBatch(
            batch.blockchainBatchId
          );
      }

      res.json({
        batch,
        onChainData,
      });
    } catch (error) {
      res.status(500).json({
        error: 'Failed to get batch',
        message: error.message,
      });
    }
  }

  /**
   * Records a custody transfer or price/status update event
   */
  static async recordCustodyEvent(req, res) {
    try {
      const { id } = req.params;

      const parsed =
        transferEventSchema.safeParse(req.body);

      if (!parsed.success) {
        res.status(400).json({
          error: 'Invalid event data',
          details: parsed.error.format(),
        });
        return;
      }

      const isNumeric = !isNaN(Number(id));

      const queryConditions = [
        {
          _id: id,
        },
      ];

      if (isNumeric) {
        queryConditions.push({
          blockchainBatchId: Number(id),
        });
      }

      const batch = await Batch.findOne({
        $or: queryConditions,
      });

      if (!batch) {
        res.status(404).json({
          error: 'Batch not found',
        });
        return;
      }

      const actor = await User.findById(
        req.user.id
      );

      if (!actor || actor.isActive === false) {
        res.status(403).json({
          error:
            'User account is inactive or not found',
        });
        return;
      }

      if (!actor.walletAddress) {
        res.status(400).json({
          error:
            'Please connect and register your MetaMask wallet before performing blockchain transactions.',
        });
        return;
      }

      const actorWallet = ethers.getAddress(
        actor.walletAddress
      );

      const {
        toAddress,
        pricePerUnit,
        newStatus,
        location,
        notes,
        temperatureC,
        humidityPercent,
        txHash,
      } = parsed.data;
      let txVerification = null;

      // ---------------------------------------------------------
      // Verify blockchain transaction
      // ---------------------------------------------------------
      if (txHash) {
        txVerification = await BlockchainService.verifyBatchTransaction(
          txHash,
          batch.blockchainBatchId
        );

        if (!txVerification.verified) {
          res.status(400).json({
            error:
              'Transaction verification failed. The transaction was either not found or reverted on-chain.',
          });
          return;
        }

        if (
          txVerification.eventName !== 'BatchTransferred' &&
          txVerification.eventName !== 'PurchaseAccepted' &&
          txVerification.eventName !== 'BatchStatusUpdated'
        ) {
          res.status(400).json({
            error:
              'Transaction does not represent a custody purchase or price/status update for this batch.',
          });
          return;
        }

        if (
          txVerification.from &&
          ethers.getAddress(txVerification.from) !==
            actorWallet
        ) {
          res.status(403).json({
            error:
              'Please connect the MetaMask wallet registered with this account.',
            registeredWallet: actorWallet,
            transactionSender:
              ethers.getAddress(
                txVerification.from
              ),
          });
          return;
        }
      }

      let confirmedOwner = toAddress
        ? ethers.getAddress(toAddress)
        : ethers.getAddress(
            batch.currentOwnerWallet
          );

      let confirmedPrice = pricePerUnit;
      let confirmedStatus = newStatus;

      // ---------------------------------------------------------
      // Synchronize state from blockchain
      // ---------------------------------------------------------
      if (batch.blockchainBatchId) {
        const onChainData =
          await BlockchainService.fetchOnChainBatch(
            batch.blockchainBatchId
          );

        if (!onChainData) {
          res.status(400).json({
            error: `Stale Blockchain Batch: Batch #${batch.blockchainBatchId} does not exist on the currently active smart contract. This record is from an older blockchain session. Please create a new batch.`,
            isStaleBatch: true,
          });
          return;
        }

        confirmedOwner = ethers.getAddress(
          onChainData.currentOwner
        );

        confirmedPrice =
          Number(onChainData.currentPrice) / 100;

        const statusMap = {
          0: 'HARVESTED',
          1: 'IN_TRANSIT',
          2: 'WITH_DISTRIBUTOR',
          3: 'WITH_RETAILER',
          4: 'SOLD',
          5: 'RECALLED',
        };

        if (statusMap[onChainData.status]) {
          confirmedStatus =
            statusMap[onChainData.status];
        }
      }

      const currentBatchOwner =
        ethers.getAddress(
          batch.currentOwnerWallet
        );

      const isTransfer =
        currentBatchOwner !== confirmedOwner;

      const eventType = isTransfer
        ? 'TRANSFER_OF_CUSTODY'
        : 'PRICE_UPDATE';

      if (
        txHash &&
        ((isTransfer && !['BatchTransferred', 'PurchaseAccepted'].includes(txVerification?.eventName)) ||
          (!isTransfer && txVerification?.eventName !== 'BatchStatusUpdated'))
      ) {
        res.status(400).json({
          error: 'Transaction operation does not match the requested batch event.',
        });
        return;
      }

      // ---------------------------------------------------------
      // Role-based business rules
      // ---------------------------------------------------------
      if (req.user.role === 'FARMER') {
        if (isTransfer) {
          res.status(403).json({
            error:
              'Farmers cannot purchase batches or act as distributors/retailers.',
          });
          return;
        }

        if (currentBatchOwner !== actorWallet) {
          res.status(403).json({
            error:
              'Only the registered batch owner can update batch details.',
          });
          return;
        }
      } else if (
        req.user.role === 'DISTRIBUTOR'
      ) {
        if (isTransfer) {
          if (batch.status !== 'HARVESTED') {
            res.status(400).json({
              error:
                'Distributors can only purchase batches from farmers (batch status must be HARVESTED).',
            });
            return;
          }

          if (
            currentBatchOwner === actorWallet
          ) {
            res.status(400).json({
              error:
                'Current owner cannot purchase their own batch.',
            });
            return;
          }

          if (confirmedOwner !== actorWallet) {
            res.status(403).json({
              error:
                'Please connect the MetaMask wallet registered with this account.',
              registeredWallet: actorWallet,
              onChainOwner: confirmedOwner,
            });
            return;
          }
        } else {
          if (
            currentBatchOwner !== actorWallet
          ) {
            res.status(403).json({
              error: `Only the registered batch owner (${currentBatchOwner}) can update the selling price. Your registered wallet is ${actorWallet}.`,
            });
            return;
          }
        }
      } else if (
        req.user.role === 'RETAILER'
      ) {
        if (isTransfer) {
          if (
            batch.status !==
              'WITH_DISTRIBUTOR' &&
            batch.status !== 'IN_TRANSIT' &&
            batch.status !==
              'IN_TRANSIT_TO_RETAILER'
          ) {
            res.status(400).json({
              error:
                'Retailers can only purchase batches from distributors, not directly from farmers.',
            });
            return;
          }

          if (
            currentBatchOwner === actorWallet
          ) {
            res.status(400).json({
              error:
                'Current owner cannot purchase their own batch.',
            });
            return;
          }

          if (confirmedOwner !== actorWallet) {
            res.status(403).json({
              error:
                'Please connect the MetaMask wallet registered with this account.',
              registeredWallet: actorWallet,
              onChainOwner: confirmedOwner,
            });
            return;
          }
        } else {
          if (
            currentBatchOwner !== actorWallet
          ) {
            res.status(403).json({
              error: `Only the registered batch owner (${currentBatchOwner}) can update the selling price. Your registered wallet is ${actorWallet}.`,
            });
            return;
          }
        }
      }

      const existingEvent = await SupplyChainEvent.findOne({
        batchId: batch.id,
        txHash,
      });

      if (existingEvent) {
        res.json({
          message: 'Blockchain event was already recorded',
          event: existingEvent,
          batch,
        });
        return;
      }

      // ---------------------------------------------------------
      // Create event log
      // ---------------------------------------------------------
      const event =
        await SupplyChainEvent.create({
          batchId: batch.id,
          eventType,
          fromAddress: currentBatchOwner,
          toAddress: confirmedOwner,
          pricePerUnit: confirmedPrice,
          currency: 'INR',
          quantity: batch.remainingQuantity ?? batch.quantity,
          location,
          notes,
          temperatureC,
          humidityPercent,
          txHash,
          actorId: req.user?.id,
        });

      // ---------------------------------------------------------
      // Update batch current owner & status
      // ---------------------------------------------------------
      const updatedBatch =
        await Batch.findByIdAndUpdate(
          batch.id,
          {
            currentOwnerWallet: confirmedOwner,
            status: confirmedStatus,
          },
          {
            new: true,
          }
        );

      res.json({
        message: isTransfer
          ? 'Custody transfer recorded successfully'
          : 'Price update recorded successfully',
        event,
        batch: updatedBatch,
      });
    } catch (error) {
      console.error(
        'Record custody event error:',
        error
      );

      res.status(500).json({
        error: 'Failed to record event',
        message: error.message,
      });
    }
  }

  static async purchaseLot(req, res) {
    try {
      const { id } = req.params;
      const parsed = lotPurchaseSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Invalid lot purchase data', details: parsed.error.format() });
        return;
      }

      const isNumeric = !isNaN(Number(id));
      const queryConditions = [{ _id: id }];
      if (isNumeric) queryConditions.push({ blockchainBatchId: Number(id) });
      const parent = await Batch.findOne({ $or: queryConditions });
      if (!parent || !parent.blockchainBatchId) {
        res.status(404).json({ error: 'Blockchain parent batch not found' });
        return;
      }

      const actor = await User.findById(req.user.id);
      if (!actor?.walletAddress || !['DISTRIBUTOR', 'RETAILER'].includes(req.user.role)) {
        res.status(403).json({ error: 'Only distributors and retailers can purchase lots' });
        return;
      }
      const buyerWallet = ethers.getAddress(actor.walletAddress);
      const onChainParent = await BlockchainService.fetchOnChainBatch(parent.blockchainBatchId);
      if (!onChainParent) {
        res.status(400).json({ error: 'Parent batch is not available on the active blockchain contract' });
        return;
      }

      const sellerWallet = ethers.getAddress(onChainParent.currentOwner);
      if (sellerWallet === buyerWallet) {
        res.status(400).json({ error: 'Current owner cannot purchase their own lot' });
        return;
      }
      const expectedRole = onChainParent.status === 0 ? 'DISTRIBUTOR' : 'RETAILER';
      if (req.user.role !== expectedRole) {
        res.status(403).json({ error: `Only a ${expectedRole.toLowerCase()} can purchase this lot` });
        return;
      }

      const { purchaseQuantity, pricePerUnit, newStatus, location, notes, txHash } = parsed.data;
      const availableQuantity = onChainParent.quantity;
      const minimumQuantity = await BlockchainService.getMinimumPurchaseQuantity();
      if (purchaseQuantity > availableQuantity) {
        res.status(400).json({ error: 'Purchase quantity exceeds available quantity' });
        return;
      }
      if (purchaseQuantity < availableQuantity) {
        if (purchaseQuantity < minimumQuantity) {
          res.status(400).json({ error: `Purchase quantity must be at least ${minimumQuantity}` });
          return;
        }
        if (availableQuantity - purchaseQuantity < minimumQuantity) {
          res.status(400).json({ error: `Remaining quantity must be at least ${minimumQuantity}` });
          return;
        }
      }

      const expectedPriceCents = onChainParent.currentPrice;
      if (Math.round(pricePerUnit * 100) !== expectedPriceCents) {
        res.status(400).json({ error: 'Price does not match the current on-chain offered price' });
        return;
      }

      const verification = await BlockchainService.verifyPurchaseLotTransaction({
        txHash,
        parentBatchId: parent.blockchainBatchId,
        buyerWallet,
        sellerWallet,
        purchaseQuantity,
        expectedPrice: expectedPriceCents,
      });
      if (!verification.verified) {
        res.status(400).json({ error: verification.reason || 'Lot purchase transaction could not be verified' });
        return;
      }

      if (chainStatusMap[verification.childBatch.status] !== newStatus) {
        res.status(400).json({ error: 'Submitted status does not match the verified child lot status' });
        return;
      }

      const existingEvent = await SupplyChainEvent.findOne({ batchId: parent.id, txHash });
      if (existingEvent) {
        const existingChild = await Batch.findOne({ blockchainBatchId: verification.childBatchId });
        res.json({ message: 'Lot purchase was already recorded', event: existingEvent, parent, child: existingChild });
        return;
      }

      const parentOriginalQuantity = parent.originalQuantity ?? parent.quantity;
      const parentRemainingQuantity = verification.parentBatch.quantity;
      const parentSoldQuantity = parentOriginalQuantity - parentRemainingQuantity;
      const parentStatus = chainStatusMap[verification.parentBatch.status] || parent.status;
      const childStatus = chainStatusMap[verification.childBatch.status] || newStatus;

      const updatedParent = await Batch.findByIdAndUpdate(
        parent.id,
        {
          quantity: parentRemainingQuantity,
          originalQuantity: parentOriginalQuantity,
          remainingQuantity: parentRemainingQuantity,
          soldQuantity: parentSoldQuantity,
          status: parentStatus,
          currentOwnerWallet: sellerWallet,
          isSyncWithChain: true,
        },
        { new: true }
      );

      const child = await Batch.create({
        blockchainBatchId: verification.childBatchId,
        parentBatchId: parent.blockchainBatchId,
        productName: parent.productName,
        category: parent.category,
        description: parent.description,
        originLocation: parent.originLocation,
        farmName: parent.farmName,
        farmLatitude: parent.farmLatitude,
        farmLongitude: parent.farmLongitude,
        quantity: purchaseQuantity,
        originalQuantity: purchaseQuantity,
        remainingQuantity: purchaseQuantity,
        soldQuantity: 0,
        unit: parent.unit,
        qualityGrade: parent.qualityGrade,
        harvestDate: parent.harvestDate,
        expiryDate: parent.expiryDate,
        images: parent.images,
        qrCodeUrl: await QRCodeService.generateBatchQRCode(verification.childBatchId),
        status: childStatus,
        farmerId: parent.farmerId,
        farmerWallet: parent.farmerWallet,
        currentOwnerWallet: buyerWallet,
        creationTxHash: txHash,
        blockNumber: verification.blockNumber,
        isSyncWithChain: true,
      });

      const eventData = {
        eventType: 'TRANSFER_OF_CUSTODY',
        fromAddress: sellerWallet,
        toAddress: buyerWallet,
        pricePerUnit,
        currency: 'INR',
        quantity: purchaseQuantity,
        location,
        notes,
        txHash,
        actorId: req.user.id,
      };
      const event = await SupplyChainEvent.create({ batchId: parent.id, ...eventData });
      await SupplyChainEvent.create({ batchId: child.id, ...eventData });

      res.status(201).json({ message: 'Partial lot purchase recorded successfully', event, parent: updatedParent, child });
    } catch (error) {
      console.error('Purchase lot error:', error);
      res.status(500).json({ error: 'Failed to record lot purchase', message: error.message });
    }
  }

  static async validateLotPurchase(req, res) {
    try {
      const { id } = req.params;
      const parsed = lotPurchaseSchema.omit({ txHash: true }).safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Invalid lot purchase data', details: parsed.error.format() });
        return;
      }

      const queryConditions = [{ _id: id }];
      if (!isNaN(Number(id))) queryConditions.push({ blockchainBatchId: Number(id) });
      const parent = await Batch.findOne({ $or: queryConditions });
      const actor = await User.findById(req.user.id);
      if (!parent || !parent.blockchainBatchId || !actor?.walletAddress || !['DISTRIBUTOR', 'RETAILER'].includes(req.user.role)) {
        res.status(403).json({ error: 'This account cannot validate a lot purchase for this batch' });
        return;
      }

      const buyerWallet = ethers.getAddress(actor.walletAddress);
      const onChainParent = await BlockchainService.fetchOnChainBatch(parent.blockchainBatchId);
      if (!onChainParent) {
        res.status(400).json({ error: 'Parent batch is not available on the active blockchain contract' });
        return;
      }
      const sellerWallet = ethers.getAddress(onChainParent.currentOwner);
      if (sellerWallet === buyerWallet) {
        res.status(400).json({ error: 'Current owner cannot purchase their own lot' });
        return;
      }

      const expectedRole = onChainParent.status === 0 ? 'DISTRIBUTOR' : 'RETAILER';
      if (req.user.role !== expectedRole) {
        res.status(403).json({ error: `Only a ${expectedRole.toLowerCase()} can purchase this lot` });
        return;
      }

      const { purchaseQuantity, pricePerUnit, newStatus } = parsed.data;
      const minimumQuantity = await BlockchainService.getMinimumPurchaseQuantity();
      if (purchaseQuantity > onChainParent.quantity) {
        res.status(400).json({ error: 'Purchase quantity exceeds available quantity' });
        return;
      }
      if (purchaseQuantity < onChainParent.quantity && (purchaseQuantity < minimumQuantity || onChainParent.quantity - purchaseQuantity < minimumQuantity)) {
        res.status(400).json({ error: `Partial purchases require at least ${minimumQuantity} units purchased and remaining` });
        return;
      }
      if (Math.round(pricePerUnit * 100) !== onChainParent.currentPrice) {
        res.status(400).json({ error: 'Price does not match the current on-chain offered price' });
        return;
      }
      const expectedStatus = expectedRole === 'DISTRIBUTOR' ? ['IN_TRANSIT', 'WITH_DISTRIBUTOR'] : ['WITH_RETAILER'];
      if (!expectedStatus.includes(newStatus)) {
        res.status(400).json({ error: 'Status is not valid for this purchase role' });
        return;
      }

      res.json({
        valid: true,
        parentBatchId: parent.blockchainBatchId,
        sellerWallet,
        buyerWallet,
        availableQuantity: onChainParent.quantity,
        minimumQuantity,
        expectedPrice: onChainParent.currentPrice,
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to validate lot purchase', message: error.message });
    }
  }
}