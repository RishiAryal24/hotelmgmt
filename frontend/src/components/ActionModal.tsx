import React from 'react';
import { X } from 'lucide-react';

type ActionModalProps = {
  title: string;
  description?: string;
  onClose: () => void;
  maxWidthClassName?: string;
  children: React.ReactNode;
};

const ActionModal: React.FC<ActionModalProps> = ({
  title,
  description,
  onClose,
  maxWidthClassName = 'max-w-2xl',
  children,
}) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4 print-modal-root">
    <div className={`print-surface w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl ${maxWidthClassName}`}>
      <div className="print-hidden flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="print-hidden inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-800"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="max-h-[calc(100vh-10rem)] overflow-y-auto p-5">{children}</div>
    </div>
  </div>
);

export default ActionModal;
