import { useState, useEffect, useMemo } from 'react';
import { InventoryContextType } from '../App';
import * as api from '../utils/api';
import { toast } from 'sonner@2.0.3';
import { Package, Clock, CheckCircle, Truck, Calendar, User, Store, Send, ArrowRight, Filter, TrendingUp, ChevronDown, ChevronUp, Settings, AlertTriangle, X, Utensils, Droplet, Box, ArrowUp, ArrowDown, Minus, RefreshCw, FileText, Trash2, Sparkles, Loader2 } from 'lucide-react';
import { getSupabaseClient } from '../utils/supabase/client';
import { getAssignedProductionHouseIds, getAssignedStoreIds, getDefaultStoreId } from '../utils/entityAccess';
import { EventMomoReturnsCard } from './events/EventMomoReturnsCard';
import { bagSize, bagsLabel, roundUpToBags, isPhase1Live } from '../utils/batches';
import { getTodayIST } from '../utils/timezone';
import { suggestRequest, type ForecastDay, type MomoKey } from '../utils/forecast';
import { ShipDialogBags, PackingFields, DispatchDraft, emptyDispatchDraft, buildDispatchInfo } from './dispatch/ShipDialogBags';
import { DispatchSlipModal, DispatchDetails } from './dispatch/DispatchSlip';
import { ReceiveDeliveryDialog, ReceiptSummary } from './dispatch/ReceiveDeliveryDialog';

import { useStockRequests, type StockRequestsProps } from './stock/useStockRequests';
import { StockStatusSection } from './stock/StockStatusSection';
import { StoreRequestForm } from './stock/StoreRequestForm';
import { RequestHistory } from './stock/RequestHistory';
import { RequestDialogs } from './stock/RequestDialogs';

type ProductionRequestsProps = StockRequestsProps;

export function ProductionRequests(props: ProductionRequestsProps) {
  const vm = useStockRequests(props);
  const { loading, isStoreIncharge, isProductionHead, isOperationsHead, isClusterHead, storeDisplayName } = vm;


  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="relative overflow-hidden bg-gradient-to-br from-orange-500 via-orange-600 to-red-600 rounded-2xl shadow-lg p-4 sm:p-6 text-white">
        <div className="absolute -right-6 -top-6 w-28 h-28 bg-white/10 rounded-full" />
        <div className="absolute -right-2 top-10 w-16 h-16 bg-white/10 rounded-full" />
        <div className="relative flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
            <Package className="w-6 h-6" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl sm:text-3xl font-bold leading-tight">Daily Stock Requests</h1>
            <p className="text-xs sm:text-base text-orange-50 mt-0.5">
              {isStoreIncharge && 'Submit your daily stock requirements before 9:00 AM'}
              {isProductionHead && 'Manage incoming stock requests and track fulfillment'}
              {(isOperationsHead || isClusterHead) && 'Monitor stock request workflow across stores'}
              {storeDisplayName && ` · ${storeDisplayName}`}
            </p>
          </div>
        </div>
      </div>

      {/* Leftover momos coming back from event stalls (events.ts): production counts them in. */}
      {(isProductionHead || isOperationsHead || isClusterHead) && <EventMomoReturnsCard />}

      <StockStatusSection vm={vm} />

      <StoreRequestForm vm={vm} />

      <RequestHistory vm={vm} />

      <RequestDialogs vm={vm} />
    </div>
  );
}
