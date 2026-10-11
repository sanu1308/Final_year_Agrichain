import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { ethers } from 'ethers';
import { z } from 'zod';
import { User } from '../models/User.js';
import { config } from '../config/index.js';

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().min(2),
  role: z
    .enum(['FARMER', 'DISTRIBUTOR', 'RETAILER', 'CONSUMER', 'ADMIN'])
    .default('CONSUMER'),
  walletAddress: z.string().optional().nullable(),
  organization: z.string().optional(),
  physicalAddress: z.string().optional(),
  phoneNumber: z.string().optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

export class AuthController {
  static async register(req, res) {
    try {
      const parsed = registerSchema.safeParse(req.body);

      if (!parsed.success) {
        res.status(400).json({
          error: 'Validation error',
          details: parsed.error.format(),
        });
        return;
      }

      const {
        email,
        password,
        name,
        role,
        walletAddress,
        organization,
        physicalAddress,
        phoneNumber,
      } = parsed.data;

      const existingUser = await User.findOne({ email });

      if (existingUser) {
        res.status(409).json({
          error: 'A user with this email already exists',
        });
        return;
      }

      let normalizedWallet = null;

      if (walletAddress && walletAddress.trim()) {
        const trimmed = walletAddress.trim();

        if (!ethers.isAddress(trimmed)) {
          res.status(400).json({
            error:
              'A valid 42-character Ethereum wallet address (0x...) is required.',
          });
          return;
        }

        const BLOCKCHAIN_ROLES = [
          'FARMER',
          'DISTRIBUTOR',
          'RETAILER',
        ];

        if (!BLOCKCHAIN_ROLES.includes(role)) {
          res.status(400).json({
            error: `Wallet binding is not required or permitted for ${role} role. Only Farmer, Distributor, and Retailer roles bind MetaMask wallets.`,
          });
          return;
        }

        normalizedWallet = ethers.getAddress(trimmed);

        const existingBinding = await User.findOne({
          $or: [
            { walletAddress: normalizedWallet },
            { walletAddress: normalizedWallet.toLowerCase() },
          ],
        });

        if (existingBinding) {
          res.status(409).json({
            error: 'Wallet address is already linked to another account.',
          });
          return;
        }
      }

      const passwordHash = await bcrypt.hash(password, 10);

      const user = await User.create({
        email,
        passwordHash,
        name,
        role,
        walletAddress: normalizedWallet,
        organization,
        physicalAddress,
        phoneNumber,
        isVerified: role === 'CONSUMER' || role === 'FARMER',
        isActive: true,
      });

      const token = jwt.sign(
        {
          id: user.id,
          email: user.email,
          role: user.role,
          walletAddress: user.walletAddress,
          name: user.name,
        },
        config.jwtSecret,
        { expiresIn: config.jwtExpiresIn }
      );

      res.status(201).json({
        message: 'Registration successful',
        token,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          walletAddress: user.walletAddress,
          organization: user.organization,
          isVerified: user.isVerified,
          isActive: user.isActive,
          createdAt: user.createdAt,
        },
      });
    } catch (error) {
      if (error.code === 11000) {
        if (
          error.keyPattern?.walletAddress ||
          JSON.stringify(error.keyValue || {}).includes('walletAddress')
        ) {
          res.status(409).json({
            error: 'Wallet address is already linked to another account.',
          });
          return;
        }

        if (
          error.keyPattern?.email ||
          JSON.stringify(error.keyValue || {}).includes('email')
        ) {
          res.status(409).json({
            error: 'A user with this email already exists',
          });
          return;
        }
      }

      console.error('Register error:', error);

      res.status(500).json({
        error: 'Registration failed',
        message: error.message,
      });
    }
  }

  static async login(req, res) {
    try {
      const parsed = loginSchema.safeParse(req.body);

      if (!parsed.success) {
        res.status(400).json({
          error: 'Invalid input',
          details: parsed.error.format(),
        });
        return;
      }

      const { email, password } = parsed.data;

      const user = await User.findOne({ email });

      if (!user) {
        res.status(401).json({
          error: 'Invalid email or password',
        });
        return;
      }

      if (user.isActive === false) {
        res.status(403).json({
          error: 'User account is deactivated',
        });
        return;
      }

      const passwordMatch = await bcrypt.compare(
        password,
        user.passwordHash
      );

      if (!passwordMatch) {
        res.status(401).json({
          error: 'Invalid email or password',
        });
        return;
      }

      const token = jwt.sign(
        {
          id: user.id,
          email: user.email,
          role: user.role,
          walletAddress: user.walletAddress,
          name: user.name,
        },
        config.jwtSecret,
        { expiresIn: config.jwtExpiresIn }
      );

      res.status(200).json({
        message: 'Login successful',
        token,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          walletAddress: user.walletAddress,
          organization: user.organization,
          isVerified: user.isVerified,
          isActive: user.isActive,
          createdAt: user.createdAt,
        },
      });
    } catch (error) {
      console.error('Login error:', error);

      res.status(500).json({
        error: 'Login failed',
        message: error.message,
      });
    }
  }

  static async getMe(req, res) {
    try {
      if (!req.user) {
        res.status(401).json({
          error: 'Unauthorized',
        });
        return;
      }

      const user = await User.findById(req.user.id).select(
        'email name role walletAddress organization physicalAddress phoneNumber isVerified isActive createdAt'
      );

      if (!user) {
        res.status(404).json({
          error: 'User not found',
        });
        return;
      }

      res.json({
        user,
      });
    } catch (error) {
      res.status(500).json({
        error: 'Failed to fetch user',
        message: error.message,
      });
    }
  }

  static async linkWallet(req, res) {
    try {
      if (!req.user) {
        res.status(401).json({
          error: 'Unauthorized',
        });
        return;
      }

      const user = await User.findById(req.user.id);

      if (!user) {
        res.status(404).json({
          error: 'User not found',
        });
        return;
      }

      if (user.isActive === false) {
        res.status(403).json({
          error: 'User account is deactivated',
        });
        return;
      }

      // Only Farmer, Distributor and Retailer can bind MetaMask wallets.
      const BLOCKCHAIN_ROLES = [
        'FARMER',
        'DISTRIBUTOR',
        'RETAILER',
      ];

      if (!BLOCKCHAIN_ROLES.includes(user.role)) {
        res.status(400).json({
          error: `Wallet binding is not required or permitted for ${user.role} role. Only Farmer, Distributor, and Retailer roles bind MetaMask wallets.`,
        });
        return;
      }

      const { walletAddress } = req.body;

      if (
        !walletAddress ||
        typeof walletAddress !== 'string' ||
        !ethers.isAddress(walletAddress.trim())
      ) {
        res.status(400).json({
          error:
            'A valid 42-character Ethereum wallet address (0x...) is required.',
        });
        return;
      }

      const normalized = ethers.getAddress(walletAddress.trim());

      /*
       * IMPORTANT:
       * Some old users may have walletAddress stored as:
       * null
       * "null"
       * ""
       *
       * All of these mean "no wallet is currently registered".
       *
       * We must NOT pass "null" into ethers.getAddress().
       */
      const rawCurrentWallet = user.walletAddress;

      const hasValidCurrentWallet =
        typeof rawCurrentWallet === 'string' &&
        rawCurrentWallet.trim() !== '' &&
        rawCurrentWallet.trim().toLowerCase() !== 'null' &&
        ethers.isAddress(rawCurrentWallet.trim());

      /*
       * EXISTING WALLET
       *
       * If a valid wallet is already registered with this account,
       * compare it with the newly connected MetaMask wallet.
       */
      if (hasValidCurrentWallet) {
        const currentBound = ethers.getAddress(
          rawCurrentWallet.trim()
        );

        if (currentBound === normalized) {
          res.json({
            message:
              'Wallet is already linked and verified for this account.',
            walletAddress: currentBound,
          });
          return;
        }

        // Different wallet: prevent silent overwrite of bound identity
        res.status(400).json({
          error:
            'Wallet binding cannot be changed. Please switch MetaMask to your registered wallet.',
        });
        return;
      }

      /*
       * ONE WALLET MUST NOT BELONG TO MULTIPLE USERS
       */
      const existingBinding = await User.findOne({
        $or: [
          { walletAddress: normalized },
          { walletAddress: normalized.toLowerCase() },
        ],
      });

      if (
        existingBinding &&
        existingBinding.id !== user.id
      ) {
        res.status(409).json({
          error:
            'Wallet address is already linked to another account.',
          details: `This wallet address (${normalized}) is already registered to another account (${existingBinding.role}: ${existingBinding.name}). A wallet cannot belong to multiple users.`,
        });
        return;
      }

      /*
       * Save the new wallet.
       *
       * This also cleans up an old invalid value such as "null".
       */
      user.walletAddress = normalized;

      await user.save();

      /*
       * Issue refreshed JWT with updated wallet address.
       */
      const token = jwt.sign(
        {
          id: user.id,
          email: user.email,
          role: user.role,
          walletAddress: user.walletAddress,
          name: user.name,
        },
        config.jwtSecret,
        { expiresIn: config.jwtExpiresIn }
      );

      res.json({
        message: 'Wallet bound and verified successfully',
        walletAddress: user.walletAddress,
        token,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          walletAddress: user.walletAddress,
          organization: user.organization,
          isVerified: user.isVerified,
          isActive: user.isActive,
          createdAt: user.createdAt,
        },
      });
    } catch (error) {
      if (error.code === 11000) {
        res.status(409).json({
          error:
            'Wallet address is already linked to another account.',
        });
        return;
      }

      console.error('Link wallet error:', error);

      res.status(500).json({
        error: 'Failed to link wallet',
        message: error.message,
      });
    }
  }
}