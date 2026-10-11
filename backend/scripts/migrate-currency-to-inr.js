import { connectDB, mongoose } from '../src/lib/db.js';
import { SupplyChainEvent } from '../src/models/SupplyChainEvent.js';

await connectDB();

const legacyEvents = await SupplyChainEvent.countDocuments({ currency: 'USD' });
console.log(`Found ${legacyEvents} legacy USD supply-chain events.`);

if (process.argv.includes('--apply') && legacyEvents > 0) {
  const result = await SupplyChainEvent.updateMany(
    { currency: 'USD' },
    { $set: { currency: 'INR' } }
  );
  console.log(`Updated ${result.modifiedCount} supply-chain events to INR.`);
} else {
  console.log('Dry run only. Re-run with --apply to update legacy event currency metadata.');
}

await mongoose.disconnect();