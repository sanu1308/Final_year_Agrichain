import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useWeb3 } from '../context/Web3Context';
import { QRScannerModal } from './QRScannerModal';
import {
  Sprout,
  QrCode,
  Wallet,
  LogOut,
  Menu,
  X,
} from 'lucide-react';

export const Navbar = () => {
  const { user, logout, updateUserWallet } = useAuth();
  const { account, connectWallet, isConnecting } = useWeb3();
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const navigate = useNavigate();

  const handleWalletConnect = async () => {
    await connectWallet();
  };

  const getDashboardPath = () => {
    if (!user) return '/login';
    switch (user.role) {
      case 'FARMER':
        return '/farmer';
      case 'DISTRIBUTOR':
        return '/distributor';
      case 'RETAILER':
        return '/retailer';
      case 'ADMIN':
        return '/admin';
      default:
        return '/verify/1';
    }
  };

  return (
    <>
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          {/* Brand Logo */}
          <Link to="/" className="flex items-center gap-2 group">
            <div className="w-10 h-10 rounded-xl bg-emerald-600 flex items-center justify-center text-white shadow-md shadow-emerald-600/20 group-hover:scale-105 transition">
              <Sprout className="w-6 h-6" />
            </div>
            <div>
              <span className="text-xl font-extrabold tracking-tight text-slate-900">
                Agri<span className="text-emerald-600">Chain</span>
              </span>
              <span className="hidden sm:inline-block ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 uppercase tracking-wider">
                Web3 MVP
              </span>
            </div>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center space-x-1 lg:space-x-4">
            <Link
              to="/"
              className="px-3 py-2 text-sm font-medium text-slate-600 hover:text-emerald-700 transition"
            >
              Overview
            </Link>
            <Link
              to="/verify/1"
              className="px-3 py-2 text-sm font-medium text-slate-600 hover:text-emerald-700 transition"
            >
              Demo Batch #1
            </Link>

            {user && (
              <Link
                to={getDashboardPath()}
                className="px-3 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 rounded-lg transition"
              >
                {user.role} Dashboard
              </Link>
            )}
          </nav>

          {/* Action Buttons */}
          <div className="hidden md:flex items-center space-x-3">
            {/* Scan QR Button */}
            <button
              onClick={() => setIsScannerOpen(true)}
              className="px-3 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg flex items-center gap-1.5 transition"
            >
              <QrCode className="w-4 h-4 text-slate-600" />
              <span>Scan QR</span>
            </button>

            {/* Wallet Button */}
            {account ? (
              (() => {
                const isBlockchainRole = user && ['FARMER', 'DISTRIBUTOR', 'RETAILER'].includes(user.role);
                const isVerified = isBlockchainRole && user?.walletAddress && user.walletAddress.toLowerCase() === account.toLowerCase();
                const isMismatch = isBlockchainRole && user?.walletAddress && user.walletAddress.toLowerCase() !== account.toLowerCase();
                const isUnlinked = isBlockchainRole && !user?.walletAddress;

                let badgeClass = "bg-emerald-50 border-emerald-200 text-emerald-800";
                let dotClass = "bg-emerald-500";
                let label = `${account.substring(0, 6)}...${account.substring(account.length - 4)}`;

                if (isVerified) {
                  badgeClass = "bg-emerald-50 border-emerald-300 text-emerald-800";
                  dotClass = "bg-emerald-600";
                  label = `✓ ${account.substring(0, 6)}...${account.substring(account.length - 4)}`;
                } else if (isMismatch) {
                  badgeClass = "bg-amber-50 border-amber-300 text-amber-800";
                  dotClass = "bg-amber-500";
                  label = `⚠ ${account.substring(0, 6)}...${account.substring(account.length - 4)}`;
                } else if (isUnlinked) {
                  badgeClass = "bg-blue-50 border-blue-200 text-blue-800";
                  dotClass = "bg-blue-500";
                  label = `${account.substring(0, 6)}... (Unlinked)`;
                }

                return (
                  <div
                    title={
                      isMismatch
                        ? `Connected wallet does not match registered wallet (${user.walletAddress})`
                        : isVerified
                        ? 'Wallet verified for blockchain transactions'
                        : isUnlinked
                        ? 'Wallet connected but not bound to account'
                        : 'Connected MetaMask Account'
                    }
                    className={`flex items-center gap-1.5 px-3 py-2 border rounded-lg text-xs font-mono ${badgeClass}`}
                  >
                    <div className={`w-2 h-2 rounded-full ${dotClass} animate-pulse`} />
                    <span>{label}</span>
                  </div>
                );
              })()
            ) : (
              <button
                onClick={handleWalletConnect}
                disabled={isConnecting}
                className="px-3.5 py-2 text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg flex items-center gap-2 transition shadow-sm"
              >
                <Wallet className="w-4 h-4" />
                <span>{isConnecting ? 'Connecting...' : 'Connect MetaMask'}</span>
              </button>
            )}

            {/* User Profile / Auth */}
            {user ? (
              <div className="flex items-center gap-2 pl-2 border-l border-slate-200">
                <div className="text-right">
                  <div className="text-xs font-bold text-slate-800 leading-tight">
                    {user.name.split(' ')[0]}
                  </div>
                  <div className="text-[10px] text-emerald-600 font-semibold uppercase">
                    {user.role}
                  </div>
                </div>
                <button
                  onClick={() => {
                    logout();
                    navigate('/login');
                  }}
                  title="Log out"
                  className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="flex items-center space-x-2 pl-2 border-l border-slate-200">
                <Link
                  to="/login"
                  className="px-3 py-2 text-sm font-semibold text-slate-700 hover:text-emerald-700 transition"
                >
                  Log In
                </Link>
                <Link
                  to="/register"
                  className="px-4 py-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition shadow-sm shadow-emerald-600/20"
                >
                  Register
                </Link>
              </div>
            )}
          </div>

          {/* Mobile Menu Toggle */}
          <div className="md:hidden flex items-center gap-2">
            <button
              onClick={() => setIsScannerOpen(true)}
              className="p-2 text-slate-700 bg-slate-100 rounded-lg"
            >
              <QrCode className="w-5 h-5" />
            </button>
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 text-slate-700 hover:bg-slate-100 rounded-lg"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>

        {/* Mobile Dropdown */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-slate-200 bg-white px-4 pt-3 pb-6 space-y-3">
            <Link
              to="/"
              onClick={() => setMobileMenuOpen(false)}
              className="block py-2 text-sm font-medium text-slate-700"
            >
              Overview
            </Link>
            <Link
              to="/verify/1"
              onClick={() => setMobileMenuOpen(false)}
              className="block py-2 text-sm font-medium text-slate-700"
            >
              Demo Batch #1 Traceability
            </Link>
            {user ? (
              <>
                <Link
                  to={getDashboardPath()}
                  onClick={() => setMobileMenuOpen(false)}
                  className="block py-2 text-sm font-bold text-emerald-700"
                >
                  {user.role} Dashboard
                </Link>
                <button
                  onClick={() => {
                    logout();
                    setMobileMenuOpen(false);
                    navigate('/login');
                  }}
                  className="w-full text-left py-2 text-sm text-red-600 font-medium"
                >
                  Log Out
                </button>
              </>
            ) : (
              <div className="pt-2 flex flex-col gap-2">
                <Link
                  to="/login"
                  onClick={() => setMobileMenuOpen(false)}
                  className="w-full py-2 text-center text-sm font-medium border border-slate-300 rounded-lg"
                >
                  Log In
                </Link>
                <Link
                  to="/register"
                  onClick={() => setMobileMenuOpen(false)}
                  className="w-full py-2 text-center text-sm font-medium bg-emerald-600 text-white rounded-lg"
                >
                  Register
                </Link>
              </div>
            )}
          </div>
        )}
      </header>

      {/* Global QR Scanner Modal */}
      <QRScannerModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
      />
    </>
  );
};
