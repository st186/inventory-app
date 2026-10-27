import * as React from 'react';

import { Button } from '../ui/button';
import { Checkbox } from '../ui/checkbox';
import { EmptyState } from '../ui/empty-state';
import { ResponsiveModal } from '../ui/responsive-modal';
import { toast } from '../ui/sonner';
import { useT } from '../../utils/i18n';
import { useRecipesApi, type CrewMember } from '../../utils/recipesApi';

// The production head picks which kitchen crew may fill recipe batches.
export function CrewSheet({ open, crew, onOpenChange, onSaved }: { open: boolean; crew: CrewMember[]; onOpenChange: (o: boolean) => void; onSaved: () => void }) {
  const { t } = useT();
  const api = useRecipesApi();
  const [picked, setPicked] = React.useState<Set<string>>(() => new Set(crew.filter((c) => c.picked).map((c) => c.id)));
  const [saving, setSaving] = React.useState(false);
  React.useEffect(() => {
    if (open) setPicked(new Set(crew.filter((c) => c.picked).map((c) => c.id)));
  }, [open, crew]);
  const dirty = crew.some((c) => c.picked !== picked.has(c.id));

  async function save() {
    setSaving(true);
    try {
      await api.saveCrew([...picked]);
      toast.success(t('recipes.crew.saved'));
      onSaved();
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title={t('recipes.crew.title')}
      description={t('recipes.crew.hint')}
      dirty={dirty}
      footer={<Button size="lg" className="flex-1" loading={saving} disabled={!dirty} onClick={() => void save()}>{t('common.save')}</Button>}
    >
      {crew.length ? (
        <div className="overflow-hidden rounded-lg border border-border bg-surface [&>*+*]:border-t [&>*+*]:border-border">
          {crew.map((c) => (
            <label key={c.id} className="flex min-h-15 cursor-pointer items-center gap-3 px-4 py-2.5 hover:bg-surface-2/60">
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-body-md font-medium">{c.name}</span>
                {c.designation && <span className="text-label text-text-3">{c.designation.replace(/_/g, ' ')}</span>}
              </span>
              <Checkbox
                checked={picked.has(c.id)}
                onCheckedChange={(v) => setPicked((s) => {
                  const next = new Set(s);
                  if (v === true) next.add(c.id); else next.delete(c.id);
                  return next;
                })}
                aria-label={c.name}
              />
            </label>
          ))}
        </div>
      ) : (
        <EmptyState compact title={t('recipes.crew.empty')} body={t('recipes.crew.emptyBody')} />
      )}
    </ResponsiveModal>
  );
}
