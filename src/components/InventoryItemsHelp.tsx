import { Package, Store as StoreIcon, Factory, Globe } from 'lucide-react';
import { Card } from './ui/card';

export function InventoryItemsHelp() {
  return (
    <div className="space-y-6 p-6 max-w-5xl mx-auto">
      <div className="text-center mb-8">
        <h2 className="text-3xl text-gray-900 mb-3">
          Understanding Inventory Items
        </h2>
        <p className="text-gray-600 max-w-2xl mx-auto">
          The Dynamic Inventory Items system allows you to add custom products beyond the default momo types,
          with flexible linking to stores and production houses.
        </p>
      </div>

      {/* Three Types of Items */}
      <div className="grid md:grid-cols-3 gap-4">
        <Card className="p-6 border-2 border-blue-200 bg-blue-50/30">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-full bg-blue-500 flex items-center justify-center">
              <Globe className="w-6 h-6 text-white" />
            </div>
            <h3 className="text-lg">Global Items</h3>
          </div>
          <p className="text-sm text-gray-600 mb-3">
            Available to <strong>all stores and production houses</strong> in the system.
          </p>
          <div className="bg-white rounded-lg p-3 text-xs">
            <strong>Example:</strong> Standard menu items like Chicken Momo, Veg Momo that all locations sell.
          </div>
        </Card>

        <Card className="p-6 border-2 border-green-200 bg-green-50/30">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-full bg-green-500 flex items-center justify-center">
              <StoreIcon className="w-6 h-6 text-white" />
            </div>
            <h3 className="text-lg">Store-Specific</h3>
          </div>
          <p className="text-sm text-gray-600 mb-3">
            Linked to a <strong>specific store ID</strong>. Only that store can track this item.
          </p>
          <div className="bg-white rounded-lg p-3 text-xs">
            <strong>Example:</strong> Regional specialty items or test products available only at certain outlets.
          </div>
        </Card>

        <Card className="p-6 border-2 border-orange-200 bg-orange-50/30">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-full bg-orange-500 flex items-center justify-center">
              <Factory className="w-6 h-6 text-white" />
            </div>
            <h3 className="text-lg">Production House</h3>
          </div>
          <p className="text-sm text-gray-600 mb-3">
            Linked to a <strong>specific production house ID</strong>. Only that facility produces it.
          </p>
          <div className="bg-white rounded-lg p-3 text-xs">
            <strong>Example:</strong> Specialty items made only at facilities with specific equipment.
          </div>
        </Card>
      </div>

      {/* How It Works */}
      <Card className="p-6 bg-gradient-to-r from-purple-50 to-pink-50 border-2 border-purple-200">
        <h3 className="text-xl mb-4 flex items-center gap-2">
          <Package className="w-6 h-6 text-purple-600" />
          How the System Works
        </h3>
        <div className="space-y-3 text-sm text-gray-700">
          <div className="flex items-start gap-3">
            <div className="w-6 h-6 rounded-full bg-purple-600 text-white flex items-center justify-center flex-shrink-0 text-xs">
              1
            </div>
            <div>
              <strong>Create Items:</strong> Add new inventory items from the "Manage Items" page or use Quick Add buttons on stock pages.
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-6 h-6 rounded-full bg-purple-600 text-white flex items-center justify-center flex-shrink-0 text-xs">
              2
            </div>
            <div>
              <strong>Link to Entity:</strong> Choose whether the item should be global, store-specific, or production house-specific.
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-6 h-6 rounded-full bg-purple-600 text-white flex items-center justify-center flex-shrink-0 text-xs">
              3
            </div>
            <div>
              <strong>Automatic Availability:</strong> The item automatically appears in relevant stock analyses, production logs, and sales tracking.
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-6 h-6 rounded-full bg-purple-600 text-white flex items-center justify-center flex-shrink-0 text-xs">
              4
            </div>
            <div>
              <strong>Track & Analyze:</strong> All linked items are included in analytics, reports, and stock calculations for their respective entities.
            </div>
          </div>
        </div>
      </Card>

      {/* Categories */}
      <div className="grid md:grid-cols-3 gap-4">
        <Card className="p-4 text-center border-2 border-purple-200">
          <div className="text-3xl mb-2">🥟</div>
          <h4 className="font-semibold mb-1">Finished Products</h4>
          <p className="text-xs text-gray-600">
            Ready-to-sell items like momos, dumplings, prepared foods
          </p>
        </Card>

        <Card className="p-4 text-center border-2 border-blue-200">
          <div className="text-3xl mb-2">🥬</div>
          <h4 className="font-semibold mb-1">Raw Materials</h4>
          <p className="text-xs text-gray-600">
            Ingredients like flour, vegetables, meat, spices
          </p>
        </Card>

        <Card className="p-4 text-center border-2 border-orange-200">
          <div className="text-3xl mb-2">🌶️</div>
          <h4 className="font-semibold mb-1">Sauces & Chutneys</h4>
          <p className="text-xs text-gray-600">
            Condiments, dips, sauces, chutneys, dressings
          </p>
        </Card>
      </div>

      {/* Quick Tips */}
      <Card className="p-6 bg-yellow-50 border-2 border-yellow-200">
        <h3 className="text-lg mb-3 flex items-center gap-2">
          💡 <strong>Quick Tips</strong>
        </h3>
        <ul className="space-y-2 text-sm text-gray-700">
          <li className="flex items-start gap-2">
            <span className="text-yellow-600">▸</span>
            <span><strong>Default Items:</strong> The 7 original momo types are pre-configured as global items</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-yellow-600">▸</span>
            <span><strong>No Limits:</strong> You can add as many custom items as needed</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-yellow-600">▸</span>
            <span><strong>Easy Updates:</strong> Edit or delete items anytime from the Manage Items page</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-yellow-600">▸</span>
            <span><strong>Flexible Units:</strong> Choose from pieces, kg, liters, grams, ml based on your needs</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-yellow-600">▸</span>
            <span><strong>Safe Deletion:</strong> Deleted items are soft-deleted (archived) and can be reviewed later</span>
          </li>
        </ul>
      </Card>

      {/* Access Info */}
      <Card className="p-6 bg-gradient-to-r from-indigo-50 to-purple-50 border-2 border-indigo-200">
        <h3 className="text-lg mb-3"><strong>Who Can Manage Items?</strong></h3>
        <div className="grid md:grid-cols-2 gap-4 text-sm">
          <div>
            <h4 className="font-semibold text-purple-600 mb-2">✅ Full Access</h4>
            <ul className="space-y-1 text-gray-700">
              <li>• Operations Managers</li>
              <li>• Cluster Heads</li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold text-blue-600 mb-2">👁️ View Only</h4>
            <ul className="space-y-1 text-gray-700">
              <li>• Store Incharges (via Quick Add)</li>
              <li>• Production Incharges (via Quick Add)</li>
            </ul>
          </div>
        </div>
      </Card>

      {/* Navigation Help */}
      <div className="bg-gray-100 rounded-lg p-6 text-center">
        <p className="text-gray-700 mb-4">
          Ready to manage your inventory items?
        </p>
        <div className="flex gap-3 justify-center flex-wrap">
          <button 
            onClick={() => window.location.hash = '#manage-items'}
            className="px-6 py-2 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-lg hover:shadow-lg transition-all"
          >
            Go to Manage Items
          </button>
          <button 
            onClick={() => window.open('/INVENTORY_ITEMS_GUIDE.md', '_blank')}
            className="px-6 py-2 bg-white text-gray-700 border-2 border-gray-300 rounded-lg hover:bg-gray-50 transition-all"
          >
            Read Full Guide
          </button>
        </div>
      </div>
    </div>
  );
}
