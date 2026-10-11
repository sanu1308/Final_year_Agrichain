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
    throw new Error('Development faucet is disabled in production.');
  }

  if (!DEV_FAUCET_PRIVATE_KEY) {
    throw new Error(
      'DEV_FAUCET_PRIVATE_KEY is not configured in backend .env'
    );
  }

  if (!ethers.isAddress(walletAddress)) {
    throw new Error('Invalid wallet address.');
  }

  const normalizedAddress = ethers.getAddress(walletAddress);

  const signer = getFaucetSigner();

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

  const tx = await signer.sendTransaction({
    to: normalizedAddress,
    value: ethers.parseEther(FUND_AMOUNT_ETH),
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