# Netlify Deployment Guide for Bhandar-IMS

This guide will help you deploy your Bhandar Inventory Management System to Netlify.

## Prerequisites

1. A [Netlify](https://www.netlify.com/) account (free tier works fine)
2. Your code pushed to a Git repository (GitHub, GitLab, or Bitbucket)
3. Your Supabase project is already set up and running

## Deployment Methods

### Method 1: Deploy via Netlify Dashboard (Recommended for First-Time)

1. **Connect Your Repository**
   - Go to [Netlify](https://app.netlify.com/)
   - Click "Add new site" → "Import an existing project"
   - Connect your Git provider (GitHub/GitLab/Bitbucket)
   - Select your repository

2. **Configure Build Settings**
   
   Netlify should auto-detect these settings from `netlify.toml`, but verify:
   
   - **Build command:** `npm run build`
   - **Publish directory:** `dist`
   - **Node version:** 18

3. **Environment Variables (Optional)**
   
   Since your Supabase credentials are hardcoded in `/utils/supabase/info.tsx`, you don't need to add environment variables. However, if you want to use different Supabase projects for different environments:
   
   - Go to Site settings → Environment variables
   - Add the following (if needed):
     - `VITE_SUPABASE_URL`: Your Supabase project URL
     - `VITE_SUPABASE_ANON_KEY`: Your Supabase anonymous key

4. **Deploy**
   - Click "Deploy site"
   - Wait for the build to complete (usually 2-3 minutes)
   - Your site will be live at `https://random-name-123456.netlify.app`

5. **Custom Domain (Optional)**
   - Go to Site settings → Domain management
   - Add your custom domain
   - Follow Netlify's instructions to configure DNS

### Method 2: Deploy via Netlify CLI

1. **Install Netlify CLI**
   ```bash
   npm install -g netlify-cli
   ```

2. **Login to Netlify**
   ```bash
   netlify login
   ```

3. **Initialize Netlify**
   ```bash
   netlify init
   ```
   
   Follow the prompts to connect to your Git repository or create a new site.

4. **Deploy**
   ```bash
   # Deploy to production
   netlify deploy --prod
   
   # Or deploy a preview
   netlify deploy
   ```

### Method 3: Manual Deploy (For Testing)

1. **Build the project locally**
   ```bash
   npm install
   npm run build
   ```

2. **Deploy the dist folder**
   ```bash
   netlify deploy --dir=dist --prod
   ```

## Post-Deployment Configuration

### 1. Update Supabase Edge Functions (if applicable)

If your Supabase Edge Functions need to know your Netlify domain, update any CORS settings or allowed origins in your Supabase project.

### 2. Configure Authentication Redirects

If you're using Supabase Auth with OAuth providers:

1. Go to your Supabase project dashboard
2. Navigate to Authentication → URL Configuration
3. Add your Netlify URL to "Site URL" and "Redirect URLs"
   - Example: `https://your-site.netlify.app`

### 3. Test Push Notifications

If using push notifications, ensure the service worker is accessible:
- Test: `https://your-site.netlify.app/sw.js`
- The service worker should load without errors

### 4. Update VAPID Configuration

If you set up push notifications, update the VAPID subject in your Supabase Edge Function environment variables:
- `VAPID_SUBJECT=mailto:your-email@example.com`

## Continuous Deployment

Netlify automatically sets up continuous deployment:

- **Main/Master branch** → Production deployment
- **Other branches** → Preview deployments
- **Pull requests** → Deploy previews

Every push to your repository triggers a new build.

## Build Settings Reference

Your `netlify.toml` includes:

```toml
[build]
  command = "npm run build"
  publish = "dist"

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200

[build.environment]
  NODE_VERSION = "18"
  NPM_FLAGS = "--legacy-peer-deps"
```

## Troubleshooting

### Build Fails with Module Not Found

**Solution:** Clear cache and retry
```bash
netlify deploy --clear-cache --prod
```

Or in the Netlify dashboard:
- Site settings → Build & deploy → Clear cache and deploy site

### Environment Variables Not Working

**Solution:** Ensure variables are prefixed with `VITE_`
- Vite only exposes env vars that start with `VITE_`
- Example: `VITE_SUPABASE_URL` not `SUPABASE_URL`

### 404 Errors on Page Refresh

**Solution:** This should be handled by the redirect rule in `netlify.toml`
- Verify the redirect rule is present
- Check that you're using client-side routing correctly

### Service Worker Not Loading

**Solution:** Check the headers configuration
- Ensure `/sw.js` has proper cache headers
- Verify the file is in the `public` folder

### Build Takes Too Long or Times Out

**Solution:** 
1. Check if you have large dependencies
2. Consider using `NPM_FLAGS = "--legacy-peer-deps"` (already in config)
3. Optimize build by removing unused dependencies

## Performance Optimization

### 1. Enable Asset Optimization

In Netlify dashboard:
- Site settings → Build & deploy → Post processing
- Enable "Bundle CSS" and "Minify JS and CSS"

### 2. Enable Netlify CDN

Netlify automatically uses their global CDN. Ensure assets have proper cache headers (already configured in `netlify.toml`).

### 3. Enable Netlify Analytics (Optional)

- Site settings → Analytics
- Provides real user metrics without impacting performance

## Security Best Practices

1. **Never commit sensitive keys**
   - Use environment variables for sensitive data
   - Add `.env` to `.gitignore`

2. **Use Supabase Row Level Security (RLS)**
   - Ensure all tables have proper RLS policies
   - Never expose service role key to frontend

3. **Configure Supabase Auth correctly**
   - Set proper redirect URLs
   - Use secure cookie settings

4. **Enable Netlify Security Headers**
   - Already configured in `netlify.toml`
   - Includes XSS protection, frame options, etc.

## Monitoring and Logs

### View Build Logs
- Netlify dashboard → Deploys → Click on a deploy → View logs

### View Function Logs (if using Netlify Functions)
- Netlify dashboard → Functions → Select function → Logs

### Supabase Edge Function Logs
- Supabase dashboard → Edge Functions → Logs

## Cost Considerations

### Netlify Free Tier Includes:
- 100 GB bandwidth/month
- 300 build minutes/month
- 125k serverless function requests
- Continuous deployment
- HTTPS
- CDN

### Supabase Free Tier Includes:
- 500 MB database
- 1 GB file storage
- 2 GB bandwidth
- 50,000 monthly active users

Both should be sufficient for development and small-scale production use.

## Support and Resources

- [Netlify Documentation](https://docs.netlify.com/)
- [Netlify Community](https://answers.netlify.com/)
- [Supabase Documentation](https://supabase.com/docs)
- [Vite Documentation](https://vitejs.dev/)

## Quick Reference Commands

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build

# Preview production build locally
npm run preview

# Deploy to Netlify (requires CLI)
netlify deploy --prod

# View deployment logs
netlify logs

# Open Netlify dashboard
netlify open
```

---

## Next Steps After Deployment

1. ✅ Test all features in production
2. ✅ Verify authentication flows work
3. ✅ Test data capture and storage
4. ✅ Check analytics dashboards
5. ✅ Test push notifications (if enabled)
6. ✅ Verify all API calls to Supabase work
7. ✅ Test on different devices and browsers
8. ✅ Set up monitoring and alerts
9. ✅ Configure custom domain (optional)
10. ✅ Share with stakeholders

---

**Your Bhandar-IMS is now ready for production! 🎉**
