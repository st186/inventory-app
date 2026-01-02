import { useState, useEffect } from 'react';
import { InventoryContextType } from '../App';
import * as api from '../utils/api';
import { Package, Send, CheckCircle, XCircle, Clock, AlertCircle, TrendingUp, ArrowRight, FileText, Calendar } from 'lucide-react';
import { Card } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';

type Props = {
  context: InventoryContextType;
  stores: api.Store[];
};

type RequestPriority = 'low' | 'medium' | 'high' | 'urgent';

type AuditLog = {
  timestamp: string;
  action: string;
  performedBy: string;
  details: string;
};

export function EnhancedProductionRequests({ context, stores }: Props) {
  const [activeTab, setActiveTab] = useState<'my-requests' | 'pending-fulfillment' | 'history'>('my-requests');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [selectedPriority, setSelectedPriority] = useState<RequestPriority>('medium');
  const [fulfillmentForm, setFulfillmentForm] = useState<{
    requestId: string | null;
    quantities: Record<string, number>;
    notes: string;
  }>({
    requestId: null,
    quantities: {},
    notes: '',
  });
  const [auditLogs, setAuditLogs] = useState<Record<string, AuditLog[]>>({});

  const isStoreIncharge = context.user?.designation === 'store_incharge';
  const isProductionHead = context.user?.designation === 'production_incharge';
  const userStore = stores.find(s => s.id === context.user?.storeId);
  const userProductionHouse = context.productionHouses.find(h => h.productionHeadId === context.user?.employeeId);

  // Form state for new request
  const [requestForm, setRequestForm] = useState({
    chicken: 0,
    chickenCheese: 0,
    veg: 0,
    cheeseCorn: 0,
    paneer: 0,
    vegKurkure: 0,
    chickenKurkure: 0,
    notes: '',
  });

  // Calculate request priority based on current stock and sales
  const calculateSuggestedPriority = (): RequestPriority => {
    if (!userStore) return 'medium';

    const fulfilledRequests = context.stockRequests.filter(
      req => req.storeId === userStore.id && 
      (req.status === 'fulfilled' || req.status === 'partially_fulfilled')
    );

    const totalStock = fulfilledRequests.reduce((sum, req) => {
      return sum + Object.values(req.fulfilledQuantities || {}).reduce((a, b) => a + b, 0);
    }, 0);

    const recentSales = context.salesData.filter(
      sale => sale.storeId === userStore.id &&
      new Date(sale.date) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    ).length;

    if (totalStock === 0) return 'urgent';
    if (totalStock < 100 && recentSales > 5) return 'high';
    if (totalStock < 200) return 'medium';
    return 'low';
  };

  // Add audit log entry
  const addAuditLog = (requestId: string, action: string, details: string) => {
    const log: AuditLog = {
      timestamp: new Date().toISOString(),
      action,
      performedBy: context.user?.name || 'Unknown',
      details,
    };

    setAuditLogs(prev => ({
      ...prev,
      [requestId]: [...(prev[requestId] || []), log],
    }));
  };

  const handleCreateRequest = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!userStore) {
      alert('You must be assigned to a store to create requests');
      return;
    }

    if (!userStore.productionHouseId) {
      alert('Your store is not mapped to any production house. Contact cluster head.');
      return;
    }

    const productionHouse = context.productionHouses.find(h => h.id === userStore.productionHouseId);
    if (!productionHouse) {
      alert('Production house not found');
      return;
    }

    const hasQuantity = Object.values(requestForm).some(qty => typeof qty === 'number' && qty > 0);
    if (!hasQuantity) {
      alert('Please enter at least one quantity greater than 0');
      return;
    }

    try {
      await context.createStockRequest({
        storeId: userStore.id,
        storeName: userStore.name,
        productionHouseId: productionHouse.id,
        productionHouseName: productionHouse.name,
        requestedBy: context.user?.employeeId || '',
        requestedByName: context.user?.name || '',
        requestDate: new Date().toISOString().split('T')[0],
        requestedQuantities: {
          chicken: requestForm.chicken,
          chickenCheese: requestForm.chickenCheese,
          veg: requestForm.veg,
          cheeseCorn: requestForm.cheeseCorn,
          paneer: requestForm.paneer,
          vegKurkure: requestForm.vegKurkure,
          chickenKurkure: requestForm.chickenKurkure,
        },
      });

      alert(`Stock request created successfully with ${selectedPriority} priority!`);
      setShowCreateForm(false);
      setRequestForm({
        chicken: 0,
        chickenCheese: 0,
        veg: 0,
        cheeseCorn: 0,
        paneer: 0,
        vegKurkure: 0,
        chickenKurkure: 0,
        notes: '',
      });
    } catch (error) {
      console.error('Error creating stock request:', error);
      alert('Failed to create stock request. Please try again.');
    }
  };

  const handleFulfillRequest = async (request: api.StockRequest) => {
    if (!userProductionHouse) return;

    setFulfillmentForm({
      requestId: request.id,
      quantities: { ...request.requestedQuantities },
      notes: '',
    });
  };

  const submitFulfillment = async () => {
    if (!fulfillmentForm.requestId || !userProductionHouse) return;

    const hasQuantity = Object.values(fulfillmentForm.quantities).some(qty => qty > 0);
    if (!hasQuantity) {
      alert('Please enter at least one quantity to fulfill');
      return;
    }

    try {
      await context.fulfillStockRequest(
        fulfillmentForm.requestId,
        fulfillmentForm.quantities as any,
        context.user?.employeeId || '',
        context.user?.name || '',
        fulfillmentForm.notes
      );

      alert('Stock request fulfilled successfully!');
      setFulfillmentForm({
        requestId: null,
        quantities: {},
        notes: '',
      });

      addAuditLog(
        fulfillmentForm.requestId,
        'Fulfilled',
        `Fulfilled by ${context.user?.name} - ${fulfillmentForm.notes || 'No notes'}`
      );
    } catch (error) {
      console.error('Error fulfilling stock request:', error);
      alert('Failed to fulfill stock request. Please try again.');
    }
  };

  const myRequests = context.stockRequests.filter(req => req.storeId === userStore?.id);
  const pendingForFulfillment = context.stockRequests.filter(
    req => req.productionHouseId === userProductionHouse?.id && req.status === 'pending'
  );
  const historyRequests = context.stockRequests.filter(
    req => req.status === 'fulfilled' || req.status === 'partially_fulfilled' || req.status === 'cancelled'
  );

  const getPriorityColor = (priority: RequestPriority) => {
    switch (priority) {
      case 'urgent': return 'bg-red-100 text-red-800 border-red-300';
      case 'high': return 'bg-orange-100 text-orange-800 border-orange-300';
      case 'medium': return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case 'low': return 'bg-green-100 text-green-800 border-green-300';
      default: return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  const getStatusBadge = (status: api.StockRequest['status']) => {
    const colors = {
      pending: 'bg-yellow-100 text-yellow-800 border-yellow-300',
      fulfilled: 'bg-green-100 text-green-800 border-green-300',
      partially_fulfilled: 'bg-blue-100 text-blue-800 border-blue-300',
      cancelled: 'bg-red-100 text-red-800 border-red-300',
    };
    return colors[status];
  };

  const productLabels: Record<string, string> = {
    chicken: 'Chicken',
    chickenCheese: 'Chicken Cheese',
    veg: 'Veg',
    cheeseCorn: 'Cheese Corn',
    paneer: 'Paneer',
    vegKurkure: 'Veg Kurkure',
    chickenKurkure: 'Chicken Kurkure',
  };

  const suggestedPriority = calculateSuggestedPriority();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl">Production Requests</h2>
          <p className="text-muted-foreground">Manage stock requests and fulfillment</p>
        </div>
        {isStoreIncharge && (
          <Button onClick={() => setShowCreateForm(!showCreateForm)}>
            <Send className="h-4 w-4 mr-2" />
            New Request
          </Button>
        )}
      </div>

      {/* Create Request Form */}
      {showCreateForm && isStoreIncharge && (
        <Card className="p-6">
          <h3 className="text-lg mb-4">Create Stock Request</h3>
          <form onSubmit={handleCreateRequest} className="space-y-4">
            {/* Priority Selector */}
            <div>
              <label className="block text-sm mb-2">
                Request Priority
                <Badge className={`ml-2 ${getPriorityColor(suggestedPriority)} border`}>
                  Suggested: {suggestedPriority.toUpperCase()}
                </Badge>
              </label>
              <div className="flex gap-2">
                {(['low', 'medium', 'high', 'urgent'] as RequestPriority[]).map(priority => (
                  <Button
                    key={priority}
                    type="button"
                    variant={selectedPriority === priority ? 'default' : 'outline'}
                    onClick={() => setSelectedPriority(priority)}
                    className="flex-1"
                  >
                    {priority.charAt(0).toUpperCase() + priority.slice(1)}
                  </Button>
                ))}
              </div>
            </div>

            {/* Quantities Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {Object.keys(requestForm).filter(k => k !== 'notes').map(product => (
                <div key={product}>
                  <label className="block text-sm mb-1">{productLabels[product]}</label>
                  <input
                    type="number"
                    min="0"
                    value={requestForm[product as keyof typeof requestForm] as number}
                    onChange={(e) => setRequestForm({ ...requestForm, [product]: parseInt(e.target.value) || 0 })}
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
              ))}
            </div>

            {/* Notes */}
            <div>
              <label className="block text-sm mb-1">Notes (Optional)</label>
              <textarea
                value={requestForm.notes}
                onChange={(e) => setRequestForm({ ...requestForm, notes: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg"
                rows={3}
                placeholder="Add any special instructions or notes..."
              />
            </div>

            <div className="flex gap-2">
              <Button type="submit">Create Request</Button>
              <Button type="button" variant="outline" onClick={() => setShowCreateForm(false)}>
                Cancel
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
        <TabsList className="grid grid-cols-3 w-full max-w-2xl">
          <TabsTrigger value="my-requests">
            My Requests ({myRequests.length})
          </TabsTrigger>
          <TabsTrigger value="pending-fulfillment">
            Pending ({pendingForFulfillment.length})
          </TabsTrigger>
          <TabsTrigger value="history">
            History ({historyRequests.length})
          </TabsTrigger>
        </TabsList>

        {/* My Requests */}
        <TabsContent value="my-requests" className="space-y-4">
          {myRequests.map(request => (
            <Card key={request.id} className="p-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h4 className="text-lg mb-1">{request.productionHouseName}</h4>
                  <p className="text-sm text-muted-foreground">
                    Requested on {new Date(request.requestDate).toLocaleDateString()}
                  </p>
                </div>
                <Badge className={`${getStatusBadge(request.status)} border`}>
                  {request.status.replace('_', ' ').toUpperCase()}
                </Badge>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                {Object.entries(request.requestedQuantities).map(([product, qty]) => (
                  qty > 0 && (
                    <div key={product} className="p-3 bg-gray-50 rounded-lg">
                      <p className="text-xs text-muted-foreground mb-1">{productLabels[product]}</p>
                      <p className="text-lg">
                        {qty}
                        {request.fulfilledQuantities && (
                          <span className="text-sm text-green-600 ml-2">
                            ({request.fulfilledQuantities[product as keyof typeof request.fulfilledQuantities]} fulfilled)
                          </span>
                        )}
                      </p>
                    </div>
                  )
                ))}
              </div>

              {request.notes && (
                <div className="p-3 bg-blue-50 rounded-lg">
                  <p className="text-xs text-muted-foreground mb-1">Notes</p>
                  <p className="text-sm">{request.notes}</p>
                </div>
              )}
            </Card>
          ))}
        </TabsContent>

        {/* Pending Fulfillment */}
        <TabsContent value="pending-fulfillment" className="space-y-4">
          {pendingForFulfillment.map(request => (
            <Card key={request.id} className="p-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h4 className="text-lg mb-1">{request.storeName}</h4>
                  <p className="text-sm text-muted-foreground">
                    Requested by {request.requestedByName} on {new Date(request.requestDate).toLocaleDateString()}
                  </p>
                </div>
                <Badge className="bg-yellow-100 text-yellow-800 border-yellow-300 border">
                  PENDING
                </Badge>
              </div>

              {fulfillmentForm.requestId === request.id ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {Object.entries(request.requestedQuantities).map(([product, qty]) => (
                      qty > 0 && (
                        <div key={product}>
                          <label className="block text-xs text-muted-foreground mb-1">
                            {productLabels[product]} (Requested: {qty})
                          </label>
                          <input
                            type="number"
                            min="0"
                            max={qty}
                            value={fulfillmentForm.quantities[product] || 0}
                            onChange={(e) => setFulfillmentForm({
                              ...fulfillmentForm,
                              quantities: {
                                ...fulfillmentForm.quantities,
                                [product]: parseInt(e.target.value) || 0,
                              },
                            })}
                            className="w-full px-3 py-2 border rounded-lg"
                          />
                        </div>
                      )
                    ))}
                  </div>

                  <div>
                    <label className="block text-sm mb-1">Notes</label>
                    <textarea
                      value={fulfillmentForm.notes}
                      onChange={(e) => setFulfillmentForm({ ...fulfillmentForm, notes: e.target.value })}
                      className="w-full px-3 py-2 border rounded-lg"
                      rows={2}
                      placeholder="Add fulfillment notes..."
                    />
                  </div>

                  <div className="flex gap-2">
                    <Button onClick={submitFulfillment}>
                      <CheckCircle className="h-4 w-4 mr-2" />
                      Fulfill Request
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setFulfillmentForm({ requestId: null, quantities: {}, notes: '' })}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                    {Object.entries(request.requestedQuantities).map(([product, qty]) => (
                      qty > 0 && (
                        <div key={product} className="p-3 bg-gray-50 rounded-lg">
                          <p className="text-xs text-muted-foreground mb-1">{productLabels[product]}</p>
                          <p className="text-lg">{qty}</p>
                        </div>
                      )
                    ))}
                  </div>
                  <Button onClick={() => handleFulfillRequest(request)}>
                    Process Request
                  </Button>
                </div>
              )}
            </Card>
          ))}
        </TabsContent>

        {/* History */}
        <TabsContent value="history" className="space-y-4">
          {historyRequests.map(request => (
            <Card key={request.id} className="p-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h4 className="text-lg mb-1">{request.storeName} ← {request.productionHouseName}</h4>
                  <p className="text-sm text-muted-foreground">
                    {new Date(request.requestDate).toLocaleDateString()}
                    {request.fulfillmentDate && (
                      <span> → Fulfilled on {new Date(request.fulfillmentDate).toLocaleDateString()}</span>
                    )}
                  </p>
                </div>
                <Badge className={`${getStatusBadge(request.status)} border`}>
                  {request.status.replace('_', ' ').toUpperCase()}
                </Badge>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {Object.entries(request.requestedQuantities).map(([product, qty]) => (
                  qty > 0 && (
                    <div key={product} className="p-3 bg-gray-50 rounded-lg">
                      <p className="text-xs text-muted-foreground mb-1">{productLabels[product]}</p>
                      <div className="flex items-center gap-2">
                        <p className="text-lg">{qty}</p>
                        {request.fulfilledQuantities && (
                          <>
                            <ArrowRight className="h-4 w-4 text-muted-foreground" />
                            <p className={`text-lg ${
                              request.fulfilledQuantities[product as keyof typeof request.fulfilledQuantities] >= qty
                                ? 'text-green-600'
                                : 'text-orange-600'
                            }`}>
                              {request.fulfilledQuantities[product as keyof typeof request.fulfilledQuantities]}
                            </p>
                          </>
                        )}
                      </div>
                    </div>
                  )
                ))}
              </div>

              {request.notes && (
                <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                  <p className="text-xs text-muted-foreground mb-1">Fulfillment Notes</p>
                  <p className="text-sm">{request.notes}</p>
                </div>
              )}
            </Card>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}
