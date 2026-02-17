import{c as Z,r as i,B as ee,j as e,C as te,F as D,E as se,G as ae,X as re,H as le,I as oe,J as ne,p as de,m as ie,K as ce}from"./index-BWZpdZV9.js";import{F as he}from"./file-spreadsheet-ChLFIFh8.js";/**
 * @license lucide-react v0.487.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const me=[["path",{d:"M12 3v18",key:"108xh3"}],["rect",{width:"18",height:"18",x:"3",y:"3",rx:"2",key:"afitv7"}],["path",{d:"M3 9h18",key:"1pudct"}],["path",{d:"M3 15h18",key:"5xshup"}]],xe=Z("table",me);function be({userRole:R,selectedStoreId:h,currentUserId:ue}){const[m,y]=i.useState("today"),[E,M]=i.useState(""),[k,A]=i.useState(""),[g,j]=i.useState("csv"),[x,b]=i.useState(!1),[F,w]=i.useState(!1),[r,q]=i.useState(null),[v,U]=i.useState(null),V=ee();i.useEffect(()=>{(async()=>{const{data:{session:a}}=await V.auth.getSession();a?.access_token&&U(a.access_token)})()},[]);const _=()=>{const s=new Date;let a,t;switch(m){case"today":a=s.toISOString().split("T")[0],t=a;break;case"weekly":const l=new Date(s);l.setDate(s.getDate()-7),a=l.toISOString().split("T")[0],t=s.toISOString().split("T")[0];break;case"monthly":const n=new Date(s.getFullYear(),s.getMonth(),1),u=new Date(s.getFullYear(),s.getMonth()+1,0);a=n.toISOString().split("T")[0],t=u.toISOString().split("T")[0];break;case"custom":a=E,t=k;break}return{startDate:a,endDate:t}},I=async()=>{const{startDate:s,endDate:a}=_();if(!s||!a)return alert("Please select a valid date range"),null;if(!v)return alert("Not authenticated. Please log in again."),null;try{b(!0);const[t,l,n,u,f,c]=await Promise.all([le(v),oe(v),ne(v),de(),ie(),ce()]),p=(o,d="date")=>o.filter(T=>{const L=T[d],O=L>=s&&L<=a;if(h){const J=T.storeId===h;return O&&J}return O}),N=p(t),S=p(l),$=p(n),P=p(f),B=p(c);console.log("Export Data Debug:",{selectedStoreId:h,totalInventory:t.length,filteredInventory:N.length,totalSales:n.length,filteredSales:$.length,totalOverheads:l.length,filteredOverheads:S.length,sampleSalesStoreIds:n.slice(0,3).map(o=>({date:o.date,storeId:o.storeId})),sampleOverheadStoreIds:l.slice(0,3).map(o=>({date:o.date,storeId:o.storeId}))});const W=N.reduce((o,d)=>o+(d.totalCost||0),0),X=S.reduce((o,d)=>o+(d.amount||0),0),z=$.reduce((o,d)=>o+(d.offlineSales||0)+(d.onlineSales||0),0),Q=P.reduce((o,d)=>o+(d.amount||0),0);return{startDate:s,endDate:a,storeId:h,inventory:N,overheads:S,sales:$,employees:u,payouts:P,production:B,summary:{totalInventorySpend:W,totalOverheadSpend:X,totalSales:z,totalPayouts:Q}}}catch(t){return console.error("Error fetching export data:",t),alert("Failed to fetch data for export"),null}finally{b(!1)}},H=async()=>{const s=await I();s&&(q(s),w(!0))},C=s=>{let a=`Data Export Report
`;return a+=`Period: ${s.startDate} to ${s.endDate}
`,s.storeId&&(a+=`Store ID: ${s.storeId}
`),a+=`Generated on: ${new Date().toLocaleString()}

`,a+=`SUMMARY
`,a+=`Total Inventory Spend,₹${s.summary.totalInventorySpend.toLocaleString()}
`,a+=`Total Overhead Spend,${s.summary.totalOverheadSpend.toLocaleString()}
`,a+=`Total Sales,₹${s.summary.totalSales.toLocaleString()}
`,a+=`Total Payouts,₹${s.summary.totalPayouts.toLocaleString()}
`,a+=`Net Profit/Loss,₹${(s.summary.totalSales-s.summary.totalInventorySpend-s.summary.totalOverheadSpend-s.summary.totalPayouts).toLocaleString()}

`,a+=`
INVENTORY ITEMS
`,a+=`Date,Category,Item Name,Quantity,Unit,Price per Unit,Total Cost
`,s.inventory.forEach(t=>{a+=`${t.date},"${t.category}","${t.itemName}",${t.quantity},"${t.unit}",₹${t.price||0},₹${t.totalCost}
`}),s.production&&s.production.length>0&&(a+=`
PRODUCTION DATA
`,a+=`Date,Chicken Momos,Chicken Cheese,Veg Momos,Cheese Corn,Paneer,Veg Kurkure,Chicken Kurkure,Wastage (kg)
`,s.production.forEach(t=>{a+=`${t.date},${t.chickenMomos?.final||0},${t.chickenCheeseMomos?.final||0},${t.vegMomos?.final||0},${t.cheeseCornMomos?.final||0},${t.paneerMomos?.final||0},${t.vegKurkureMomos?.final||0},${t.chickenKurkureMomos?.final||0},${t.wastage?.total||0}
`})),a+=`
OVERHEAD EXPENSES
`,a+=`Date,Category,Description,Amount
`,s.overheads.forEach(t=>{a+=`${t.date},"${t.category}","${t.description||"-"}",₹${t.amount}
`}),a+=`
SALES DATA
`,a+=`Date,Offline Sales (Paytm),Offline Sales (Cash),Online Sales,Employee Salaries,Cash in Hand,Cash Offset,Status
`,s.sales.forEach(t=>{a+=`${t.date},₹${t.paytmAmount||0},₹${t.cashAmount||0},₹${t.onlineSales||0},₹${t.employeeSalary||0},₹${t.actualCashInHand||0},₹${t.cashOffset||0},"${t.approvalRequired?"Pending Approval":"Approved"}"
`}),a+=`
EMPLOYEE PAYOUTS
`,a+=`Date,Employee Name,Employee ID,Amount
`,s.payouts.forEach(t=>{const l=s.employees.find(n=>n.id===t.employeeId);a+=`${t.date},"${t.employeeName}","${l?.employeeId||"-"}",₹${t.amount}
`}),a+=`
EMPLOYEE MASTER LIST
`,a+=`Employee ID,Name,Type,Role,Phone,Daily Rate
`,s.employees.forEach(t=>{a+=`"${t.employeeId}","${t.name}","${t.type}","${t.role||"-"}","${t.phone}",₹${t.dailyRate||"-"}
`}),a},K=s=>C(s),Y=s=>`
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
          <p><strong>Period:</strong> ${s.startDate} to ${s.endDate}</p>
          ${s.storeId?`<p><strong>Store ID:</strong> ${s.storeId}</p>`:""}
          <p><strong>Generated on:</strong> ${new Date().toLocaleString()}</p>
          
          <div class="summary">
            <h2>Summary</h2>
            <div class="summary-item"><span>Total Inventory Spend:</span><span>₹${s.summary.totalInventorySpend.toLocaleString()}</span></div>
            <div class="summary-item"><span>Total Overhead Spend:</span><span>₹${s.summary.totalOverheadSpend.toLocaleString()}</span></div>
            <div class="summary-item"><span>Total Sales:</span><span>₹${s.summary.totalSales.toLocaleString()}</span></div>
            <div class="summary-item"><span>Total Payouts:</span><span>₹${s.summary.totalPayouts.toLocaleString()}</span></div>
            <div class="summary-item"><strong>Net Profit/Loss:</strong><strong>₹${(s.summary.totalSales-s.summary.totalInventorySpend-s.summary.totalOverheadSpend-s.summary.totalPayouts).toLocaleString()}</strong></div>
          </div>

          <h2>Inventory Items</h2>
          <table>
            <thead>
              <tr><th>Date</th><th>Category</th><th>Item Name</th><th>Quantity</th><th>Unit</th><th>Price/Unit</th><th>Total Cost</th></tr>
            </thead>
            <tbody>
              ${s.inventory.map(t=>`
                <tr>
                  <td>${t.date}</td>
                  <td>${t.category}</td>
                  <td>${t.itemName}</td>
                  <td>${t.quantity}</td>
                  <td>${t.unit}</td>
                  <td>₹${t.price||0}</td>
                  <td>₹${t.totalCost}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>

          ${s.production&&s.production.length>0?`
          <h2>Production Data</h2>
          <table>
            <thead>
              <tr><th>Date</th><th>Chicken Momos</th><th>Chicken Cheese</th><th>Veg Momos</th><th>Cheese Corn</th><th>Paneer</th><th>Veg Kurkure</th><th>Chicken Kurkure</th><th>Wastage (kg)</th></tr>
            </thead>
            <tbody>
              ${s.production.map(t=>`
                <tr>
                  <td>${t.date}</td>
                  <td>${t.chickenMomos?.final||0}</td>
                  <td>${t.chickenCheeseMomos?.final||0}</td>
                  <td>${t.vegMomos?.final||0}</td>
                  <td>${t.cheeseCornMomos?.final||0}</td>
                  <td>${t.paneerMomos?.final||0}</td>
                  <td>${t.vegKurkureMomos?.final||0}</td>
                  <td>${t.chickenKurkureMomos?.final||0}</td>
                  <td>${t.wastage?.total||0}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
          `:""}

          <h2>Overhead Expenses</h2>
          <table>
            <thead>
              <tr><th>Date</th><th>Category</th><th>Description</th><th>Amount</th></tr>
            </thead>
            <tbody>
              ${s.overheads.map(t=>`
                <tr>
                  <td>${t.date}</td>
                  <td>${t.category}</td>
                  <td>${t.description||"-"}</td>
                  <td>₹${t.amount}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>

          <h2>Sales Data</h2>
          <table>
            <thead>
              <tr><th>Date</th><th>Offline (Paytm)</th><th>Offline (Cash)</th><th>Online</th><th>Salaries</th><th>Cash in Hand</th><th>Cash Offset</th><th>Status</th></tr>
            </thead>
            <tbody>
              ${s.sales.map(t=>`
                <tr>
                  <td>${t.date}</td>
                  <td>₹${t.paytmAmount||0}</td>
                  <td>₹${t.cashAmount||0}</td>
                  <td>₹${t.onlineSales||0}</td>
                  <td>₹${t.employeeSalary||0}</td>
                  <td>₹${t.actualCashInHand||0}</td>
                  <td>₹${t.cashOffset||0}</td>
                  <td>${t.approvalRequired?"Pending":"Approved"}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>

          <h2>Employee Payouts</h2>
          <table>
            <thead>
              <tr><th>Date</th><th>Employee Name</th><th>Employee ID</th><th>Amount</th></tr>
            </thead>
            <tbody>
              ${s.payouts.map(t=>{const l=s.employees.find(n=>n.id===t.employeeId);return`
                  <tr>
                    <td>${t.date}</td>
                    <td>${t.employeeName}</td>
                    <td>${l?.employeeId||"-"}</td>
                    <td>₹${t.amount}</td>
                  </tr>
                `}).join("")}
            </tbody>
          </table>

          <h2>Employee Master List</h2>
          <table>
            <thead>
              <tr><th>Employee ID</th><th>Name</th><th>Type</th><th>Role</th><th>Phone</th><th>Daily Rate</th></tr>
            </thead>
            <tbody>
              ${s.employees.map(t=>`
                <tr>
                  <td>${t.employeeId}</td>
                  <td>${t.name}</td>
                  <td>${t.type}</td>
                  <td>${t.role||"-"}</td>
                  <td>${t.phone}</td>
                  <td>${t.dailyRate?"₹"+t.dailyRate:"-"}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </body>
      </html>
    `,G=async()=>{const s=await I();if(!s)return;let a,t,l;const n=`${s.startDate}_to_${s.endDate}`;switch(g){case"csv":a=C(s),t="text/csv",l=`export_${n}.csv`;break;case"excel":a=K(s),t="application/vnd.ms-excel",l=`export_${n}.xls`;break;case"pdf":a=Y(s),t="text/html",l=`export_${n}.html`;break;default:return}const u=new Blob([a],{type:t}),f=URL.createObjectURL(u),c=document.createElement("a");c.href=f,c.download=l,document.body.appendChild(c),c.click(),document.body.removeChild(c),URL.revokeObjectURL(f),alert(`Data exported successfully as ${l}`)};return e.jsxs("div",{className:"min-h-screen bg-gray-50 p-6",children:[e.jsxs("div",{className:"max-w-4xl mx-auto",children:[e.jsxs("div",{className:"mb-8",children:[e.jsx("h1",{className:"text-3xl text-gray-900 mb-2",children:"Export Data"}),e.jsx("p",{className:"text-gray-600",children:"Download comprehensive reports in multiple formats"}),h&&e.jsxs("div",{className:"mt-2 inline-block bg-purple-100 text-purple-800 px-3 py-1 rounded-full text-sm",children:["Store: ",h]})]}),e.jsxs("div",{className:"bg-white rounded-xl shadow-sm p-6 mb-6",children:[e.jsxs("div",{className:"mb-6",children:[e.jsxs("h2",{className:"text-lg text-gray-900 mb-4 flex items-center gap-2",children:[e.jsx(te,{className:"w-5 h-5 text-purple-600"}),"Select Date Range"]}),e.jsxs("div",{className:"grid grid-cols-2 md:grid-cols-4 gap-3",children:[e.jsxs("button",{onClick:()=>y("today"),className:`p-4 rounded-lg border-2 transition-all ${m==="today"?"border-purple-500 bg-purple-50 text-purple-700":"border-gray-200 hover:border-purple-300"}`,children:[e.jsx("div",{className:"font-medium",children:"Today"}),e.jsx("div",{className:"text-xs text-gray-500 mt-1",children:"Current day"})]}),e.jsxs("button",{onClick:()=>y("weekly"),className:`p-4 rounded-lg border-2 transition-all ${m==="weekly"?"border-purple-500 bg-purple-50 text-purple-700":"border-gray-200 hover:border-purple-300"}`,children:[e.jsx("div",{className:"font-medium",children:"Last 7 Days"}),e.jsx("div",{className:"text-xs text-gray-500 mt-1",children:"Weekly data"})]}),e.jsxs("button",{onClick:()=>y("monthly"),className:`p-4 rounded-lg border-2 transition-all ${m==="monthly"?"border-purple-500 bg-purple-50 text-purple-700":"border-gray-200 hover:border-purple-300"}`,children:[e.jsx("div",{className:"font-medium",children:"This Month"}),e.jsx("div",{className:"text-xs text-gray-500 mt-1",children:"Monthly data"})]}),e.jsxs("button",{onClick:()=>y("custom"),className:`p-4 rounded-lg border-2 transition-all ${m==="custom"?"border-purple-500 bg-purple-50 text-purple-700":"border-gray-200 hover:border-purple-300"}`,children:[e.jsx("div",{className:"font-medium",children:"Custom"}),e.jsx("div",{className:"text-xs text-gray-500 mt-1",children:"Select range"})]})]}),m==="custom"&&e.jsx("div",{className:"mt-4 p-4 bg-purple-50 rounded-lg",children:e.jsxs("div",{className:"grid grid-cols-1 md:grid-cols-2 gap-4",children:[e.jsxs("div",{children:[e.jsx("label",{className:"block text-sm text-gray-700 mb-2",children:"Start Date"}),e.jsx("input",{type:"date",value:E,onChange:s=>M(s.target.value),className:"w-full px-4 py-2 border border-gray-300 rounded-lg"})]}),e.jsxs("div",{children:[e.jsx("label",{className:"block text-sm text-gray-700 mb-2",children:"End Date"}),e.jsx("input",{type:"date",value:k,onChange:s=>A(s.target.value),className:"w-full px-4 py-2 border border-gray-300 rounded-lg"})]})]})})]}),e.jsxs("div",{className:"mb-6",children:[e.jsxs("h2",{className:"text-lg text-gray-900 mb-4 flex items-center gap-2",children:[e.jsx(D,{className:"w-5 h-5 text-blue-600"}),"Select Export Format"]}),e.jsxs("div",{className:"grid grid-cols-1 md:grid-cols-3 gap-3",children:[e.jsxs("button",{onClick:()=>j("csv"),className:`p-4 rounded-lg border-2 transition-all ${g==="csv"?"border-blue-500 bg-blue-50 text-blue-700":"border-gray-200 hover:border-blue-300"}`,children:[e.jsx(xe,{className:"w-8 h-8 mx-auto mb-2"}),e.jsx("div",{className:"font-medium",children:"CSV"}),e.jsx("div",{className:"text-xs text-gray-500 mt-1",children:"Excel compatible"})]}),e.jsxs("button",{onClick:()=>j("excel"),className:`p-4 rounded-lg border-2 transition-all ${g==="excel"?"border-blue-500 bg-blue-50 text-blue-700":"border-gray-200 hover:border-blue-300"}`,children:[e.jsx(he,{className:"w-8 h-8 mx-auto mb-2"}),e.jsx("div",{className:"font-medium",children:"Excel"}),e.jsx("div",{className:"text-xs text-gray-500 mt-1",children:"XLS format"})]}),e.jsxs("button",{onClick:()=>j("pdf"),className:`p-4 rounded-lg border-2 transition-all ${g==="pdf"?"border-blue-500 bg-blue-50 text-blue-700":"border-gray-200 hover:border-blue-300"}`,children:[e.jsx(D,{className:"w-8 h-8 mx-auto mb-2"}),e.jsx("div",{className:"font-medium",children:"PDF/HTML"}),e.jsx("div",{className:"text-xs text-gray-500 mt-1",children:"Print ready"})]})]})]}),e.jsxs("div",{className:"bg-gradient-to-br from-[#E8D5F2] to-[#D4B5F0] rounded-lg p-4 mb-6",children:[e.jsx("h3",{className:"font-medium text-gray-900 mb-2",children:"Export Will Include:"}),e.jsxs("ul",{className:"space-y-1 text-sm text-gray-700",children:[e.jsx("li",{children:"✓ Complete Inventory Items with quantities and costs"}),e.jsx("li",{children:"✓ Production Data with all momo types and wastage"}),e.jsx("li",{children:"✓ All Overhead Expenses categorized"}),e.jsx("li",{children:"✓ Sales Data with payment breakdowns"}),e.jsx("li",{children:"✓ Employee Payouts with detailed records"}),e.jsx("li",{children:"✓ Employee Master List"}),e.jsx("li",{children:"✓ Financial Summary with profit/loss calculations"})]})]}),e.jsxs("div",{className:"flex gap-3",children:[e.jsxs("button",{onClick:H,disabled:x,className:"flex-1 flex items-center justify-center gap-2 px-6 py-3 border-2 border-purple-600 text-purple-700 rounded-lg hover:bg-purple-50 transition-colors disabled:opacity-50",children:[e.jsx(D,{className:"w-5 h-5"}),"Preview Data"]}),e.jsxs("button",{onClick:G,disabled:x,className:"flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg hover:from-purple-700 hover:to-blue-700 transition-colors disabled:opacity-50",children:[e.jsx(se,{className:"w-5 h-5"}),x?"Generating...":"Export Data"]})]})]}),e.jsx("div",{className:"bg-blue-50 border border-blue-200 rounded-lg p-4",children:e.jsxs("div",{className:"flex items-start gap-3",children:[e.jsx("div",{className:"w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5",children:e.jsx("span",{className:"text-white text-sm",children:"ℹ️"})}),e.jsxs("div",{children:[e.jsx("h4",{className:"font-medium text-blue-900 mb-1",children:"Export Tips"}),e.jsxs("ul",{className:"text-sm text-blue-800 space-y-1",children:[e.jsx("li",{children:"• CSV files can be opened in Excel, Google Sheets, or any spreadsheet application"}),e.jsx("li",{children:"• PDF/HTML exports are best for printing or sharing reports"}),e.jsx("li",{children:"• Custom date ranges allow you to export specific time periods"}),e.jsx("li",{children:"• All monetary values are in Indian Rupees (₹)"})]})]})]})}),R==="cluster_head"&&e.jsx("div",{className:"mt-6 bg-red-50 border-2 border-red-200 rounded-lg p-6",children:e.jsxs("div",{className:"flex items-start gap-3",children:[e.jsx("div",{className:"w-10 h-10 bg-red-500 rounded-full flex items-center justify-center flex-shrink-0",children:e.jsx("span",{className:"text-white text-lg",children:"⚠️"})}),e.jsxs("div",{className:"flex-1",children:[e.jsx("h4",{className:"font-medium text-red-900 mb-2",children:"Production Data Cleanup"}),e.jsxs("p",{className:"text-sm text-red-800 mb-4",children:["Remove ALL transactional data (inventory logs, sales, stock requests, production data, notifications, etc.) to prepare for production launch.",e.jsx("strong",{className:"block mt-2",children:"⚠️ This will DELETE:"})]}),e.jsxs("ul",{className:"text-sm text-red-800 space-y-1 ml-4 mb-3",children:[e.jsx("li",{children:"❌ All inventory purchase logs"}),e.jsx("li",{children:"❌ All sales records"}),e.jsx("li",{children:"❌ All production logs & requests"}),e.jsx("li",{children:"❌ All stock requests & recalibrations"}),e.jsx("li",{children:"❌ All overhead & fixed costs"}),e.jsx("li",{children:"❌ All notifications"})]}),e.jsx("p",{className:"text-sm text-green-800 mb-4",children:e.jsx("strong",{className:"block mt-2",children:"✅ This will PRESERVE:"})}),e.jsxs("ul",{className:"text-sm text-green-800 space-y-1 ml-4 mb-4",children:[e.jsx("li",{children:"✓ Inventory Items (product metadata)"}),e.jsx("li",{children:"✓ Employee Master Data"}),e.jsx("li",{children:"✓ Employee Payouts, Timesheets & Leaves"}),e.jsx("li",{children:"✓ Stores & Production Houses"})]}),e.jsxs("button",{onClick:async()=>{if(confirm(`⚠️ CRITICAL WARNING: This will PERMANENTLY remove ALL transactional data:

❌ Inventory logs, Sales, Production data, Stock requests, Overheads, Fixed costs, Notifications

✅ PRESERVED: Inventory items metadata, Employee master data, Payouts, Timesheets, Leaves, Stores, Production houses

This action CANNOT be undone!

Are you absolutely sure you want to proceed?`))try{b(!0);const s=await ae();alert(`✅ ${s.message}

📊 Total Deleted: ${s.totalDeleted} records

🗑️ Breakdown:
- Inventory Logs: ${s.stats.inventory}
- Sales: ${s.stats.sales}
- Item Sales: ${s.stats.itemSales}
- Overheads: ${s.stats.overheads}
- Fixed Costs: ${s.stats.fixedCosts}
- Stock Requests: ${s.stats.stockRequests}
- Stock Recalibrations: ${s.stats.stockRecalibrations}
- Production Data: ${s.stats.productionData}
- Production Requests: ${s.stats.productionRequests}
- Notifications: ${s.stats.notifications}`),window.location.reload()}catch(s){console.error("Error during cleanup:",s),alert(`❌ Failed to cleanup production data: ${s.message}`)}finally{b(!1)}},disabled:x,className:"px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center gap-2",children:[e.jsx("span",{children:"🗑️"}),x?"Cleaning up...":"Cleanup Production Data"]}),e.jsx("p",{className:"text-xs text-red-700 mt-3",children:"⚠️ This action cannot be undone. Make sure you have exported all necessary data first."})]})]})})]}),F&&r&&e.jsx("div",{className:"fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50",children:e.jsxs("div",{className:"bg-white rounded-xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto",children:[e.jsxs("div",{className:"p-6 border-b border-gray-200 flex items-center justify-between sticky top-0 bg-white",children:[e.jsx("h2",{className:"text-xl text-gray-900",children:"Data Preview"}),e.jsx("button",{onClick:()=>w(!1),className:"p-2 hover:bg-gray-100 rounded-lg transition-colors",children:e.jsx(re,{className:"w-5 h-5 text-gray-500"})})]}),e.jsxs("div",{className:"p-6",children:[e.jsxs("div",{className:"bg-gradient-to-br from-blue-50 to-purple-50 rounded-lg p-6 mb-6",children:[e.jsx("h3",{className:"text-lg font-medium text-gray-900 mb-4",children:"Summary"}),e.jsxs("div",{className:"grid grid-cols-2 md:grid-cols-4 gap-4",children:[e.jsxs("div",{children:[e.jsx("div",{className:"text-sm text-gray-600",children:"Inventory"}),e.jsxs("div",{className:"text-xl text-gray-900",children:["₹",r.summary.totalInventorySpend.toLocaleString()]})]}),e.jsxs("div",{children:[e.jsx("div",{className:"text-sm text-gray-600",children:"Overheads"}),e.jsxs("div",{className:"text-xl text-gray-900",children:["₹",r.summary.totalOverheadSpend.toLocaleString()]})]}),e.jsxs("div",{children:[e.jsx("div",{className:"text-sm text-gray-600",children:"Sales"}),e.jsxs("div",{className:"text-xl text-green-600",children:["₹",r.summary.totalSales.toLocaleString()]})]}),e.jsxs("div",{children:[e.jsx("div",{className:"text-sm text-gray-600",children:"Payouts"}),e.jsxs("div",{className:"text-xl text-gray-900",children:["₹",r.summary.totalPayouts.toLocaleString()]})]})]}),e.jsx("div",{className:"mt-4 pt-4 border-t border-purple-200",children:e.jsxs("div",{className:"flex justify-between items-center",children:[e.jsx("span",{className:"font-medium text-gray-900",children:"Net Profit/Loss:"}),e.jsxs("span",{className:`text-xl font-bold ${r.summary.totalSales-r.summary.totalInventorySpend-r.summary.totalOverheadSpend-r.summary.totalPayouts>=0?"text-green-600":"text-red-600"}`,children:["₹",(r.summary.totalSales-r.summary.totalInventorySpend-r.summary.totalOverheadSpend-r.summary.totalPayouts).toLocaleString()]})]})})]}),e.jsxs("div",{className:"grid grid-cols-2 md:grid-cols-5 gap-4 mb-6",children:[e.jsxs("div",{className:"bg-gray-50 rounded-lg p-4",children:[e.jsx("div",{className:"text-sm text-gray-600",children:"Inventory Items"}),e.jsx("div",{className:"text-2xl text-gray-900",children:r.inventory.length})]}),e.jsxs("div",{className:"bg-gray-50 rounded-lg p-4",children:[e.jsx("div",{className:"text-sm text-gray-600",children:"Production Logs"}),e.jsx("div",{className:"text-2xl text-gray-900",children:r.production?.length||0})]}),e.jsxs("div",{className:"bg-gray-50 rounded-lg p-4",children:[e.jsx("div",{className:"text-sm text-gray-600",children:"Overhead Entries"}),e.jsx("div",{className:"text-2xl text-gray-900",children:r.overheads.length})]}),e.jsxs("div",{className:"bg-gray-50 rounded-lg p-4",children:[e.jsx("div",{className:"text-sm text-gray-600",children:"Sales Records"}),e.jsx("div",{className:"text-2xl text-gray-900",children:r.sales.length})]}),e.jsxs("div",{className:"bg-gray-50 rounded-lg p-4",children:[e.jsx("div",{className:"text-sm text-gray-600",children:"Payout Records"}),e.jsx("div",{className:"text-2xl text-gray-900",children:r.payouts.length})]})]}),e.jsxs("div",{className:"text-sm text-gray-600 text-center",children:[e.jsxs("p",{children:["Period: ",r.startDate," to ",r.endDate]}),r.storeId&&e.jsxs("p",{children:["Store ID: ",r.storeId]}),e.jsx("p",{className:"mt-2",children:'Click "Export Data" to download the complete report'})]})]})]})})]})}export{be as ExportData};
