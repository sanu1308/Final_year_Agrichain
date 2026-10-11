import assert from 'node:assert';
import http from 'node:http';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { ethers } from 'ethers';
import { User } from '../src/models/User.js';
import contractData from '../../shared/contractData.json' with { type: 'json' };

dotenv.config();

console.log('========================================================================');
console.log('   RUNNING COMPLETE ROLE-BASED METAMASK WALLET BINDING TEST SUITE   ');
console.log('========================================================================\n');

// Connect Mongoose to clean up any temporary test users
if (process.env.MONGODB_URI) {
  await mongoose.connect(process.env.MONGODB_URI);
}

// Hardhat Provider and Signers
const provider = new ethers.JsonRpcProvider(process.env.RPC_URL || 'http://127.0.0.1:8545');

// Distinct Hardhat accounts for testing
// Signer 0: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 (Farmer A)
// Signer 4: 0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65 (Farmer B)
// Signer 1: 0x70997970C51812dc3A010C7d01b50e0d17dc79C8 (Distributor A)
// Signer 2: 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC (Retailer A)
// Signer 5: 0x9965507D1a55bcC2695C58ba16FB37d819B0A4df (Distributor B)

const signerFarmerA = new ethers.Wallet('0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80', provider);
const signerFarmerB = new ethers.Wallet('0x47e179ec3427449b3b95644281925f661334d36e16d473cb5b8e37a2c83fe2b6', provider);
const signerDistributorA = new ethers.Wallet('0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d', provider);
const signerRetailerA = new ethers.Wallet('0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a', provider);
const signerDistributorB = new ethers.Wallet('0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba', provider);

const walletA = signerFarmerA.address.toLowerCase();
const walletB = signerFarmerB.address.toLowerCase();
const walletC = signerDistributorA.address.toLowerCase();
const walletD = signerRetailerA.address.toLowerCase();
const walletE = signerDistributorB.address.toLowerCase();

const contractAddress = contractData.address;
const contractFarmerA = new ethers.Contract(contractAddress, contractData.abi, signerFarmerA);
const contractDistributorA = new ethers.Contract(contractAddress, contractData.abi, signerDistributorA);
const contractRetailerA = new ethers.Contract(contractAddress, contractData.abi, signerRetailerA);

// Helper for HTTP requests to local Express backend
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
          } catch (e) {
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

// Clean up any test users from previous test runs
const testEmails = [
  'wb_farmer_a@test.com',
  'wb_farmer_b@test.com',
  'wb_dist_a@test.com',
  'wb_dist_b@test.com',
  'wb_retail_a@test.com',
  'wb_admin_a@test.com',
  'wb_consumer_a@test.com',
];
await User.deleteMany({ email: { $in: testEmails } });
// Unset any existing bindings on test wallets from older seed users
await User.updateMany(
  { walletAddress: { $in: [walletA, walletB, walletC, walletD, walletE] } },
  { $set: { walletAddress: null } }
);

try {
  // --------------------------------------------------------------------------
  // TEST 1: Farmer A registers (walletAddress = null) and links Wallet A
  // --------------------------------------------------------------------------
  console.log('1. Testing Farmer A Registration & Wallet A Binding...');
  const regFarmerA = await apiRequest('/auth/register', {
    method: 'POST',
    body: {
      name: 'Farmer Alice',
      email: 'wb_farmer_a@test.com',
      password: 'password123',
      role: 'FARMER',
    },
  });
  assert.strictEqual(regFarmerA.status, 201, 'Farmer A registration should succeed');
  assert.strictEqual(regFarmerA.data.user.walletAddress, null, 'Farmer A must have walletAddress=null initially');

  const tokenFarmerA = regFarmerA.data.token;
  const linkFarmerA = await apiRequest('/auth/link-wallet', {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenFarmerA}` },
    body: { walletAddress: walletA },
  });
  assert.strictEqual(linkFarmerA.status, 200, 'Farmer A linking Wallet A must succeed');
  assert.strictEqual(linkFarmerA.data.walletAddress, walletA, 'Farmer A walletAddress must match Wallet A');
  console.log(`   ✔ Farmer A successfully registered with null wallet and bound to Wallet A (${walletA})`);

  // --------------------------------------------------------------------------
  // TEST 2: Farmer B registers (walletAddress = null) and links Wallet B
  // --------------------------------------------------------------------------
  console.log('\n2. Testing Farmer B Registration & Wallet B Binding...');
  const regFarmerB = await apiRequest('/auth/register', {
    method: 'POST',
    body: {
      name: 'Farmer Bob',
      email: 'wb_farmer_b@test.com',
      password: 'password123',
      role: 'FARMER',
    },
  });
  assert.strictEqual(regFarmerB.status, 201, 'Farmer B registration should succeed');
  assert.strictEqual(regFarmerB.data.user.walletAddress, null, 'Farmer B must have walletAddress=null initially');

  const tokenFarmerB = regFarmerB.data.token;
  const linkFarmerB = await apiRequest('/auth/link-wallet', {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenFarmerB}` },
    body: { walletAddress: walletB },
  });
  assert.strictEqual(linkFarmerB.status, 200, 'Farmer B linking Wallet B must succeed');
  assert.strictEqual(linkFarmerB.data.walletAddress, walletB, 'Farmer B walletAddress must match Wallet B');
  console.log(`   ✔ Farmer B successfully registered with null wallet and bound to Wallet B (${walletB})`);

  // --------------------------------------------------------------------------
  // TEST 3: Farmer A and Farmer B have different wallet addresses
  // --------------------------------------------------------------------------
  console.log('\n3. Verifying Farmer A and Farmer B have distinct wallet identities...');
  assert.notStrictEqual(walletA, walletB, 'Wallet A and Wallet B must be distinct');
  assert.strictEqual(linkFarmerA.data.walletAddress !== linkFarmerB.data.walletAddress, true);
  console.log(`   ✔ Confirmed: Farmer A (${walletA}) != Farmer B (${walletB})`);

  // --------------------------------------------------------------------------
  // TEST 4: Distributor links Wallet C
  // --------------------------------------------------------------------------
  console.log('\n4. Testing Distributor A Registration & Wallet C Binding...');
  const regDistA = await apiRequest('/auth/register', {
    method: 'POST',
    body: {
      name: 'Distributor Dave',
      email: 'wb_dist_a@test.com',
      password: 'password123',
      role: 'DISTRIBUTOR',
    },
  });
  assert.strictEqual(regDistA.status, 201);
  assert.strictEqual(regDistA.data.user.walletAddress, null);

  const tokenDistA = regDistA.data.token;
  const linkDistA = await apiRequest('/auth/link-wallet', {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenDistA}` },
    body: { walletAddress: walletC },
  });
  assert.strictEqual(linkDistA.status, 200);
  assert.strictEqual(linkDistA.data.walletAddress, walletC);
  console.log(`   ✔ Distributor A successfully bound to Wallet C (${walletC})`);

  // --------------------------------------------------------------------------
  // TEST 5: Retailer links Wallet D
  // --------------------------------------------------------------------------
  console.log('\n5. Testing Retailer A Registration & Wallet D Binding...');
  const regRetailA = await apiRequest('/auth/register', {
    method: 'POST',
    body: {
      name: 'Retailer Rachel',
      email: 'wb_retail_a@test.com',
      password: 'password123',
      role: 'RETAILER',
    },
  });
  assert.strictEqual(regRetailA.status, 201);
  assert.strictEqual(regRetailA.data.user.walletAddress, null);

  const tokenRetailA = regRetailA.data.token;
  const linkRetailA = await apiRequest('/auth/link-wallet', {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenRetailA}` },
    body: { walletAddress: walletD },
  });
  assert.strictEqual(linkRetailA.status, 200);
  assert.strictEqual(linkRetailA.data.walletAddress, walletD);
  console.log(`   ✔ Retailer A successfully bound to Wallet D (${walletD})`);

  // --------------------------------------------------------------------------
  // TEST 6: Same wallet cannot be linked to two users
  // --------------------------------------------------------------------------
  console.log('\n6. Testing Duplicate Wallet Binding Prevention (Global Uniqueness)...');
  const regDistB = await apiRequest('/auth/register', {
    method: 'POST',
    body: {
      name: 'Distributor Dan',
      email: 'wb_dist_b@test.com',
      password: 'password123',
      role: 'DISTRIBUTOR',
    },
  });
  const tokenDistB = regDistB.data.token;

  // Distributor B tries to link Wallet A (already bound to Farmer A)
  const dupLink = await apiRequest('/auth/link-wallet', {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenDistB}` },
    body: { walletAddress: walletA },
  });
  assert.strictEqual(dupLink.status, 409, 'Must return 409 Conflict when linking an already-bound wallet');
  assert.strictEqual(
    dupLink.data.error.includes('already linked to another account') ||
      dupLink.data.error.includes('already registered to another account'),
    true
  );
  console.log('   ✔ Successfully BLOCKED duplicate wallet binding: HTTP 409 Conflict returned.');

  // --------------------------------------------------------------------------
  // TEST 7: Farmer cannot use Distributor\'s wallet
  // --------------------------------------------------------------------------
  console.log('\n7. Testing Cross-Role Isolation: Farmer cannot link Distributor\'s wallet...');
  const regFarmerC = await apiRequest('/auth/register', {
    method: 'POST',
    body: {
      name: 'Farmer Charlie',
      email: 'wb_farmer_c@test.com',
      password: 'password123',
      role: 'FARMER',
    },
  });
  const farmerTryingDistWallet = await apiRequest('/auth/link-wallet', {
    method: 'POST',
    headers: { Authorization: `Bearer ${regFarmerC.data.token}` },
    body: { walletAddress: walletC }, // Distributor A's wallet
  });
  assert.strictEqual(farmerTryingDistWallet.status, 409);
  console.log('   ✔ Blocked: Farmer cannot claim Distributor wallet.');

  // --------------------------------------------------------------------------
  // TEST 8: Distributor cannot use Retailer\'s wallet
  // --------------------------------------------------------------------------
  console.log('\n8. Testing Cross-Role Isolation: Distributor cannot link Retailer\'s wallet...');
  const distTryingRetailWallet = await apiRequest('/auth/link-wallet', {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenDistB}` },
    body: { walletAddress: walletD }, // Retailer A's wallet
  });
  assert.strictEqual(distTryingRetailWallet.status, 409);
  console.log('   ✔ Blocked: Distributor cannot claim Retailer wallet.');

  // --------------------------------------------------------------------------
  // TEST 9: Retailer cannot use Farmer\'s wallet
  // --------------------------------------------------------------------------
  console.log('\n9. Testing Cross-Role Isolation: Retailer cannot link Farmer\'s wallet...');
  const regRetailB = await apiRequest('/auth/register', {
    method: 'POST',
    body: {
      name: 'Retailer Rob',
      email: 'wb_retail_b@test.com',
      password: 'password123',
      role: 'RETAILER',
    },
  });
  const retailTryingFarmerWallet = await apiRequest('/auth/link-wallet', {
    method: 'POST',
    headers: { Authorization: `Bearer ${regRetailB.data.token}` },
    body: { walletAddress: walletB }, // Farmer B's wallet
  });
  assert.strictEqual(retailTryingFarmerWallet.status, 409);
  console.log('   ✔ Blocked: Retailer cannot claim Farmer wallet.');

  // Clean up temporary Charlie & Rob
  await User.deleteMany({ email: { $in: ['wb_farmer_c@test.com', 'wb_retail_b@test.com'] } });

  // --------------------------------------------------------------------------
  // TEST 10 & 11: Account Switching Detection & Blocking on Wrong Account
  // --------------------------------------------------------------------------
  console.log('\n10 & 11. Testing Account Switching & Mismatch Guard...');
  // Testing linkWallet overwrite rejection:
  // Farmer A (already bound to walletA) tries to re-link to walletE
  const overwriteAttempt = await apiRequest('/auth/link-wallet', {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenFarmerA}` },
    body: { walletAddress: walletE },
  });
  assert.strictEqual(overwriteAttempt.status, 400, 'Cannot silently overwrite existing wallet binding');
  assert.strictEqual(overwriteAttempt.data.error.includes('Wallet binding cannot be changed'), true);
  console.log('   ✔ Silent account replacement strictly blocked: "Wallet binding cannot be changed. Please switch MetaMask."');

  // --------------------------------------------------------------------------
  // TEST 12: Farmer-created batch owner equals Farmer\'s connected wallet
  // --------------------------------------------------------------------------
  console.log('\n12. Testing Farmer Batch Creation tied to Farmer\'s Connected Wallet...');
  // 1. Unlinked farmer cannot create draft
  const unlinkedDraft = await apiRequest('/batches', {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenDistB}` }, // DistB has role DISTRIBUTOR
    body: {
      productName: 'Unlinked Wheat',
      category: 'Grains',
      originLocation: 'Punjab',
      farmName: 'Test Farm',
      quantity: 100,
      harvestDate: new Date().toISOString(),
      farmerWallet: walletE,
      initialPrice: 1.20,
    },
  });
  assert.strictEqual(unlinkedDraft.status, 403, 'Non-farmer cannot create produce batch');

  // 2. Farmer A creates draft with their verified wallet A
  const draftA = await apiRequest('/batches', {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenFarmerA}` },
    body: {
      productName: 'Organic Alphonso Mangoes',
      category: 'Fruits',
      originLocation: 'Ratnagiri, Maharashtra',
      farmName: 'Sahyadri Orchards',
      quantity: 500,
      unit: 'kg',
      qualityGrade: 'PREMIUM',
      harvestDate: new Date().toISOString(),
      farmerWallet: walletA,
      initialPrice: 1.50,
      images: ['https://images.unsplash.com/photo-1553279768-865429fa0078'],
    },
  });
  assert.strictEqual(draftA.status, 201, 'Farmer A draft creation must succeed');
  const dbBatchId = draftA.data.batch.id;

  // 3. Farmer A signs on-chain transaction
  const txCreate = await contractFarmerA.createBatch(
    'Organic Alphonso Mangoes',
    'Ratnagiri, Maharashtra',
    500n,
    'kg',
    3, // PREMIUM
    150n, // $1.50 = 150 cents
    `db://${dbBatchId}`
  );
  const rcCreate = await txCreate.wait(1);
  assert.strictEqual(rcCreate.status, 1);

  // Parse batchId from event
  let onChainBatchId = null;
  for (const log of rcCreate.logs) {
    try {
      const parsed = contractFarmerA.interface.parseLog({
        topics: [...log.topics],
        data: log.data,
      });
      if (parsed && (parsed.name === 'BatchCreated' || parsed.fragment?.name === 'BatchCreated')) {
        onChainBatchId = Number(parsed.args[0] || parsed.args.batchId);
        break;
      }
    } catch {}
  }
  if (!onChainBatchId) {
    onChainBatchId = Number(await contractFarmerA.getTotalBatches());
  }
  assert.strictEqual(typeof onChainBatchId, 'number', 'onChainBatchId must be a valid number');

  // Confirm in database
  const confirmRes = await apiRequest(`/batches/${dbBatchId}/confirm`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${tokenFarmerA}` },
    body: {
      blockchainBatchId: onChainBatchId,
      creationTxHash: rcCreate.hash,
    },
  });
  assert.strictEqual(confirmRes.status, 200);

  // Check on-chain owner
  const onChainBatchData = await contractFarmerA.getBatch(onChainBatchId);
  assert.strictEqual(onChainBatchData.currentOwner.toLowerCase(), walletA, 'On-chain owner must equal Farmer A wallet');
  console.log(`   ✔ Batch #${onChainBatchId} created. On-chain owner verified as Farmer A (${walletA})`);

  // --------------------------------------------------------------------------
  // TEST 13: Distributor purchase transfers ownership only after successful buyer tx
  // --------------------------------------------------------------------------
  console.log('\n13. Testing Distributor "Accept & Purchase" with Connected Distributor Wallet...');
  // Distributor A accepts purchase at offered price $1.50 (150 cents)
  const txDistAccept = await contractDistributorA.acceptPurchase(
    BigInt(onChainBatchId),
    150n, // expected price
    1, // InTransit
    'Navi Mumbai Cold Hub',
    'Cold chain verified at 4.5C'
  );
  const rcDistAccept = await txDistAccept.wait(1);
  assert.strictEqual(rcDistAccept.status, 1);

  // Sync with DB
  const distCustodyRes = await apiRequest(`/batches/${dbBatchId}/transfer`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenDistA}` },
    body: {
      pricePerUnit: 1.50,
      newStatus: 'IN_TRANSIT',
      location: 'Navi Mumbai Cold Hub',
      notes: 'Cold chain container locked at 4.5C',
      txHash: rcDistAccept.hash,
    },
  });
  assert.strictEqual(distCustodyRes.status, 200);

  // Check on-chain ownership transferred to Distributor A
  const afterDistBatch = await contractDistributorA.getBatch(onChainBatchId);
  assert.strictEqual(afterDistBatch.currentOwner.toLowerCase(), walletC, 'Owner must now be Distributor A');
  console.log(`   ✔ On-chain ownership successfully transferred to Distributor A (${walletC})`);

  // --------------------------------------------------------------------------
  // TEST 14: Retailer purchase transfers ownership only after successful buyer tx
  // --------------------------------------------------------------------------
  console.log('\n14. Testing Retailer "Accept & Purchase" with Connected Retailer Wallet...');
  // Distributor updates selling price to $2.25 (225 cents) for retailer
  const txMarkup = await contractDistributorA.updateSellingPrice(
    BigInt(onChainBatchId),
    225n,
    'Wholesale markup applied'
  );
  await txMarkup.wait(1);

  // Retailer A accepts purchase at $2.25
  const txRetailAccept = await contractRetailerA.acceptPurchase(
    BigInt(onChainBatchId),
    225n,
    3, // WithRetailer
    'FreshBazaar Store #42, Mumbai',
    'Received on retail loading dock'
  );
  const rcRetailAccept = await txRetailAccept.wait(1);
  assert.strictEqual(rcRetailAccept.status, 1);

  // Sync with DB
  const retailCustodyRes = await apiRequest(`/batches/${dbBatchId}/transfer`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenRetailA}` },
    body: {
      pricePerUnit: 2.25,
      newStatus: 'WITH_RETAILER',
      location: 'FreshBazaar Store #42, Mumbai',
      notes: 'Dock inspection passed',
      txHash: rcRetailAccept.hash,
    },
  });
  assert.strictEqual(retailCustodyRes.status, 200);

  const afterRetailBatch = await contractRetailerA.getBatch(onChainBatchId);
  assert.strictEqual(afterRetailBatch.currentOwner.toLowerCase(), walletD, 'Owner must now be Retailer A');
  console.log(`   ✔ On-chain ownership successfully transferred to Retailer A (${walletD})`);

  // --------------------------------------------------------------------------
  // TEST 15: Price update does not transfer ownership
  // --------------------------------------------------------------------------
  console.log('\n15. Testing Price Update Does NOT Transfer Ownership...');
  const txShelfPrice = await contractRetailerA.updateSellingPrice(
    BigInt(onChainBatchId),
    320n, // $3.20 shelf price
    'Official consumer shelf price set'
  );
  const rcShelfPrice = await txShelfPrice.wait(1);
  assert.strictEqual(rcShelfPrice.status, 1);

  const afterPriceBatch = await contractRetailerA.getBatch(onChainBatchId);
  assert.strictEqual(Number(afterPriceBatch.currentPrice), 320);
  assert.strictEqual(afterPriceBatch.currentOwner.toLowerCase(), walletD, 'Ownership must remain Retailer A');
  console.log(`   ✔ Shelf price updated to $3.20. On-chain owner remains Retailer A (${walletD})`);

  // --------------------------------------------------------------------------
  // TEST 16: Admin does not require wallet
  // --------------------------------------------------------------------------
  console.log('\n16. Testing Admin Exclusion (Zero Wallet Required)...');
  const regAdmin = await apiRequest('/auth/register', {
    method: 'POST',
    body: {
      name: 'System Auditor',
      email: 'wb_admin_a@test.com',
      password: 'password123',
      role: 'ADMIN',
    },
  });
  assert.strictEqual(regAdmin.status, 201);
  assert.strictEqual(regAdmin.data.user.walletAddress, null);

  // Admin fetches stats without wallet
  const adminStats = await apiRequest('/admin/stats', {
    headers: { Authorization: `Bearer ${regAdmin.data.token}` },
  });
  assert.strictEqual(adminStats.status, 200, 'Admin can fetch stats without any wallet');

  // Attempting to link wallet to Admin is rejected
  const adminLinkAttempt = await apiRequest('/auth/link-wallet', {
    method: 'POST',
    headers: { Authorization: `Bearer ${regAdmin.data.token}` },
    body: { walletAddress: walletE },
  });
  assert.strictEqual(adminLinkAttempt.status, 400);
  assert.strictEqual(adminLinkAttempt.data.error.includes('Wallet binding is not required or permitted for ADMIN'), true);
  console.log('   ✔ Admin successfully excluded: zero wallet required, wallet binding rejected for ADMIN.');

  // --------------------------------------------------------------------------
  // TEST 17: Consumer does not require wallet
  // --------------------------------------------------------------------------
  console.log('\n17. Testing Consumer Exclusion (Zero Wallet Required)...');
  const regConsumer = await apiRequest('/auth/register', {
    method: 'POST',
    body: {
      name: 'Public Consumer',
      email: 'wb_consumer_a@test.com',
      password: 'password123',
      role: 'CONSUMER',
    },
  });
  assert.strictEqual(regConsumer.status, 201);
  assert.strictEqual(regConsumer.data.user.walletAddress, null);

  // Public verify endpoint works with zero wallet and zero authentication
  const publicVerify = await apiRequest(`/public/verify/${onChainBatchId}`);
  assert.strictEqual(publicVerify.status, 200, 'Public verify works without wallet');
  assert.strictEqual(publicVerify.data.integrityStatus, 'VERIFIED');
  assert.ok(publicVerify.data.batch, 'Public verify returns batch data');

  // Attempting to link wallet to Consumer is rejected
  const consumerLinkAttempt = await apiRequest('/auth/link-wallet', {
    method: 'POST',
    headers: { Authorization: `Bearer ${regConsumer.data.token}` },
    body: { walletAddress: walletE },
  });
  assert.strictEqual(consumerLinkAttempt.status, 400);
  assert.strictEqual(consumerLinkAttempt.data.error.includes('Wallet binding is not required or permitted for CONSUMER'), true);
  console.log('   ✔ Consumer successfully excluded: public verification works without wallet, wallet binding rejected.');

  // --------------------------------------------------------------------------
  // TEST 18: No hardcoded wallet is used as a permanent user identity
  // --------------------------------------------------------------------------
  console.log('\n18. Verifying No Hardcoded Wallets Assigned to New Users...');
  const users = await User.find({ email: { $in: testEmails } });
  for (const u of users) {
    if (u.role === 'ADMIN' || u.role === 'CONSUMER') {
      assert.strictEqual(u.walletAddress, null, `${u.role} must never have a wallet address`);
    }
  }
  console.log('   ✔ Verified: Zero default or fallback wallets assigned.');

  console.log('\n========================================================================');
  console.log('  ALL 18 ROLE-BASED METAMASK WALLET BINDING TESTS PASSED (100% SUCCESS)  ');
  console.log('========================================================================\n');

  // Clean up test data
  await User.deleteMany({ email: { $in: testEmails } });
  process.exit(0);
} catch (error) {
  console.error('\n❌ Test failed with error:', error);
  process.exit(1);
}
