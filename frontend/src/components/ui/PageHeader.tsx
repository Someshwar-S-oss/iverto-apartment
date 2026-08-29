import React from 'react';

export interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  filters?: React.ReactNode;
  badge?: React.ReactNode;
  className?: string;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  subtitle,
  actions,
  filters,
  badge,
  className = '',
}) => {
  return (
    <div className={`space-y-4 mb-6 ${className}`}>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900">
              {title}
            </h1>
            {badge && <div className="inline-flex items-center">{badge}</div>}
          </div>
          {subtitle && (
            <p className="text-sm text-gray-500 max-w-3xl leading-relaxed">
              {subtitle}
            </p>
          )}
        </div>

        {actions && (
          <div className="flex flex-wrap items-center gap-2.5 sm:self-start shrink-0">
            {actions}
          </div>
        )}
      </div>

      {filters && (
        <div className="pt-2 border-t border-gray-100 flex flex-wrap items-center gap-3">
          {filters}
        </div>
      )}
    </div>
  );
};

export default PageHeader;
