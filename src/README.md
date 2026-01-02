# Bhandar-IMS - Inventory Management System

A comprehensive inventory and operations management system designed for food businesses, featuring multi-location support, production management, employee hierarchy, and advanced analytics.

## 📋 Overview

Bhandar-IMS is an enterprise-grade inventory management system specifically built for momo production houses and retail stores. It provides complete visibility and control over:

- **Multi-store Management**: Manage multiple retail locations from a single dashboard
- **Production Houses**: Centralized production facilities serving multiple stores
- **Employee Hierarchy**: Complete organizational structure with role-based access
- **Stock Requests**: Automated workflow for stores to request stock from production houses
- **Monthly Recalibration**: Physical stock counting with approval workflow
- **Sales Analytics**: Comprehensive revenue and performance tracking
- **Payroll Management**: Employee attendance, leave, and payouts

## 🚀 Quick Start

### Prerequisites

- Node.js 18 or higher
- npm or yarn package manager
- Supabase account (for backend)
- Netlify account (for deployment)

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd bhandar-ims
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure Supabase credentials**
   
   Edit `/utils/supabase/info.tsx`:
   ```typescript
   export const projectId = 'your-supabase-project-id';
   export const publicAnonKey = 'your-supabase-anon-key';
   ```

4. **Run development server**
   ```bash
   npm run dev
   ```

5. **Access the application**
   
   Open http://localhost:5173 in your browser

### Test Credentials

After setup, use these credentials to log in:
- **Email**: `admin@bhandar.com`
- **Password**: `Admin@123`
- **Role**: Cluster Head (Full Access)

## 📚 Documentation

Comprehensive documentation is available in the following files:

- **[SYSTEM_DOCUMENTATION.md](./SYSTEM_DOCUMENTATION.md)** - Complete system overview, architecture, and features
- **[API_DOCUMENTATION.md](./API_DOCUMENTATION.md)** - Detailed API reference for all endpoints
- **[DEPLOYMENT.md](./DEPLOYMENT.md)** - Step-by-step deployment guide
- **[NETLIFY_DEPLOYMENT_GUIDE.md](./NETLIFY_DEPLOYMENT_GUIDE.md)** - Comprehensive Netlify deployment guide
- **[PUSH_NOTIFICATIONS_README.md](./PUSH_NOTIFICATIONS_README.md)** - Push notification setup guide

## ✨ Key Features

### 🏪 Multi-Location Support
- Manage multiple stores and production houses
- Store-specific inventory tracking
- Production house inventory hubs
- Location-based analytics

### 📦 Inventory Management
- 8+ inventory categories (Raw materials, finished goods, utilities, etc.)
- Real-time stock levels across locations
- Low stock alerts with configurable thresholds
- Custom item management

### 🏭 Production Management
- 7 momo varieties tracking
- Production request workflow (6-stage process)
- Wastage tracking and reporting
- Sauce and chutney production logging
- Production analytics dashboard

### 🔄 Stock Request System
- Store-to-production-house request workflow
- Partial fulfillment support
- Request history and tracking
- Automatic inventory updates

### 📊 Monthly Stock Recalibration
- Physical vs. system stock comparison
- Automatic difference calculation
- Wastage and counting error categorization
- Approval workflow with audit trail
- Historical recalibration reports

### 💰 Sales & Revenue Tracking
- Daily sales by category
- Multi-store revenue analytics
- Cash reconciliation
- Sales approval workflow
- Store performance comparison

### 👥 Employee Management
- Complete organizational hierarchy
- Role-based access control (Cluster Head, Manager, Employee)
- Employee onboarding with auto-generated accounts
- Password reset functionality
- Designation management (Store In-Charge, Production In-Charge)

### 💵 Payroll System
- Monthly payout tracking
- Employee-wise payout history
- Bulk payout entry
- Payroll reports and exports

### 📅 Attendance & Leave
- Employee timesheet management
- Leave application system (12 days/year)
- Manager approval workflow
- Leave balance tracking

### 📈 Advanced Analytics
- **Store Analytics**: Revenue trends, sales by category, profitability
- **Production Analytics**: Output tracking, efficiency metrics, wastage analysis
- **Recalibration Reports**: Monthly wastage summaries, variance analysis
- **Comparative Analysis**: Multi-store performance comparison

### 🔔 Push Notifications
- Real-time notifications for critical events
- Web Push API integration
- Production request alerts
- Low stock warnings
- Leave approval notifications

## 🛠️ Technology Stack

### Frontend
- **React 18** - UI framework
- **TypeScript** - Type safety
- **Vite** - Build tool and dev server
- **TailwindCSS v4** - Styling framework
- **Recharts** - Data visualization
- **Lucide React** - Icon library
- **Sonner** - Toast notifications

### Backend
- **Supabase Edge Functions** - Serverless backend
- **Hono** - Web framework
- **PostgreSQL** - Database (via Supabase)
- **Supabase Auth** - Authentication
- **Web Push** - Push notifications

### Deployment
- **Netlify** - Frontend hosting
- **Supabase** - Backend infrastructure

## 📁 Project Structure

```
bhandar-ims/
├── components/              # React components
│   ├── Analytics.tsx        # Analytics dashboards
│   ├── EmployeeManagement.tsx
│   ��── ProductionManagement.tsx
│   ├── StockRequestManagement.tsx
│   ├── MonthlyStockRecalibration.tsx
│   └── ui/                  # Reusable UI components
├── utils/
│   ├── api.ts              # API client functions
│   ├── supabase/           # Supabase configuration
│   └── pushNotifications.ts
├── supabase/
│   └── functions/
│       └── server/
│           ├── index.tsx    # Main API server
│           ├── kv_store.tsx # Database utilities
│           └── pushNotifications.tsx
├── styles/
│   └── globals.css         # Global styles
├── public/
│   └── sw.js               # Service worker for push notifications
├── App.tsx                 # Main application component
├── package.json            # Dependencies
├── vite.config.ts          # Vite configuration
├── netlify.toml            # Netlify deployment config
└── tsconfig.json           # TypeScript configuration
```

## 🔐 User Roles & Permissions

### Cluster Head (Admin)
- **Full system access**
- Create and manage stores and production houses
- Assign managers and production heads
- View all analytics across locations
- Approve stock recalibrations
- Manage organizational hierarchy

### Operations Manager
**Store In-Charge:**
- Manage store inventory
- Create production requests
- Record daily sales
- Submit stock recalibrations
- Manage store employees

**Production In-Charge:**
- Manage production house inventory
- Fulfill production requests
- Track production output
- Manage production employees

### Employee
- View assigned location data
- Record attendance
- Apply for leave
- View payroll information
- Limited read-only access

## 🚀 Deployment

### Deploy to Netlify

1. **Push code to GitHub**

2. **Create Netlify site**
   - Go to https://netlify.com
   - Click "Add new site" → "Import an existing project"
   - Connect to GitHub and select your repository

3. **Configure build settings**
   - Build command: `npm run build`
   - Publish directory: `dist`
   - (These are auto-detected from `netlify.toml`)

4. **Deploy!**

For detailed deployment instructions, see [DEPLOYMENT.md](./DEPLOYMENT.md)

**Quick Start:** See [NETLIFY_QUICK_START.md](./NETLIFY_QUICK_START.md) for 5-minute deployment guide!

### Deploy Supabase Functions

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

## 🔧 Configuration

### Environment Variables

The system uses hardcoded Supabase credentials in `/utils/supabase/info.tsx`:

```typescript
export const projectId = 'your-supabase-project-id';
export const publicAnonKey = 'your-supabase-anon-key';
```

### Supabase Secrets (Backend)

Set these secrets in Supabase for push notifications:

```bash
supabase secrets set VAPID_PUBLIC_KEY="your-vapid-public-key"
supabase secrets set VAPID_PRIVATE_KEY="your-vapid-private-key"
supabase secrets set VAPID_SUBJECT="mailto:your-email@example.com"
```

Generate VAPID keys:
```bash
npm install -g web-push
web-push generate-vapid-keys
```

## 📖 API Reference

The system exposes a comprehensive REST API. See [API_DOCUMENTATION.md](./API_DOCUMENTATION.md) for complete details.

**Base URL:**
```
https://{projectId}.supabase.co/functions/v1/make-server-c2dd9b9d
```

**Authentication:**
All requests require an `Authorization` header with a valid JWT token from Supabase Auth.

## 🐛 Troubleshooting

### Build Failures on Netlify

If you encounter "Deploy directory 'dist' does not exist":

1. Test build locally:
   ```bash
   npm install
   npm run build
   ```

2. Check Netlify build logs for specific errors

3. Verify environment variables are set correctly

### Unauthorized Errors

If you see "Unauthorized" errors:
- The system will automatically log you out
- Log in again to get a fresh access token
- Ensure you have the correct permissions for the action

### Push Notifications Not Working

- Verify VAPID keys are configured in Supabase secrets
- Ensure the app is served over HTTPS (required for Web Push API)
- Check browser console for permission errors

## 🤝 Support

For issues and questions:
1. Check the documentation files
2. Review error messages in browser console
3. Check Supabase Edge Functions logs

## 📄 License

Proprietary - All rights reserved

## 📌 Version

**Current Version:** 2.0.0  
**Last Updated:** January 2, 2026

---

Built with ❤️ for efficient business operations