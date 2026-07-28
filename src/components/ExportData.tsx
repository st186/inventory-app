import { useState, useEffect } from 'react';
import { Download, FileText, Table, FileSpreadsheet, Calendar, X, AlertTriangle } from 'lucide-react';
import * as api from '../utils/api';
import { OverheadItem } from '../App';
import { OVERHEAD_CATEGORY_META } from '../utils/inventoryData';
import { getSupabaseClient } from '../utils/supabase/client';
import { ItemCatalogCleanup } from './ItemCatalogCleanup';

interface ExportDataProps {
  userRole: 'manager' | 'cluster_head';
  selectedStoreId?: string | null;
  currentUserId?: string;
}

type DateRange = 'today' | 'weekly' | 'monthly' | 'custom';
type ExportFormat = 'csv' | 'pdf' | 'excel';

export function ExportData({ userRole, selectedStoreId, currentUserId }: ExportDataProps) {
  const [dateRange, setDateRange] = useState<DateRange>('today');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [exportFormat, setExportFormat] = useState<ExportFormat>('csv');
  const [loading, setLoading] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [previewData, setPreviewData] = useState<any>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);

  // Miscellaneous recategorization (Cluster Head only)
  const [miscItems, setMiscItems] = useState<OverheadItem[] | null>(null);
  const [miscLoading, setMiscLoading] = useState(false);
  const [miscSaving, setMiscSaving] = useState<string | null>(null);
  const [miscNewCategory, setMiscNewCategory] = useState<Record<string, string>>({});
  const [showItemCleanup, setShowItemCleanup] = useState(false);

  const supabaseClient = getSupabaseClient();

  useEffect(() => {
    const getToken = async () => {
      const { data: { session } } = await supabaseClient.auth.getSession();
      if (session?.access_token) {
        setAccessToken(session.access_token);
      }
    };
    getToken();
  }, []);

  const loadMiscItems = async () => {
    if (!accessToken) return;
    setMiscLoading(true);
    try {
      const all = await api.fetchOverheads(accessToken);
      setMiscItems(all.filter((item) => item.category === 'miscellaneous'));
    } catch (error: any) {
      alert(`❌ Failed to load miscellaneous items: ${error.message}`);
    } finally {
      setMiscLoading(false);
    }
  };

  const saveMiscRecategorization = async (item: OverheadItem) => {
    const newCategory = miscNewCategory[item.id];
    if (!newCategory || !accessToken) return;
    setMiscSaving(item.id);
    try {
      const { id, ...rest } = item;
      await api.updateOverhead(accessToken, id, { ...rest, category: newCategory as OverheadItem['category'] });
      setMiscItems((prev) => (prev ? prev.filter((i) => i.id !== item.id) : prev));
    } catch (error: any) {
      alert(`❌ Failed to update item: ${error.message}`);
    } finally {
      setMiscSaving(null);
    }
  };

  // Local date string (not toISOString, which converts to UTC and can shift the date
  // by a day for timezones ahead of UTC - e.g. IST midnight becomes "yesterday" in UTC).
  const getLocalDateString = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const getDateRangeValues = () => {
    const today = new Date();
    let startDate: string;
    let endDate: string;

    switch (dateRange) {
      case 'today':
        startDate = getLocalDateString(today);
        endDate = startDate;
        break;
      case 'weekly':
        const weekStart = new Date(today);
        weekStart.setDate(today.getDate() - 7);
        startDate = getLocalDateString(weekStart);
        endDate = getLocalDateString(today);
        break;
      case 'monthly':
        const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
        const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);
        startDate = getLocalDateString(monthStart);
        endDate = getLocalDateString(monthEnd);
        break;
      case 'custom':
        startDate = customStartDate;
        endDate = customEndDate;
        break;
    }

    return { startDate, endDate };
  };

  const fetchDataForExport = async () => {
    const { startDate, endDate } = getDateRangeValues();

    if (!startDate || !endDate) {
      alert('Please select a valid date range');
      return null;
    }

    if (!accessToken) {
      alert('Not authenticated. Please log in again.');
      return null;
    }

    try {
      setLoading(true);

      const [
        inventory, overheads, sales, employees, payouts, production,
        onlineSales, onlinePayouts, salaryAdvances, onlineLoans, stores, itemSales
      ] = await Promise.all([
        api.fetchInventory(accessToken),
        api.fetchOverheads(accessToken),
        api.fetchSalesData(accessToken),
        api.getEmployees(),
        api.getPayouts(),
        api.fetchProductionData(),
        api.getOnlineSalesData(accessToken),
        api.getOnlinePayoutData(accessToken),
        api.getSalaryAdvances(),
        selectedStoreId ? api.getOnlineLoans(accessToken, selectedStoreId) : api.getAllOnlineLoans(accessToken),
        api.getStores(),
        api.getSalesData(accessToken).then(r => r.data).catch(() => [])
      ]);

      // Filter data by date range and store
      const filterByDate = (items: any[], dateField: string = 'date') => {
        return items.filter((item: any) => {
          const itemDate = item[dateField];
          const matchesDate = itemDate >= startDate && itemDate <= endDate;

          // If selectedStoreId is provided, ONLY show exact matches
          // Do NOT include legacy data without storeId when viewing a specific store
          if (selectedStoreId) {
            const itemStoreId = item.storeId;
            const matchesStore = itemStoreId === selectedStoreId;
            return matchesDate && matchesStore;
          }

          return matchesDate;
        });
      };

      const filteredInventory = filterByDate(inventory);
      const filteredOverheads = filterByDate(overheads);
      const filteredSales = filterByDate(sales);
      const filteredPayouts = filterByDate(payouts);
      const filteredProduction = filterByDate(production);
      const filteredOnlineSales = filterByDate(onlineSales);
      const filteredOnlinePayouts = filterByDate(onlinePayouts);
      const filteredSalaryAdvances = filterByDate(salaryAdvances, 'requestDate');
      const filteredOnlineLoans = filterByDate(onlineLoans, 'loanDate');
      const filteredItemSales = filterByDate(itemSales);

      // Calculate totals based on the actual data structure.
      // NOTE: online sales are tracked in their own table (SalesManagement's daily record's
      // `onlineSales` field is always 0 now), so they must be added in separately here -
      // omitting this previously understated Total Sales by the entire online portion.
      const totalInventorySpend = filteredInventory.reduce((sum: number, item: any) => sum + (item.totalCost || 0), 0);
      const totalOverheadSpend = filteredOverheads.reduce((sum: number, item: any) => sum + (item.amount || 0), 0);
      // Store vs Production House split (items saved before this split lack entityType — treat as store)
      const isProductionExpense = (item: any) => item.entityType === 'production_house';
      const totalStoreInventorySpend = filteredInventory.filter((i: any) => !isProductionExpense(i)).reduce((sum: number, item: any) => sum + (item.totalCost || 0), 0);
      const totalProductionInventorySpend = filteredInventory.filter(isProductionExpense).reduce((sum: number, item: any) => sum + (item.totalCost || 0), 0);
      const totalStoreOverheadSpend = filteredOverheads.filter((o: any) => !isProductionExpense(o)).reduce((sum: number, item: any) => sum + (item.amount || 0), 0);
      const totalProductionOverheadSpend = filteredOverheads.filter(isProductionExpense).reduce((sum: number, item: any) => sum + (item.amount || 0), 0);
      const totalOfflineSales = filteredSales.reduce((sum: number, item: any) => sum + (item.offlineSales || 0), 0);
      const totalOnlineSalesLogged = filteredOnlineSales.reduce((sum: number, item: any) => sum + (item.swiggySales || 0) + (item.zomatoSales || 0), 0);
      const totalSales = totalOfflineSales + totalOnlineSalesLogged;
      const totalPayouts = filteredPayouts.reduce((sum: number, item: any) => sum + (item.amount || 0), 0);
      const totalAggregatorPayout = filteredOnlinePayouts.reduce((sum: number, item: any) => sum + (item.swiggyPayout || 0) + (item.zomatoPayout || 0), 0);
      const netAggregatorCommission = totalOnlineSalesLogged - totalAggregatorPayout;
      const totalSalaryAdvances = filteredSalaryAdvances.reduce((sum: number, item: any) => sum + (item.amount || 0), 0);
      const activeLoanBalance = filteredOnlineLoans.reduce((sum: number, item: any) => sum + Math.max(0, (item.loanAmount || 0) - (item.repaidAmount || 0)), 0);

      const netProfit = totalSales - totalInventorySpend - totalOverheadSpend - totalPayouts;

      // Store-wise breakdown, only meaningful when viewing all stores at once
      const storeMap = new Map(stores.map((s: any) => [s.id, s.name]));
      let storeBreakdown: Array<{ storeId: string; storeName: string; sales: number; inventorySpend: number; overheadSpend: number; profit: number }> = [];
      if (!selectedStoreId) {
        const storeIds = new Set<string>([
          ...filteredSales.map((s: any) => s.storeId),
          ...filteredInventory.map((i: any) => i.storeId),
          ...filteredOverheads.map((o: any) => o.storeId),
        ].filter(Boolean));
        storeBreakdown = Array.from(storeIds).map((storeId) => {
          const sSales = filteredSales.filter((s: any) => s.storeId === storeId).reduce((sum: number, s: any) => sum + (s.offlineSales || 0), 0)
            + filteredOnlineSales.filter((s: any) => s.storeId === storeId).reduce((sum: number, s: any) => sum + (s.swiggySales || 0) + (s.zomatoSales || 0), 0);
          const sInventory = filteredInventory.filter((i: any) => i.storeId === storeId).reduce((sum: number, i: any) => sum + (i.totalCost || 0), 0);
          const sOverhead = filteredOverheads.filter((o: any) => o.storeId === storeId).reduce((sum: number, o: any) => sum + (o.amount || 0), 0);
          return {
            storeId,
            storeName: storeMap.get(storeId) || storeId,
            sales: sSales,
            inventorySpend: sInventory,
            overheadSpend: sOverhead,
            profit: sSales - sInventory - sOverhead
          };
        }).sort((a, b) => b.sales - a.sales);
      }

      // Item-level sales (units sold per momo type) - shows what's actually moving, not just ₹ totals
      const itemTotals: Record<string, number> = {};
      filteredItemSales.forEach((record: any) => {
        Object.entries(record.data || {}).forEach(([label, qty]) => {
          itemTotals[label] = (itemTotals[label] || 0) + (Number(qty) || 0);
        });
      });

      // Previous period of equal length, for trend comparison
      const periodMs = new Date(endDate).getTime() - new Date(startDate).getTime();
      const prevEnd = new Date(new Date(startDate).getTime() - 24 * 60 * 60 * 1000);
      const prevStart = new Date(prevEnd.getTime() - periodMs);
      const prevStartStr = prevStart.toISOString().split('T')[0];
      const prevEndStr = prevEnd.toISOString().split('T')[0];
      const inPrevRange = (d: string) => d >= prevStartStr && d <= prevEndStr;
      const matchesStore = (storeId?: string) => !selectedStoreId || storeId === selectedStoreId;

      const prevSales = sales.filter((s: any) => inPrevRange(s.date) && matchesStore(s.storeId)).reduce((sum: number, s: any) => sum + (s.offlineSales || 0), 0)
        + onlineSales.filter((s: any) => inPrevRange(s.date) && matchesStore(s.storeId)).reduce((sum: number, s: any) => sum + (s.swiggySales || 0) + (s.zomatoSales || 0), 0);
      const prevInventorySpend = inventory.filter((i: any) => inPrevRange(i.date) && matchesStore(i.storeId)).reduce((sum: number, i: any) => sum + (i.totalCost || 0), 0);
      const prevOverheadSpend = overheads.filter((o: any) => inPrevRange(o.date) && matchesStore(o.storeId)).reduce((sum: number, o: any) => sum + (o.amount || 0), 0);
      const prevPayouts = payouts.filter((p: any) => inPrevRange(p.date) && matchesStore(p.storeId)).reduce((sum: number, p: any) => sum + (p.amount || 0), 0);
      const prevProfit = prevSales - prevInventorySpend - prevOverheadSpend - prevPayouts;
      const pctChange = (current: number, prev: number) => prev === 0 ? (current === 0 ? 0 : 100) : ((current - prev) / Math.abs(prev)) * 100;

      return {
        startDate,
        endDate,
        storeId: selectedStoreId,
        inventory: filteredInventory,
        overheads: filteredOverheads,
        sales: filteredSales,
        employees,
        payouts: filteredPayouts,
        production: filteredProduction,
        onlineSales: filteredOnlineSales,
        onlinePayouts: filteredOnlinePayouts,
        salaryAdvances: filteredSalaryAdvances,
        onlineLoans: filteredOnlineLoans,
        storeBreakdown,
        itemTotals,
        summary: {
          totalInventorySpend,
          totalOverheadSpend,
          totalStoreInventorySpend,
          totalProductionInventorySpend,
          totalStoreOverheadSpend,
          totalProductionOverheadSpend,
          totalOfflineSales,
          totalOnlineSalesLogged,
          totalSales,
          totalPayouts,
          totalAggregatorPayout,
          netAggregatorCommission,
          totalSalaryAdvances,
          activeLoanBalance,
          netProfit,
          profitMargin: totalSales > 0 ? (netProfit / totalSales) * 100 : 0,
          trend: {
            salesChangePct: pctChange(totalSales, prevSales),
            profitChangePct: pctChange(netProfit, prevProfit),
            prevPeriod: `${prevStartStr} to ${prevEndStr}`
          }
        }
      };
    } catch (error) {
      console.error('Error fetching export data:', error);
      alert('Failed to fetch data for export');
      return null;
    } finally {
      setLoading(false);
    }
  };

  const handlePreview = async () => {
    const data = await fetchDataForExport();
    if (data) {
      setPreviewData(data);
      setShowPreview(true);
    }
  };

  const generateCSV = (data: any) => {
    let csv = `Data Export Report\n`;
    csv += `Period: ${data.startDate} to ${data.endDate}\n`;
    if (data.storeId) {
      csv += `Store ID: ${data.storeId}\n`;
    }
    csv += `Generated on: ${new Date().toLocaleString()}\n\n`;

    // Summary Section
    const s = data.summary;
    csv += `SUMMARY\n`;
    csv += `Total Offline Sales,₹${s.totalOfflineSales.toLocaleString()}\n`;
    csv += `Total Online Sales (Swiggy + Zomato),₹${s.totalOnlineSalesLogged.toLocaleString()}\n`;
    csv += `Total Sales,₹${s.totalSales.toLocaleString()}\n`;
    csv += `Total Inventory Spend,₹${s.totalInventorySpend.toLocaleString()}\n`;
    csv += `  - Store Inventory Spend,₹${s.totalStoreInventorySpend.toLocaleString()}\n`;
    csv += `  - Production House Inventory Spend,₹${s.totalProductionInventorySpend.toLocaleString()}\n`;
    csv += `Total Overhead Spend,₹${s.totalOverheadSpend.toLocaleString()}\n`;
    csv += `  - Store Overhead Spend,₹${s.totalStoreOverheadSpend.toLocaleString()}\n`;
    csv += `  - Production House Overhead Spend,₹${s.totalProductionOverheadSpend.toLocaleString()}\n`;
    csv += `Total Employee Payouts,₹${s.totalPayouts.toLocaleString()}\n`;
    csv += `Net Profit/Loss,₹${s.netProfit.toLocaleString()}\n`;
    csv += `Profit Margin,${s.profitMargin.toFixed(1)}%\n`;
    csv += `Aggregator Payout (Swiggy + Zomato),₹${s.totalAggregatorPayout.toLocaleString()}\n`;
    csv += `Net Aggregator Commission (Sales - Payout),₹${s.netAggregatorCommission.toLocaleString()}\n`;
    csv += `Salary Advances Requested,₹${s.totalSalaryAdvances.toLocaleString()}\n`;
    csv += `Outstanding Loan Balance,₹${s.activeLoanBalance.toLocaleString()}\n`;
    csv += `vs Previous Period (${s.trend.prevPeriod}),Sales ${s.trend.salesChangePct >= 0 ? '+' : ''}${s.trend.salesChangePct.toFixed(1)}% • Profit ${s.trend.profitChangePct >= 0 ? '+' : ''}${s.trend.profitChangePct.toFixed(1)}%\n\n`;

    // Store-wise breakdown (only populated when viewing all stores)
    if (data.storeBreakdown && data.storeBreakdown.length > 0) {
      csv += `\nSTORE-WISE BREAKDOWN\n`;
      csv += `Store,Sales,Inventory Spend,Overhead Spend,Profit\n`;
      data.storeBreakdown.forEach((row: any) => {
        csv += `"${row.storeName}",₹${row.sales.toLocaleString()},₹${row.inventorySpend.toLocaleString()},₹${row.overheadSpend.toLocaleString()},₹${row.profit.toLocaleString()}\n`;
      });
    }

    // Item-level sales (units sold per momo type)
    if (data.itemTotals && Object.keys(data.itemTotals).length > 0) {
      csv += `\nITEM-WISE UNITS SOLD\n`;
      csv += `Momo Type,Units Sold\n`;
      Object.entries(data.itemTotals)
        .sort((a: any, b: any) => b[1] - a[1])
        .forEach(([label, qty]: any) => {
          csv += `"${label}",${qty}\n`;
        });
    }

    // Inventory Section
    csv += `\nINVENTORY ITEMS\n`;
    csv += `Date,Category,Item Name,Quantity,Unit,Price per Unit,Total Cost\n`;
    data.inventory.forEach((item: any) => {
      csv += `${item.date},"${item.category}","${item.itemName}",${item.quantity},"${item.unit}",₹${item.price || 0},₹${item.totalCost}\n`;
    });

    // Production Section
    if (data.production && data.production.length > 0) {
      csv += `\nPRODUCTION DATA\n`;
      csv += `Date,Chicken Momos,Chicken Cheese,Veg Momos,Cheese Corn,Paneer,Veg Kurkure,Chicken Kurkure,Wastage (kg)\n`;
      data.production.forEach((item: any) => {
        csv += `${item.date},${item.chickenMomos?.final || 0},${item.chickenCheeseMomos?.final || 0},${item.vegMomos?.final || 0},${item.cheeseCornMomos?.final || 0},${item.paneerMomos?.final || 0},${item.vegKurkureMomos?.final || 0},${item.chickenKurkureMomos?.final || 0},${item.wastage?.total || 0}\n`;
      });
    }

    // Overheads Section
    csv += `\nOVERHEAD EXPENSES\n`;
    csv += `Date,Category,Description,Amount\n`;
    data.overheads.forEach((item: any) => {
      csv += `${item.date},"${item.category}","${item.description || '-'}",₹${item.amount}\n`;
    });

    // Sales Section
    csv += `\nSALES DATA (offline cash/Paytm reconciliation)\n`;
    csv += `Date,Offline Sales (Paytm),Offline Sales (Cash),Employee Salaries,Cash in Hand,Cash Offset,Status\n`;
    data.sales.forEach((item: any) => {
      csv += `${item.date},₹${item.paytmAmount || 0},₹${item.cashAmount || 0},₹${item.employeeSalary || 0},₹${item.actualCashInHand || 0},₹${item.cashOffset || 0},"${item.approvalRequired ? 'Pending Approval' : 'Approved'}"\n`;
    });

    // Online Sales Section
    if (data.onlineSales && data.onlineSales.length > 0) {
      csv += `\nONLINE SALES (Swiggy + Zomato, logged by operations manager)\n`;
      csv += `Date,Swiggy Sales,Zomato Sales,Total\n`;
      data.onlineSales.forEach((item: any) => {
        csv += `${item.date},₹${item.swiggySales || 0},₹${item.zomatoSales || 0},₹${(item.swiggySales || 0) + (item.zomatoSales || 0)}\n`;
      });
    }

    // Aggregator Payout Reconciliation Section
    if (data.onlinePayouts && data.onlinePayouts.length > 0) {
      csv += `\nAGGREGATOR PAYOUT RECONCILIATION\n`;
      csv += `Date,Swiggy Payout,Zomato Payout,Total Payout\n`;
      data.onlinePayouts.forEach((item: any) => {
        csv += `${item.date},₹${item.swiggyPayout || 0},₹${item.zomatoPayout || 0},₹${(item.swiggyPayout || 0) + (item.zomatoPayout || 0)}\n`;
      });
    }

    // Payouts Section
    csv += `\nEMPLOYEE PAYOUTS\n`;
    csv += `Date,Employee Name,Employee ID,Amount\n`;
    data.payouts.forEach((item: any) => {
      const employee = data.employees.find((e: any) => e.id === item.employeeId);
      csv += `${item.date},"${item.employeeName}","${employee?.employeeId || '-'}",₹${item.amount}\n`;
    });

    // Salary Advances Section
    if (data.salaryAdvances && data.salaryAdvances.length > 0) {
      csv += `\nSALARY ADVANCES\n`;
      csv += `Date,Employee Name,Amount,Status,Monthly Deduction\n`;
      data.salaryAdvances.forEach((item: any) => {
        csv += `${item.requestDate},"${item.employeeName}",₹${item.amount},"${item.status}",₹${item.monthlyDeduction}\n`;
      });
    }

    // Online Loans Section
    if (data.onlineLoans && data.onlineLoans.length > 0) {
      csv += `\nONLINE LOANS\n`;
      csv += `Date,Store,Lender,Loan Amount,Repaid,Outstanding,Status\n`;
      data.onlineLoans.forEach((item: any) => {
        const outstanding = Math.max(0, (item.loanAmount || 0) - (item.repaidAmount || 0));
        csv += `${item.loanDate},"${item.storeName || '-'}","${item.investorName || '-'}",₹${item.loanAmount},₹${item.repaidAmount || 0},₹${outstanding},"${item.status}"\n`;
      });
    }

    // Employees Section
    csv += `\nEMPLOYEE MASTER LIST\n`;
    csv += `Employee ID,Name,Type,Role,Phone,Daily Rate\n`;
    data.employees.forEach((emp: any) => {
      csv += `"${emp.employeeId}","${emp.name}","${emp.type}","${emp.role || '-'}","${emp.phone}",₹${emp.dailyRate || '-'}\n`;
    });

    return csv;
  };

  const generateExcel = (data: any) => {
    // For Excel, we'll generate a similar CSV but with better formatting
    // In a real app, you'd use a library like xlsx or exceljs
    let content = generateCSV(data);
    return content;
  };

  const generatePDF = (data: any) => {
    // For PDF generation, we'll create HTML content
    // In a real app, you'd use jsPDF or pdfmake
    let html = `
      <html>
        <head>
          <title>Data Export Report</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; }
            h1 { color: #333; border-bottom: 2px solid #4F46E5; padding-bottom: 10px; }
            h2 { color: #4F46E5; margin-top: 30px; }
            table { width: 100%; border-collapse: collapse; margin: 20px 0; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            th { background-color: #4F46E5; color: white; }
            .summary { background-color: #f0f9ff; padding: 15px; border-radius: 8px; margin: 20px 0; }
            .summary-item { display: flex; justify-content: space-between; padding: 5px 0; }
          </style>
        </head>
        <body>
          <h1>Data Export Report</h1>
          <p><strong>Period:</strong> ${data.startDate} to ${data.endDate}</p>
          ${data.storeId ? `<p><strong>Store ID:</strong> ${data.storeId}</p>` : ''}
          <p><strong>Generated on:</strong> ${new Date().toLocaleString()}</p>
          
          <div class="summary">
            <h2>Summary</h2>
            <div class="summary-item"><span>Total Offline Sales:</span><span>₹${data.summary.totalOfflineSales.toLocaleString()}</span></div>
            <div class="summary-item"><span>Total Online Sales (Swiggy + Zomato):</span><span>₹${data.summary.totalOnlineSalesLogged.toLocaleString()}</span></div>
            <div class="summary-item"><span>Total Sales:</span><span>₹${data.summary.totalSales.toLocaleString()}</span></div>
            <div class="summary-item"><span>Total Inventory Spend:</span><span>₹${data.summary.totalInventorySpend.toLocaleString()}</span></div>
            <div class="summary-item"><span>&nbsp;&nbsp;- Store:</span><span>₹${data.summary.totalStoreInventorySpend.toLocaleString()}</span></div>
            <div class="summary-item"><span>&nbsp;&nbsp;- Production House:</span><span>₹${data.summary.totalProductionInventorySpend.toLocaleString()}</span></div>
            <div class="summary-item"><span>Total Overhead Spend:</span><span>₹${data.summary.totalOverheadSpend.toLocaleString()}</span></div>
            <div class="summary-item"><span>&nbsp;&nbsp;- Store:</span><span>₹${data.summary.totalStoreOverheadSpend.toLocaleString()}</span></div>
            <div class="summary-item"><span>&nbsp;&nbsp;- Production House:</span><span>₹${data.summary.totalProductionOverheadSpend.toLocaleString()}</span></div>
            <div class="summary-item"><span>Total Employee Payouts:</span><span>₹${data.summary.totalPayouts.toLocaleString()}</span></div>
            <div class="summary-item"><strong>Net Profit/Loss:</strong><strong>₹${data.summary.netProfit.toLocaleString()}</strong></div>
            <div class="summary-item"><span>Profit Margin:</span><span>${data.summary.profitMargin.toFixed(1)}%</span></div>
            <div class="summary-item"><span>Net Aggregator Commission (Sales - Payout):</span><span>₹${data.summary.netAggregatorCommission.toLocaleString()}</span></div>
            <div class="summary-item"><span>Salary Advances Requested:</span><span>₹${data.summary.totalSalaryAdvances.toLocaleString()}</span></div>
            <div class="summary-item"><span>Outstanding Loan Balance:</span><span>₹${data.summary.activeLoanBalance.toLocaleString()}</span></div>
            <div class="summary-item"><span>vs Previous Period (${data.summary.trend.prevPeriod}):</span><span>Sales ${data.summary.trend.salesChangePct >= 0 ? '+' : ''}${data.summary.trend.salesChangePct.toFixed(1)}% • Profit ${data.summary.trend.profitChangePct >= 0 ? '+' : ''}${data.summary.trend.profitChangePct.toFixed(1)}%</span></div>
          </div>

          ${data.storeBreakdown && data.storeBreakdown.length > 0 ? `
          <h2>Store-wise Breakdown</h2>
          <table>
            <thead>
              <tr><th>Store</th><th>Sales</th><th>Inventory Spend</th><th>Overhead Spend</th><th>Profit</th></tr>
            </thead>
            <tbody>
              ${data.storeBreakdown.map((row: any) => `
                <tr>
                  <td>${row.storeName}</td>
                  <td>₹${row.sales.toLocaleString()}</td>
                  <td>₹${row.inventorySpend.toLocaleString()}</td>
                  <td>₹${row.overheadSpend.toLocaleString()}</td>
                  <td>₹${row.profit.toLocaleString()}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          ` : ''}

          ${data.itemTotals && Object.keys(data.itemTotals).length > 0 ? `
          <h2>Item-wise Units Sold</h2>
          <table>
            <thead>
              <tr><th>Momo Type</th><th>Units Sold</th></tr>
            </thead>
            <tbody>
              ${Object.entries(data.itemTotals).sort((a: any, b: any) => b[1] - a[1]).map(([label, qty]: any) => `
                <tr><td>${label}</td><td>${qty}</td></tr>
              `).join('')}
            </tbody>
          </table>
          ` : ''}

          <h2>Inventory Items</h2>
          <table>
            <thead>
              <tr><th>Date</th><th>Category</th><th>Item Name</th><th>Quantity</th><th>Unit</th><th>Price/Unit</th><th>Total Cost</th></tr>
            </thead>
            <tbody>
              ${data.inventory.map((item: any) => `
                <tr>
                  <td>${item.date}</td>
                  <td>${item.category}</td>
                  <td>${item.itemName}</td>
                  <td>${item.quantity}</td>
                  <td>${item.unit}</td>
                  <td>₹${item.price || 0}</td>
                  <td>₹${item.totalCost}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>

          ${data.production && data.production.length > 0 ? `
          <h2>Production Data</h2>
          <table>
            <thead>
              <tr><th>Date</th><th>Chicken Momos</th><th>Chicken Cheese</th><th>Veg Momos</th><th>Cheese Corn</th><th>Paneer</th><th>Veg Kurkure</th><th>Chicken Kurkure</th><th>Wastage (kg)</th></tr>
            </thead>
            <tbody>
              ${data.production.map((item: any) => `
                <tr>
                  <td>${item.date}</td>
                  <td>${item.chickenMomos?.final || 0}</td>
                  <td>${item.chickenCheeseMomos?.final || 0}</td>
                  <td>${item.vegMomos?.final || 0}</td>
                  <td>${item.cheeseCornMomos?.final || 0}</td>
                  <td>${item.paneerMomos?.final || 0}</td>
                  <td>${item.vegKurkureMomos?.final || 0}</td>
                  <td>${item.chickenKurkureMomos?.final || 0}</td>
                  <td>${item.wastage?.total || 0}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          ` : ''}

          <h2>Overhead Expenses</h2>
          <table>
            <thead>
              <tr><th>Date</th><th>Category</th><th>Description</th><th>Amount</th></tr>
            </thead>
            <tbody>
              ${data.overheads.map((item: any) => `
                <tr>
                  <td>${item.date}</td>
                  <td>${item.category}</td>
                  <td>${item.description || '-'}</td>
                  <td>₹${item.amount}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>

          <h2>Sales Data (offline cash/Paytm reconciliation)</h2>
          <table>
            <thead>
              <tr><th>Date</th><th>Offline (Paytm)</th><th>Offline (Cash)</th><th>Salaries</th><th>Cash in Hand</th><th>Cash Offset</th><th>Status</th></tr>
            </thead>
            <tbody>
              ${data.sales.map((item: any) => `
                <tr>
                  <td>${item.date}</td>
                  <td>₹${item.paytmAmount || 0}</td>
                  <td>₹${item.cashAmount || 0}</td>
                  <td>₹${item.employeeSalary || 0}</td>
                  <td>₹${item.actualCashInHand || 0}</td>
                  <td>₹${item.cashOffset || 0}</td>
                  <td>${item.approvalRequired ? 'Pending' : 'Approved'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>

          ${data.onlineSales && data.onlineSales.length > 0 ? `
          <h2>Online Sales (Swiggy + Zomato)</h2>
          <table>
            <thead>
              <tr><th>Date</th><th>Swiggy</th><th>Zomato</th><th>Total</th></tr>
            </thead>
            <tbody>
              ${data.onlineSales.map((item: any) => `
                <tr>
                  <td>${item.date}</td>
                  <td>₹${item.swiggySales || 0}</td>
                  <td>₹${item.zomatoSales || 0}</td>
                  <td>₹${(item.swiggySales || 0) + (item.zomatoSales || 0)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          ` : ''}

          ${data.onlinePayouts && data.onlinePayouts.length > 0 ? `
          <h2>Aggregator Payout Reconciliation</h2>
          <table>
            <thead>
              <tr><th>Date</th><th>Swiggy Payout</th><th>Zomato Payout</th><th>Total</th></tr>
            </thead>
            <tbody>
              ${data.onlinePayouts.map((item: any) => `
                <tr>
                  <td>${item.date}</td>
                  <td>₹${item.swiggyPayout || 0}</td>
                  <td>₹${item.zomatoPayout || 0}</td>
                  <td>₹${(item.swiggyPayout || 0) + (item.zomatoPayout || 0)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          ` : ''}

          <h2>Employee Payouts</h2>
          <table>
            <thead>
              <tr><th>Date</th><th>Employee Name</th><th>Employee ID</th><th>Amount</th></tr>
            </thead>
            <tbody>
              ${data.payouts.map((item: any) => {
                const employee = data.employees.find((e: any) => e.id === item.employeeId);
                return `
                  <tr>
                    <td>${item.date}</td>
                    <td>${item.employeeName}</td>
                    <td>${employee?.employeeId || '-'}</td>
                    <td>₹${item.amount}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>

          ${data.salaryAdvances && data.salaryAdvances.length > 0 ? `
          <h2>Salary Advances</h2>
          <table>
            <thead>
              <tr><th>Date</th><th>Employee Name</th><th>Amount</th><th>Status</th><th>Monthly Deduction</th></tr>
            </thead>
            <tbody>
              ${data.salaryAdvances.map((item: any) => `
                <tr>
                  <td>${item.requestDate}</td>
                  <td>${item.employeeName}</td>
                  <td>₹${item.amount}</td>
                  <td>${item.status}</td>
                  <td>₹${item.monthlyDeduction}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          ` : ''}

          ${data.onlineLoans && data.onlineLoans.length > 0 ? `
          <h2>Online Loans</h2>
          <table>
            <thead>
              <tr><th>Date</th><th>Store</th><th>Lender</th><th>Loan Amount</th><th>Repaid</th><th>Outstanding</th><th>Status</th></tr>
            </thead>
            <tbody>
              ${data.onlineLoans.map((item: any) => `
                <tr>
                  <td>${item.loanDate}</td>
                  <td>${item.storeName || '-'}</td>
                  <td>${item.investorName || '-'}</td>
                  <td>₹${item.loanAmount}</td>
                  <td>₹${item.repaidAmount || 0}</td>
                  <td>₹${Math.max(0, (item.loanAmount || 0) - (item.repaidAmount || 0))}</td>
                  <td>${item.status}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          ` : ''}

          <h2>Employee Master List</h2>
          <table>
            <thead>
              <tr><th>Employee ID</th><th>Name</th><th>Type</th><th>Role</th><th>Phone</th><th>Daily Rate</th></tr>
            </thead>
            <tbody>
              ${data.employees.map((emp: any) => `
                <tr>
                  <td>${emp.employeeId}</td>
                  <td>${emp.name}</td>
                  <td>${emp.type}</td>
                  <td>${emp.role || '-'}</td>
                  <td>${emp.phone}</td>
                  <td>${emp.dailyRate ? '₹' + emp.dailyRate : '-'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </body>
      </html>
    `;
    return html;
  };

  const handleExport = async () => {
    const data = await fetchDataForExport();
    if (!data) return;

    let content: string;
    let mimeType: string;
    let fileName: string;
    const dateStr = `${data.startDate}_to_${data.endDate}`;

    switch (exportFormat) {
      case 'csv':
        content = generateCSV(data);
        mimeType = 'text/csv';
        fileName = `export_${dateStr}.csv`;
        break;
      case 'excel':
        content = generateExcel(data);
        mimeType = 'application/vnd.ms-excel';
        fileName = `export_${dateStr}.xls`;
        break;
      case 'pdf':
        content = generatePDF(data);
        mimeType = 'text/html';
        fileName = `export_${dateStr}.html`;
        break;
      default:
        return;
    }

    // Create and download file
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    alert(`Data exported successfully as ${fileName}`);
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl text-gray-900 mb-2">Export Data</h1>
          <p className="text-gray-600">Download comprehensive reports in multiple formats</p>
          {selectedStoreId && (
            <div className="mt-2 inline-block bg-orange-100 text-orange-800 px-3 py-1 rounded-full text-sm">
              Store: {selectedStoreId}
            </div>
          )}
        </div>

        {/* Export Configuration Card */}
        <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
          {/* Date Range Selection */}
          <div className="mb-6">
            <h2 className="text-lg text-gray-900 mb-4 flex items-center gap-2">
              <Calendar className="w-5 h-5 text-orange-600" />
              Select Date Range
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <button
                onClick={() => setDateRange('today')}
                className={`p-4 rounded-lg border-2 transition-all ${
                  dateRange === 'today'
                    ? 'border-orange-500 bg-orange-50 text-orange-700'
                    : 'border-gray-200 hover:border-orange-300'
                }`}
              >
                <div className="font-medium">Today</div>
                <div className="text-xs text-gray-500 mt-1">Current day</div>
              </button>
              <button
                onClick={() => setDateRange('weekly')}
                className={`p-4 rounded-lg border-2 transition-all ${
                  dateRange === 'weekly'
                    ? 'border-orange-500 bg-orange-50 text-orange-700'
                    : 'border-gray-200 hover:border-orange-300'
                }`}
              >
                <div className="font-medium">Last 7 Days</div>
                <div className="text-xs text-gray-500 mt-1">Weekly data</div>
              </button>
              <button
                onClick={() => setDateRange('monthly')}
                className={`p-4 rounded-lg border-2 transition-all ${
                  dateRange === 'monthly'
                    ? 'border-orange-500 bg-orange-50 text-orange-700'
                    : 'border-gray-200 hover:border-orange-300'
                }`}
              >
                <div className="font-medium">This Month</div>
                <div className="text-xs text-gray-500 mt-1">Monthly data</div>
              </button>
              <button
                onClick={() => setDateRange('custom')}
                className={`p-4 rounded-lg border-2 transition-all ${
                  dateRange === 'custom'
                    ? 'border-orange-500 bg-orange-50 text-orange-700'
                    : 'border-gray-200 hover:border-orange-300'
                }`}
              >
                <div className="font-medium">Custom</div>
                <div className="text-xs text-gray-500 mt-1">Select range</div>
              </button>
            </div>

            {dateRange === 'custom' && (
              <div className="mt-4 p-4 bg-orange-50 rounded-lg">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-gray-700 mb-2">Start Date</label>
                    <input
                      type="date"
                      value={customStartDate}
                      onChange={(e) => setCustomStartDate(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-700 mb-2">End Date</label>
                    <input
                      type="date"
                      value={customEndDate}
                      onChange={(e) => setCustomEndDate(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Export Format Selection */}
          <div className="mb-6">
            <h2 className="text-lg text-gray-900 mb-4 flex items-center gap-2">
              <FileText className="w-5 h-5 text-blue-600" />
              Select Export Format
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <button
                onClick={() => setExportFormat('csv')}
                className={`p-4 rounded-lg border-2 transition-all ${
                  exportFormat === 'csv'
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-gray-200 hover:border-blue-300'
                }`}
              >
                <Table className="w-8 h-8 mx-auto mb-2" />
                <div className="font-medium">CSV</div>
                <div className="text-xs text-gray-500 mt-1">Excel compatible</div>
              </button>
              <button
                onClick={() => setExportFormat('excel')}
                className={`p-4 rounded-lg border-2 transition-all ${
                  exportFormat === 'excel'
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-gray-200 hover:border-blue-300'
                }`}
              >
                <FileSpreadsheet className="w-8 h-8 mx-auto mb-2" />
                <div className="font-medium">Excel</div>
                <div className="text-xs text-gray-500 mt-1">XLS format</div>
              </button>
              <button
                onClick={() => setExportFormat('pdf')}
                className={`p-4 rounded-lg border-2 transition-all ${
                  exportFormat === 'pdf'
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-gray-200 hover:border-blue-300'
                }`}
              >
                <FileText className="w-8 h-8 mx-auto mb-2" />
                <div className="font-medium">PDF/HTML</div>
                <div className="text-xs text-gray-500 mt-1">Print ready</div>
              </button>
            </div>
          </div>

          {/* Export Information */}
          <div className="bg-gradient-to-br from-[#E8D5F2] to-[#D4B5F0] rounded-lg p-4 mb-6">
            <h3 className="font-medium text-gray-900 mb-2">Export Will Include:</h3>
            <ul className="space-y-1 text-sm text-gray-700">
              <li>✓ Complete Inventory Items with quantities and costs</li>
              <li>✓ Production Data with all momo types and wastage</li>
              <li>✓ All Overhead Expenses categorized</li>
              <li>✓ Offline Sales Data with payment breakdowns</li>
              <li>✓ Online Sales (Swiggy + Zomato) and aggregator payout reconciliation</li>
              <li>✓ Item-wise units sold, ranked by volume</li>
              <li>✓ Store-wise breakdown (when viewing all stores)</li>
              <li>✓ Salary Advances and Online Loans</li>
              <li>✓ Employee Payouts with detailed records</li>
              <li>✓ Employee Master List</li>
              <li>✓ Financial Summary with profit margin and trend vs. previous period</li>
            </ul>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3">
            <button
              onClick={handlePreview}
              disabled={loading}
              className="flex-1 flex items-center justify-center gap-2 px-6 py-3 border-2 border-orange-600 text-orange-700 rounded-lg hover:bg-orange-50 transition-colors disabled:opacity-50"
            >
              <FileText className="w-5 h-5" />
              Preview Data
            </button>
            <button
              onClick={handleExport}
              disabled={loading}
              className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-orange-600 to-blue-600 text-white rounded-lg hover:from-orange-700 hover:to-blue-700 transition-colors disabled:opacity-50"
            >
              <Download className="w-5 h-5" />
              {loading ? 'Generating...' : 'Export Data'}
            </button>
          </div>
        </div>

        {/* Info Card */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
              <span className="text-white text-sm">ℹ️</span>
            </div>
            <div>
              <h4 className="font-medium text-blue-900 mb-1">Export Tips</h4>
              <ul className="text-sm text-blue-800 space-y-1">
                <li>• CSV files can be opened in Excel, Google Sheets, or any spreadsheet application</li>
                <li>• PDF/HTML exports are best for printing or sharing reports</li>
                <li>• Custom date ranges allow you to export specific time periods</li>
                <li>• All monetary values are in Indian Rupees (₹)</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Item Catalog Cleanup - Cluster Heads Only */}
        {userRole === 'cluster_head' && (
          <div className="mt-6 bg-blue-50 border-2 border-blue-200 rounded-lg p-6">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center flex-shrink-0">
                <span className="text-white text-lg">🧹</span>
              </div>
              <div className="flex-1">
                <h4 className="font-medium text-blue-900 mb-2">Item Catalog Cleanup</h4>
                <p className="text-sm text-blue-800 mb-4">
                  Review duplicate/misspelled inventory items and add emoji + Bengali names — nothing changes until you approve each row.
                </p>
                <button
                  onClick={() => setShowItemCleanup(true)}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Open Item Catalog Cleanup
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Recategorize Miscellaneous Expenses - Cluster Heads Only */}
        {userRole === 'cluster_head' && (
          <div className="mt-6 bg-amber-50 border-2 border-amber-200 rounded-lg p-6">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 bg-amber-500 rounded-full flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1">
                <h4 className="font-medium text-amber-900 mb-2">Recategorize Miscellaneous Expenses</h4>
                <p className="text-sm text-amber-800 mb-4">
                  "Miscellaneous" is no longer offered when logging a new expense — assign these old entries to a proper category.
                </p>
                {miscItems === null ? (
                  <button
                    onClick={loadMiscItems}
                    disabled={miscLoading || !accessToken}
                    className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors disabled:opacity-50"
                  >
                    {miscLoading ? 'Loading...' : 'Load Miscellaneous Items'}
                  </button>
                ) : miscItems.length === 0 ? (
                  <p className="text-sm text-green-800">✅ No miscellaneous items left to recategorize.</p>
                ) : (
                  <div className="space-y-3">
                    {miscItems.map((item) => (
                      <div key={item.id} className="bg-white rounded-lg border border-amber-200 p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{item.description || 'No description'}</p>
                          <p className="text-xs text-gray-500">{item.date} • ₹{item.amount.toFixed(2)}</p>
                        </div>
                        <select
                          value={miscNewCategory[item.id] || ''}
                          onChange={(e) => setMiscNewCategory((prev) => ({ ...prev, [item.id]: e.target.value }))}
                          className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                        >
                          <option value="">Choose new category...</option>
                          {Object.entries(OVERHEAD_CATEGORY_META)
                            .filter(([value]) => value !== 'miscellaneous')
                            .map(([value, meta]) => (
                              <option key={value} value={value}>{meta.label}</option>
                            ))}
                        </select>
                        <button
                          onClick={() => saveMiscRecategorization(item)}
                          disabled={!miscNewCategory[item.id] || miscSaving === item.id}
                          className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors disabled:opacity-50 text-sm whitespace-nowrap"
                        >
                          {miscSaving === item.id ? 'Saving...' : 'Save'}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Production Launch Cleanup - Cluster Heads Only */}
        {userRole === 'cluster_head' && (
          <div className="mt-6 bg-red-50 border-2 border-red-200 rounded-lg p-6">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 bg-red-500 rounded-full flex items-center justify-center flex-shrink-0">
                <span className="text-white text-lg">⚠️</span>
              </div>
              <div className="flex-1">
                <h4 className="font-medium text-red-900 mb-2">Production Data Cleanup</h4>
                <p className="text-sm text-red-800 mb-4">
                  Remove ALL transactional data (inventory logs, sales, stock requests, production data, notifications, etc.) to prepare for production launch.
                  <strong className="block mt-2">⚠️ This will DELETE:</strong>
                </p>
                <ul className="text-sm text-red-800 space-y-1 ml-4 mb-3">
                  <li>❌ All inventory purchase logs</li>
                  <li>❌ All sales records</li>
                  <li>❌ All production logs & requests</li>
                  <li>❌ All stock requests & recalibrations</li>
                  <li>❌ All overhead & fixed costs</li>
                  <li>❌ All notifications</li>
                </ul>
                <p className="text-sm text-green-800 mb-4">
                  <strong className="block mt-2">✅ This will PRESERVE:</strong>
                </p>
                <ul className="text-sm text-green-800 space-y-1 ml-4 mb-4">
                  <li>✓ Inventory Items (product metadata)</li>
                  <li>✓ Employee Master Data</li>
                  <li>✓ Employee Payouts, Timesheets & Leaves</li>
                  <li>✓ Stores & Production Houses</li>
                </ul>
                <button
                  onClick={async () => {
                    if (!confirm('⚠️ CRITICAL WARNING: This will PERMANENTLY remove ALL transactional data:\n\n❌ Inventory logs, Sales, Production data, Stock requests, Overheads, Fixed costs, Notifications\n\n✅ PRESERVED: Inventory items metadata, Employee master data, Payouts, Timesheets, Leaves, Stores, Production houses\n\nThis action CANNOT be undone!\n\nAre you absolutely sure you want to proceed?')) {
                      return;
                    }
                    
                    try {
                      setLoading(true);
                      const result = await api.cleanupProductionData();
                      alert(`✅ ${result.message}\n\n📊 Total Deleted: ${result.totalDeleted} records\n\n🗑️ Breakdown:\n- Inventory Logs: ${result.stats.inventory}\n- Sales: ${result.stats.sales}\n- Item Sales: ${result.stats.itemSales}\n- Overheads: ${result.stats.overheads}\n- Fixed Costs: ${result.stats.fixedCosts}\n- Stock Requests: ${result.stats.stockRequests}\n- Stock Recalibrations: ${result.stats.stockRecalibrations}\n- Production Data: ${result.stats.productionData}\n- Production Requests: ${result.stats.productionRequests}\n- Notifications: ${result.stats.notifications}`);
                      
                      // Reload the page to refresh all data
                      window.location.reload();
                    } catch (error: any) {
                      console.error('Error during cleanup:', error);
                      alert(`❌ Failed to cleanup production data: ${error.message}`);
                    } finally {
                      setLoading(false);
                    }
                  }}
                  disabled={loading}
                  className="px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  <span>🗑️</span>
                  {loading ? 'Cleaning up...' : 'Cleanup Production Data'}
                </button>
                <p className="text-xs text-red-700 mt-3">
                  ⚠️ This action cannot be undone. Make sure you have exported all necessary data first.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Preview Modal */}
      {showPreview && previewData && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200 flex items-center justify-between sticky top-0 bg-white">
              <h2 className="text-xl text-gray-900">Data Preview</h2>
              <button
                onClick={() => setShowPreview(false)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="p-6">
              {/* Summary */}
              <div className="bg-gradient-to-br from-blue-50 to-orange-50 rounded-lg p-6 mb-6">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Summary</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <div className="text-sm text-gray-600">Inventory</div>
                    <div className="text-xl text-gray-900">₹{previewData.summary.totalInventorySpend.toLocaleString()}</div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-600">Overheads</div>
                    <div className="text-xl text-gray-900">₹{previewData.summary.totalOverheadSpend.toLocaleString()}</div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-600">Total Sales (offline + online)</div>
                    <div className="text-xl text-green-600">₹{previewData.summary.totalSales.toLocaleString()}</div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-600">Payouts</div>
                    <div className="text-xl text-gray-900">₹{previewData.summary.totalPayouts.toLocaleString()}</div>
                  </div>
                </div>
                <div className="mt-4 pt-4 border-t border-orange-200">
                  <div className="flex justify-between items-center">
                    <span className="font-medium text-gray-900">Net Profit/Loss:</span>
                    <span className={`text-xl font-bold ${previewData.summary.netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      ₹{previewData.summary.netProfit.toLocaleString()} ({previewData.summary.profitMargin.toFixed(1)}% margin)
                    </span>
                  </div>
                  <div className="flex justify-between items-center mt-2 text-sm">
                    <span className="text-gray-600">vs previous period ({previewData.summary.trend.prevPeriod}):</span>
                    <span className={previewData.summary.trend.salesChangePct >= 0 ? 'text-green-600' : 'text-red-600'}>
                      Sales {previewData.summary.trend.salesChangePct >= 0 ? '+' : ''}{previewData.summary.trend.salesChangePct.toFixed(1)}% • Profit {previewData.summary.trend.profitChangePct >= 0 ? '+' : ''}{previewData.summary.trend.profitChangePct.toFixed(1)}%
                    </span>
                  </div>
                </div>
              </div>

              {/* Store vs Production House Expense Split */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <div className="text-sm font-medium text-blue-900 mb-2">Store Expenses</div>
                  <div className="flex justify-between text-sm text-blue-800">
                    <span>Inventory</span>
                    <span>₹{previewData.summary.totalStoreInventorySpend.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-sm text-blue-800">
                    <span>Overhead</span>
                    <span>₹{previewData.summary.totalStoreOverheadSpend.toLocaleString()}</span>
                  </div>
                </div>
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <div className="text-sm font-medium text-green-900 mb-2">Production House Expenses</div>
                  <div className="flex justify-between text-sm text-green-800">
                    <span>Inventory</span>
                    <span>₹{previewData.summary.totalProductionInventorySpend.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-sm text-green-800">
                    <span>Overhead</span>
                    <span>₹{previewData.summary.totalProductionOverheadSpend.toLocaleString()}</span>
                  </div>
                </div>
              </div>

              {/* Counts */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="text-sm text-gray-600">Inventory Items</div>
                  <div className="text-2xl text-gray-900">{previewData.inventory.length}</div>
                </div>
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="text-sm text-gray-600">Production Logs</div>
                  <div className="text-2xl text-gray-900">{previewData.production?.length || 0}</div>
                </div>
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="text-sm text-gray-600">Overhead Entries</div>
                  <div className="text-2xl text-gray-900">{previewData.overheads.length}</div>
                </div>
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="text-sm text-gray-600">Sales Records</div>
                  <div className="text-2xl text-gray-900">{previewData.sales.length}</div>
                </div>
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="text-sm text-gray-600">Online Sales Entries</div>
                  <div className="text-2xl text-gray-900">{previewData.onlineSales?.length || 0}</div>
                </div>
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="text-sm text-gray-600">Aggregator Payouts</div>
                  <div className="text-2xl text-gray-900">{previewData.onlinePayouts?.length || 0}</div>
                </div>
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="text-sm text-gray-600">Payout Records</div>
                  <div className="text-2xl text-gray-900">{previewData.payouts.length}</div>
                </div>
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="text-sm text-gray-600">Salary Advances</div>
                  <div className="text-2xl text-gray-900">{previewData.salaryAdvances?.length || 0}</div>
                </div>
              </div>

              {previewData.storeBreakdown && previewData.storeBreakdown.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-lg font-medium text-gray-900 mb-3">Store-wise Breakdown</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm border-collapse">
                      <thead>
                        <tr className="bg-gray-100 text-left">
                          <th className="p-2">Store</th>
                          <th className="p-2">Sales</th>
                          <th className="p-2">Inventory</th>
                          <th className="p-2">Overhead</th>
                          <th className="p-2">Profit</th>
                        </tr>
                      </thead>
                      <tbody>
                        {previewData.storeBreakdown.map((row: any) => (
                          <tr key={row.storeId} className="border-t border-gray-100">
                            <td className="p-2">{row.storeName}</td>
                            <td className="p-2">₹{row.sales.toLocaleString()}</td>
                            <td className="p-2">₹{row.inventorySpend.toLocaleString()}</td>
                            <td className="p-2">₹{row.overheadSpend.toLocaleString()}</td>
                            <td className={`p-2 ${row.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>₹{row.profit.toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="text-sm text-gray-600 text-center">
                <p>Period: {previewData.startDate} to {previewData.endDate}</p>
                {previewData.storeId && <p>Store ID: {previewData.storeId}</p>}
                <p className="mt-2">Click "Export Data" to download the complete report</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {showItemCleanup && <ItemCatalogCleanup onClose={() => setShowItemCleanup(false)} />}
    </div>
  );
}