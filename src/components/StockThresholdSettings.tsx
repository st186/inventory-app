import { useState } from 'react';
import { X, Save, Settings } from 'lucide-react';
import { toast } from 'sonner@2.0.3';
import * as api from '../utils/api';

type ThresholdSettings = {
  [key: string]: {
    high: number;
    medium: number;
    low: number;
  };
};

type Props = {
  storeId: string;
  accessToken: string;
  thresholds: ThresholdSettings;
  onClose: () => void;
  onSave: (thresholds: ThresholdSettings) => void;
};

export function StockThresholdSettings({ storeId, accessToken, thresholds, onClose, onSave }: Props) {
  const [localThresholds, setLocalThresholds] = useState(thresholds);
  const [saving, setSaving] = useState(false);

  const momoTypes = [
    { key: 'chicken', label: 'Chicken Momos' },
    { key: 'chickenCheese', label: 'Chicken Cheese Momos' },
    { key: 'veg', label: 'Veg Momos' },
    { key: 'cheeseCorn', label: 'Cheese Corn Momos' },
    { key: 'paneer', label: 'Paneer Momos' },
    { key: 'vegKurkure', label: 'Veg Kurkure Momos' },
    { key: 'chickenKurkure', label: 'Chicken Kurkure Momos' },
  ];

  const handleChange = (momoKey: string, level: 'high' | 'medium' | 'low', value: string) => {
    const numValue = parseInt(value) || 0;
    setLocalThresholds({
      ...localThresholds,
      [momoKey]: {
        ...localThresholds[momoKey],
        [level]: numValue
      }
    });
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      await api.saveStockThresholds(accessToken, storeId, localThresholds);
      onSave(localThresholds);
      toast.success('Stock thresholds saved successfully');
      onClose();
    } catch (error) {
      console.error('Error saving thresholds:', error);
      toast.error('Failed to save thresholds');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-600 to-pink-500 p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white/20 backdrop-blur-sm rounded-lg flex items-center justify-center">
                <Settings className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-xl text-white">Stock Alert Thresholds</h2>
                <p className="text-sm text-white/80">Customize alert levels for each momo type</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 bg-white/20 backdrop-blur-sm rounded-lg flex items-center justify-center hover:bg-white/30 transition-all"
            >
              <X className="w-5 h-5 text-white" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-4 mb-6">
            <p className="text-sm text-blue-900">
              <strong>How it works:</strong> Set three threshold levels for each momo type. 
              When stock falls below these levels, color-coded alerts will appear on the stock cards.
            </p>
            <div className="mt-3 flex flex-wrap gap-4">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-green-500 rounded"></div>
                <span className="text-xs text-gray-700">High: Stock above high threshold</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-yellow-500 rounded"></div>
                <span className="text-xs text-gray-700">Medium: Between medium and high</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-orange-500 rounded"></div>
                <span className="text-xs text-gray-700">Low: Between low and medium</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-red-500 rounded"></div>
                <span className="text-xs text-gray-700">Critical: Below low threshold or zero</span>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            {momoTypes.map(({ key, label }) => {
              const threshold = localThresholds[key] || { high: 600, medium: 300, low: 150 };
              
              return (
                <div key={key} className="bg-gradient-to-r from-purple-50 to-pink-50 border-2 border-purple-200 rounded-xl p-4">
                  <h3 className="text-sm font-semibold text-gray-900 mb-3">{label}</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="text-xs text-gray-600 mb-1 block">High Threshold (plates)</label>
                      <input
                        type="number"
                        value={threshold.high}
                        onChange={(e) => handleChange(key, 'high', e.target.value)}
                        className="w-full px-3 py-2 border-2 border-green-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                        placeholder="e.g., 1200"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-600 mb-1 block">Medium Threshold (plates)</label>
                      <input
                        type="number"
                        value={threshold.medium}
                        onChange={(e) => handleChange(key, 'medium', e.target.value)}
                        className="w-full px-3 py-2 border-2 border-yellow-300 rounded-lg focus:ring-2 focus:ring-yellow-500 focus:border-transparent"
                        placeholder="e.g., 600"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-600 mb-1 block">Low Threshold (plates)</label>
                      <input
                        type="number"
                        value={threshold.low}
                        onChange={(e) => handleChange(key, 'low', e.target.value)}
                        className="w-full px-3 py-2 border-2 border-red-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                        placeholder="e.g., 300"
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t-2 border-gray-200 p-6 bg-gray-50 flex justify-between items-center">
          <button
            onClick={onClose}
            className="px-6 py-3 bg-white border-2 border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 transition-all"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-500 text-white rounded-xl hover:from-purple-700 hover:to-pink-600 transition-all flex items-center gap-2 disabled:opacity-50"
          >
            {saving ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                Saving...
              </>
            ) : (
              <>
                <Save className="w-5 h-5" />
                Save Thresholds
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
