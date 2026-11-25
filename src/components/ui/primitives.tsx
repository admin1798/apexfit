import { Search, X } from 'lucide-react';
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
  size?: 'sm' | 'md' | 'lg';
}

export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  children,
  ...props
}: ButtonProps) {
  const variants = {
    primary:
      'bg-[#B7F36B] text-[#101211] font-semibold hover:bg-[#C9FF85] active:bg-[#8FC64D]',
    secondary:
      'bg-[#252B27] text-[#F3F5F2] border border-[#303832] font-medium hover:bg-[#2E3631]',
    outline:
      'bg-transparent text-[#F3F5F2] border border-[#303832] font-medium hover:bg-[#1D221F]',
    ghost: 'bg-transparent text-[#A1AAA3] hover:text-[#F3F5F2] hover:bg-[#1D221F]',
    danger:
      'bg-[#E87979]/15 text-[#E87979] border border-[#E87979]/30 font-semibold hover:bg-[#E87979]/25',
  };

  const sizes = {
    sm: 'min-h-[38px] px-3 text-xs rounded-xl',
    md: 'min-h-[44px] px-4 text-sm rounded-2xl',
    lg: 'min-h-[48px] px-5 text-sm rounded-2xl',
  };

  return (
    <button
      type="button"
      {...props}
      className={`inline-flex items-center justify-center gap-2 transition active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40 ${variants[variant]} ${sizes[size]} ${className}`}
    >
      {children}
    </button>
  );
}

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  variant?: 'default' | 'lime' | 'danger';
}

export function IconButton({
  label,
  variant = 'default',
  className = '',
  children,
  ...props
}: IconButtonProps) {
  const styles = {
    default: 'bg-[#1D221F] border border-[#303832] text-[#A1AAA3] hover:text-[#F3F5F2] hover:bg-[#252B27]',
    lime: 'bg-[#B7F36B]/15 border border-[#B7F36B]/30 text-[#B7F36B] hover:bg-[#B7F36B]/25',
    danger: 'bg-[#E87979]/10 border border-[#E87979]/25 text-[#E87979] hover:bg-[#E87979]/20',
  };

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      {...props}
      className={`inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl transition active:scale-95 disabled:opacity-35 ${styles[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

interface CardProps {
  children: ReactNode;
  className?: string;
  elevated?: boolean;
}

export function Card({ children, className = '', elevated = false }: CardProps) {
  return (
    <section
      className={`rounded-3xl border ${
        elevated
          ? 'border-[#303832] bg-[#252B27]'
          : 'border-[#252B28] bg-[#1D221F]'
      } p-4 ${className}`}
    >
      {children}
    </section>
  );
}

interface MetricCardProps {
  label: string;
  value: string | number;
  unit?: string;
  sublabel?: string;
  icon?: ReactNode;
  accent?: 'lime' | 'success' | 'warning' | 'danger' | 'info' | 'neutral';
  className?: string;
}

export function MetricCard({
  label,
  value,
  unit,
  sublabel,
  icon,
  accent = 'neutral',
  className = '',
}: MetricCardProps) {
  const valueColors = {
    lime: 'text-[#B7F36B]',
    success: 'text-[#75D69A]',
    warning: 'text-[#EAB765]',
    danger: 'text-[#E87979]',
    info: 'text-[#79B8F5]',
    neutral: 'text-[#F3F5F2]',
  };

  return (
    <div className={`rounded-2xl border border-[#252B28] bg-[#171A18] p-3 ${className}`}>
      <div className="flex items-center justify-between gap-1.5">
        <span className="truncate text-[11px] font-medium text-[#A1AAA3]">{label}</span>
        {icon && <span className="shrink-0 text-[#727B74]">{icon}</span>}
      </div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className={`tabular-nums text-lg font-bold tracking-tight ${valueColors[accent]}`}>
          {value}
        </span>
        {unit && <span className="text-xs text-[#727B74]">{unit}</span>}
      </div>
      {sublabel && <p className="mt-0.5 truncate text-[11px] text-[#727B74]">{sublabel}</p>}
    </div>
  );
}

interface ProgressBarProps {
  value: number;
  max: number;
  tone?: 'lime' | 'success' | 'warning' | 'danger' | 'info';
  height?: 'sm' | 'md';
  className?: string;
}

export function ProgressBar({
  value,
  max,
  tone = 'lime',
  height = 'sm',
  className = '',
}: ProgressBarProps) {
  const pct = Math.max(0, Math.min(100, Math.round((value / Math.max(1, max)) * 100)));
  const tones = {
    lime: 'bg-[#B7F36B]',
    success: 'bg-[#75D69A]',
    warning: 'bg-[#EAB765]',
    danger: 'bg-[#E87979]',
    info: 'bg-[#79B8F5]',
  };

  return (
    <div
      className={`w-full overflow-hidden rounded-full bg-[#252B27] ${
        height === 'md' ? 'h-2.5' : 'h-1.5'
      } ${className}`}
    >
      <div
        className={`h-full rounded-full transition-all duration-300 ${tones[tone]}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

interface TabOption<T extends string> {
  id: T;
  label: string;
  count?: number;
}

interface TabsProps<T extends string> {
  options: Array<TabOption<T>>;
  value: T;
  onChange: (value: T) => void;
  className?: string;
}

export function Tabs<T extends string>({ options, value, onChange, className = '' }: TabsProps<T>) {
  return (
    <div
      className={`grid rounded-2xl border border-[#303832] bg-[#171A18] p-1 ${className}`}
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map((opt) => {
        const active = opt.id === value;
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => onChange(opt.id)}
            className={`min-h-[40px] rounded-xl px-2 text-xs font-semibold transition ${
              active
                ? 'bg-[#252B27] text-[#B7F36B] shadow-sm'
                : 'text-[#A1AAA3] hover:text-[#F3F5F2]'
            }`}
          >
            {opt.label}
            {opt.count !== undefined ? ` (${opt.count})` : ''}
          </button>
        );
      })}
    </div>
  );
}

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

export function Input({ label, id, className = '', ...props }: InputProps) {
  return (
    <div className="w-full">
      {label && (
        <label htmlFor={id} className="mb-1 block text-xs font-medium text-[#A1AAA3]">
          {label}
        </label>
      )}
      <input
        id={id}
        {...props}
        className={`min-h-[44px] w-full rounded-xl border border-[#303832] bg-[#171A18] px-3 text-sm text-[#F3F5F2] placeholder:text-[#727B74] focus:border-[#B7F36B] focus:outline-none ${className}`}
      />
    </div>
  );
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
}

export function Select({ label, id, className = '', children, ...props }: SelectProps) {
  return (
    <div className="w-full">
      {label && (
        <label htmlFor={id} className="mb-1 block text-xs font-medium text-[#A1AAA3]">
          {label}
        </label>
      )}
      <select
        id={id}
        {...props}
        className={`min-h-[44px] w-full rounded-xl border border-[#303832] bg-[#171A18] px-3 text-sm text-[#F3F5F2] focus:border-[#B7F36B] focus:outline-none ${className}`}
      >
        {children}
      </select>
    </div>
  );
}

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export function SearchInput({
  value,
  onChange,
  placeholder = 'Search...',
  className = '',
}: SearchInputProps) {
  return (
    <div className={`relative ${className}`}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#727B74]" />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="min-h-[44px] w-full rounded-xl border border-[#303832] bg-[#171A18] pl-9 pr-9 text-sm text-[#F3F5F2] placeholder:text-[#727B74] focus:border-[#B7F36B] focus:outline-none"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="Clear search"
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-[#727B74] hover:text-[#F3F5F2]"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

interface BadgeProps {
  children: ReactNode;
  tone?: 'lime' | 'success' | 'warning' | 'danger' | 'info' | 'neutral';
  className?: string;
}

export function Badge({ children, tone = 'neutral', className = '' }: BadgeProps) {
  const tones = {
    lime: 'bg-[#B7F36B]/15 text-[#B7F36B] border-[#B7F36B]/30',
    success: 'bg-[#75D69A]/15 text-[#75D69A] border-[#75D69A]/30',
    warning: 'bg-[#EAB765]/15 text-[#EAB765] border-[#EAB765]/30',
    danger: 'bg-[#E87979]/15 text-[#E87979] border-[#E87979]/30',
    info: 'bg-[#79B8F5]/15 text-[#79B8F5] border-[#79B8F5]/30',
    neutral: 'bg-[#252B27] text-[#A1AAA3] border-[#303832]',
  };

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-[#303832] bg-[#171A18]/60 px-5 py-8 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#252B27] text-[#B7F36B]">
        {icon}
      </div>
      <h3 className="text-sm font-bold text-[#F3F5F2]">{title}</h3>
      <p className="mt-1 max-w-xs text-xs text-[#A1AAA3]">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Skeleton({ className = 'h-20 w-full' }: { className?: string }) {
  return <div className={`animate-pulse rounded-2xl bg-[#252B27] ${className}`} />;
}
