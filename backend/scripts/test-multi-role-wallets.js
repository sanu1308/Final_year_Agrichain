import assert from 'node:assert';
import http from 'node:http';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { ethers } from 'ethers';
import { User } from '../src/models/User.js';
import contractData from '../../shared/contractData.json' with { type: 'json' };

dotenv.config();

console.log('================================================================================');
console.log('   RUNNING MULTI-ROLE & MULTI-WALLET PARALLEL BATCH LIFECYCLE TEST SUITE       ');
console.log('   6 Accounts: Farmer A/B, Distributor A/B, Retailer A/B across 2 Batches       ');
console.log('================================================================================\n');

if (process.env.MONGODB_URI) {
  await mongoose.connect(process.env.MONGODB_URI);
}

const provider = new ethers.JsonRpcProvider(process.env.RPC_URL || 'http://127.0.0.1:8545');

// 6 Distinct Hardhat Accounts
// Account #0: Farmer A
const signerFarmerA = new ethers.Wallet('0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80', provider);
// Account #1: Farmer B (demonstrates Account #1 is NOT hardcoded to Distributor)
const signerFarmerB = new ethers.Wallet('0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d', provider);
// Account #2: Distributor A
const signerDistributorA = new ethers.Wallet('0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a', provider);
// Account #3: Distributor B
const signerDistributorB = new ethers.Wallet('0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6', provider);
// Account #4: Retailer A
const signerRetailerA = new ethers.Wallet('0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a', provider);
// Account #5: Retailer B
const signerRetailerB = new ethers.Wallet('0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba', provider);

const walletFarmerA = ethers.getAddress(signerFarmerA.address);
const walletFarmerB = ethers.getAddress(signerFarmerB.address);
const walletDistributorA = ethers.getAddress(signerDistributorA.address);
const walletDistributorB = ethers.getAddress(signerDistributorB.address);
const walletRetailerA = ethers.getAddress(signerRetailerA.address);
const walletRetailerB = ethers.getAddress(signerRetailerB.address);

const contractAddress = contractData.address;
const contractFarmerA = new ethers.Contract(contractAddress, contractData.abi, signerFarmerA);
const contractFarmerB = new ethers.Contract(contractAddress, contractData.abi, signerFarmerB);
const contractDistributorA = new ethers.Contract(contractAddress, contractData.abi, signerDistributorA);
const contractDistributorB = new ethers.Contract(contractAddress, contractData.abi, signerDistributorB);
const contractRetailerA = new ethers.Contract(contractAddress, contractData.abi, signerRetailerA);
const contractRetailerB = new ethers.Contract(contractAddress, contractData.abi, signerRetailerB);

function apiRequest(path, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL('http://127.0.0.1:5000/api/v1' + path);
    const req = http.request(
      url,
      {
        method: options.method || 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...(options.headers || {}),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, data: JSON.parse(data) });
          } catch {
            resolve({ status: res.statusCode, data });
          }
        });
      }
    );
    req.on('error', reject);
    if (options.body) {
      req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
    }
    req.end();
  });
}

const testEmails = [
  'multi_farmer_a@test.com',
  'multi_farmer_b@test.com',
  'multi_dist_a@test.com',
  'multi_dist_b@test.com',
  'multi_retail_a@test.com',
  'multi_retail_b@test.com',
];

// Clean up old test data
await User.deleteMany({ email: { $in: testEmails } });
await User.updateMany(
  {
    walletAddress: {
      $in: [
        walletFarmerA,
        walletFarmerB,
        walletDistributorA,
        walletDistributorB,
        walletRetailerA,
        walletRetailerB,
        walletFarmerA.toLowerCase(),
        walletFarmerB.toLowerCase(),
        walletDistributorA.toLowerCase(),
        walletDistributorB.toLowerCase(),
        walletRetailerA.toLowerCase(),
        walletRetailerB.toLowerCase(),
      ],
    },
  },
  { $set: { walletAddress: null } }
);

try {
  // --------------------------------------------------------------------------
  // TEST A: Two different farmers with two different wallets can register/login
  // --------------------------------------------------------------------------
  console.log('A. Testing registration & login for two separate farmers with distinct wallets...');
  const regFarmerA = await apiRequest('/auth/register', {
    method: 'POST',
    body: {
      name: 'Farmer Alice',
      email: 'multi_farmer_a@test.com',
      password: 'password123',
      role: 'FARMER',
      walletAddress: walletFarmerA, // test optional binding on registration
    },
  });
  assert.strictEqual(regFarmerA.status, 201, 'Farmer A registration with wallet should succeed');
  assert.strictEqual(
    ethers.getAddress(regFarmerA.data.user.walletAddress),
    walletFarmerA,
    'Farmer A walletAddress must match'
  );
  const tokenFarmerA = regFarmerA.data.token;

  const regFarmerB = await apiRequest('/auth/register', {
    method: 'POST',
    body: {
      name: 'Farmer Bob',
      email: 'multi_farmer_b@test.com',
      password: 'password123',
      role: 'FARMER',
      walletAddress: walletFarmerB,
    },
  });
  assert.strictEqual(regFarmerB.status, 201, 'Farmer B registration with wallet should succeed');
  assert.strictEqual(
    ethers.getAddress(regFarmerB.data.user.walletAddress),
    walletFarmerB,
    'Farmer B walletAddress must match'
  );
  const tokenFarmerB = regFarmerB.data.token;

  assert.notStrictEqual(walletFarmerA, walletFarmerB, 'Farmer A and Farmer B wallets must be distinct');
  console.log(`   ✔ Farmer A bound to Account #0 (${walletFarmerA})`);
  console.log(`   ✔ Farmer B bound to Account #1 (${walletFarmerB})`);

  // Register Distributors A & B and Retailers A & B
  const regDistA = await apiRequest('/auth/register', {
    method: 'POST',
    body: {
      name: 'Distributor Dave',
      email: 'multi_dist_a@test.com',
      password: 'password123',
      role: 'DISTRIBUTOR',
      walletAddress: walletDistributorA,
    },
  });
  assert.strictEqual(regDistA.status, 201);
  const tokenDistA = regDistA.data.token;

  const regDistB = await apiRequest('/auth/register', {
    method: 'POST',
    body: {
      name: 'Distributor Dan',
      email: 'multi_dist_b@test.com',
      password: 'password123',
      role: 'DISTRIBUTOR',
      walletAddress: walletDistributorB,
    },
  });
  assert.strictEqual(regDistB.status, 201);
  const tokenDistB = regDistB.data.token;

  const regRetailA = await apiRequest('/auth/register', {
    method: 'POST',
    body: {
      name: 'Retailer Rachel',
      email: 'multi_retail_a@test.com',
      password: 'password123',
      role: 'RETAILER',
      walletAddress: walletRetailerA,
    },
  });
  assert.strictEqual(regRetailA.status, 201);
  const tokenRetailA = regRetailA.data.token;

  const regRetailB = await apiRequest('/auth/register', {
    method: 'POST',
    body: {
      name: 'Retailer Rob',
      email: 'multi_retail_b@test.com',
      password: 'password123',
      role: 'RETAILER',
      walletAddress: walletRetailerB,
    },
  });
  assert.strictEqual(regRetailB.status, 201);
  const tokenRetailB = regRetailB.data.token;
  console.log(`   ✔ Distributor A bound to Account #2 (${walletDistributorA})`);
  console.log(`   ✔ Distributor B bound to Account #3 (${walletDistributorB})`);
  console.log(`   ✔ Retailer A bound to Account #4 (${walletRetailerA})`);
  console.log(`   ✔ Retailer B bound to Account #5 (${walletRetailerB})`);

  // --------------------------------------------------------------------------
  // TEST F: A wallet cannot be registered to two different users
  // --------------------------------------------------------------------------
  console.log('\nF. Testing that the same wallet cannot be registered to two users...');
  const duplicateRegister = await apiRequest('/auth/register', {
    method: 'POST',
    body: {
      name: 'Imposter Farmer',
      email: 'imposter@test.com',
      password: 'password123',
      role: 'FARMER',
      walletAddress: walletFarmerA, // trying to steal Farmer A's wallet
    },
  });
  assert.strictEqual(duplicateRegister.status, 409, 'Duplicate wallet registration must return 409');
  assert.strictEqual(
    duplicateRegister.data.error,
    'Wallet address is already linked to another account.'
  );
  console.log('   ✔ Successfully rejected duplicate wallet registration with: "Wallet address is already linked to another account."');

  // --------------------------------------------------------------------------
  // TEST E: A user cannot perform another role's operation
  // --------------------------------------------------------------------------
  console.log('\nE. Testing role authorization boundaries...');
  // Distributor cannot create a produce batch
  const distCreateAttempt = await apiRequest('/batches', {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenDistA}` },
    body: {
      productName: 'Illegal Crop',
      category: 'Vegetables',
      originLocation: 'Goa',
      farmName: 'Ghost Farm',
      quantity: 100,
      harvestDate: new Date().toISOString(),
      initialPrice: 1.0,
    },
  });
  assert.strictEqual(distCreateAttempt.status, 403, 'Distributor must not be allowed to create batch');

  // Retailer cannot create a produce batch
  const retailCreateAttempt = await apiRequest('/batches', {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenRetailA}` },
    body: {
      productName: 'Illegal Crop 2',
      category: 'Vegetables',
      originLocation: 'Goa',
      farmName: 'Ghost Farm',
      quantity: 100,
      harvestDate: new Date().toISOString(),
      initialPrice: 1.0,
    },
  });
  assert.strictEqual(retailCreateAttempt.status, 403, 'Retailer must not be allowed to create batch');
  console.log('   ✔ Role authorization confirmed: Non-farmers cannot create produce batches.');

  // --------------------------------------------------------------------------
  // TEST B: Both farmers can create different batches
  // --------------------------------------------------------------------------
  console.log('\nB. Testing Farmer A creates Batch #1 and Farmer B creates Batch #2...');
  // 1. Farmer A creates Batch #1 draft
  const draftResA = await apiRequest('/batches', {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenFarmerA}` },
    body: {
      productName: 'Alphonso Mangoes',
      category: 'Fruits',
      originLocation: 'Ratnagiri, Maharashtra',
      farmName: 'Alice Orchards',
      quantity: 500,
      unit: 'kg',
      qualityGrade: 'PREMIUM',
      harvestDate: new Date().toISOString(),
      initialPrice: 2.0,
    },
  });
  assert.strictEqual(draftResA.status, 201);
  const dbBatch1Id = draftResA.data.batch.id;

  // Farmer A signs on-chain with Signer #0
  const tx1 = await contractFarmerA.createBatch(
    'Alphonso Mangoes',
    'Ratnagiri, Maharashtra',
    500n,
    'kg',
    3, // PREMIUM
    200n, // $2.00
    `db://${dbBatch1Id}`
  );
  const rc1 = await tx1.wait(1);
  assert.strictEqual(rc1.status, 1);
  const batch1OnChainId = Number(await contractFarmerA.getTotalBatches());

  // Confirm Batch #1 in DB
  const conf1 = await apiRequest(`/batches/${dbBatch1Id}/confirm`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${tokenFarmerA}` },
    body: {
      blockchainBatchId: batch1OnChainId,
      creationTxHash: rc1.hash,
    },
  });
  assert.strictEqual(conf1.status, 200);
  console.log(`   ✔ Batch #1 created by Farmer A on-chain (#${batch1OnChainId})`);

  // 2. Farmer B creates Batch #2 draft
  const draftResB = await apiRequest('/batches', {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenFarmerB}` },
    body: {
      productName: 'Organic Strawberries',
      category: 'Fruits',
      originLocation: 'Mahabaleshwar, Maharashtra',
      farmName: 'Bob Berry Fields',
      quantity: 300,
      unit: 'kg',
      qualityGrade: 'GRADE_A',
      harvestDate: new Date().toISOString(),
      initialPrice: 3.5,
    },
  });
  assert.strictEqual(draftResB.status, 201);
  const dbBatch2Id = draftResB.data.batch.id;

  // Farmer B signs on-chain with Signer #1
  const tx2 = await contractFarmerB.createBatch(
    'Organic Strawberries',
    'Mahabaleshwar, Maharashtra',
    300n,
    'kg',
    0, // GRADE_A
    350n, // $3.50
    `db://${dbBatch2Id}`
  );
  const rc2 = await tx2.wait(1);
  assert.strictEqual(rc2.status, 1);
  const batch2OnChainId = Number(await contractFarmerB.getTotalBatches());

  // Confirm Batch #2 in DB
  const conf2 = await apiRequest(`/batches/${dbBatch2Id}/confirm`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${tokenFarmerB}` },
    body: {
      blockchainBatchId: batch2OnChainId,
      creationTxHash: rc2.hash,
    },
  });
  assert.strictEqual(conf2.status, 200);
  console.log(`   ✔ Batch #2 created by Farmer B on-chain (#${batch2OnChainId})`);

  // --------------------------------------------------------------------------
  // TEST G: If wrong account is used, blockchain operation is blocked
  // --------------------------------------------------------------------------
  console.log('\nG. Testing wrong MetaMask account rejection...');
  // Distributor A attempts to register custody with mismatched transaction sender
  const wrongSenderAttempt = await apiRequest(`/batches/${dbBatch1Id}/transfer`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenDistA}` }, // Distributor A token
    body: {
      toAddress: walletDistributorA,
      pricePerUnit: 2.0,
      newStatus: 'WITH_DISTRIBUTOR',
      location: 'Warehouse',
      txHash: rc2.hash, // Tx was signed by Farmer B, not Distributor A!
    },
  });
  assert.strictEqual(wrongSenderAttempt.status, 403);
  assert.strictEqual(
    wrongSenderAttempt.data.error,
    'Please connect the MetaMask wallet registered with this account.'
  );
  console.log('   ✔ Blocked transaction where signer does not match registered account: "Please connect the MetaMask wallet registered with this account."');

  // --------------------------------------------------------------------------
  // TEST C: Distributors purchase farmer batches
  // --------------------------------------------------------------------------
  console.log('\nC. Testing Distributor A purchases Batch #1 & Distributor B purchases Batch #2...');
  // Distributor A accepts purchase on Batch #1 ($2.00 = 200 cents)
  const txDist1 = await contractDistributorA.acceptPurchase(
    BigInt(batch1OnChainId),
    200n,
    1, // InTransit
    'Pune Logistics Hub',
    'Accepted into cold storage'
  );
  const rcDist1 = await txDist1.wait(1);
  assert.strictEqual(rcDist1.status, 1);

  const distSync1 = await apiRequest(`/batches/${dbBatch1Id}/transfer`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenDistA}` },
    body: {
      pricePerUnit: 2.0,
      newStatus: 'WITH_DISTRIBUTOR',
      location: 'Pune Logistics Hub',
      notes: 'Accepted into cold storage',
      txHash: rcDist1.hash,
    },
  });
  assert.strictEqual(distSync1.status, 200);
  console.log(`   ✔ Distributor A (${walletDistributorA}) purchased Batch #1`);

  // Distributor B accepts purchase on Batch #2 ($3.50 = 350 cents)
  const txDist2 = await contractDistributorB.acceptPurchase(
    BigInt(batch2OnChainId),
    350n,
    1, // InTransit
    'Satara Logistics Hub',
    'Accepted into refrigerated truck'
  );
  const rcDist2 = await txDist2.wait(1);
  assert.strictEqual(rcDist2.status, 1);

  const distSync2 = await apiRequest(`/batches/${dbBatch2Id}/transfer`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenDistB}` },
    body: {
      pricePerUnit: 3.5,
      newStatus: 'WITH_DISTRIBUTOR',
      location: 'Satara Logistics Hub',
      notes: 'Accepted into refrigerated truck',
      txHash: rcDist2.hash,
    },
  });
  assert.strictEqual(distSync2.status, 200);
  console.log(`   ✔ Distributor B (${walletDistributorB}) purchased Batch #2`);

  // Distributors update selling prices
  const txPrice1 = await contractDistributorA.updateSellingPrice(
    BigInt(batch1OnChainId),
    280n, // $2.80
    'Cold chain handling applied'
  );
  await txPrice1.wait(1);

  const txPrice2 = await contractDistributorB.updateSellingPrice(
    BigInt(batch2OnChainId),
    450n, // $4.50
    'Fast transit markup applied'
  );
  await txPrice2.wait(1);
  console.log('   ✔ Both distributors updated their offered selling prices on-chain');

  // --------------------------------------------------------------------------
  // TEST D: Retailers purchase distributor batches
  // --------------------------------------------------------------------------
  console.log('\nD. Testing Retailer A purchases Batch #1 & Retailer B purchases Batch #2...');
  // Retailer A purchases Batch #1 at $2.80
  const txRet1 = await contractRetailerA.acceptPurchase(
    BigInt(batch1OnChainId),
    280n,
    3, // WithRetailer
    'Mumbai Hypermarket Store #12',
    'Received on loading dock'
  );
  const rcRet1 = await txRet1.wait(1);
  assert.strictEqual(rcRet1.status, 1);

  const retSync1 = await apiRequest(`/batches/${dbBatch1Id}/transfer`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenRetailA}` },
    body: {
      pricePerUnit: 2.8,
      newStatus: 'WITH_RETAILER',
      location: 'Mumbai Hypermarket Store #12',
      notes: 'Received on loading dock',
      txHash: rcRet1.hash,
    },
  });
  assert.strictEqual(retSync1.status, 200);
  console.log(`   ✔ Retailer A (${walletRetailerA}) purchased Batch #1`);

  // Retailer B purchases Batch #2 at $4.50
  const txRet2 = await contractRetailerB.acceptPurchase(
    BigInt(batch2OnChainId),
    450n,
    3, // WithRetailer
    'Bengaluru Supermarket Store #5',
    'Dock inspection complete'
  );
  const rcRet2 = await txRet2.wait(1);
  assert.strictEqual(rcRet2.status, 1);

  const retSync2 = await apiRequest(`/batches/${dbBatch2Id}/transfer`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenRetailB}` },
    body: {
      pricePerUnit: 4.5,
      newStatus: 'WITH_RETAILER',
      location: 'Bengaluru Supermarket Store #5',
      notes: 'Dock inspection complete',
      txHash: rcRet2.hash,
    },
  });
  assert.strictEqual(retSync2.status, 200);
  console.log(`   ✔ Retailer B (${walletRetailerB}) purchased Batch #2`);

  // --------------------------------------------------------------------------
  // TEST H: Blockchain history contains the actual wallet addresses
  // --------------------------------------------------------------------------
  console.log('\nH. Verifying blockchain batch history and final ownership for both batches...');
  const batch1OnChain = await contractRetailerA.getBatch(batch1OnChainId);
  const batch2OnChain = await contractRetailerB.getBatch(batch2OnChainId);

  assert.strictEqual(
    ethers.getAddress(batch1OnChain.farmer),
    walletFarmerA,
    'Batch #1 farmer must equal Farmer A wallet'
  );
  assert.strictEqual(
    ethers.getAddress(batch1OnChain.currentOwner),
    walletRetailerA,
    'Batch #1 currentOwner must equal Retailer A wallet'
  );

  assert.strictEqual(
    ethers.getAddress(batch2OnChain.farmer),
    walletFarmerB,
    'Batch #2 farmer must equal Farmer B wallet'
  );
  assert.strictEqual(
    ethers.getAddress(batch2OnChain.currentOwner),
    walletRetailerB,
    'Batch #2 currentOwner must equal Retailer B wallet'
  );

  const history1 = await contractRetailerA.getBatchHistory(batch1OnChainId);
  console.log(`   ✔ Batch #1 on-chain history has ${history1.length} custody transitions:`);
  for (const h of history1) {
    console.log(`      ${h.from} -> ${h.to} ($${(Number(h.price) / 100).toFixed(2)}) [${h.notes}]`);
  }

  const history2 = await contractRetailerB.getBatchHistory(batch2OnChainId);
  console.log(`   ✔ Batch #2 on-chain history has ${history2.length} custody transitions:`);
  for (const h of history2) {
    console.log(`      ${h.from} -> ${h.to} ($${(Number(h.price) / 100).toFixed(2)}) [${h.notes}]`);
  }

  assert.strictEqual(ethers.getAddress(history1[0].to), walletFarmerA);
  assert.strictEqual(ethers.getAddress(history1[1].to), walletDistributorA);
  assert.strictEqual(ethers.getAddress(history1[2].to), walletRetailerA);

  assert.strictEqual(ethers.getAddress(history2[0].to), walletFarmerB);
  assert.strictEqual(ethers.getAddress(history2[1].to), walletDistributorB);
  assert.strictEqual(ethers.getAddress(history2[2].to), walletRetailerB);

  // --------------------------------------------------------------------------
  // TEST I: Existing QR / consumer verification continues to work without wallet
  // --------------------------------------------------------------------------
  console.log('\nI. Testing public consumer verification (zero wallet required)...');
  const pubVerify1 = await apiRequest(`/public/verify/${batch1OnChainId}`);
  assert.strictEqual(pubVerify1.status, 200);
  assert.strictEqual(pubVerify1.data.integrityStatus, 'VERIFIED');
  assert.strictEqual(pubVerify1.data.batch.productName, 'Alphonso Mangoes');

  const pubVerify2 = await apiRequest(`/public/verify/${batch2OnChainId}`);
  assert.strictEqual(pubVerify2.status, 200);
  assert.strictEqual(pubVerify2.data.integrityStatus, 'VERIFIED');
  assert.strictEqual(pubVerify2.data.batch.productName, 'Organic Strawberries');
  console.log('   ✔ Public consumer verification verified for both batches without any wallet');

  console.log('\n================================================================================');
  console.log('   SUCCESS: ALL MULTI-ROLE & MULTI-WALLET LIFECYCLE TESTS PASSED (100%)         ');
  console.log('================================================================================\n');

  await User.deleteMany({ email: { $in: testEmails } });
  process.exit(0);
} catch (err) {
  console.error('\n❌ Test failed with error:', err);
  process.exit(1);
}
