# Netlify CLI Deployment Instructions

## The Problem

When using `netlify deploy --prod` from your local machine, it doesn't automatically run `npm install`. You need to build the site locally first.

## ✅ Correct Steps for CLI Deployment

### Step 1: Install Dependencies

```bash
npm install
```

This installs all packages listed in `package.json`.

### Step 2: Build Locally

```bash
npm run build
```

This creates the `dist` folder with your built application.

### Step 3: Deploy the Built Folder

```bash
netlify deploy --prod --dir=dist
```

**Important:** Use `--dir=dist` to tell Netlify which folder to deploy.

---

## Complete Command Sequence

```bash
# Navigate to your project directory
cd /home/subham/Desktop/cloud_kitchen/bunny_momos/apps/inventory-app

# Install dependencies (if not already done)
npm install

# Build the application
npm run build

# Deploy to Netlify
netlify deploy --prod --dir=dist
```

---

## Alternative: Let Netlify Build for You

If you want Netlify to handle the build (recommended), deploy via GitHub instead:

### Option 1: Deploy via GitHub (Recommended)

**Step 1: Create GitHub Repository**

```bash
# Initialize git (if not already)
git init

# Add all files
git add .

# Commit
git commit -m "Ready for deployment"

# Create repository on GitHub, then:
git remote add origin https://github.com/yourusername/inventory-app.git
git push -u origin main
```

**Step 2: Connect to Netlify**

1. Go to [app.netlify.com](https://app.netlify.com)
2. Click "Add new site" → "Import an existing project"
3. Connect GitHub and select your repository
4. Netlify will auto-detect settings from `netlify.toml`
5. Add environment variables:
   - `VITE_SUPABASE_PROJECT_ID` = `xssxnhrzxvtejavoqgwg`
   - `VITE_SUPABASE_ANON_KEY` = (your key)
6. Deploy!

**Benefits:**
- Automatic builds on every push
- Build logs in Netlify dashboard
- Easy rollbacks
- Automatic dependency installation

---

## Troubleshooting CLI Deployment

### Error: "vite: not found"

**Cause:** Dependencies not installed

**Fix:**
```bash
npm install
npm run build
netlify deploy --prod --dir=dist
```

### Error: "Deploy directory not found"

**Cause:** Missing `--dir=dist` flag or build didn't run

**Fix:**
```bash
# Make sure build completed successfully
npm run build

# Check that dist folder exists
ls -la dist

# Deploy with correct flag
netlify deploy --prod --dir=dist
```

### Error: "Command not found: netlify"

**Cause:** Netlify CLI not installed globally

**Fix:**
```bash
# Install Netlify CLI globally
npm install -g netlify-cli

# Verify installation
netlify --version

# Try again
netlify login
netlify deploy --prod --dir=dist
```

### Build Fails Locally

**Symptoms:**
```
npm run build
> vite build
Error: ...
```

**Fix:**
1. Check error message carefully
2. See [BUILD_TROUBLESHOOTING.md](./BUILD_TROUBLESHOOTING.md)
3. Common issues:
   - Missing dependencies: `npm install`
   - TypeScript errors: `npm run type-check`
   - Import errors: Check file paths

---

## Environment Variables for Local Build

If you need environment variables for the build:

**Create `.env.local` file:**

```env
VITE_SUPABASE_PROJECT_ID=xssxnhrzxvtejavoqgwg
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhzc3huaHJ6eHZ0ZWphdm9xZ3dnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwODAzNjksImV4cCI6MjA4MTY1NjM2OX0.boONpQZ8Xv2AzlDylEoKnAlGEW7DFsMQ0zEQ1S5LPGE
```

Then build:
```bash
npm run build
```

Vite will automatically load these variables during build.

---

## Quick Reference

### Full CLI Deployment Flow

```bash
# One-time setup
npm install -g netlify-cli
netlify login

# Every deployment
npm install              # Install/update dependencies
npm run build           # Build the application
netlify deploy --prod --dir=dist  # Deploy to production
```

### GitHub Deployment Flow (Easier)

```bash
# One-time setup
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/yourusername/repo.git
git push -u origin main

# Connect on Netlify website (one-time)
# Then every push automatically deploys!

# Future updates
git add .
git commit -m "Update message"
git push
# Automatic deployment happens!
```

---

## Recommended Approach

**For development/testing:** Use CLI deployment
```bash
npm run build && netlify deploy --prod --dir=dist
```

**For production:** Use GitHub integration
- Automatic deployments
- Build logs saved
- Easy rollbacks
- Team collaboration

---

## Need Help?

- **Build errors:** See [BUILD_TROUBLESHOOTING.md](./BUILD_TROUBLESHOOTING.md)
- **Deployment guide:** See [DEPLOYMENT.md](./DEPLOYMENT.md)
- **Setup summary:** See [NETLIFY_SETUP_COMPLETE.md](./NETLIFY_SETUP_COMPLETE.md)

---

Good luck! 🚀
