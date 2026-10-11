import React, { useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Sprout, Truck, Store, ShieldCheck, Lock, Mail, ArrowRight, Sparkles } from 'lucide-react';

const ROLE_CONFIGS = {
  FARMER: {
    key: 'FARMER',
    label: 'Farmer',
    title: 'Farmer Login',
    subtitle: 'Manage crop harvests, mint batch provenance tokens, and export QR tags.',
    icon: Sprout,
    defaultEmail: 'farmer@agrichain.com',
    theme: {
      accentText: 'text-emerald-600',
      iconBg: 'bg-emerald-600',
      iconShadow: 'shadow-emerald-600/20',
      badgeBg: 'bg-emerald-100 text-emerald-800 border-emerald-200',
      buttonBg: 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/20',
      activeTab: 'bg-emerald-600 text-white border-emerald-600 shadow-md shadow-emerald-600/20 font-bold',
      inactiveTab: 'bg-white hover:bg-emerald-50 text-emerald-900 border-emerald-200',
      focusRing: 'focus:ring-emerald-500',
    },
  },
  DISTRIBUTOR: {
    key: 'DISTRIBUTOR',
    label: 'Distributor',
    title: 'Distributor Login',
    subtitle: 'Scan inbound crates, record cold-chain telemetry, and manage wholesale logistics.',
    icon: Truck,
    defaultEmail: 'distributor@agrichain.com',
    theme: {
      accentText: 'text-blue-600',
      iconBg: 'bg-blue-600',
      iconShadow: 'shadow-blue-600/20',
      badgeBg: 'bg-blue-100 text-blue-800 border-blue-200',
      buttonBg: 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-600/20',
      activeTab: 'bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-600/20 font-bold',
      inactiveTab: 'bg-white hover:bg-blue-50 text-blue-900 border-blue-200',
      focusRing: 'focus:ring-blue-500',
    },
  },
  RETAILER: {
    key: 'RETAILER',
    label: 'Retailer',
    title: 'Retailer Login',
    subtitle: 'Verify batch authenticity, record shelf retail pricing, and inspect batch custody.',
    icon: Store,
    defaultEmail: 'retailer@agrichain.com',
    theme: {
      accentText: 'text-purple-600',
      iconBg: 'bg-purple-600',
      iconShadow: 'shadow-purple-600/20',
      badgeBg: 'bg-purple-100 text-purple-800 border-purple-200',
      buttonBg: 'bg-purple-600 hover:bg-purple-700 text-white shadow-purple-600/20',
      activeTab: 'bg-purple-600 text-white border-purple-600 shadow-md shadow-purple-600/20 font-bold',
      inactiveTab: 'bg-white hover:bg-purple-50 text-purple-900 border-purple-200',
      focusRing: 'focus:ring-purple-500',
    },
  },
  ADMIN: {
    key: 'ADMIN',
    label: 'Admin',
    title: 'Admin Login',
    subtitle: 'System-wide governance, contract inspection, inflation spread monitoring, and KYC approvals.',
    icon: ShieldCheck,
    defaultEmail: 'admin@agrichain.com',
    theme: {
      accentText: 'text-slate-800',
      iconBg: 'bg-slate-800',
      iconShadow: 'shadow-slate-800/20',
      badgeBg: 'bg-slate-200 text-slate-800 border-slate-300',
      buttonBg: 'bg-slate-800 hover:bg-slate-900 text-white shadow-slate-800/20',
      activeTab: 'bg-slate-800 text-white border-slate-800 shadow-md shadow-slate-800/20 font-bold',
      inactiveTab: 'bg-white hover:bg-slate-100 text-slate-900 border-slate-300',
      focusRing: 'focus:ring-slate-500',
    },
  },
};

export const LoginPage = () => {
  const [searchParams] = useSearchParams();
  const initialRole = (() => {
    const paramRole = searchParams.get('role')?.toUpperCase();
    if (paramRole && ROLE_CONFIGS[paramRole]) return paramRole;
    return 'FARMER';
  })();

  const [selectedRole, setSelectedRole] = useState(initialRole);
  const [email, setEmail] = useState(ROLE_CONFIGS[initialRole].defaultEmail);
  const [password, setPassword] = useState('password123');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const currentRole = ROLE_CONFIGS[selectedRole] || ROLE_CONFIGS.FARMER;
  const RoleIcon = currentRole.icon;

  const handleRoleSelect = (roleKey) => {
    setSelectedRole(roleKey);
    const targetConfig = ROLE_CONFIGS[roleKey];
    setEmail(targetConfig.defaultEmail);
    setPassword('password123');
    setError(null);
  };

  const handleLogin = async (e) => {
    if (e) e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const user = await login(email, password);
      redirectByRole(user.role);
    } catch (err) {
      setError(err.message || 'Login failed. Check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  const redirectByRole = (role) => {
    switch (role) {
      case 'FARMER':
        navigate('/farmer');
        break;
      case 'DISTRIBUTOR':
        navigate('/distributor');
        break;
      case 'RETAILER':
        navigate('/retailer');
        break;
      case 'ADMIN':
        navigate('/admin');
        break;
      default:
        navigate('/verify/1');
    }
  };

  return (
    <div className="max-w-lg mx-auto my-12 px-4">
      <div className="bg-white p-8 rounded-2xl shadow-xl border border-slate-200">
        {/* Quick Role Access Switcher */}
        <div className="mb-6 p-4 bg-slate-50 border border-slate-200 rounded-2xl">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
              <Sparkles className="w-4 h-4 text-emerald-600" />
              <span>Quick Role Access</span>
            </div>
            <span className="text-[11px] text-slate-400 font-medium">Select a role to switch card</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {Object.values(ROLE_CONFIGS).map((cfg) => {
              const isSelected = selectedRole === cfg.key;
              const Icon = cfg.icon;
              return (
                <button
                  type="button"
                  key={cfg.key}
                  id={`role-btn-${cfg.key.toLowerCase()}`}
                  onClick={() => handleRoleSelect(cfg.key)}
                  className={`px-3 py-2 text-xs font-semibold rounded-xl border text-left transition flex items-center justify-between gap-1.5 ${
                    isSelected
                      ? cfg.theme.activeTab
                      : cfg.theme.inactiveTab
                  }`}
                >
                  <span className="flex items-center gap-1.5 truncate">
                    <Icon className="w-3.5 h-3.5 shrink-0" />
                    <span>{cfg.label}</span>
                  </span>
                  {isSelected && (
                    <span className="w-1.5 h-1.5 rounded-full bg-white shrink-0" />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Dynamic Role-Specific Login Card Header */}
        <div className="text-center mb-6 transition-all duration-200">
          <div
            className={`w-14 h-14 rounded-2xl ${currentRole.theme.iconBg} text-white flex items-center justify-center mx-auto mb-3 shadow-lg ${currentRole.theme.iconShadow} transition-all duration-200`}
          >
            <RoleIcon className="w-7 h-7" />
          </div>
          <div
            className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold border mb-1.5 capitalize tracking-wide ${currentRole.theme.badgeBg}`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-current" />
            {currentRole.label} Portal
          </div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight">
            {currentRole.title}
          </h2>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto leading-relaxed">
            {currentRole.subtitle}
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 text-xs text-red-700 bg-red-50 rounded-lg border border-red-200">
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Email Address
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={currentRole.defaultEmail}
                className={`w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 ${currentRole.theme.focusRing} focus:outline-none transition`}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Password
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className={`w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 ${currentRole.theme.focusRing} focus:outline-none transition`}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className={`w-full py-2.5 px-4 text-sm font-bold text-white ${currentRole.theme.buttonBg} rounded-xl shadow-md transition flex items-center justify-center gap-2`}
          >
            <span>{loading ? 'Authenticating...' : `Sign In as ${currentRole.label}`}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        <div className="mt-6 text-center text-xs text-slate-500">
          Need an account?{' '}
          <Link to="/register" className={`font-semibold ${currentRole.theme.accentText} hover:underline`}>
            Register here
          </Link>
        </div>
      </div>
    </div>
  );
};
