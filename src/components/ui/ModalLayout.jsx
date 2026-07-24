import { useEffect } from 'react';

const SIZES = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-3xl',
  '2xl': 'max-w-4xl',
};

// Sprint 21a — background scroll lock with a counter instead of save/restore.
// Modals nest (delete-confirm inside Contact Detail, TaskModal inside Call
// Mode), and save/restore of body overflow depends on effect cleanup ORDER:
// if the parent's cleanup ran before the child's, the child restored the
// parent's 'hidden' and the page stayed unscrollable after all modals closed.
// A counter is order-independent: lock on first modal in, unlock on last out.
let openModalCount = 0;

export default function ModalLayout({ onClose, size = 'md', className = '', children }) {
  useEffect(() => {
    openModalCount += 1;
    document.body.style.overflow = 'hidden';
    return () => {
      openModalCount = Math.max(0, openModalCount - 1);
      if (openModalCount === 0) document.body.style.overflow = '';
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-md animate-backdrop-in"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose?.(); }}
      onClick={e => e.stopPropagation()}
    >
      <div role="dialog" aria-modal="true" className={`bg-slate-900 border border-slate-700/80 ring-1 ring-inset ring-white/[0.04] rounded-2xl w-full ${SIZES[size] ?? SIZES.md} shadow-[0_24px_60px_-15px_rgba(0,0,0,0.7)] max-h-[90vh] overflow-y-auto overscroll-contain animate-modal-in ${className}`}>
        {children}
      </div>
    </div>
  );
}
