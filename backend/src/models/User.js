import mongoose from 'mongoose';
import crypto from 'crypto';
import { ethers } from 'ethers';

const userSchema = new mongoose.Schema(
  {
    _id: {
      type: String,
      default: () => crypto.randomUUID(),
    },
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    passwordHash: {
      type: String,
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    role: {
      type: String,
      enum: ['FARMER', 'DISTRIBUTOR', 'RETAILER', 'CONSUMER', 'ADMIN'],
      default: 'CONSUMER',
      required: true,
    },
    walletAddress: {
      type: String,
      trim: true,
      default: null,
      set: function (v) {
        if (!v) return null;
        try {
          return ethers.getAddress(v.trim());
        } catch {
          return v.trim();
        }
      },
      validate: {
        validator: function (v) {
          if (!v) return true;
          return ethers.isAddress(v);
        },
        message: (props) => `${props.value} is not a valid Ethereum wallet address`,
      },
    },
    organization: {
      type: String,
      default: null,
    },
    physicalAddress: {
      type: String,
      default: null,
    },
    phoneNumber: {
      type: String,
      default: null,
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    isActive: {
      type: Boolean,
      default: true,
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

userSchema.virtual('id').get(function () {
  return this._id;
});

// Enforce strict uniqueness for blockchain-enabled wallet bindings while allowing nulls for unlinked/Admin/Consumer
userSchema.index(
  { walletAddress: 1 },
  { unique: true, partialFilterExpression: { walletAddress: { $type: 'string' } } }
);

export const User = mongoose.models.User || mongoose.model('User', userSchema, 'users');

