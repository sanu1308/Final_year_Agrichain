import mongoose from 'mongoose';
import crypto from 'crypto';

const supplyChainEventSchema = new mongoose.Schema(
  {
    _id: {
      type: String,
      default: () => crypto.randomUUID(),
    },
    batchId: {
      type: String,
      ref: 'Batch',
      required: true,
      index: true,
    },
    eventType: {
      type: String,
      enum: [
        'CREATION',
        'QUALITY_INSPECTION',
        'TRANSFER_OF_CUSTODY',
        'PRICE_UPDATE',
        'STORAGE_UPDATE',
        'RECALL',
      ],
      required: true,
    },
    fromAddress: {
      type: String,
      required: true,
      lowercase: true,
    },
    toAddress: {
      type: String,
      required: true,
      lowercase: true,
    },
    pricePerUnit: {
      type: Number,
      required: true,
    },
    quantity: {
      type: Number,
      default: null,
    },
    currency: {
      type: String,
      default: 'INR',
    },
    location: {
      type: String,
      required: true,
    },
    notes: {
      type: String,
      default: null,
    },
    temperatureC: {
      type: Number,
      default: null,
    },
    humidityPercent: {
      type: Number,
      default: null,
    },
    txHash: {
      type: String,
      default: null,
      index: true,
    },
    actorId: {
      type: String,
      ref: 'User',
      default: null,
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: false,
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

supplyChainEventSchema.virtual('id').get(function () {
  return this._id;
});

supplyChainEventSchema.virtual('batch', {
  ref: 'Batch',
  localField: 'batchId',
  foreignField: '_id',
  justOne: true,
});

supplyChainEventSchema.virtual('actor', {
  ref: 'User',
  localField: 'actorId',
  foreignField: '_id',
  justOne: true,
});

supplyChainEventSchema.index(
  { batchId: 1, txHash: 1 },
  {
    unique: true,
    partialFilterExpression: { txHash: { $type: 'string' } },
  }
);

export const SupplyChainEvent =
  mongoose.models.SupplyChainEvent ||
  mongoose.model('SupplyChainEvent', supplyChainEventSchema, 'supplychainevents');
