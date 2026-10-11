const { expect } = require("chai");

describe("AgriChain partial lot flow", function () {
  async function createBatch(contract, farmer) {
    const tx = await contract.connect(farmer).createBatch(
      "Mustard",
      "Nashik, Maharashtra",
      500,
      "kg",
      0,
      8000,
      "db://partial-lot-test"
    );
    const receipt = await tx.wait();
    const created = receipt.logs.map((log) => {
      try { return contract.interface.parseLog(log); } catch { return null; }
    }).find((event) => event?.name === "BatchCreated");
    return Number(created.args.batchId);
  }

  it("splits 500 into 100 and then 60 while enforcing quantity rules", async function () {
    const [farmer, distributor, retailer] = await ethers.getSigners();
    const AgriChain = await ethers.getContractFactory("AgriChain");
    const contract = await AgriChain.deploy();
    await contract.waitForDeployment();
    const batchId = await createBatch(contract, farmer);

    await expect(contract.connect(distributor).purchaseLot(batchId, 5, 8000, 1, "Hub", "Too small"))
      .to.be.revertedWith("AgriChain: Purchase quantity is below minimum allowed purchase");
    await expect(contract.connect(distributor).purchaseLot(batchId, 501, 8000, 1, "Hub", "Too large"))
      .to.be.revertedWith("AgriChain: Purchase quantity exceeds available batch quantity");
    await expect(contract.connect(distributor).purchaseLot(batchId, 495, 8000, 1, "Hub", "Small remainder"))
      .to.be.revertedWith("AgriChain: Remainder quantity would be below minimum purchase quantity");
    await expect(contract.connect(farmer).purchaseLot(batchId, 100, 8000, 1, "Hub", "Own lot"))
      .to.be.revertedWith("AgriChain: Current owner cannot purchase their own batch");
    await expect(contract.connect(distributor).purchaseLot(batchId, 100, 7000, 1, "Hub", "Wrong price"))
      .to.be.revertedWith("AgriChain: Price mismatch: offered price has changed");

    const purchaseOne = await contract.connect(distributor).purchaseLot(batchId, 100, 8000, 1, "Hub", "100 kg");
    const receiptOne = await purchaseOne.wait();
    const lotOne = receiptOne.logs.map((log) => {
      try { return contract.interface.parseLog(log); } catch { return null; }
    }).find((event) => event?.name === "LotPurchased");
    const distributorLotId = Number(lotOne.args.newBatchId);

    expect((await contract.getBatch(batchId)).quantity).to.equal(400);
    expect((await contract.getBatch(distributorLotId)).quantity).to.equal(100);
    expect((await contract.getBatch(distributorLotId)).parentBatchId).to.equal(batchId);

    const purchaseTwo = await contract.connect(retailer).purchaseLot(distributorLotId, 60, 8000, 3, "Store", "60 kg");
    const receiptTwo = await purchaseTwo.wait();
    const lotTwo = receiptTwo.logs.map((log) => {
      try { return contract.interface.parseLog(log); } catch { return null; }
    }).find((event) => event?.name === "LotPurchased");
    const retailerLotId = Number(lotTwo.args.newBatchId);

    expect((await contract.getBatch(distributorLotId)).quantity).to.equal(40);
    expect((await contract.getBatch(retailerLotId)).quantity).to.equal(60);
    expect((await contract.getBatch(retailerLotId)).parentBatchId).to.equal(distributorLotId);
    expect((await contract.getBatchHistory(batchId))[1].quantity).to.equal(100);
    expect((await contract.getBatchHistory(distributorLotId))[1].quantity).to.equal(60);
  });
});