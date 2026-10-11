import { ethers } from 'ethers';

/**
 * Utility functions for safe Web3 and on-chain batch verification
 */

/**
 * Safely verifies if a batch exists on the currently connected smart contract.
 * Checks total batches boundary first to prevent EVM revert errors ("AgriChain: Batch does not exist").
 *
 * @param {ethers.Contract} contract - Connected ethers.js contract instance
 * @param {number|string|bigint} blockchainBatchId - The blockchain batch ID to check
 * @returns {Promise<{exists: boolean, isStale?: boolean, error?: string, batch?: object}>}
 */
export async function verifyBatchExistsOnChain(contract, blockchainBatchId) {
  if (!contract) {
    return {
      exists: false,
      error: 'MetaMask contract instance is not connected. Please connect MetaMask.',
    };
  }

  if (
    blockchainBatchId === undefined ||
    blockchainBatchId === null ||
    isNaN(Number(blockchainBatchId)) ||
    Number(blockchainBatchId) <= 0
  ) {
    return {
      exists: false,
      error: `Invalid blockchain batch ID (${blockchainBatchId}). Batch has not been confirmed on-chain.`,
    };
  }

  const targetId = BigInt(blockchainBatchId);
  const contractAddress = contract.target || contract.address || 'Active Contract';

  try {
    // 1. Boundary check: Check total on-chain batches to avoid EVM reverts on stale IDs
    const totalBatches = await contract.getTotalBatches();
    if (targetId > totalBatches) {
      return {
        exists: false,
        isStale: true,
        error: `Stale Blockchain Record: Batch #${blockchainBatchId} does not exist on the current smart contract (${contractAddress}). Total batches on this deployment: ${totalBatches.toString()}. This batch was created on an older blockchain session.`,
      };
    }

    // 2. Query batch data safely
    const onChainBatch = await contract.getBatch(targetId);
    if (!onChainBatch || !onChainBatch.exists) {
      return {
        exists: false,
        isStale: true,
        error: `Batch #${blockchainBatchId} is not marked as active on the current contract (${contractAddress}).`,
      };
    }

    return {
      exists: true,
      batch: onChainBatch,
    };
  } catch (err) {
    const msg = err.message || '';
    if (msg.includes('Batch does not exist') || msg.includes('revert')) {
      return {
        exists: false,
        isStale: true,
        error: `Stale Blockchain Record: Batch #${blockchainBatchId} does not exist on the current smart contract (${contractAddress}). It was created on a previous blockchain instance.`,
      };
    }

    return {
      exists: false,
      error: `Could not verify batch on blockchain: ${msg}`,
    };
  }
}

/**
 * Role-based wallet status evaluator.
 * Excludes ADMIN and CONSUMER.
 * Evaluates connection, binding, and account match for FARMER, DISTRIBUTOR, RETAILER.
 */
export function verifyWalletStatus(user, account) {
  const BLOCKCHAIN_ROLES = ['FARMER', 'DISTRIBUTOR', 'RETAILER'];
  const isBlockchainRole = user && BLOCKCHAIN_ROLES.includes(user.role);

  if (!isBlockchainRole) {
    return {
      isBlockchainRole: false,
      isInstalled: true,
      isConnected: true,
      isLinked: false,
      isMatched: true,
      canTransact: true,
      status: 'EXCLUDED',
      message: `${user?.role || 'User'} does not require MetaMask wallet binding.`,
    };
  }

  const isInstalled = typeof window !== 'undefined' && !!window.ethereum;
  if (!isInstalled) {
    return {
      isBlockchainRole: true,
      isInstalled: false,
      isConnected: false,
      isLinked: !!user?.walletAddress,
      isMatched: false,
      canTransact: false,
      status: 'NOT_INSTALLED',
      message: 'MetaMask is not installed. Please install MetaMask to interact with the blockchain.',
    };
  }

  if (!account) {
    return {
      isBlockchainRole: true,
      isInstalled: true,
      isConnected: false,
      isLinked: !!user?.walletAddress,
      isMatched: false,
      canTransact: false,
      status: 'DISCONNECTED',
      message: 'MetaMask is disconnected. Please connect your MetaMask wallet.',
    };
  }

  let normalizedConnected = account;
  try {
    normalizedConnected = ethers.getAddress(account);
  } catch {
    normalizedConnected = account.toLowerCase();
  }

  let registered = null;
  if (user?.walletAddress) {
    try {
      registered = ethers.getAddress(user.walletAddress);
    } catch {
      registered = user.walletAddress.toLowerCase();
    }
  }

  if (!registered) {
    return {
      isBlockchainRole: true,
      isInstalled: true,
      isConnected: true,
      isLinked: false,
      isMatched: false,
      canTransact: false,
      status: 'UNLINKED',
      connectedWallet: normalizedConnected,
      message: 'Please connect and register your MetaMask wallet before performing blockchain transactions.',
    };
  }

  if (registered.toLowerCase() === normalizedConnected.toLowerCase()) {
    return {
      isBlockchainRole: true,
      isInstalled: true,
      isConnected: true,
      isLinked: true,
      isMatched: true,
      canTransact: true,
      status: 'VERIFIED',
      connectedWallet: normalizedConnected,
      registeredWallet: registered,
      message: 'Wallet Verified ✓',
    };
  }

  return {
    isBlockchainRole: true,
    isInstalled: true,
    isConnected: true,
    isLinked: true,
    isMatched: false,
    canTransact: false,
    status: 'MISMATCH',
    connectedWallet: normalizedConnected,
    registeredWallet: registered,
    message: 'Please connect the MetaMask wallet registered with this account.',
  };
}

/**
 * Asserts that the wallet is fully verified and ready for transaction.
 * Throws a user-friendly error if blocked.
 */
export function assertWalletReadyForTransaction(user, account) {
  const status = verifyWalletStatus(user, account);
  if (!status.canTransact) {
    throw new Error(status.message);
  }
  return true;
}

