require("@nomicfoundation/hardhat-toolbox");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });
require("dotenv").config({ path: path.join(__dirname, "../backend/.env") });

const SEPOLIA_RPC_URL =
  process.env.SEPOLIA_RPC_URL ||
  process.env.RPC_URL ||
  "https://rpc.sepolia.org";

const SEPOLIA_PRIVATE_KEY =
  process.env.SEPOLIA_PRIVATE_KEY ||
  process.env.DEPLOYER_PRIVATE_KEY;

const sepoliaAccounts =
  SEPOLIA_PRIVATE_KEY && SEPOLIA_PRIVATE_KEY.trim().length >= 64
    ? [SEPOLIA_PRIVATE_KEY.trim().startsWith("0x") ? SEPOLIA_PRIVATE_KEY.trim() : `0x${SEPOLIA_PRIVATE_KEY.trim()}`]
    : [];

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      viaIR: true,
    },
  },
  networks: {
    localhost: {
      url: "http://127.0.0.1:8545",
      chainId: 31337,
    },
    hardhat: {
      chainId: 31337,
    },
    sepolia: {
      url: SEPOLIA_RPC_URL,
      chainId: 11155111,
      accounts: sepoliaAccounts.length > 0 ? sepoliaAccounts : undefined,
    },
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
};
