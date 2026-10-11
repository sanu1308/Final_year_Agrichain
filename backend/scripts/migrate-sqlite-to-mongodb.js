import { prisma } from '../src/lib/prisma.js';
import { connectDB, mongoose } from '../src/lib/db.js';
import { User } from '../src/models/User.js';
import { Batch } from '../src/models/Batch.js';
import { SupplyChainEvent } from '../src/models/SupplyChainEvent.js';
import { ScanLog } from '../src/models/ScanLog.js';

async function migrate() {
  console.log('====================================================');
  console.log(' Starting AgriChain SQLite -> MongoDB Data Migration');
  console.log('====================================================');

  await connectDB();

  // 1. Read existing records from SQLite via Prisma
  console.log('\n[1/4] Reading data from SQLite (dev.db)...');
  const sqliteUsers = await prisma.user.findMany();
  const sqliteBatches = await prisma.batch.findMany();
  const sqliteEvents = await prisma.supplyChainEvent.findMany();
  const sqliteScans = await prisma.scanLog.findMany();

  console.log(` -> Found ${sqliteUsers.length} Users in SQLite`);
  console.log(` -> Found ${sqliteBatches.length} Batches in SQLite`);
  console.log(` -> Found ${sqliteEvents.length} SupplyChainEvents in SQLite`);
  console.log(` -> Found ${sqliteScans.length} ScanLogs in SQLite`);

  // 2. Clear MongoDB collections for clean idempotent migration
  console.log('\n[2/4] Preparing MongoDB collections...');
  await User.deleteMany({});
  await Batch.deleteMany({});
  await SupplyChainEvent.deleteMany({});
  await ScanLog.deleteMany({});
  console.log(' -> Cleaned existing documents in MongoDB target collections.');

  // 3. Migrate Users
  console.log('\n[3/4] Migrating records into MongoDB...');
  for (const u of sqliteUsers) {
    await User.create({
      _id: u.id,
      email: u.email,
      passwordHash: u.passwordHash,
      name: u.name,
      role: u.role,
      walletAddress: u.walletAddress,
      organization: u.organization,
      physicalAddress: u.physicalAddress,
      phoneNumber: u.phoneNumber,
      isVerified: u.isVerified,
      createdAt: u.createdAt,
      updatedAt: u.updatedAt,
    });
  }
  console.log(` -> Migrated ${sqliteUsers.length} Users`);

  // 4. Migrate Batches
  for (const b of sqliteBatches) {
    await Batch.create({
      _id: b.id,
      blockchainBatchId: b.blockchainBatchId,
      productName: b.productName,
      category: b.category,
      description: b.description,
      originLocation: b.originLocation,
      farmName: b.farmName,
      farmLatitude: b.farmLatitude,
      farmLongitude: b.farmLongitude,
      quantity: b.quantity,
      unit: b.unit,
      qualityGrade: b.qualityGrade,
      harvestDate: b.harvestDate,
      expiryDate: b.expiryDate,
      images: b.images,
      qrCodeUrl: b.qrCodeUrl,
      status: b.status,
      farmerId: b.farmerId,
      farmerWallet: b.farmerWallet,
      currentOwnerWallet: b.currentOwnerWallet,
      creationTxHash: b.creationTxHash,
      blockNumber: b.blockNumber,
      isSyncWithChain: b.isSyncWithChain,
      createdAt: b.createdAt,
      updatedAt: b.updatedAt,
    });
  }
  console.log(` -> Migrated ${sqliteBatches.length} Batches`);

  // 5. Migrate SupplyChainEvents
  for (const e of sqliteEvents) {
    await SupplyChainEvent.create({
      _id: e.id,
      batchId: e.batchId,
      eventType: e.eventType,
      fromAddress: e.fromAddress,
      toAddress: e.toAddress,
      pricePerUnit: e.pricePerUnit,
      currency: e.currency,
      location: e.location,
      notes: e.notes,
      temperatureC: e.temperatureC,
      humidityPercent: e.humidityPercent,
      txHash: e.txHash,
      actorId: e.actorId,
      timestamp: e.timestamp,
    });
  }
  console.log(` -> Migrated ${sqliteEvents.length} SupplyChainEvents`);

  // 6. Migrate ScanLogs
  for (const s of sqliteScans) {
    await ScanLog.create({
      _id: s.id,
      batchId: s.batchId,
      scannedAt: s.scannedAt,
      ipAddress: s.ipAddress,
      userAgent: s.userAgent,
      city: s.city,
      country: s.country,
    });
  }
  console.log(` -> Migrated ${sqliteScans.length} ScanLogs`);

  // 7. Verification of record counts
  console.log('\n[4/4] Verifying record counts...');
  const mongoUsers = await User.countDocuments();
  const mongoBatches = await Batch.countDocuments();
  const mongoEvents = await SupplyChainEvent.countDocuments();
  const mongoScans = await ScanLog.countDocuments();

  console.log('----------------------------------------------------');
  console.log(' RECORD COUNT VERIFICATION:');
  console.log(` Users:             SQLite=${sqliteUsers.length} | MongoDB=${mongoUsers}`);
  console.log(` Batches:           SQLite=${sqliteBatches.length} | MongoDB=${mongoBatches}`);
  console.log(` SupplyChainEvents: SQLite=${sqliteEvents.length} | MongoDB=${mongoEvents}`);
  console.log(` ScanLogs:          SQLite=${sqliteScans.length} | MongoDB=${mongoScans}`);
  console.log('----------------------------------------------------');

  if (
    mongoUsers !== sqliteUsers.length ||
    mongoBatches !== sqliteBatches.length ||
    mongoEvents !== sqliteEvents.length ||
    mongoScans !== sqliteScans.length
  ) {
    throw new Error('CRITICAL: Count mismatch detected between SQLite and MongoDB! Migration aborted.');
  }

  console.log('✓ Migration verified successfully: All 100% of records transferred.');
  console.log('✓ Original SQLite database (dev.db) is preserved untouched as backup.');
}

migrate()
  .catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await mongoose.disconnect();
  });
