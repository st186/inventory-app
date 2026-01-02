# Developer Guide - Bhandar-IMS

Complete guide for developers working on Bhandar-IMS.

## Table of Contents
1. [Getting Started](#getting-started)
2. [Development Workflow](#development-workflow)
3. [Project Structure](#project-structure)
4. [Coding Standards](#coding-standards)
5. [API Integration](#api-integration)
6. [State Management](#state-management)
7. [Component Development](#component-development)
8. [Backend Development](#backend-development)
9. [Testing](#testing)
10. [Deployment](#deployment)
11. [Troubleshooting](#troubleshooting)

---

## Getting Started

### Prerequisites

```bash
# Required
Node.js >= 18.0.0
npm >= 9.0.0

# Recommended
Git
VS Code (with TypeScript and ESLint extensions)
Supabase CLI
```

### Initial Setup

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd bhandar-ims
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure Supabase**
   
   Edit `/utils/supabase/info.tsx`:
   ```typescript
   export const projectId = 'your-project-id';
   export const publicAnonKey = 'your-anon-key';
   ```

4. **Start development server**
   ```bash
   npm run dev
   ```

5. **Access the app**
   ```
   http://localhost:5173
   ```

---

## Development Workflow

### Branch Strategy

```
main
  ├── development
  │   ├── feature/feature-name
  │   ├── bugfix/bug-name
  │   └── hotfix/critical-bug
  └── staging
```

### Workflow Steps

1. **Create a feature branch**
   ```bash
   git checkout -b feature/my-new-feature
   ```

2. **Make changes and test locally**
   ```bash
   npm run dev
   ```

3. **Commit with descriptive messages**
   ```bash
   git commit -m "feat: Add employee hierarchy visualization"
   ```

4. **Push and create pull request**
   ```bash
   git push origin feature/my-new-feature
   ```

5. **Code review and merge**

### Commit Message Format

Follow conventional commits:
- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation changes
- `style:` - Code style changes (formatting, etc.)
- `refactor:` - Code refactoring
- `test:` - Adding tests
- `chore:` - Build process or auxiliary tool changes

---

## Project Structure

```
bhandar-ims/
├── components/              # React components
│   ├── Analytics.tsx        # Analytics dashboards
│   ├── EmployeeManagement.tsx
│   ├── ProductionManagement.tsx
│   ├── ui/                  # Reusable UI components
│   │   ├── button.tsx
│   │   ├── card.tsx
│   │   └── ...
│   └── figma/              # Protected Figma components
│       └── ImageWithFallback.tsx
├── utils/                   # Utility functions
│   ├── api.ts              # API client
│   ├── inventoryData.ts    # Static data (categories, items)
│   ├── pushNotifications.ts # Push notification client
│   ├── pushNotificationApi.ts
│   └── supabase/           # Supabase configuration
│       ├── client.ts       # Supabase client singleton
│       └── info.tsx        # Supabase credentials
├── supabase/                # Backend code
│   └── functions/
│       └── server/
│           ├── index.tsx    # Main API server
│           ├── kv_store.tsx # Database utilities (PROTECTED)
│           └── pushNotifications.tsx
├── styles/
│   └── globals.css         # Global styles and design tokens
├── public/
│   └── sw.js               # Service worker for push notifications
├── src/
│   ├── main.tsx            # App entry point
│   ├── suppress-warnings.ts # Console warning suppression
│   └── vite-env.d.ts       # Vite type definitions
├── App.tsx                 # Root component
├── index.html              # HTML template
├── package.json            # Dependencies
├── tsconfig.json           # TypeScript config
├── vite.config.ts          # Vite config
└── netlify.toml            # Netlify deployment config
```

---

## Coding Standards

### TypeScript

**Always use TypeScript for type safety:**

```typescript
// ✅ Good
interface Employee {
  id: string;
  name: string;
  role: 'employee' | 'manager' | 'cluster_head';
}

const employee: Employee = {
  id: 'BM001',
  name: 'John Doe',
  role: 'manager'
};

// ❌ Bad
const employee = {
  id: 'BM001',
  name: 'John Doe',
  role: 'manager'
};
```

### Component Structure

```typescript
// 1. Imports
import { useState, useEffect } from 'react';
import { Button } from './ui/button';
import * as api from '../utils/api';

// 2. Types/Interfaces
interface MyComponentProps {
  title: string;
  onSave: (data: any) => void;
}

// 3. Component
export function MyComponent({ title, onSave }: MyComponentProps) {
  // 4. State
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  
  // 5. Effects
  useEffect(() => {
    loadData();
  }, []);
  
  // 6. Functions
  const loadData = async () => {
    setLoading(true);
    try {
      const result = await api.getData();
      setData(result);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };
  
  // 7. Render
  return (
    <div>
      <h1>{title}</h1>
      {loading ? <p>Loading...</p> : <DataList items={data} />}
    </div>
  );
}
```

### Naming Conventions

```typescript
// Components: PascalCase
MyComponent.tsx
EmployeeManagement.tsx

// Functions: camelCase
const handleSubmit = () => {};
const loadEmployees = async () => {};

// Constants: UPPER_SNAKE_CASE
const API_BASE_URL = '...';
const MAX_ITEMS = 100;

// Interfaces: PascalCase with 'I' prefix (optional)
interface Employee { }
interface IComponentProps { }

// Types: PascalCase
type UserRole = 'admin' | 'user';
```

### File Organization

```typescript
// Group related imports
import { useState, useEffect, useMemo } from 'react'; // React
import { Button, Card, Input } from './ui'; // UI components
import { Calendar, User, Settings } from 'lucide-react'; // Icons
import * as api from '../utils/api'; // API
import { formatDate, calculateTotal } from '../utils/helpers'; // Utilities
```

---

## API Integration

### Making API Calls

**All API calls should go through `/utils/api.ts`:**

```typescript
// In your component
import * as api from '../utils/api';

const MyComponent = () => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      
      try {
        const result = await api.getEmployees();
        setData(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
        console.error('Error fetching employees:', err);
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();
  }, []);
  
  // Handle loading and error states
  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;
  
  return <div>{/* Render data */}</div>;
};
```

### Adding New API Endpoints

1. **Add the function to `/utils/api.ts`:**

```typescript
export async function getCustomData(accessToken: string): Promise<CustomData[]> {
  const data = await fetchWithAuth(`${API_BASE}/custom-data`, accessToken);
  return data.items || [];
}
```

2. **Add the backend route in `/supabase/functions/server/index.tsx`:**

```typescript
app.get('/make-server-c2dd9b9d/custom-data', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) {
    return c.json({ error: authResult.error }, authResult.status);
  }
  
  try {
    const items = await kv.getByPrefix('custom-data:');
    return c.json({ items });
  } catch (error) {
    console.log('Error fetching custom data:', error);
    return c.json({ error: 'Failed to fetch data' }, 500);
  }
});
```

---

## State Management

### Global State (App.tsx)

Global state is managed in `App.tsx` and passed down via props:

```typescript
// In App.tsx
const [inventory, setInventory] = useState<InventoryItem[]>([]);
const [employees, setEmployees] = useState<Employee[]>([]);

// Passed to child components
<EmployeeManagement 
  employees={employees}
  setEmployees={setEmployees}
/>
```

### Local State

Use `useState` for component-specific state:

```typescript
const [selectedDate, setSelectedDate] = useState(new Date());
const [formData, setFormData] = useState({ name: '', email: '' });
```

### Derived State

Use `useMemo` for computed values:

```typescript
const totalRevenue = useMemo(() => {
  return salesData.reduce((sum, sale) => sum + sale.amount, 0);
}, [salesData]);
```

### Side Effects

Use `useEffect` for side effects:

```typescript
// Run once on mount
useEffect(() => {
  loadData();
}, []);

// Run when dependency changes
useEffect(() => {
  if (userId) {
    loadUserData(userId);
  }
}, [userId]);

// Cleanup on unmount
useEffect(() => {
  const subscription = subscribeToUpdates();
  
  return () => {
    subscription.unsubscribe();
  };
}, []);
```

---

## Component Development

### Creating a New Component

1. **Create the file**
   ```bash
   touch components/MyNewComponent.tsx
   ```

2. **Basic structure**
   ```typescript
   import { useState } from 'react';
   import { Button } from './ui/button';
   
   interface MyNewComponentProps {
     title: string;
     onComplete: () => void;
   }
   
   export function MyNewComponent({ title, onComplete }: MyNewComponentProps) {
     const [count, setCount] = useState(0);
     
     return (
       <div className="p-4">
         <h2>{title}</h2>
         <p>Count: {count}</p>
         <Button onClick={() => setCount(count + 1)}>
           Increment
         </Button>
       </div>
     );
   }
   ```

3. **Import and use**
   ```typescript
   import { MyNewComponent } from './components/MyNewComponent';
   
   <MyNewComponent 
     title="My Component" 
     onComplete={() => console.log('Done')}
   />
   ```

### Styling Guidelines

**Use TailwindCSS utility classes:**

```typescript
// ✅ Good
<div className="flex items-center justify-between p-4 bg-white rounded-lg shadow-md">
  <h2 className="text-xl">Title</h2>
</div>

// ❌ Bad - Don't use inline styles
<div style={{ display: 'flex', padding: '16px' }}>
  <h2 style={{ fontSize: '20px' }}>Title</h2>
</div>
```

**Use design tokens from `globals.css`:**

```typescript
// ✅ Good - Uses design system
<div className="bg-[--color-primary] text-[--color-text-on-primary]">
  Content
</div>

// ❌ Bad - Hardcoded colors
<div className="bg-purple-500 text-white">
  Content
</div>
```

**Responsive design:**

```typescript
<div className="
  grid 
  grid-cols-1 
  md:grid-cols-2 
  lg:grid-cols-3 
  gap-4
">
  {items.map(item => <Card key={item.id} />)}
</div>
```

---

## Backend Development

### Working with Edge Functions

**Location:** `/supabase/functions/server/index.tsx`

### Adding a New Endpoint

```typescript
// 1. Add route handler
app.post('/make-server-c2dd9b9d/my-endpoint', async (c) => {
  // 2. Verify authentication
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) {
    return c.json({ error: authResult.error }, authResult.status);
  }
  
  const { user } = authResult;
  
  // 3. Parse request body
  const body = await c.req.json();
  const { requiredField } = body;
  
  // 4. Validate input
  if (!requiredField) {
    return c.json({ error: 'Missing required field' }, 400);
  }
  
  // 5. Perform business logic
  try {
    const result = await kv.set(`my-key:${id}`, data);
    
    // 6. Return response
    return c.json({ 
      success: true, 
      data: result 
    });
  } catch (error) {
    console.log('Error in my-endpoint:', error);
    return c.json({ error: 'Failed to process request' }, 500);
  }
});
```

### Database Operations

**Using the KV store:**

```typescript
import * as kv from './kv_store.tsx';

// Get single value
const value = await kv.get('key');

// Get multiple values
const values = await kv.mget(['key1', 'key2']);

// Get by prefix
const items = await kv.getByPrefix('employee:');

// Set value
await kv.set('key', { data: 'value' });

// Set multiple values
await kv.mset([
  ['key1', value1],
  ['key2', value2]
]);

// Delete value
await kv.del('key');

// Delete multiple values
await kv.mdel(['key1', 'key2']);
```

### Authorization Checks

```typescript
// Check if user is cluster head
if (user.user_metadata?.role !== 'cluster_head') {
  return c.json({ error: 'Unauthorized. Cluster head only.' }, 403);
}

// Check if user is manager or cluster head
const allowedRoles = ['manager', 'cluster_head'];
if (!allowedRoles.includes(user.user_metadata?.role)) {
  return c.json({ error: 'Unauthorized' }, 403);
}
```

### Deploying Edge Functions

```bash
# Login to Supabase
supabase login

# Link project
supabase link --project-ref YOUR_PROJECT_REF

# Deploy all functions
supabase functions deploy

# Deploy specific function
supabase functions deploy make-server-c2dd9b9d

# View logs
supabase functions logs make-server-c2dd9b9d
```

---

## Testing

### Manual Testing Checklist

Before committing:

- [ ] Test on Chrome, Firefox, and Safari
- [ ] Test on mobile (responsive design)
- [ ] Test all user roles (cluster_head, manager, employee)
- [ ] Test error scenarios
- [ ] Test with no data / empty states
- [ ] Test with large datasets
- [ ] Check console for errors
- [ ] Verify API calls succeed

### Testing User Flows

**Example: Employee Creation Flow**

1. Login as cluster head
2. Navigate to Employee Management
3. Click "Create Employee"
4. Fill form with valid data
5. Submit
6. Verify employee appears in list
7. Verify auth account created
8. Logout and login as new employee
9. Verify correct permissions

---

## Deployment

### Frontend Deployment (Netlify)

**Automatic Deploy (Recommended):**

1. Push to GitHub
2. Netlify auto-deploys from `main` branch

**Manual Deploy:**

```bash
# Build locally
npm run build

# Deploy with Netlify CLI
netlify deploy --prod
```

### Backend Deployment (Supabase)

```bash
# Deploy edge functions
supabase functions deploy make-server-c2dd9b9d

# Set secrets
supabase secrets set VAPID_PUBLIC_KEY="..."
supabase secrets set VAPID_PRIVATE_KEY="..."
supabase secrets set VAPID_SUBJECT="mailto:you@example.com"
```

### Pre-Deployment Checklist

- [ ] All tests pass
- [ ] No console errors
- [ ] Build succeeds locally (`npm run build`)
- [ ] Environment variables configured
- [ ] Database migrations applied (if any)
- [ ] API endpoints tested
- [ ] Documentation updated

---

## Troubleshooting

### Common Issues

**1. Build Fails**

```bash
# Clear node_modules and reinstall
rm -rf node_modules package-lock.json
npm install

# Clear Vite cache
rm -rf .vite

# Try building again
npm run build
```

**2. TypeScript Errors**

```bash
# Check for type errors
npm run type-check

# If TypeScript is confused, restart VS Code
# Or clear TypeScript cache
rm -rf node_modules/.cache
```

**3. API Unauthorized Errors**

- Check if user is logged in
- Verify access token is valid
- Check role permissions
- Clear localStorage and login again

**4. Supabase Function Errors**

```bash
# View logs
supabase functions logs make-server-c2dd9b9d --follow

# Test locally
supabase functions serve

# Redeploy
supabase functions deploy make-server-c2dd9b9d
```

**5. Push Notifications Not Working**

- Verify VAPID keys are set
- Check browser supports Web Push
- Ensure HTTPS (required for push)
- Check service worker is registered

### Debug Tools

**Browser DevTools:**
- Console - View logs and errors
- Network - Monitor API calls
- Application - Check localStorage, service workers
- Sources - Debug with breakpoints

**React DevTools:**
- Install React DevTools extension
- Inspect component props and state
- Profile performance

**Supabase Dashboard:**
- View Edge Function logs
- Check Auth users
- Query database directly

---

## Performance Optimization

### Best Practices

1. **Use React.memo for expensive components**
   ```typescript
   export const ExpensiveComponent = React.memo(({ data }) => {
     // Component logic
   });
   ```

2. **Use useMemo for computed values**
   ```typescript
   const sortedData = useMemo(() => {
     return data.sort((a, b) => a.name.localeCompare(b.name));
   }, [data]);
   ```

3. **Use useCallback for event handlers**
   ```typescript
   const handleClick = useCallback(() => {
     doSomething(id);
   }, [id]);
   ```

4. **Lazy load components**
   ```typescript
   const HeavyComponent = lazy(() => import('./HeavyComponent'));
   
   <Suspense fallback={<Loading />}>
     <HeavyComponent />
   </Suspense>
   ```

5. **Debounce search inputs**
   ```typescript
   const debouncedSearch = useMemo(
     () => debounce((value) => search(value), 300),
     []
   );
   ```

---

## Code Review Guidelines

### What to Look For

- [ ] Code follows style guide
- [ ] TypeScript types are correct
- [ ] No console.log (except intentional logging)
- [ ] Error handling is present
- [ ] Loading states are shown
- [ ] No hardcoded values
- [ ] Comments explain complex logic
- [ ] No unused variables/imports
- [ ] Component is testable
- [ ] Performance is acceptable

---

## Additional Resources

### Documentation
- [React Docs](https://react.dev)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [TailwindCSS Docs](https://tailwindcss.com/docs)
- [Supabase Docs](https://supabase.com/docs)
- [Hono Docs](https://hono.dev/)

### Tools
- [VS Code](https://code.visualstudio.com/)
- [Supabase CLI](https://supabase.com/docs/guides/cli)
- [Netlify CLI](https://docs.netlify.com/cli/get-started/)

---

## Getting Help

1. Check this documentation
2. Search existing issues
3. Check Supabase logs
4. Check browser console
5. Ask team members

---

## Version
Last Updated: January 2, 2026
