import React from 'react';
import { cn } from '@/lib/utils';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?:
    | 'default'
    | 'outline'
    | 'success'
    | 'warning'
    | 'danger'
    | 'info'
    | 'purple'
    | 'p1'
    | 'p2'
    | 'p3';
  size?: 'xs' | 'sm' | 'md';
  pulse?: boolean;
}

export function Badge({
  className,
  variant = 'default',
  size = 'sm',
  pulse = false,
  children,
  ...props
}: BadgeProps) {
  const sizeStyles = {
    xs: 'px-1.5 py-0.2 text-[10px] leading-tight font-medium',
    sm: 'px-2 py-0.5 text-xs font-medium',
    md: 'px-2.5 py-1 text-xs font-semibold',
  };

  const variantStyles = {
    default: 'bg-gray-800 text-gray-300 border border-gray-700/60',
    outline: 'border border-gray-700 text-gray-300 bg-transparent',
    success: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30',
    warning: 'bg-amber-500/10 text-amber-400 border border-amber-500/30',
    danger: 'bg-rose-500/10 text-rose-400 border border-rose-500/30',
    info: 'bg-blue-500/10 text-blue-400 border border-blue-500/30',
    purple: 'bg-purple-500/10 text-purple-400 border border-purple-500/30',
    p1: 'bg-rose-600/20 text-rose-300 border border-rose-500/40 font-bold',
    p2: 'bg-amber-600/20 text-amber-300 border border-amber-500/40 font-semibold',
    p3: 'bg-blue-600/20 text-blue-300 border border-blue-500/40',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full transition-colors',
        sizeStyles[size],
        variantStyles[variant],
        className,
      )}
      {...props}
    >
      {pulse && (
        <span className="relative flex h-1.5 w-1.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-current opacity-75" />
          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-current" />
        </span>
      )}
      {children}
    </span>
  );
}

export function SeverityBadge({ severity }: { severity?: string }) {
  const s = (severity || 'P3').toUpperCase();
  if (s === 'P1') {
    return <Badge variant="p1" size="xs" pulse>CRITICAL P1</Badge>;
  }
  if (s === 'P2') {
    return <Badge variant="p2" size="xs">MAJOR P2</Badge>;
  }
  return <Badge variant="p3" size="xs">MODERATE P3</Badge>;
}

export function IncidentStatusBadge({ status }: { status: string }) {
  const s = status.toUpperCase();
  switch (s) {
    case 'OPEN':
      return <Badge variant="danger" pulse>OPEN</Badge>;
    case 'INVESTIGATING':
      return <Badge variant="warning" pulse>INVESTIGATING</Badge>;
    case 'RESOLVED':
      return <Badge variant="success">RESOLVED</Badge>;
    default:
      return <Badge variant="default">{s}</Badge>;
  }
}
