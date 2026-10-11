import React, { useState, useEffect } from 'react';
import { apiRequest } from '../config/api';
import {
  ShieldCheck,
  TrendingUp,
  Users,
  ArrowUpRight,
} from 'lucide-react';

export const AdminDashboard = () => {
  const [stats, setStats] = useState(null);
  const [spreads, setSpreads] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAdminData();
  }, []);

  const loadAdminData = async () => {
    try {
      setLoading(true);
      const [statsData, spreadsData] = await Promise.all([
        apiRequest('/admin/stats'),
        apiRequest('/admin/price-spread'),
      ]);
      setStats(statsData);
      setSpreads(spreadsData.spreads || []);
    } catch (err) {
      console.error('Failed to load admin analytics:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-slate-900 text-white">
              <ShieldCheck className="w-6 h-6" />
            </span>
            <h1 className="text-2xl sm:text-3xl font-black text-slate-900">
              National Agricultural Registry & Governance
            </h1>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Real-time supply chain transparency, middleman margin audit, and stakeholder oversight
          </p>
        </div>
      </div>

      {/* KPI Cards */}
      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
            <div className="text-xs font-bold text-slate-400 uppercase">Total Stakeholders</div>
            <div className="text-3xl font-black text-slate-900 mt-1">{stats.totalUsers}</div>
            <div className="text-xs text-slate-500 font-medium mt-1">Across all supply chain tiers</div>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
            <div className="text-xs font-bold text-slate-400 uppercase">Published Batches</div>
            <div className="text-3xl font-black text-emerald-600 mt-1">{stats.totalBatches}</div>
            <div className="text-xs text-emerald-700 font-medium mt-1">
              {stats.onChainBatches} anchored on-chain
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
            <div className="text-xs font-bold text-slate-400 uppercase">Custody Transitions</div>
            <div className="text-3xl font-black text-blue-600 mt-1">{stats.totalEvents}</div>
            <div className="text-xs text-slate-500 font-medium mt-1">Verified handovers logged</div>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
            <div className="text-xs font-bold text-slate-400 uppercase">Consumer QR Scans</div>
            <div className="text-3xl font-black text-purple-600 mt-1">{stats.totalScans}</div>
            <div className="text-xs text-slate-500 font-medium mt-1">Active consumer verifications</div>
          </div>
        </div>
      )}

      {/* Price Hike / Middleman Margin Auditor */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-emerald-600" />
              <span>Middleman Price Inflation & Fair Value Auditor</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Auditing the exact price markup from farm gate to consumer retail shelf
            </p>
          </div>
        </div>

        {loading ? (
          <div className="p-12 text-center text-slate-400 text-sm">Analyzing supply chain data...</div>
        ) : spreads.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-sm">No price spread data recorded yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-600">
              <thead className="bg-slate-50 text-xs uppercase font-semibold text-slate-500 border-b border-slate-100">
                <tr>
                  <th className="px-6 py-4">Batch</th>
                  <th className="px-6 py-4">Crop & Origin</th>
                  <th className="px-6 py-4">Farmer Received</th>
                  <th className="px-6 py-4">Consumer Paid</th>
                  <th className="px-6 py-4">Cumulative Markup</th>
                  <th className="px-6 py-4">Intermediary Hops</th>
                  <th className="px-6 py-4 text-right">Verification</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {spreads.map((item) => (
                  <tr key={item.batchId} className="hover:bg-slate-50/80 transition">
                    <td className="px-6 py-4 font-mono font-bold text-slate-900">
                      #{item.blockchainBatchId || 'Draft'}
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-semibold text-slate-900">{item.productName}</div>
                      <div className="text-xs text-slate-400">{item.origin}</div>
                    </td>
                    <td className="px-6 py-4 font-bold text-emerald-700">
                      ₹{item.farmerPrice.toFixed(2)}
                    </td>
                    <td className="px-6 py-4 font-bold text-slate-900">
                      ₹{item.retailPrice.toFixed(2)}
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold ${
                          item.markupPercentage > 100
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-emerald-100 text-emerald-800'
                        }`}
                      >
                        +{item.markupPercentage}% Markup
                      </span>
                    </td>
                    <td className="px-6 py-4 font-medium text-slate-600">
                      {item.hopsCount} transitions
                    </td>
                    <td className="px-6 py-4 text-right">
                      <a
                        href={`/verify/${item.blockchainBatchId || item.batchId}`}
                        target="_blank"
                        rel="noreferrer"
                        className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold rounded-lg inline-flex items-center gap-1 transition"
                      >
                        <span>Audit Journey</span>
                        <ArrowUpRight className="w-3.5 h-3.5" />
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Stakeholder Breakdown Card */}
      {stats?.usersByRole && (
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <h3 className="font-bold text-slate-900 mb-4 flex items-center gap-2">
            <Users className="w-5 h-5 text-slate-700" />
            <span>Registered Stakeholders Distribution</span>
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
            {stats.usersByRole.map((roleGroup) => (
              <div key={roleGroup.role} className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-center">
                <div className="text-2xl font-black text-slate-800">{roleGroup._count.id}</div>
                <div className="text-xs font-bold text-slate-500 uppercase mt-1">{roleGroup.role}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
