import mongoose from 'mongoose';
import crypto from 'crypto';

const batchSchema = new mongoose.Schema(
  {
    _id: {
      type: String,
      default: () => crypto.randomUUID(),
    },
    blockchainBatchId: {
      type: Number,
      unique: true,
      sparse: true,
    },
    productName: {
      type: String,
      required: true,
      trim: true,
    },
    category: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      default: null,
    },
    originLocation: {
      type: String,
      required: true,
    },
    farmName: {
      type: String,
      required: true,
    },
    farmLatitude: {
      type: Number,
      default: null,
    },
    farmLongitude: {
      type: Number,
      default: null,
    },
    quantity: {
      type: Number,
      required: true,
    },
    originalQuantity: {
      type: Number,
      default: null,
    },
    remainingQuantity: {
      type: Number,
      default: null,
    },
    soldQuantity: {
      type: Number,
      default: 0,
    },
    parentBatchId: {
      type: Number,
      default: null,
      index: true,
    },
    unit: {
      type: String,
      default: 'kg',
    },
    qualityGrade: {
      type: String,
      enum: ['GRADE_A', 'GRADE_B', 'GRADE_C', 'PREMIUM', 'EXPORT_QUALITY'],
      default: 'GRADE_A',
    },
    harvestDate: {
      type: Date,
      required: true,
    },
    expiryDate: {
      type: Date,
      default: null,
    },
    images: {
      type: mongoose.Schema.Types.Mixed,
      default: [],
    },
    qrCodeUrl: {
      type: String,
      default: null,
    },
    status: {
      type: String,
      enum: [
        'HARVESTED',
        'IN_TRANSIT',
        'WITH_DISTRIBUTOR',
        'IN_TRANSIT_TO_RETAILER',
        'WITH_RETAILER',
        'SOLD',
        'RECALLED',
      ],
      default: 'HARVESTED',
    },
    farmerId: {
      type: String,
      ref: 'User',
      required: true,
    },
    farmerWallet: {
      type: String,
      required: true,
      lowercase: true,
    },
    currentOwnerWallet: {
      type: String,
      required: true,
      lowercase: true,
    },
    creationTxHash: {
      type: String,
      default: null,
    },
    blockNumber: {
      type: Number,
      default: null,
    },
    isSyncWithChain: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: (doc, ret) => {
        ret.id = ret._id;
        delete ret.__v;
        return ret;
      },
    },
    toObject: {
      virtuals: true,
      transform: (doc, ret) => {
        ret.id = ret._id;
        delete ret.__v;
        return ret;
      },
    },
  }
);

batchSchema.virtual('id').get(function () {
  return this._id;
});

batchSchema.virtual('farmer', {
  ref: 'User',
  localField: 'farmerId',
  foreignField: '_id',
  justOne: true,
});

batchSchema.virtual('events', {
  ref: 'SupplyChainEvent',
  localField: '_id',
  foreignField: 'batchId',
});

batchSchema.virtual('scanLogs', {
  ref: 'ScanLog',
  localField: '_id',
  foreignField: 'batchId',
});

export const Batch = mongoose.models.Batch || mongoose.model('Batch', batchSchema, 'batches');
