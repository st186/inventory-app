# Bhandar-IMS - Complete System Documentation

## Table of Contents
1. [Overview](#overview)
2. [System Architecture](#system-architecture)
3. [User Roles & Permissions](#user-roles--permissions)
4. [Core Features](#core-features)
5. [Technical Stack](#technical-stack)
6. [Database Schema](#database-schema)
7. [API Reference](#api-reference)
8. [Deployment Guide](#deployment-guide)

---

## Overview

**Bhandar-IMS** is a comprehensive Inventory Management System designed for food businesses, specifically tailored for momo production houses and retail stores. The system provides end-to-end management of inventory, production, sales, employees, and analytics.

### Key Capabilities
- Multi-store and multi-production house management
- Role-based access control (Cluster Heads, Operations Managers, Employees)
- Real-time inventory tracking across locations
- Production request workflow system
- Employee hierarchy and payroll management
- Advanced analytics and reporting
- Monthly stock recalibration with audit trails
- Push notifications for critical events

---

## System Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Frontend (React)                        │
│  - TypeScript + Vite                                         │
│  - TailwindCSS + Glassmorphism Design                       │
│  - Recharts for Analytics                                    │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│              Supabase Edge Functions (Hono)                 │
│  - Authentication & Authorization                            │
│  - Business Logic                                            │
│  - API Routes                                                │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│                  Supabase PostgreSQL                         │
│  - Key-Value Store (kv_store_c2dd9b9d)                      │
│  - Supabase Auth                                             │
│  - Supabase Storage                                          │
└─────────────────────────────────────────────────────────────┘
```

### Technology Stack

**Frontend:**
- React 18 with TypeScript
- Vite (Build tool)
- TailwindCSS v4 (Styling)
- Recharts (Charts & Analytics)
- Lucide React (Icons)
- Sonner (Toast notifications)

**Backend:**
- Supabase Edge Functions
- Hono (Web framework)
- Deno runtime
- PostgreSQL (Database)

**Authentication:**
- Supabase Auth
- JWT tokens
- Role-based access control

**Hosting & Deployment:**
- Netlify (Frontend)
- Supabase (Backend & Database)

---

## User Roles & Permissions

### 1. Cluster Head (Admin)
**Role:** `cluster_head`

**Permissions:**
- ✅ Full system access
- ✅ Create and manage stores
- ✅ Create and manage production houses
- ✅ Assign Operations Managers to stores
- ✅ Assign Production Heads to production houses
- ✅ View all analytics across all locations
- ✅ Approve/reject stock recalibrations
- ✅ Manage employee hierarchy
- ✅ Access cluster management dashboard
- ✅ Create and manage employees

**Default Account:**
- Email: `admin@bhandar.com`
- Password: `Admin@123`
- Employee ID: `BM001`

### 2. Operations Manager
**Role:** `manager`

**Sub-roles:**
- **Store In-Charge** (`designation: 'store_incharge'`)
  - Manages store inventory
  - Creates production requests
  - Records daily sales
  - Performs monthly stock recalibration
  - Manages store employees
  
- **Production In-Charge** (`designation: 'production_incharge'`)
  - Manages production house inventory
  - Accepts/fulfills production requests
  - Tracks production output
  - Manages production employees

**Permissions:**
- ✅ View assigned location data
- ✅ Manage inventory at their location
- ✅ Create and fulfill requests
- ✅ View store/production analytics
- ✅ Approve employee leave requests
- ✅ Submit stock recalibrations for approval
- ❌ Cannot access other locations
- ❌ Cannot create new stores/production houses

### 3. Employee
**Role:** `employee`

**Permissions:**
- ✅ View assigned store data
- ✅ Record attendance
- ✅ Apply for leave
- ✅ View own payroll information
- ❌ Cannot modify inventory
- ❌ Cannot approve requests
- ❌ Limited analytics access

---

## Core Features

### 1. Inventory Management
- **Multi-category tracking:** Raw materials, finished goods, utilities
- **Real-time stock levels** across all locations
- **Low stock alerts** with configurable thresholds
- **Batch tracking** and expiry management
- **Store-specific and production house-specific inventory**

### 2. Production Management
- **7-type momo tracking:**
  - Chicken Momos
  - Chicken Cheese Momos
  - Veg Momos
  - Cheese Corn Momos
  - Paneer Momos
  - Veg Kurkure Momos
  - Chicken Kurkure Momos
  
- **Production Request Workflow:**
  1. Store In-Charge creates request
  2. Production In-Charge reviews
  3. Production In-Charge prepares order
  4. Production In-Charge marks as shipped
  5. Store In-Charge confirms delivery
  
- **Wastage tracking** with categorization
- **Sauce and chutney production logging**

### 3. Stock Request System
- **Centralized inventory model**: Production houses serve as inventory hubs
- Stores request stock from mapped production houses
- **Request statuses:** Pending → Fulfilled / Partially Fulfilled / Cancelled
- **Fulfillment tracking** with actual quantities delivered
- **Production head approval** required

### 4. Monthly Stock Recalibration
- **Physical stock count** vs. system stock
- **Automatic difference calculation**
- **Adjustment categorization:**
  - Wastage
  - Counting errors
  
- **Approval workflow:** Manager submits → Cluster Head approves/rejects
- **Complete audit trail** with timestamps and approver details
- **Historical recalibration reports**

### 5. Sales Tracking
- Daily sales recording by category
- Revenue analytics by store and date range
- **Sales approval workflow** for discrepancies
- Cash-in-hand management
- **Detailed category-wise sales data**

### 6. Employee Management
- **Complete organizational hierarchy:**
  ```
  Cluster Head
  └── Operations Managers
      └── Employees
  ```
  
- **Employee features:**
  - Create with role and designation
  - Assign to stores/production houses
  - Track joining date and employment type
  - Reset passwords
  - Archive/delete employees
  
- **Hierarchy visualization** showing reporting chain

### 7. Payroll Management
- Monthly payout tracking
- Employee-wise payout history
- Date-wise payout reports
- Bulk payout entry
- Export payroll data

### 8. Attendance & Leave
- **Employee timesheet** submission
- **Leave application** system
- **Manager approval workflow**
- **Leave balance tracking** (12 days/year)
- Approval/rejection with notes

### 9. Analytics & Reporting
Divided into **Store Analytics** and **Production Analytics**:

#### Store Analytics
- Revenue trends by store
- Sales by category
- Inventory turnover
- Overhead cost analysis
- Store performance comparison
- Profitability metrics

#### Production Analytics
- Production output tracking
- Wastage analysis
- Production efficiency metrics
- Request fulfillment rates
- Production house performance

#### Recalibration Reports
- Monthly wastage summaries
- Variance analysis
- Location-wise discrepancies
- Audit trail reports

### 10. Advanced Inventory Features
- **Inventory transfer** between locations
- **Custom item management** (add new categories/items)
- **Stock threshold settings** per location
- **Predictive analytics** for stock forecasting
- **Low stock alerts** dashboard

### 11. Notifications
- **Real-time push notifications** for:
  - New production requests
  - Stock request updates
  - Low stock alerts
  - Leave approvals
  - Recalibration approvals
  
- **Web Push API** integration
- **VAPID authentication**
- **Service Worker** for offline notification delivery

---

## Technical Stack

### Frontend Dependencies
```json
{
  "react": "^18.3.1",
  "react-dom": "^18.3.1",
  "typescript": "^5.6.2",
  "@supabase/supabase-js": "^2.39.3",
  "lucide-react": "Latest",
  "recharts": "^2.10.3",
  "sonner": "^1.3.1",
  "date-fns": "^3.0.6"
}
```

### Backend Dependencies
```typescript
{
  "hono": "npm:hono@latest",
  "hono/cors": "npm:hono@latest/cors",
  "hono/logger": "npm:hono@latest/logger",
  "@supabase/supabase-js": "npm:@supabase/supabase-js@2",
  "web-push": "npm:web-push@latest"
}
```

---

## Database Schema

### Key-Value Store Structure

The system uses a PostgreSQL key-value table (`kv_store_c2dd9b9d`) with the following key prefixes:

#### Stores
**Key:** `store:{storeId}`
```typescript
{
  id: string;
  name: string;
  location: string;
  managerId: string | null;
  productionHouseId: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt?: string;
}
```

#### Production Houses
**Key:** `production-house:{houseId}`
```typescript
{
  id: string;
  name: string;
  location: string;
  productionHeadId: string | null;
  inventory: {
    chicken: number;
    chickenCheese: number;
    veg: number;
    cheeseCorn: number;
    paneer: number;
    vegKurkure: number;
    chickenKurkure: number;
  };
  createdBy: string;
  createdAt: string;
  updatedAt?: string;
}
```

#### Inventory Items
**Key:** `inventory:{itemId}`
```typescript
{
  id: string;
  category: string;
  item: string;
  quantity: number;
  unit: string;
  date: string;
  storeId: string;
  createdBy?: string;
}
```

#### Employees
**Key:** `unified-employee:{employeeId}`
```typescript
{
  employeeId: string;
  name: string;
  email: string;
  role: 'cluster_head' | 'manager' | 'employee';
  managerId?: string;
  clusterHeadId?: string;
  employmentType: 'fulltime' | 'contract';
  joiningDate: string;
  status: 'active' | 'archived';
  authUserId: string;
  storeId?: string | null;
  designation?: 'store_incharge' | 'production_incharge' | null;
  department?: 'store_operations' | 'production' | null;
  inchargeId?: string;
  createdAt: string;
  createdBy: string;
}
```

#### Production Requests
**Key:** `production-request:{requestId}`
```typescript
{
  id: string;
  requestDate: string;
  storeId: string;
  storeName?: string;
  requestedBy: string;
  requestedByName?: string;
  status: 'pending' | 'accepted' | 'in-preparation' | 'prepared' | 'shipped' | 'delivered';
  chickenMomos: number;
  chickenCheeseMomos: number;
  vegMomos: number;
  cheeseCornMomos: number;
  paneerMomos: number;
  vegKurkureMomos: number;
  chickenKurkureMomos: number;
  kitchenUtilities?: Record<string, { quantity: number; unit: string }>;
  sauces?: Record<string, boolean>;
  utilities?: Record<string, number>;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}
```

#### Stock Requests
**Key:** `stock-request:{requestId}`
```typescript
{
  id: string;
  storeId: string;
  storeName?: string;
  productionHouseId: string;
  productionHouseName?: string;
  requestedBy: string;
  requestedByName?: string;
  requestDate: string;
  requestedQuantities: MomoQuantities;
  fulfilledQuantities: MomoQuantities | null;
  status: 'pending' | 'fulfilled' | 'partially_fulfilled' | 'cancelled';
  fulfilledBy: string | null;
  fulfilledByName?: string | null;
  fulfillmentDate: string | null;
  notes: string | null;
}
```

#### Stock Recalibrations
**Key:** `stock-recalibration:{recalibrationId}`
```typescript
{
  id: string;
  locationId: string;
  locationType: 'store' | 'production_house';
  locationName: string;
  month: string; // Format: YYYY-MM
  submittedBy: string;
  submittedByName: string;
  submittedAt: string;
  status: 'pending' | 'approved' | 'rejected';
  approvedBy?: string;
  approvedByName?: string;
  approvedAt?: string;
  rejectionReason?: string;
  items: RecalibrationItem[];
}
```

#### Sales Data
**Key:** `sales-data:{salesId}`
```typescript
{
  id: string;
  date: string;
  storeId: string;
  storeName?: string;
  data: {
    'Chicken Momos': number;
    'Chicken Cheese Momos': number;
    'Veg Momos': number;
    'Paneer Momos': number;
    'Corn Cheese Momos': number;
    'Chicken Kurkure Momos': number;
    'Veg Kurkure Momos': number;
  };
  uploadedBy: string;
  uploadedAt: string;
}
```

#### Cluster Assignments
**Key:** `cluster-assignment:{employeeId}`
```typescript
{
  employeeId: string;
  managedStoreIds: string[];
  managedProductionHouseIds: string[];
  updatedAt: string;
}
```

---

## API Reference

### Base URL
```
https://{projectId}.supabase.co/functions/v1/make-server-c2dd9b9d
```

### Authentication
All API requests require an `Authorization` header:
```
Authorization: Bearer {access_token}
```

### Core Endpoints

#### Authentication
```
POST /auth/signup
POST /auth/login
POST /auth/setup-test-cluster-head
```

#### Stores
```
GET    /stores
POST   /stores
PUT    /stores/:storeId
PUT    /stores/:storeId/assign-manager
PUT    /stores/:storeId/assign-production-house
```

#### Production Houses
```
GET    /production-houses
POST   /production-houses
PUT    /production-houses/:id
DELETE /production-houses/:id
PUT    /production-houses/:id/inventory
PUT    /production-houses/:id/assign-head
POST   /production-houses/transfer-inventory
```

#### Inventory
```
GET    /inventory
POST   /inventory
PUT    /inventory/:id
DELETE /inventory/:id
```

#### Employees
```
GET    /employees
POST   /unified-employees
PUT    /unified-employees/:employeeId
DELETE /unified-employees/:employeeId
GET    /unified-employees/manager/:managerId
GET    /unified-employees/cluster-head/:clusterHeadId
POST   /unified-employees/:employeeId/reset-password
```

#### Production Requests
```
GET    /production-requests
POST   /production-requests
PUT    /production-requests/:id/status
```

#### Stock Requests
```
GET    /stock-requests
POST   /stock-requests
PUT    /stock-requests/:id/fulfill
PUT    /stock-requests/:id/cancel
```

#### Stock Recalibration
```
POST   /stock-recalibration
GET    /stock-recalibration/latest/:locationId
GET    /stock-recalibration/history/:locationId
GET    /stock-recalibration/pending-approval
POST   /stock-recalibration/:id/approve
POST   /stock-recalibration/:id/reject
GET    /stock-recalibration/wastage-report
```

#### Sales
```
GET    /sales
POST   /sales
PUT    /sales/:id
POST   /sales/:id/approve
GET    /sales-data
POST   /sales-data
DELETE /sales-data/:id
```

#### Notifications
```
GET    /notifications
PUT    /notifications/:id/read
PUT    /notifications/read-all
```

#### Cluster Management
```
GET    /cluster/info
POST   /cluster/update-assignments
GET    /cluster/all-cluster-heads
```

#### Leave Management
```
GET    /leaves/:employeeId
GET    /leaves/all
POST   /leaves
POST   /leaves/:id/approve
POST   /leaves/:id/reject
GET    /leaves/:employeeId/balance
```

---

## Deployment Guide

### Prerequisites
1. Supabase account and project
2. Netlify account
3. Node.js 18+ installed locally

### Step 1: Supabase Setup

1. Create a new Supabase project at https://supabase.com
2. Note your project credentials:
   - Project URL
   - Anon/Public Key
   - Service Role Key

3. Deploy Edge Functions:
```bash
# Install Supabase CLI
npm install -g supabase

# Login to Supabase
supabase login

# Link your project
supabase link --project-ref YOUR_PROJECT_REF

# Deploy functions
supabase functions deploy make-server-c2dd9b9d
```

4. Set environment secrets:
```bash
supabase secrets set VAPID_PUBLIC_KEY="your-vapid-public-key"
supabase secrets set VAPID_PRIVATE_KEY="your-vapid-private-key"
supabase secrets set VAPID_SUBJECT="mailto:your-email@example.com"
```

### Step 2: Generate VAPID Keys

```bash
# Install web-push globally
npm install -g web-push

# Generate VAPID keys
web-push generate-vapid-keys
```

Copy the public and private keys to Supabase secrets.

### Step 3: Frontend Deployment (Netlify)

1. Update `/utils/supabase/info.tsx` with your Supabase credentials:
```typescript
export const projectId = 'your-project-id';
export const publicAnonKey = 'your-anon-key';
```

2. Push code to GitHub

3. Create a new site on Netlify:
   - Connect to GitHub repository
   - Build settings:
     - Build command: `npm run build`
     - Publish directory: `dist`

4. Deploy!

### Step 4: Initialize Test Cluster Head

After deployment, access the app and create the test cluster head:
- Navigate to the login page
- Use the test credentials:
  - Email: `admin@bhandar.com`
  - Password: `Admin@123`

---

## Environment Variables

### Frontend (Build-time)
These are hardcoded in `/utils/supabase/info.tsx`:
```typescript
projectId: string
publicAnonKey: string
```

### Backend (Supabase Secrets)
```bash
SUPABASE_URL              # Auto-provided by Supabase
SUPABASE_ANON_KEY         # Auto-provided by Supabase
SUPABASE_SERVICE_ROLE_KEY # Auto-provided by Supabase
SUPABASE_DB_URL           # Auto-provided by Supabase
VAPID_PUBLIC_KEY          # Manual setup
VAPID_PRIVATE_KEY         # Manual setup
VAPID_SUBJECT             # Manual setup
```

---

## Security Considerations

### Authentication
- JWT tokens with automatic refresh
- Session persistence in localStorage
- Automatic logout on 401 errors
- Password hashing via Supabase Auth

### Authorization
- Server-side role verification on all protected endpoints
- Row-level security through access token validation
- Store/Production House access restricted by assignment

### Data Protection
- HTTPS enforcement
- CORS configuration
- Input validation on all forms
- SQL injection prevention via parameterized queries

---

## Support & Maintenance

### Common Issues

**Issue:** Unauthorized errors after login
- **Solution:** Check if access token is being passed correctly. The system now auto-logs out and refreshes on 401 errors.

**Issue:** Push notifications not working
- **Solution:** Ensure VAPID keys are configured, and the app is served over HTTPS.

**Issue:** Data not syncing between stores
- **Solution:** Verify store assignments and check cluster management settings.

### Logs & Debugging
- Server logs available in Supabase Edge Functions dashboard
- Frontend errors logged to browser console
- API errors include detailed error messages

---

## License

Proprietary - All rights reserved.

## Version

Current Version: **2.0.0**
Last Updated: January 2, 2026
