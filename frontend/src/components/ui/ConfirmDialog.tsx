import React from 'react';
import { AlertTriangle, AlertCircle, HelpCircle, Loader2 } from 'lucide-react';
import Modal from './Modal';

export interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning' | 'primary';
  isLoading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'primary',
  isLoading = false,
  onConfirm,
  onCancel,
}) => {
  const getVariantStyles = () => {
    switch (variant) {
      case 'danger':
        return {
          icon: <AlertCircle className="w-6 h-6 text-rose-600" />,
          iconBg: 'bg-rose-100',
          confirmBtnClass: 'btn-danger !bg-rose-600 !text-white hover:!bg-rose-700 !border-transparent',
        };
      case 'warning':
        return {
          icon: <AlertTriangle className="w-6 h-6 text-amber-600" />,
          iconBg: 'bg-amber-100',
          confirmBtnClass: 'btn-primary !bg-amber-600 hover:!bg-amber-700',
        };
      case 'primary':
      default:
        return {
          icon: <HelpCircle className="w-6 h-6 text-[#cd0447]" />,
          iconBg: 'bg-pink-100',
          confirmBtnClass: 'btn-primary',
        };
    }
  };

  const currentStyles = getVariantStyles();

  return (
    <Modal
      isOpen={isOpen}
      onClose={isLoading ? () => {} : onCancel}
      size="sm"
      hideCloseButton={isLoading}
    >
      <div className="flex items-start gap-4">
        <div
          className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 ${currentStyles.iconBg}`}
        >
          {currentStyles.icon}
        </div>
        <div className="space-y-1.5 pt-1">
          <h3 className="text-lg font-semibold text-gray-900 leading-snug">
            {title}
          </h3>
          <p className="text-sm text-gray-500 leading-relaxed">{message}</p>
        </div>
      </div>

      <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-gray-100">
        <button
          type="button"
          onClick={onCancel}
          disabled={isLoading}
          className="btn-secondary"
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={isLoading}
          className={currentStyles.confirmBtnClass}
        >
          {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
          <span>{confirmLabel}</span>
        </button>
      </div>
    </Modal>
  );
};

export default ConfirmDialog;
