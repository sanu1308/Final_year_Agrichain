import React from 'react';
import { Clock, Truck, Store, AlertTriangle, CheckCheck } from 'lucide-react';

export const StatusBadge = ({ status, size = 'md' }) => {
  const normalized = (status || '').toUpperCase();

  let config = {
    label: 'Harvested',
    bg: 'bg-emerald-50',
    text: 'text-emerald-700',
    border: 'border-emerald-200',
    icon: Clock,
  };

  switch (normalized) {
    case 'HARVESTED':
    case '0':
      config = {
        label: 'Harvested',
        bg: 'bg-emerald-50',
        text: 'text-emerald-700',
        border: 'border-emerald-200',
        icon: Clock,
      };
      break;
    case 'IN_TRANSIT':
    case 'IN_TRANSIT_TO_RETAILER':
    case '1':
      config = {
        label: 'In Transit',
        bg: 'bg-blue-50',
        text: 'text-blue-700',
        border: 'border-blue-200',
        icon: Truck,
      };
      break;
    case 'WITH_DISTRIBUTOR':
    case '2':
      config = {
        label: 'Warehoused',
        bg: 'bg-indigo-50',
        text: 'text-indigo-700',
        border: 'border-indigo-200',
        icon: Store,
      };
      break;
    case 'WITH_RETAILER':
    case '3':
      config = {
        label: 'On Retail Shelf',
        bg: 'bg-purple-50',
        text: 'text-purple-700',
        border: 'border-purple-200',
        icon: Store,
      };
      break;
    case 'SOLD':
    case '4':
      config = {
        label: 'Sold to Consumer',
        bg: 'bg-slate-100',
        text: 'text-slate-700',
        border: 'border-slate-300',
        icon: CheckCheck,
      };
      break;
    case 'RECALLED':
    case '5':
      config = {
        label: 'Recalled / Contaminated',
        bg: 'bg-red-50',
        text: 'text-red-700',
        border: 'border-red-300',
        icon: AlertTriangle,
      };
      break;
  }

  const sizeClasses = {
    sm: 'text-xs px-2 py-0.5 gap-1',
    md: 'text-xs px-2.5 py-1 gap-1.5 font-medium',
    lg: 'text-sm px-3 py-1.5 gap-2 font-semibold',
  }[size] || 'text-xs px-2.5 py-1 gap-1.5 font-medium';

  const IconComponent = config.icon;

  return (
    <span
      className={`inline-flex items-center rounded-full border ${config.bg} ${config.text} ${config.border} ${sizeClasses}`}
    >
      <IconComponent className={size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5'} />
      {config.label}
    </span>
  );
};
