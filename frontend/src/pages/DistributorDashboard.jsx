import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { useAuth } from '../context/AuthContext';
import { useWeb3 } from '../context/Web3Context';
import { apiRequest } from '../config/api';
import { StatusBadge } from '../components/StatusBadge';
import { QRScannerModal } from '../components/QRScannerModal';
import { verifyBatchExistsOnChain, assertWalletReadyForTransaction } from '../utils/web3Utils';
import { WalletBindingBanner } from '../components/WalletBindingBanner';
import {
  Truck,
  QrCode,
  Thermometer,
  ArrowRight,
  ExternalLink,
  X,
  AlertTriangle,
  CheckCircle2,
  Tag,
  Package,
  Boxes,
} from 'lucide-react';

export const getBatchLatestPrice = (batch) => {
  if (!batch) return null;
  if (Array.isArray(batch.events) && batch.events.length > 0) {
    const sorted = [...batch.events].sort(
      (a, b) => new Date(a.timestamp || 0).getTime() - new Date(b.timestamp || 0).getTime()
    );
    const latestEvent = sorted[sorted.length - 1];
    if (typeof latestEvent?.pricePerUnit === 'number' && !isNaN(latestEvent.pricePerUnit)) {
      return latestEvent.pricePerUnit;
    }
  }
  if (typeof batch.pricePerUnit === 'number' && !isNaN(batch.pricePerUnit)) {
    return batch.pricePerUnit;
  }
  if (typeof batch.initialPrice === 'number' && !isNaN(batch.initialPrice)) {
    return batch.initialPrice;
  }
  if (typeof batch.onChainData?.currentPrice === 'number') {
    return batch.onChainData.currentPrice / 100;
  }
  return null;
};

export const DistributorDashboard = () => {
  const { user } = useAuth();
  const { contract, account, signer, connectWallet } = useWeb3();

  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('available'); // 'available' | 'inventory' | 'all'
  const [isScannerOpen, setIsScannerOpen] = useState(false);

  // Modal 1: Buyer Acceptance Modal ("Accept & Purchase")
  const [purchaseModalBatch, setPurchaseModalBatch] = useState(null);
  const [purchaseQuantity, setPurchaseQuantity] = useState('');
  const [minimumPurchaseQuantity, setMinimumPurchaseQuantity] = useState(10);
  const [transitLocation, setTransitLocation] = useState(
    'Navi Mumbai Central Cold Chain Hub'
  );
  const [temperature, setTemperature] = useState(4.8);
  const [humidity, setHumidity] = useState(85);
  const [purchaseNotes, setPurchaseNotes] = useState(
    'Accepted from farmer. Cold chain container verified at 4.8°C.'
  );

  // Modal 2: Seller Pricing Modal ("Set Selling Price / Markup")
  const [markupModalBatch, setMarkupModalBatch] = useState(null);
  const [newSellingPrice, setNewSellingPrice] = useState('');
  const [markupNotes, setMarkupNotes] = useState(
    'Cold chain handling markup applied. Ready for dispatch to retail stores.'
  );

  const [submitting, setSubmitting] = useState(false);
  const [txStep, setTxStep] = useState(null);
  const [lastPurchaseProof, setLastPurchaseProof] = useState(null);

  useEffect(() => {
    loadBatches();
  }, []);

  const loadBatches = async () => {
    try {
      setLoading(true);
      const data = await apiRequest('/batches');
      setBatches(data.batches || []);
    } catch (err) {
      console.error('Failed to load batches:', err);
    } finally {
      setLoading(false);
    }
  };

  const isOwnedByMe = (batch) => {
    if (!account || !batch?.currentOwnerWallet) return false;
    return batch.currentOwnerWallet.toLowerCase() === account.toLowerCase();
  };

  const isAvailableToPurchase = (batch) => {
    if (!batch.blockchainBatchId || batch.isSyncWithChain === false) return false;
    if (isOwnedByMe(batch)) return false;
    const remQty = batch.remainingQuantity ?? batch.quantity;
    if (remQty <= 0) return false;
    if (batch.status === 'SOLD' || batch.status === 'RECALLED') return false;
    return batch.status === 'HARVESTED';
  };

  const availableBatches = batches.filter(isAvailableToPurchase);
  const myInventoryBatches = batches.filter(isOwnedByMe);

  const handleScanSuccess = (scannedBatchId) => {
    const found = batches.find(
      (b) => String(b.blockchainBatchId) === scannedBatchId || b.id === scannedBatchId
    );
    if (found) {
      if (isAvailableToPurchase(found)) {
        openPurchaseModal(found);
      } else if (isOwnedByMe(found)) {
        openMarkupModal(found);
      } else {
        alert(`Scanned Batch #${scannedBatchId}: ${found.productName} (${found.status})`);
      }
    } else {
      alert(`Batch #${scannedBatchId} scanned. Loading details...`);
    }
  };

  const openPurchaseModal = (batch) => {
    setPurchaseModalBatch(batch);
    setPurchaseQuantity(String(batch.remainingQuantity ?? batch.quantity ?? ''));
    setPurchaseNotes('Accepted from farmer into cold storage. Cold-chain seal intact.');
    if (contract?.minPurchaseQuantity) {
      contract.minPurchaseQuantity().then((value) => setMinimumPurchaseQuantity(Number(value))).catch(() => {});
    }
  };

  const openMarkupModal = (batch) => {
    setMarkupModalBatch(batch);
    const currentPrice = getBatchLatestPrice(batch);
    setNewSellingPrice(Number((currentPrice * 1.4).toFixed(2))); // suggest 40% markup
    setMarkupNotes('Cold chain handling markup applied. Available for retailer purchase.');
  };

  // 1. Distributor "Accept & Purchase" Action
  const handleAcceptPurchase = async (e) => {
    e.preventDefault();
    if (!purchaseModalBatch) return;

    // Rule 1, 2, 4, 5, 8: Verify MetaMask connection, registered wallet binding, and matching account
    try {
      assertWalletReadyForTransaction(user, account);
      if (!contract || !signer) {
        throw new Error('MetaMask contract instance is not ready. Please verify network connection.');
      }
    } catch (validationErr) {
      alert(validationErr.message);
      return;
    }

    setSubmitting(true);
    setTxStep('Step 1/2: Verifying on-chain offer and awaiting MetaMask signature...');

    try {
      // 1. Verify batch exists on the CURRENT deployed contract
      const check = await verifyBatchExistsOnChain(contract, purchaseModalBatch.blockchainBatchId);
      if (!check.exists) {
        alert(
          `Cannot Accept Purchase:\n\n${check.error}\n\nPlease select a batch created on the currently active smart contract.`
        );
        return;
      }

      const onChainBatch = check.batch;

      if (onChainBatch.currentOwner.toLowerCase() === account.toLowerCase()) {
        throw new Error('You are already the on-chain owner of this batch.');
      }

      const expectedPriceCents = onChainBatch.currentPrice;
      const expectedPriceDollars = Number(expectedPriceCents) / 100;
      const availableQuantity = Number(onChainBatch.quantity);
      const requestedQuantity = Number(purchaseQuantity);
      const minimumQuantity = Number(await contract.minPurchaseQuantity());
      if (!Number.isInteger(requestedQuantity) || requestedQuantity <= 0) {
        throw new Error('Purchase quantity must be a positive whole number.');
      }
      if (requestedQuantity > availableQuantity) {
        throw new Error('Purchase quantity exceeds available quantity.');
      }
      if (requestedQuantity < availableQuantity && (requestedQuantity < minimumQuantity || availableQuantity - requestedQuantity < minimumQuantity)) {
        throw new Error(`Partial purchases require at least ${minimumQuantity} units purchased and remaining.`);
      }

      const isPartialPurchase = requestedQuantity < availableQuantity;
      if (isPartialPurchase) {
        await apiRequest(`/batches/${purchaseModalBatch.id}/purchase-lot/validate`, {
          method: 'POST',
          body: JSON.stringify({
            purchaseQuantity: requestedQuantity,
            pricePerUnit: expectedPriceDollars,
            newStatus: 'IN_TRANSIT',
            location: transitLocation,
            notes: purchaseNotes,
          }),
        });
      }
      const tx = isPartialPurchase
        ? await contract.purchaseLot(
          BigInt(purchaseModalBatch.blockchainBatchId),
          BigInt(requestedQuantity),
          expectedPriceCents,
          1,
          transitLocation,
          purchaseNotes
        )
        : await contract.acceptPurchase(
          BigInt(purchaseModalBatch.blockchainBatchId),
          expectedPriceCents,
          1,
          transitLocation,
          purchaseNotes
        );

      setTxStep('Step 1/2: Mining on-chain acceptance transaction...');
      const receipt = await tx.wait(1);

      if (!receipt || receipt.status !== 1) {
        throw new Error('Blockchain transaction failed or was reverted on-chain.');
      }

      const txHash = receipt.hash;
      setLastPurchaseProof({
        txHash,
        batchId: purchaseModalBatch.blockchainBatchId,
        productName: purchaseModalBatch.productName,
        sellerWallet: onChainBatch.currentOwner,
        buyerWallet: account,
        pricePerUnit: expectedPriceDollars,
      });
      // 3. Only update backend after verified on-chain mining
      setTxStep('Step 2/2: Updating inventory registry & cold-chain logs...');
      const recordedPurchase = await apiRequest(`/batches/${purchaseModalBatch.id}/${isPartialPurchase ? 'purchase-lot' : 'transfer'}`, {
        method: 'POST',
        body: JSON.stringify({
          toAddress: account.toLowerCase(),
          purchaseQuantity: requestedQuantity,
          pricePerUnit: expectedPriceDollars,
          newStatus: 'IN_TRANSIT',
          location: transitLocation,
          notes: purchaseNotes,
          temperatureC: Number(temperature),
          humidityPercent: Number(humidity),
          txHash,
        }),
      });

      setLastPurchaseProof((proof) => ({
        ...proof,
        purchasedQuantity: requestedQuantity,
        childBatchId: recordedPurchase?.child?.blockchainBatchId || null,
      }));

      setPurchaseModalBatch(null);
      setActiveTab('inventory');
      await loadBatches();
    } catch (err) {
      console.error('Accept & Purchase failed:', err);
      alert(err.message || 'Accept & Purchase failed');
    } finally {
      setSubmitting(false);
      setTxStep(null);
    }
  };

  // 2. Distributor "Set Selling Price" Action (Markup without changing ownership)
  const handleUpdateSellingPrice = async (e) => {
    e.preventDefault();
    if (!markupModalBatch) return;

    if (!account || !contract || !signer) {
      alert('Please connect MetaMask to continue.');
      return;
    }

    const parsedPrice = Number(newSellingPrice);
    if (isNaN(parsedPrice) || parsedPrice <= 0) {
      alert('Please enter a valid selling price greater than 0.');
      return;
    }

    // Verify MetaMask connection, registered wallet binding, and matching account
    try {
      assertWalletReadyForTransaction(user, account);
      if (!contract || !signer) {
        throw new Error('MetaMask contract instance is not ready. Please verify network connection.');
      }
    } catch (validationErr) {
      alert(validationErr.message);
      return;
    }

    setSubmitting(true);
    setTxStep('Step 1/2: Publishing updated selling price on-chain...');

    try {
      // 1. Verify batch exists on the CURRENT deployed contract
      const check = await verifyBatchExistsOnChain(contract, markupModalBatch.blockchainBatchId);
      if (!check.exists) {
        alert(
          `Cannot Update Selling Price:\n\n${check.error}\n\nPlease select a batch created on the currently active smart contract.`
        );
        return;
      }

      const onChainBatch = check.batch;
      if (onChainBatch.currentOwner.toLowerCase() !== account.toLowerCase()) {
        alert(
          `Wallet Mismatch: Connected MetaMask account (${account.substring(0, 6)}...${account.substring(
            account.length - 4
          )}) is not the current on-chain owner (${onChainBatch?.currentOwner.substring(
            0,
            6
          )}...${onChainBatch?.currentOwner.substring(
            onChainBatch?.currentOwner.length - 4
          )}) of Batch #${markupModalBatch.blockchainBatchId}. Please switch accounts in MetaMask.`
        );
        return;
      }

      const priceInCents = Math.round(parsedPrice * 100);

      // 2. Call updateSellingPrice
      const tx = await contract.updateSellingPrice(
        BigInt(markupModalBatch.blockchainBatchId),
        BigInt(priceInCents),
        markupNotes
      );

      setTxStep('Step 1/2: Mining price update on blockchain...');
      const receipt = await tx.wait(1);

      if (!receipt || receipt.status !== 1) {
        throw new Error('Blockchain transaction failed or was reverted on-chain.');
      }

      const txHash = receipt.hash;

      // 3. Update backend event & price
      setTxStep('Step 2/2: Updating off-chain price catalogue...');
      await apiRequest(`/batches/${markupModalBatch.id}/transfer`, {
        method: 'POST',
        body: JSON.stringify({
          toAddress: account.toLowerCase(),
          pricePerUnit: parsedPrice,
          newStatus: 'IN_TRANSIT_TO_RETAILER',
          location: transitLocation,
          notes: markupNotes,
          txHash,
        }),
      });

      setMarkupModalBatch(null);
      await loadBatches();
    } catch (err) {
      console.error('Update selling price failed:', err);
      alert(err.message || 'Update selling price failed');
    } finally {
      setSubmitting(false);
      setTxStep(null);
    }
  };

  const displayedBatches =
    activeTab === 'available'
      ? availableBatches
      : activeTab === 'inventory'
        ? myInventoryBatches
        : batches;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-blue-100 text-blue-800">
              <Truck className="w-6 h-6" />
            </span>
            <h1 className="text-2xl sm:text-3xl font-black text-slate-900">
              Distributor Cold-Chain Operations
            </h1>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Logged as: <strong className="text-slate-800">{user?.name}</strong> •{' '}
            {user?.organization || 'Apex Logistics Ltd'}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsScannerOpen(true)}
            className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-xl shadow-md shadow-blue-600/20 flex items-center gap-2 transition"
          >
            <QrCode className="w-4 h-4" />
            <span>Scan Inbound Crate</span>
          </button>
        </div>
      </div>

      {/* Role-Based MetaMask Wallet Binding & Identity Banner */}
      <WalletBindingBanner />
      {/* Last Blockchain Purchase Proof */}
      {lastPurchaseProof && (
        <div className="bg-emerald-50 border-2 border-emerald-200 rounded-3xl p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 bg-emerald-100 text-emerald-700 rounded-xl flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5" />
            </div>

            <div>
              <h2 className="text-lg font-black text-emerald-900">
                Blockchain Purchase Confirmed
              </h2>
              <p className="text-xs text-emerald-700">
                Ownership transfer successfully mined on the EVM blockchain
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

            <div className="p-4 bg-white rounded-2xl border border-emerald-200">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                Blockchain Batch ID
              </span>
              <p className="mt-1 font-black font-mono text-emerald-700">
                #{lastPurchaseProof.batchId}
              </p>
            </div>

            <div className="p-4 bg-white rounded-2xl border border-emerald-200">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Purchased Quantity</span>
              <p className="mt-1 font-black text-slate-900">{lastPurchaseProof.purchasedQuantity ?? 'Not available'} units</p>
            </div>

            <div className="p-4 bg-white rounded-2xl border border-emerald-200">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Child Lot ID</span>
              <p className="mt-1 font-black font-mono text-emerald-700">
                {lastPurchaseProof.childBatchId ? `#${lastPurchaseProof.childBatchId}` : 'Full-batch compatibility flow'}
              </p>
            </div>

            <div className="p-4 bg-white rounded-2xl border border-emerald-200">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                Purchase Price
              </span>
              <p className="mt-1 font-black text-slate-900">
                ₹{lastPurchaseProof.pricePerUnit.toFixed(2)} / unit
              </p>
            </div>

            <div className="p-4 bg-white rounded-2xl border border-emerald-200">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                Seller Wallet
              </span>
              <p className="mt-1 font-mono text-xs text-slate-800 break-all">
                {lastPurchaseProof.sellerWallet}
              </p>
            </div>

            <div className="p-4 bg-white rounded-2xl border border-emerald-200">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                Buyer Wallet
              </span>
              <p className="mt-1 font-mono text-xs text-slate-800 break-all">
                {lastPurchaseProof.buyerWallet}
              </p>
            </div>

            <div className="p-4 bg-white rounded-2xl border border-emerald-200 sm:col-span-2">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                Blockchain Transaction Hash
              </span>
              <p className="mt-1 font-mono text-xs text-slate-800 break-all">
                {lastPurchaseProof.txHash}
              </p>

              <div className="mt-2 flex items-center gap-1.5 text-xs text-emerald-700 font-semibold">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Transaction mined successfully
              </div>
            </div>

          </div>
        </div>
      )}
      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
          <div className="text-xs font-bold text-slate-400 uppercase">Available to Purchase</div>
          <div className="text-3xl font-black text-emerald-600 mt-1 flex items-center gap-2">
            <Boxes className="w-7 h-7 text-emerald-500" />
            <span>{availableBatches.length}</span>
          </div>
          <div className="text-xs text-slate-500 font-medium mt-1">Harvested produce from farmers</div>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
          <div className="text-xs font-bold text-slate-400 uppercase">My Inventory</div>
          <div className="text-3xl font-black text-blue-600 mt-1 flex items-center gap-2">
            <Package className="w-7 h-7 text-blue-500" />
            <span>{myInventoryBatches.length}</span>
          </div>
          <div className="text-xs text-slate-500 font-medium mt-1">Acquired & under monitoring</div>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
          <div className="text-xs font-bold text-slate-400 uppercase">Average Transit Temp</div>
          <div className="text-3xl font-black text-purple-600 mt-1 flex items-center gap-1">
            <Thermometer className="w-7 h-7 text-purple-500" />
            <span>4.8°C</span>
          </div>
          <div className="text-xs text-slate-500 font-medium mt-1">Cold chain compliant (2°C - 8°C)</div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex border-b border-slate-200 gap-2">
        <button
          onClick={() => setActiveTab('available')}
          className={`pb-3 px-4 font-bold text-sm border-b-2 transition flex items-center gap-2 ${activeTab === 'available'
            ? 'border-emerald-600 text-emerald-700'
            : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
        >
          <CheckCircle2 className="w-4 h-4" />
          <span>Available to Purchase ({availableBatches.length})</span>
        </button>
        <button
          onClick={() => setActiveTab('inventory')}
          className={`pb-3 px-4 font-bold text-sm border-b-2 transition flex items-center gap-2 ${activeTab === 'inventory'
            ? 'border-blue-600 text-blue-700'
            : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
        >
          <Package className="w-4 h-4" />
          <span>My Inventory ({myInventoryBatches.length})</span>
        </button>
        <button
          onClick={() => setActiveTab('all')}
          className={`pb-3 px-4 font-bold text-sm border-b-2 transition flex items-center gap-2 ${activeTab === 'all'
            ? 'border-slate-800 text-slate-900'
            : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
        >
          <Boxes className="w-4 h-4" />
          <span>All Batches ({batches.length})</span>
        </button>
      </div>

      {/* Batches Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">
            {activeTab === 'available'
              ? 'Farmer Batches Available for Purchase'
              : activeTab === 'inventory'
                ? 'Batches Owned by Your Distributor Wallet'
                : 'All Supply Chain Batches'}
          </h2>
          <span className="text-xs text-slate-500 font-medium">
            {activeTab === 'available'
              ? 'Accept and purchase at the verified on-chain farmer price'
              : activeTab === 'inventory'
                ? 'Set offered wholesale markup price for retailers'
                : 'Complete immutable supply chain registry'}
          </span>
        </div>

        {loading ? (
          <div className="p-12 text-center text-slate-400 text-sm">Loading shipments...</div>
        ) : displayedBatches.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-sm">
            {activeTab === 'available'
              ? 'No newly harvested batches available to purchase right now.'
              : activeTab === 'inventory'
                ? 'No batches currently owned by your connected wallet. Go to "Available to Purchase" to acquire stock from farmers.'
                : 'No batches found in registry.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-600">
              <thead className="bg-slate-50 text-xs uppercase font-semibold text-slate-500 border-b border-slate-100">
                <tr>
                  <th className="px-6 py-4">Batch ID</th>
                  <th className="px-6 py-4">Product Name</th>
                  <th className="px-6 py-4">Farmer Origin</th>
                  <th className="px-6 py-4">Quantity</th>
                  <th className="px-6 py-4">
                    {activeTab === 'available' ? "Farmer's Offered Price" : 'Current Price'}
                  </th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {displayedBatches.map((batch) => {
                  const currentPrice = getBatchLatestPrice(batch);
                  const isOwned = isOwnedByMe(batch);
                  const isAvailable = isAvailableToPurchase(batch);

                  return (
                    <tr key={batch.id} className="hover:bg-slate-50/80 transition">
                      <td className="px-6 py-4 font-mono font-bold text-blue-700">
                        #{batch.blockchainBatchId || 'Draft'}
                      </td>
                      <td className="px-6 py-4 font-semibold text-slate-900">
                        {batch.productName}
                      </td>
                      <td className="px-6 py-4 text-xs">
                        <div className="font-semibold text-slate-800">{batch.farmName}</div>
                        <div className="text-slate-400">{batch.originLocation}</div>
                      </td>
                      <td className="px-6 py-4 font-medium">
                        {batch.remainingQuantity ?? batch.quantity} {batch.unit}
                        {batch.parentBatchId && <div className="text-xs text-slate-500">Parent lot: #{batch.parentBatchId}</div>}
                      </td>
                      <td className="px-6 py-4 font-bold text-slate-900">
                        {currentPrice !== null ? `₹${currentPrice.toFixed(2)}` : 'Not available'} / {batch.unit}
                      </td>
                      <td className="px-6 py-4">
                        <StatusBadge status={batch.status} />
                      </td>
                      <td className="px-6 py-4 text-right space-x-2">
                        {isAvailable && (
                          <button
                            onClick={() => openPurchaseModal(batch)}
                            className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg transition shadow-xs inline-flex items-center gap-1.5"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Purchase Lot ({currentPrice !== null ? `₹${currentPrice.toFixed(2)}` : 'price unavailable'})</span>
                          </button>
                        )}

                        {isOwned && (
                          <button
                            onClick={() => openMarkupModal(batch)}
                            className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg transition shadow-xs inline-flex items-center gap-1.5"
                          >
                            <Tag className="w-3.5 h-3.5" />
                            <span>Set Selling Price</span>
                          </button>
                        )}

                        {!isAvailable && !isOwned && (
                          <span className="text-xs text-slate-400 italic px-2">
                            {batch.status === 'WITH_RETAILER'
                              ? 'Transferred to Retailer'
                              : 'Not Available for Purchase'}
                          </span>
                        )}

                        <a
                          href={`/verify/${batch.blockchainBatchId || batch.id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="p-1.5 text-slate-400 hover:text-blue-600 inline-block"
                          title="Public Verification"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal 1: Accept & Purchase Modal (Buyer Acceptance Flow) */}
      {purchaseModalBatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm animate-fade-in">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-slate-100 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 bg-emerald-50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-emerald-100 text-emerald-800 rounded-lg">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900">Accept & Purchase Produce Batch</h3>
                  <p className="text-xs text-slate-500">
                    Batch #{purchaseModalBatch.blockchainBatchId} • {purchaseModalBatch.productName}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setPurchaseModalBatch(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAcceptPurchase} className="p-6 space-y-4">
              <div className="p-4 bg-emerald-50/70 border border-emerald-200 rounded-xl text-xs text-slate-700 space-y-2">
                <div className="flex justify-between">
                  <span className="text-slate-500">Farmer's Offered Price:</span>
                  <strong className="text-emerald-700 text-sm font-black">
                    {getBatchLatestPrice(purchaseModalBatch) !== null ? `₹${getBatchLatestPrice(purchaseModalBatch).toFixed(2)}` : 'Not available'} / {purchaseModalBatch.unit}
                  </strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Available Quantity:</span>
                  <strong>{purchaseModalBatch.remainingQuantity ?? purchaseModalBatch.quantity} {purchaseModalBatch.unit}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Minimum Purchase:</span>
                  <strong>{minimumPurchaseQuantity} {purchaseModalBatch.unit}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Purchase Quantity:</span>
                  <strong>{purchaseQuantity || 'Not set'} {purchaseModalBatch.unit}</strong>
                </div>
                <div className="flex justify-between border-t border-emerald-200/60 pt-2 font-bold text-slate-900">
                  <span>Total Purchase Cost:</span>
                  <span>
                    {getBatchLatestPrice(purchaseModalBatch) !== null && purchaseQuantity
                      ? `₹${(getBatchLatestPrice(purchaseModalBatch) * Number(purchaseQuantity)).toFixed(2)}`
                      : 'Not available'}
                  </span>
                </div>
                <div className="text-right text-xs text-slate-600">
                  Remaining after purchase: {Math.max(0, Number(purchaseModalBatch.remainingQuantity ?? purchaseModalBatch.quantity) - Number(purchaseQuantity || 0))} {purchaseModalBatch.unit}
                </div>
              </div>

              <div className="text-xs text-slate-500 italic">
                * By signing in MetaMask, you explicitly accept the Farmer's offered price on-chain. Ownership of Batch #{purchaseModalBatch.blockchainBatchId} will be transferred to your connected wallet.
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Purchase Quantity ({purchaseModalBatch.unit})</label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  required
                  value={purchaseQuantity}
                  onChange={(e) => setPurchaseQuantity(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Inbound Cold-Chain Warehouse Hub
                </label>
                <input
                  type="text"
                  required
                  value={transitLocation}
                  onChange={(e) => setTransitLocation(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Receiving Temperature (°C)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={temperature}
                    onChange={(e) => setTemperature(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Humidity (%)
                  </label>
                  <input
                    type="number"
                    step="1"
                    value={humidity}
                    onChange={(e) => setHumidity(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Receiving & Acceptance Notes
                </label>
                <textarea
                  rows={2}
                  value={purchaseNotes}
                  onChange={(e) => setPurchaseNotes(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                ></textarea>
              </div>

              {/* MetaMask Disconnected Warning */}
              {!account && (
                <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                    <span><strong>MetaMask Not Connected:</strong> Please connect MetaMask to accept purchase.</span>
                  </div>
                  <button
                    type="button"
                    onClick={connectWallet}
                    className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg shrink-0 transition shadow-xs"
                  >
                    Connect Wallet
                  </button>
                </div>
              )}

              {txStep && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 font-semibold flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-emerald-600 animate-ping" />
                  <span>{txStep}</span>
                </div>
              )}

              <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setPurchaseModalBatch(null)}
                  className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || !account}
                  className={`px-6 py-2 text-white text-sm font-bold rounded-lg shadow-sm flex items-center gap-2 transition ${!account
                    ? 'bg-slate-400 cursor-not-allowed'
                    : 'bg-emerald-600 hover:bg-emerald-700'
                    }`}
                >
                  {!account
                    ? 'Connect MetaMask to Continue'
                    : submitting
                      ? 'Confirming On-Chain...'
                      : 'Confirm Purchase'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 2: Set Selling Price Modal (Owner Markup Flow) */}
      {markupModalBatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm animate-fade-in">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-slate-100 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 bg-blue-50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-blue-100 text-blue-800 rounded-lg">
                  <Tag className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900">Set Offered Selling Price</h3>
                  <p className="text-xs text-slate-500">
                    Batch #{markupModalBatch.blockchainBatchId} • {markupModalBatch.productName}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setMarkupModalBatch(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUpdateSellingPrice} className="p-6 space-y-4">
              <div className="p-3 bg-blue-50/60 border border-blue-200 rounded-xl text-xs text-slate-600 space-y-1">
                <div className="flex justify-between">
                  <span>Current Cost Price:</span>
                  <strong>₹{getBatchLatestPrice(markupModalBatch).toFixed(2)} / {markupModalBatch.unit}</strong>
                </div>
                <div className="flex justify-between">
                  <span>Quantity in Stock:</span>
                  <strong>{markupModalBatch.quantity} {markupModalBatch.unit}</strong>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  New Offered Selling Price for Retailers (₹ per {markupModalBatch.unit})
                </label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={newSellingPrice}
                  onChange={(e) => setNewSellingPrice(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Warehouse Location / Logistics Hub
                </label>
                <input
                  type="text"
                  required
                  value={transitLocation}
                  onChange={(e) => setTransitLocation(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Handling / Dispatch Notes
                </label>
                <textarea
                  rows={2}
                  value={markupNotes}
                  onChange={(e) => setMarkupNotes(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                ></textarea>
              </div>

              <div className="text-xs text-slate-500 italic">
                * Updating the selling price does NOT transfer ownership. You remain the owner on-chain until a retailer accepts and purchases this batch.
              </div>

              {/* MetaMask Disconnected Banner */}
              {!account && (
                <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                    <span><strong>MetaMask Not Connected:</strong> Please connect MetaMask to update price.</span>
                  </div>
                  <button
                    type="button"
                    onClick={connectWallet}
                    className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg shrink-0 transition shadow-xs"
                  >
                    Connect Wallet
                  </button>
                </div>
              )}

              {/* Wallet Mismatch Warning */}
              {account && markupModalBatch.currentOwnerWallet && markupModalBatch.currentOwnerWallet.toLowerCase() !== account.toLowerCase() && (
                <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl text-xs text-red-900 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold block">Wallet Mismatch Warning:</span>
                    <span>
                      Connected MetaMask wallet (<strong>{account.substring(0, 6)}...{account.substring(account.length - 4)}</strong>) is not the registered owner of this batch. Please switch accounts in MetaMask before submitting.
                    </span>
                  </div>
                </div>
              )}

              {txStep && (
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-800 font-semibold flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-blue-600 animate-ping" />
                  <span>{txStep}</span>
                </div>
              )}

              <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setMarkupModalBatch(null)}
                  className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || !account}
                  className={`px-6 py-2 text-white text-sm font-bold rounded-lg shadow-sm flex items-center gap-2 transition ${!account
                    ? 'bg-slate-400 cursor-not-allowed'
                    : 'bg-blue-600 hover:bg-blue-700'
                    }`}
                >
                  {!account
                    ? 'Connect MetaMask to Continue'
                    : submitting
                      ? 'Publishing Price...'
                      : 'Publish Selling Price'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Inbound Scanner */}
      <QRScannerModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onScanSuccess={handleScanSuccess}
      />
    </div>
  );
};
