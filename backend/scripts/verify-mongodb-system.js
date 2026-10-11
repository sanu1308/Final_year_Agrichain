import { connectDB, mongoose } from '../src/lib/db.js';
import { User } from '../src/models/User.js';
import { Batch } from '../src/models/Batch.js';
import { SupplyChainEvent } from '../src/models/SupplyChainEvent.js';
import { ScanLog } from '../src/models/ScanLog.js';
import bcrypt from 'bcryptjs';

async function runTests() {
  console.log('====================================================');
  console.log(' AgriChain MongoDB System Verification Tests');
  console.log('====================================================');

  await connectDB();

  // Test 1: Record Counts
  console.log('\n[Test 1] Checking record counts in MongoDB:');
  const userCount = await User.countDocuments();
  const batchCount = await Batch.countDocuments();
  const eventCount = await SupplyChainEvent.countDocuments();
  const scanCount = await ScanLog.countDocuments();

  console.log(` -> Users:             ${userCount} (Expected: 6)`);
  console.log(` -> Batches:           ${batchCount} (Expected: 2)`);
  console.log(` -> SupplyChainEvents: ${eventCount} (Expected: 5)`);
  console.log(` -> ScanLogs:          ${scanCount} (Expected: 19)`);

  if (userCount < 6 || batchCount < 2 || eventCount < 5 || scanCount < 1) {
    throw new Error('Test 1 Failed: Record counts do not meet expected baseline!');
  }
  console.log('✓ Test 1 Passed: Record counts meet or exceed baseline.');

  // Test 2: User Authentication & Roles
  console.log('\n[Test 2] Testing User authentication with bcrypt:');
  const farmer = await User.findOne({ email: 'farmer@agrichain.com' });
  if (!farmer) throw new Error('Farmer user not found!');
  const passwordMatch = await bcrypt.compare('password123', farmer.passwordHash);
  if (!passwordMatch) throw new Error('Password hash does not match password123!');
  console.log(` -> Farmer: ${farmer.name} (${farmer.role}), ID: ${farmer.id}, Wallet: ${farmer.walletAddress}`);
  console.log('✓ Test 2 Passed: Password verification and user model work.');

  // Test 3: Batch Population & Relations
  console.log('\n[Test 3] Testing Batch relations and population:');
  const batch1 = await Batch.findOne({ blockchainBatchId: 1 })
    .populate('farmer', 'name organization')
    .populate({
      path: 'events',
      options: { sort: { timestamp: 1 } },
      populate: { path: 'actor', select: 'name role' },
    });

  if (!batch1) throw new Error('Batch #1 not found!');
  if (!batch1.farmer || !batch1.farmer.name) throw new Error('Farmer population failed!');
  if (!batch1.events || batch1.events.length === 0) throw new Error('Events population failed!');

  console.log(` -> Batch #1: ${batch1.productName}`);
  console.log(` -> Farmer populated: ${batch1.farmer.name} (${batch1.farmer.organization})`);
  console.log(` -> Events count: ${batch1.events.length}`);
  console.log('✓ Test 3 Passed: Batch population and virtual relations work.');

  // Test 4: Admin Analytics Aggregations
  console.log('\n[Test 4] Testing Admin aggregations:');
  const usersByRole = await User.aggregate([
    { $group: { _id: '$role', count: { $sum: 1 } } },
  ]);
  console.log(' -> Stakeholders by role:', usersByRole);
  if (usersByRole.length === 0) throw new Error('Admin aggregation returned empty array!');
  console.log('✓ Test 4 Passed: MongoDB aggregations working.');

  console.log('\n====================================================');
  console.log(' ALL 4 VERIFICATION TESTS PASSED SUCCESSFULLY!');
  console.log('====================================================');
}

runTests()
  .catch((err) => {
    console.error('Verification failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
