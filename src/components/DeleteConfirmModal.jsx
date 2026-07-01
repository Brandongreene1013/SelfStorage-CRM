import ModalLayout from './ui/ModalLayout';

export default function DeleteConfirmModal({ clientName, onConfirm, onClose }) {
  return (
    <ModalLayout onClose={onClose} size="sm" className="p-6 text-center">
      <div className="text-4xl mb-3">🗑️</div>
      <h2 className="text-lg font-bold text-white mb-1">Remove Client?</h2>
      <p className="text-slate-400 text-sm mb-6">
        <span className="text-white font-semibold">{clientName}</span> will be permanently removed from the CRM.
      </p>
      <div className="flex gap-3">
        <button
          onClick={onClose}
          className="flex-1 py-2.5 rounded-lg border border-slate-700 text-slate-300 hover:border-slate-500 hover:text-white transition-all text-sm font-semibold"
        >
          Cancel
        </button>
        <button
          onClick={onConfirm}
          className="flex-1 py-2.5 rounded-lg bg-red-600 hover:bg-red-500 text-white font-bold text-sm transition-all"
        >
          Remove
        </button>
      </div>
    </ModalLayout>
  );
}
