import React, { useEffect, useState } from 'react';
import {
  Wallet,
  CheckCircle2,
  AlertTriangle,
  ShieldCheck,
  X,
  Loader2,
  ArrowRight,
  RefreshCw,
} from 'lucide-react';

import { useAuth } from '../context/AuthContext';
import { useWeb3 } from '../context/Web3Context';


const shortenAddress = (address) => {
  if (!address) return '';
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
};

const normalizeAddress = (address) => {
  return address ? address.toLowerCase() : '';
};

const WalletBindingBanner = () => {
  const { user, updateUserWallet } = useAuth();
  const {
    account,
    connectWallet,
    isConnecting,
  } = useWeb3();

  const [walletStatus, setWalletStatus] = useState('LOADING');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState('');

  const registeredWallet = user?.walletAddress || null;
  const connectedWallet = account || null;

  const loadWalletStatus = async () => {
    try {
      if (!user) {
        setWalletStatus('UNLINKED');
        return;
      }

      if (!registeredWallet) {
        setWalletStatus('UNLINKED');
        return;
      }

      if (!connectedWallet) {
        setWalletStatus('NO_WALLET');
        return;
      }

      if (
        normalizeAddress(registeredWallet) ===
        normalizeAddress(connectedWallet)
      ) {
        setWalletStatus('VERIFIED');
      } else {
        setWalletStatus('MISMATCH');
      }
    } catch (err) {
      console.error('Wallet status error:', err);
      setWalletStatus('UNLINKED');
    }
  };

  useEffect(() => {
    loadWalletStatus();
  }, [user, account]);

  const handleConnectWallet = async () => {
    setError('');

    try {
      await connectWallet();
    } catch (err) {
      console.error('Connect wallet error:', err);
      setError(err?.message || 'Failed to connect MetaMask.');
    }
  };

  const handleConfirmLink = async () => {
    if (!connectedWallet) {
      setError('Please connect a MetaMask wallet first.');
      return;
    }

    setError('');
    setIsUpdating(true);

    try {
      await updateUserWallet(connectedWallet);

      setWalletStatus('VERIFIED');
      setIsModalOpen(false);

      // Refresh status after successful wallet update.
      await loadWalletStatus();
    } catch (err) {
      console.error('Wallet binding error:', err);

      setError(
        err?.response?.data?.error ||
          err?.message ||
          'Failed to update wallet.'
      );
    } finally {
      setIsUpdating(false);
    }
  };

  /*
   * No logged-in user.
   */
  if (!user) {
    return null;
  }

  /*
   * Loading state.
   */
  if (walletStatus === 'LOADING') {
    return (
      <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-3 text-slate-600">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">Checking wallet connection...</span>
        </div>
      </div>
    );
  }

  /*
   * No wallet registered yet.
   */
  if (walletStatus === 'UNLINKED') {
    return (
      <>
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
          <div className="flex items-start gap-3">
            <Wallet className="mt-0.5 h-5 w-5 text-amber-600" />

            <div className="flex-1">
              <h3 className="font-semibold text-amber-900">
                Wallet Not Linked
              </h3>

              <p className="mt-1 text-sm text-amber-800">
                Connect your MetaMask wallet to enable blockchain
                transactions for your account.
              </p>

              <button
                type="button"
                onClick={() => {
                  setError('');
                  setIsModalOpen(true);
                }}
                className="mt-3 inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-amber-700"
              >
                <Wallet className="h-4 w-4" />
                Bind Wallet
              </button>

              {error && (
                <p className="mt-2 text-sm text-red-600">
                  {error}
                </p>
              )}
            </div>
          </div>
        </div>

        {isModalOpen && (
          <WalletModal
            title="Bind Wallet to Profile"
            description="Your connected MetaMask wallet will be linked to this account and used for blockchain transactions."
            connectedWallet={connectedWallet}
            registeredWallet={null}
            isUpdating={isUpdating}
            error={error}
            onClose={() => {
              if (!isUpdating) {
                setIsModalOpen(false);
                setError('');
              }
            }}
            onConnect={handleConnectWallet}
            onConfirm={handleConfirmLink}
            isFirstBinding
          />
        )}
      </>
    );
  }

  /*
   * User has registered wallet but MetaMask is not connected.
   */
  if (walletStatus === 'NO_WALLET') {
    return (
      <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50 p-4 shadow-sm">
        <div className="flex items-start gap-3">
          <Wallet className="mt-0.5 h-5 w-5 text-blue-600" />

          <div className="flex-1">
            <h3 className="font-semibold text-blue-900">
              Connect Your Registered Wallet
            </h3>

            <p className="mt-1 text-sm text-blue-800">
              Your account already has a registered blockchain wallet.
              Connect MetaMask to continue.
            </p>

            <p className="mt-2 text-xs text-blue-700">
              Registered wallet:{' '}
              <span className="font-mono font-medium">
                {shortenAddress(registeredWallet)}
              </span>
            </p>

            <button
              type="button"
              onClick={handleConnectWallet}
              disabled={isConnecting}
              className="mt-3 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isConnecting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Wallet className="h-4 w-4" />
              )}

              {isConnecting ? 'Connecting...' : 'Connect MetaMask'}
            </button>

            {error && (
              <p className="mt-2 text-sm text-red-600">
                {error}
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  /*
   * Wallet matches registered wallet.
   */
  if (walletStatus === 'VERIFIED') {
    return (
      <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-600" />

          <div className="flex-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="font-semibold text-emerald-900">
                  Wallet Verified
                </h3>

                <p className="mt-1 text-sm text-emerald-800">
                  Blockchain transactions are enabled for this account.
                </p>
              </div>

              <ShieldCheck className="h-6 w-6 text-emerald-600" />
            </div>

            <div className="mt-3 rounded-lg border border-emerald-200 bg-white/70 p-3">
              <p className="text-xs text-slate-500">
                Connected Wallet
              </p>

              <p className="mt-1 break-all font-mono text-sm font-medium text-slate-800">
                {connectedWallet}
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /*
   * MetaMask wallet is different from the wallet registered
   * in the user's account.
   */
  if (walletStatus === 'MISMATCH') {
    return (
      <>
        <div className="mb-4 rounded-xl border border-orange-200 bg-orange-50 p-4 shadow-sm">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 text-orange-600" />

            <div className="flex-1">
              <h3 className="font-semibold text-orange-900">
                Different Wallet Connected
              </h3>

              <p className="mt-1 text-sm text-orange-800">
                The currently connected MetaMask wallet is different
                from the wallet registered with this account.
              </p>

              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <div className="rounded-lg border border-orange-200 bg-white p-3">
                  <p className="text-xs text-slate-500">
                    Connected Wallet
                  </p>

                  <p className="mt-1 break-all font-mono text-sm font-medium text-slate-800">
                    {connectedWallet}
                  </p>
                </div>

                <div className="rounded-lg border border-orange-200 bg-white p-3">
                  <p className="text-xs text-slate-500">
                    Registered Wallet
                  </p>

                  <p className="mt-1 break-all font-mono text-sm font-medium text-slate-800">
                    {registeredWallet}
                  </p>
                </div>
              </div>

              <div className="mt-3 rounded-lg bg-orange-100 p-3">
                <p className="text-sm text-orange-900">
                  Blockchain actions are currently locked because the
                  connected wallet does not match your registered wallet.
                </p>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setError('');
                    setIsModalOpen(true);
                  }}
                  className="inline-flex items-center gap-2 rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-orange-700"
                >
                  <Wallet className="h-4 w-4" />
                  Use This Wallet
                  <ArrowRight className="h-4 w-4" />
                </button>

                <button
                  type="button"
                  onClick={loadWalletStatus}
                  className="inline-flex items-center gap-2 rounded-lg border border-orange-300 bg-white px-4 py-2 text-sm font-medium text-orange-800 transition hover:bg-orange-50"
                >
                  <RefreshCw className="h-4 w-4" />
                  Refresh
                </button>
              </div>

              {error && (
                <p className="mt-3 text-sm font-medium text-red-600">
                  {error}
                </p>
              )}
            </div>
          </div>
        </div>

        {isModalOpen && (
          <WalletModal
            title="Change Registered Wallet?"
            description="This will replace the wallet currently registered with your account. Future blockchain transactions will use the newly connected wallet."
            connectedWallet={connectedWallet}
            registeredWallet={registeredWallet}
            isUpdating={isUpdating}
            error={error}
            onClose={() => {
              if (!isUpdating) {
                setIsModalOpen(false);
                setError('');
              }
            }}
            onConnect={handleConnectWallet}
            onConfirm={handleConfirmLink}
          />
        )}
      </>
    );
  }

  return null;
};

const WalletModal = ({
  title,
  description,
  connectedWallet,
  registeredWallet,
  isUpdating,
  error,
  onClose,
  onConnect,
  onConfirm,
  isFirstBinding = false,
}) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 p-5">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              {title}
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              Wallet binding confirmation
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={isUpdating}
            className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 p-5">
          <p className="text-sm leading-6 text-slate-600">
            {description}
          </p>

          {registeredWallet && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Current Registered Wallet
              </p>

              <p className="mt-2 break-all font-mono text-sm text-slate-800">
                {registeredWallet}
              </p>
            </div>
          )}

          {connectedWallet ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-600" />

                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-emerald-700">
                    Wallet You Are About To Use
                  </p>

                  <p className="mt-2 break-all font-mono text-sm font-medium text-emerald-900">
                    {connectedWallet}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
              <p className="text-sm text-amber-800">
                No MetaMask wallet is currently connected.
              </p>

              <button
                type="button"
                onClick={onConnect}
                disabled={isUpdating}
                className="mt-3 inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-amber-700 disabled:opacity-50"
              >
                <Wallet className="h-4 w-4" />
                Connect MetaMask
              </button>
            </div>
          )}

          {isFirstBinding && (
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
              <p className="text-sm text-blue-800">
                Once linked, this wallet will be used for your blockchain
                transactions.
              </p>
            </div>
          )}

          {!isFirstBinding && registeredWallet && connectedWallet && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4">
              <p className="text-sm font-medium text-red-800">
                Important
              </p>

              <p className="mt-1 text-sm leading-5 text-red-700">
                Your previous blockchain transactions will remain associated
                with the old wallet. Only future transactions will use this
                new wallet.
              </p>
            </div>
          )}

          {error && (
            <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 border-t border-slate-200 p-5">
          <button
            type="button"
            onClick={onClose}
            disabled={isUpdating}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={onConfirm}
            disabled={!connectedWallet || isUpdating}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isUpdating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Updating...
              </>
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4" />
                {isFirstBinding ? 'Confirm Wallet' : 'Confirm Change'}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export { WalletBindingBanner };