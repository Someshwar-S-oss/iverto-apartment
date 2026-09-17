import React from 'react';

export interface PageHeaderProps {
  title: string;
  subtitle?: string;
  /** Small uppercase kicker above the title, e.g. the section this page sits in. */
  eyebrow?: string;
  actions?: React.ReactNode;
  filters?: React.ReactNode;
  badge?: React.ReactNode;
  className?: string;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  subtitle,
  eyebrow,
  actions,
  filters,
  badge,
  className = '',
}) => {
  return (
    <div className={`mb-7 space-y-4 ${className}`}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          {eyebrow && (
            <div className="mb-2.5 flex items-center gap-2.5">
              <span className="h-px w-5 bg-[var(--brand)]/50" aria-hidden="true" />
              <span className="eyebrow eyebrow-brand text-[10px]">{eyebrow}</span>
            </div>
          )}

          {/* Brand tick on the leading edge anchors the page title */}
          <div className="flex gap-3.5">
            <span
              className="mt-1.5 hidden h-7 w-[3px] shrink-0 rounded-full bg-gradient-to-b from-[#cd0447] to-[#e91e63] sm:block"
              aria-hidden="true"
            />
            <div className="min-w-0 space-y-1.5">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="display text-[1.6rem] sm:text-[1.85rem]">{title}</h1>
                {badge && <div className="inline-flex items-center">{badge}</div>}
              </div>
              {subtitle && (
                <p className="max-w-3xl text-sm leading-relaxed text-[var(--ink-500)]">
                  {subtitle}
                </p>
              )}
            </div>
          </div>
        </div>

        {actions && (
          <div className="flex shrink-0 flex-wrap items-center gap-2.5 sm:self-start">
            {actions}
          </div>
        )}
      </div>

      {filters && (
        <div className="flex flex-wrap items-center gap-3 border-t border-[var(--line)] pt-4">
          {filters}
        </div>
      )}
    </div>
  );
};

export default PageHeader;
