import { ethers } from 'ethers';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from '../config/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let contractData = { address: '', abi: [] };

try {
  const contractDataPath = path.join(__dirname, '../config/contractData.json');
  if (fs.existsSync(contractDataPath)) {
    contractData = JSON.parse(fs.readFileSync(contractDataPath, 'utf8'));
  }
} catch (e) {
  console.warn('contractData.json not yet available, will initialize provider without contract instance');
}

export const provider = new ethers.JsonRpcProvider(config.rpcUrl);

export function getContractInstance() {
  try {
    const contractDataPath = path.join(__dirname, '../config/contractData.json');
    if (fs.existsSync(contractDataPath)) {
      contractData = JSON.parse(fs.readFileSync(contractDataPath, 'utf8'));
    }
  } catch (e) {
    // ignore read error
  }

  const activeAddress = config.contractAddress || contractData.address;

  if (!activeAddress) {
    throw new Error('Contract address not configured. Please deploy contracts first or set CONTRACT_ADDRESS in environment.');
  }

  return new ethers.Contract(activeAddress, contractData.abi, provider);
}
