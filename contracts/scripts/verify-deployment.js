const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("====================================================");
  console.log(" AgriChain On-Chain Deployment Verification");
  console.log("====================================================");

  const contractDataPath = path.join(__dirname, "../../shared/contractData.json");
  if (!fs.existsSync(contractDataPath)) {
    throw new Error("shared/contractData.json not found. Please deploy first.");
  }

  const contractData = JSON.parse(fs.readFileSync(contractDataPath, "utf8"));
  console.log("Target Contract Address:", contractData.address);
  console.log("Configured Network:     ", contractData.network, `(Chain ID: ${contractData.chainId})`);

  const provider = hre.ethers.provider;
  const network = await provider.getNetwork();
  console.log("Live Connected Network: ", network.name, `(Chain ID: ${network.chainId})`);

  const code = await provider.getCode(contractData.address);
  if (!code || code === "0x" || code === "0x0") {
    throw new Error(`No contract bytecode found at address ${contractData.address} on chain ${network.chainId}!`);
  }
  console.log("✓ Contract bytecode verified on-chain (Length:", code.length, "bytes)");

  const AgriChain = await hre.ethers.getContractFactory("AgriChain");
  const agrichain = AgriChain.attach(contractData.address);

  const owner = await agrichain.owner();
  console.log("✓ Contract Owner:           ", owner);

  const minPurchase = await agrichain.minPurchaseQuantity();
  console.log("✓ Minimum Purchase Quantity:", minPurchase.toString(), "units");

  const totalBatches = await agrichain.getTotalBatches();
  console.log("✓ Total Batches Counter:    ", totalBatches.toString());

  const isPaused = await agrichain.paused();
  console.log("✓ Paused State:             ", isPaused);

  console.log("====================================================");
  console.log(" ON-CHAIN CONTRACT VERIFICATION PASSED SUCCESSFULLY!");
  console.log("====================================================");
}

main().catch((err) => {
  console.error("Verification failed:", err);
  process.exitCode = 1;
});
