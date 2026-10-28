// Delete with a confirm and a few seconds of "Undo": the row hides at once, the real delete runs
// when the toast's time is up (or straight away if the screen closes first). A failed delete
// brings the row back and says why.
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { confirm } from '../ui/confirm';
import { useT } from '../../utils/i18n';

const UNDO_MS = 5000;

export function useUndoableDelete() {
  const { t } = useT();
  const [hidden, setHidden] = useState<ReadonlySet<string>>(() => new Set());
  const pending = useRef(new Map<string, { timer: number; run: () => Promise<void> }>());

  const unhide = useCallback((id: string) => {
    setHidden((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  // Leaving the screen sends whatever is still waiting.
  useEffect(() => {
    const map = pending.current;
    return () => {
      map.forEach(({ timer, run }) => {
        window.clearTimeout(timer);
        void run();
      });
      map.clear();
    };
  }, []);

  const remove = useCallback(async (id: string, what: string, doDelete: () => void | Promise<void>): Promise<boolean> => {
    const ok = await confirm({ title: t('exp.deleteTitle'), body: what, confirmLabel: t('exp.deleteConfirm'), tone: 'danger' });
    if (!ok) return false;
    setHidden((prev) => new Set(prev).add(id));
    const run = async () => {
      pending.current.delete(id);
      try {
        await doDelete();
      } catch (error) {
        toast.error(error instanceof Error && error.message ? `${t('exp.deleteFailed')}: ${error.message}` : t('exp.deleteFailed'));
      } finally {
        unhide(id);
      }
    };
    const timer = window.setTimeout(() => { void run(); }, UNDO_MS);
    pending.current.set(id, { timer, run });
    toast(t('exp.deleted'), {
      description: what,
      duration: UNDO_MS,
      action: {
        label: t('exp.undo'),
        onClick: () => {
          window.clearTimeout(timer);
          pending.current.delete(id);
          unhide(id);
        },
      },
    });
    return true;
  }, [t, unhide]);

  return { hidden, remove };
}
