# 🔍 Understanding: Role vs Employment Type

## 📊 Two Separate Concepts

Your system tracks **TWO different things** about each employee:

### **1. Role** (Permission Level)
What they can **DO** in the system
- `employee` - Regular staff member
- `manager` - Can manage employees and a store  
- `cluster_head` - Can manage multiple stores

### **2. Employment Type** (Contract Status)
How they are **EMPLOYED**
- `fulltime` - Permanent employee
- `contract` - Contract worker

---

## ✅ Valid Combinations

Any employee can be **ANY combination** of role and type:

| Name | Role | Employment Type | Description |
|------|------|----------------|-------------|
| Ajay (BM006) | **employee** | **contract** | Contract kitchen worker |
| Vikas (BM007) | **employee** | **contract** | Contract helper |
| John | **employee** | **fulltime** | Permanent staff |
| Aniket | **manager** | **fulltime** | Permanent manager |
| Sarah | **manager** | **contract** | Contract manager |
| You | **cluster_head** | **fulltime** | Business owner |

---

## 🎯 Key Point: Contract Workers = "Employee" Role

Your contract workers (Momo Maker, Kitchen Helper) should have:
- ✅ **Role:** `employee` (for permissions)
- ✅ **Type:** `contract` (for employment status)

**NOT:**
- ❌ **Role:** "Momo Maker" ← This breaks the system!
- ❌ **Role:** "Kitchen Helper" ← Invalid role!

---

## 🔧 The Fix

### **What Was Wrong:**
```
BM006 - Ajay
  Role: "Momo Maker" ❌ (invalid)
  Type: contract ✅

BM007 - Vikas Das  
  Role: "Kitchen Helper" ❌ (invalid)
  Type: contract ✅
```

### **What It Should Be:**
```
BM006 - Ajay
  Role: "employee" ✅ (gives regular staff permissions)
  Type: contract ✅ (indicates contract status)
  (Job: Momo Maker - can be stored separately if needed)

BM007 - Vikas Das
  Role: "employee" ✅ (gives regular staff permissions)  
  Type: contract ✅ (indicates contract status)
  (Job: Kitchen Helper - can be stored separately if needed)
```

---

## 📋 Updated Modal Text

The "Fix Employee Role" modal now shows:

```
Select Correct Role *

┌─────────────────────────────────────────────────────────┐
│ Employee - Regular staff (can be fulltime or contract) │ ▼
├─────────────────────────────────────────────────────────┤
│ Manager - Manages employees and a store                │
│ Cluster Head - Manages multiple stores                 │
└─────────────────────────────────────────────────────────┘

💡 Most workers (kitchen staff, delivery, etc.) should be "Employee"
```

---

## 🎨 How It Shows in the System

### **Employee Table:**

| Employee ID | Name | Role | **Type** | Actions |
|------------|------|------|----------|---------|
| BM006 | Ajay | Employee | **Contract** | ... |
| BM007 | Vikas Das | Employee | **Contract** | ... |
| BM001 | John Doe | Employee | **Full-Time** | ... |
| BM004 | Aniket | Manager | **Full-Time** | ... |

**See?** Both contract and fulltime workers can have "Employee" role!

---

## 💡 Why This Matters

### **Permissions (Role-Based):**
- **Employees** can:
  - View their own payslips
  - Apply for leave
  - Mark attendance
  - View their assigned tasks

- **Managers** can do everything employees can, PLUS:
  - Approve leave requests
  - View all employee records for their store
  - Generate reports
  - Assign tasks

- **Cluster Heads** can do everything, including:
  - Manage multiple stores
  - Assign managers
  - View all data across stores

### **Employment Type (For Payroll):**
- **Fulltime:**
  - Monthly salary
  - Benefits
  - Permanent record

- **Contract:**
  - Hourly/daily pay
  - Temporary assignment
  - May have different leave rules

---

## 🚀 What to Do Now

### **For Your Contract Workers (BM006, BM007):**

1. **Click the orange ⚠️ alert button** next to their name
2. **Select:** "Employee - Regular staff (can be fulltime or contract)"
3. **Click:** "Update Role"
4. ✅ **Done!** They now have:
   - Correct role: `employee`
   - Correct type: `contract` (unchanged)
   - Proper system permissions

### **They Will Be Able To:**
- ✅ Log in to the system
- ✅ Mark attendance
- ✅ Apply for leave
- ✅ View their payslips
- ✅ See their assigned tasks

---

## 📊 Visual Summary

```
╔════════════════════════════════════════════════════════╗
║              EMPLOYEE DATA STRUCTURE                   ║
╠════════════════════════════════════════════════════════╣
║                                                        ║
║  Name: Ajay (BM006)                                   ║
║                                                        ║
║  ┌─────────────────────────────────────────────────┐  ║
║  │ ROLE (What they can DO in system)              │  ║
║  │ • employee   ← Use this for contract workers   │  ║
║  │ • manager                                       │  ║
║  │ • cluster_head                                  │  ║
║  └─────────────────────────────────────────────────┘  ║
║                                                        ║
║  ┌─────────────────────────────────────────────────┐  ║
║  │ EMPLOYMENT TYPE (How they are paid)            │  ║
║  │ • fulltime                                      │  ║
║  │ • contract   ← This indicates contract status  │  ║
║  └─────────────────────────────────────────────────┘  ║
║                                                        ║
║  ┌─────────────────────────────────────────────────┐  ║
║  │ JOB TITLE (Optional - for display)             │  ║
║  │ • "Momo Maker"   ← Can be added in future      │  ║
║  │ • "Kitchen Helper"                              │  ║
║  │ • "Delivery Boy"                                │  ║
║  └─────────────────────────────────────────────────┘  ║
║                                                        ║
╚════════════════════════════════════════════════════════╝
```

---

## ✅ Final Takeaway

**Remember:**
- 🎯 **Role** = System permissions (employee/manager/cluster_head)
- 💼 **Type** = Employment status (fulltime/contract)
- 🏷️ **Job Title** = Actual job (can be added separately)

**Contract workers should be:**
- ✅ Role: `employee`
- ✅ Type: `contract`

**NOT:**
- ❌ Role: "Momo Maker" or any job title

---

This keeps your system working correctly while still tracking who is fulltime vs contract! 🎉
