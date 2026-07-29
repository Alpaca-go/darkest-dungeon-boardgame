interface ConfirmModalProps {
  open: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** 通用确认弹窗（纯色块风格，无外部依赖）。 */
export default function ConfirmModal({
  open,
  title,
  message,
  confirmText = '确认',
  cancelText = '取消',
  danger = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-lg border border-dd-border bg-dd-panel p-5 shadow-xl">
        <h3 className="text-base font-bold text-dd-text mb-2">{title}</h3>
        <p className="text-sm text-dd-muted mb-4 whitespace-pre-line">{message}</p>
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 rounded border border-dd-border text-dd-muted hover:text-dd-text hover:bg-dd-panel2 transition-colors"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            className={[
              'px-3 py-1.5 rounded text-white transition-colors',
              danger ? 'bg-dd-accent hover:bg-dd-accent2' : 'bg-dd-positive hover:brightness-110',
            ].join(' ')}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
