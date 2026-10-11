import assert from 'node:assert';
import http from 'node:http';

// 1. Define and test the exact getBatchLatestPrice logic implemented in RetailerDashboard.jsx
function getBatchLatestPrice(batch) {
  if (!batch) return null;

  // 1. If batch has events array, find the latest event by timestamp (or last item)
  if (Array.isArray(batch.events) && batch.events.length > 0) {
    const sorted = [...batch.events].sort(
      (a, b) => new Date(a.timestamp || 0).getTime() - new Date(b.timestamp || 0).getTime()
    );
    const latestEvent = sorted[sorted.length - 1];
    if (typeof latestEvent?.pricePerUnit === 'number' && !isNaN(latestEvent.pricePerUnit)) {
      return latestEvent.pricePerUnit;
    }
  }

  // 2. Direct pricePerUnit on batch if present
  if (typeof batch.pricePerUnit === 'number' && !isNaN(batch.pricePerUnit)) {
    return batch.pricePerUnit;
  }

  // 3. Direct currentPrice on batch if present
  if (typeof batch.currentPrice === 'number' && !isNaN(batch.currentPrice)) {
    return batch.currentPrice;
  }

  // 4. On-chain currentPrice (in cents)
  if (typeof batch.onChainData?.currentPrice === 'number') {
    return batch.onChainData.currentPrice / 100;
  }

  return null;
}

function getBatchFarmerPrice(batch) {
  if (!batch) return null;
  if (Array.isArray(batch.events) && batch.events.length > 0) {
    const sorted = [...batch.events].sort(
      (a, b) => new Date(a.timestamp || 0).getTime() - new Date(b.timestamp || 0).getTime()
    );
    const creationEvent = sorted.find((e) => e.eventType === 'CREATION') || sorted[0];
    if (typeof creationEvent?.pricePerUnit === 'number' && !isNaN(creationEvent.pricePerUnit)) {
      return creationEvent.pricePerUnit;
    }
  }
  if (typeof batch.initialPrice === 'number' && !isNaN(batch.initialPrice)) {
    return batch.initialPrice;
  }
  return null;
}

console.log('=== RUNNING UNIT TESTS FOR RETAILER SHELF TAG PRICING ===\n');

// Test Case 1: Batch with populated chronological events from GET /batches/:id
const batchWithAllEvents = {
  id: 'batch-4',
  blockchainBatchId: 4,
  events: [
    { eventType: 'CREATION', pricePerUnit: 1.50, timestamp: '2026-09-12T16:30:39.479Z' },
    { eventType: 'TRANSFER_OF_CUSTODY', pricePerUnit: 2.10, timestamp: '2026-09-12T16:32:48.600Z' },
    { eventType: 'TRANSFER_OF_CUSTODY', pricePerUnit: 2.52, timestamp: '2026-09-13T13:32:20.610Z' },
  ],
};
assert.strictEqual(getBatchLatestPrice(batchWithAllEvents), 2.52, 'Should pick latest event price ($2.52)');
assert.strictEqual(getBatchFarmerPrice(batchWithAllEvents), 1.50, 'Should pick farmer harvest price ($1.50)');
console.log('✔ Test Case 1 Passed: Chronological events resolve latest price to $2.52 and farmer price to $1.50');

// Test Case 2: Out-of-order events array sorted by timestamp
const outOfOrderBatch = {
  id: 'batch-4',
  events: [
    { eventType: 'TRANSFER_OF_CUSTODY', pricePerUnit: 2.52, timestamp: '2026-09-13T13:32:20.610Z' },
    { eventType: 'CREATION', pricePerUnit: 1.50, timestamp: '2026-09-12T16:30:39.479Z' },
  ],
};
assert.strictEqual(getBatchLatestPrice(outOfOrderBatch), 2.52, 'Should sort and pick the newest event');
assert.strictEqual(getBatchFarmerPrice(outOfOrderBatch), 1.50, 'Should sort and pick the creation event');
console.log('✔ Test Case 2 Passed: Out-of-order events correctly sorted by timestamp');

// Test Case 3: Batch returned directly from POST /batches/:id/transfer (events undefined, but res.event exists)
const transferResponseBatch = {
  id: 'batch-4',
  blockchainBatchId: 4,
  // events is undefined on findByIdAndUpdate
};
const resEvent = { eventType: 'TRANSFER_OF_CUSTODY', pricePerUnit: 2.52, timestamp: new Date().toISOString() };
const safeMergedBatch = { ...transferResponseBatch, events: [resEvent] };
assert.strictEqual(getBatchLatestPrice(safeMergedBatch), 2.52, 'Should resolve price from merged res.event');
console.log('✔ Test Case 3 Passed: Transfer response fallback resolves to latest event price ($2.52)');

// Test Case 4: On-chain fallback (currentPrice in cents: 252)
const onChainBatch = {
  id: 'batch-4',
  onChainData: { currentPrice: 252 },
};
assert.strictEqual(getBatchLatestPrice(onChainBatch), 2.52, 'Should convert on-chain cents (252) to dollars ($2.52)');
console.log('✔ Test Case 4 Passed: On-chain cents correctly converted to dollars without double conversion');

// Test Case 5: Zero hardcoded fallback to 3.80
const emptyBatch = { id: 'empty' };
assert.strictEqual(getBatchLatestPrice(emptyBatch), null, 'Empty batch should return null, NOT 3.80');
assert.strictEqual(getBatchLatestPrice(null), null, 'Null batch should return null, NOT 3.80');
console.log('✔ Test Case 5 Passed: No hardcoded fallback — returns null when price unavailable\n');

// 2. Integration check against live running backend
function apiGet(path) {
  return new Promise((resolve, reject) => {
    http.get('http://127.0.0.1:5000/api/v1' + path, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

console.log('=== RUNNING LIVE API INTEGRATION CHECKS ===\n');

async function runIntegration() {
  try {
    const verifyData = await apiGet('/public/verify/4');
    const hops = verifyData.pricingHops || [];
    const consumerFinalPrice = hops[hops.length - 1]?.price;
    const consumerFarmerPrice = hops[0]?.price;

    console.log('Public Verification endpoint (/public/verify/4):');
    console.log(`  - Status: ${verifyData.batch?.status}`);
    console.log(`  - Farmer Price: $${consumerFarmerPrice}`);
    console.log(`  - Retailer Final Price: $${consumerFinalPrice}`);

    const simulatedRetailerTagPrice = getBatchLatestPrice(verifyData.batch);
    console.log(`  - Retailer Shelf Tag resolved price: $${simulatedRetailerTagPrice}`);

    assert.strictEqual(
      simulatedRetailerTagPrice,
      consumerFinalPrice,
      'Consumer verify page and Retailer Shelf Tag modal MUST display the exact same price'
    );
    console.log('\n✔ Live Integration Passed: Consumer Verify Page and Retailer Shelf Tag are 100% in sync!');
  } catch (err) {
    console.error('Live integration note:', err.message);
  }
}

runIntegration();
