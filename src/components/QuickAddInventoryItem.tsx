import { useState } from 'react';
import { Plus, X, Check, AlertCircle } from 'lucide-react';
import { Card } from './ui/card';
import { projectId, publicAnonKey } from '../utils/supabase/info';

type Props = {
  entityType: 'store' | 'production_house';
  entityId: string;
  entityName: string;
  category?: 'finished_product' | 'raw_material' | 'sauce_chutney';
  onItemAdded?: () => void;
};

export function QuickAddInventoryItem({ entityType, entityId, entityName, category = 'finished_product', onItemAdded }: Props) {
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    displayName: '',
    unit: 'pieces',
    linkType: 'specific' as 'specific' | 'global',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

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
            'Authorization': `Bearer ${publicAnonKey}`
          },
          body: JSON.stringify(payload),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to add item');
      }

      setSuccess('Item added successfully!');
      setFormData({ displayName: '', unit: 'pieces', linkType: 'specific' });
      setShowForm(false);
      
      if (onItemAdded) {
        setTimeout(onItemAdded, 500);
      }
    } catch (err) {
      console.error('Error adding item:', err);
      setError(err instanceof Error ? err.message : 'Failed to add item');
    } finally {
      setLoading(false);
    }
  };

  if (!showForm) {
    return (
      <div className="mb-4">
        {success && (
          <div className="mb-3 p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2 text-sm">
            <Check className="w-4 h-4 text-green-600" />
            <span className="text-green-800">{success}</span>
            <button onClick={() => setSuccess(null)} className="ml-auto">
              <X className="w-4 h-4 text-green-600" />
            </button>
          </div>
        )}
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg hover:shadow-md transition-all text-sm"
        >
          <Plus className="w-4 h-4" />
          Add New {category.replace('_', ' ')} Item
        </button>
      </div>
    );
  }

  return (
    <Card className="p-4 mb-4 border-2 border-purple-200 bg-purple-50/30">
      <h3 className="text-sm mb-3 flex items-center gap-2">
        <Plus className="w-4 h-4" />
        Add New Item to {entityName}
      </h3>

      {error && (
        <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-sm">
          <AlertCircle className="w-4 h-4 text-red-600" />
          <span className="text-red-800">{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="block text-xs mb-1 text-gray-700">Item Name *</label>
          <input
            type="text"
            value={formData.displayName}
            onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
            placeholder="e.g., Schezwan Momo"
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            required
            disabled={loading}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs mb-1 text-gray-700">Unit *</label>
            <select
              value={formData.unit}
              onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              required
              disabled={loading}
            >
              <option value="pieces">Pieces</option>
              <option value="kg">Kilograms (kg)</option>
              <option value="liters">Liters</option>
              <option value="grams">Grams</option>
              <option value="ml">Milliliters (ml)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs mb-1 text-gray-700">Availability *</label>
            <select
              value={formData.linkType}
              onChange={(e) => setFormData({ ...formData, linkType: e.target.value as 'specific' | 'global' })}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              disabled={loading}
            >
              <option value="specific">Only {entityName}</option>
              <option value="global">All {entityType === 'store' ? 'Stores' : 'Production Houses'}</option>
            </select>
          </div>
        </div>

        <div className="flex gap-2 justify-end pt-2">
          <button
            type="button"
            onClick={() => {
              setShowForm(false);
              setError(null);
              setFormData({ displayName: '', unit: 'pieces', linkType: 'specific' });
            }}
            className="px-4 py-2 text-sm border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
            disabled={loading}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="px-4 py-2 text-sm bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-lg hover:shadow-lg disabled:opacity-50"
            disabled={loading}
          >
            {loading ? 'Adding...' : 'Add Item'}
          </button>
        </div>
      </form>
    </Card>
  );
}
