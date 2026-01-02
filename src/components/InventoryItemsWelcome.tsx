import { Package, Check, ArrowRight, Sparkles } from 'lucide-react';
import { Card } from './ui/card';

type Props = {
  onGetStarted: () => void;
  onViewGuide: () => void;
};

export function InventoryItemsWelcome({ onGetStarted, onViewGuide }: Props) {
  return (
    <div className="min-h-[600px] flex items-center justify-center p-6">
      <div className="max-w-3xl w-full space-y-6">
        {/* Hero Section */}
        <div className="text-center space-y-4">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 mb-4">
            <Package className="w-10 h-10 text-white" />
          </div>
          
          <div className="flex items-center justify-center gap-2 text-sm text-purple-600">
            <Sparkles className="w-4 h-4" />
            <span className="font-semibold">NEW FEATURE</span>
            <Sparkles className="w-4 h-4" />
          </div>
          
          <h1 className="text-4xl text-gray-900">
            Welcome to Dynamic Inventory Items!
          </h1>
          
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Go beyond the default 7 momo types. Add custom items, manage categories, 
            and track inventory with complete flexibility.
          </p>
        </div>

        {/* Features Grid */}
        <div className="grid md:grid-cols-3 gap-4 my-8">
          <Card className="p-6 border-2 border-purple-200 bg-purple-50/30">
            <div className="w-12 h-12 rounded-full bg-purple-500 flex items-center justify-center mb-4">
              <Check className="w-6 h-6 text-white" />
            </div>
            <h3 className="font-semibold mb-2">Unlimited Items</h3>
            <p className="text-sm text-gray-600">
              Add as many custom products as you need. No restrictions.
            </p>
          </Card>

          <Card className="p-6 border-2 border-pink-200 bg-pink-50/30">
            <div className="w-12 h-12 rounded-full bg-pink-500 flex items-center justify-center mb-4">
              <Check className="w-6 h-6 text-white" />
            </div>
            <h3 className="font-semibold mb-2">Smart Linking</h3>
            <p className="text-sm text-gray-600">
              Link items to specific stores, production houses, or make them global.
            </p>
          </Card>

          <Card className="p-6 border-2 border-indigo-200 bg-indigo-50/30">
            <div className="w-12 h-12 rounded-full bg-indigo-500 flex items-center justify-center mb-4">
              <Check className="w-6 h-6 text-white" />
            </div>
            <h3 className="font-semibold mb-2">Easy Management</h3>
            <p className="text-sm text-gray-600">
              Simple interface to add, edit, delete, and organize all your items.
            </p>
          </Card>
        </div>

        {/* Steps */}
        <Card className="p-8 bg-gradient-to-br from-gray-50 to-gray-100">
          <h2 className="text-xl mb-6 text-center">Getting Started in 3 Easy Steps</h2>
          
          <div className="space-y-4">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white">
                1
              </div>
              <div>
                <h4 className="font-semibold mb-1">Initialize Default Items</h4>
                <p className="text-sm text-gray-600">
                  Click "Initialize Defaults" to add the 7 standard momo types as global items. 
                  You only need to do this once.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white">
                2
              </div>
              <div>
                <h4 className="font-semibold mb-1">Add Your Custom Items</h4>
                <p className="text-sm text-gray-600">
                  Use "Add New Item" to create store-specific products, regional specialties, 
                  or test items for specific locations.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white">
                3
              </div>
              <div>
                <h4 className="font-semibold mb-1">Track & Analyze</h4>
                <p className="text-sm text-gray-600">
                  Your items automatically appear in stock analysis, production logs, 
                  and sales tracking across the system.
                </p>
              </div>
            </div>
          </div>
        </Card>

        {/* Categories Preview */}
        <div className="grid md:grid-cols-3 gap-3">
          <div className="p-4 rounded-lg border-2 border-purple-200 bg-purple-50 text-center">
            <div className="text-3xl mb-2">🥟</div>
            <div className="text-sm">
              <strong>Finished Products</strong>
              <p className="text-xs text-gray-600 mt-1">Ready-to-sell items</p>
            </div>
          </div>
          
          <div className="p-4 rounded-lg border-2 border-blue-200 bg-blue-50 text-center">
            <div className="text-3xl mb-2">🥬</div>
            <div className="text-sm">
              <strong>Raw Materials</strong>
              <p className="text-xs text-gray-600 mt-1">Ingredients & supplies</p>
            </div>
          </div>
          
          <div className="p-4 rounded-lg border-2 border-orange-200 bg-orange-50 text-center">
            <div className="text-3xl mb-2">🌶️</div>
            <div className="text-sm">
              <strong>Sauces & Chutneys</strong>
              <p className="text-xs text-gray-600 mt-1">Condiments & dips</p>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-4 justify-center pt-4">
          <button
            onClick={onGetStarted}
            className="flex items-center gap-2 px-8 py-4 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-xl hover:shadow-xl transition-all text-lg"
          >
            Get Started
            <ArrowRight className="w-5 h-5" />
          </button>
          
          <button
            onClick={onViewGuide}
            className="flex items-center gap-2 px-8 py-4 bg-white text-gray-700 border-2 border-gray-300 rounded-xl hover:bg-gray-50 transition-all text-lg"
          >
            View Full Guide
          </button>
        </div>

        {/* Footer Note */}
        <div className="text-center text-sm text-gray-500 pt-4">
          <p>💡 Tip: You can always access the guide later from the help section</p>
        </div>
      </div>
    </div>
  );
}
