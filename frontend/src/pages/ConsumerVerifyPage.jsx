import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { apiRequest } from '../config/api';
import { StatusBadge } from '../components/StatusBadge';
import { useWeb3 } from '../context/Web3Context';
import { getProductImage } from '../utils/productImages';
import {
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  MapPin,
  Sprout,
  Truck,
  Store,
  Thermometer,
  Droplets,
  Sparkles,
} from 'lucide-react';

export const ConsumerVerifyPage = () => {
  const { batchId } = useParams();
  const { contractAddress, chainId } = useWeb3();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (batchId) {
      loadVerification(batchId);
    }
  }, [batchId]);

  const loadVerification = async (id) => {
    try {
      setLoading(true);
      setError(null);
      const res = await apiRequest(`/public/verify/${id}`);
      setData(res);

      // Log scan telemetry
      apiRequest(`/public/scan/${id}`, { method: 'POST' }).catch(() => { });
    } catch (err) {
      console.error('Verification failed:', err);
      setError(err.message || 'Batch not found in the decentralized registry');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-20 text-center space-y-4">
        <div className="w-12 h-12 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto" />
        <h2 className="text-xl font-bold text-slate-800">Verifying Produce on Ethereum Blockchain...</h2>
        <p className="text-xs text-slate-500 font-mono">Querying smart contract state & off-chain metadata</p>
      </div>
    );
  }

  if (error || !data || !data.batch) {
    return (
      <div className="max-w-xl mx-auto px-4 py-20 text-center space-y-4">
        <div className="w-16 h-16 bg-red-100 text-red-600 rounded-2xl flex items-center justify-center mx-auto">
          <AlertTriangle className="w-8 h-8" />
        </div>
        <h2 className="text-2xl font-black text-slate-900">Batch Not Found</h2>
        <p className="text-sm text-slate-600">
          No produce batch with identifier <strong>#{batchId}</strong> exists in the AgriChain registry.
        </p>
      </div>
    );
  }

  const {
    batch,
    integrityStatus,
    integrityDiscrepancies,
    pricing,
    onChainData,
    quantity,
    quantityHistory,
    lineage,
  } = data;
  const currency = pricing?.currency || 'INR';
  const formatPrice = (value) =>
    Number.isFinite(value) ? `₹${value.toFixed(2)}` : 'Not available';
  const formatMargin = (sellingPrice, purchasePrice) =>
    Number.isFinite(sellingPrice) && Number.isFinite(purchasePrice)
      ? sellingPrice - purchasePrice
      : null;
  const distributorMargin = formatMargin(
    pricing?.distributorSellingPricePerUnit,
    pricing?.distributorPurchasePricePerUnit
  );
  const retailerMargin = formatMargin(
    pricing?.retailerSellingPricePerUnit,
    pricing?.retailerPurchasePricePerUnit
  );
  const finalPrice =
    pricing?.retailerSellingPricePerUnit ??
    pricing?.retailerPurchasePricePerUnit ??
    pricing?.distributorSellingPricePerUnit ??
    pricing?.distributorPurchasePricePerUnit ??
    pricing?.farmerPricePerUnit ??
    null;
  const chainStatus = {
    0: 'HARVESTED',
    1: 'IN_TRANSIT',
    2: 'WITH_DISTRIBUTOR',
    3: 'WITH_RETAILER',
    4: 'SOLD',
    5: 'RECALLED',
  }[onChainData?.status];
  const displayStatus = chainStatus || batch.status;
  const storedImage = Array.isArray(batch.images) ? batch.images[0] : null;
  const isLegacyMangoImage =
    storedImage?.includes('photo-1553279768-865429fa0078') &&
    !/mango/i.test(`${batch.productName} ${batch.category}`);
  const displayImage =
    (isLegacyMangoImage ? null : storedImage) ||
    getProductImage(batch.productName, batch.category);

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-10">
      {/* Top Banner & Blockchain Verification Header */}
      <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-xl overflow-hidden relative">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono font-bold text-xs bg-emerald-100 text-emerald-800 px-2.5 py-1 rounded-lg">
                Batch #{batch.blockchainBatchId || 'Draft'}
              </span>
              <StatusBadge status={displayStatus} size="sm" />
              <span className="text-xs font-bold bg-slate-100 text-slate-700 px-2.5 py-1 rounded-lg">
                Grade: {batch.qualityGrade}
              </span>
            </div>

            <h1 className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tight">
              {batch.productName}
            </h1>

            <p className="text-sm text-slate-600 flex items-center gap-1.5">
              <MapPin className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>Harvested at <strong>{batch.farmName}</strong>, {batch.originLocation}</span>
            </p>
          </div>

          {/* Cryptographic Proof Badge */}
          <div className="text-left md:text-right p-4 bg-slate-50 border border-slate-200 rounded-2xl md:min-w-[280px]">
            <div className="flex items-center md:justify-end gap-2 text-emerald-700 font-extrabold text-sm mb-1">
              <ShieldCheck className="w-5 h-5 text-emerald-600" />
              <span>
                {integrityStatus === 'VERIFIED'
                  ? 'Cryptographically Verified'
                  : integrityStatus === 'TAMPERED'
                    ? 'Tamper Warning'
                    : 'Off-Chain Draft'}
              </span>
            </div>
            <div className="text-[11px] font-mono text-slate-500 break-all">
              {batch.creationTxHash ? (
                <span>
                  Tx: {batch.creationTxHash.substring(0, 10)}...{batch.creationTxHash.substring(batch.creationTxHash.length - 8)}
                </span>
              ) : (
                'Pending on-chain block mining'
              )}
            </div>
            <div className="text-[10px] text-slate-400 mt-1 break-all">
              EVM Smart Contract: {contractAddress || 'Contract address unavailable'}
            </div>
            <div className="text-[10px] text-slate-400 mt-1">
              Network: {chainId === 11155111 ? 'Ethereum Sepolia Testnet' : chainId === 31337 ? 'Hardhat Localhost' : `Chain ID ${chainId || 'Sepolia / Localhost'}`}
            </div>
          </div>
        </div>

        {/* Tamper Warning Banner if applicable */}
        {integrityStatus === 'TAMPERED' && (
          <div className="mt-6 p-4 bg-red-50 border-2 border-red-300 rounded-2xl text-red-800 text-xs">
            <div className="flex items-center gap-2 font-bold text-sm mb-1">
              <AlertTriangle className="w-5 h-5 text-red-600" />
              <span>Data Integrity Warning: Smart Contract Discrepancy Detected!</span>
            </div>
            <ul className="list-disc list-inside space-y-0.5 text-red-700">
              {integrityDiscrepancies?.map((d, i) => (
                <li key={i}>{d}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
      {/* Blockchain Proof Details */}
      <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 bg-emerald-100 text-emerald-700 rounded-xl flex items-center justify-center">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl font-black text-slate-900">
              Blockchain Proof Details
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Verifiable information recorded on the AgriChain blockchain
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

          {/* Network */}
          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              Network
            </span>
            <p className="mt-1 font-bold text-slate-900">
              {chainId === 11155111
                ? 'Ethereum Sepolia Testnet (Chain ID 11155111)'
                : chainId === 31337
                  ? 'Hardhat Localhost (Chain ID 31337)'
                  : `EVM Network (${chainId || 'Unavailable'})`}
            </p>
          </div>

          {/* Batch ID */}
          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              Blockchain Batch ID
            </span>
            <p className="mt-1 font-bold text-emerald-700 font-mono">
              #{batch.blockchainBatchId || 'Unavailable'}
            </p>
          </div>

          {/* Smart Contract */}
          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 sm:col-span-2">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              Smart Contract Address
            </span>
            <p className="mt-1 font-mono text-xs sm:text-sm text-slate-800 break-all">
              {contractAddress || 'Contract address unavailable'}
            </p>
          </div>

          {/* Farmer Wallet */}
          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              Farmer Wallet
            </span>
            <p className="mt-1 font-mono text-xs text-slate-800 break-all">
              {onChainData?.farmer || batch.farmerWallet || 'Not available'}
            </p>
          </div>

          {/* Current Owner */}
          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              Current Owner
            </span>
            <p className="mt-1 font-mono text-xs text-slate-800 break-all">
              {onChainData?.currentOwner || batch.currentOwnerWallet || 'Not available'}
            </p>
          </div>

          {/* Current Blockchain Price and Status */}
          <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-200">
            <span className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider">
              Current Blockchain Status
            </span>
            <p className="mt-1 font-bold text-slate-900">{chainStatus || 'Not available'}</p>
            <p className="text-xs text-slate-600 mt-1">
              Current price: {onChainData ? formatPrice(onChainData.currentPrice / 100) : 'Not available'} / {batch.unit}
            </p>
          </div>

          {/* Creation Transaction */}
          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 sm:col-span-2">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              Creation Transaction Hash
            </span>

            {batch.creationTxHash ? (
              <p className="mt-1 font-mono text-xs text-slate-800 break-all">
                {batch.creationTxHash}
              </p>
            ) : (
              <p className="mt-1 text-xs text-slate-500">
                Transaction hash unavailable
              </p>
            )}
          </div>

        </div>
      </div>
      {/* Produce Image & Quick Facts */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-1 bg-white p-4 rounded-3xl border border-slate-200 shadow-sm">
          {displayImage ? (
            <img
              src={displayImage}
              alt={batch.productName}
              className="w-full h-56 object-cover rounded-2xl shadow-inner"
            />
          ) : (
            <div className="w-full h-56 bg-emerald-50 rounded-2xl flex items-center justify-center text-emerald-700">
              <Sprout className="w-12 h-12" />
            </div>
          )}
          <div className="mt-4 p-3 bg-slate-50 rounded-xl text-xs space-y-1.5">
            <div className="flex justify-between text-slate-600">
              <span>Category:</span>
              <strong className="text-slate-800">{batch.category}</strong>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>Harvest Date:</span>
              <strong className="text-slate-800">
                {new Date(batch.harvestDate).toLocaleDateString()}
              </strong>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>Available Quantity:</span>
              <strong className="text-slate-800">{batch.quantity} {batch.unit}</strong>
            </div>
            <div className="mt-3 p-3 bg-emerald-50 rounded-xl text-xs space-y-1.5 border border-emerald-100">
              <div className="flex justify-between"><span>Registered:</span><strong>{quantity?.original ?? 'Not available'} {quantity?.unit || batch.unit}</strong></div>
              <div className="flex justify-between"><span>Sold/transferred:</span><strong>{quantity?.sold ?? 'Not available'} {quantity?.unit || batch.unit}</strong></div>
              <div className="flex justify-between"><span>Available:</span><strong>{quantity?.remaining ?? 'Not available'} {quantity?.unit || batch.unit}</strong></div>
            </div>
          </div>
        </div>

        <div className="md:col-span-2 bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div>
            <span className="text-xs font-bold text-emerald-700 uppercase tracking-wider">
              Application Metadata from MongoDB
            </span>
            <p className="mt-2 text-sm text-slate-700 leading-relaxed">
              {batch.description || 'Not available'}
            </p>
          </div>

          <div className="mt-6 pt-6 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 gap-3 text-center">
            {[
              ['Farmer price', pricing?.farmerPricePerUnit],
              ['Distributor purchase price', pricing?.distributorPurchasePricePerUnit],
              ['Distributor selling price', pricing?.distributorSellingPricePerUnit],
              ['Retailer purchase price', pricing?.retailerPurchasePricePerUnit],
              ['Retailer selling price', pricing?.retailerSellingPricePerUnit],
            ].map(([label, value]) => (
              <div key={label} className="p-3 bg-slate-50 rounded-xl">
                <span className="text-xs text-slate-600 font-semibold block">{label}</span>
                <span className="text-xl font-black text-slate-900">{formatPrice(value)}</span>
                <span className="text-[10px] text-slate-500 block">{currency} / {batch.unit}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Fair Pricing Transparency Breakdown */}
      <div className="bg-slate-900 text-white p-6 sm:p-8 rounded-3xl shadow-xl border border-slate-800">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-bold uppercase tracking-wider mb-2">
              <Sparkles className="w-3.5 h-3.5" />
              Verified transaction pricing
            </div>
            <h2 className="text-2xl font-black">Fair Value & Margin Transparency</h2>
            <p className="text-xs text-slate-400 mt-1">
              Prices are grouped by the actual purchase and selling events recorded for this batch.
            </p>
          </div>
          <div className="text-right">
            <span className="text-xs text-slate-400">Latest available selling price</span>
            <div className="text-3xl font-black text-emerald-400">{formatPrice(finalPrice)} <span className="text-sm text-slate-400">/ {batch.unit}</span></div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {[
            ['Farmer price', pricing?.farmerPricePerUnit],
            ['Distributor purchase', pricing?.distributorPurchasePricePerUnit],
            ['Distributor selling', pricing?.distributorSellingPricePerUnit],
            ['Retailer purchase', pricing?.retailerPurchasePricePerUnit],
            ['Retailer selling', pricing?.retailerSellingPricePerUnit],
          ].map(([label, value]) => (
            <div key={label} className="p-3.5 rounded-xl bg-slate-800/80 border border-slate-700">
              <span className="font-bold text-slate-300 block mb-1">{label}</span>
              <div className="text-lg font-black text-white">{formatPrice(value)}</div>
              <span className="text-xs text-slate-400">{currency} / {batch.unit}</span>
            </div>
          ))}
        </div>

        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div className="p-3.5 rounded-xl bg-slate-800/80 border border-blue-500/30">
            <span className="font-bold text-blue-400 block mb-1">Distributor margin</span>
            <div className="text-lg font-black text-white">{formatPrice(distributorMargin)} <span className="text-xs text-slate-400">/ {batch.unit}</span></div>
            <p className="text-slate-400 mt-1">Calculated only when both distributor purchase and selling prices exist.</p>
          </div>
          <div className="p-3.5 rounded-xl bg-slate-800/80 border border-purple-500/30">
            <span className="font-bold text-purple-400 block mb-1">Retailer margin</span>
            <div className="text-lg font-black text-white">{formatPrice(retailerMargin)} <span className="text-xs text-slate-400">/ {batch.unit}</span></div>
            <p className="text-slate-400 mt-1">Calculated only when both retailer purchase and selling prices exist.</p>
          </div>
        </div>
      </div>

      {/* Step-by-Step Chronological Blockchain Timeline */}
      <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 shadow-sm space-y-6">
        <div>
          <h2 className="text-xl font-black text-slate-900">
            Immutable Supply Chain Journey
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            MongoDB event details cross-checked against blockchain history when available
          </p>
        </div>

        <div className="relative pl-6 sm:pl-8 border-l-2 border-slate-200 space-y-8 ml-2">
          {batch.events && batch.events.map((event) => {
            let icon = Sprout;
            let iconBg = 'bg-emerald-100 text-emerald-700';

            if (event.eventType === 'TRANSFER_OF_CUSTODY') {
              if (event.actor?.role === 'DISTRIBUTOR') {
                icon = Truck;
                iconBg = 'bg-blue-100 text-blue-700';
              } else {
                icon = Store;
                iconBg = 'bg-purple-100 text-purple-700';
              }
            }

            const IconComponent = icon;

            return (
              <div key={event.id} className="relative group">
                {/* Timeline Dot */}
                <div
                  className={`absolute -left-[37px] sm:-left-[45px] top-0.5 w-8 h-8 rounded-full ${iconBg} flex items-center justify-center shadow-sm`}
                >
                  <IconComponent className="w-4 h-4" />
                </div>

                {/* Event Content */}
                <div className="bg-slate-50 p-4 sm:p-5 rounded-2xl border border-slate-200 hover:border-slate-300 transition space-y-2">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                    <div className="font-bold text-slate-900 text-sm">
                      {event.eventType === 'CREATION'
                        ? 'Produce Harvested & Registered by Farmer'
                        : event.eventType === 'PRICE_UPDATE'
                          ? `${event.actor?.role === 'RETAILER' ? 'Retailer' : 'Distributor'} Selling Price Updated`
                          : event.actor?.role === 'DISTRIBUTOR'
                            ? 'Custody Transferred to Distributor'
                            : event.actor?.role === 'RETAILER'
                              ? 'Custody Transferred to Retailer'
                              : 'Supply-Chain Event'}
                    </div>
                    <span className="text-xs text-slate-400 font-mono">
                      {new Date(event.timestamp).toLocaleString()}
                    </span>
                  </div>

                  <p className="text-xs text-slate-600 leading-relaxed">
                    {event.notes || 'Recorded and verified on-chain.'}
                  </p>

                  <div className="pt-2 flex flex-wrap items-center gap-4 text-xs">
                    <div className="text-slate-600">
                      Location: <strong className="text-slate-800">{event.location}</strong>
                    </div>

                    <div className="text-slate-600">
                      Unit Price: <strong className="text-emerald-700">{formatPrice(event.pricePerUnit)}</strong>
                    </div>

                    {event.quantity !== null && event.quantity !== undefined && (
                      <div className="text-slate-600">
                        Quantity: <strong className="text-slate-800">{event.quantity} {batch.unit}</strong>
                      </div>
                    )}

                    {event.temperatureC !== null && event.temperatureC !== undefined && (
                      <div className="flex items-center gap-1 text-slate-600">
                        <Thermometer className="w-3.5 h-3.5 text-blue-500" />
                        <span>{event.temperatureC}°C</span>
                      </div>
                    )}

                    {event.humidityPercent !== null && event.humidityPercent !== undefined && (
                      <div className="flex items-center gap-1 text-slate-600">
                        <Droplets className="w-3.5 h-3.5 text-blue-500" />
                        <span>{event.humidityPercent}%</span>
                      </div>
                    )}
                  </div>

                  {event.txHash && (
                    <div className="pt-2 border-t border-slate-200/60 flex items-center justify-between text-[11px] font-mono text-slate-500">
                      <span>Ethereum Tx: {event.txHash.substring(0, 14)}...</span>
                      <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Mined on EVM Block
                      </span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 shadow-sm space-y-5">
        <div>
          <h2 className="text-xl font-black text-slate-900">Verified Quantity History</h2>
          <p className="text-xs text-slate-500 mt-0.5">Quantities are read from blockchain custody records.</p>
        </div>
        {lineage?.parentBatchId && (
          <p className="text-sm text-slate-700">Parent lot: <strong className="font-mono">#{lineage.parentBatchId}</strong></p>
        )}
        <div className="space-y-3">
          {(quantityHistory || []).map((record) => (
            <div key={`${record.sequence}-${record.timestamp}`} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 bg-slate-50 rounded-xl border border-slate-200 text-sm">
              <span className="font-semibold text-slate-800">{record.from?.slice(0, 6)}...{record.from?.slice(-4)} → {record.to?.slice(0, 6)}...{record.to?.slice(-4)}</span>
              <span className="font-bold text-emerald-700">{record.quantity} {quantity?.unit || batch.unit}</span>
              <span className="text-xs text-slate-500">{new Date(record.timestamp * 1000).toLocaleString()}</span>
            </div>
          ))}
          {(!quantityHistory || quantityHistory.length === 0) && <p className="text-sm text-slate-500">Blockchain quantity history not available.</p>}
        </div>
      </div>
    </div>
  );
};
