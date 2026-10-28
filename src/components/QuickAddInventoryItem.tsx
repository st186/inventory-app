import { useState } from 'react';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { projectId } from '../utils/supabase/info';
import { currentAccessToken } from '../utils/accessToken';
import { useT, hasTranslation } from '../utils/i18n';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Field } from './ui/field';
import { NativeSelect } from './ui/select';
import { ChoiceChips } from './ui/chip';
import { ResponsiveModal } from './ui/responsive-modal';
import { unitKey } from './setup/itemLabels';

type Props = {
  entityType: 'store' | 'production_house';
  entityId: string;
  entityName: string;
  category?: 'finished_product' | 'raw_material' | 'sauce_chutney';
  onItemAdded?: () => void;
};

const UNITS = ['pieces', 'kg', 'liters', 'grams', 'ml'];
const EMPTY = { displayName: '', unit: 'pieces', linkType: 'specific' as 'specific' | 'global' };

// "Add a new item" on the stock screens: a small sheet that adds one catalogue item for this
// store / production house (or all of them).
export function QuickAddInventoryItem({ entityType, entityId, entityName, category = 'finished_product', onItemAdded }: Props) {
  const { t, lang } = useT();
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({ ...EMPTY });

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();

    // Prevent duplicate submissions
    if (loading) return;
    if (!formData.displayName.trim()) {
      setError(t('assets.err.name'));
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const name = formData.displayName.toLowerCase().replace(/\s+/g, '_');

      const payload = {
        name,
        displayName: formData.displayName,
        category,
        unit: formData.unit,
        linkedEntityType: formData.linkType === 'global' ? 'global' : entityType,
        linkedEntityId: formData.linkType === 'global' ? undefined : entityId,
        userId: 'current_user',
      };

      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-c2dd9b9d/inventory-items`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${await currentAccessToken()}`
          },
          body: JSON.stringify(payload),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to add item');
      }

      toast.success(t('items.created'));
      setShowForm(false);

      if (onItemAdded) {
        setTimeout(onItemAdded, 500);
      }
    } catch (err) {
      console.error('Error adding item:', err);
      setError(err instanceof Error ? err.message : t('items.saveFailed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mb-4">
      <Button variant="secondary" size="sm" leadingIcon={<Plus />} onClick={() => setShowForm(true)}>
        {t('items.quick.add')}
      </Button>

      <ResponsiveModal
        open={showForm}
        onOpenChange={setShowForm}
        onClosed={() => { setFormData({ ...EMPTY }); setError(null); }}
        title={t('items.quick.title', { place: entityName })}
        dirty={!!formData.displayName.trim() && !loading}
        footer={<Button size="lg" className="flex-1" loading={loading} onClick={() => handleSubmit()}>{t('items.add')}</Button>}
      >
        <form onSubmit={handleSubmit} className="flex flex-col gap-4" lang={lang}>
          <Field label={t('items.name')} required error={error}>
            <Input
              value={formData.displayName}
              onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
              placeholder={t('items.namePlaceholder')}
              disabled={loading}
            />
          </Field>
          <Field label={t('items.unit')}>
            <NativeSelect value={formData.unit} onChange={(e) => setFormData({ ...formData, unit: e.target.value })} disabled={loading}>
              {UNITS.map((u) => <option key={u} value={u}>{hasTranslation('en', unitKey(u)) ? t(unitKey(u)) : u}</option>)}
            </NativeSelect>
          </Field>
          <div className="flex flex-col gap-1.5">
            <span className="text-body-sm font-medium text-text">{t('items.quick.availability')}</span>
            <ChoiceChips
              aria-label={t('items.quick.availability')}
              value={formData.linkType}
              onValueChange={(v) => setFormData({ ...formData, linkType: v })}
              options={[
                { value: 'specific', label: t('items.quick.only', { place: entityName }) },
                { value: 'global', label: entityType === 'store' ? t('items.quick.allStores') : t('items.quick.allHouses') },
              ]}
            />
          </div>
          <button type="submit" className="sr-only" tabIndex={-1}>{t('items.add')}</button>
        </form>
      </ResponsiveModal>
    </div>
  );
}
