# Deployment Guide - Netlify

This guide will help you deploy your Inventory Management System to Netlify.

## ✅ Pre-deployment Checklist

Your app is now ready for deployment with:
- ✅ Netlify configuration (`netlify.toml`)
- ✅ Build configuration (`vite.config.ts`)
- ✅ Package dependencies (`package.json`)
- ✅ Environment variable template (`.env.example`)
- ✅ Singleton Supabase client (no multiple instance warnings)
- ✅ Git ignore file

## 🚀 Deployment Steps

### Option 1: Deploy via GitHub (Recommended)

**Step 1: Create GitHub Repository**

If you haven't already, create a new repository on GitHub:
```bash
# Initialize git
git init

# Add all files
git add .

# Commit
git commit -m "Initial commit - Inventory Management System"

# Add remote (replace with your repository URL)
git remote add origin https://github.com/yourusername/inventory-management.git

# Push to GitHub
git push -u origin main
```

**Step 2: Deploy on Netlify**

1. Go to [app.netlify.com](https://app.netlify.com)
2. Sign in or create an account
3. Click **"Add new site"** → **"Import an existing project"**
4. Choose **"Deploy with GitHub"**
5. Authorize Netlify to access your repositories
6. Select your repository
7. Configure build settings (should auto-detect from `netlify.toml`):
   - **Build command:** `npm run build`
   - **Publish directory:** `dist`
   - **Base directory:** (leave empty)

**Step 3: Add Environment Variables**

In the Netlify dashboard:
1. Go to **Site configuration** → **Environment variables**
2. Click **"Add a variable"** and add:

```
VITE_SUPABASE_PROJECT_ID = xssxnhrzxvtejavoqgwg
VITE_SUPABASE_ANON_KEY = eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhzc3huaHJ6eHZ0ZWphdm9xZ3dnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwODAzNjksImV4cCI6MjA4MTY1NjM2OX0.boONpQZ8Xv2AzlDylEoKnAlGEW7DFsMQ0zEQ1S5LPGE
```

**Step 4: Deploy**

1. Click **"Deploy site"**
2. Wait 2-3 minutes for the build to complete
3. Your app will be live at: `https://your-site-name.netlify.app`

---

### Option 2: Deploy via Netlify CLI

**Step 1: Install Netlify CLI**

```bash
npm install -g netlify-cli
```

**Step 2: Login**

```bash
netlify login
```

**Step 3: Initialize Site**

```bash
netlify init
```

Follow the prompts:
- Create & configure a new site
- Choose your team
- Enter a site name (or leave blank for auto-generated)
- Build command: `npm run build`
- Publish directory: `dist`

**Step 4: Set Environment Variables**

```bash
netlify env:set VITE_SUPABASE_PROJECT_ID xssxnhrzxvtejavoqgwg
netlify env:set VITE_SUPABASE_ANON_KEY "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhzc3huaHJ6eHZ0ZWphdm9xZ3dnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwODAzNjksImV4cCI6MjA4MTY1NjM2OX0.boONpQZ8Xv2AzlDylEoKnAlGEW7DFsMQ0zEQ1S5LPGE"
```

**Step 5: Deploy**

```bash
# Build the app
npm run build

# Deploy to production
netlify deploy --prod
```

---

### Option 3: Drag & Drop (Quick Test)

**Step 1: Build Locally**

```bash
# Install dependencies
npm install

# Build the app
npm run build
```

**Step 2: Deploy via Drag & Drop**

1. Go to [app.netlify.com/drop](https://app.netlify.com/drop)
2. Drag the `dist` folder onto the page
3. Your site is live!

**Step 3: Add Environment Variables**

1. In the Netlify dashboard, go to your site
2. Navigate to **Site configuration** → **Environment variables**
3. Add the environment variables listed above
4. Trigger a redeploy

---

## 🎯 Post-Deployment

### Custom Domain (Optional)

1. In Netlify dashboard, go to **Site configuration** → **Domain management**
2. Click **"Add custom domain"**
3. Follow the DNS configuration instructions

### Enable HTTPS

Netlify automatically provisions SSL certificates - no action needed!

### Continuous Deployment

With GitHub integration, every push to your main branch automatically triggers a new deployment.

---

## ⚙️ Backend Configuration

Your Supabase backend is already live! The Edge Functions are hosted at:
```
https://xssxnhrzxvtejavoqgwg.supabase.co/functions/v1/make-server-c2dd9b9d/
```

No additional backend deployment is needed.

---

## 🐛 Troubleshooting

### Build Fails

**Error: "Deploy directory 'dist' does not exist"**

This means the build failed. Check the Netlify build logs for the actual error.

Common fixes:
1. **Missing dependencies**: Make sure all dependencies are in `package.json`
2. **TypeScript errors**: Run `npm run type-check` locally to see errors
3. **Import errors**: Check that all imports are correct
4. **Environment variables**: Ensure they're set in Netlify dashboard

**To debug locally:**
```bash
# Install dependencies
npm install

# Try building locally
npm run build

# Check for TypeScript errors
npm run type-check
```

If the local build works but Netlify fails:
1. Check Node version matches (we use Node 18)
2. Verify environment variables are set correctly in Netlify
3. Clear Netlify cache and retry deployment

### Build Fails with Module Errors

If you see errors like "Cannot find module":
1. Make sure the dependency is in `package.json`
2. Check import paths are correct (relative paths must start with `./` or `../`)
3. Verify file extensions are included for TypeScript files

### Environment Variables Not Working

1. Make sure variable names start with `VITE_`
2. Redeploy after adding variables
3. Check that variables are set in Netlify dashboard

### Supabase Connection Issues

1. Verify environment variables are correct
2. Check Supabase project is active
3. Ensure CORS is configured in Supabase

---

## 📝 Useful Commands

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build

# Preview production build locally
npm run preview

# Deploy to Netlify (CLI)
netlify deploy --prod

# Check deployment status
netlify status

# View logs
netlify logs
```

---

## 🎉 Success!

Once deployed, your inventory management system will be accessible at your Netlify URL!

**Test Accounts:**
- You can create new accounts via the signup page
- Managers have full access to inventory and sales
- Cluster heads have read-only access to the dashboard

---

## 📞 Support

If you encounter issues:
1. Check Netlify build logs
2. Check browser console for errors
3. Verify environment variables are set correctly
4. Ensure Supabase project is active

Happy deploying! 🚀