import { useEffect } from 'react';

const SIZES = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-3xl',
  '2xl': 'max-w-4xl',
};

export default function ModalLayout({ onClose, size = 'md', className = '', children }) {
  // Sprint 20 — lock background scroll while a modal is open. Without this,
  // wheel/trackpad scrolling over a tall modal scrolled the page behind it,
  // leaving footer buttons (e.g. Add Contact's Save) unreachable.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose?.(); }}
    >
      <div role="dialog" aria-modal="true" className={`bg-slate-900 border border-slate-700 rounded-2xl w-full ${SIZES[size] ?? SIZES.md} shadow-2xl max-h-[90vh] overflow-y-auto overscroll-contain ${className}`}>
        {children}
      </div>
    </div>
  );
}
