import React from 'react';
import { LucideIcon, SearchX, Inbox, Loader2 } from 'lucide-react';

export interface TableSkeletonProps {
  columns: number;
  rows?: number;
  className?: string;
}

export const TableSkeleton: React.FC<TableSkeletonProps> = ({
  columns,
  rows = 5,
  className = '',
}) => {
  return (
    <div
      className={`w-full overflow-hidden rounded-[var(--r-md)] border border-[var(--line)] bg-white ${className}`}
    >
      <div className="animate-pulse divide-y divide-[var(--ink-100)]">
        {/* Skeleton Header */}
        <div className="flex items-center gap-4 bg-[var(--ink-50)] px-6 py-3.5">
          {Array.from({ length: columns }).map((_, i) => (
            <div
              key={`th-${i}`}
              className="h-3 rounded-full bg-[var(--ink-200)]"
              style={{
                width: `${Math.max(60, Math.floor(100 / columns) * 0.8)}%`,
              }}
            />
          ))}
        </div>

        {/* Skeleton Rows */}
        {Array.from({ length: rows }).map((_, rowIndex) => (
          <div key={`tr-${rowIndex}`} className="flex items-center gap-4 px-6 py-4">
            {Array.from({ length: columns }).map((_, colIndex) => {
              // Staggered width calculation for natural look
              const widthVariation = 40 + ((rowIndex * 17 + colIndex * 23) % 45);
              return (
                <div
                  key={`td-${rowIndex}-${colIndex}`}
                  className="h-3.5 rounded-full bg-[var(--ink-100)]"
                  style={{ width: `${widthVariation}%` }}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
};

export interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon: Icon = Inbox,
  title,
  description,
  action,
  className = '',
}) => {
  return (
    <div
      className={`card-static relative mx-auto flex max-w-lg flex-col items-center justify-center overflow-hidden p-12 text-center ${className}`}
    >
      {/* A dot field behind the glyph keeps the empty case from reading as broken */}
      <div
        className="bg-field bg-field-dots field-fade-center"
        style={{
          ['--field-size' as string]: '20px',
          ['--field-dot' as string]: 'rgba(20, 22, 26, 0.07)',
        }}
        aria-hidden="true"
      />

      <div className="relative z-10 flex flex-col items-center">
        <div className="grid h-16 w-16 place-items-center rounded-[var(--r-lg)] border border-[var(--line)] bg-white text-[var(--ink-400)] shadow-[var(--e2)]">
          <Icon className="h-7 w-7 stroke-[1.5]" />
        </div>
        <h3 className="mt-5 text-lg font-semibold text-[var(--ink-900)]">{title}</h3>
        {description && (
          <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-[var(--ink-500)]">
            {description}
          </p>
        )}
        {action && <div className="pt-6">{action}</div>}
      </div>
    </div>
  );
};

export interface NoResultsStateProps {
  query?: string;
  onClear?: () => void;
  className?: string;
}

export const NoResultsState: React.FC<NoResultsStateProps> = ({
  query,
  onClear,
  className = '',
}) => {
  return (
    <div
      className={`card-static mx-auto flex max-w-md flex-col items-center justify-center p-10 text-center ${className}`}
    >
      <div className="grid h-14 w-14 place-items-center rounded-[var(--r-md)] border border-rose-100 bg-rose-50 text-rose-500">
        <SearchX className="h-6 w-6 stroke-[1.6]" />
      </div>
      <h3 className="mt-5 text-base font-semibold text-[var(--ink-900)]">
        No matching results
      </h3>
      <p className="mt-1.5 text-sm leading-relaxed text-[var(--ink-500)]">
        {query ? (
          <>
            Nothing matched{' '}
            <span className="font-semibold text-[var(--ink-800)]">&ldquo;{query}&rdquo;</span>.
            Check for typos or try different keywords.
          </>
        ) : (
          'Nothing matched your current filter criteria.'
        )}
      </p>
      {onClear && (
        <button type="button" onClick={onClear} className="btn-secondary btn-sm mt-5">
          Clear filter
        </button>
      )}
    </div>
  );
};

export interface CenteredSpinnerProps {
  label?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const spinnerSizes = {
  sm: 'w-5 h-5',
  md: 'w-8 h-8',
  lg: 'w-12 h-12',
};

export const CenteredSpinner: React.FC<CenteredSpinnerProps> = ({
  label = 'Loading...',
  size = 'md',
  className = '',
}) => {
  return (
    <div
      className={`flex flex-col items-center justify-center space-y-3 p-10 ${className}`}
      role="status"
    >
      <Loader2 className={`${spinnerSizes[size]} animate-spin text-[var(--brand)]`} />
      {label && (
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--ink-500)]">
          {label}
        </p>
      )}
      <span className="sr-only">{label}</span>
    </div>
  );
};
