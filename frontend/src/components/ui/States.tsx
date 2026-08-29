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
    <div className={`w-full overflow-hidden rounded-xl border border-gray-200 bg-white ${className}`}>
      <div className="animate-pulse divide-y divide-gray-200">
        {/* Skeleton Header */}
        <div className="bg-gray-50/80 px-6 py-3.5 flex items-center gap-4">
          {Array.from({ length: columns }).map((_, i) => (
            <div
              key={`th-${i}`}
              className="h-3.5 bg-gray-200 rounded-md"
              style={{
                width: `${Math.max(60, Math.floor(100 / columns) * 0.8)}%`,
              }}
            />
          ))}
        </div>

        {/* Skeleton Rows */}
        {Array.from({ length: rows }).map((_, rowIndex) => (
          <div
            key={`tr-${rowIndex}`}
            className="px-6 py-4 flex items-center gap-4"
          >
            {Array.from({ length: columns }).map((_, colIndex) => {
              // Staggered width calculation for natural look
              const widthVariation = 40 + ((rowIndex * 17 + colIndex * 23) % 45);
              return (
                <div
                  key={`td-${rowIndex}-${colIndex}`}
                  className="h-4 bg-gray-100 rounded-md"
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
      className={`card p-10 flex flex-col items-center justify-center text-center space-y-4 max-w-lg mx-auto ${className}`}
    >
      <div className="w-16 h-16 rounded-2xl bg-gray-50 border border-gray-200/80 flex items-center justify-center text-gray-400 shadow-xs">
        <Icon className="w-8 h-8 stroke-[1.5]" />
      </div>
      <div className="space-y-1.5">
        <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
        {description && (
          <p className="text-sm text-gray-500 max-w-sm mx-auto leading-relaxed">
            {description}
          </p>
        )}
      </div>
      {action && <div className="pt-2">{action}</div>}
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
      className={`card p-10 flex flex-col items-center justify-center text-center space-y-4 max-w-md mx-auto ${className}`}
    >
      <div className="w-14 h-14 rounded-2xl bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-500">
        <SearchX className="w-7 h-7 stroke-[1.5]" />
      </div>
      <div className="space-y-1">
        <h3 className="text-base font-semibold text-gray-900">
          No matching results
        </h3>
        <p className="text-sm text-gray-500">
          {query ? (
            <>
              No results found for{' '}
              <span className="font-semibold text-gray-700">"{query}"</span>.
              Try checking for typos or searching with different keywords.
            </>
          ) : (
            'No results found for your current filter criteria.'
          )}
        </p>
      </div>
      {onClear && (
        <button
          type="button"
          onClick={onClear}
          className="btn-secondary text-xs !py-1.5 !px-3"
        >
          Clear Filter
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
      className={`flex flex-col items-center justify-center p-8 space-y-3 ${className}`}
      role="status"
    >
      <Loader2
        className={`${spinnerSizes[size]} text-[#cd0447] animate-spin`}
      />
      {label && <p className="text-sm font-medium text-gray-500">{label}</p>}
      <span className="sr-only">{label}</span>
    </div>
  );
};
