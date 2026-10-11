import mongoose from 'mongoose';
import crypto from 'crypto';

const scanLogSchema = new mongoose.Schema(
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
    scannedAt: {
      type: Date,
      default: Date.now,
    },
    ipAddress: {
      type: String,
      default: null,
    },
    userAgent: {
      type: String,
      default: null,
    },
    city: {
      type: String,
      default: null,
    },
    country: {
      type: String,
      default: null,
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

scanLogSchema.virtual('id').get(function () {
  return this._id;
});

scanLogSchema.virtual('batch', {
  ref: 'Batch',
  localField: 'batchId',
  foreignField: '_id',
  justOne: true,
});

export const ScanLog =
  mongoose.models.ScanLog || mongoose.model('ScanLog', scanLogSchema, 'scanlogs');
