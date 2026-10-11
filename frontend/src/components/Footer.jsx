import React from 'react';
import { Sprout, ShieldCheck } from 'lucide-react';

export const Footer = () => {
  return (
    <footer className="bg-slate-900 text-slate-400 py-12 border-t border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
          <div className="md:col-span-2">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-lg bg-emerald-600 flex items-center justify-center text-white">
                <Sprout className="w-5 h-5" />
              </div>
              <span className="text-lg font-bold text-white tracking-tight">
                Agri<span className="text-emerald-500">Chain</span>
              </span>
            </div>
            <p className="text-sm text-slate-400 max-w-sm mb-4">
              Problem Statement ID: 25045. A decentralized blockchain supply chain platform 
              guaranteeing fair pricing for farmers, provenance verification, and full transparency for consumers.
            </p>
            <div className="flex items-center gap-2 text-xs text-emerald-400 font-mono">
              <ShieldCheck className="w-4 h-4" />
              <span>Hybrid Architecture: Ethereum EVM + Database</span>
            </div>
          </div>

          <div>
            <h4 className="text-xs font-semibold text-white uppercase tracking-wider mb-3">
              Stakeholder Portals
            </h4>
            <ul className="space-y-2 text-sm">
              <li><a href="/login" className="hover:text-emerald-400 transition">Farmer Harvest Registry</a></li>
              <li><a href="/login" className="hover:text-emerald-400 transition">Distributor Cold Chain</a></li>
              <li><a href="/login" className="hover:text-emerald-400 transition">Retailer Inventory</a></li>
              <li><a href="/verify/1" className="hover:text-emerald-400 transition">Consumer Verification</a></li>
            </ul>
          </div>

          <div>
            <h4 className="text-xs font-semibold text-white uppercase tracking-wider mb-3">
              Hackathon Project
            </h4>
            <ul className="space-y-2 text-sm">
              <li className="text-slate-400">Title: Blockchain-Based Supply Chain Transparency</li>
              <li className="text-slate-400">Solidity, Hardhat, Ethers.js</li>
              <li className="text-slate-400">Node.js, Express, JavaScript</li>
              <li className="text-slate-400">React, Vite, Tailwind CSS</li>
            </ul>
          </div>
        </div>

        <div className="pt-8 border-t border-slate-800 text-xs flex flex-col sm:flex-row items-center justify-between text-slate-500 gap-4">
          <p>© {new Date().getFullYear()} AgriChain. All rights reserved. Hackathon MVP Submission.</p>
          <p className="font-mono text-slate-400">Smart Contract: Deployed & Verified</p>
        </div>
      </div>
    </footer>
  );
};
