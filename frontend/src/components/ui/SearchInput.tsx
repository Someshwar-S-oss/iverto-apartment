import React from 'react';
import { Search, X } from 'lucide-react';

export interface SearchInputProps {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  className?: string;
  onClear?: () => void;
  disabled?: boolean;
  autoFocus?: boolean;
}

export const SearchInput: React.FC<SearchInputProps> = ({
  value,
  onChange,
  placeholder = 'Search...',
  className = '',
  onClear,
  disabled = false,
  autoFocus = false,
}) => {
  const handleClear = () => {
    onChange('');
    if (onClear) onClear();
  };

  return (
    <div className={`relative flex items-center min-w-[200px] ${className}`}>
      <Search className="absolute left-3.5 w-4 h-4 text-[var(--ink-400)] pointer-events-none" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        autoFocus={autoFocus}
        className="field field-icon-l field-icon-r text-sm"
      />
      {value && !disabled && (
        <button
          type="button"
          onClick={handleClear}
          className="absolute right-2.5 p-1 rounded-full text-[var(--ink-400)] hover:text-[var(--ink-700)] hover:bg-[var(--ink-100)] transition-colors cursor-pointer"
          aria-label="Clear search query"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
};

export default SearchInput;
