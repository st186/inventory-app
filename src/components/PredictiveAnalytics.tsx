import { useMemo } from 'react';
import { InventoryContextType } from '../App';
import * as api from '../utils/api';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { TrendingUp, AlertCircle, Target, Calendar, ArrowRight } from 'lucide-react';
import { Card } from './ui/card';
import { Badge } from './ui/badge';

type Props = {
  context: InventoryContextType;
  stores: api.Store[];
};

export function PredictiveAnalytics({ context, stores }: Props) {
  // Calculate predictions and forecasts
  const predictions = useMemo(() => {
    // Get last 30 days of data for trend analysis
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Calculate average daily sales per product type
    const recentSales = context.salesData.filter(sale => new Date(sale.date) >= thirtyDaysAgo);
    const dailySalesAvg = recentSales.length > 0 ? recentSales.length / 30 : 0;

    // Calculate production trend
    const recentProduction = context.productionData.filter(prod => new Date(prod.date) >= thirtyDaysAgo);
    const productionByType = {
      chicken: 0,
      chickenCheese: 0,
      veg: 0,
      cheeseCorn: 0,
      paneer: 0,
      vegKurkure: 0,
      chickenKurkure: 0,
    };

    recentProduction.forEach(prod => {
      productionByType.chicken += prod.chickenMomos?.final || 0;
      productionByType.chickenCheese += prod.chickenCheeseMomos?.final || 0;
      productionByType.veg += prod.vegMomos?.final || 0;
      productionByType.cheeseCorn += prod.cheeseCornMomos?.final || 0;
      productionByType.paneer += prod.paneerMomos?.final || 0;
      productionByType.vegKurkure += prod.vegKurkureMomos?.final || 0;
      productionByType.chickenKurkure += prod.chickenKurkureMomos?.final || 0;
    });

    const avgDailyProductionByType = Object.fromEntries(
      Object.entries(productionByType).map(([key, value]) => [
        key,
        recentProduction.length > 0 ? value / 30 : 0
      ])
    );

    // Forecast next 7 days stock requirements
    const forecastDays = 7;
    const forecast = [];

    for (let i = 1; i <= forecastDays; i++) {
      const date = new Date();
      date.setDate(date.getDate() + i);
      
      // Simple linear trend-based forecast
      // In real scenario, use more sophisticated algorithms
      const dayOfWeek = date.getDay();
      const weekendMultiplier = (dayOfWeek === 0 || dayOfWeek === 6) ? 1.3 : 1.0; // 30% increase on weekends
      
      forecast.push({
        date: date.toISOString().split('T')[0],
        dayName: date.toLocaleDateString('en-US', { weekday: 'short' }),
        expectedDemand: Math.round(dailySalesAvg * weekendMultiplier * 100), // Approximate units
        recommendedProduction: Math.round(dailySalesAvg * weekendMultiplier * 110), // 10% buffer
        isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
      });
    }

    // Calculate stock-out risk for each store
    const storeRisks = stores.map(store => {
      const storeRequests = context.stockRequests.filter(
        req => req.storeId === store.id && req.status === 'fulfilled'
      );

      const totalStock = storeRequests.reduce((sum, req) => {
        return sum + (req.fulfilledQuantities 
          ? Object.values(req.fulfilledQuantities).reduce((a, b) => a + b, 0)
          : 0);
      }, 0);

      const storeSales = context.salesData.filter(
        sale => sale.storeId === store.id && new Date(sale.date) >= thirtyDaysAgo
      );

      const avgDailySales = storeSales.length / 30;
      const daysUntilStockout = avgDailySales > 0 ? totalStock / (avgDailySales * 10) : 99; // Rough estimate
      
      let riskLevel: 'low' | 'medium' | 'high' | 'critical' = 'low';
      if (daysUntilStockout < 2) riskLevel = 'critical';
      else if (daysUntilStockout < 4) riskLevel = 'high';
      else if (daysUntilStockout < 7) riskLevel = 'medium';

      return {
        storeName: store.name,
        currentStock: totalStock,
        avgDailySales: Math.round(avgDailySales * 10),
        daysUntilStockout: Math.round(daysUntilStockout),
        riskLevel,
        recommendedOrder: Math.round(avgDailySales * 10 * 7), // 7 days worth
      };
    });

    // Optimal production scheduling
    const optimalSchedule = Object.entries(avgDailyProductionByType).map(([product, avgDaily]) => {
      const currentProduction = avgDaily;
      const recommendedProduction = Math.round(currentProduction * 1.15); // 15% buffer
      const efficiency = currentProduction > 0 ? 85 : 0; // Placeholder efficiency score

      return {
        product: product.replace(/([A-Z])/g, ' $1').trim(),
        current: Math.round(currentProduction),
        recommended: recommendedProduction,
        efficiency,
        status: currentProduction >= recommendedProduction * 0.9 ? 'optimal' : 'increase_needed',
      };
    }).filter(item => item.current > 0 || item.recommended > 0);

    // Seasonal trends (simplified)
    const monthlyTrend = [];
    for (let i = 0; i < 6; i++) {
      const date = new Date();
      date.setMonth(date.getMonth() - (5 - i));
      
      const monthSales = context.salesData.filter(sale => {
        const saleDate = new Date(sale.date);
        return saleDate.getMonth() === date.getMonth() && saleDate.getFullYear() === date.getFullYear();
      }).reduce((sum, sale) => sum + (sale.onlineSales || 0) + (sale.offlineSales || 0), 0);

      monthlyTrend.push({
        month: date.toLocaleDateString('en-US', { month: 'short' }),
        sales: monthSales,
      });
    }

    return {
      forecast,
      storeRisks,
      optimalSchedule,
      monthlyTrend,
      avgDailyProductionByType,
    };
  }, [context, stores]);

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case 'critical': return 'bg-red-100 text-red-800 border-red-300';
      case 'high': return 'bg-orange-100 text-orange-800 border-orange-300';
      case 'medium': return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case 'low': return 'bg-green-100 text-green-800 border-green-300';
      default: return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
          <Target className="h-5 w-5 text-white" />
        </div>
        <div>
          <h2 className="text-2xl">Predictive Analytics</h2>
          <p className="text-muted-foreground">AI-powered forecasting and recommendations</p>
        </div>
      </div>

      {/* 7-Day Forecast */}
      <Card className="p-6">
        <h3 className="text-lg mb-4 flex items-center gap-2">
          <Calendar className="h-5 w-5 text-purple-600" />
          7-Day Demand Forecast
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-7 gap-3">
          {predictions.forecast.map(day => (
            <div 
              key={day.date}
              className={`p-4 rounded-lg border-2 ${
                day.isWeekend 
                  ? 'bg-purple-50 border-purple-200' 
                  : 'bg-gray-50 border-gray-200'
              }`}
            >
              <p className="text-xs text-muted-foreground mb-1">{day.dayName}</p>
              <p className="text-sm mb-2">{new Date(day.date).getDate()}</p>
              <div className="space-y-1">
                <div>
                  <p className="text-xs text-muted-foreground">Expected</p>
                  <p className="text-lg">{day.expectedDemand}</p>
                </div>
                <div>
                  <p className="text-xs text-green-600">Recommended</p>
                  <p className="text-lg text-green-600">{day.recommendedProduction}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Stock-out Risk Analysis */}
      <Card className="p-6">
        <h3 className="text-lg mb-4 flex items-center gap-2">
          <AlertCircle className="h-5 w-5 text-orange-600" />
          Stock-out Risk by Store
        </h3>
        <div className="space-y-3">
          {predictions.storeRisks.map(store => (
            <div key={store.storeName} className="p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm">{store.storeName}</h4>
                <Badge className={`${getRiskColor(store.riskLevel)} border`}>
                  {store.riskLevel.toUpperCase()} RISK
                </Badge>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Current Stock</p>
                  <p className="text-lg">{store.currentStock}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Avg Daily Sales</p>
                  <p className="text-lg">{store.avgDailySales}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Days Until Stock-out</p>
                  <p className={`text-lg ${
                    store.daysUntilStockout < 3 ? 'text-red-600' :
                    store.daysUntilStockout < 7 ? 'text-orange-600' :
                    'text-green-600'
                  }`}>
                    {store.daysUntilStockout}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Recommended Order</p>
                  <p className="text-lg text-blue-600">{store.recommendedOrder}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Demand Forecast Chart */}
        <Card className="p-6">
          <h3 className="text-lg mb-4">Weekly Demand Forecast</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={predictions.forecast}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="dayName" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Legend />
              <Bar dataKey="expectedDemand" fill="#8b5cf6" name="Expected" />
              <Bar dataKey="recommendedProduction" fill="#10b981" name="Recommended" />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        {/* Monthly Trend */}
        <Card className="p-6">
          <h3 className="text-lg mb-4">6-Month Sales Trend</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={predictions.monthlyTrend}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="sales" stroke="#ec4899" strokeWidth={2} name="Sales (₹)" />
            </LineChart>
          </ResponsiveContainer>
        </Card>
      </div>

      {/* Optimal Production Schedule */}
      <Card className="p-6">
        <h3 className="text-lg mb-4 flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-blue-600" />
          Optimal Production Schedule
        </h3>
        <div className="space-y-3">
          {predictions.optimalSchedule.map(item => (
            <div key={item.product} className="p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm capitalize">{item.product}</h4>
                <Badge className={
                  item.status === 'optimal' 
                    ? 'bg-green-100 text-green-800' 
                    : 'bg-orange-100 text-orange-800'
                }>
                  {item.status === 'optimal' ? 'OPTIMAL' : 'INCREASE NEEDED'}
                </Badge>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="text-muted-foreground">Current</span>
                    <span>{item.current}/day</span>
                  </div>
                  <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-purple-500"
                      style={{ width: `${(item.current / item.recommended) * 100}%` }}
                    />
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
                <div className="w-24 text-right">
                  <p className="text-xs text-muted-foreground">Target</p>
                  <p className="text-lg text-green-600">{item.recommended}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
