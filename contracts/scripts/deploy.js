const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("Starting deployment of AgriChain smart contract...");

  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying contract with account:", deployer.address);
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", hre.ethers.formatEther(balance), "ETH");

  const AgriChain = await hre.ethers.getContractFactory("AgriChain");
  const agrichain = await AgriChain.deploy();
  await agrichain.waitForDeployment();

  const contractAddress = await agrichain.getAddress();
  console.log("AgriChain successfully deployed to:", contractAddress);

  // Extract ABI
  const artifactPath = path.join(
    __dirname,
    "../artifacts/contracts/AgriChain.sol/AgriChain.json"
  );
  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));

  const contractData = {
    address: contractAddress,
    network: hre.network.name,
    chainId: hre.network.config.chainId || 31337,
    abi: artifact.abi,
    deployedAt: new Date().toISOString(),
  };

  // Paths to export
  const exportPaths = [
    path.join(__dirname, "../../shared/contractData.json"),
    path.join(__dirname, "../../backend/src/config/contractData.json"),
    path.join(__dirname, "../../frontend/src/contractData.json"),
  ];

  for (const expPath of exportPaths) {
    const dir = path.dirname(expPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(expPath, JSON.stringify(contractData, null, 2));
    console.log("Exported contract configuration to:", expPath);
  }

  console.log("Deployment and configuration synchronization complete!");
}

main().catch((error) => {
  console.error("Deployment failed:", error);
  process.exitCode = 1;
});
