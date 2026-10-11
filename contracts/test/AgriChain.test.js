const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("AgriChain Smart Contract", function () {
  let agrichain;
  let owner, farmer, distributor, retailer, consumer;

  beforeEach(async function () {
    [owner, farmer, distributor, retailer, consumer] = await ethers.getSigners();

    const AgriChain = await ethers.getContractFactory("AgriChain");
    agrichain = await AgriChain.deploy();
    await agrichain.waitForDeployment();
  });

  describe("Batch Creation", function () {
    it("Should allow a farmer to create a produce batch and emit BatchCreated event", async function () {
      const tx = await agrichain.connect(farmer).createBatch(
        "Alphonso Mangoes",
        "Ratnagiri, Maharashtra",
        1000,
        "kg",
        0, // GradeA
        150, // $1.50 in cents
        "ipfs://QmSampleMetadataHash123"
      );

      await expect(tx)
        .to.emit(agrichain, "BatchCreated")
        .withArgs(1, "Alphonso Mangoes", farmer.address, 1000, 0, 150, (val) => val > 0);

      const batch = await agrichain.getBatch(1);
      expect(batch.id).to.equal(1);
      expect(batch.productName).to.equal("Alphonso Mangoes");
      expect(batch.origin).to.equal("Ratnagiri, Maharashtra");
      expect(batch.farmer).to.equal(farmer.address);
      expect(batch.currentOwner).to.equal(farmer.address);
      expect(batch.quantity).to.equal(1000);
      expect(batch.currentPrice).to.equal(150);
      expect(batch.status).to.equal(0); // Harvested
      expect(batch.exists).to.be.true;

      const history = await agrichain.getBatchHistory(1);
      expect(history.length).to.equal(1);
      expect(history[0].to).to.equal(farmer.address);
      expect(history[0].price).to.equal(150);
    });

    it("Should reject batch creation with empty name or zero quantity", async function () {
      await expect(
        agrichain.connect(farmer).createBatch("", "Nashik", 100, "kg", 0, 100, "")
      ).to.be.revertedWith("Product name cannot be empty");

      await expect(
        agrichain.connect(farmer).createBatch("Onions", "Nashik", 0, "kg", 0, 100, "")
      ).to.be.revertedWith("Quantity must be greater than 0");
    });
  });

  describe("Buyer Acceptance, Ownership Transfer & Pricing Transparency", function () {
    beforeEach(async function () {
      await agrichain.connect(farmer).createBatch(
        "Organic Basmati Rice",
        "Dehradun, Uttarakhand",
        500,
        "kg",
        3, // Premium
        200, // $2.00
        "ipfs://QmBasmatiHash"
      );
    });

    it("Should allow distributor to accept & purchase batch at farmer's offered price", async function () {
      const tx = await agrichain.connect(distributor).acceptPurchase(
        1,
        200, // exactly matches farmer's offered price
        1, // InTransit
        "Central Logistics Hub, Delhi",
        "Dispatched via refrigerated container #42"
      );

      await expect(tx)
        .to.emit(agrichain, "BatchTransferred")
        .withArgs(
          1,
          farmer.address,
          distributor.address,
          200,
          1,
          "Central Logistics Hub, Delhi",
          (val) => val > 0
        );

      await expect(tx)
        .to.emit(agrichain, "PurchaseAccepted")
        .withArgs(
          1,
          farmer.address,
          distributor.address,
          200,
          1,
          (val) => val > 0
        );

      const batch = await agrichain.getBatch(1);
      expect(batch.currentOwner).to.equal(distributor.address);
      expect(batch.currentPrice).to.equal(200);
      expect(batch.status).to.equal(1); // InTransit

      const history = await agrichain.getBatchHistory(1);
      expect(history.length).to.equal(2);
      expect(history[1].from).to.equal(farmer.address);
      expect(history[1].to).to.equal(distributor.address);
      expect(history[1].price).to.equal(200);
    });

    it("Should reject acceptPurchase if expected price does not match currently offered price", async function () {
      await expect(
        agrichain.connect(distributor).acceptPurchase(
          1,
          150, // wrong price (stale or lower)
          1,
          "Central Logistics Hub",
          "Attempt underpaying"
        )
      ).to.be.revertedWith("AgriChain: Price mismatch: offered price has changed");
    });

    it("Should prevent current owner from accepting their own batch", async function () {
      await expect(
        agrichain.connect(farmer).acceptPurchase(
          1,
          200,
          1,
          "Same farm",
          "Self purchase attempt"
        )
      ).to.be.revertedWith("AgriChain: Current owner cannot purchase their own batch");
    });

    it("Should reject invalid state transitions during purchase", async function () {
      // Trying to purchase straight to WithRetailer from Harvested
      await expect(
        agrichain.connect(retailer).acceptPurchase(
          1,
          200,
          3, // WithRetailer directly from Harvested
          "Retail Store",
          "Skipping distributor"
        )
      ).to.be.revertedWith("AgriChain: Invalid status transition for distributor purchase");
    });

    it("Should allow distributor to update selling price without transferring ownership", async function () {
      // Step 1: Distributor accepts purchase
      await agrichain.connect(distributor).acceptPurchase(
        1,
        200,
        1,
        "Delhi Logistics Hub",
        "Goods accepted into cold storage"
      );

      // Step 2: Distributor updates offered selling price (markup)
      const tx = await agrichain.connect(distributor).updateSellingPrice(
        1,
        280, // markup to $2.80
        "Added cold chain logistics markup"
      );

      await expect(tx)
        .to.emit(agrichain, "BatchStatusUpdated")
        .withArgs(1, 1, 280, "Added cold chain logistics markup", (val) => val > 0);

      const batch = await agrichain.getBatch(1);
      // Owner must still be distributor!
      expect(batch.currentOwner).to.equal(distributor.address);
      expect(batch.currentPrice).to.equal(280);
    });

    it("Should allow retailer to accept distributor's offered price and then set retail shelf price", async function () {
      // Step 1: Distributor buys from Farmer
      await agrichain.connect(distributor).acceptPurchase(
        1,
        200,
        1,
        "Delhi Logistics Hub",
        "Accepted from farmer"
      );

      // Step 2: Distributor sets wholesale markup
      await agrichain.connect(distributor).updateSellingPrice(
        1,
        280,
        "Markup to $2.80"
      );

      // Step 3: Retailer accepts distributor's offered price
      await agrichain.connect(retailer).acceptPurchase(
        1,
        280, // matches distributor's updated selling price
        3, // WithRetailer
        "FreshMart Supermarket #101",
        "Received at supermarket receiving dock"
      );

      let batch = await agrichain.getBatch(1);
      expect(batch.currentOwner).to.equal(retailer.address);
      expect(batch.currentPrice).to.equal(280);
      expect(batch.status).to.equal(3); // WithRetailer

      // Step 4: Retailer sets final retail shelf price
      await agrichain.connect(retailer).updateSellingPrice(
        1,
        350, // $3.50 retail shelf price
        "Final consumer shelf price with QR tag"
      );

      batch = await agrichain.getBatch(1);
      expect(batch.currentOwner).to.equal(retailer.address);
      expect(batch.currentPrice).to.equal(350);

      const history = await agrichain.getBatchHistory(1);
      expect(history.length).to.equal(5);
    });

    it("Should reject unilateral transferCustody calls", async function () {
      await expect(
        agrichain.connect(farmer).transferCustody(
          1,
          distributor.address,
          250,
          1,
          "Hub",
          "Attempt unilateral transfer"
        )
      ).to.be.revertedWith("AgriChain: Unilateral transfer disabled. Buyer must call acceptPurchase or purchaseLot");
    });
  });

  describe("Status Updates and Emergency Recall", function () {
    beforeEach(async function () {
      await agrichain.connect(farmer).createBatch(
        "Strawberries",
        "Mahabaleshwar",
        200,
        "kg",
        0,
        300,
        ""
      );
    });

    it("Should allow owner to recall batch if contaminated", async function () {
      await expect(
        agrichain.connect(farmer).recallBatch(1, "Suspected cold chain breach")
      )
        .to.emit(agrichain, "BatchRecalled")
        .withArgs(1, farmer.address, "Suspected cold chain breach", (val) => val > 0);

      const batch = await agrichain.getBatch(1);
      expect(batch.status).to.equal(5); // Recalled

      // Once recalled, cannot be purchased
      await expect(
        agrichain.connect(distributor).acceptPurchase(
          1,
          300,
          1,
          "Hub",
          "Attempt purchase after recall"
        )
      ).to.be.revertedWith("AgriChain: Batch is already terminal (Sold or Recalled)");
    });
  });
});
