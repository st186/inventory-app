import{r as d,p as Z,m as ee,M as te,j as e,W as E,v as F,U as C,C as se,D as ae,T as le,F as re,E as ne,h as q,N as z,b as U,i as O,O as _,Q as B,R as ie}from"./index-RP5sFzS9.js";import{P as Y}from"./phone-CbaEWjyE.js";const de=(A,a,v,g,D,w)=>{const M=D.reduce((p,$)=>p+$.amount,0),o=`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Payslip - ${v} ${g}</title>
      <style>
        body {
          font-family: 'Arial', sans-serif;
          margin: 0;
          padding: 20px;
          color: #333;
        }
        .payslip-container {
          max-width: 800px;
          margin: 0 auto;
          border: 2px solid #9333ea;
          padding: 30px;
          background: linear-gradient(135deg, #faf5ff 0%, #f3e8ff 100%);
        }
        .header {
          text-align: center;
          border-bottom: 3px solid #9333ea;
          padding-bottom: 20px;
          margin-bottom: 30px;
        }
        .company-name {
          font-size: 32px;
          font-weight: bold;
          color: #9333ea;
          margin-bottom: 5px;
        }
        .company-tagline {
          font-size: 14px;
          color: #666;
          font-style: italic;
        }
        .payslip-title {
          font-size: 24px;
          color: #9333ea;
          margin: 20px 0 10px 0;
          font-weight: bold;
        }
        .payslip-period {
          font-size: 16px;
          color: #666;
          margin-bottom: 20px;
        }
        .info-section {
          display: table;
          width: 100%;
          margin-bottom: 30px;
        }
        .info-row {
          display: table-row;
        }
        .info-label {
          display: table-cell;
          padding: 10px 0;
          font-weight: bold;
          color: #9333ea;
          width: 40%;
        }
        .info-value {
          display: table-cell;
          padding: 10px 0;
          color: #333;
        }
        .payment-table {
          width: 100%;
          border-collapse: collapse;
          margin: 20px 0;
          background: white;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .payment-table th {
          background: linear-gradient(135deg, #9333ea 0%, #c084fc 100%);
          color: white;
          padding: 12px;
          text-align: left;
          font-weight: bold;
        }
        .payment-table td {
          padding: 12px;
          border-bottom: 1px solid #e5e7eb;
        }
        .payment-table tr:last-child td {
          border-bottom: none;
        }
        .payment-table tr:nth-child(even) {
          background: #faf5ff;
        }
        .total-section {
          background: linear-gradient(135deg, #9333ea 0%, #c084fc 100%);
          color: white;
          padding: 20px;
          margin-top: 30px;
          border-radius: 8px;
          text-align: center;
        }
        .total-label {
          font-size: 18px;
          margin-bottom: 10px;
        }
        .total-amount {
          font-size: 36px;
          font-weight: bold;
        }
        .footer {
          margin-top: 40px;
          padding-top: 20px;
          border-top: 2px solid #9333ea;
          text-align: center;
          font-size: 12px;
          color: #666;
        }
        .signature-section {
          margin-top: 60px;
          display: flex;
          justify-content: space-between;
        }
        .signature-box {
          text-align: center;
          width: 45%;
        }
        .signature-line {
          border-top: 2px solid #9333ea;
          margin-top: 50px;
          padding-top: 10px;
          font-weight: bold;
          color: #9333ea;
        }
        @media print {
          body {
            padding: 0;
          }
          .payslip-container {
            border: none;
            box-shadow: none;
          }
        }
      </style>
    </head>
    <body>
      <div class="payslip-container">
        <div class="header">
          <div class="company-name">BHANDAR-IMS</div>
          <div class="company-tagline">Food Business Inventory Management System</div>
          <div class="payslip-title">SALARY SLIP</div>
          <div class="payslip-period">For the Month of ${v} ${g}</div>
        </div>
        
        <div class="info-section">
          <div class="info-row">
            <div class="info-label">Employee Name:</div>
            <div class="info-value">${A}</div>
          </div>
          <div class="info-row">
            <div class="info-label">Employee ID:</div>
            <div class="info-value">${a}</div>
          </div>
          <div class="info-row">
            <div class="info-label">Employee Type:</div>
            <div class="info-value">${w==="fulltime"?"Permanent":"Contract"}</div>
          </div>
          <div class="info-row">
            <div class="info-label">Payment Date:</div>
            <div class="info-value">${new Date().toLocaleDateString("en-IN",{day:"numeric",month:"long",year:"numeric"})}</div>
          </div>
        </div>

        <table class="payment-table">
          <thead>
            <tr>
              <th>Payment Date</th>
              <th>Description</th>
              <th style="text-align: right;">Amount (₹)</th>
            </tr>
          </thead>
          <tbody>
            ${D.map(p=>`
              <tr>
                <td>${new Date(p.date).toLocaleDateString("en-IN",{day:"numeric",month:"short",year:"numeric"})}</td>
                <td>${w==="fulltime"?"Salary Payment":"Daily Wage Payment"}</td>
                <td style="text-align: right;">₹${p.amount.toLocaleString("en-IN")}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>

        <div class="total-section">
          <div class="total-label">Net ${w==="fulltime"?"Salary":"Payment"} for ${v} ${g}</div>
          <div class="total-amount">₹${M.toLocaleString("en-IN")}</div>
        </div>

        <div class="signature-section">
          <div class="signature-box">
            <div class="signature-line">Employee Signature</div>
          </div>
          <div class="signature-box">
            <div class="signature-line">Authorized Signatory</div>
          </div>
        </div>

        <div class="footer">
          <p>This is a computer-generated payslip and does not require a signature.</p>
          <p>© ${g} Bhandar-IMS. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `,c=window.open("","_blank");c&&(c.document.write(o),c.document.close(),c.onload=()=>{c.print()})};function he({employeeId:A}){const[a,v]=d.useState(null),[g,D]=d.useState([]),[w,M]=d.useState(!0),[o,c]=d.useState("payouts"),[p,$]=d.useState(()=>{const t=new Date;return`${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,"0")}`}),[m,H]=d.useState(null),[i,W]=d.useState(null),[P,J]=d.useState([]),[Q,I]=d.useState(!1),[x,k]=d.useState("");d.useEffect(()=>{L()},[A]);const L=async()=>{try{M(!0);const t=await Z(),s=t.find(r=>r.employeeId===A);if(s){v(s);const l=(await ee()).filter(n=>n.employeeId===s.id);D(l);const j=(await te()).filter(n=>n.employeeId===s.id);if(J(j),s.inchargeId){const n=t.find(y=>y.id===s.inchargeId);if(n&&(H(n),n.inchargeId)){const y=t.find(S=>S.id===n.inchargeId);y&&W(y)}}}}catch(t){console.error("Error loading employee data:",t)}finally{M(!1)}},V=async()=>{try{const t=parseFloat(x);if(!t||t<=0){alert("Please enter a valid amount");return}if(!a.monthlySalary){alert("Your salary information is not available. Please contact HR.");return}if(t>a.monthlySalary){alert("Advance amount cannot exceed your monthly salary");return}if(P.find(h=>h.status==="pending"||h.status==="approved"&&h.remainingAmount>0)){alert("You already have an active or pending salary advance. Please wait for it to be processed or completed.");return}const r=t/4,l=new Date,b=`${l.getFullYear()}-${String(l.getMonth()+1).padStart(2,"0")}`,j=[];for(let h=0;h<4;h++){const N=new Date(l.getFullYear(),l.getMonth()+h,1),f=`${N.getFullYear()}-${String(N.getMonth()+1).padStart(2,"0")}`;j.push({month:f,amount:r,deducted:!1})}const n=new Date(l.getFullYear(),l.getMonth()+3,1),y=`${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,"0")}`,S={employeeId:a.id,employeeName:a.name,employeeEmployeeId:a.employeeId,amount:t,requestDate:new Date().toISOString(),status:"pending",installments:4,monthlyDeduction:r,remainingAmount:t,startMonth:b,endMonth:y,deductions:j};await ie(S),alert("Salary advance request submitted successfully! Your request will be reviewed by the Cluster Head."),I(!1),k(""),L()}catch(t){console.error("Error applying for salary advance:",t),alert("Failed to submit salary advance request. Please try again.")}},u=(()=>{if(!p)return g;const[t,s]=p.split("-");return g.filter(r=>{const l=new Date(r.date);return l.getFullYear()===parseInt(t)&&l.getMonth()+1===parseInt(s)})})(),R=u.reduce((t,s)=>t+s.amount,0),T=(t,s)=>!t&&!s?"N/A":t?{operations_incharge:"Operations Incharge",store_incharge:"Store Incharge",production_incharge:"Production Incharge",operations_manager:"Operations Manager",store_ops:"Store Operations",production_ops:"Production Operations"}[t]||t:{cluster_head:"Cluster Head",manager:"Manager",employee:"Employee"}[s||""]||s||"N/A",X=t=>["January","February","March","April","May","June","July","August","September","October","November","December"][t],G=(()=>{const t=new Date,s=[];for(let r=0;r<12;r++){const l=new Date(t.getFullYear(),t.getMonth()-r,1),b=X(l.getMonth()),j=l.getFullYear().toString(),n=g.filter(N=>{const f=new Date(N.date);return f.getMonth()===l.getMonth()&&f.getFullYear()===l.getFullYear()}),y=n.reduce((N,f)=>N+f.amount,0),S=new Date(l.getFullYear(),l.getMonth()+1,5),h=t>=S;s.push({month:b,year:j,payouts:n,total:y,isAvailable:h})}return s})(),K=()=>{const t=[],s=new Date;for(let r=0;r<12;r++){const l=new Date(s.getFullYear(),s.getMonth()-r,1),b=`${l.getFullYear()}-${String(l.getMonth()+1).padStart(2,"0")}`;t.push({value:b,label:l.toLocaleDateString("en-US",{month:"long",year:"numeric"})})}return t};return w?e.jsx("div",{className:"min-h-screen bg-gray-50 flex items-center justify-center",children:e.jsxs("div",{className:"text-center",children:[e.jsx("div",{className:"animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"}),e.jsx("p",{className:"text-gray-600",children:"Loading your data..."})]})}):a?e.jsx("div",{className:"min-h-screen bg-gray-50 p-6",children:e.jsxs("div",{className:"max-w-6xl mx-auto",children:[e.jsxs("div",{className:"mb-8",children:[e.jsxs("h1",{className:"text-3xl text-gray-900 mb-2",children:["Welcome, ",a.name,"!"]}),e.jsx("p",{className:"text-gray-600",children:"View your payout history and employee details"})]}),e.jsxs("div",{className:"bg-gradient-to-br from-blue-50 to-purple-50 rounded-xl shadow-sm p-6 mb-6",children:[e.jsx("h2",{className:"text-lg text-gray-900 mb-4",children:"Employee Information"}),e.jsxs("div",{className:"grid grid-cols-2 md:grid-cols-4 gap-4",children:[e.jsxs("div",{children:[e.jsx("div",{className:"text-sm text-gray-600",children:"Employee ID"}),e.jsx("div",{className:"font-medium text-gray-900",children:a.employeeId})]}),e.jsxs("div",{children:[e.jsx("div",{className:"text-sm text-gray-600",children:"Name"}),e.jsx("div",{className:"font-medium text-gray-900",children:a.name})]}),e.jsxs("div",{children:[e.jsx("div",{className:"text-sm text-gray-600",children:"Type"}),e.jsx("div",{className:"font-medium text-gray-900",children:a.type==="fulltime"?"👔 Permanent":"📝 Contract"})]}),e.jsxs("div",{children:[e.jsx("div",{className:"text-sm text-gray-600",children:"Role"}),e.jsx("div",{className:"font-medium text-gray-900",children:a.role||"N/A"})]}),e.jsxs("div",{children:[e.jsx("div",{className:"text-sm text-gray-600",children:"Phone"}),e.jsx("div",{className:"font-medium text-gray-900",children:a.phone})]}),e.jsxs("div",{children:[e.jsx("div",{className:"text-sm text-gray-600",children:"Email"}),e.jsx("div",{className:"font-medium text-gray-900",children:a.email||"N/A"})]}),a.dailyRate&&e.jsxs("div",{children:[e.jsx("div",{className:"text-sm text-gray-600",children:"Daily Rate"}),e.jsxs("div",{className:"font-medium text-gray-900",children:["₹",a.dailyRate]})]})]})]}),e.jsxs("div",{className:"bg-white rounded-xl shadow-sm overflow-hidden mb-6",children:[e.jsxs("div",{className:"p-6 border-b border-gray-200",children:[e.jsx("h2",{className:"text-xl text-gray-900 mb-4",children:"My Details"}),e.jsxs("div",{className:"flex gap-2",children:[e.jsx("button",{onClick:()=>c("payouts"),className:`px-6 py-2 rounded-lg transition-colors ${o==="payouts"?"bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-md":"bg-gray-100 text-gray-600 hover:bg-gray-200"}`,children:e.jsxs("div",{className:"flex items-center gap-2",children:[e.jsx(E,{className:"w-4 h-4"}),e.jsx("span",{children:"My Payouts"})]})}),e.jsx("button",{onClick:()=>c("advance"),className:`px-6 py-2 rounded-lg transition-colors ${o==="advance"?"bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-md":"bg-gray-100 text-gray-600 hover:bg-gray-200"}`,children:e.jsxs("div",{className:"flex items-center gap-2",children:[e.jsx(F,{className:"w-4 h-4"}),e.jsx("span",{children:"Salary Advance"})]})}),e.jsx("button",{onClick:()=>c("manager"),className:`px-6 py-2 rounded-lg transition-colors ${o==="manager"?"bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-md":"bg-gray-100 text-gray-600 hover:bg-gray-200"}`,children:e.jsxs("div",{className:"flex items-center gap-2",children:[e.jsx(C,{className:"w-4 h-4"}),e.jsx("span",{children:"My Manager"})]})})]})]}),e.jsxs("div",{className:"p-6",children:[o==="payouts"&&e.jsxs("div",{children:[e.jsxs("div",{className:"mb-6",children:[e.jsx("div",{className:"flex items-center justify-between mb-4",children:e.jsxs("h3",{className:"text-lg text-gray-900 flex items-center gap-2",children:[e.jsx(se,{className:"w-5 h-5 text-blue-600"}),"Select Month"]})}),e.jsx("select",{value:p,onChange:t=>$(t.target.value),className:"w-full md:w-auto px-4 py-2 border border-gray-300 rounded-lg",children:K().map(t=>e.jsx("option",{value:t.value,children:t.label},t.value))})]}),e.jsxs("div",{className:"grid grid-cols-1 md:grid-cols-3 gap-6 mb-6",children:[e.jsxs("div",{className:"bg-gradient-to-br from-green-50 to-emerald-50 rounded-lg p-6 border border-green-200",children:[e.jsxs("div",{className:"flex items-center justify-between mb-2",children:[e.jsx("div",{className:"text-sm text-gray-600",children:"Total Payouts"}),e.jsx(ae,{className:"w-5 h-5 text-green-600"})]}),e.jsxs("div",{className:"text-2xl text-gray-900",children:["₹",R.toLocaleString()]}),e.jsxs("div",{className:"text-xs text-gray-500 mt-1",children:[u.length," payment",u.length!==1?"s":""]})]}),e.jsxs("div",{className:"bg-gradient-to-br from-blue-50 to-cyan-50 rounded-lg p-6 border border-blue-200",children:[e.jsxs("div",{className:"flex items-center justify-between mb-2",children:[e.jsx("div",{className:"text-sm text-gray-600",children:"Average Payout"}),e.jsx(le,{className:"w-5 h-5 text-blue-600"})]}),e.jsxs("div",{className:"text-2xl text-gray-900",children:["₹",u.length>0?Math.round(R/u.length).toLocaleString():0]}),e.jsx("div",{className:"text-xs text-gray-500 mt-1",children:"Per payment"})]}),e.jsxs("div",{className:"bg-gradient-to-br from-purple-50 to-pink-50 rounded-lg p-6 border border-purple-200",children:[e.jsxs("div",{className:"flex items-center justify-between mb-2",children:[e.jsx("div",{className:"text-sm text-gray-600",children:"Payment Days"}),e.jsx(E,{className:"w-5 h-5 text-purple-600"})]}),e.jsx("div",{className:"text-2xl text-gray-900",children:u.length}),e.jsx("div",{className:"text-xs text-gray-500 mt-1",children:"This month"})]})]}),e.jsxs("div",{className:"bg-gray-50 rounded-xl overflow-hidden mb-6",children:[e.jsx("div",{className:"p-4 bg-white border-b border-gray-200",children:e.jsx("h3",{className:"text-lg text-gray-900",children:"Payout History"})}),u.length===0?e.jsxs("div",{className:"p-12 text-center bg-white",children:[e.jsx("div",{className:"w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4",children:e.jsx(E,{className:"w-8 h-8 text-gray-400"})}),e.jsx("h4",{className:"text-lg text-gray-900 mb-2",children:"No Payouts Yet"}),e.jsx("p",{className:"text-gray-600",children:"No payouts recorded for the selected month."})]}):e.jsx("div",{className:"overflow-x-auto bg-white",children:e.jsxs("table",{className:"w-full",children:[e.jsx("thead",{className:"bg-gray-50",children:e.jsxs("tr",{children:[e.jsx("th",{className:"px-6 py-3 text-left text-xs text-gray-600",children:"Date"}),e.jsx("th",{className:"px-6 py-3 text-left text-xs text-gray-600",children:"Amount"}),e.jsx("th",{className:"px-6 py-3 text-left text-xs text-gray-600",children:"Type"}),e.jsx("th",{className:"px-6 py-3 text-left text-xs text-gray-600",children:"Status"})]})}),e.jsx("tbody",{className:"divide-y divide-gray-200",children:u.sort((t,s)=>new Date(s.date).getTime()-new Date(t.date).getTime()).map(t=>e.jsxs("tr",{className:"hover:bg-gray-50",children:[e.jsx("td",{className:"px-6 py-4 text-sm text-gray-900",children:new Date(t.date).toLocaleDateString("en-IN",{day:"numeric",month:"short",year:"numeric"})}),e.jsxs("td",{className:"px-6 py-4 text-sm font-medium text-green-600",children:["₹",t.amount.toLocaleString()]}),e.jsx("td",{className:"px-6 py-4 text-sm text-gray-600",children:a.type==="fulltime"?"Salary":"Daily Wage"}),e.jsx("td",{className:"px-6 py-4",children:e.jsx("span",{className:"inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800",children:"✓ Paid"})})]},t.id))})]})})]}),e.jsxs("div",{className:"bg-gray-50 rounded-xl overflow-hidden",children:[e.jsxs("div",{className:"p-4 bg-white border-b border-gray-200",children:[e.jsxs("div",{className:"flex items-center gap-2",children:[e.jsx(re,{className:"w-5 h-5 text-purple-600"}),e.jsx("h3",{className:"text-lg text-gray-900",children:"Monthly Payslips"})]}),e.jsx("p",{className:"text-sm text-gray-600 mt-2",children:"Payslips are available for download after the 4th of each month"})]}),e.jsx("div",{className:"p-6 bg-white",children:e.jsx("div",{className:"grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4",children:G.map((t,s)=>e.jsxs("div",{className:`border-2 rounded-xl p-4 transition-all ${t.isAvailable&&t.payouts.length>0?"border-purple-300 bg-gradient-to-br from-purple-50 to-pink-50 hover:shadow-lg":"border-gray-200 bg-gray-50 opacity-60"}`,children:[e.jsxs("div",{className:"flex items-start justify-between mb-3",children:[e.jsxs("div",{children:[e.jsxs("h4",{className:"text-gray-900 font-semibold",children:[t.month," ",t.year]}),e.jsxs("p",{className:"text-sm text-gray-600 mt-1",children:[t.payouts.length," payment",t.payouts.length!==1?"s":""]})]}),t.isAvailable&&t.payouts.length>0?e.jsxs("button",{onClick:()=>de(a.name,a.employeeId,t.month,t.year,t.payouts,a.type),className:"flex items-center gap-2 px-3 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors text-sm",title:"Download Payslip",children:[e.jsx(ne,{className:"w-4 h-4"}),"Download"]}):e.jsx("div",{className:"px-3 py-2 bg-gray-300 text-gray-600 rounded-lg text-sm cursor-not-allowed",children:t.payouts.length===0?"No Data":"Not Available"})]}),e.jsxs("div",{className:"pt-3 border-t border-gray-300",children:[e.jsx("p",{className:"text-sm text-gray-600 mb-1",children:"Total Amount"}),e.jsxs("p",{className:"text-xl text-gray-900 font-semibold",children:["₹",t.total.toLocaleString("en-IN")]})]})]},s))})})]})]}),o==="advance"&&e.jsxs("div",{className:"space-y-6",children:[e.jsxs("div",{className:"flex justify-between items-center mb-6",children:[e.jsxs("div",{children:[e.jsx("h3",{className:"text-lg text-gray-900 font-semibold",children:"Salary Advance"}),e.jsx("p",{className:"text-sm text-gray-600 mt-1",children:"Apply for salary advance with automatic 4-month recovery"})]}),a.type==="fulltime"&&e.jsxs("button",{onClick:()=>I(!0),disabled:P.some(t=>t.status==="pending"||t.status==="approved"&&t.remainingAmount>0),className:"flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-lg hover:from-purple-700 hover:to-pink-700 transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed",children:[e.jsx(F,{className:"w-5 h-5"}),e.jsx("span",{children:"Apply for Advance"})]})]}),a.type!=="fulltime"&&e.jsx("div",{className:"bg-yellow-50 border border-yellow-200 rounded-lg p-4",children:e.jsxs("div",{className:"flex items-start gap-3",children:[e.jsx(q,{className:"w-5 h-5 text-yellow-600 mt-0.5"}),e.jsxs("div",{children:[e.jsx("p",{className:"text-yellow-800 font-medium",children:"Not Available"}),e.jsx("p",{className:"text-sm text-yellow-700 mt-1",children:"Salary advance is only available for permanent employees"})]})]})}),P.length>0?e.jsx("div",{className:"space-y-4",children:P.map(t=>e.jsxs("div",{className:`border-2 rounded-xl p-6 ${t.status==="pending"?"border-yellow-300 bg-yellow-50":t.status==="approved"?"border-green-300 bg-green-50":"border-red-300 bg-red-50"}`,children:[e.jsx("div",{className:"flex items-start justify-between mb-4",children:e.jsxs("div",{children:[e.jsxs("div",{className:"flex items-center gap-2 mb-2",children:[e.jsxs("h4",{className:"text-lg font-semibold text-gray-900",children:["₹",t.amount.toLocaleString("en-IN")," Advance"]}),t.status==="pending"&&e.jsxs("span",{className:"inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 border border-yellow-200",children:[e.jsx(z,{className:"w-3 h-3"}),"Pending Approval"]}),t.status==="approved"&&e.jsxs("span",{className:"inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 border border-green-200",children:[e.jsx(U,{className:"w-3 h-3"}),"Approved"]}),t.status==="rejected"&&e.jsxs("span",{className:"inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800 border border-red-200",children:[e.jsx(O,{className:"w-3 h-3"}),"Rejected"]})]}),e.jsxs("p",{className:"text-sm text-gray-600",children:["Applied on ",new Date(t.requestDate).toLocaleDateString("en-IN",{day:"numeric",month:"short",year:"numeric"})]})]})}),t.status==="rejected"&&t.rejectionReason&&e.jsxs("div",{className:"bg-red-100 border border-red-200 rounded-lg p-3 mb-4",children:[e.jsx("p",{className:"text-sm font-medium text-red-800 mb-1",children:"Rejection Reason:"}),e.jsx("p",{className:"text-sm text-red-700",children:t.rejectionReason})]}),t.status==="approved"&&e.jsxs("div",{className:"space-y-4",children:[e.jsxs("div",{className:"grid grid-cols-2 md:grid-cols-4 gap-4",children:[e.jsxs("div",{className:"bg-white rounded-lg p-3",children:[e.jsx("p",{className:"text-xs text-gray-600 mb-1",children:"Monthly Deduction"}),e.jsxs("p",{className:"text-lg font-semibold text-gray-900",children:["₹",t.monthlyDeduction.toLocaleString("en-IN")]})]}),e.jsxs("div",{className:"bg-white rounded-lg p-3",children:[e.jsx("p",{className:"text-xs text-gray-600 mb-1",children:"Remaining Balance"}),e.jsxs("p",{className:"text-lg font-semibold text-orange-600",children:["₹",t.remainingAmount.toLocaleString("en-IN")]})]}),e.jsxs("div",{className:"bg-white rounded-lg p-3",children:[e.jsx("p",{className:"text-xs text-gray-600 mb-1",children:"Start Month"}),e.jsx("p",{className:"text-sm font-medium text-gray-900",children:(()=>{const[s,r]=t.startMonth.split("-");return new Date(parseInt(s),parseInt(r)-1,1).toLocaleDateString("en-US",{month:"short",year:"numeric"})})()})]}),e.jsxs("div",{className:"bg-white rounded-lg p-3",children:[e.jsx("p",{className:"text-xs text-gray-600 mb-1",children:"End Month"}),e.jsx("p",{className:"text-sm font-medium text-gray-900",children:(()=>{const[s,r]=t.endMonth.split("-");return new Date(parseInt(s),parseInt(r)-1,1).toLocaleDateString("en-US",{month:"short",year:"numeric"})})()})]})]}),e.jsxs("div",{className:"bg-white rounded-lg p-4",children:[e.jsx("h5",{className:"text-sm font-semibold text-gray-900 mb-3",children:"Deduction Schedule"}),e.jsx("div",{className:"space-y-2",children:t.deductions.map((s,r)=>e.jsxs("div",{className:`flex items-center justify-between p-3 rounded-lg ${s.deducted?"bg-green-50 border border-green-200":"bg-gray-50 border border-gray-200"}`,children:[e.jsxs("div",{className:"flex items-center gap-3",children:[s.deducted?e.jsx(U,{className:"w-5 h-5 text-green-600"}):e.jsx(z,{className:"w-5 h-5 text-gray-400"}),e.jsxs("div",{children:[e.jsx("p",{className:"text-sm font-medium text-gray-900",children:new Date(s.month+"-01").toLocaleDateString("en-US",{month:"long",year:"numeric"})}),s.deducted&&s.deductedDate&&e.jsxs("p",{className:"text-xs text-gray-600",children:["Deducted on ",new Date(s.deductedDate).toLocaleDateString("en-IN")]})]})]}),e.jsxs("p",{className:`text-sm font-semibold ${s.deducted?"text-green-700":"text-gray-700"}`,children:["₹",s.amount.toLocaleString("en-IN")]})]},r))})]})]})]},t.id))}):e.jsxs("div",{className:"bg-gray-50 border border-gray-200 rounded-lg p-8 text-center",children:[e.jsx(F,{className:"w-12 h-12 text-gray-400 mx-auto mb-3"}),e.jsx("p",{className:"text-gray-600 font-medium mb-1",children:"No Salary Advances Yet"}),e.jsx("p",{className:"text-sm text-gray-500",children:a.type==="fulltime"?'Click "Apply for Advance" to request a salary advance':"Salary advance is only available for permanent employees"})]})]}),o==="manager"&&e.jsx("div",{children:m?e.jsxs("div",{className:"space-y-6",children:[e.jsx("div",{className:"bg-gradient-to-br from-purple-50 to-pink-50 rounded-xl p-6 border-2 border-purple-200",children:e.jsxs("div",{className:"flex items-start gap-4",children:[e.jsx("div",{className:"w-20 h-20 bg-gradient-to-br from-purple-600 to-pink-600 rounded-full flex items-center justify-center text-white text-2xl flex-shrink-0",children:m.name.charAt(0).toUpperCase()}),e.jsxs("div",{className:"flex-1",children:[e.jsx("h3",{className:"text-2xl text-gray-900 mb-1",children:m.name}),e.jsx("p",{className:"text-sm text-purple-700 font-medium mb-3",children:"Your Manager / Incharge"}),e.jsx("div",{className:"inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-800",children:m.type==="fulltime"?"Permanent Employee":"Contract Employee"})]})]})}),e.jsxs("div",{className:"bg-white border border-gray-200 rounded-xl p-6",children:[e.jsxs("h4",{className:"text-lg text-gray-900 mb-4 flex items-center gap-2",children:[e.jsx(Y,{className:"w-5 h-5 text-blue-600"}),"Contact Information"]}),e.jsxs("div",{className:"grid grid-cols-1 md:grid-cols-2 gap-4",children:[e.jsxs("div",{className:"flex items-start gap-3 p-4 bg-gray-50 rounded-lg",children:[e.jsx(Y,{className:"w-5 h-5 text-blue-600 mt-0.5"}),e.jsxs("div",{children:[e.jsx("div",{className:"text-sm text-gray-600 mb-1",children:"Phone Number"}),e.jsx("div",{className:"font-medium text-gray-900",children:m.phone||"N/A"})]})]}),e.jsxs("div",{className:"flex items-start gap-3 p-4 bg-gray-50 rounded-lg",children:[e.jsx(_,{className:"w-5 h-5 text-blue-600 mt-0.5"}),e.jsxs("div",{children:[e.jsx("div",{className:"text-sm text-gray-600 mb-1",children:"Email Address"}),e.jsx("div",{className:"font-medium text-gray-900",children:m.email||"N/A"})]})]}),e.jsxs("div",{className:"flex items-start gap-3 p-4 bg-gray-50 rounded-lg",children:[e.jsx(B,{className:"w-5 h-5 text-blue-600 mt-0.5"}),e.jsxs("div",{children:[e.jsx("div",{className:"text-sm text-gray-600 mb-1",children:"Role / Position"}),e.jsx("div",{className:"font-medium text-gray-900",children:T(m.designation,m.role)||"N/A"})]})]}),e.jsxs("div",{className:"flex items-start gap-3 p-4 bg-gray-50 rounded-lg",children:[e.jsx(C,{className:"w-5 h-5 text-blue-600 mt-0.5"}),e.jsxs("div",{children:[e.jsx("div",{className:"text-sm text-gray-600 mb-1",children:"Employee ID"}),e.jsx("div",{className:"font-medium text-gray-900",children:m.employeeId||"N/A"})]})]})]})]}),e.jsx("div",{className:"bg-blue-50 border border-blue-200 rounded-lg p-4",children:e.jsxs("div",{className:"flex items-start gap-3",children:[e.jsx("div",{className:"w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5",children:e.jsx("span",{className:"text-white text-sm",children:"ℹ️"})}),e.jsxs("div",{children:[e.jsx("h4",{className:"font-medium text-blue-900 mb-1",children:"About Your Manager"}),e.jsxs("ul",{className:"text-sm text-blue-800 space-y-1",children:[e.jsx("li",{children:"• Your manager is responsible for processing your payouts and leave requests"}),e.jsx("li",{children:"• For any work-related queries or concerns, please contact your manager"}),e.jsx("li",{children:"• Your manager has been assigned by the cluster head to oversee your work"})]})]})]})}),i&&e.jsx("div",{className:"bg-gradient-to-br from-purple-50 to-pink-50 rounded-xl p-6 border-2 border-purple-200",children:e.jsxs("div",{className:"flex items-start gap-4",children:[e.jsx("div",{className:"w-20 h-20 bg-gradient-to-br from-purple-600 to-pink-600 rounded-full flex items-center justify-center text-white text-2xl flex-shrink-0",children:i.name.charAt(0).toUpperCase()}),e.jsxs("div",{className:"flex-1",children:[e.jsx("h3",{className:"text-2xl text-gray-900 mb-1",children:i.name}),e.jsx("p",{className:"text-sm text-purple-700 font-medium mb-3",children:"Senior Manager / Incharge"}),e.jsx("div",{className:"inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-800",children:i.type==="fulltime"?"Permanent Employee":"Contract Employee"})]})]})}),i&&e.jsxs("div",{className:"bg-white border border-gray-200 rounded-xl p-6",children:[e.jsxs("h4",{className:"text-lg text-gray-900 mb-4 flex items-center gap-2",children:[e.jsx(Y,{className:"w-5 h-5 text-blue-600"}),"Contact Information"]}),e.jsxs("div",{className:"grid grid-cols-1 md:grid-cols-2 gap-4",children:[e.jsxs("div",{className:"flex items-start gap-3 p-4 bg-gray-50 rounded-lg",children:[e.jsx(Y,{className:"w-5 h-5 text-blue-600 mt-0.5"}),e.jsxs("div",{children:[e.jsx("div",{className:"text-sm text-gray-600 mb-1",children:"Phone Number"}),e.jsx("div",{className:"font-medium text-gray-900",children:i.phone||"N/A"})]})]}),e.jsxs("div",{className:"flex items-start gap-3 p-4 bg-gray-50 rounded-lg",children:[e.jsx(_,{className:"w-5 h-5 text-blue-600 mt-0.5"}),e.jsxs("div",{children:[e.jsx("div",{className:"text-sm text-gray-600 mb-1",children:"Email Address"}),e.jsx("div",{className:"font-medium text-gray-900",children:i.email||"N/A"})]})]}),e.jsxs("div",{className:"flex items-start gap-3 p-4 bg-gray-50 rounded-lg",children:[e.jsx(B,{className:"w-5 h-5 text-blue-600 mt-0.5"}),e.jsxs("div",{children:[e.jsx("div",{className:"text-sm text-gray-600 mb-1",children:"Role / Position"}),e.jsx("div",{className:"font-medium text-gray-900",children:T(i.designation,i.role)||"N/A"})]})]}),e.jsxs("div",{className:"flex items-start gap-3 p-4 bg-gray-50 rounded-lg",children:[e.jsx(C,{className:"w-5 h-5 text-blue-600 mt-0.5"}),e.jsxs("div",{children:[e.jsx("div",{className:"text-sm text-gray-600 mb-1",children:"Employee ID"}),e.jsx("div",{className:"font-medium text-gray-900",children:i.employeeId||"N/A"})]})]})]})]}),i&&e.jsx("div",{className:"bg-blue-50 border border-blue-200 rounded-lg p-4",children:e.jsxs("div",{className:"flex items-start gap-3",children:[e.jsx("div",{className:"w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5",children:e.jsx("span",{className:"text-white text-sm",children:"ℹ️"})}),e.jsxs("div",{children:[e.jsx("h4",{className:"font-medium text-blue-900 mb-1",children:"About Your Senior Manager"}),e.jsxs("ul",{className:"text-sm text-blue-800 space-y-1",children:[e.jsx("li",{children:"• Your senior manager is responsible for processing your payouts and leave requests"}),e.jsx("li",{children:"• For any work-related queries or concerns, please contact your senior manager"}),e.jsx("li",{children:"• Your senior manager has been assigned by the cluster head to oversee your work"})]})]})]})})]}):e.jsxs("div",{className:"text-center py-12",children:[e.jsx("div",{className:"w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4",children:e.jsx(C,{className:"w-10 h-10 text-gray-400"})}),e.jsx("h3",{className:"text-xl text-gray-900 mb-2",children:"No Manager Assigned"}),e.jsx("p",{className:"text-gray-600 max-w-md mx-auto",children:"You don't have a manager or incharge assigned yet. Please contact your cluster head for more information."})]})})]})]}),o==="payouts"&&e.jsx("div",{className:"bg-blue-50 border border-blue-200 rounded-lg p-4",children:e.jsxs("div",{className:"flex items-start gap-3",children:[e.jsx("div",{className:"w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5",children:e.jsx("span",{className:"text-white text-sm",children:"ℹ️"})}),e.jsxs("div",{children:[e.jsx("h4",{className:"font-medium text-blue-900 mb-1",children:"About Your Payouts"}),e.jsxs("ul",{className:"text-sm text-blue-800 space-y-1",children:[e.jsx("li",{children:"• All payouts are processed and recorded by your manager or cluster head"}),e.jsx("li",{children:"• This dashboard shows only your personal payout history"}),e.jsx("li",{children:"• For any discrepancies, please contact your manager"}),e.jsx("li",{children:"• Payment history is available for the last 12 months"})]})]})]})}),Q&&e.jsx("div",{className:"fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4",children:e.jsxs("div",{className:"bg-white rounded-xl shadow-2xl max-w-lg w-full p-6",children:[e.jsxs("div",{className:"flex items-center justify-between mb-6",children:[e.jsxs("div",{children:[e.jsx("h3",{className:"text-xl font-semibold text-gray-900",children:"Apply for Salary Advance"}),e.jsx("p",{className:"text-sm text-gray-600 mt-1",children:"Amount will be deducted over 4 months"})]}),e.jsx("button",{onClick:()=>{I(!1),k("")},className:"text-gray-400 hover:text-gray-600 transition-colors",children:e.jsx(O,{className:"w-6 h-6"})})]}),e.jsxs("div",{className:"space-y-4 mb-6",children:[e.jsxs("div",{className:"bg-purple-50 border border-purple-200 rounded-lg p-4",children:[e.jsx("p",{className:"text-sm text-purple-700 mb-1",children:"Your Monthly Salary"}),e.jsxs("p",{className:"text-2xl font-semibold text-purple-900",children:["₹",a.monthlySalary?.toLocaleString("en-IN")||"N/A"]})]}),e.jsxs("div",{children:[e.jsx("label",{className:"block text-sm font-medium text-gray-700 mb-2",children:"Advance Amount (₹)"}),e.jsx("input",{type:"number",value:x,onChange:t=>k(t.target.value),placeholder:"Enter amount",max:a.monthlySalary||0,className:"w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"}),e.jsxs("p",{className:"text-xs text-gray-500 mt-1",children:["Maximum: ₹",a.monthlySalary?.toLocaleString("en-IN")]})]}),x&&parseFloat(x)>0&&e.jsxs("div",{className:"bg-blue-50 border border-blue-200 rounded-lg p-4",children:[e.jsx("p",{className:"text-sm font-medium text-blue-900 mb-2",children:"Deduction Schedule:"}),e.jsxs("div",{className:"space-y-2",children:[e.jsxs("div",{className:"flex justify-between text-sm",children:[e.jsx("span",{className:"text-blue-800",children:"Monthly Deduction:"}),e.jsxs("span",{className:"font-semibold text-blue-900",children:["₹",(parseFloat(x)/4).toLocaleString("en-IN")]})]}),e.jsxs("div",{className:"flex justify-between text-sm",children:[e.jsx("span",{className:"text-blue-800",children:"Duration:"}),e.jsx("span",{className:"font-semibold text-blue-900",children:"4 Months"})]}),e.jsxs("div",{className:"flex justify-between text-sm",children:[e.jsx("span",{className:"text-blue-800",children:"Total Amount:"}),e.jsxs("span",{className:"font-semibold text-blue-900",children:["₹",parseFloat(x).toLocaleString("en-IN")]})]})]})]}),e.jsx("div",{className:"bg-yellow-50 border border-yellow-200 rounded-lg p-4",children:e.jsxs("div",{className:"flex items-start gap-2",children:[e.jsx(q,{className:"w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0"}),e.jsxs("div",{className:"text-sm text-yellow-800",children:[e.jsx("p",{className:"font-medium mb-1",children:"Important:"}),e.jsxs("ul",{className:"list-disc list-inside space-y-1 text-xs",children:[e.jsx("li",{children:"Your request will be sent to Cluster Head for approval"}),e.jsx("li",{children:"The amount will be deducted equally over 4 months"}),e.jsx("li",{children:"Deductions will start from your next salary payment"}),e.jsx("li",{children:"You cannot apply for another advance until this one is recovered"})]})]})]})})]}),e.jsxs("div",{className:"flex gap-3",children:[e.jsx("button",{onClick:()=>{I(!1),k("")},className:"flex-1 px-4 py-3 border-2 border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium",children:"Cancel"}),e.jsx("button",{onClick:V,disabled:!x||parseFloat(x)<=0||parseFloat(x)>(a.monthlySalary||0),className:"flex-1 px-4 py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-lg hover:from-purple-700 hover:to-pink-700 transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed font-medium",children:"Submit Request"})]})]})})]})}):e.jsx("div",{className:"min-h-screen bg-gray-50 flex items-center justify-center p-4",children:e.jsxs("div",{className:"bg-white rounded-xl shadow-sm p-8 max-w-md w-full text-center",children:[e.jsx("div",{className:"w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4",children:e.jsx("span",{className:"text-3xl",children:"⚠️"})}),e.jsx("h2",{className:"text-xl text-gray-900 mb-2",children:"Employee Not Found"}),e.jsx("p",{className:"text-gray-600",children:"Your employee profile hasn't been set up yet. Please contact your manager or cluster head."})]})})}export{he as EmployeeDashboard};
