// Pending production entries for the operations manager / cluster head (moved out of ProductionManagement.tsx unchanged).
import { useState } from 'react';
import type { InventoryContextType, ProductionData } from '../../App';
import { CheckCircle, AlertTriangle, CheckSquare } from 'lucide-react';

type Props = {
  context: InventoryContextType;
  isPendingForViewer: (p: ProductionData) => boolean;
};

export function ProductionApprovals({ context, isPendingForViewer }: Props) {
  // The pending-approvals list's own Approve buttons: one approval at a time, so a double tap
  // can't send the same approval twice.
  const [approvingId, setApprovingId] = useState<string | null>(null);

  return (
        <div className="space-y-4">
          {(() => {
            const pendingProduction = context.productionData
              .filter(isPendingForViewer)
              .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

            if (pendingProduction.length === 0) {
              return (
                <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-12 text-center">
                  <CheckCircle className="w-16 h-16 mx-auto text-green-500 mb-4" />
                  <h3 className="text-xl font-bold text-gray-900 tracking-tight mb-2">All Caught Up!</h3>
                  <p className="text-gray-600">No pending production approvals at this time.</p>
                </div>
              );
            }

            return pendingProduction.map((production) => {
              const totalProduction = 
                production.chickenMomos.final +
                production.chickenCheeseMomos.final +
                production.vegMomos.final +
                production.cheeseCornMomos.final +
                production.paneerMomos.final +
                production.vegKurkureMomos.final +
                production.chickenKurkureMomos.final;

              const totalWastage =
                production.wastage.dough +
                production.wastage.stuffing +
                production.wastage.batter +
                production.wastage.coating;

              return (
                <div key={production.id} className="bg-white rounded-2xl shadow-sm border-2 border-yellow-300 p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <AlertTriangle className="w-5 h-5 text-yellow-600" />
                        <h3 className="text-xl font-bold text-gray-900 tracking-tight">
                          {new Date(production.date).toLocaleDateString('en-US', {
                            weekday: 'long',
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric'
                          })}
                        </h3>
                      </div>
                      <p className="text-sm text-gray-600">Submitted by: {production.createdBy}</p>
                    </div>
                    <button
                      onClick={async () => {
                        if (approvingId) return;
                        setApprovingId(production.id);
                        try {
                          await context.approveProductionData(production.id);
                          alert('Production data approved successfully!');
                        } catch (error) {
                          alert('Failed to approve production data. Please try again.');
                        } finally {
                          setApprovingId(null);
                        }
                      }}
                      disabled={approvingId !== null}
                      className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2 disabled:opacity-60 disabled:cursor-wait"
                    >
                      <CheckSquare className="w-5 h-5" />
                      {approvingId === production.id ? 'Approving...' : 'Approve'}
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 mb-4">
                    <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl p-4 shadow-lg shadow-orange-500/20 text-white">
                      <div className="text-xs uppercase tracking-wide text-orange-100 mb-1">Total Production</div>
                      <div className="text-2xl font-semibold">{totalProduction} pcs</div>
                    </div>
                    <div className="bg-gradient-to-br from-red-500 to-red-600 rounded-xl p-4 shadow-lg shadow-red-500/20 text-white">
                      <div className="text-xs uppercase tracking-wide text-red-100 mb-1">Total Wastage</div>
                      <div className="text-2xl font-semibold">{totalWastage.toFixed(2)} kg</div>
                    </div>
                    <div className="bg-gradient-to-br from-amber-500 to-amber-600 rounded-xl p-4 shadow-lg shadow-amber-500/20 text-white">
                      <div className="text-xs uppercase tracking-wide text-amber-100 mb-1">Kurkure Production</div>
                      <div className="text-2xl font-semibold">
                        {production.vegKurkureMomos.final + production.chickenKurkureMomos.final} pcs
                      </div>
                    </div>
                    <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-4 shadow-lg shadow-blue-500/20 text-white">
                      <div className="text-xs uppercase tracking-wide text-blue-100 mb-1">Regular Momos</div>
                      <div className="text-2xl font-semibold">
                        {production.chickenMomos.final +
                          production.chickenCheeseMomos.final +
                          production.vegMomos.final +
                          production.cheeseCornMomos.final +
                          production.paneerMomos.final}{' '}
                        pcs
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-gray-200 pt-4">
                    <h4 className="text-sm text-gray-700 mb-3">Production Breakdown:</h4>
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2 text-xs">
                      {production.chickenMomos.final > 0 && (
                        <div className="bg-red-50 p-2 rounded">
                          <p className="text-gray-600">Chicken</p>
                          <p className="text-gray-900">{production.chickenMomos.final} pcs</p>
                        </div>
                      )}
                      {production.chickenCheeseMomos.final > 0 && (
                        <div className="bg-yellow-50 p-2 rounded">
                          <p className="text-gray-600">Chk Cheese</p>
                          <p className="text-gray-900">{production.chickenCheeseMomos.final} pcs</p>
                        </div>
                      )}
                      {production.vegMomos.final > 0 && (
                        <div className="bg-green-50 p-2 rounded">
                          <p className="text-gray-600">Veg</p>
                          <p className="text-gray-900">{production.vegMomos.final} pcs</p>
                        </div>
                      )}
                      {production.cheeseCornMomos.final > 0 && (
                        <div className="bg-amber-50 p-2 rounded">
                          <p className="text-gray-600">Cheese Corn</p>
                          <p className="text-gray-900">{production.cheeseCornMomos.final} pcs</p>
                        </div>
                      )}
                      {production.paneerMomos.final > 0 && (
                        <div className="bg-blue-50 p-2 rounded">
                          <p className="text-gray-600">Paneer</p>
                          <p className="text-gray-900">{production.paneerMomos.final} pcs</p>
                        </div>
                      )}
                      {production.vegKurkureMomos.final > 0 && (
                        <div className="bg-lime-50 p-2 rounded">
                          <p className="text-gray-600">Veg Kurkure</p>
                          <p className="text-gray-900">{production.vegKurkureMomos.final} pcs</p>
                        </div>
                      )}
                      {production.chickenKurkureMomos.final > 0 && (
                        <div className="bg-orange-50 p-2 rounded">
                          <p className="text-gray-600">Chk Kurkure</p>
                          <p className="text-gray-900">{production.chickenKurkureMomos.final} pcs</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            });
          })()}
        </div>
  );
}
