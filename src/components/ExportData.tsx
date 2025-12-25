import { useState, useEffect } from 'react';
import { Download, FileText, Table, FileSpreadsheet, Calendar, X } from 'lucide-react';
import * as api from '../utils/api';
import { getSupabaseClient } from '../utils/supabase/client';

interface ExportDataProps {
  userRole: 'manager' | 'cluster_head';
}

type DateRange = 'today' | 'weekly' | 'monthly' | 'custom';
type ExportFormat = 'csv' | 'pdf' | 'excel';

export function ExportData({ userRole }: ExportDataProps) {
  const [dateRange, setDateRange] = useState<DateRange>('today');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [exportFormat, setExportFormat] = useState<ExportFormat>('csv');
  const [loading, setLoading] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [previewData, setPreviewData] = useState<any>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);

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

  const getDateRangeValues = () => {
    const today = new Date();
    let startDate: string;
    let endDate: string;

    switch (dateRange) {
      case 'today':
        startDate = today.toISOString().split('T')[0];
        endDate = startDate;
        break;
      case 'weekly':
        const weekStart = new Date(today);
        weekStart.setDate(today.getDate() - 7);
        startDate = weekStart.toISOString().split('T')[0];
        endDate = today.toISOString().split('T')[0];
        break;
      case 'monthly':
        const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
        const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);
        startDate = monthStart.toISOString().split('T')[0];
        endDate = monthEnd.toISOString().split('T')[0];
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

      const [inventory, overheads, sales, employees, payouts] = await Promise.all([
        api.fetchInventory(accessToken),
        api.fetchOverheads(accessToken),
        api.fetchSalesData(accessToken),
        api.getEmployees(),
        api.getPayouts()
      ]);

      // Filter data by date range
      const filterByDate = (items: any[], dateField: string = 'date') => {
        return items.filter((item: any) => {
          const itemDate = item[dateField];
          return itemDate >= startDate && itemDate <= endDate;
        });
      };

      const filteredInventory = filterByDate(inventory);
      const filteredOverheads = filterByDate(overheads);
      const filteredSales = filterByDate(sales);
      const filteredPayouts = filterByDate(payouts);

      // Calculate totals based on the actual data structure
      const totalInventorySpend = filteredInventory.reduce((sum: number, item: any) => sum + (item.totalCost || 0), 0);
      const totalOverheadSpend = filteredOverheads.reduce((sum: number, item: any) => sum + (item.amount || 0), 0);
      const totalSales = filteredSales.reduce((sum: number, item: any) => sum + (item.offlineSales || 0) + (item.onlineSales || 0), 0);
      const totalPayouts = filteredPayouts.reduce((sum: number, item: any) => sum + (item.amount || 0), 0);

      return {
        startDate,
        endDate,
        inventory: filteredInventory,
        overheads: filteredOverheads,
        sales: filteredSales,
        employees,
        payouts: filteredPayouts,
        summary: {
          totalInventorySpend,
          totalOverheadSpend,
          totalSales,
          totalPayouts,
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
    csv += `Generated on: ${new Date().toLocaleString()}\n\n`;

    // Summary Section
    csv += `SUMMARY\n`;
    csv += `Total Inventory Spend,₹${data.summary.totalInventorySpend.toLocaleString()}\n`;
    csv += `Total Overhead Spend,₹${data.summary.totalOverheadSpend.toLocaleString()}\n`;
    csv += `Total Sales,₹${data.summary.totalSales.toLocaleString()}\n`;
    csv += `Total Payouts,₹${data.summary.totalPayouts.toLocaleString()}\n`;
    csv += `Net Profit/Loss,₹${(data.summary.totalSales - data.summary.totalInventorySpend - data.summary.totalOverheadSpend - data.summary.totalPayouts).toLocaleString()}\n\n`;

    // Inventory Section
    csv += `\nINVENTORY ITEMS\n`;
    csv += `Date,Category,Item Name,Quantity,Unit,Price per Unit,Total Cost\n`;
    data.inventory.forEach((item: any) => {
      csv += `${item.date},"${item.category}","${item.itemName}",${item.quantity},"${item.unit}",₹${item.costPerUnit},₹${item.totalCost}\n`;
    });

    // Overheads Section
    csv += `\nOVERHEAD EXPENSES\n`;
    csv += `Date,Category,Description,Amount\n`;
    data.overheads.forEach((item: any) => {
      csv += `${item.date},"${item.category}","${item.description || '-'}",₹${item.amount}\n`;
    });

    // Sales Section
    csv += `\nSALES DATA\n`;
    csv += `Date,Offline Sales (Paytm),Offline Sales (Cash),Online Sales,Employee Salaries,Cash in Hand,Discrepancy,Status\n`;
    data.sales.forEach((item: any) => {
      csv += `${item.date},₹${item.offlinePaytm || 0},₹${item.offlineCash || 0},₹${item.onlineSales || 0},₹${item.employeeSalaries || 0},₹${item.cashInHand || 0},₹${item.discrepancy || 0},"${item.approvalRequired ? 'Pending Approval' : 'Approved'}"\n`;
    });

    // Payouts Section
    csv += `\nEMPLOYEE PAYOUTS\n`;
    csv += `Date,Employee Name,Employee ID,Amount\n`;
    data.payouts.forEach((item: any) => {
      const employee = data.employees.find((e: any) => e.id === item.employeeId);
      csv += `${item.date},"${item.employeeName}","${employee?.employeeId || '-'}",₹${item.amount}\n`;
    });

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
          <p><strong>Generated on:</strong> ${new Date().toLocaleString()}</p>
          
          <div class="summary">
            <h2>Summary</h2>
            <div class="summary-item"><span>Total Inventory Spend:</span><span>₹${data.summary.totalInventorySpend.toLocaleString()}</span></div>
            <div class="summary-item"><span>Total Overhead Spend:</span><span>₹${data.summary.totalOverheadSpend.toLocaleString()}</span></div>
            <div class="summary-item"><span>Total Sales:</span><span>₹${data.summary.totalSales.toLocaleString()}</span></div>
            <div class="summary-item"><span>Total Payouts:</span><span>₹${data.summary.totalPayouts.toLocaleString()}</span></div>
            <div class="summary-item"><strong>Net Profit/Loss:</strong><strong>₹${(data.summary.totalSales - data.summary.totalInventorySpend - data.summary.totalOverheadSpend - data.summary.totalPayouts).toLocaleString()}</strong></div>
          </div>

          <h2>Inventory Items</h2>
          <table>
            <thead>
              <tr><th>Date</th><th>Category</th><th>Item Name</th><th>Quantity</th><th>Unit</th><th>Price/Unit</th><th>Amount</th></tr>
            </thead>
            <tbody>
              ${data.inventory.map((item: any) => `
                <tr>
                  <td>${item.date}</td>
                  <td>${item.category}</td>
                  <td>${item.itemName}</td>
                  <td>${item.quantity}</td>
                  <td>${item.unit}</td>
                  <td>₹${item.pricePerUnit}</td>
                  <td>₹${item.amount}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>

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

          <h2>Sales Data</h2>
          <table>
            <thead>
              <tr><th>Date</th><th>Offline (Paytm)</th><th>Offline (Cash)</th><th>Online</th><th>Salaries</th><th>Cash in Hand</th><th>Discrepancy</th><th>Status</th></tr>
            </thead>
            <tbody>
              ${data.sales.map((item: any) => `
                <tr>
                  <td>${item.date}</td>
                  <td>₹${item.offlinePaytm || 0}</td>
                  <td>₹${item.offlineCash || 0}</td>
                  <td>₹${item.onlineSales || 0}</td>
                  <td>₹${item.employeeSalaries || 0}</td>
                  <td>₹${item.cashInHand || 0}</td>
                  <td>₹${item.discrepancy || 0}</td>
                  <td>${item.approvalRequired ? 'Pending' : 'Approved'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>

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
        </div>

        {/* Export Configuration Card */}
        <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
          {/* Date Range Selection */}
          <div className="mb-6">
            <h2 className="text-lg text-gray-900 mb-4 flex items-center gap-2">
              <Calendar className="w-5 h-5 text-purple-600" />
              Select Date Range
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <button
                onClick={() => setDateRange('today')}
                className={`p-4 rounded-lg border-2 transition-all ${
                  dateRange === 'today'
                    ? 'border-purple-500 bg-purple-50 text-purple-700'
                    : 'border-gray-200 hover:border-purple-300'
                }`}
              >
                <div className="font-medium">Today</div>
                <div className="text-xs text-gray-500 mt-1">Current day</div>
              </button>
              <button
                onClick={() => setDateRange('weekly')}
                className={`p-4 rounded-lg border-2 transition-all ${
                  dateRange === 'weekly'
                    ? 'border-purple-500 bg-purple-50 text-purple-700'
                    : 'border-gray-200 hover:border-purple-300'
                }`}
              >
                <div className="font-medium">Last 7 Days</div>
                <div className="text-xs text-gray-500 mt-1">Weekly data</div>
              </button>
              <button
                onClick={() => setDateRange('monthly')}
                className={`p-4 rounded-lg border-2 transition-all ${
                  dateRange === 'monthly'
                    ? 'border-purple-500 bg-purple-50 text-purple-700'
                    : 'border-gray-200 hover:border-purple-300'
                }`}
              >
                <div className="font-medium">This Month</div>
                <div className="text-xs text-gray-500 mt-1">Monthly data</div>
              </button>
              <button
                onClick={() => setDateRange('custom')}
                className={`p-4 rounded-lg border-2 transition-all ${
                  dateRange === 'custom'
                    ? 'border-purple-500 bg-purple-50 text-purple-700'
                    : 'border-gray-200 hover:border-purple-300'
                }`}
              >
                <div className="font-medium">Custom</div>
                <div className="text-xs text-gray-500 mt-1">Select range</div>
              </button>
            </div>

            {dateRange === 'custom' && (
              <div className="mt-4 p-4 bg-purple-50 rounded-lg">
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
              <li>✓ All Overhead Expenses categorized</li>
              <li>✓ Sales Data with payment breakdowns</li>
              <li>✓ Employee Payouts with detailed records</li>
              <li>✓ Employee Master List</li>
              <li>✓ Financial Summary with profit/loss calculations</li>
            </ul>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3">
            <button
              onClick={handlePreview}
              disabled={loading}
              className="flex-1 flex items-center justify-center gap-2 px-6 py-3 border-2 border-purple-600 text-purple-700 rounded-lg hover:bg-purple-50 transition-colors disabled:opacity-50"
            >
              <FileText className="w-5 h-5" />
              Preview Data
            </button>
            <button
              onClick={handleExport}
              disabled={loading}
              className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg hover:from-purple-700 hover:to-blue-700 transition-colors disabled:opacity-50"
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
              <div className="bg-gradient-to-br from-blue-50 to-purple-50 rounded-lg p-6 mb-6">
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
                    <div className="text-sm text-gray-600">Sales</div>
                    <div className="text-xl text-green-600">₹{previewData.summary.totalSales.toLocaleString()}</div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-600">Payouts</div>
                    <div className="text-xl text-gray-900">₹{previewData.summary.totalPayouts.toLocaleString()}</div>
                  </div>
                </div>
                <div className="mt-4 pt-4 border-t border-purple-200">
                  <div className="flex justify-between items-center">
                    <span className="font-medium text-gray-900">Net Profit/Loss:</span>
                    <span className={`text-xl font-bold ${
                      (previewData.summary.totalSales - previewData.summary.totalInventorySpend - previewData.summary.totalOverheadSpend - previewData.summary.totalPayouts) >= 0
                        ? 'text-green-600'
                        : 'text-red-600'
                    }`}>
                      ₹{(previewData.summary.totalSales - previewData.summary.totalInventorySpend - previewData.summary.totalOverheadSpend - previewData.summary.totalPayouts).toLocaleString()}
                    </span>
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
                  <div className="text-sm text-gray-600">Overhead Entries</div>
                  <div className="text-2xl text-gray-900">{previewData.overheads.length}</div>
                </div>
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="text-sm text-gray-600">Sales Records</div>
                  <div className="text-2xl text-gray-900">{previewData.sales.length}</div>
                </div>
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="text-sm text-gray-600">Payout Records</div>
                  <div className="text-2xl text-gray-900">{previewData.payouts.length}</div>
                </div>
              </div>

              <div className="text-sm text-gray-600 text-center">
                <p>Period: {previewData.startDate} to {previewData.endDate}</p>
                <p className="mt-2">Click "Export Data" to download the complete report</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}