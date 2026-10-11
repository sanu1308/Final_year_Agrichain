import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import QRCode from 'qrcode';

const prisma = new PrismaClient();

async function main() {
  console.log('Clearing existing records...');
  await prisma.scanLog.deleteMany();
  await prisma.supplyChainEvent.deleteMany();
  await prisma.batch.deleteMany();
  await prisma.user.deleteMany();

  console.log('Seeding demo users across all 5 roles...');
  const defaultPasswordHash = await bcrypt.hash('password123', 10);

  const farmer = await prisma.user.create({
    data: {
      email: 'farmer@agrichain.com',
      passwordHash: defaultPasswordHash,
      name: 'Ramesh Patel (Organic Farmer)',
      role: 'FARMER',
      walletAddress: '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266', // Hardhat Account #0
      organization: 'Sahyadri Organic Orchards',
      physicalAddress: 'Ratnagiri, Maharashtra, India',
      phoneNumber: '+91 98220 12345',
      isVerified: true,
    },
  });

  const distributor = await prisma.user.create({
    data: {
      email: 'distributor@agrichain.com',
      passwordHash: defaultPasswordHash,
      name: 'Apex Cold-Chain Logistics',
      role: 'DISTRIBUTOR',
      walletAddress: '0x70997970c51812dc3a010c7d01b50e0d17dc79c8', // Hardhat Account #1
      organization: 'Apex Supply Chain Solutions Ltd',
      physicalAddress: 'Navi Mumbai Central Logistics Park',
      phoneNumber: '+91 98450 67890',
      isVerified: true,
    },
  });

  const retailer = await prisma.user.create({
    data: {
      email: 'retailer@agrichain.com',
      passwordHash: defaultPasswordHash,
      name: 'FreshBazaar Premium Stores',
      role: 'RETAILER',
      walletAddress: '0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc', // Hardhat Account #2
      organization: 'FreshBazaar Hypermarkets Ltd',
      physicalAddress: 'Indiranagar 100ft Rd, Bengaluru',
      phoneNumber: '+91 99000 54321',
      isVerified: true,
    },
  });

  const consumer = await prisma.user.create({
    data: {
      email: 'consumer@agrichain.com',
      passwordHash: defaultPasswordHash,
      name: 'Ananya Sharma',
      role: 'CONSUMER',
      organization: 'Consumer / End User',
      physicalAddress: 'Koramangala, Bengaluru',
      phoneNumber: '+91 98765 43210',
      isVerified: true,
    },
  });

  const admin = await prisma.user.create({
    data: {
      email: 'admin@agrichain.com',
      passwordHash: defaultPasswordHash,
      name: 'AgriChain National Registry Admin',
      role: 'ADMIN',
      organization: 'AgriChain Governance Authority',
      physicalAddress: 'Tech Park, New Delhi',
      isVerified: true,
    },
  });

  console.log('Seeding demo produce batches...');

  // Generate QR for demo batch #1
  const qrCodeUrl1 = await QRCode.toDataURL('http://localhost:5173/verify/1', {
    errorCorrectionLevel: 'H',
    margin: 2,
    width: 350,
    color: { dark: '#14532d', light: '#ffffff' },
  });

  const batch1 = await prisma.batch.create({
    data: {
      blockchainBatchId: 1,
      productName: 'Organic Alphonso Mangoes (GI Tagged)',
      category: 'Fruits',
      description: 'Naturally ripened, chemical-free GI-tagged Ratnagiri Alphonso mangoes from single-origin orchard.',
      originLocation: 'Ratnagiri, Maharashtra, India',
      farmName: 'Sahyadri Organic Orchards',
      farmLatitude: 16.9902,
      farmLongitude: 73.3120,
      quantity: 1200,
      unit: 'kg',
      qualityGrade: 'PREMIUM',
      harvestDate: new Date('2026-05-10T08:00:00Z'),
      expiryDate: new Date('2026-06-05T08:00:00Z'),
      images: JSON.stringify([
        'https://images.unsplash.com/photo-1553279768-865429fa0078?w=800&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1601493700631-2b16ec4b4716?w=800&auto=format&fit=crop&q=80',
      ]),
      qrCodeUrl: qrCodeUrl1,
      status: 'WITH_RETAILER',
      farmerId: farmer.id,
      farmerWallet: farmer.walletAddress.toLowerCase(),
      currentOwnerWallet: retailer.walletAddress.toLowerCase(),
      creationTxHash: '0x8f273b76541f5cd9a77ef7c43df7be791244d82f71881efb9bb47e62ab4d99c1',
      blockNumber: 1,
      isSyncWithChain: true,
    },
  });

  // Hops for Batch #1: Farmer -> Distributor -> Retailer
  await prisma.supplyChainEvent.create({
    data: {
      batchId: batch1.id,
      eventType: 'CREATION',
      fromAddress: '0x0000000000000000000000000000000000000000',
      toAddress: farmer.walletAddress.toLowerCase(),
      pricePerUnit: 1.50, // Farmer gets $1.50/kg
      currency: 'USD',
      location: 'Ratnagiri Orchards',
      notes: 'Harvested under APEDA organic protocols. Brix index 19.5.',
      temperatureC: 24.5,
      humidityPercent: 65,
      txHash: '0x8f273b76541f5cd9a77ef7c43df7be791244d82f71881efb9bb47e62ab4d99c1',
      actorId: farmer.id,
      timestamp: new Date('2026-05-10T09:30:00Z'),
    },
  });

  await prisma.supplyChainEvent.create({
    data: {
      batchId: batch1.id,
      eventType: 'TRANSFER_OF_CUSTODY',
      fromAddress: farmer.walletAddress.toLowerCase(),
      toAddress: distributor.walletAddress.toLowerCase(),
      pricePerUnit: 2.25, // Distributor markup to $2.25/kg
      currency: 'USD',
      location: 'Navi Mumbai Cold Storage Terminal #3',
      notes: 'Cold chain transit maintained at 4-6°C. Ethylene absorption filters applied.',
      temperatureC: 5.2,
      humidityPercent: 85,
      txHash: '0x3a923b76541f5cd9a77ef7c43df7be791244d82f71881efb9bb47e62ab4d11a2',
      actorId: distributor.id,
      timestamp: new Date('2026-05-12T14:15:00Z'),
    },
  });

  await prisma.supplyChainEvent.create({
    data: {
      batchId: batch1.id,
      eventType: 'TRANSFER_OF_CUSTODY',
      fromAddress: distributor.walletAddress.toLowerCase(),
      toAddress: retailer.walletAddress.toLowerCase(),
      pricePerUnit: 3.80, // Retail shelf price $3.80/kg
      currency: 'USD',
      location: 'FreshBazaar Store #104, Indiranagar',
      notes: 'Stocked on display with live QR traceability tag for consumer verification.',
      temperatureC: 18.0,
      humidityPercent: 55,
      txHash: '0x99273b76541f5cd9a77ef7c43df7be791244d82f71881efb9bb47e62ab4d88e4',
      actorId: retailer.id,
      timestamp: new Date('2026-05-14T10:00:00Z'),
    },
  });

  // Seed sample scan logs for consumer analytics
  await prisma.scanLog.create({
    data: {
      batchId: batch1.id,
      ipAddress: '127.0.0.1',
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
      city: 'Bengaluru',
      country: 'India',
      scannedAt: new Date(),
    },
  });

  console.log('Seed completed successfully!');
  console.log('Demo Accounts:');
  console.log(' - Farmer:      farmer@agrichain.com      | password123');
  console.log(' - Distributor: distributor@agrichain.com | password123');
  console.log(' - Retailer:    retailer@agrichain.com    | password123');
  console.log(' - Consumer:    consumer@agrichain.com    | password123');
  console.log(' - Admin:       admin@agrichain.com       | password123');
}

main()
  .catch((e) => {
    console.error('Seeding error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
