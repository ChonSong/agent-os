import { useState, useCallback } from 'react';

export interface ConfirmDeleteOptions<T> {
  onConfirm?: (item: T) => void;
  onDelete?: (item: T) => void | Promise<void>;
}

export function useConfirmDelete<T>({ onDelete }: ConfirmDeleteOptions<T>) {
  const [pendingId, setPendingId] = useState<T | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const confirmDelete = useCallback((item: T) => {
    setPendingId(item);
  }, []);

  const requestDelete = confirmDelete;

  const cancel = useCallback(() => {
    setPendingId(null);
  }, []);

  const confirm = useCallback(async () => {
    if (pendingId === null) return;
    setIsDeleting(true);
    try {
      if (onDelete) await onDelete(pendingId);
    } finally {
      setIsDeleting(false);
      setPendingId(null);
    }
  }, [pendingId, onDelete]);

  return {
    confirmDelete,
    requestDelete,
    pendingId,
    isOpen: pendingId !== null,
    cancel,
    confirm,
    isDeleting,
    ConfirmDialog: pendingId !== null ? (
      <div data-confirm-dialog>
        <button data-confirm onClick={confirm}>Confirm</button>
        <button data-cancel onClick={cancel}>Cancel</button>
      </div>
    ) : null,
  };
}
