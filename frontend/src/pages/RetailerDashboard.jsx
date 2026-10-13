import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useWeb3 } from '../context/Web3Context';
import { apiRequest } from '../config/api';
import { StatusBadge } from '../components/StatusBadge';
import { QRScannerModal } from '../components/QRScannerModal';
import { verifyBatchExistsOnChain, assertWalletReadyForTransaction } from '../utils/web3Utils';
import { WalletBindingBanner } from '../components/WalletBindingBanner';
import {
  Store,
  QrCode,
  Tag,
  Printer,
  ExternalLink,
  Sparkles,
  X,
  AlertTriangle,
  CheckCircle2,
  Package,
  Boxes,
} from 'lucide-react';

export const getBatchLatestPrice = (batch) => {
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
};

export const getBatchFarmerPrice = (batch) => {
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
};

export const RetailerDashboard = () => {
  const { user } = useAuth();
  const { contract, account, signer, connectWallet } = useWeb3();

  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('inventory'); // 'inventory' | 'available' | 'all'
  const [isScannerOpen, setIsScannerOpen] = useState(false);

  // Modal 1: Buyer Acceptance Modal ("Accept & Purchase")
  const [purchaseModalBatch, setPurchaseModalBatch] = useState(null);
  const [purchaseQuantity, setPurchaseQuantity] = useState('');
  const [minimumPurchaseQuantity, setMinimumPurchaseQuantity] = useState(10);
  const [purchaseNotes, setPurchaseNotes] = useState(
    'Inspected for freshness, verified cold-chain logs, accepted at supermarket receiving dock.'
  );

  // Modal 2: Retail Shelf Pricing Modal ("Set Retail Shelf Price")
  const [selectedBatch, setSelectedBatch] = useState(null);
  const [retailPrice, setRetailPrice] = useState('');
  const [storeLocation, setStoreLocation] = useState(
    user?.physicalAddress || 'FreshBazaar Store #104, Indiranagar, Bengaluru'
  );
  const [notes, setNotes] = useState(
    'Inspected for freshness, verified blockchain provenance, placed on retail shelf with QR trace tag.'
  );

  // Modal 3: Shelf Tag Modal
  const [activeShelfTagModal, setActiveShelfTagModal] = useState(null);

  const [submitting, setSubmitting] = useState(false);
  const [txStep, setTxStep] = useState(null);

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
    // Available from distributor if status is WITH_DISTRIBUTOR or IN_TRANSIT or IN_TRANSIT_TO_RETAILER
    return (
      batch.status === 'WITH_DISTRIBUTOR' ||
      batch.status === 'IN_TRANSIT' ||
      batch.status === 'IN_TRANSIT_TO_RETAILER'
    );
  };

  const myStoreBatches = batches.filter(isOwnedByMe);
  const availableBatches = batches.filter(isAvailableToPurchase);

  const handleOpenPurchaseModal = (batch) => {
    setPurchaseModalBatch(batch);
    setPurchaseQuantity(String(batch.remainingQuantity ?? batch.quantity ?? ''));
    setPurchaseNotes('Received in store dock. Cold-chain seal checked. Ready for retail shelves.');
    if (contract?.minPurchaseQuantity) {
      contract.minPurchaseQuantity().then((value) => setMinimumPurchaseQuantity(Number(value))).catch(() => {});
    }
  };

  const handleOpenUpdateModal = async (batch) => {
    setSelectedBatch(batch);
    const initialPrice = getBatchLatestPrice(batch);
    if (initialPrice !== null) {
      setRetailPrice(Number((initialPrice * 1.25).toFixed(2)));
    } else {
      setRetailPrice('');
    }

    try {
      const data = await apiRequest(`/batches/${batch.id || batch.blockchainBatchId}`);
      if (data?.batch) {
        setSelectedBatch(data.batch);
        const latestPrice = getBatchLatestPrice(data.batch);
        if (latestPrice !== null) {
          setRetailPrice(Number((latestPrice * 1.25).toFixed(2)));
        }
      }
    } catch (err) {
      console.warn('Could not load detailed batch history:', err);
    }
  };

  const handleScanSuccess = async (scannedBatchId) => {
    const found = batches.find(
      (b) => String(b.blockchainBatchId) === String(scannedBatchId) || b.id === scannedBatchId
    );
    if (found) {
      if (isAvailableToPurchase(found)) {
        handleOpenPurchaseModal(found);
      } else if (isOwnedByMe(found)) {
        await handleOpenUpdateModal(found);
      } else {
        alert(`Scanned Batch #${scannedBatchId}: ${found.productName} (${found.status})`);
      }
    } else {
      try {
        const data = await apiRequest(`/batches/${scannedBatchId}`);
        if (data?.batch) {
          if (isAvailableToPurchase(data.batch)) {
            handleOpenPurchaseModal(data.batch);
          } else {
            await handleOpenUpdateModal(data.batch);
          }
        }
      } catch (err) {
        alert('Scanned batch not found in registry');
      }
    }
  };

  const handleOpenShelfTag = async (batch) => {
    setActiveShelfTagModal(batch);
    try {
      const data = await apiRequest(`/batches/${batch.id || batch.blockchainBatchId}`);
      if (data?.batch) {
        setActiveShelfTagModal(data.batch);
      }
    } catch (err) {
      console.warn('Could not refresh batch for shelf tag:', err);
    }
  };

  // 1. Retailer "Accept & Purchase" Action
  const handleAcceptPurchase = async (e) => {
    e.preventDefault();
    if (!purchaseModalBatch) return;

    // Rule 1, 2, 4, 5, 9: Verify MetaMask connection, registered wallet binding, and matching account
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
    setTxStep('Step 1/2: Verifying distributor offered price & awaiting MetaMask signature...');

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
            newStatus: 'WITH_RETAILER',
            location: storeLocation,
            notes: purchaseNotes,
          }),
        });
      }
      const tx = isPartialPurchase
        ? await contract.purchaseLot(
          BigInt(purchaseModalBatch.blockchainBatchId),
          BigInt(requestedQuantity),
          expectedPriceCents,
          3,
          storeLocation,
          purchaseNotes,
          { gasLimit: 500000n }
        )
        : await contract.acceptPurchase(
          BigInt(purchaseModalBatch.blockchainBatchId),
          expectedPriceCents,
          3,
          storeLocation,
          purchaseNotes,
          { gasLimit: 350000n }
        );

      setTxStep('Step 1/2: Mining on-chain acceptance transaction...');
      const receipt = await tx.wait(1);

      if (!receipt || receipt.status !== 1) {
        throw new Error('Blockchain transaction failed or was reverted on-chain.');
      }

      const txHash = receipt.hash;

      // 3. Update database only after confirmed on-chain mining
      setTxStep('Step 2/2: Updating inventory registry...');
      await apiRequest(`/batches/${purchaseModalBatch.id}/${isPartialPurchase ? 'purchase-lot' : 'transfer'}`, {
        method: 'POST',
        body: JSON.stringify({
          toAddress: account.toLowerCase(),
          purchaseQuantity: requestedQuantity,
          pricePerUnit: expectedPriceDollars,
          newStatus: 'WITH_RETAILER',
          location: storeLocation,
          notes: purchaseNotes,
          txHash,
        }),
      });

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

  // 2. Retailer "Set Final Retail Shelf Price" Action
  const handleSetRetailPrice = async (e) => {
    e.preventDefault();
    if (!selectedBatch) return;

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

    const parsedPrice = Number(retailPrice);
    if (isNaN(parsedPrice) || parsedPrice <= 0) {
      alert('Please enter a valid retail price greater than 0.');
      return;
    }

    // Verify on-chain batch exists and check ownership before tx
    try {
      if (selectedBatch.blockchainBatchId) {
        const check = await verifyBatchExistsOnChain(contract, selectedBatch.blockchainBatchId);
        if (!check.exists) {
          alert(
            `Cannot Set Retail Shelf Price:\n\n${check.error}\n\nPlease select a batch created on the currently active smart contract.`
          );
          return;
        }

        const onChainBatch = check.batch;
        if (onChainBatch && onChainBatch.currentOwner.toLowerCase() !== account.toLowerCase()) {
          alert(
            `Wallet Mismatch: Connected MetaMask account (${account.substring(0, 6)}...${account.substring(
              account.length - 4
            )}) is not the current on-chain owner (${onChainBatch.currentOwner.substring(
              0,
              6
            )}...${onChainBatch.currentOwner.substring(
              onChainBatch.currentOwner.length - 4
            )}) of Batch #${selectedBatch.blockchainBatchId}. Please accept custody first or switch accounts.`
          );
          return;
        }
      }
    } catch (ownerErr) {
      console.warn('Could not verify on-chain batch ownership before tx:', ownerErr);
    }

    setSubmitting(true);
    setTxStep('Step 1/2: Publishing retail shelf price on-chain...');

    try {
      const priceInCents = Math.round(parsedPrice * 100);

      // Call updateSellingPrice
      const tx = await contract.updateSellingPrice(
        BigInt(selectedBatch.blockchainBatchId),
        BigInt(priceInCents),
        notes,
        { gasLimit: 250000n }
      );

      setTxStep('Step 1/2: Mining price update on blockchain...');
      const receipt = await tx.wait(1);

      if (!receipt || receipt.status !== 1) {
        throw new Error('Blockchain transaction failed or was reverted on-chain.');
      }

      const txHash = receipt.hash;

      setTxStep('Step 2/2: Updating inventory registry...');
      const batchIdToUpdate = selectedBatch.id || selectedBatch.blockchainBatchId;
      const res = await apiRequest(`/batches/${batchIdToUpdate}/transfer`, {
        method: 'POST',
        body: JSON.stringify({
          toAddress: account.toLowerCase(),
          pricePerUnit: parsedPrice,
          newStatus: 'WITH_RETAILER',
          location: storeLocation,
          notes,
          txHash,
        }),
      });

      setSelectedBatch(null);

      // Refetch the batch directly from backend to ensure all events and latest confirmed price
      let freshBatch = null;
      try {
        const freshData = await apiRequest(`/batches/${batchIdToUpdate}`);
        freshBatch = freshData?.batch || null;
      } catch (refetchErr) {
        console.warn('Failed to refetch single batch:', refetchErr);
      }

      const tagBatch = freshBatch || {
        ...res.batch,
        events: res.event ? [res.event] : [{ pricePerUnit: parsedPrice }],
      };

      await loadBatches();

      // Open the Shelf Tag modal with the guaranteed latest confirmed price
      setActiveShelfTagModal(tagBatch);
    } catch (err) {
      console.error('Error setting retail price:', err);
      alert(err.message || 'Failed to update retail price');
    } finally {
      setSubmitting(false);
      setTxStep(null);
    }
  };

  const displayedBatches =
    activeTab === 'inventory'
      ? myStoreBatches
      : activeTab === 'available'
      ? availableBatches
      : batches;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-purple-100 text-purple-800">
              <Store className="w-6 h-6" />
            </span>
            <h1 className="text-2xl sm:text-3xl font-black text-slate-900">
              Retailer Shelf Inventory & QR Tags
            </h1>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Store: <strong className="text-slate-800">{user?.name}</strong> •{' '}
            {user?.organization || 'FreshBazaar Hypermarkets Ltd'}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsScannerOpen(true)}
            className="px-4 py-2.5 bg-purple-600 hover:bg-purple-700 text-white text-sm font-bold rounded-xl shadow-md shadow-purple-600/20 flex items-center gap-2 transition"
          >
            <QrCode className="w-4 h-4" />
            <span>Scan Incoming Shipment</span>
          </button>
        </div>
      </div>

      {/* Role-Based MetaMask Wallet Binding & Identity Banner */}
      <WalletBindingBanner />

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
          <div className="text-xs font-bold text-slate-400 uppercase">Store Inventory (Owned)</div>
          <div className="text-3xl font-black text-purple-600 mt-1 flex items-center gap-2">
            <Package className="w-7 h-7 text-purple-500" />
            <span>{myStoreBatches.length} Batches</span>
          </div>
          <div className="text-xs text-slate-500 font-medium mt-1">Ready for retail shelf display</div>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
          <div className="text-xs font-bold text-slate-400 uppercase">Available to Purchase</div>
          <div className="text-3xl font-black text-emerald-600 mt-1 flex items-center gap-2">
            <Boxes className="w-7 h-7 text-emerald-500" />
            <span>{availableBatches.length} Batches</span>
          </div>
          <div className="text-xs text-slate-500 font-medium mt-1">From cold-chain distributors</div>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
          <div className="text-xs font-bold text-slate-400 uppercase">Shelf QR Tags Active</div>
          <div className="text-3xl font-black text-slate-900 mt-1 flex items-center gap-1">
            <Sparkles className="w-7 h-7 text-amber-500" />
            <span>{myStoreBatches.filter((b) => b.qrCodeUrl).length}</span>
          </div>
          <div className="text-xs text-slate-500 font-medium mt-1">Zero-barrier consumer traceability</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 gap-2">
        <button
          onClick={() => setActiveTab('inventory')}
          className={`pb-3 px-4 font-bold text-sm border-b-2 transition flex items-center gap-2 ${
            activeTab === 'inventory'
              ? 'border-purple-600 text-purple-700'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Package className="w-4 h-4" />
          <span>My Store Inventory ({myStoreBatches.length})</span>
        </button>
        <button
          onClick={() => setActiveTab('available')}
          className={`pb-3 px-4 font-bold text-sm border-b-2 transition flex items-center gap-2 ${
            activeTab === 'available'
              ? 'border-emerald-600 text-emerald-700'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <CheckCircle2 className="w-4 h-4" />
          <span>Available to Purchase ({availableBatches.length})</span>
        </button>
        <button
          onClick={() => setActiveTab('all')}
          className={`pb-3 px-4 font-bold text-sm border-b-2 transition flex items-center gap-2 ${
            activeTab === 'all'
              ? 'border-slate-800 text-slate-900'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Boxes className="w-4 h-4" />
          <span>All Network Batches ({batches.length})</span>
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">
            {activeTab === 'inventory'
              ? 'Store Inventory & Retail Shelf Pricing'
              : activeTab === 'available'
              ? 'Distributor Batches Available for Inbound Purchase'
              : 'All Supply Chain Batches'}
          </h2>
          <span className="text-xs text-slate-500 font-medium">
            {activeTab === 'inventory'
              ? 'Configure shelf price or generate official printable tags'
              : activeTab === 'available'
              ? 'Accept and purchase at verified distributor wholesale price'
              : 'Complete immutable supply chain registry'}
          </span>
        </div>

        {loading ? (
          <div className="p-12 text-center text-slate-400 text-sm">Loading inventory...</div>
        ) : displayedBatches.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-sm">
            {activeTab === 'inventory'
              ? 'No batches currently owned by your store wallet. Switch to "Available to Purchase" to accept inbound shipments from distributors.'
              : activeTab === 'available'
              ? 'No batches currently waiting for retailer acceptance.'
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
                  <th className="px-6 py-4">Stock Qty</th>
                  <th className="px-6 py-4">
                    {activeTab === 'available' ? "Distributor's Price" : 'Shelf Price'}
                  </th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {displayedBatches.map((batch) => {
                  const currentPrice = getBatchLatestPrice(batch);
                  const isOwned = isOwnedByMe(batch);
                  const isAvailable = isAvailableToPurchase(batch);

                  return (
                    <tr key={batch.id} className="hover:bg-slate-50/80 transition">
                      <td className="px-6 py-4 font-mono font-bold text-purple-700">
                        #{batch.blockchainBatchId || 'Draft'}
                      </td>
                      <td className="px-6 py-4">
                        <div className="font-semibold text-slate-900">{batch.productName}</div>
                        <div className="text-xs text-slate-400">{batch.category} • Grade: {batch.qualityGrade}</div>
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
                        {currentPrice !== null ? `₹${currentPrice.toFixed(2)}` : 'N/A'} / {batch.unit}
                      </td>
                      <td className="px-6 py-4">
                        <StatusBadge status={batch.status} />
                      </td>
                      <td className="px-6 py-4 text-right space-x-2">
                        {isAvailable && (
                          <button
                            onClick={() => handleOpenPurchaseModal(batch)}
                            className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg transition shadow-xs inline-flex items-center gap-1.5"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Purchase Lot (₹{currentPrice?.toFixed(2) || '0.00'})</span>
                          </button>
                        )}

                        {isOwned && (
                          <>
                            <button
                              onClick={() => handleOpenUpdateModal(batch)}
                              className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold rounded-lg transition shadow-xs inline-flex items-center gap-1"
                            >
                              <Tag className="w-3.5 h-3.5" />
                              <span>Set Shelf Price</span>
                            </button>
                            {batch.qrCodeUrl && (
                              <button
                                onClick={() => handleOpenShelfTag(batch)}
                                className="p-1.5 text-slate-600 hover:text-purple-600 hover:bg-purple-50 rounded-lg inline-block"
                                title="Print Shelf Tag"
                              >
                                <Printer className="w-4 h-4" />
                              </button>
                            )}
                          </>
                        )}

                        {!isAvailable && !isOwned && (
                          <span className="text-xs text-slate-400 italic px-2">
                            {batch.status === 'HARVESTED' ? 'Pending Distributor' : 'External Batch'}
                          </span>
                        )}

                        <a
                          href={`/verify/${batch.blockchainBatchId || batch.id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="p-1.5 text-slate-400 hover:text-purple-600 inline-block"
                          title="Public Consumer Verification"
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

      {/* Modal 1: Accept & Purchase Modal (Retailer Inbound Flow) */}
      {purchaseModalBatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm animate-fade-in">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-slate-100 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 bg-emerald-50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-emerald-100 text-emerald-800 rounded-lg">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900">Accept Inbound Produce Batch</h3>
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
                  <span className="text-slate-500">Distributor's Offered Price:</span>
                  <strong className="text-emerald-700 text-sm font-black">
                    ₹{(getBatchLatestPrice(purchaseModalBatch) || 0).toFixed(2)} / {purchaseModalBatch.unit}
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
                  <span>Total Wholesale Cost:</span>
                  <span>
                    ₹{((getBatchLatestPrice(purchaseModalBatch) || 0) * Number(purchaseQuantity || 0)).toFixed(2)} INR
                  </span>
                </div>
                <div className="text-right text-xs text-slate-600">
                  Remaining after purchase: {Math.max(0, Number(purchaseModalBatch.remainingQuantity ?? purchaseModalBatch.quantity) - Number(purchaseQuantity || 0))} {purchaseModalBatch.unit}
                </div>
              </div>

              <div className="text-xs text-slate-500 italic">
                * By signing in MetaMask, you confirm purchase at the Distributor's offered price on-chain. Ownership of Batch #{purchaseModalBatch.blockchainBatchId} will be transferred to your connected retailer wallet.
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
                  Receiving Store Location
                </label>
                <input
                  type="text"
                  required
                  value={storeLocation}
                  onChange={(e) => setStoreLocation(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Receiving & Quality Notes
                </label>
                <textarea
                  rows={2}
                  value={purchaseNotes}
                  onChange={(e) => setPurchaseNotes(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                ></textarea>
              </div>

              {/* MetaMask Disconnected Banner */}
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
                  className={`px-6 py-2 text-white text-sm font-bold rounded-lg shadow-sm flex items-center gap-2 transition ${
                    !account
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

      {/* Modal 2: Set Retail Price Modal (Owner Retail Pricing) */}
      {selectedBatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm animate-fade-in">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-slate-100 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-purple-100 text-purple-800 rounded-lg">
                  <Store className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900">Set Consumer Retail Shelf Price</h3>
                  <p className="text-xs text-slate-500">
                    Batch #{selectedBatch.blockchainBatchId} • {selectedBatch.productName}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedBatch(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSetRetailPrice} className="p-6 space-y-4">
              <div className="p-3 bg-purple-50/60 border border-purple-200 rounded-xl text-xs text-slate-600 space-y-1">
                <div className="flex justify-between">
                  <span>Farmer Harvest Price:</span>
                  <strong>
                    {(() => {
                      const fp = getBatchFarmerPrice(selectedBatch);
                      return fp !== null ? `₹${fp.toFixed(2)}` : 'N/A';
                    })()}{' '}
                    / {selectedBatch.unit}
                  </strong>
                </div>
                <div className="flex justify-between">
                  <span>Your Wholesale Cost:</span>
                  <strong>
                    {(() => {
                      const lp = getBatchLatestPrice(selectedBatch);
                      return lp !== null ? `₹${lp.toFixed(2)}` : 'N/A';
                    })()}{' '}
                    / {selectedBatch.unit}
                  </strong>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Final Consumer Retail Price ($ per {selectedBatch.unit})
                </label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={retailPrice}
                  onChange={(e) => setRetailPrice(e.target.value === '' ? '' : Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Retail Store Branch Location
                </label>
                <input
                  type="text"
                  required
                  value={storeLocation}
                  onChange={(e) => setStoreLocation(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Quality & Stocking Notes
                </label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:outline-none"
                ></textarea>
              </div>

              <div className="text-xs text-slate-500 italic">
                * Setting the shelf price updates the consumer QR code verification and printed shelf tags. You remain the owner of this batch.
              </div>

              {/* MetaMask Disconnected Banner */}
              {!account && (
                <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                    <span><strong>MetaMask Not Connected:</strong> Please connect MetaMask to continue.</span>
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

              {/* Connected Wallet vs Batch Owner Mismatch Warning */}
              {account && selectedBatch.currentOwnerWallet && selectedBatch.currentOwnerWallet.toLowerCase() !== account.toLowerCase() && (
                <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl text-xs text-red-900 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold block">Wallet Mismatch Warning:</span>
                    <span>
                      Connected MetaMask wallet (<strong>{account.substring(0, 6)}...{account.substring(account.length - 4)}</strong>) is not the registered owner of this batch. Please switch accounts in MetaMask or accept purchase first.
                    </span>
                  </div>
                </div>
              )}

              {txStep && (
                <div className="p-3 bg-purple-50 border border-purple-200 rounded-xl text-xs text-purple-800 font-semibold flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-purple-600 animate-ping" />
                  <span>{txStep}</span>
                </div>
              )}

              <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setSelectedBatch(null)}
                  className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || !account}
                  className={`px-6 py-2 text-white text-sm font-bold rounded-lg shadow-sm flex items-center gap-2 transition ${
                    !account
                      ? 'bg-slate-400 cursor-not-allowed'
                      : 'bg-purple-600 hover:bg-purple-700'
                  }`}
                >
                  {!account
                    ? 'Connect MetaMask to Continue'
                    : submitting
                    ? 'Signing on Blockchain...'
                    : 'Publish Retail Price & Print Tag'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Printable Shelf Tag Modal */}
      {activeShelfTagModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm animate-fade-in">
          <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl border-2 border-slate-900 p-6 text-center space-y-4">
            <div className="flex justify-between items-center border-b border-slate-200 pb-3">
              <span className="text-[10px] font-black tracking-widest text-slate-900 uppercase">
                Official Shelf Tag
              </span>
              <button
                onClick={() => setActiveShelfTagModal(null)}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-1">
              <h3 className="text-xl font-black text-slate-900 leading-tight">
                {activeShelfTagModal.productName}
              </h3>
              <p className="text-xs text-emerald-700 font-semibold">
                Origin: {activeShelfTagModal.farmName} ({activeShelfTagModal.originLocation})
              </p>
            </div>

            {/* Price Highlight */}
            <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-center">
              <span className="text-xs text-emerald-800 font-bold uppercase block">Retail Shelf Price</span>
              <span className="text-3xl font-black text-slate-900">
                {(() => {
                  const price = getBatchLatestPrice(activeShelfTagModal);
                  return price !== null ? `₹${price.toFixed(2)}` : 'N/A';
                })()}
              </span>
              <span className="text-xs text-slate-500 font-semibold"> / {activeShelfTagModal.unit}</span>
            </div>

            {/* QR Code */}
            <div className="p-3 bg-white border-2 border-dashed border-slate-300 rounded-xl inline-block">
              <img
                src={activeShelfTagModal.qrCodeUrl}
                alt="Shelf Tag QR"
                className="w-40 h-40 mx-auto"
              />
            </div>

            <p className="text-[11px] text-slate-500 font-medium">
              Scan with phone camera to view farm source, cold-chain temp, and fair price distribution.
            </p>

            <button
              onClick={() => window.print()}
              className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 shadow-md transition"
            >
              <Printer className="w-4 h-4" /> Print Shelf Display Tag
            </button>
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
