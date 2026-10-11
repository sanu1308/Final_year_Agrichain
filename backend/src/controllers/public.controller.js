import { Batch } from '../models/Batch.js';
import { ScanLog } from '../models/ScanLog.js';
import { BlockchainService } from '../services/blockchain.service.js';

const ON_CHAIN_STATUS = {
  0: 'HARVESTED',
  1: 'IN_TRANSIT',
  2: 'WITH_DISTRIBUTOR',
  3: 'WITH_RETAILER',
  4: 'SOLD',
  5: 'RECALLED',
};

function normalizeAddress(address) {
  return typeof address === 'string' ? address.toLowerCase() : null;
}

function normalizeStatus(status) {
  return status === 'IN_TRANSIT_TO_RETAILER' ? 'WITH_RETAILER' : status;
}

function derivePricing(events) {
  const pricing = {
    currency: 'INR',
    farmerPricePerUnit: null,
    distributorPurchasePricePerUnit: null,
    distributorSellingPricePerUnit: null,
    retailerPurchasePricePerUnit: null,
    retailerSellingPricePerUnit: null,
  };

  for (const event of events) {
    const price = Number.isFinite(event.pricePerUnit)
      ? event.pricePerUnit
      : null;
    if (price === null) continue;

    const role = event.actor?.role;

    if (event.eventType === 'CREATION' && pricing.farmerPricePerUnit === null) {
      pricing.farmerPricePerUnit = price;
    } else if (event.eventType === 'TRANSFER_OF_CUSTODY') {
      if (role === 'DISTRIBUTOR' && pricing.distributorPurchasePricePerUnit === null) {
        pricing.distributorPurchasePricePerUnit = price;
      } else if (role === 'RETAILER' && pricing.retailerPurchasePricePerUnit === null) {
        pricing.retailerPurchasePricePerUnit = price;
      }
    } else if (event.eventType === 'PRICE_UPDATE') {
      if (role === 'DISTRIBUTOR') {
        pricing.distributorSellingPricePerUnit = price;
      } else if (role === 'RETAILER') {
        pricing.retailerSellingPricePerUnit = price;
      }
    }
  }

  return pricing;
}

function compareNumber(left, right) {
  return Number.isFinite(left) && Number.isFinite(right) && Math.abs(left - right) < 0.000001;
}

export class PublicController {
  /**
   * Universal Public Verification endpoint for Consumers and Auditors.
   * Zero-authentication, zero-wallet required.
   */
  static async verifyBatch(req, res) {
    try {
      const { batchId } = req.params;

      const isNumeric = !isNaN(Number(batchId));
      const queryConditions = [{ _id: batchId }];
      if (isNumeric) {
        queryConditions.push({ blockchainBatchId: Number(batchId) });
      }

      const batch = await Batch.findOne({ $or: queryConditions })
        .populate('farmer', 'name organization isVerified physicalAddress')
        .populate({
          path: 'events',
          options: { sort: { timestamp: 1 } },
          populate: { path: 'actor', select: 'name role organization' },
        });

      if (!batch) {
        res.status(404).json({ error: 'Batch not found in registry' });
        return;
      }

      // Fetch immutable on-chain truth
      let onChainData = null;
      let onChainHistory = [];
      let integrityStatus = 'OFF_CHAIN_ONLY';
      let integrityDiscrepancies = [];

      if (batch.blockchainBatchId) {
        onChainData = await BlockchainService.fetchOnChainBatch(batch.blockchainBatchId);
        onChainHistory = await BlockchainService.fetchOnChainHistory(batch.blockchainBatchId);

        if (onChainData) {
          integrityStatus = 'VERIFIED';

          // Tamper detection checks: compare off-chain database vs on-chain Smart Contract
          if (
            normalizeAddress(batch.farmerWallet) !== normalizeAddress(onChainData.farmer)
          ) {
            integrityStatus = 'TAMPERED';
            integrityDiscrepancies.push('Farmer wallet does not match on-chain record');
          }

          if (
            normalizeAddress(batch.currentOwnerWallet) !== normalizeAddress(onChainData.currentOwner)
          ) {
            integrityStatus = 'TAMPERED';
            integrityDiscrepancies.push('Current owner wallet does not match on-chain record');
          }

          if (
            batch.productName.toLowerCase().trim() !==
            onChainData.productName.toLowerCase().trim()
          ) {
            integrityStatus = 'TAMPERED';
            integrityDiscrepancies.push('Product name differs from on-chain record');
          }

          if (batch.quantity !== onChainData.quantity) {
            integrityStatus = 'TAMPERED';
            integrityDiscrepancies.push('Quantity differs from on-chain record');
          }

          if (batch.unit !== onChainData.unit) {
            integrityStatus = 'TAMPERED';
            integrityDiscrepancies.push('Unit differs from on-chain record');
          }

          const onChainStatus = ON_CHAIN_STATUS[onChainData.status];
          if (normalizeStatus(batch.status) !== onChainStatus) {
            integrityStatus = 'TAMPERED';
            integrityDiscrepancies.push('Status differs from on-chain record');
          }

          const mongoEvents = batch.events || [];
          const latestMongoEvent = mongoEvents[mongoEvents.length - 1];
          const currentPricePerUnit = onChainData.currentPrice / 100;
          if (
            latestMongoEvent &&
            !compareNumber(latestMongoEvent.pricePerUnit, currentPricePerUnit)
          ) {
            integrityStatus = 'TAMPERED';
            integrityDiscrepancies.push('Current price differs from on-chain record');
          }

          if (mongoEvents.length !== onChainHistory.length) {
            integrityStatus = 'TAMPERED';
            integrityDiscrepancies.push('Supply-chain history count differs from on-chain record');
          } else {
            mongoEvents.forEach((event, index) => {
              const chainEvent = onChainHistory[index];
              if (!chainEvent) return;

              if (
                normalizeAddress(event.fromAddress) !== normalizeAddress(chainEvent.from) ||
                normalizeAddress(event.toAddress) !== normalizeAddress(chainEvent.to) ||
                !compareNumber(event.pricePerUnit, chainEvent.pricePerUnit) ||
                event.location !== chainEvent.location
              ) {
                integrityStatus = 'TAMPERED';
                integrityDiscrepancies.push(`Supply-chain history entry ${index + 1} differs from on-chain record`);
              }
            });
          }
        }
      }

      // Preserve the existing hop response while exposing semantic pricing fields.
      const pricingHops = (batch.events || []).map((ev, idx) => ({
        stage: ev.eventType,
        handler: ev.actor?.name || (idx === 0 ? 'Farmer' : 'Intermediary'),
        role: ev.actor?.role || (idx === 0 ? 'FARMER' : 'LOGISTICS'),
        price: ev.pricePerUnit,
        quantity: ev.quantity,
        currency: 'INR',
        location: ev.location,
        timestamp: ev.timestamp,
        txHash: ev.txHash,
      }));
      const pricing = derivePricing(batch.events || []);
      const originalQuantity = onChainHistory[0]?.quantity ?? onChainData?.quantity ?? batch.originalQuantity ?? batch.quantity;
      const quantityHistory = onChainHistory.map((record, index) => ({
        sequence: index + 1,
        from: record.from,
        to: record.to,
        quantity: record.quantity,
        pricePerUnit: record.pricePerUnit,
        location: record.location,
        timestamp: record.timestamp,
        notes: record.notes,
      }));

      // Parse images safely
      let parsedImages = [];
      try {
        if (typeof batch.images === 'string') {
          parsedImages = JSON.parse(batch.images || '[]');
        } else if (Array.isArray(batch.images)) {
          parsedImages = batch.images;
        }
      } catch (e) {
        parsedImages = Array.isArray(batch.images) ? batch.images : [];
      }

      const batchObj = batch.toObject ? batch.toObject() : batch;

      res.json({
        batch: {
          ...batchObj,
          images: parsedImages,
        },
        onChainData,
        onChainHistory,
        integrityStatus,
        integrityDiscrepancies,
        pricingHops,
        pricing,
        quantity: {
          original: originalQuantity,
          remaining: onChainData?.quantity ?? batch.remainingQuantity ?? batch.quantity,
          sold: originalQuantity - (onChainData?.quantity ?? batch.remainingQuantity ?? batch.quantity),
          unit: batch.unit,
        },
        quantityHistory,
        lineage: {
          parentBatchId: onChainData?.parentBatchId || batch.parentBatchId || null,
        },
      });
    } catch (error) {
      console.error('Verify batch error:', error);
      res.status(500).json({ error: 'Failed to verify batch', message: error.message });
    }
  }

  /**
   * Logs a scan event when a consumer scans a physical QR code
   */
  static async recordScan(req, res) {
    try {
      const { batchId } = req.params;
      const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
      const userAgent = req.headers['user-agent'];

      const isNumeric = !isNaN(Number(batchId));
      const queryConditions = [{ _id: batchId }];
      if (isNumeric) {
        queryConditions.push({ blockchainBatchId: Number(batchId) });
      }

      const batch = await Batch.findOne({ $or: queryConditions });

      if (batch) {
        await ScanLog.create({
          batchId: batch.id,
          ipAddress: typeof ip === 'string' ? ip : '127.0.0.1',
          userAgent: userAgent || 'Unknown',
          city: 'Demo City',
          country: 'Demo Country',
        });
      }

      res.status(200).json({ status: 'Scan recorded' });
    } catch (err) {
      res.status(500).json({ error: 'Failed to log scan', message: err.message });
    }
  }
}
