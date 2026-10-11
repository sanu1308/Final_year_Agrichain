import assert from 'node:assert';
import http from 'node:http';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { ethers } from 'ethers';
import { BlockchainService } from '../src/services/blockchain.service.js';
import contractData from '../../shared/contractData.json' with { type: 'json' };

dotenv.config();
if (process.env.MONGODB_URI) {
  await mongoose.connect(process.env.MONGODB_URI);
}

console.log('=== RUNNING SECURITY & BUYER ACCEPTANCE BUSINESS LOGIC AUDIT TESTS ===\n');

// Helper to make API requests
function apiRequest(path, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL('http://127.0.0.1:5000/api/v1' + path);
    const req = http.request(url, {
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, data });
        }
      });
    });
    req.on('error', reject);
    if (options.body) {
      req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
    }
    req.end();
  });
}

async function loginUser(email, password = 'password123') {
  const res = await apiRequest('/auth/login', {
    method: 'POST',
    body: { email, password },
  });
  return res.data?.token;
}

async function runSecuritySuite() {
  const provider = new ethers.JsonRpcProvider('http://127.0.0.1:8545');
  const signer0 = await provider.getSigner(0); // Farmer wallet
  const signer1 = await provider.getSigner(1); // Distributor wallet
  const signer2 = await provider.getSigner(2); // Retailer wallet

  const contractAsSigner0 = new ethers.Contract(contractData.address, contractData.abi, signer0);
  const contractAsSigner1 = new ethers.Contract(contractData.address, contractData.abi, signer1);
  const contractAsSigner2 = new ethers.Contract(contractData.address, contractData.abi, signer2);

  // Link wallets for demo seed users if not already linked
  const farmerInitToken = await loginUser('farmer@agrichain.com');
  const distInitToken = await loginUser('distributor@agrichain.com');
  const retailInitToken = await loginUser('retailer@agrichain.com');

  if (farmerInitToken) {
    await apiRequest('/auth/link-wallet', {
      method: 'POST',
      headers: { Authorization: `Bearer ${farmerInitToken}` },
      body: { walletAddress: signer0.address },
    });
  }
  if (distInitToken) {
    await apiRequest('/auth/link-wallet', {
      method: 'POST',
      headers: { Authorization: `Bearer ${distInitToken}` },
      body: { walletAddress: signer1.address },
    });
  }
  if (retailInitToken) {
    await apiRequest('/auth/link-wallet', {
      method: 'POST',
      headers: { Authorization: `Bearer ${retailInitToken}` },
      body: { walletAddress: signer2.address },
    });
  }

  // 1. Farmer Creates Batch on Blockchain
  console.log('1. Creating a live test batch on-chain using Farmer wallet (Signer #0):');
  console.log('   - Farmer Signer Address:', signer0.address);
  const txCreate = await contractAsSigner0.createBatch(
    'Organic Security Mangoes',
    'Ratnagiri, Maharashtra',
    500n,
    'kg',
    3, // PREMIUM
    150n, // $1.50 in cents
    'db://test-security-batch-1'
  );
  const receiptCreate = await txCreate.wait(1);
  assert.strictEqual(receiptCreate.status, 1, 'Batch creation transaction must be mined successfully');

  let liveBatchId = null;
  for (const log of receiptCreate.logs) {
    try {
      const parsed = contractAsSigner0.interface.parseLog(log);
      if (parsed && parsed.name === 'BatchCreated') {
        liveBatchId = Number(parsed.args.batchId);
        break;
      }
    } catch (e) {}
  }
  assert.ok(liveBatchId, 'Must extract liveBatchId from BatchCreated event');
  console.log(`   ✔ Batch #${liveBatchId} successfully created on-chain. TxHash: ${receiptCreate.hash}`);

  // Query on-chain data
  let onChainBatch = await BlockchainService.fetchOnChainBatch(liveBatchId);
  assert.ok(onChainBatch, `Batch #${liveBatchId} must exist on the local Hardhat chain`);
  console.log(`   - On-chain Batch #${liveBatchId} Owner: ${onChainBatch.currentOwner}`);
  console.log(`   - On-chain Product Name: ${onChainBatch.productName}`);
  console.log(`   - On-chain Price (cents): ${onChainBatch.currentPrice}`);
  assert.strictEqual(onChainBatch.currentOwner.toLowerCase(), signer0.address.toLowerCase(), 'Initial owner must be farmer');

  // 2. Test Rejection of Unilateral TransferCustody
  console.log('\n2. Testing that Unilateral Custody Push is Strictly Disabled:');
  let unilateralReverted = false;
  try {
    await contractAsSigner0.transferCustody(
      BigInt(liveBatchId),
      signer1.address,
      225n,
      1,
      'Cold Chain Hub',
      'Unilateral transfer attempt'
    );
  } catch (revertErr) {
    unilateralReverted = true;
    assert.ok(
      revertErr.message.includes('Unilateral transfer disabled') || revertErr.message.includes('revert'),
      'Must revert with unilateral transfer disabled'
    );
    console.log(`   ✔ Smart contract strictly blocked unilateral seller transfer: "AgriChain: Unilateral transfer disabled. Buyer must call acceptPurchase"`);
  }
  assert.strictEqual(unilateralReverted, true, 'Unilateral transfer must revert');

  // 3. Test Distributor Buyer Acceptance
  console.log('\n3. Testing Distributor (Signer #1) "Accept & Purchase":');
  console.log('   - Testing price mismatch protection (trying to pay 100 cents instead of 150 cents):');
  let mismatchReverted = false;
  try {
    await contractAsSigner1.acceptPurchase(
      BigInt(liveBatchId),
      100n, // underpaying
      1, // InTransit
      'Navi Mumbai Cold Hub',
      'Underpaying attempt'
    );
  } catch (err) {
    mismatchReverted = true;
    assert.ok(err.message.includes('Price mismatch') || err.message.includes('revert'));
    console.log('   ✔ Price mismatch prevented: Buyer cannot underpay or accept stale price');
  }
  assert.strictEqual(mismatchReverted, true, 'Price mismatch must revert');

  console.log('   - Distributor accepting at exact Farmer price of 150 cents:');
  const txAcceptDist = await contractAsSigner1.acceptPurchase(
    BigInt(liveBatchId),
    150n,
    1, // InTransit
    'Navi Mumbai Central Cold Chain Hub',
    'Goods inspected and accepted into cold storage'
  );
  const receiptAcceptDist = await txAcceptDist.wait(1);
  assert.strictEqual(receiptAcceptDist.status, 1, 'Acceptance transaction must be mined successfully');
  console.log(`   ✔ Distributor successfully accepted purchase on-chain. TxHash: ${receiptAcceptDist.hash}`);

  onChainBatch = await BlockchainService.fetchOnChainBatch(liveBatchId);
  assert.strictEqual(onChainBatch.currentOwner.toLowerCase(), signer1.address.toLowerCase(), 'Owner must now be Distributor');
  assert.strictEqual(onChainBatch.currentPrice, 150, 'Price must be accepted price (150 cents)');
  console.log(`   ✔ On-chain ownership successfully transferred to Distributor (${signer1.address})`);

  // 4. Test Distributor Setting Selling Price (Markup)
  console.log('\n4. Testing Distributor Markup (Setting New Selling Price):');
  const txMarkup = await contractAsSigner1.updateSellingPrice(
    BigInt(liveBatchId),
    225n, // markup to $2.25
    'Added cold chain logistics markup'
  );
  const receiptMarkup = await txMarkup.wait(1);
  assert.strictEqual(receiptMarkup.status, 1, 'Markup transaction must be mined successfully');

  onChainBatch = await BlockchainService.fetchOnChainBatch(liveBatchId);
  assert.strictEqual(onChainBatch.currentOwner.toLowerCase(), signer1.address.toLowerCase(), 'Distributor remains owner');
  assert.strictEqual(onChainBatch.currentPrice, 225, 'Price must be updated to 225 cents');
  console.log(`   ✔ Distributor updated offered price to $2.25 without losing ownership. Owner: ${onChainBatch.currentOwner}`);

  // 5. Test Retailer (Signer #2) Buyer Acceptance
  console.log('\n5. Testing Retailer (Signer #2) "Accept & Purchase":');
  const txAcceptRet = await contractAsSigner2.acceptPurchase(
    BigInt(liveBatchId),
    225n, // matches Distributor's offered price
    3, // WithRetailer
    'FreshBazaar Store #104, Indiranagar',
    'Received at supermarket receiving bay'
  );
  const receiptAcceptRet = await txAcceptRet.wait(1);
  assert.strictEqual(receiptAcceptRet.status, 1);

  onChainBatch = await BlockchainService.fetchOnChainBatch(liveBatchId);
  assert.strictEqual(onChainBatch.currentOwner.toLowerCase(), signer2.address.toLowerCase(), 'Owner must now be Retailer');
  assert.strictEqual(onChainBatch.currentPrice, 225, 'Price must be wholesale price paid ($2.25)');
  console.log(`   ✔ On-chain ownership successfully transferred to Retailer (${signer2.address})`);

  // 6. Test Retailer Setting Retail Shelf Price
  console.log('\n6. Testing Retailer Setting Final Retail Shelf Price:');
  const txRetailPrice = await contractAsSigner2.updateSellingPrice(
    BigInt(liveBatchId),
    320n, // $3.20 shelf price
    'Final consumer shelf price'
  );
  const receiptRetailPrice = await txRetailPrice.wait(1);
  assert.strictEqual(receiptRetailPrice.status, 1);

  onChainBatch = await BlockchainService.fetchOnChainBatch(liveBatchId);
  assert.strictEqual(onChainBatch.currentOwner.toLowerCase(), signer2.address.toLowerCase(), 'Retailer remains owner');
  assert.strictEqual(onChainBatch.currentPrice, 320, 'Price must be 320 cents ($3.20)');
  console.log(`   ✔ Retailer set consumer shelf price to $3.20. Latest confirmed on-chain price: $${(onChainBatch.currentPrice / 100).toFixed(2)}`);

  // 7. Test Backend Rejection of Fake / Unmined Confirmations
  console.log('\n7. Testing Backend Rejection of Fake / Unmined Transaction Hashes:');
  const farmerToken = await loginUser('farmer@agrichain.com');
  assert.ok(farmerToken, 'Farmer login must succeed');

  const draftRes = await apiRequest('/batches', {
    method: 'POST',
    headers: { Authorization: `Bearer ${farmerToken}` },
    body: {
      productName: 'Security Audit Bananas',
      category: 'Fruits',
      originLocation: 'Solapur, Maharashtra',
      farmName: 'Audit Orchards',
      quantity: 200,
      unit: 'kg',
      qualityGrade: 'PREMIUM',
      harvestDate: new Date().toISOString(),
      farmerWallet: signer0.address,
      initialPrice: 1.80,
      images: [],
    },
  });
  assert.strictEqual(draftRes.status, 201);
  const draftBatchId = draftRes.data.batch.id;

  // Fake confirmation test
  const fakeBlockchainBatchId = 999999;
  const fakeTxHash = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
  const confirmFakeRes = await apiRequest(`/batches/${draftBatchId}/confirm`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${farmerToken}` },
    body: {
      blockchainBatchId: fakeBlockchainBatchId,
      creationTxHash: fakeTxHash,
    },
  });
  assert.strictEqual(confirmFakeRes.status, 400, 'Backend must reject fake batch ID');
  console.log(`   ✔ Backend correctly rejected unmined confirmation: "${confirmFakeRes.data.error}"`);

  // Test custody recording with fake txHash
  const fakeTransferRes = await apiRequest(`/batches/${draftBatchId}/transfer`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${farmerToken}` },
    body: {
      toAddress: signer1.address,
      pricePerUnit: 2.50,
      newStatus: 'WITH_DISTRIBUTOR',
      location: 'Hub',
      txHash: fakeTxHash,
    },
  });
  assert.strictEqual(fakeTransferRes.status, 400, 'Backend must reject custody event with unmined txHash');
  console.log(`   ✔ Backend correctly rejected fake custody transfer txHash: "${fakeTransferRes.data.error}"`);

  // 8. Test Backend Real Sync with Confirmed On-Chain Batch
  console.log('\n8. Testing Backend Sync with Confirmed On-Chain Batch (#1):');
  // First confirm draft batch with real on-chain batch #1
  const confirmRealRes = await apiRequest(`/batches/${draftBatchId}/confirm`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${farmerToken}` },
    body: {
      blockchainBatchId: liveBatchId,
      creationTxHash: receiptCreate.hash,
    },
  });
  assert.strictEqual(confirmRealRes.status, 200, 'Backend must accept verified on-chain confirmation');
  console.log('   ✔ Backend confirmed on-chain batch draft and generated QR code');

  // Record custody transfer using real mined tx hash from Step 3
  const realTransferRes = await apiRequest(`/batches/${draftBatchId}/transfer`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${farmerToken}` },
    body: {
      toAddress: signer1.address,
      pricePerUnit: 1.50,
      newStatus: 'WITH_DISTRIBUTOR',
      location: 'Navi Mumbai Central Cold Chain Hub',
      notes: 'Verified cold chain arrival',
      txHash: receiptAcceptDist.hash,
    },
  });
  assert.strictEqual(realTransferRes.status, 200, 'Backend must accept mined on-chain transfer event');
  assert.strictEqual(
    realTransferRes.data.batch.currentOwnerWallet.toLowerCase(),
    signer2.address.toLowerCase(),
    'MongoDB batch currentOwnerWallet must sync with latest on-chain owner'
  );
  console.log(`   ✔ Backend synchronized owner and status from blockchain: ${realTransferRes.data.batch.currentOwnerWallet} (${realTransferRes.data.batch.status})`);

  // 9. Specific Tests for: Valid Current On-Chain Batch, Nonexistent Blockchain Batch, Stale MongoDB Batch
  console.log('\n9. Testing Handling of Valid On-Chain, Nonexistent, and Stale MongoDB Batches:');

  // Test 9a: Valid current on-chain batch
  const validExists = await BlockchainService.checkBatchExists(liveBatchId);
  assert.strictEqual(validExists, true, 'Valid batch must exist on current chain');
  const validBatchData = await BlockchainService.fetchOnChainBatch(liveBatchId);
  assert.ok(validBatchData, 'Valid batch data must be fetched');
  console.log(`   ✔ Valid on-chain batch #${liveBatchId} successfully verified on current contract`);

  // Test 9b: Nonexistent blockchain batch
  const nonExistentId = 888888;
  const nonExistentExists = await BlockchainService.checkBatchExists(nonExistentId);
  assert.strictEqual(nonExistentExists, false, 'Nonexistent batch ID must return false without reverting');
  const nonExistentData = await BlockchainService.fetchOnChainBatch(nonExistentId);
  assert.strictEqual(nonExistentData, null, 'Nonexistent batch data must return null without reverting');
  console.log(`   ✔ Nonexistent batch #${nonExistentId} safely returns exists=false and data=null without EVM revert`);

  // Test 9c: Stale MongoDB batch (pointing to an ID not on the current chain)
  const staleDraft = await apiRequest('/batches', {
    method: 'POST',
    headers: { Authorization: `Bearer ${farmerToken}` },
    body: {
      productName: 'Stale Session Produce',
      category: 'Vegetables',
      originLocation: 'Old Farm Location',
      farmName: 'Legacy Farm',
      quantity: 50,
      unit: 'kg',
      qualityGrade: 'GRADE_A',
      harvestDate: new Date().toISOString(),
      farmerWallet: signer0.address,
      initialPrice: 1.00,
      images: [],
    },
  });
  const staleDbBatchId = staleDraft.data.batch.id;

  const { Batch } = await import('../src/models/Batch.js');
  await Batch.deleteMany({ blockchainBatchId: 777777 });
  await Batch.findByIdAndUpdate(staleDbBatchId, { blockchainBatchId: 777777, isSyncWithChain: true });

  const staleTransferRes = await apiRequest(`/batches/${staleDbBatchId}/transfer`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${farmerToken}` },
    body: {
      toAddress: signer1.address,
      pricePerUnit: 1.20,
      newStatus: 'WITH_DISTRIBUTOR',
      location: 'Hub',
      txHash: receiptAcceptDist.hash,
    },
  });
  assert.strictEqual(staleTransferRes.status, 400, 'Must reject transfer on stale MongoDB batch');
  assert.strictEqual(staleTransferRes.data.isStaleBatch, true, 'Must flag isStaleBatch in response');
  console.log(`   ✔ Stale MongoDB batch rejected with clear error: "${staleTransferRes.data.error}"`);

  console.log('\n========================================================================');
  console.log(' ALL SECURITY & BUYER ACCEPTANCE LOGIC TESTS PASSED WITH 100% SUCCESS');
  console.log('========================================================================\n');

  await mongoose.disconnect();
}

runSecuritySuite().catch((err) => {
  console.error('Security test failed:', err);
  process.exit(1);
});
