import jwt from 'jsonwebtoken';
import { ethers } from 'ethers';
import { config } from '../config/index.js';
import { User } from '../models/User.js';

export const authenticateJWT = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized: No token provided' });
    return;
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, config.jwtSecret);
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Unauthorized: Invalid or expired token' });
  }
};

export const requireAuth = authenticateJWT;

export const authorizeRoles = (rolesInput) => {
  const roles = Array.isArray(rolesInput) ? rolesInput : [rolesInput];
  return (req, res, next) => {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized: User not authenticated' });
      return;
    }

    if (!roles.includes(req.user.role)) {
      res.status(403).json({
        error: `Forbidden: Access requires one of the following roles: [${roles.join(', ')}]`,
      });
      return;
    }

    next();
  };
};

export const requireRole = (...roles) => {
  const flatRoles = roles.flat();
  return authorizeRoles(flatRoles);
};

export const requireWalletMatch = async (req, res, next) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized: User not authenticated' });
      return;
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    if (user.isActive === false) {
      res.status(403).json({ error: 'User account is deactivated' });
      return;
    }

    if (!user.walletAddress) {
      res.status(400).json({
        error: 'Please connect and register your MetaMask wallet before performing blockchain transactions.',
      });
      return;
    }

    const clientWallet =
      req.body?.farmerWallet ||
      req.body?.walletAddress ||
      req.body?.senderWallet ||
      req.headers['x-wallet-address'];

    if (clientWallet) {
      try {
        const normalizedClient = ethers.getAddress(clientWallet);
        const normalizedUser = ethers.getAddress(user.walletAddress);
        if (normalizedClient !== normalizedUser) {
          res.status(403).json({
            error: 'Please connect the MetaMask wallet registered with this account.',
            registeredWallet: normalizedUser,
            attemptedWallet: normalizedClient,
          });
          return;
        }
      } catch (err) {
        res.status(400).json({
          error: 'Invalid wallet address format provided',
        });
        return;
      }
    }

    req.dbUser = user;
    next();
  } catch (error) {
    console.error('requireWalletMatch error:', error);
    res.status(500).json({ error: 'Internal server error during wallet verification' });
  }
};

