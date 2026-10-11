import React, { useState, useEffect } from 'react';

import { useAuth } from '../context/AuthContext';
import { useWeb3 } from '../context/Web3Context';
import { apiRequest } from '../config/api';
import { StatusBadge } from '../components/StatusBadge';
import { WalletBindingBanner } from '../components/WalletBindingBanner';
import { assertWalletReadyForTransaction } from '../utils/web3Utils';
import { getProductImage } from '../utils/productImages';

import {
  Sprout,
  Plus,
  QrCode,
  ExternalLink,
  Download,
  X,
  AlertTriangle,
  Wallet,
  ShieldCheck,
  Trash2,
} from 'lucide-react';

export const FarmerDashboard = () => {
  const { user } = useAuth();

  const {
    contract,
    account,
    signer,
    connectWallet,
    contractAddress,
    chainId,
  } = useWeb3();

  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeQRModal, setActiveQRModal] = useState(null);

  // =========================
  // Form State
  // =========================

  const [productName, setProductName] = useState('');
  const [category, setCategory] = useState('Fruits');

  const [originLocation, setOriginLocation] = useState(
    user?.physicalAddress || 'Ratnagiri, Maharashtra'
  );

  const [farmName, setFarmName] = useState(
    user?.organization || 'Sahyadri Organic Orchards'
  );

  const [quantity, setQuantity] = useState(500);
  const [unit, setUnit] = useState('kg');
  const [qualityGrade, setQualityGrade] = useState('PREMIUM');

  // INR farmer base price
  // String state allows the user to temporarily clear the field while typing.
  const [initialPrice, setInitialPrice] = useState('200');

  const [harvestDate, setHarvestDate] = useState(
    new Date().toISOString().split('T')[0]
  );

  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [txStep, setTxStep] = useState(null);
  const [error, setError] = useState(null);

  const networkName =
    chainId === 31337
      ? 'Hardhat Localhost'
      : chainId
        ? `EVM Network (Chain ID ${chainId})`
        : 'Network not connected';

  // =========================
  // Load Batches
  // =========================

  useEffect(() => {
    fetchBatches();
  }, []);

  const fetchBatches = async () => {
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

  // =========================
  // Create Batch
  // =========================

  const handleCreateBatch = async (e) => {
    e.preventDefault();
    setError(null);
     // Track the draft and transaction state for safe cleanup.
    let dbBatchId = null;
    let transactionSubmitted = false;
    let transactionConfirmed = false;

    // Validate price before creating DB draft
    const parsedInitialPrice = Number(initialPrice);

    if (
      !Number.isFinite(parsedInitialPrice) ||
      parsedInitialPrice <= 0
    ) {
      const message = 'Please enter a valid farmer base price greater than ₹0.';

      setError(message);
      alert(message);
      return;
    }

    // Verify MetaMask, registered wallet and contract
    try {
      assertWalletReadyForTransaction(user, account);

      if (!contract || !signer) {
        throw new Error(
          'MetaMask contract instance is not ready. Please verify network connection.'
        );
      }
    } catch (validationErr) {
      setError(validationErr.message);
      alert(validationErr.message);
      return;
    }

    setSubmitting(true);
    setTxStep('Step 1/3: Creating draft metadata in database...');

    try {
      const activeWallet = account.toLowerCase();

      // =========================================
      // 1. Create DB Draft
      // =========================================

      const draftRes = await apiRequest('/batches', {
        method: 'POST',

        body: JSON.stringify({
          productName,
          category,
          description,
          originLocation,
          farmName,
          quantity: Number(quantity),
          unit,
          qualityGrade,
          harvestDate: new Date(harvestDate).toISOString(),

          // Connected MetaMask wallet
          farmerWallet: activeWallet,

          // INR price
          initialPrice: parsedInitialPrice,

          images: [getProductImage(productName, category)].filter(Boolean),
        }),
      });

      dbBatchId = draftRes.batch.id;

      // =========================================
      // 2. Publish to Blockchain
      // =========================================

      setTxStep(
        'Step 2/3: Awaiting MetaMask signature to deploy on-chain...'
      );

      const gradeMap = {
        GRADE_A: 0,
        GRADE_B: 1,
        GRADE_C: 2,
        PREMIUM: 3,
        EXPORT_QUALITY: 4,
      };

      // INR → Paise
      // Example: ₹200.00 → 20000 paise
      const priceInPaise = Math.round(parsedInitialPrice * 100);

      transactionSubmitted = true;

      const tx = await contract.createBatch(
        productName,
        originLocation,
        BigInt(quantity),
        unit,
        gradeMap[qualityGrade] ?? 0,
        BigInt(priceInPaise),
        `db://${dbBatchId}`
      );

      setTxStep('Step 2/3: Mining transaction on blockchain...');

      const receipt = await tx.wait(1);

      if (!receipt || receipt.status !== 1) {
      const revertError = new Error(
        'Blockchain transaction failed or was reverted on-chain.'
      );

      // A mined receipt with status 0 confirms a reverted transaction.
      revertError.confirmedRevert = Boolean(
        receipt && receipt.status === 0
      );

      throw revertError;
      }

      transactionConfirmed = true;

    const txHash = receipt.hash;

      let onChainBatchId = null;

      // =========================================
      // Parse BatchCreated event (named or positional index)
      // =========================================
      for (const log of receipt.logs) {
        try {
          const parsed = contract.interface.parseLog(log);
          if (parsed && parsed.name === 'BatchCreated') {
            const rawId = parsed.args?.batchId ?? parsed.args?.[0];
            if (rawId !== undefined && rawId !== null) {
              onChainBatchId = Number(rawId);
              break;
            }
          }
        } catch (e) {
          // Ignore logs that are not BatchCreated
        }
      }

      // Robust On-Chain Counter Fallback:
      // If event parsing was skipped by RPC filter quirks, query contract directly
      if (!onChainBatchId) {
        try {
          const totalBatches = await contract.getTotalBatches();
          if (totalBatches > 0n) {
            const latestBatch = await contract.getBatch(totalBatches);
            if (
              latestBatch &&
              latestBatch.exists &&
              latestBatch.farmer.toLowerCase() === activeWallet.toLowerCase()
            ) {
              onChainBatchId = Number(totalBatches);
              console.log('Retrieved confirmed batchId via contract fallback:', onChainBatchId);
            }
          }
        } catch (fallbackErr) {
          console.warn('Fallback on-chain batch lookup failed:', fallbackErr);
        }
      }

      if (!onChainBatchId) {
        throw new Error(
          'Failed to retrieve confirmed onChainBatchId from mined on-chain transaction.'
        );
      }

      // =========================================
      // 3. Confirm Backend
      // =========================================
      setTxStep('Step 3/3: Generating cryptographic QR code...');

      const confirmRes = await apiRequest(
        `/batches/${dbBatchId}/confirm`,
        {
          method: 'PUT',
          body: JSON.stringify({
            blockchainBatchId: onChainBatchId,
            creationTxHash: txHash,
            blockNumber: receipt.blockNumber,
          }),
        }
      );

      // Close create modal
      setIsModalOpen(false);

      // Reset form
      resetForm();

      // Refresh batches
      await fetchBatches();

      // Open QR modal immediately
      setActiveQRModal(confirmRes.batch);
    } catch (err) {
      console.error('Create batch error:', err);

      const userRejected =
        err?.code === 4001 ||
        err?.info?.error?.code === 4001 ||
        err?.cause?.code === 4001 ||
        err?.code === 'ACTION_REJECTED';

      // Clean up the unconfirmed database draft whenever the blockchain transaction failed to confirm
      if (dbBatchId && !transactionConfirmed) {
        try {
          await apiRequest(`/batches/${dbBatchId}/failed-draft`, { method: 'DELETE' });
          await fetchBatches();
        } catch (cleanupError) {
          console.warn('Cleaned up draft or draft already removed:', cleanupError.message);
        }
      }

      setError(
        userRejected
          ? 'MetaMask transaction was cancelled. The unconfirmed draft was removed.'
          : err.message || 'Failed to create produce batch'
      );
    } finally {
      setSubmitting(false);
      setTxStep(null);
    }
  };

  const handleDeleteDraft = async (draftId) => {
    if (!window.confirm('Are you sure you want to discard this unconfirmed batch draft?')) return;
    try {
      await apiRequest(`/batches/${draftId}/failed-draft`, { method: 'DELETE' });
      await fetchBatches();
    } catch (err) {
      alert(err.message || 'Failed to delete draft');
    }
  };

  // =========================
  // Reset Form
  // =========================

  const resetForm = () => {
    setProductName('');
    setDescription('');
    setQuantity(500);

    // Default INR farmer price
    setInitialPrice('200');
  };

  // =========================
  // UI
  // =========================

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">

      {/* =========================================
          Top Header
      ========================================= */}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">

        <div>
          <div className="flex items-center gap-2">

            <span className="p-2 rounded-xl bg-emerald-100 text-emerald-800">
              <Sprout className="w-6 h-6" />
            </span>

            <h1 className="text-2xl sm:text-3xl font-black text-slate-900">
              Farmer Produce Registry
            </h1>

          </div>

          <p className="text-sm text-slate-500 mt-1">
            Registered as:{' '}
            <strong className="text-slate-800">
              {user?.name}
            </strong>{' '}
            • {user?.organization || 'Organic Farmer'}
          </p>
        </div>

        <div className="flex items-center gap-3">

          {!account && (
            <button
              onClick={connectWallet}
              className="px-4 py-2 text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-xl transition"
            >
              Connect MetaMask to Sign
            </button>
          )}

          <button
            onClick={() => setIsModalOpen(true)}
            className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold rounded-xl shadow-md shadow-emerald-600/20 flex items-center gap-2 transition"
          >
            <Plus className="w-4 h-4" />
            <span>Register New Harvest</span>
          </button>

        </div>
      </div>

      {/* =========================================
          Wallet Binding
      ========================================= */}

      <WalletBindingBanner />

      {/* =========================================
          Summary Cards
      ========================================= */}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">

        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
          <div className="text-xs font-bold text-slate-400 uppercase">
            Total Harvest Batches
          </div>

          <div className="text-3xl font-black text-slate-900 mt-1">
            {batches.length}
          </div>

          <div className="text-xs text-emerald-600 font-medium mt-1">
            Direct from orchard
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">

          <div className="text-xs font-bold text-slate-400 uppercase">
            Total Quantity Logged
          </div>

          <div className="text-3xl font-black text-emerald-600 mt-1">
            {batches
              .reduce(
                (acc, b) => acc + (b.quantity || 0),
                0
              )
              .toLocaleString()}{' '}
            kg
          </div>

          <div className="text-xs text-slate-500 font-medium mt-1">
            Protected against counterfeit
          </div>

        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">

          <div className="text-xs font-bold text-slate-400 uppercase">
            On-Chain Verified
          </div>

          <div className="text-3xl font-black text-blue-600 mt-1">
            {batches.filter(
              (b) => b.isSyncWithChain
            ).length}
          </div>

          <div className="text-xs text-blue-600 font-medium mt-1">
            100% Cryptographic integrity
          </div>

        </div>

      </div>

      {/* =========================================
          Inventory Table
      ========================================= */}

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">

        <div className="p-6 border-b border-slate-100 flex items-center justify-between">

          <h2 className="text-lg font-bold text-slate-900">
            Your Agricultural Batches
          </h2>

          <span className="text-xs text-slate-500 font-medium">
            Click QR icon to print crate tag
          </span>

        </div>

        {loading ? (

          <div className="p-12 text-center text-slate-400 text-sm">
            Loading harvest records...
          </div>

        ) : batches.length === 0 ? (

          <div className="p-12 text-center space-y-3">

            <Sprout className="w-10 h-10 text-slate-300 mx-auto" />

            <p className="text-slate-600 text-sm font-medium">
              No produce batches registered yet.
            </p>

            <button
              onClick={() => setIsModalOpen(true)}
              className="px-4 py-2 bg-emerald-600 text-white text-xs font-bold rounded-lg"
            >
              Create Your First Batch
            </button>

          </div>

        ) : (

          <div className="overflow-x-auto">

            <table className="w-full text-left text-sm text-slate-600">

              <thead className="bg-slate-50 text-xs uppercase font-semibold text-slate-500 border-b border-slate-100">

                <tr>
                  <th className="px-6 py-4">
                    Batch ID
                  </th>

                  <th className="px-6 py-4">
                    Product / Crop
                  </th>

                  <th className="px-6 py-4">
                    Origin Farm
                  </th>

                  <th className="px-6 py-4">
                    Quantity
                  </th>

                  <th className="px-6 py-4">
                    Farmer Base Price
                  </th>

                  <th className="px-6 py-4">
                    Current Status
                  </th>

                  <th className="px-6 py-4 text-right">
                    Actions
                  </th>
                </tr>

              </thead>

              <tbody className="divide-y divide-slate-100">

                {batches.map((batch) => {

                  const batchPrice =
                    batch.events?.[0]?.pricePerUnit;

                  return (
                    <tr
                      key={batch.id}
                      className="hover:bg-slate-50/80 transition"
                    >

                      <td className="px-6 py-4 font-mono font-bold text-emerald-800">
                        #{batch.blockchainBatchId || 'Draft'}
                      </td>

                      <td className="px-6 py-4">

                        <div className="font-semibold text-slate-900">
                          {batch.productName}
                        </div>

                        <div className="text-xs text-slate-400">
                          {batch.category} • Grade:{' '}
                          {batch.qualityGrade}
                        </div>

                      </td>

                      <td className="px-6 py-4">

                        <div className="text-slate-800">
                          {batch.farmName}
                        </div>

                        <div className="text-xs text-slate-400">
                          {batch.originLocation}
                        </div>

                      </td>

                      <td className="px-6 py-4 font-medium text-slate-900">
                        <div>Registered: {batch.originalQuantity ?? batch.quantity} {batch.unit}</div>
                        <div className="text-xs text-slate-500">Sold/transferred: {batch.soldQuantity ?? 0} {batch.unit}</div>
                        <div className="text-xs font-bold text-emerald-700">Available: {batch.remainingQuantity ?? batch.quantity} {batch.unit}</div>
                      </td>

                      {/* INR Farmer Price */}

                      <td className="px-6 py-4 font-bold text-slate-900">

                        {batchPrice != null
                          ? `₹${Number(batchPrice).toFixed(2)}`
                          : '₹—'}

                        <span className="text-slate-500 font-medium">
                          {' '}/ {batch.unit}
                        </span>

                      </td>

                      <td className="px-6 py-4">
                        <StatusBadge status={batch.status} />
                        <div className="text-[11px] font-semibold text-emerald-700 mt-1">
                          {(batch.remainingQuantity ?? batch.quantity) === 0
                            ? 'Fully Sold'
                            : (batch.soldQuantity ?? 0) > 0
                              ? 'Partially Sold'
                              : 'Available'}
                        </div>
                        <div className="text-[11px] text-slate-500 mt-1 break-all">
                          Owner: {batch.currentOwnerWallet || 'Not available'}
                        </div>
                      </td>

                      <td className="px-6 py-4 text-right space-x-2">

                        {batch.qrCodeUrl && (
                          <button
                            onClick={() =>
                              setActiveQRModal(batch)
                            }
                            className="p-2 text-slate-600 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition inline-flex items-center"
                            title="View & Print QR Code"
                          >
                            <QrCode className="w-4 h-4" />
                          </button>
                        )}

                        {!batch.blockchainBatchId && !batch.isSyncWithChain && (
                          <button
                            onClick={() => handleDeleteDraft(batch.id)}
                            className="p-2 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition inline-flex items-center"
                            title="Discard Unconfirmed Draft"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}

                        <a
                          href={`/verify/${
                            batch.blockchainBatchId ||
                            batch.id
                          }`}
                          target="_blank"
                          rel="noreferrer"
                          className="p-2 text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition inline-flex items-center"
                          title="Consumer Verification Page"
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

      {/* =========================================
          Blockchain Verification Cards
      ========================================= */}

      {batches.length > 0 && (

        <section className="space-y-4">

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">

            <div>

              <h2 className="text-lg font-bold text-slate-900">
                Blockchain Verification
              </h2>

              <p className="text-xs text-slate-500">
                On-chain proof for every registered agricultural batch
              </p>

            </div>

            <div className="flex items-center gap-2 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-2 rounded-xl">

              <ShieldCheck className="w-4 h-4" />

              Immutable Blockchain Records

            </div>

          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

            {batches.map((batch) => {

              const isVerified =
                Boolean(batch.blockchainBatchId) &&
                Boolean(batch.creationTxHash) &&
                batch.isSyncWithChain !== false;

              const farmerWallet =
                batch.farmerWallet ||
                batch.walletAddress ||
                batch.farmer?.walletAddress ||
                account;

              return (

                <div
                  key={`blockchain-${batch.id}`}
                  className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden"
                >

                  {/* Card Header */}

                  <div className="px-5 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-3">

                    <div>

                      <div className="flex items-center gap-2">

                        <span className="font-mono text-sm font-black text-emerald-800">
                          Batch #{batch.blockchainBatchId || 'Draft'}
                        </span>

                        {isVerified ? (

                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-100 text-emerald-700 text-[10px] font-bold uppercase">

                            <ShieldCheck className="w-3.5 h-3.5" />

                            Verified

                          </span>

                        ) : (

                          <span className="px-2 py-1 rounded-lg bg-amber-100 text-amber-700 text-[10px] font-bold uppercase">
                            Pending
                          </span>

                        )}

                      </div>

                      <p className="text-xs text-slate-500 mt-1">
                        {batch.productName} • {batch.quantity}{' '}
                        {batch.unit}
                      </p>

                    </div>

                    <div className="p-2 rounded-xl bg-white border border-slate-200">
                      <Wallet className="w-4 h-4 text-slate-500" />
                    </div>

                  </div>

                  {/* Verification Details */}

                  <div className="p-5 space-y-4">

                    {/* Network */}

                    <div className="flex items-start justify-between gap-4">

                      <span className="text-xs font-semibold text-slate-500">
                        Network
                      </span>

                      <span className="text-xs font-bold text-slate-900 text-right">

                        {networkName}

                        {chainId && (
                          <span className="block text-[10px] font-mono text-slate-400 mt-0.5">
                            Chain ID: {chainId}
                          </span>
                        )}

                      </span>

                    </div>

                    {/* Contract */}

                    <div className="flex items-start justify-between gap-4">

                      <span className="text-xs font-semibold text-slate-500">
                        Smart Contract
                      </span>

                      <span className="text-[11px] font-mono font-semibold text-slate-800 text-right break-all">
                        {contractAddress ||
                          'Contract address unavailable'}
                      </span>

                    </div>

                    {/* Batch ID */}

                    <div className="flex items-center justify-between gap-4">

                      <span className="text-xs font-semibold text-slate-500">
                        On-Chain Batch ID
                      </span>

                      <span className="text-sm font-mono font-black text-emerald-700">
                        #{batch.blockchainBatchId || '—'}
                      </span>

                    </div>

                    {/* Farmer Wallet */}

                    <div className="flex items-start justify-between gap-4">

                      <span className="text-xs font-semibold text-slate-500">
                        Farmer Wallet
                      </span>

                      <span className="text-[11px] font-mono font-semibold text-slate-800 text-right break-all max-w-[70%]">
                        {farmerWallet || 'Not available'}
                      </span>

                    </div>

                    {/* Transaction Hash */}

                    <div className="flex items-start justify-between gap-4">

                      <span className="text-xs font-semibold text-slate-500">
                        Creation Transaction
                      </span>

                      {batch.creationTxHash ? (

                        <span className="text-[11px] font-mono font-semibold text-blue-700 text-right break-all max-w-[70%]">
                          {batch.creationTxHash}
                        </span>

                      ) : (

                        <span className="text-xs text-slate-400">
                          Transaction not confirmed
                        </span>

                      )}

                    </div>

                    {/* Status Proof */}

                    <div
                      className={`p-3 rounded-xl border ${
                        isVerified
                          ? 'bg-emerald-50 border-emerald-200'
                          : 'bg-amber-50 border-amber-200'
                      }`}
                    >

                      <div className="flex items-start gap-2">

                        {isVerified ? (

                          <ShieldCheck className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />

                        ) : (

                          <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />

                        )}

                        <div>

                          <p
                            className={`text-xs font-bold ${
                              isVerified
                                ? 'text-emerald-800'
                                : 'text-amber-800'
                            }`}
                          >
                            {isVerified
                              ? 'Blockchain record confirmed'
                              : 'Blockchain confirmation pending'}
                          </p>

                          <p
                            className={`text-[11px] mt-0.5 ${
                              isVerified
                                ? 'text-emerald-700'
                                : 'text-amber-700'
                            }`}
                          >
                            {isVerified
                              ? 'This batch has a confirmed on-chain ID and transaction hash.'
                              : 'Complete the blockchain registration to generate cryptographic proof.'}
                          </p>

                        </div>

                      </div>

                    </div>

                    {/* Consumer Verification */}

                    {batch.blockchainBatchId && (

                      <a
                        href={`/verify/${batch.blockchainBatchId}`}
                        target="_blank"
                        rel="noreferrer"
                        className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-2 transition"
                      >

                        <ExternalLink className="w-4 h-4" />

                        Open Consumer Verification

                      </a>

                    )}

                  </div>

                </div>

              );
            })}

          </div>

        </section>
      )}

      {/* =========================================
          Create Batch Modal
      ========================================= */}

      {isModalOpen && (

        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm animate-fade-in">

          <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl border border-slate-100 overflow-hidden">

            {/* Modal Header */}

            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">

              <div className="flex items-center gap-2">

                <div className="p-2 bg-emerald-100 text-emerald-800 rounded-lg">
                  <Sprout className="w-5 h-5" />
                </div>

                <div>

                  <h3 className="font-bold text-slate-900">
                    Register Agricultural Harvest
                  </h3>

                  <p className="text-xs text-slate-500">
                    Record produce origin & publish to Ethereum blockchain
                  </p>

                </div>

              </div>

              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>

            </div>

            {/* Form */}

            <form
              onSubmit={handleCreateBatch}
              className="p-6 space-y-4"
            >

              {error && (

                <div className="p-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg">
                  {error}
                </div>

              )}

              {/* Product + Category */}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

                <div>

                  <label
                    htmlFor="productName"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    Product / Crop Name
                  </label>

                  <input
                    id="productName"
                    name="productName"
                    type="text"
                    required
                    value={productName}
                    onChange={(e) =>
                      setProductName(e.target.value)
                    }
                    placeholder="e.g. Organic Alphonso Mangoes"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />

                </div>

                <div>

                  <label
                    htmlFor="category"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    Category
                  </label>

                  <select
                    id="category"
                    name="category"
                    value={category}
                    onChange={(e) =>
                      setCategory(e.target.value)
                    }
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  >
                    <option value="Fruits">
                      Fruits
                    </option>

                    <option value="Vegetables">
                      Vegetables
                    </option>

                    <option value="Grains">
                      Grains & Pulses
                    </option>

                    <option value="Spices">
                      Spices
                    </option>

                    <option value="Dairy">
                      Dairy
                    </option>
                  </select>

                </div>

              </div>

              {/* Farm + Origin */}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

                <div>

                  <label
                    htmlFor="farmName"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    Farm Name
                  </label>

                  <input
                    id="farmName"
                    name="farmName"
                    type="text"
                    required
                    value={farmName}
                    onChange={(e) =>
                      setFarmName(e.target.value)
                    }
                    placeholder="e.g. Sahyadri Organic Orchards"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />

                </div>

                <div>

                  <label
                    htmlFor="originLocation"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    Origin Location (City, State)
                  </label>

                  <input
                    id="originLocation"
                    name="originLocation"
                    type="text"
                    required
                    value={originLocation}
                    onChange={(e) =>
                      setOriginLocation(e.target.value)
                    }
                    placeholder="e.g. Ratnagiri, Maharashtra"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />

                </div>

              </div>

              {/* Quantity + Unit + Grade */}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">

                <div>

                  <label
                    htmlFor="quantity"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    Quantity
                  </label>

                  <input
                    id="quantity"
                    name="quantity"
                    type="number"
                    required
                    min="1"
                    value={quantity}
                    onChange={(e) =>
                      setQuantity(Number(e.target.value))
                    }
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />

                </div>

                <div>

                  <label
                    htmlFor="unit"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    Unit
                  </label>

                  <select
                    id="unit"
                    name="unit"
                    value={unit}
                    onChange={(e) =>
                      setUnit(e.target.value)
                    }
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  >

                    <option value="kg">
                      kg
                    </option>

                    <option value="tons">
                      tons
                    </option>

                    <option value="crates">
                      crates
                    </option>

                  </select>

                </div>

                <div>

                  <label
                    htmlFor="qualityGrade"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    Quality Grade
                  </label>

                  <select
                    id="qualityGrade"
                    name="qualityGrade"
                    value={qualityGrade}
                    onChange={(e) =>
                      setQualityGrade(e.target.value)
                    }
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  >

                    <option value="PREMIUM">
                      Premium
                    </option>

                    <option value="EXPORT_QUALITY">
                      Export Quality
                    </option>

                    <option value="GRADE_A">
                      Grade A
                    </option>

                    <option value="GRADE_B">
                      Grade B
                    </option>

                    <option value="GRADE_C">
                      Grade C
                    </option>

                  </select>

                </div>

              </div>

              {/* =========================================
                  Farmer Base Price + Harvest Date
              ========================================= */}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

                {/* Farmer Base Price */}

                <div>

                  <label
                    htmlFor="initialPrice"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    Farmer Base Price
                    <span className="text-slate-500 font-normal">
                      {' '}(
                      ₹ per {unit})
                    </span>
                  </label>

                  <div className="relative">

                    {/* Rupee symbol */}

                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-700 font-bold text-base pointer-events-none">
                      ₹
                    </span>

                    <input
                      id="initialPrice"
                      name="initialPrice"
                      type="number"
                      step="0.01"
                      min="0.01"
                      required
                      value={initialPrice}
                      onChange={(e) =>
                        setInitialPrice(e.target.value)
                      }
                      placeholder="200.00"
                      className="w-full pl-9 pr-14 py-2.5 text-sm font-semibold text-slate-900 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 focus:outline-none transition"
                    />

                    {/* Unit suffix */}

                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400 pointer-events-none">
                      / {unit}
                    </span>

                  </div>

                  <p className="mt-1.5 text-[11px] text-slate-400">
                    Starting price set by the farmer for this batch.
                  </p>

                </div>

                {/* Harvest Date */}

                <div>

                  <label
                    htmlFor="harvestDate"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    Harvest Date
                  </label>

                  <input
                    id="harvestDate"
                    name="harvestDate"
                    type="date"
                    required
                    value={harvestDate}
                    onChange={(e) =>
                      setHarvestDate(e.target.value)
                    }
                    className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />

                </div>

              </div>

              {/* =========================================
                  MetaMask Disconnected Banner
              ========================================= */}

              {!account && (

                <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 flex items-center justify-between gap-2">

                  <div className="flex items-center gap-2">

                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />

                    <span>
                      <strong>
                        MetaMask Not Connected:
                      </strong>{' '}
                      Please connect MetaMask to continue.
                    </span>

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

              {/* Transaction Progress */}

              {txStep && (

                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 font-semibold flex items-center gap-2">

                  <div className="w-3 h-3 rounded-full bg-emerald-600 animate-ping" />

                  <span>
                    {txStep}
                  </span>

                </div>

              )}

              {/* Form Buttons */}

              <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">

                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
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
                      ? 'Registering on Blockchain...'
                      : 'Sign & Register Harvest'}

                </button>

              </div>

            </form>

          </div>

        </div>

      )}

      {/* =========================================
          QR Code Inspection & Print Modal
      ========================================= */}

      {activeQRModal && (

        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm animate-fade-in">

          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-100 p-6 text-center space-y-4">

            <div className="flex justify-between items-start">

              <div>

                <span className="text-xs font-bold text-emerald-600 uppercase">
                  Crate Traceability Tag
                </span>

                <h3 className="text-lg font-bold text-slate-900">
                  {activeQRModal.productName}
                </h3>

                <p className="text-xs text-slate-500">
                  Batch #{activeQRModal.blockchainBatchId}
                </p>

              </div>

              <button
                type="button"
                onClick={() => setActiveQRModal(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>

            </div>

            {/* QR */}

            <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-inner inline-block">

              <img
                src={activeQRModal.qrCodeUrl}
                alt="Batch QR Code"
                className="w-56 h-56 mx-auto"
              />

            </div>

            {/* QR Details */}

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-600 space-y-1 text-left">

              <div className="flex justify-between">

                <span>
                  Farmer Price:
                </span>

                <strong>
                  ₹
                  {activeQRModal?.events?.[0]?.pricePerUnit != null
                    ? Number(
                        activeQRModal.events[0].pricePerUnit
                      ).toFixed(2)
                    : 'Price unavailable'}

                  {' '}/ {activeQRModal.unit}
                </strong>

              </div>

              <div className="flex justify-between">

                <span>
                  Origin:
                </span>

                <strong>
                  {activeQRModal.originLocation}
                </strong>

              </div>

              <div className="flex justify-between">

                <span>
                  Quality Grade:
                </span>

                <strong>
                  {activeQRModal.qualityGrade}
                </strong>

              </div>

            </div>

            {/* QR Buttons */}

            <div className="flex gap-2 pt-2">

              <a
                href={activeQRModal.qrCodeUrl}
                download={`AgriChain-Batch-${activeQRModal.blockchainBatchId}-QR.png`}
                className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 shadow-sm"
              >

                <Download className="w-4 h-4" />

                Download QR

              </a>

              <button
                type="button"
                onClick={() => window.print()}
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl"
              >
                Print Tag
              </button>

            </div>

          </div>

        </div>

      )}

    </div>
  );
};