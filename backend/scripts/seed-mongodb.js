import bcrypt from 'bcryptjs';
import QRCode from 'qrcode';
import { connectDB } from '../src/lib/db.js';
import { QRCodeService } from '../src/services/qr.service.js';
import { User } from '../src/models/User.js';
import { Batch } from '../src/models/Batch.js';
import { SupplyChainEvent } from '../src/models/SupplyChainEvent.js';
import { ScanLog } from '../src/models/ScanLog.js';

async function main() {
  await connectDB();
  console.log('Connected to MongoDB. Clearing existing collections...');

  await ScanLog.deleteMany({});
  await SupplyChainEvent.deleteMany({});
  await Batch.deleteMany({});
  await User.deleteMany({});

  console.log('Seeding demo users across all 5 roles...');
  const defaultPasswordHash = await bcrypt.hash('password123', 10);

  const farmer = await User.create({
    email: 'farmer@agrichain.com',
    passwordHash: defaultPasswordHash,
    name: 'Ramesh Patel (Organic Farmer)',
    role: 'FARMER',
    walletAddress: '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266', // Hardhat Account #0
    organization: 'Sahyadri Organic Orchards',
    physicalAddress: 'Ratnagiri, Maharashtra, India',
    phoneNumber: '+91 98220 12345',
    isVerified: true,
  });

  const distributor = await User.create({
    email: 'distributor@agrichain.com',
    passwordHash: defaultPasswordHash,
    name: 'Apex Cold-Chain Logistics',
    role: 'DISTRIBUTOR',
    walletAddress: '0x70997970c51812dc3a010c7d01b50e0d17dc79c8', // Hardhat Account #1
    organization: 'Apex Supply Chain Solutions Ltd',
    physicalAddress: 'Navi Mumbai Central Logistics Park',
    phoneNumber: '+91 98450 67890',
    isVerified: true,
  });

  const retailer = await User.create({
    email: 'retailer@agrichain.com',
    passwordHash: defaultPasswordHash,
    name: 'FreshBazaar Premium Stores',
    role: 'RETAILER',
    walletAddress: '0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc', // Hardhat Account #2
    organization: 'FreshBazaar Hypermarkets Ltd',
    physicalAddress: 'Indiranagar 100ft Rd, Bengaluru',
    phoneNumber: '+91 99000 54321',
    isVerified: true,
  });

  const consumer = await User.create({
    email: 'consumer@agrichain.com',
    passwordHash: defaultPasswordHash,
    name: 'Ananya Sharma',
    role: 'CONSUMER',
    organization: 'Consumer / End User',
    physicalAddress: 'Koramangala, Bengaluru',
    phoneNumber: '+91 98765 43210',
    isVerified: true,
  });

  const admin = await User.create({
    email: 'admin@agrichain.com',
    passwordHash: defaultPasswordHash,
    name: 'AgriChain National Registry Admin',
    role: 'ADMIN',
    organization: 'AgriChain Governance Authority',
    physicalAddress: 'Tech Park, New Delhi',
    isVerified: true,
  });

  // Additional registered farmer (from original database)
  await User.create({
    email: 'suresh@greenfarms.com',
    passwordHash: defaultPasswordHash,
    name: 'Suresh Kumar',
    role: 'FARMER',
    walletAddress: '0x90f79bf6eb2c4f870365e785982e1f101e93b906',
    organization: 'Green Valley Organic Farms',
    physicalAddress: 'Nashik, Maharashtra',
    phoneNumber: '+91 98111 22334',
    isVerified: true,
  });

  console.log('Seeding demo produce batches...');

  const qrCodeUrl1 = await QRCodeService.generateBatchQRCode(1);

  const batch1 = await Batch.create({
    blockchainBatchId: 1,
    productName: 'Organic Alphonso Mangoes (GI Tagged)',
    category: 'Fruits',
    description: 'Naturally ripened, chemical-free GI-tagged Ratnagiri Alphonso mangoes from single-origin orchard.',
    originLocation: 'Ratnagiri, Maharashtra, India',
    farmName: 'Sahyadri Organic Orchards',
    farmLatitude: 16.9902,
    farmLongitude: 73.312,
    quantity: 1200,
    unit: 'kg',
    qualityGrade: 'PREMIUM',
    harvestDate: new Date('2026-05-10T08:00:00Z'),
    expiryDate: new Date('2026-06-05T08:00:00Z'),
    images: [
      'https://images.unsplash.com/photo-1553279768-865429fa0078?w=800&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1601493700631-2b16ec4b4716?w=800&auto=format&fit=crop&q=80',
    ],
    qrCodeUrl: qrCodeUrl1,
    status: 'WITH_RETAILER',
    farmerId: farmer._id,
    farmerWallet: farmer.walletAddress.toLowerCase(),
    currentOwnerWallet: retailer.walletAddress.toLowerCase(),
    creationTxHash: '0x8f273b76541f5cd9a77ef7c43df7be791244d82f71881efb9bb47e62ab4d99c1',
    blockNumber: 1,
    isSyncWithChain: true,
  });

  const qrCodeUrl2 = await QRCodeService.generateBatchQRCode(2);

  const batch2 = await Batch.create({
    blockchainBatchId: 2,
    productName: 'Heirloom Basmati Rice (Organic)',
    category: 'Grains',
    description: 'Traditional long-grain aromatic Dehradun Basmati rice harvested using sustainable flood-plain farming.',
    originLocation: 'Dehradun, Uttarakhand, India',
    farmName: 'Doon Valley Heritage Farms',
    farmLatitude: 30.3165,
    farmLongitude: 78.0322,
    quantity: 3500,
    unit: 'kg',
    qualityGrade: 'EXPORT_QUALITY',
    harvestDate: new Date('2026-04-15T08:00:00Z'),
    expiryDate: new Date('2027-04-15T08:00:00Z'),
    images: [
      'https://images.unsplash.com/photo-1586201375761-83865001e31c?w=800&auto=format&fit=crop&q=80',
    ],
    qrCodeUrl: qrCodeUrl2,
    status: 'WITH_DISTRIBUTOR',
    farmerId: farmer._id,
    farmerWallet: farmer.walletAddress.toLowerCase(),
    currentOwnerWallet: distributor.walletAddress.toLowerCase(),
    creationTxHash: '0x12345b76541f5cd9a77ef7c43df7be791244d82f71881efb9bb47e62ab4d55c2',
    blockNumber: 2,
    isSyncWithChain: true,
  });

  // Hops for Batch #1: Farmer -> Distributor -> Retailer
  await SupplyChainEvent.create({
    batchId: batch1._id,
    eventType: 'CREATION',
    fromAddress: '0x0000000000000000000000000000000000000000',
    toAddress: farmer.walletAddress.toLowerCase(),
    pricePerUnit: 1.5,
    currency: 'INR',
    location: 'Ratnagiri Orchards',
    notes: 'Harvested under APEDA organic protocols. Brix index 19.5.',
    temperatureC: 24.5,
    humidityPercent: 65,
    txHash: '0x8f273b76541f5cd9a77ef7c43df7be791244d82f71881efb9bb47e62ab4d99c1',
    actorId: farmer._id,
    timestamp: new Date('2026-05-10T09:30:00Z'),
  });

  await SupplyChainEvent.create({
    batchId: batch1._id,
    eventType: 'TRANSFER_OF_CUSTODY',
    fromAddress: farmer.walletAddress.toLowerCase(),
    toAddress: distributor.walletAddress.toLowerCase(),
    pricePerUnit: 2.25,
    currency: 'INR',
    location: 'Navi Mumbai Cold Storage Terminal #3',
    notes: 'Cold chain transit maintained at 4-6°C. Ethylene absorption filters applied.',
    temperatureC: 5.2,
    humidityPercent: 85,
    txHash: '0x3a923b76541f5cd9a77ef7c43df7be791244d82f71881efb9bb47e62ab4d11a2',
    actorId: distributor._id,
    timestamp: new Date('2026-05-12T14:15:00Z'),
  });

  await SupplyChainEvent.create({
    batchId: batch1._id,
    eventType: 'TRANSFER_OF_CUSTODY',
    fromAddress: distributor.walletAddress.toLowerCase(),
    toAddress: retailer.walletAddress.toLowerCase(),
    pricePerUnit: 3.8,
    currency: 'INR',
    location: 'FreshBazaar Store #104, Indiranagar',
    notes: 'Stocked on display with live QR traceability tag for consumer verification.',
    temperatureC: 18.0,
    humidityPercent: 55,
    txHash: '0x99273b76541f5cd9a77ef7c43df7be791244d82f71881efb9bb47e62ab4d88e4',
    actorId: retailer._id,
    timestamp: new Date('2026-05-14T10:00:00Z'),
  });

  // Hops for Batch #2
  await SupplyChainEvent.create({
    batchId: batch2._id,
    eventType: 'CREATION',
    fromAddress: '0x0000000000000000000000000000000000000000',
    toAddress: farmer.walletAddress.toLowerCase(),
    pricePerUnit: 0.95,
    currency: 'INR',
    location: 'Doon Valley Farms',
    notes: 'Harvested organic baseline rice.',
    temperatureC: 22.0,
    humidityPercent: 50,
    txHash: '0x12345b76541f5cd9a77ef7c43df7be791244d82f71881efb9bb47e62ab4d55c2',
    actorId: farmer._id,
    timestamp: new Date('2026-04-15T09:00:00Z'),
  });

  await SupplyChainEvent.create({
    batchId: batch2._id,
    eventType: 'TRANSFER_OF_CUSTODY',
    fromAddress: farmer.walletAddress.toLowerCase(),
    toAddress: distributor.walletAddress.toLowerCase(),
    pricePerUnit: 1.45,
    currency: 'INR',
    location: 'Chandigarh Grain Hub #2',
    notes: 'Stored in climate controlled silo.',
    temperatureC: 19.5,
    humidityPercent: 45,
    txHash: '0x67890b76541f5cd9a77ef7c43df7be791244d82f71881efb9bb47e62ab4d77d3',
    actorId: distributor._id,
    timestamp: new Date('2026-04-18T11:00:00Z'),
  });

  // Scan logs
  await ScanLog.create({
    batchId: batch1._id,
    ipAddress: '127.0.0.1',
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
    city: 'Bengaluru',
    country: 'India',
    scannedAt: new Date(),
  });

  console.log('MongoDB Seed completed successfully!');
  console.log('Demo Accounts:');
  console.log(' - Farmer:      farmer@agrichain.com      | password123');
  console.log(' - Distributor: distributor@agrichain.com | password123');
  console.log(' - Retailer:    retailer@agrichain.com    | password123');
  console.log(' - Consumer:    consumer@agrichain.com    | password123');
  console.log(' - Admin:       admin@agrichain.com       | password123');
  process.exit(0);
}

main().catch((e) => {
  console.error('MongoDB Seeding error:', e);
  process.exit(1);
});
