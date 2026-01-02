import { useState, useMemo, useEffect } from 'react';
import { InventoryContextType } from '../App';
import * as api from '../utils/api';
import { Package, TrendingUp, TrendingDown, Calendar, Factory } from 'lucide-react';
import { Card } from './ui/card';
import { getSupabaseClient } from '../utils/supabase/client';

type Props = {
  context: InventoryContextType;
  productionHouses: api.ProductionHouse[];
};

type ProductionHouseStock = {
  productionHouseId: string;
  productionHouseName: string;
  date: string;
  stock: {
    chicken: { produced: number; sent: number; available: number; percentage: number };
    chickenCheese: { produced: number; sent: number; available: number; percentage: number };
    veg: { produced: number; sent: number; available: number; percentage: number };
    cheeseCorn: { produced: number; sent: number; available: number; percentage: number };
    paneer: { produced: number; sent: number; available: number; percentage: number };
    vegKurkure: { produced: number; sent: number; available: number; percentage: number };
    chickenKurkure: { produced: number; sent: number; available: number; percentage: number };
  };
  totalProduced: number;
  totalWastage: number;
  approvedEntries: number;
  pendingApproval: number;
};

export function ProductionHouseStockStatus({ context, productionHouses }: Props) {
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedProductionHouse, setSelectedProductionHouse] = useState<string | null>(null);
  const [productionRequests, setProductionRequests] = useState<api.ProductionRequest[]>([]);
  const [stores, setStores] = useState<api.Store[]>([]);
  const [loading, setLoading] = useState(true);

  // Helper function to get fresh access token
  const getFreshAccessToken = async (): Promise<string | null> => {
    try {
      const supabase = getSupabaseClient();
      const { data: { session } } = await supabase.auth.getSession();
      return session?.access_token || null;
    } catch (error) {
      console.error('Error getting fresh token:', error);
      return null;
    }
  };

  // Load production requests and stores
  useEffect(() => {
    const loadData = async () => {
      const token = await getFreshAccessToken();
      if (!token) {
        console.error('No access token available');
        setLoading(false);
        return;
      }

      try {
        const [requestsData, storesData] = await Promise.all([
          api.fetchProductionRequests(token),
          api.getStores(),
        ]);
        setProductionRequests(requestsData);
        setStores(storesData);
      } catch (error) {
        console.error('Error loading data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  // Calculate stock for production houses on selected date
  const productionHouseStocks = useMemo(() => {
    if (loading) return [];
    const stocks: ProductionHouseStock[] = [];

    console.log('🏭 Production Houses:', productionHouses);
    console.log('🏪 Stores:', stores);
    console.log('📦 Production Requests:', productionRequests);
    console.log('📅 Selected Date:', selectedDate);

    productionHouses.forEach(house => {
      console.log(`\n🏭 Processing house: ${house.name} (${house.id})`);
      
      // Find stores mapped to this production house
      const houseStores = stores.filter(s => s.productionHouseId === house.id);
      console.log(`  🏪 Stores mapped to this house:`, houseStores.map(s => ({ id: s.id, name: s.name })));

      // Get all production data up to and including selected date for this house
      const allPreviousProduction = context.productionData.filter(
        prod => prod.productionHouseId === house.id && prod.date <= selectedDate
      );

      // Get all delivered requests up to and including selected date for this house
      // Using deliveredAt date, and checking status is 'delivered'
      const allDeliveredRequests = productionRequests?.filter(
        req => {
          if (!req.deliveredAt || req.status !== 'delivered') {
            return false;
          }
          
          // Extract date from deliveredAt timestamp (format: "31/12/2025, 00:29:07" or "2025-12-31")
          let deliveredDate: string;
          if (req.deliveredAt.includes('/')) {
            // Format: "31/12/2025, 00:29:07"
            const parts = req.deliveredAt.split(',')[0].split('/');
            deliveredDate = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
          } else if (req.deliveredAt.includes('T')) {
            // ISO format: "2025-12-31T00:29:07"
            deliveredDate = req.deliveredAt.split('T')[0];
          } else {
            // Already in YYYY-MM-DD format
            deliveredDate = req.deliveredAt.split(' ')[0];
          }
          
          // Find the store that made this request
          const store = stores.find(s => s.id === req.storeId);
          
          // Check if request is for a store mapped to this production house and delivered before or on selected date
          const isForThisHouse = store?.productionHouseId === house.id;
          const isBeforeOrOnDate = deliveredDate <= selectedDate;
          
          console.log(`    📦 Request ${req.id}: storeId=${req.storeId}, store.productionHouseId=${store?.productionHouseId}, houseId=${house.id}, deliveredDate=${deliveredDate}, isForThisHouse=${isForThisHouse}, isBeforeOrOnDate=${isBeforeOrOnDate}, status=${req.status}`);
          
          return isForThisHouse && isBeforeOrOnDate;
        }
      ) || [];

      console.log(`  ✅ Total delivered requests for ${house.name}: ${allDeliveredRequests.length}`);
      allDeliveredRequests.forEach(req => {
        console.log(`    - Request: chicken=${req.chickenMomos}, chickenCheese=${req.chickenCheeseMomos}, deliveredAt=${req.deliveredAt}`);
      });

      // Production for the selected date only
      const todayProduction = context.productionData.find(
        prod => prod.productionHouseId === house.id && prod.date === selectedDate
      );

      // Delivered requests for the selected date only
      const todayDeliveredRequests = productionRequests?.filter(
        req => {
          if (!req.deliveredAt || req.status !== 'delivered') return false;
          
          // Extract date from deliveredAt timestamp
          let deliveredDate: string;
          if (req.deliveredAt.includes('/')) {
            const parts = req.deliveredAt.split(',')[0].split('/');
            deliveredDate = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
          } else if (req.deliveredAt.includes('T')) {
            deliveredDate = req.deliveredAt.split('T')[0];
          } else {
            deliveredDate = req.deliveredAt.split(' ')[0];
          }
          
          // Find the store that made this request
          const store = stores.find(s => s.id === req.storeId);
          
          // Check if request is for a store mapped to this production house
          return store?.productionHouseId === house.id && deliveredDate === selectedDate;
        }
      ) || [];

      // Calculate cumulative production up to selected date
      const cumulativeProduction = {
        chicken: 0,
        chickenCheese: 0,
        veg: 0,
        cheeseCorn: 0,
        paneer: 0,
        vegKurkure: 0,
        chickenKurkure: 0,
      };

      allPreviousProduction.forEach(prod => {
        cumulativeProduction.chicken += prod.chickenMomos?.final || 0;
        cumulativeProduction.chickenCheese += prod.chickenCheeseMomos?.final || 0;
        cumulativeProduction.veg += prod.vegMomos?.final || 0;
        cumulativeProduction.cheeseCorn += prod.cheeseCornMomos?.final || 0;
        cumulativeProduction.paneer += prod.paneerMomos?.final || 0;
        cumulativeProduction.vegKurkure += prod.vegKurkureMomos?.final || 0;
        cumulativeProduction.chickenKurkure += prod.chickenKurkureMomos?.final || 0;
      });

      // Calculate cumulative sent up to selected date
      const cumulativeSent = {
        chicken: 0,
        chickenCheese: 0,
        veg: 0,
        cheeseCorn: 0,
        paneer: 0,
        vegKurkure: 0,
        chickenKurkure: 0,
      };

      allDeliveredRequests.forEach(req => {
        cumulativeSent.chicken += req.chickenMomos || 0;
        cumulativeSent.chickenCheese += req.chickenCheeseMomos || 0;
        cumulativeSent.veg += req.vegMomos || 0;
        cumulativeSent.cheeseCorn += req.cheeseCornMomos || 0;
        cumulativeSent.paneer += req.paneerMomos || 0;
        cumulativeSent.vegKurkure += req.vegKurkureMomos || 0;
        cumulativeSent.chickenKurkure += req.chickenKurkureMomos || 0;
      });

      // Production for today (selected date)
      const todayProductionQuantities = {
        chicken: todayProduction?.chickenMomos?.final || 0,
        chickenCheese: todayProduction?.chickenCheeseMomos?.final || 0,
        veg: todayProduction?.vegMomos?.final || 0,
        cheeseCorn: todayProduction?.cheeseCornMomos?.final || 0,
        paneer: todayProduction?.paneerMomos?.final || 0,
        vegKurkure: todayProduction?.vegKurkureMomos?.final || 0,
        chickenKurkure: todayProduction?.chickenKurkureMomos?.final || 0,
      };

      // Sent today (selected date)
      const todaySentQuantities = {
        chicken: 0,
        chickenCheese: 0,
        veg: 0,
        cheeseCorn: 0,
        paneer: 0,
        vegKurkure: 0,
        chickenKurkure: 0,
      };

      todayDeliveredRequests.forEach(req => {
        todaySentQuantities.chicken += req.chickenMomos || 0;
        todaySentQuantities.chickenCheese += req.chickenCheeseMomos || 0;
        todaySentQuantities.veg += req.vegMomos || 0;
        todaySentQuantities.cheeseCorn += req.cheeseCornMomos || 0;
        todaySentQuantities.paneer += req.paneerMomos || 0;
        todaySentQuantities.vegKurkure += req.vegKurkureMomos || 0;
        todaySentQuantities.chickenKurkure += req.chickenKurkureMomos || 0;
      });

      // Calculate available stock (cumulative approach with carry-forward)
      const stock: ProductionHouseStock['stock'] = {
        chicken: {
          produced: todayProductionQuantities.chicken,
          sent: todaySentQuantities.chicken,
          available: Math.max(0, cumulativeProduction.chicken - cumulativeSent.chicken),
          percentage: 0,
        },
        chickenCheese: {
          produced: todayProductionQuantities.chickenCheese,
          sent: todaySentQuantities.chickenCheese,
          available: Math.max(0, cumulativeProduction.chickenCheese - cumulativeSent.chickenCheese),
          percentage: 0,
        },
        veg: {
          produced: todayProductionQuantities.veg,
          sent: todaySentQuantities.veg,
          available: Math.max(0, cumulativeProduction.veg - cumulativeSent.veg),
          percentage: 0,
        },
        cheeseCorn: {
          produced: todayProductionQuantities.cheeseCorn,
          sent: todaySentQuantities.cheeseCorn,
          available: Math.max(0, cumulativeProduction.cheeseCorn - cumulativeSent.cheeseCorn),
          percentage: 0,
        },
        paneer: {
          produced: todayProductionQuantities.paneer,
          sent: todaySentQuantities.paneer,
          available: Math.max(0, cumulativeProduction.paneer - cumulativeSent.paneer),
          percentage: 0,
        },
        vegKurkure: {
          produced: todayProductionQuantities.vegKurkure,
          sent: todaySentQuantities.vegKurkure,
          available: Math.max(0, cumulativeProduction.vegKurkure - cumulativeSent.vegKurkure),
          percentage: 0,
        },
        chickenKurkure: {
          produced: todayProductionQuantities.chickenKurkure,
          sent: todaySentQuantities.chickenKurkure,
          available: Math.max(0, cumulativeProduction.chickenKurkure - cumulativeSent.chickenKurkure),
          percentage: 0,
        },
      };

      // Calculate percentages
      Object.keys(stock).forEach(key => {
        const item = stock[key as keyof typeof stock];
        if (cumulativeProduction[key as keyof typeof cumulativeProduction] > 0) {
          item.percentage = (item.available / cumulativeProduction[key as keyof typeof cumulativeProduction]) * 100;
        } else {
          item.percentage = 0;
        }
      });

      // Calculate totals
      const totalProduced = Object.values(todayProductionQuantities).reduce((a, b) => a + b, 0);
      const totalWastage = todayProduction ? (
        (todayProduction.wastage?.dough || 0) +
        (todayProduction.wastage?.stuffing || 0) +
        (todayProduction.wastage?.batter || 0) +
        (todayProduction.wastage?.coating || 0)
      ) : 0;

      const approvedEntries = context.productionData.filter(
        prod => prod.productionHouseId === house.id && 
        prod.date === selectedDate && 
        prod.approvalStatus === 'approved'
      ).length;

      const pendingApproval = context.productionData.filter(
        prod => prod.productionHouseId === house.id && 
        prod.date === selectedDate && 
        prod.approvalStatus === 'pending'
      ).length;

      stocks.push({
        productionHouseId: house.id,
        productionHouseName: house.name,
        date: selectedDate,
        stock,
        totalProduced,
        totalWastage,
        approvedEntries,
        pendingApproval,
      });
    });

    return stocks;
  }, [context.productionData, productionRequests, stores, productionHouses, selectedDate]);

  const filteredStocks = selectedProductionHouse
    ? productionHouseStocks.filter(s => s.productionHouseId === selectedProductionHouse)
    : productionHouseStocks;

  const productLabels: Record<string, string> = {
    chicken: 'Chicken Momos',
    chickenCheese: 'Chicken Cheese Momos',
    veg: 'Veg Momos',
    cheeseCorn: 'Cheese Corn Momos',
    paneer: 'Paneer Momos',
    vegKurkure: 'Veg Kurkure Momos',
    chickenKurkure: 'Chicken Kurkure Momos',
  };

  const getStockColor = (percentage: number) => {
    if (percentage >= 80) return { bg: 'bg-purple-50', border: 'border-purple-200', bar: 'bg-purple-500', text: 'text-purple-700' };
    if (percentage >= 60) return { bg: 'bg-pink-50', border: 'border-pink-200', bar: 'bg-pink-500', text: 'text-pink-700' };
    if (percentage >= 40) return { bg: 'bg-green-50', border: 'border-green-200', bar: 'bg-green-500', text: 'text-green-700' };
    if (percentage >= 20) return { bg: 'bg-yellow-50', border: 'border-yellow-200', bar: 'bg-yellow-500', text: 'text-yellow-700' };
    return { bg: 'bg-red-50', border: 'border-red-200', bar: 'bg-red-500', text: 'text-red-700' };
  };

  return (
    <div className="space-y-6">
      {/* Header with Date Selector */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl">Production House Stock Status</h2>
          <p className="text-muted-foreground">
            Total produced - Total sent to stores (fulfilled stock requests)
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              max={new Date().toISOString().split('T')[0]}
              className="px-3 py-2 border rounded-lg bg-background"
            />
          </div>
          <select
            value={selectedProductionHouse || 'all'}
            onChange={(e) => setSelectedProductionHouse(e.target.value === 'all' ? null : e.target.value)}
            className="px-4 py-2 border rounded-lg bg-background"
          >
            <option value="all">All Production Houses</option>
            {productionHouses.map(house => (
              <option key={house.id} value={house.id}>{house.name}</option>
            ))}
          </select>
        </div>
      </div>

      {filteredStocks.map(houseStock => (
        <div key={houseStock.productionHouseId} className="space-y-4">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card className="p-6 bg-gradient-to-br from-orange-50 to-orange-100 border-orange-200">
              <div className="flex items-center gap-3 mb-2">
                <Package className="h-5 w-5 text-orange-600" />
                <p className="text-sm text-orange-800">Total Production</p>
              </div>
              <p className="text-3xl text-orange-900 mb-1">{houseStock.totalProduced.toLocaleString()}</p>
              <p className="text-xs text-orange-700">pieces</p>
            </Card>

            <Card className="p-6 bg-gradient-to-br from-red-50 to-red-100 border-red-200">
              <div className="flex items-center gap-3 mb-2">
                <TrendingDown className="h-5 w-5 text-red-600" />
                <p className="text-sm text-red-800">Total Wastage</p>
              </div>
              <p className="text-3xl text-red-900 mb-1">{houseStock.totalWastage.toFixed(2)}</p>
              <p className="text-xs text-red-700">kg</p>
            </Card>

            <Card className="p-6 bg-gradient-to-br from-green-50 to-green-100 border-green-200">
              <div className="flex items-center gap-3 mb-2">
                <TrendingUp className="h-5 w-5 text-green-600" />
                <p className="text-sm text-green-800">Approved Entries</p>
              </div>
              <p className="text-3xl text-green-900 mb-1">{houseStock.approvedEntries}</p>
              <p className="text-xs text-green-700">records</p>
            </Card>

            <Card className="p-6 bg-gradient-to-br from-yellow-50 to-yellow-100 border-yellow-200">
              <div className="flex items-center gap-3 mb-2">
                <Calendar className="h-5 w-5 text-yellow-600" />
                <p className="text-sm text-yellow-800">Pending Approval</p>
              </div>
              <p className="text-3xl text-yellow-900 mb-1">{houseStock.pendingApproval}</p>
              <p className="text-xs text-yellow-700">records</p>
            </Card>
          </div>

          {/* Stock Status Section */}
          <Card className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <Factory className="h-5 w-5 text-orange-600" />
              <h3 className="text-lg">
                {houseStock.productionHouseName} - Stock Status
              </h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {Object.entries(houseStock.stock).map(([product, data]) => {
                const colors = getStockColor(data.percentage);
                
                return (
                  <div 
                    key={product}
                    className={`p-4 rounded-lg border-2 ${colors.bg} ${colors.border}`}
                  >
                    <h4 className="text-sm mb-3">{productLabels[product]}</h4>
                    
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Total Produced:</span>
                        <span className={colors.text}>{data.produced}</span>
                      </div>
                      
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Sent to Stores:</span>
                        <span className="text-red-600">{data.sent}</span>
                      </div>
                      
                      <div className="border-t pt-2">
                        <div className="flex justify-between items-center mb-2">
                          <span className="">Stock Available:</span>
                          <span className={`text-lg ${colors.text}`}>{data.available}</span>
                        </div>
                        
                        <div className="space-y-1">
                          <div className="flex justify-between text-xs">
                            <span>{data.percentage.toFixed(0)}% remaining</span>
                          </div>
                          <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                            <div 
                              className={`h-full ${colors.bar} transition-all duration-300`}
                              style={{ width: `${Math.min(data.percentage, 100)}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      ))}

      {/* Empty State */}
      {filteredStocks.length === 0 && (
        <Card className="p-12 text-center">
          <Factory className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg mb-2">No Production Data</h3>
          <p className="text-muted-foreground">
            No production data available for the selected date and production house
          </p>
        </Card>
      )}
    </div>
  );
}