import React from 'react';
import { Link } from 'react-router-dom';
import {
  Sprout,
  ShieldCheck,
  QrCode,
  ArrowRight,
  Truck,
  Store,
  CheckCircle2,
  Lock,
  Layers,
  Sparkles,
} from 'lucide-react';

export const LandingPage = () => {
  return (
    <div className="space-y-16 pb-20">
      {/* Hero Section */}
      <section className="relative overflow-hidden pt-12 pb-20 lg:pt-20 bg-gradient-to-b from-emerald-50/60 via-white to-slate-50 border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative z-10">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-100/80 text-emerald-800 text-xs font-semibold uppercase tracking-wider mb-6 border border-emerald-200">
            <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
            Hackathon MVP • Problem Statement #25045
          </div>

          <h1 className="text-4xl sm:text-6xl font-extrabold text-slate-900 tracking-tight max-w-4xl mx-auto leading-tight sm:leading-tight">
            Cryptographic Transparency from <br />
            <span className="text-emerald-600 underline decoration-emerald-300 decoration-wavy">
              Farm Seed to Consumer Table
            </span>
          </h1>

          <p className="mt-6 text-lg sm:text-xl text-slate-600 max-w-2xl mx-auto font-normal">
            Eliminating middleman exploitation, counterfeit produce, and opaque price inflation
            using Ethereum smart contracts, QR code provenance, and hybrid database architecture.
          </p>

          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <Link
              to="/verify/1"
              className="px-6 py-3.5 text-base font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-lg shadow-emerald-600/30 flex items-center gap-2 transition transform hover:-translate-y-0.5"
            >
              <QrCode className="w-5 h-5" />
              <span>Verify Demo Batch (Consumer View)</span>
            </Link>

            <Link
              to="/login"
              className="px-6 py-3.5 text-base font-bold text-slate-800 bg-white hover:bg-slate-100 border border-slate-300 rounded-xl shadow-sm flex items-center gap-2 transition"
            >
              <span>Explore Stakeholder Portals</span>
              <ArrowRight className="w-4 h-4 text-slate-500" />
            </Link>
          </div>

          {/* Quick Metrics */}
          <div className="mt-16 grid grid-cols-2 md:grid-cols-4 gap-4 max-w-4xl mx-auto">
            <div className="bg-white/80 p-4 rounded-xl border border-slate-200 shadow-sm text-center">
              <div className="text-2xl font-black text-emerald-600">100%</div>
              <div className="text-xs text-slate-500 font-medium mt-0.5">Immutable On-Chain Ledger</div>
            </div>
            <div className="bg-white/80 p-4 rounded-xl border border-slate-200 shadow-sm text-center">
              <div className="text-2xl font-black text-slate-800">Zero-Gas</div>
              <div className="text-xs text-slate-500 font-medium mt-0.5">Consumer QR Verification</div>
            </div>
            <div className="bg-white/80 p-4 rounded-xl border border-slate-200 shadow-sm text-center">
              <div className="text-2xl font-black text-emerald-600">Real-Time</div>
              <div className="text-xs text-slate-500 font-medium mt-0.5">Middleman Price Tracking</div>
            </div>
            <div className="bg-white/80 p-4 rounded-xl border border-slate-200 shadow-sm text-center">
              <div className="text-2xl font-black text-slate-800">EVM Compatible</div>
              <div className="text-xs text-slate-500 font-medium mt-0.5">Solidity + Hardhat Node</div>
            </div>
          </div>
        </div>
      </section>

      {/* The 4-Step Supply Chain Lifecycle */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h2 className="text-xs font-bold uppercase tracking-widest text-emerald-600">
            End-To-End Architecture
          </h2>
          <p className="mt-2 text-3xl font-extrabold text-slate-900">
            How AgriChain Enforces Fair Value & Provenance
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {/* Step 1 */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:border-emerald-500 transition group">
            <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold text-lg mb-4 group-hover:bg-emerald-600 group-hover:text-white transition">
              <Sprout className="w-6 h-6" />
            </div>
            <span className="text-xs font-bold text-emerald-600 uppercase tracking-wider">Step 01</span>
            <h3 className="text-lg font-bold text-slate-900 mt-1 mb-2">Farmer Harvest</h3>
            <p className="text-sm text-slate-600 leading-relaxed">
              Farmer logs crop specs, harvest location, initial price (₹200/kg), and signs the batch creation transaction via MetaMask.
            </p>
          </div>

          {/* Step 2 */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:border-blue-500 transition group">
            <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-lg mb-4 group-hover:bg-blue-600 group-hover:text-white transition">
              <Truck className="w-6 h-6" />
            </div>
            <span className="text-xs font-bold text-blue-600 uppercase tracking-wider">Step 02</span>
            <h3 className="text-lg font-bold text-slate-900 mt-1 mb-2">Distributor Transit</h3>
            <p className="text-sm text-slate-600 leading-relaxed">
              Distributor scans crate QR, accepts custody, logs cold storage temperatures, and commits new transit pricing (₹280/kg) on-chain.
            </p>
          </div>

          {/* Step 3 */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:border-purple-500 transition group">
            <div className="w-12 h-12 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center font-bold text-lg mb-4 group-hover:bg-purple-600 group-hover:text-white transition">
              <Store className="w-6 h-6" />
            </div>
            <span className="text-xs font-bold text-purple-600 uppercase tracking-wider">Step 03</span>
            <h3 className="text-lg font-bold text-slate-900 mt-1 mb-2">Retailer Stocking</h3>
            <p className="text-sm text-slate-600 leading-relaxed">
              Retailer verifies produce authenticity, stocks the goods, logs shelf pricing (₹450/kg), and prints consumer-facing shelf QR codes.
            </p>
          </div>

          {/* Step 4 */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:border-amber-500 transition group">
            <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold text-lg mb-4 group-hover:bg-amber-600 group-hover:text-white transition">
              <QrCode className="w-6 h-6" />
            </div>
            <span className="text-xs font-bold text-amber-600 uppercase tracking-wider">Step 04</span>
            <h3 className="text-lg font-bold text-slate-900 mt-1 mb-2">Consumer Scan</h3>
            <p className="text-sm text-slate-600 leading-relaxed">
              Consumer scans with standard smartphone camera. No wallet needed. Verifies complete lifecycle, middleman cuts, and blockchain integrity.
            </p>
          </div>
        </div>
      </section>

      {/* On-Chain vs Off-Chain Architectural Design Highlight */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-slate-900 text-white rounded-3xl p-8 lg:p-12 shadow-xl border border-slate-800">
          <div className="max-w-3xl mb-8">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-bold uppercase tracking-wider mb-4">
              <Layers className="w-3.5 h-3.5" />
              Judges Evaluation Architecture
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold">
              Pragmatic Hybrid Architecture: Why We Don't Store Everything On-Chain
            </h2>
            <p className="mt-3 text-slate-400 text-sm leading-relaxed">
              Blockchains are slow and expensive for high-velocity media and profile operations. AgriChain anchors
              only tamper-critical attributes on Ethereum while leveraging an off-chain database for speed and rich analytics.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="bg-slate-800/80 rounded-2xl p-6 border border-emerald-500/30">
              <div className="flex items-center gap-2 text-emerald-400 font-bold mb-4">
                <Lock className="w-5 h-5" />
                <span>On-Chain (Solidity Smart Contract)</span>
              </div>
              <ul className="space-y-2.5 text-sm text-slate-300">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Unique Batch ID & Cryptographic Farmer Wallet</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Immutable Ownership & Custody Handover Log</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Quality Grade & Verified Origin City</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Historical Price Changes & Timestamps</span>
                </li>
              </ul>
            </div>

            <div className="bg-slate-800/80 rounded-2xl p-6 border border-slate-700">
              <div className="flex items-center gap-2 text-blue-400 font-bold mb-4">
                <Layers className="w-5 h-5" />
                <span>Off-Chain (Database + Fast Cache)</span>
              </div>
              <ul className="space-y-2.5 text-sm text-slate-300">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-blue-400 shrink-0" />
                  <span>User Authentication & Bcrypt Password Hashes</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-blue-400 shrink-0" />
                  <span>High-resolution produce images & farm photos</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-blue-400 shrink-0" />
                  <span>Consumer QR scan telemetry & geolocation logs</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-blue-400 shrink-0" />
                  <span>Admin aggregations & middleman spread analytics</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Stakeholder Demo Portals */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-10">
          <h2 className="text-2xl font-extrabold text-slate-900">
            Interactive Stakeholder Test Environments
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Pre-configured demo credentials available on the login page for instantaneous evaluation.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <Link
            to="/login"
            className="p-6 bg-white rounded-2xl border border-slate-200 hover:border-emerald-500 hover:shadow-md transition text-left"
          >
            <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl w-fit mb-4">
              <Sprout className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-slate-900">Farmer Portal</h3>
            <p className="text-xs text-slate-500 mt-1">
              Create batches, register on-chain, export QR codes.
            </p>
          </Link>

          <Link
            to="/login"
            className="p-6 bg-white rounded-2xl border border-slate-200 hover:border-blue-500 hover:shadow-md transition text-left"
          >
            <div className="p-3 bg-blue-50 text-blue-600 rounded-xl w-fit mb-4">
              <Truck className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-slate-900">Distributor Portal</h3>
            <p className="text-xs text-slate-500 mt-1">
              Scan inbound crates, log cold-chain, set logistics price.
            </p>
          </Link>

          <Link
            to="/login"
            className="p-6 bg-white rounded-2xl border border-slate-200 hover:border-purple-500 hover:shadow-md transition text-left"
          >
            <div className="p-3 bg-purple-50 text-purple-600 rounded-xl w-fit mb-4">
              <Store className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-slate-900">Retailer Portal</h3>
            <p className="text-xs text-slate-500 mt-1">
              Verify custody, record shelf retail price, print tags.
            </p>
          </Link>

          <Link
            to="/login"
            className="p-6 bg-white rounded-2xl border border-slate-200 hover:border-slate-500 hover:shadow-md transition text-left"
          >
            <div className="p-3 bg-slate-100 text-slate-700 rounded-xl w-fit mb-4">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-slate-900">Admin Governance</h3>
            <p className="text-xs text-slate-500 mt-1">
              System throughput, price inflation spread, KYC approvals.
            </p>
          </Link>
        </div>
      </section>
    </div>
  );
};
