const SIZES = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-3xl',
  '2xl': 'max-w-4xl',
};

export default function ModalLayout({ onClose, size = 'md', className = '', children }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose?.(); }}
    >
      <div role="dialog" aria-modal="true" className={`bg-slate-900 border border-slate-700 rounded-2xl w-full ${SIZES[size] ?? SIZES.md} shadow-2xl ${className}`}>
        {children}
      </div>
    </div>
  );
}
