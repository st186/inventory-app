# Inventory Management System

A comprehensive inventory and sales management system for food businesses with role-based access control.

## Features

- **Sales Management**: Track offline/online sales, payment modes, and cash reconciliation
- **Inventory Management**: Manage inventory across 8 categories
- **Overhead Tracking**: Track business expenses (fuel, travel, marketing, etc.)
- **Analytics Dashboard**: Visual insights for cluster heads
- **Cash Reconciliation**: Automatic cash tracking with approval workflow
- **Role-Based Access**: Separate access for managers and cluster heads

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Set Up Environment Variables

Create a `.env.local` file:

```env
VITE_SUPABASE_PROJECT_ID=xssxnhrzxvtejavoqgwg
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

### 3. Run Development Server

```bash
npm run dev
```

### 4. Build for Production

```bash
npm run build
```

## Deploy to Netlify

### Method 1: GitHub + Netlify (Recommended)

1. Push code to GitHub
2. Go to [netlify.com](https://netlify.com)
3. Click "Add new site" → "Import an existing project"
4. Connect to GitHub and select your repository
5. Build settings (auto-detected from `netlify.toml`):
   - Build command: `npm run build`
   - Publish directory: `dist`
6. Add environment variables in Netlify dashboard:
   - `VITE_SUPABASE_PROJECT_ID` = `xssxnhrzxvtejavoqgwg`
   - `VITE_SUPABASE_ANON_KEY` = (your anon key)
7. Deploy!

### Method 2: Netlify CLI

```bash
# Install Netlify CLI
npm install -g netlify-cli

# Login
netlify login

# Initialize site
netlify init

# Set environment variables
netlify env:set VITE_SUPABASE_PROJECT_ID xssxnhrzxvtejavoqgwg
netlify env:set VITE_SUPABASE_ANON_KEY "your-anon-key"

# Deploy
netlify deploy --prod
```

### Troubleshooting Build Failures

If you get "Deploy directory 'dist' does not exist":

1. **Test locally first:**
   ```bash
   npm install
   npm run build
   ```

2. **Check Netlify build logs** for the actual error

3. **Common fixes:**
   - Verify all dependencies are in `package.json`
   - Make sure environment variables are set in Netlify
   - Clear Netlify cache and retry

See [BUILD_TROUBLESHOOTING.md](./BUILD_TROUBLESHOOTING.md) for detailed debugging steps.

## Environment Variables for Netlify

Add these in Netlify Dashboard → Site Settings → Environment Variables:

- `VITE_SUPABASE_PROJECT_ID`: Your Supabase project ID
- `VITE_SUPABASE_ANON_KEY`: Your Supabase anon key

## Tech Stack

- **Frontend**: React + TypeScript + Vite
- **Styling**: Tailwind CSS v4
- **Backend**: Supabase (Auth + Database + Edge Functions)
- **Charts**: Recharts
- **Icons**: Lucide React

## Project Structure

```
/
├── src/
│   └── main.tsx          # Entry point
├── components/           # React components
├── utils/               # Utilities and API
├── styles/              # Global styles
├── supabase/            # Backend functions
├── index.html           # HTML template
├── package.json         # Dependencies
├── vite.config.ts       # Vite configuration
└── netlify.toml         # Netlify configuration
```

## License

Private - All rights reserved