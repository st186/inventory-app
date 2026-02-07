import React from 'react';

export const LoadingSkeleton: React.FC = () => {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 animate-pulse">
      {/* Header Skeleton */}
      <div className="mb-6">
        <div className="h-8 bg-gradient-to-r from-purple-200 to-pink-200 rounded-lg w-64 mb-4"></div>
        <div className="h-4 bg-gray-200 rounded w-96"></div>
      </div>
      
      {/* Cards Grid Skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
            <div className="h-4 bg-gray-200 rounded w-24 mb-4"></div>
            <div className="h-10 bg-gradient-to-r from-purple-100 to-pink-100 rounded-lg w-32 mb-2"></div>
            <div className="h-3 bg-gray-100 rounded w-48"></div>
          </div>
        ))}
      </div>
      
      {/* Large Content Area Skeleton */}
      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
        <div className="space-y-4">
          <div className="h-6 bg-gray-200 rounded w-48"></div>
          <div className="h-4 bg-gray-100 rounded w-full"></div>
          <div className="h-4 bg-gray-100 rounded w-full"></div>
          <div className="h-4 bg-gray-100 rounded w-3/4"></div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
            <div className="h-32 bg-gradient-to-br from-purple-50 to-pink-50 rounded-lg"></div>
            <div className="h-32 bg-gradient-to-br from-purple-50 to-pink-50 rounded-lg"></div>
          </div>
        </div>
      </div>
      
      {/* Loading indicator */}
      <div className="fixed bottom-4 right-4 bg-gradient-to-r from-purple-500 to-pink-500 text-white px-6 py-3 rounded-full shadow-lg flex items-center gap-2">
        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
        <span className="font-medium">Loading...</span>
      </div>
    </div>
  );
};

// Compact skeleton for mobile-optimized views
export const CompactLoadingSkeleton: React.FC = () => {
  return (
    <div className="px-3 py-4 animate-pulse">
      {/* Mobile header */}
      <div className="mb-4">
        <div className="h-6 bg-gradient-to-r from-purple-200 to-pink-200 rounded w-48 mb-2"></div>
        <div className="h-3 bg-gray-200 rounded w-64"></div>
      </div>
      
      {/* Compact cards */}
      <div className="space-y-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="bg-white rounded-lg p-4 shadow-sm border border-gray-100">
            <div className="flex justify-between items-center">
              <div className="flex-1">
                <div className="h-3 bg-gray-200 rounded w-20 mb-2"></div>
                <div className="h-6 bg-gradient-to-r from-purple-100 to-pink-100 rounded w-24"></div>
              </div>
              <div className="w-12 h-12 bg-gradient-to-br from-purple-50 to-pink-50 rounded-full"></div>
            </div>
          </div>
        ))}
      </div>
      
      {/* Bottom loading */}
      <div className="mt-6 text-center">
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-100 to-pink-100 rounded-full">
          <div className="w-3 h-3 border-2 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
          <span className="text-sm text-purple-700 font-medium">Loading...</span>
        </div>
      </div>
    </div>
  );
};
