'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Database,
  Layers,
  Radio,
  RefreshCw,
  Server,
  ShieldAlert,
  Sparkles,
} from 'lucide-react';
import { api } from '@/lib/api';
import type { HealthResponse } from '@/lib/types';
import { cn } from '@/lib/utils';

export interface NavbarProps {
  activeTab?: 'overview' | 'incidents' | 'traces';
  onTabChange?: (tab: 'overview' | 'incidents' | 'traces') => void;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

export function Navbar({
  activeTab,
  onTabChange,
  onRefresh,
  isRefreshing = false,
}: NavbarProps) {
  const pathname = usePathname();
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [healthLoading, setHealthLoading] = useState(true);
  const [showHealthMenu, setShowHealthMenu] = useState(false);

  const fetchHealth = async () => {
    try {
      setHealthLoading(true);
      const res = await api.getHealth();
      setHealth(res);
    } catch {
      setHealth({
        status: 'degraded',
        timestamp: new Date().toISOString(),
        uptime: 0,
        services: {
          redis: 'down',
          clickhouse: 'down',
          postgres: 'down',
        },
      });
    } finally {
      setHealthLoading(false);
    }
  };

  useEffect(() => {
    fetchHealth();
    const interval = setInterval(fetchHealth, 15000);
    return () => clearInterval(interval);
  }, []);

  const isHealthy = health?.status === 'healthy';
  const allServicesUp =
    health?.services.redis === 'up' &&
    health?.services.clickhouse === 'up' &&
    health?.services.postgres === 'up';

  const navItems = [
    { id: 'overview', label: 'System Overview', href: '/', icon: Activity },
    {
      id: 'incidents',
      label: 'Incident Center',
      href: '/incidents',
      icon: ShieldAlert,
    },
    {
      id: 'traces',
      label: 'Trace Waterfall',
      href: '/traces',
      icon: Layers,
    },
  ] as const;

  return (
    <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b border-gray-800/80 bg-[#090d16]/90 px-6 backdrop-blur-md">
      {/* Brand */}
      <div className="flex items-center gap-6">
        <Link href="/" className="flex items-center gap-3 group">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 shadow-lg shadow-blue-500/20 group-hover:scale-105 transition-transform">
            <Activity className="h-5 w-5 text-white animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold tracking-tight text-white group-hover:text-blue-400 transition-colors">
                TracePulse
              </span>
              <span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] font-semibold text-blue-400 border border-blue-500/20">
                OTel APM
              </span>
            </div>
            <p className="text-[11px] text-gray-400 -mt-0.5 hidden sm:block">
              Distributed Telemetry & AI Incident RCA
            </p>
          </div>
        </Link>

        {/* Tab Navigation */}
        <nav className="hidden md:flex items-center gap-1 rounded-xl bg-gray-900/60 p-1 border border-gray-800">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isSelected = activeTab
              ? activeTab === item.id
              : pathname === item.href ||
                (item.href !== '/' && pathname.startsWith(item.href));

            if (onTabChange) {
              return (
                <button
                  key={item.id}
                  onClick={() => onTabChange(item.id)}
                  className={cn(
                    'flex items-center gap-2 px-3.5 py-1.5 text-xs font-medium rounded-lg transition-all duration-150',
                    isSelected
                      ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/20'
                      : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/60',
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {item.label}
                </button>
              );
            }

            return (
              <Link
                key={item.id}
                href={item.href}
                className={cn(
                  'flex items-center gap-2 px-3.5 py-1.5 text-xs font-medium rounded-lg transition-all duration-150',
                  isSelected
                    ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/20'
                    : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/60',
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Right Controls: Health Status & Refresh */}
      <div className="flex items-center gap-3">
        {onRefresh && (
          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-gray-800 bg-[#0f172a]/60 text-xs font-medium text-gray-300 hover:text-white hover:bg-gray-800/80 transition-colors"
            title="Refresh dashboard metrics"
          >
            <RefreshCw
              className={cn('h-3.5 w-3.5 text-gray-400', isRefreshing && 'animate-spin text-blue-400')}
            />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        )}

        {/* System Health Dropdown Badge */}
        <div className="relative">
          <button
            onClick={() => setShowHealthMenu(!showHealthMenu)}
            className={cn(
              'flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium transition-all shadow-sm',
              isHealthy && allServicesUp
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20'
                : 'border-amber-500/30 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20',
            )}
          >
            <span className="relative flex h-2 w-2">
              <span
                className={cn(
                  'animate-ping absolute inline-flex h-full w-full rounded-full opacity-75',
                  isHealthy && allServicesUp ? 'bg-emerald-400' : 'bg-amber-400',
                )}
              />
              <span
                className={cn(
                  'relative inline-flex rounded-full h-2 w-2',
                  isHealthy && allServicesUp ? 'bg-emerald-500' : 'bg-amber-500',
                )}
              />
            </span>
            <span>
              {healthLoading
                ? 'Checking...'
                : isHealthy && allServicesUp
                  ? 'All Systems Operational'
                  : 'Degraded Connectivity'}
            </span>
          </button>

          {/* Health Popover Details */}
          {showHealthMenu && (
            <div className="absolute right-0 mt-2 w-72 rounded-xl border border-gray-800 bg-[#0f172a] p-4 shadow-2xl z-50 animate-in fade-in-50 zoom-in-95">
              <div className="flex items-center justify-between pb-3 border-b border-gray-800">
                <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                  Infrastructure Health
                </span>
                <span className="text-[10px] text-gray-500">
                  Port 4000 Fastify
                </span>
              </div>
              <div className="mt-3 space-y-2.5">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2 text-gray-300">
                    <Database className="h-3.5 w-3.5 text-purple-400" />
                    <span>ClickHouse MergeTree</span>
                  </div>
                  <span
                    className={cn(
                      'text-[11px] font-semibold uppercase px-2 py-0.5 rounded',
                      health?.services.clickhouse === 'up'
                        ? 'bg-emerald-500/10 text-emerald-400'
                        : 'bg-rose-500/10 text-rose-400',
                    )}
                  >
                    {health?.services.clickhouse || 'down'}
                  </span>
                </div>

                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2 text-gray-300">
                    <Radio className="h-3.5 w-3.5 text-amber-400" />
                    <span>Redis Stream Buffer</span>
                  </div>
                  <span
                    className={cn(
                      'text-[11px] font-semibold uppercase px-2 py-0.5 rounded',
                      health?.services.redis === 'up'
                        ? 'bg-emerald-500/10 text-emerald-400'
                        : 'bg-rose-500/10 text-rose-400',
                    )}
                  >
                    {health?.services.redis || 'down'}
                  </span>
                </div>

                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2 text-gray-300">
                    <Server className="h-3.5 w-3.5 text-blue-400" />
                    <span>PostgreSQL Prisma</span>
                  </div>
                  <span
                    className={cn(
                      'text-[11px] font-semibold uppercase px-2 py-0.5 rounded',
                      health?.services.postgres === 'up'
                        ? 'bg-emerald-500/10 text-emerald-400'
                        : 'bg-rose-500/10 text-rose-400',
                    )}
                  >
                    {health?.services.postgres || 'down'}
                  </span>
                </div>
              </div>

              <div className="mt-4 pt-2.5 border-t border-gray-800 text-[10px] text-gray-500 flex justify-between items-center">
                <span>Polling every 15s</span>
                <button
                  onClick={fetchHealth}
                  className="text-blue-400 hover:text-blue-300 transition-colors"
                >
                  Ping now
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
