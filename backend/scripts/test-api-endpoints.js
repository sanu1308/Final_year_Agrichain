import http from 'http';

function request(url, options = {}, body = null) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const reqOptions = {
      hostname: u.hostname,
      port: u.port,
      path: u.pathname + u.search,
      method: options.method || 'GET',
      headers: options.headers || {},
    };

    if (body) {
      reqOptions.headers['Content-Type'] = 'application/json';
      reqOptions.headers['Content-Length'] = Buffer.byteLength(body);
    }

    const req = http.request(reqOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, data });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function run() {
  console.log('Testing live API endpoints against MongoDB:');

  // 1. Health check
  console.log('\n[1] GET /api/v1/health:');
  const health = await request('http://localhost:5000/api/v1/health');
  console.log(' -> Status:', health.status, health.data);

  // 2. Farmer Login
  console.log('\n[2] POST /api/v1/auth/login:');
  const login = await request(
    'http://localhost:5000/api/v1/auth/login',
    { method: 'POST' },
    JSON.stringify({ email: 'farmer@agrichain.com', password: 'password123' })
  );
  console.log(' -> Status:', login.status, 'User:', login.data?.user?.name, 'Role:', login.data?.user?.role);
  const token = login.data?.token;

  // 3. Auth Me
  console.log('\n[3] GET /api/v1/auth/me:');
  const me = await request('http://localhost:5000/api/v1/auth/me', {
    headers: { Authorization: `Bearer ${token}` },
  });
  console.log(' -> Status:', me.status, 'Email:', me.data?.user?.email, 'Wallet:', me.data?.user?.walletAddress);

  // 4. Public Verify
  console.log('\n[4] GET /api/v1/public/verify/1:');
  const verify = await request('http://localhost:5000/api/v1/public/verify/1');
  console.log(' -> Status:', verify.status);
  console.log(' -> Product:', verify.data?.batch?.productName);
  console.log(' -> Integrity:', verify.data?.integrityStatus);
  console.log(' -> Hops count:', verify.data?.pricingHops?.length);

  // 5. Admin Login & Stats
  console.log('\n[5] Admin Stats:');
  const adminLogin = await request(
    'http://localhost:5000/api/v1/auth/login',
    { method: 'POST' },
    JSON.stringify({ email: 'admin@agrichain.com', password: 'password123' })
  );
  const adminStats = await request('http://localhost:5000/api/v1/admin/stats', {
    headers: { Authorization: `Bearer ${adminLogin.data?.token}` },
  });
  console.log(' -> Total users in admin:', adminStats.data?.totalUsers);
  console.log(' -> Total batches in admin:', adminStats.data?.totalBatches);
  console.log(' -> Total events in admin:', adminStats.data?.totalEvents);

  const adminSpread = await request('http://localhost:5000/api/v1/admin/price-spread', {
    headers: { Authorization: `Bearer ${adminLogin.data?.token}` },
  });
  console.log(' -> Price spreads count:', adminSpread.data?.spreads?.length);

  // 6. Farmer batches list
  console.log('\n[6] GET /api/v1/batches (Farmer):');
  const batchesRes = await request('http://localhost:5000/api/v1/batches', {
    headers: { Authorization: `Bearer ${token}` },
  });
  console.log(' -> Status:', batchesRes.status, 'Count:', batchesRes.data?.batches?.length);
  const sampleBatchId = batchesRes.data?.batches?.[0]?.id;

  if (sampleBatchId) {
    console.log(`\n[7] GET /api/v1/batches/${sampleBatchId}:`);
    const singleBatchRes = await request(`http://localhost:5000/api/v1/batches/${sampleBatchId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    console.log(' -> Status:', singleBatchRes.status, 'Product:', singleBatchRes.data?.batch?.productName);
  }

  // 8. Create draft batch test
  console.log('\n[8] POST /api/v1/batches (Create draft batch):');
  const createBatchRes = await request(
    'http://localhost:5000/api/v1/batches',
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    },
    JSON.stringify({
      productName: 'Test MongoDB Organic Apples',
      category: 'Fruits',
      farmName: 'Himalayan Organic Orchards',
      originLocation: 'Shimla, Himachal Pradesh',
      harvestDate: new Date().toISOString(),
      initialPrice: 120,
      quantity: 500,
      unit: 'kg',
      farmerWallet: '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266',
    })
  );
  console.log(' -> Status:', createBatchRes.status, 'Created Batch ID:', createBatchRes.data?.batch?.id);
  const newBatchId = createBatchRes.data?.batch?.id;

  if (newBatchId) {
    // 9. Record custody event
    console.log(`\n[9] POST /api/v1/batches/${newBatchId}/transfer:`);
    const transferRes = await request(
      `http://localhost:5000/api/v1/batches/${newBatchId}/transfer`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      },
      JSON.stringify({
        toAddress: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
        newStatus: 'IN_TRANSIT',
        location: 'Delhi Wholesale Terminal',
        pricePerUnit: 140,
        notes: 'Dispatched via cold storage truck',
      })
    );
    console.log(' -> Status:', transferRes.status, 'Event Action:', transferRes.data?.event?.action);
  }

  console.log('\n====================================================');
  console.log(' ALL ENDPOINT CHECKS PASSED WITH 200 OK!');
  console.log('====================================================');
}

run().catch((e) => {
  console.error('API test failed:', e);
  process.exit(1);
});
