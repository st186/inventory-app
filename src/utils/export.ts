/**
 * Comprehensive data export utilities for Bhandar-IMS
 * Supports CSV, JSON, and Excel-like formats
 */

import { InventoryItem, OverheadItem, SalesData, ProductionData } from '../App';

/**
 * Convert data to CSV format
 */
export function convertToCSV(data: any[], headers?: string[]): string {
  if (data.length === 0) return '';
  
  // Auto-detect headers if not provided
  const finalHeaders = headers || Object.keys(data[0]);
  
  // Create CSV header row
  const headerRow = finalHeaders.join(',');
  
  // Create data rows
  const dataRows = data.map(item => {
    return finalHeaders.map(header => {
      let value = item[header];
      
      // Handle nested objects
      if (typeof value === 'object' && value !== null) {
        value = JSON.stringify(value);
      }
      
      // Escape commas and quotes
      if (typeof value === 'string') {
        value = value.replace(/"/g, '""');
        if (value.includes(',') || value.includes('\n') || value.includes('"')) {
          value = `"${value}"`;
        }
      }
      
      return value ?? '';
    }).join(',');
  });
  
  return [headerRow, ...dataRows].join('\n');
}

/**
 * Download data as CSV file
 */
export function downloadCSV(filename: string, data: any[], headers?: string[]) {
  const csv = convertToCSV(data, headers);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  
  link.setAttribute('href', url);
  link.setAttribute('download', `${filename}_${new Date().toISOString().split('T')[0]}.csv`);
  link.style.visibility = 'hidden';
  
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  URL.revokeObjectURL(url);
}

/**
 * Download data as JSON file
 */
export function downloadJSON(filename: string, data: any) {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  
  link.setAttribute('href', url);
  link.setAttribute('download', `${filename}_${new Date().toISOString().split('T')[0]}.json`);
  link.style.visibility = 'hidden';
  
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  URL.revokeObjectURL(url);
}

/**
 * Export sales data with comprehensive details
 */
export function exportSalesData(salesData: SalesData[], storeName?: string) {
  const formatted = salesData.map(sale => ({
    Date: sale.date,
    Store: sale.storeName || storeName || 'N/A',
    'Cash Amount': sale.cashAmount || 0,
    'Paytm Amount': sale.paytmAmount || 0,
    'Online Sales': sale.onlineSales || 0,
    'Total Revenue': (sale.cashAmount || 0) + (sale.paytmAmount || 0) + (sale.onlineSales || 0),
    'Created By': sale.createdBy || 'N/A',
    'Created At': sale.createdAt ? new Date(sale.createdAt).toLocaleString() : 'N/A'
  }));
  
  downloadCSV('sales_report', formatted);
}

/**
 * Export inventory data with comprehensive details
 */
export function exportInventoryData(inventoryData: InventoryItem[], storeName?: string) {
  const formatted = inventoryData.map(item => ({
    Date: item.date,
    Store: item.storeName || storeName || 'N/A',
    Category: item.category,
    Item: item.itemName,
    Quantity: item.quantity,
    Unit: item.unit || 'N/A',
    'Unit Cost': item.unitCost || 0,
    'Total Cost': item.totalCost || 0,
    Vendor: item.vendor || 'N/A',
    'Created By': item.createdBy || 'N/A',
    'Created At': item.createdAt ? new Date(item.createdAt).toLocaleString() : 'N/A'
  }));
  
  downloadCSV('inventory_report', formatted);
}

/**
 * Export overhead data with comprehensive details
 */
export function exportOverheadData(overheadData: OverheadItem[], storeName?: string) {
  const formatted = overheadData.map(item => ({
    Date: item.date,
    Store: item.storeName || storeName || 'N/A',
    Category: item.category,
    Description: item.description || 'N/A',
    Amount: item.amount,
    'Payment Mode': item.paymentMode || 'N/A',
    'Created By': item.createdBy || 'N/A',
    'Created At': item.createdAt ? new Date(item.createdAt).toLocaleString() : 'N/A'
  }));
  
  downloadCSV('overhead_report', formatted);
}

/**
 * Export production data with comprehensive details
 */
export function exportProductionData(productionData: ProductionData[], storeName?: string) {
  const formatted = productionData.map(prod => ({
    Date: prod.date,
    Store: prod.storeName || storeName || 'N/A',
    'Approval Status': prod.approvalStatus || 'pending',
    'Chicken Momos': prod.chickenMomos?.final || 0,
    'Chicken Cheese Momos': prod.chickenCheeseMomos?.final || 0,
    'Veg Momos': prod.vegMomos?.final || 0,
    'Cheese Corn Momos': prod.cheeseCornMomos?.final || 0,
    'Paneer Momos': prod.paneerMomos?.final || 0,
    'Veg Kurkure Momos': prod.vegKurkureMomos?.final || 0,
    'Chicken Kurkure Momos': prod.chickenKurkureMomos?.final || 0,
    'Total Production': (prod.chickenMomos?.final || 0) + (prod.chickenCheeseMomos?.final || 0) + 
                        (prod.vegMomos?.final || 0) + (prod.cheeseCornMomos?.final || 0) + 
                        (prod.paneerMomos?.final || 0) + (prod.vegKurkureMomos?.final || 0) + 
                        (prod.chickenKurkureMomos?.final || 0),
    'Dough Wastage': prod.wastage?.dough || 0,
    'Stuffing Wastage': prod.wastage?.stuffing || 0,
    'Batter Wastage': prod.wastage?.batter || 0,
    'Coating Wastage': prod.wastage?.coating || 0,
    'Total Wastage': (prod.wastage?.dough || 0) + (prod.wastage?.stuffing || 0) + 
                     (prod.wastage?.batter || 0) + (prod.wastage?.coating || 0),
    'Created By': prod.createdBy || 'N/A',
    'Approved By': prod.approvedBy || 'N/A'
  }));
  
  downloadCSV('production_report', formatted);
}

/**
 * Export comprehensive analytics report
 */
export function exportAnalyticsReport(data: {
  salesData: SalesData[];
  inventoryData: InventoryItem[];
  overheadData: OverheadItem[];
  productionData?: ProductionData[];
  metrics: any;
  storeName?: string;
  dateRange?: { start: string; end: string };
}) {
  const report = {
    generatedAt: new Date().toISOString(),
    storeName: data.storeName || 'All Stores',
    dateRange: data.dateRange,
    summary: {
      totalRevenue: data.metrics.totalRevenue,
      totalExpenses: data.metrics.totalExpenses,
      netProfit: data.metrics.netProfit,
      profitMargin: data.metrics.profitMargin,
      salesRecords: data.salesData.length,
      inventoryRecords: data.inventoryData.length,
      overheadRecords: data.overheadData.length,
      productionRecords: data.productionData?.length || 0
    },
    salesData: data.salesData,
    inventoryData: data.inventoryData,
    overheadData: data.overheadData,
    productionData: data.productionData || []
  };
  
  downloadJSON('analytics_report', report);
}

/**
 * Export data in multiple formats (ZIP would require additional library)
 * For now, we'll export individual files
 */
export function exportAllData(data: {
  salesData: SalesData[];
  inventoryData: InventoryItem[];
  overheadData: OverheadItem[];
  productionData?: ProductionData[];
  storeName?: string;
}) {
  // Export each data type
  if (data.salesData.length > 0) {
    exportSalesData(data.salesData, data.storeName);
  }
  
  if (data.inventoryData.length > 0) {
    setTimeout(() => exportInventoryData(data.inventoryData, data.storeName), 100);
  }
  
  if (data.overheadData.length > 0) {
    setTimeout(() => exportOverheadData(data.overheadData, data.storeName), 200);
  }
  
  if (data.productionData && data.productionData.length > 0) {
    setTimeout(() => exportProductionData(data.productionData, data.storeName), 300);
  }
}

/**
 * Copy data to clipboard as formatted text
 */
export async function copyToClipboard(data: any[], format: 'csv' | 'json' = 'csv'): Promise<boolean> {
  try {
    let text: string;
    
    if (format === 'csv') {
      text = convertToCSV(data);
    } else {
      text = JSON.stringify(data, null, 2);
    }
    
    await navigator.clipboard.writeText(text);
    return true;
  } catch (error) {
    console.error('Failed to copy to clipboard:', error);
    return false;
  }
}
