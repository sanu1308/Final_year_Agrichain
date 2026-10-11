import { User } from '../models/User.js';
import { Batch } from '../models/Batch.js';
import { SupplyChainEvent } from '../models/SupplyChainEvent.js';
import { ScanLog } from '../models/ScanLog.js';

export class AdminController {
  /**
   * System-wide statistics for the Admin Analytics Dashboard
   */
  static async getStats(req, res) {
    try {
      const [
        totalUsers,
        totalBatches,
        onChainBatches,
        totalEvents,
        totalScans,
        usersByRoleRaw,
      ] = await Promise.all([
        User.countDocuments(),
        Batch.countDocuments(),
        Batch.countDocuments({ isSyncWithChain: true }),
        SupplyChainEvent.countDocuments(),
        ScanLog.countDocuments(),
        User.aggregate([
          { $group: { _id: '$role', count: { $sum: 1 } } },
        ]),
      ]);

      // Format usersByRole matching Prisma output format:
      // [{ role: 'FARMER', _count: { id: 1 } }, ...]
      const usersByRole = usersByRoleRaw.map((group) => ({
        role: group._id,
        _count: { id: group.count },
      }));

      const recentBatches = await Batch.find()
        .sort({ createdAt: -1 })
        .limit(5)
        .populate('farmer', 'name organization');

      res.json({
        totalUsers,
        totalBatches,
        onChainBatches,
        totalEvents,
        totalScans,
        usersByRole,
        recentBatches,
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch admin stats', message: error.message });
    }
  }

  /**
   * Price spread & margin distribution analysis across supply-chain hops
   */
  static async getPriceSpread(req, res) {
    try {
      const batches = await Batch.find({ isSyncWithChain: true }).populate({
        path: 'events',
        options: { sort: { timestamp: 1 } },
      });

      const spreads = batches.map((b) => {
        const events = b.events || [];
        const firstEvent = events[0];
        const lastEvent = events[events.length - 1];

        const initialPrice = firstEvent ? firstEvent.pricePerUnit : 1.0;
        const currentPrice = lastEvent ? lastEvent.pricePerUnit : initialPrice;
        const priceIncrease = currentPrice - initialPrice;
        const markupPercentage = initialPrice > 0 ? (priceIncrease / initialPrice) * 100 : 0;

        return {
          batchId: b.id,
          blockchainBatchId: b.blockchainBatchId,
          productName: b.productName,
          category: b.category,
          origin: b.originLocation,
          farmerPrice: initialPrice,
          retailPrice: currentPrice,
          markupPercentage: Math.round(markupPercentage),
          hopsCount: events.length,
        };
      });

      res.json({ spreads });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch price spreads', message: error.message });
    }
  }

  /**
   * Verify stakeholder identity
   */
  static async verifyUser(req, res) {
    try {
      const { id } = req.params;
      const { isVerified } = req.body;

      const user = await User.findByIdAndUpdate(
        id,
        { isVerified: Boolean(isVerified) },
        { new: true }
      );

      res.json({ message: 'User verification status updated', user });
    } catch (error) {
      res.status(500).json({ error: 'Failed to verify user', message: error.message });
    }
  }
}
