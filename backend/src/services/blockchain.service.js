import { getContractInstance, provider } from '../lib/web3.js';

export class BlockchainService {
  /**
   * Checks whether a batch exists on the currently active smart contract without throwing reverts
   */
  static async checkBatchExists(blockchainBatchId) {
    try {
      if (!blockchainBatchId || isNaN(Number(blockchainBatchId)) || Number(blockchainBatchId) <= 0) {
        return false;
      }
      const contract = getContractInstance();
      const total = await contract.getTotalBatches();
      if (BigInt(blockchainBatchId) > total) {
        return false;
      }
      const rawBatch = await contract.getBatch(BigInt(blockchainBatchId));
      return Boolean(rawBatch && rawBatch.exists);
    } catch (err) {
      return false;
    }
  }

  /**
   * Fetches batch data directly from the smart contract
   */
  static async fetchOnChainBatch(blockchainBatchId) {
    try {
      if (!blockchainBatchId || isNaN(Number(blockchainBatchId)) || Number(blockchainBatchId) <= 0) {
        return null;
      }
      const contract = getContractInstance();
      const total = await contract.getTotalBatches();
      if (BigInt(blockchainBatchId) > total) {
        return null;
      }

      const rawBatch = await contract.getBatch(BigInt(blockchainBatchId));

      if (!rawBatch || !rawBatch.exists) {
        return null;
      }

      return {
        id: Number(rawBatch.id),
        productName: rawBatch.productName,
        origin: rawBatch.origin,
        farmer: rawBatch.farmer,
        currentOwner: rawBatch.currentOwner,
        quantity: Number(rawBatch.quantity),
        remainingQuantity: Number(rawBatch.quantity),
        unit: rawBatch.unit,
        grade: Number(rawBatch.grade),
        currentPrice: Number(rawBatch.currentPrice),
        status: Number(rawBatch.status),
        metadataHash: rawBatch.metadataHash,
        createdAt: Number(rawBatch.createdAt),
        exists: rawBatch.exists,
        parentBatchId: Number(rawBatch.parentBatchId || 0),
      };
    } catch (err) {
      console.warn(`Could not query blockchain for batchId ${blockchainBatchId}:`, err.message);
      return null;
    }
  }

  /**
   * Fetches the complete immutable custody handover history from the smart contract
   */
  static async fetchOnChainHistory(blockchainBatchId) {
    try {
      if (!blockchainBatchId || isNaN(Number(blockchainBatchId)) || Number(blockchainBatchId) <= 0) {
        return [];
      }
      const contract = getContractInstance();
      const total = await contract.getTotalBatches();
      if (BigInt(blockchainBatchId) > total) {
        return [];
      }

      const rawHistory = await contract.getBatchHistory(BigInt(blockchainBatchId));

      return rawHistory.map((item) => ({
        from: item.from,
        to: item.to,
        price: Number(item.price),
        pricePerUnit: Number(item.price) / 100,
        status: Number(item.status),
        location: item.location,
        timestamp: Number(item.timestamp),
        notes: item.notes,
        quantity: Number(item.quantity),
      }));
    } catch (err) {
      console.warn(`Could not query blockchain history for batchId ${blockchainBatchId}:`, err.message);
      return [];
    }
  }

  /**
   * Verifies transaction on-chain by hash
   */
  static async verifyTransaction(txHash) {
    try {
      const receipt = await provider.getTransactionReceipt(txHash);
      if (receipt && receipt.status === 1) {
        return {
          verified: true,
          blockNumber: receipt.blockNumber,
          from: receipt.from,
        };
      }
      return { verified: false };
    } catch (err) {
      console.error('Error verifying transaction hash:', err.message);
      return { verified: false };
    }
  }

  /**
   * Verifies that a mined transaction emitted an event for the expected batch.
   * The contract remains the source of truth for the operation type.
   */
  static async verifyBatchTransaction(txHash, blockchainBatchId) {
    try {
      const receipt = await provider.getTransactionReceipt(txHash);

      if (!receipt || receipt.status !== 1) {
        return { verified: false };
      }

      const contract = getContractInstance();
      const expectedBatchId = Number(blockchainBatchId);
      const supportedEvents = new Set([
        'BatchCreated',
        'BatchTransferred',
        'PurchaseAccepted',
        'BatchStatusUpdated',
        'BatchRecalled',
      ]);

      for (const log of receipt.logs) {
        try {
          const parsed = contract.interface.parseLog(log);
          if (!parsed || !supportedEvents.has(parsed.name)) continue;

          const parsedBatchId = parsed.args?.batchId;
          if (parsedBatchId !== undefined && Number(parsedBatchId) === expectedBatchId) {
            return {
              verified: true,
              blockNumber: receipt.blockNumber,
              from: receipt.from,
              eventName: parsed.name,
            };
          }
        } catch {
          // Ignore logs emitted by other contracts in the same transaction.
        }
      }

      return { verified: false, from: receipt?.from };
    } catch (err) {
      console.error('Error verifying batch transaction:', err.message);
      return { verified: false };
    }
  }

  static async getMinimumPurchaseQuantity() {
    const contract = getContractInstance();
    return Number(await contract.minPurchaseQuantity());
  }

  static async verifyPurchaseLotTransaction({
    txHash,
    parentBatchId,
    buyerWallet,
    sellerWallet,
    purchaseQuantity,
    expectedPrice,
  }) {
    const receipt = await provider.getTransactionReceipt(txHash);
    if (!receipt || receipt.status !== 1) {
      return { verified: false, reason: 'Transaction was not mined successfully' };
    }

    const contract = getContractInstance();
    let lotPurchase = null;
    for (const log of receipt.logs) {
      try {
        const parsed = contract.interface.parseLog(log);
        if (parsed?.name === 'LotPurchased') {
          lotPurchase = parsed.args;
          break;
        }
      } catch {
        // Ignore unrelated logs in the receipt.
      }
    }

    if (!lotPurchase) {
      return { verified: false, reason: 'LotPurchased event was not found' };
    }

    const matches = (actual, expected) =>
      actual?.toString().toLowerCase() === expected?.toString().toLowerCase();
    if (
      !matches(lotPurchase.parentBatchId, parentBatchId) ||
      !matches(lotPurchase.buyer, buyerWallet) ||
      !matches(lotPurchase.seller, sellerWallet) ||
      !matches(lotPurchase.quantity, purchaseQuantity) ||
      !matches(lotPurchase.price, expectedPrice)
    ) {
      return { verified: false, reason: 'LotPurchased values do not match the requested purchase' };
    }

    const childBatchId = Number(lotPurchase.newBatchId);
    const childBatch = await this.fetchOnChainBatch(childBatchId);
    const parentBatch = await this.fetchOnChainBatch(parentBatchId);

    if (!childBatch || !parentBatch || childBatch.parentBatchId !== Number(parentBatchId)) {
      return { verified: false, reason: 'On-chain parent-child lot relationship is invalid' };
    }
    if (
      childBatch.quantity !== Number(purchaseQuantity) ||
      childBatch.currentOwner.toLowerCase() !== buyerWallet.toLowerCase() ||
      parentBatch.currentOwner.toLowerCase() !== sellerWallet.toLowerCase()
    ) {
      return { verified: false, reason: 'On-chain lot ownership or quantity does not match' };
    }

    return {
      verified: true,
      blockNumber: receipt.blockNumber,
      from: receipt.from,
      childBatchId,
      parentBatch,
      childBatch,
    };
  }
}
