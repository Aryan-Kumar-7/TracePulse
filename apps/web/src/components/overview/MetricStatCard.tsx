import React from 'react';
import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface MetricStatCardProps {
  title: string;
  value: string;
  subtitle?: string;
  icon: LucideIcon;
  iconColor?: string;
  trend?: {
    label: string;
    isPositive?: boolean;
    isNeutral?: boolean;
  };
  status?: 'normal' | 'warning' | 'critical';
}

export function MetricStatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  iconColor = 'text-blue-400',
  trend,
  status = 'normal',
}: MetricStatCardProps) {
  const statusBorder = {
    normal: 'border-gray-800/80 hover:border-gray-700/80',
    warning: 'border-amber-500/40 bg-amber-500/5',
    critical: 'border-rose-500/40 bg-rose-500/5',
  }[status];

  return (
    <div
      className={cn(
        'group relative overflow-hidden rounded-2xl border bg-[#0f172a]/60 p-5 backdrop-blur-sm transition-all duration-200 hover:shadow-xl hover:shadow-blue-500/5',
        statusBorder,
      )}
    >
      <div className="flex items-center justify-between text-gray-400 mb-3">
        <span className="text-xs font-semibold uppercase tracking-wider">
          {title}
        </span>
        <div
          className={cn(
            'flex h-8 w-8 items-center justify-center rounded-xl bg-gray-900/80 border border-gray-800 transition-transform group-hover:scale-110',
            iconColor,
          )}
        >
          <Icon className="h-4 w-4" />
        </div>
      </div>

      <div className="flex items-baseline gap-2">
        <span className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white font-mono">
          {value}
        </span>
        {trend && (
          <span
            className={cn(
              'text-xs font-medium px-2 py-0.5 rounded-full border',
              trend.isNeutral
                ? 'bg-gray-800 text-gray-400 border-gray-700'
                : trend.isPositive
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                  : 'bg-rose-500/10 text-rose-400 border-rose-500/30',
            )}
          >
            {trend.label}
          </span>
        )}
      </div>

      {subtitle && (
        <p className="text-xs text-gray-400 mt-2 flex items-center gap-1.5">
          {subtitle}
        </p>
      )}

      {/* Decorative gradient blur */}
      <div className="absolute -right-6 -bottom-6 h-16 w-16 rounded-full bg-blue-500/5 blur-xl pointer-events-none group-hover:bg-blue-500/10 transition-colors" />
    </div>
  );
}
