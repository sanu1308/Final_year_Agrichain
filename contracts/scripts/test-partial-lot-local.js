const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");

async function main() {
  const provider = new ethers.JsonRpcProvider("http://127.0.0.1:8545");
  const contractData = JSON.parse(fs.readFileSync(path.join(__dirname, "../../shared/contractData.json"), "utf8"));
  const farmer = await provider.getSigner(0);
  const distributor = await provider.getSigner(1);
  const retailer = await provider.getSigner(2);
  const contract = new ethers.Contract(contractData.address, contractData.abi, farmer);

  const createTx = await contract.createBatch(
    "Local Partial Mustard",
    "Nashik, Maharashtra",
    500,
    "kg",
    0,
    8000,
    "db://local-partial-lot-test"
  );
  const createReceipt = await createTx.wait();
  const created = createReceipt.logs.map((log) => {
    try { return contract.interface.parseLog(log); } catch { return null; }
  }).find((event) => event?.name === "BatchCreated");
  const parentId = Number(created.args.batchId);

  const distributorContract = contract.connect(distributor);
  const firstTx = await distributorContract.purchaseLot(parentId, 100, 8000, 1, "Hub", "100 kg");
  const firstReceipt = await firstTx.wait();
  const firstLot = firstReceipt.logs.map((log) => {
    try { return contract.interface.parseLog(log); } catch { return null; }
  }).find((event) => event?.name === "LotPurchased");
  const distributorLotId = Number(firstLot.args.newBatchId);

  const retailerContract = contract.connect(retailer);
  const secondTx = await retailerContract.purchaseLot(distributorLotId, 60, 8000, 3, "Store", "60 kg");
  const secondReceipt = await secondTx.wait();
  const secondLot = secondReceipt.logs.map((log) => {
    try { return contract.interface.parseLog(log); } catch { return null; }
  }).find((event) => event?.name === "LotPurchased");
  const retailerLotId = Number(secondLot.args.newBatchId);

  const parent = await contract.getBatch(parentId);
  const distributorLot = await contract.getBatch(distributorLotId);
  const retailerLot = await contract.getBatch(retailerLotId);

  if (Number(parent.quantity) !== 400 || Number(distributorLot.quantity) !== 40 || Number(retailerLot.quantity) !== 60) {
    throw new Error("Unexpected local partial-lot quantities");
  }
  if (Number(distributorLot.parentBatchId) !== parentId || Number(retailerLot.parentBatchId) !== distributorLotId) {
    throw new Error("Unexpected local parent-child lineage");
  }

  console.log(JSON.stringify({
    contractAddress: contractData.address,
    parentId,
    distributorLotId,
    retailerLotId,
    farmerRemaining: Number(parent.quantity),
    distributorRemaining: Number(distributorLot.quantity),
    retailerReceived: Number(retailerLot.quantity),
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});