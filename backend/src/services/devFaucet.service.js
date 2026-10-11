import { ethers } from 'ethers';
import { provider } from '../lib/web3.js';
import { config } from '../config/index.js';

const DEV_FAUCET_PRIVATE_KEY = process.env.DEV_FAUCET_PRIVATE_KEY;

let faucetSigner = null;

function getFaucetSigner() {
  if (!DEV_FAUCET_PRIVATE_KEY) {
    throw new Error('DEV_FAUCET_PRIVATE_KEY is not configured.');
  }

  if (!faucetSigner) {
    faucetSigner = new ethers.NonceManager(
      new ethers.Wallet(DEV_FAUCET_PRIVATE_KEY, provider)
    );
  }

  return faucetSigner;
}

const FUND_AMOUNT_ETH = process.env.DEV_FAUCET_AMOUNT || '10';
const MIN_BALANCE_ETH = process.env.DEV_FAUCET_MIN_BALANCE || '1';

export async function fundDevelopmentWallet(walletAddress) {
  if (config.nodeEnv === 'production') {
    throw new Error('Development faucet is disabled in production. For Sepolia, please use an official Sepolia faucet.');
  }

  const network = await provider.getNetwork().catch(() => null);
  if (network && Number(network.chainId) !== 31337) {
    throw new Error('Development faucet is only available on Hardhat local testnet (Chain ID 31337). For Sepolia, please obtain test ETH from https://sepoliafaucet.com or https://cloud.google.com/application/web3/faucet/ethereum/sepolia.');
  }

  if (!DEV_FAUCET_PRIVATE_KEY) {
    throw new Error('DEV_FAUCET_PRIVATE_KEY is not configured in backend .env');
  }

  if (!ethers.isAddress(walletAddress)) {
    throw new Error('Invalid wallet address.');
  }

  const normalizedAddress = ethers.getAddress(walletAddress);
  const faucetWallet = new ethers.Wallet(DEV_FAUCET_PRIVATE_KEY, provider);

  const balance = await provider.getBalance(normalizedAddress);
  const balanceEth = Number(ethers.formatEther(balance));

  if (balanceEth >= Number(MIN_BALANCE_ETH)) {
    return {
      funded: false,
      alreadyFunded: true,
      walletAddress: normalizedAddress,
      balance: ethers.formatEther(balance),
      message: 'Wallet already has sufficient development ETH.',
    };
  }

  // Fetch current pending nonce dynamically to prevent NONCE_EXPIRED errors
  const currentNonce = await provider.getTransactionCount(faucetWallet.address, 'pending');

  const tx = await faucetWallet.sendTransaction({
    to: normalizedAddress,
    value: ethers.parseEther(FUND_AMOUNT_ETH),
    nonce: currentNonce,
  });

  const receipt = await tx.wait();

  if (!receipt || receipt.status !== 1) {
    throw new Error('Development faucet transaction failed.');
  }

  const newBalance = await provider.getBalance(normalizedAddress);

  return {
    funded: true,
    alreadyFunded: false,
    walletAddress: normalizedAddress,
    amountSent: FUND_AMOUNT_ETH,
    balance: ethers.formatEther(newBalance),
    transactionHash: receipt.hash,
    message: `Development wallet funded with ${FUND_AMOUNT_ETH} ETH.`,
  };
}