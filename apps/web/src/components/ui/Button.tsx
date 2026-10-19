import React from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline';
  size?: 'xs' | 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export function Button({
  className,
  variant = 'primary',
  size = 'md',
  isLoading = false,
  leftIcon,
  rightIcon,
  disabled,
  children,
  ...props
}: ButtonProps) {
  const sizeStyles = {
    xs: 'px-2 py-1 text-xs rounded-md',
    sm: 'px-3 py-1.5 text-xs font-medium rounded-lg',
    md: 'px-4 py-2 text-sm font-medium rounded-lg',
    lg: 'px-5 py-2.5 text-base font-medium rounded-xl',
  };

  const variantStyles = {
    primary:
      'bg-blue-600 text-white hover:bg-blue-500 active:bg-blue-700 shadow-md shadow-blue-500/20 border border-blue-500/30',
    secondary:
      'bg-[#1e293b] text-gray-200 hover:bg-[#283548] active:bg-[#192231] border border-gray-700/60',
    danger:
      'bg-rose-600/20 text-rose-300 hover:bg-rose-600/30 active:bg-rose-600/40 border border-rose-500/40',
    outline:
      'bg-transparent text-gray-300 hover:bg-gray-800/80 active:bg-gray-800 border border-gray-700',
    ghost:
      'bg-transparent text-gray-400 hover:text-gray-200 hover:bg-gray-800/60 border border-transparent',
  };

  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 transition-all duration-150 select-none disabled:opacity-50 disabled:pointer-events-none cursor-pointer',
        sizeStyles[size],
        variantStyles[variant],
        className,
      )}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin text-current" />
      ) : (
        leftIcon
      )}
      {children}
      {!isLoading && rightIcon}
    </button>
  );
}
