import { useMemo, useState } from 'react';
import { InventoryContextType } from '../App';
import * as api from '../utils/api';
import { BarChart, Bar, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { TrendingUp, Trophy, Award, Target, ChevronDown, ChevronUp } from 'lucide-react';
import { Card } from './ui/card';
import { Badge } from './ui/badge';

type Props = {
  context: InventoryContextType;
  stores: api.Store[];
};

type StoreMetrics = {
  storeId: string;
  storeName: string;
  totalSales: number;
  totalRequests: number;
  fulfillmentRate: number;
  avgRequestSize: number;
  salesGrowth: number;
  efficiency: number;
  overallScore: number;
  rank: number;
};

export function StorePerformanceComparison({ context, stores }: Props) {
  const [sortBy, setSortBy] = useState<'score' | 'sales' | 'efficiency'>('score');
  const [timeframe, setTimeframe] = useState<'7days' | '30days' | '90days'>('30days');

  const storeMetrics = useMemo(() => {
    const days = timeframe === '7days' ? 7 : timeframe === '30days' ? 30 : 90;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    // Calculate previous period for growth comparison
    const previousCutoff = new Date();
    previousCutoff.setDate(previousCutoff.getDate() - (days * 2));
    const previousEnd = new Date(cutoffDate);

    const metrics: StoreMetrics[] = stores.map(store => {
      // Current period sales
      const currentSales = context.salesData
        .filter(sale => sale.storeId === store.id && new Date(sale.date) >= cutoffDate)
        .reduce((sum, sale) => sum + (sale.onlineSales || 0) + (sale.offlineSales || 0), 0);

      // Previous period sales
      const previousSales = context.salesData
        .filter(sale => 
          sale.storeId === store.id && 
          new Date(sale.date) >= previousCutoff && 
          new Date(sale.date) < previousEnd
        )
        .reduce((sum, sale) => sum + (sale.onlineSales || 0) + (sale.offlineSales || 0), 0);

      // Sales growth
      const salesGrowth = previousSales > 0 
        ? ((currentSales - previousSales) / previousSales) * 100 
        : currentSales > 0 ? 100 : 0;

      // Stock requests
      const storeRequests = context.stockRequests.filter(
        req => req.storeId === store.id && new Date(req.requestDate) >= cutoffDate
      );

      const totalRequests = storeRequests.length;
      const fulfilledRequests = storeRequests.filter(
        req => req.status === 'fulfilled' || req.status === 'partially_fulfilled'
      );

      const totalRequested = storeRequests.reduce((sum, req) => 
        sum + Object.values(req.requestedQuantities).reduce((a, b) => a + b, 0), 0
      );

      const totalFulfilled = fulfilledRequests.reduce((sum, req) => 
        sum + (req.fulfilledQuantities 
          ? Object.values(req.fulfilledQuantities).reduce((a, b) => a + b, 0) 
          : 0), 0
      );

      const fulfillmentRate = totalRequested > 0 ? (totalFulfilled / totalRequested) * 100 : 0;
      const avgRequestSize = totalRequests > 0 ? totalRequested / totalRequests : 0;

      // Efficiency score (combination of sales per request and fulfillment rate)
      const efficiency = totalFulfilled > 0 
        ? (currentSales / totalFulfilled) * (fulfillmentRate / 100) 
        : 0;

      // Overall performance score (weighted average)
      const salesScore = Math.min((currentSales / 100000) * 100, 100); // Normalize to 100
      const fulfillmentScore = fulfillmentRate;
      const growthScore = Math.max(0, Math.min(salesGrowth + 50, 100)); // Center around 50, cap at 100
      const efficiencyScore = Math.min(efficiency, 100);

      const overallScore = (
        salesScore * 0.35 + 
        fulfillmentScore * 0.25 + 
        growthScore * 0.25 + 
        efficiencyScore * 0.15
      );

      return {
        storeId: store.id,
        storeName: store.name,
        totalSales: currentSales,
        totalRequests,
        fulfillmentRate,
        avgRequestSize,
        salesGrowth,
        efficiency,
        overallScore,
        rank: 0, // Will be assigned after sorting
      };
    });

    // Sort by overall score and assign ranks
    metrics.sort((a, b) => b.overallScore - a.overallScore);
    metrics.forEach((metric, index) => {
      metric.rank = index + 1;
    });

    // Re-sort based on selected criteria
    if (sortBy === 'sales') {
      metrics.sort((a, b) => b.totalSales - a.totalSales);
    } else if (sortBy === 'efficiency') {
      metrics.sort((a, b) => b.efficiency - a.efficiency);
    }

    return metrics;
  }, [context, stores, timeframe, sortBy]);

  // Prepare radar chart data
  const radarData = useMemo(() => {
    const top3Stores = storeMetrics.slice(0, 3);
    
    return [
      { metric: 'Sales', ...Object.fromEntries(top3Stores.map(s => [s.storeName, Math.min((s.totalSales / 100000) * 100, 100)])) },
      { metric: 'Fulfillment', ...Object.fromEntries(top3Stores.map(s => [s.storeName, s.fulfillmentRate])) },
      { metric: 'Growth', ...Object.fromEntries(top3Stores.map(s => [s.storeName, Math.max(0, Math.min(s.salesGrowth + 50, 100))])) },
      { metric: 'Efficiency', ...Object.fromEntries(top3Stores.map(s => [s.storeName, Math.min(s.efficiency, 100)])) },
      { metric: 'Requests', ...Object.fromEntries(top3Stores.map(s => [s.storeName, Math.min((s.totalRequests / 10) * 100, 100)])) },
    ];
  }, [storeMetrics]);

  const getRankBadge = (rank: number) => {
    if (rank === 1) return { icon: Trophy, color: 'bg-yellow-100 text-yellow-800 border-yellow-300', label: '🥇 1st' };
    if (rank === 2) return { icon: Award, color: 'bg-gray-100 text-gray-800 border-gray-300', label: '🥈 2nd' };
    if (rank === 3) return { icon: Award, color: 'bg-orange-100 text-orange-800 border-orange-300', label: '🥉 3rd' };
    return { icon: Target, color: 'bg-blue-100 text-blue-800 border-blue-300', label: `#${rank}` };
  };

  const comparisonData = storeMetrics.map(store => ({
    name: store.storeName,
    sales: store.totalSales,
    score: store.overallScore,
  }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
            <Trophy className="h-5 w-5 text-white" />
          </div>
          <div>
            <h2 className="text-2xl">Store Performance Comparison</h2>
            <p className="text-muted-foreground">Compare and rank store performance metrics</p>
          </div>
        </div>
        <div className="flex gap-2">
          <select
            value={timeframe}
            onChange={(e) => setTimeframe(e.target.value as any)}
            className="px-4 py-2 border rounded-lg bg-background"
          >
            <option value="7days">Last 7 Days</option>
            <option value="30days">Last 30 Days</option>
            <option value="90days">Last 90 Days</option>
          </select>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="px-4 py-2 border rounded-lg bg-background"
          >
            <option value="score">Overall Score</option>
            <option value="sales">Total Sales</option>
            <option value="efficiency">Efficiency</option>
          </select>
        </div>
      </div>

      {/* Top Performers */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {storeMetrics.slice(0, 3).map((store, index) => {
          const rankBadge = getRankBadge(store.rank);
          const RankIcon = rankBadge.icon;
          
          return (
            <Card key={store.storeId} className="p-6 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-purple-500/10 to-pink-500/10 rounded-bl-full" />
              <div className="relative">
                <div className="flex items-center justify-between mb-4">
                  <Badge className={`${rankBadge.color} border text-lg px-3 py-1`}>
                    {rankBadge.label}
                  </Badge>
                  <RankIcon className="h-8 w-8 text-purple-600" />
                </div>
                <h3 className="text-xl mb-4">{store.storeName}</h3>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Overall Score</span>
                    <span className="text-purple-600">{store.overallScore.toFixed(1)}/100</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Sales</span>
                    <span>₹{store.totalSales.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Growth</span>
                    <span className={store.salesGrowth >= 0 ? 'text-green-600' : 'text-red-600'}>
                      {store.salesGrowth >= 0 ? <ChevronUp className="inline h-4 w-4" /> : <ChevronDown className="inline h-4 w-4" />}
                      {Math.abs(store.salesGrowth).toFixed(1)}%
                    </span>
                  </div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Performance Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Multi-dimensional Comparison */}
        <Card className="p-6">
          <h3 className="text-lg mb-4">Multi-dimensional Performance (Top 3)</h3>
          <ResponsiveContainer width="100%" height={350}>
            <RadarChart data={radarData}>
              <PolarGrid />
              <PolarAngleAxis dataKey="metric" tick={{ fontSize: 12 }} />
              <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fontSize: 10 }} />
              <Radar 
                name={storeMetrics[0]?.storeName} 
                dataKey={storeMetrics[0]?.storeName} 
                stroke="#8b5cf6" 
                fill="#8b5cf6" 
                fillOpacity={0.6} 
              />
              {storeMetrics[1] && (
                <Radar 
                  name={storeMetrics[1].storeName} 
                  dataKey={storeMetrics[1].storeName} 
                  stroke="#ec4899" 
                  fill="#ec4899" 
                  fillOpacity={0.6} 
                />
              )}
              {storeMetrics[2] && (
                <Radar 
                  name={storeMetrics[2].storeName} 
                  dataKey={storeMetrics[2].storeName} 
                  stroke="#10b981" 
                  fill="#10b981" 
                  fillOpacity={0.6} 
                />
              )}
              <Legend />
            </RadarChart>
          </ResponsiveContainer>
        </Card>

        {/* Sales & Score Comparison */}
        <Card className="p-6">
          <h3 className="text-lg mb-4">Sales & Performance Score</h3>
          <ResponsiveContainer width="100%" height={350}>
            <BarChart data={comparisonData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} angle={-45} textAnchor="end" height={100} />
              <YAxis yAxisId="left" tick={{ fontSize: 12 }} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 12 }} />
              <Tooltip />
              <Legend />
              <Bar yAxisId="left" dataKey="sales" fill="#8b5cf6" name="Sales (₹)" />
              <Bar yAxisId="right" dataKey="score" fill="#ec4899" name="Score" />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      {/* Detailed Metrics Table */}
      <Card className="p-6">
        <h3 className="text-lg mb-4">Detailed Performance Metrics</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-3 px-2">Rank</th>
                <th className="text-left py-3 px-2">Store</th>
                <th className="text-right py-3 px-2">Score</th>
                <th className="text-right py-3 px-2">Sales</th>
                <th className="text-right py-3 px-2">Growth</th>
                <th className="text-right py-3 px-2">Requests</th>
                <th className="text-right py-3 px-2">Fulfillment</th>
                <th className="text-right py-3 px-2">Efficiency</th>
              </tr>
            </thead>
            <tbody>
              {storeMetrics.map((store) => {
                const rankBadge = getRankBadge(store.rank);
                return (
                  <tr key={store.storeId} className="border-b hover:bg-gray-50">
                    <td className="py-3 px-2">
                      <Badge className={`${rankBadge.color} border text-xs`}>
                        {rankBadge.label}
                      </Badge>
                    </td>
                    <td className="py-3 px-2">{store.storeName}</td>
                    <td className="text-right py-3 px-2">
                      <span className="text-purple-600">{store.overallScore.toFixed(1)}</span>
                    </td>
                    <td className="text-right py-3 px-2">₹{store.totalSales.toLocaleString()}</td>
                    <td className="text-right py-3 px-2">
                      <span className={store.salesGrowth >= 0 ? 'text-green-600' : 'text-red-600'}>
                        {store.salesGrowth >= 0 ? '+' : ''}{store.salesGrowth.toFixed(1)}%
                      </span>
                    </td>
                    <td className="text-right py-3 px-2">{store.totalRequests}</td>
                    <td className="text-right py-3 px-2">
                      <span className={
                        store.fulfillmentRate >= 90 ? 'text-green-600' :
                        store.fulfillmentRate >= 70 ? 'text-yellow-600' :
                        'text-red-600'
                      }>
                        {store.fulfillmentRate.toFixed(1)}%
                      </span>
                    </td>
                    <td className="text-right py-3 px-2">{store.efficiency.toFixed(1)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
