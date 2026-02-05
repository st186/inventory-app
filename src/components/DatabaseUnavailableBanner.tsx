import { AlertTriangle, RefreshCw } from 'lucide-react';

type Props = {
  onRetry?: () => void;
};

export function DatabaseUnavailableBanner({ onRetry }: Props) {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
      <div className="bg-gradient-to-r from-yellow-50 to-orange-50 border-2 border-yellow-400 rounded-lg p-4 flex items-center justify-between shadow-md">
        <div className="flex items-center gap-3">
          <AlertTriangle className="w-6 h-6 text-yellow-600" />
          <div>
            <h3 className="font-semibold text-yellow-900">Database Temporarily Unavailable</h3>
            <p className="text-sm text-yellow-700">
              We're experiencing connectivity issues with the database. Please try again in a moment.
            </p>
          </div>
        </div>
        {onRetry && (
          <button
            onClick={onRetry}
            className="flex items-center gap-2 px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Retry
          </button>
        )}
      </div>
    </div>
  );
}
