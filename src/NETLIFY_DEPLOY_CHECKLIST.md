# Netlify Deployment Checklist ✅

Use this checklist to ensure a smooth deployment to Netlify.

## Pre-Deployment Checklist

### 1. Code Preparation
- [ ] All features tested locally (`npm run dev`)
- [ ] Production build works locally (`npm run build`)
- [ ] No console errors in production build
- [ ] All TypeScript errors resolved (`npm run type-check`)
- [ ] Git repository is up to date

### 2. Supabase Configuration
- [ ] Supabase project is created and active
- [ ] Edge Functions deployed (`supabase functions deploy make-server-c2dd9b9d`)
- [ ] Database tables are set up correctly
- [ ] Authentication is configured
- [ ] VAPID keys set in Supabase secrets (if using push notifications)
- [ ] Row Level Security (RLS) policies are in place

### 3. Environment Check
- [ ] Supabase credentials in `/utils/supabase/info.tsx` are correct
- [ ] `.gitignore` includes sensitive files
- [ ] No `.env` files committed to Git
- [ ] Service worker (`public/sw.js`) exists

## Deployment Steps

### Option A: Deploy via Netlify Dashboard

- [ ] **Step 1:** Push code to GitHub/GitLab/Bitbucket
  ```bash
  git add .
  git commit -m "Ready for Netlify deployment"
  git push origin main
  ```

- [ ] **Step 2:** Go to [Netlify Dashboard](https://app.netlify.com/)

- [ ] **Step 3:** Click "Add new site" → "Import an existing project"

- [ ] **Step 4:** Connect your Git provider and select repository

- [ ] **Step 5:** Verify build settings (auto-detected from netlify.toml):
  - Build command: `npm run build`
  - Publish directory: `dist`
  - Node version: 18

- [ ] **Step 6:** Click "Deploy site"

- [ ] **Step 7:** Wait for deployment (2-3 minutes)

- [ ] **Step 8:** Site is live! 🎉

### Option B: Deploy via Netlify CLI

- [ ] **Step 1:** Install Netlify CLI
  ```bash
  npm install -g netlify-cli
  ```

- [ ] **Step 2:** Login to Netlify
  ```bash
  netlify login
  ```

- [ ] **Step 3:** Initialize Netlify in your project
  ```bash
  netlify init
  ```

- [ ] **Step 4:** Deploy to production
  ```bash
  netlify deploy --prod
  ```

## Post-Deployment Checklist

### 1. Verify Deployment
- [ ] Site loads successfully at Netlify URL
- [ ] Login page appears correctly
- [ ] Can log in with test credentials
- [ ] No console errors in browser
- [ ] All pages load correctly
- [ ] Images and assets load properly

### 2. Test Core Features
- [ ] **Authentication:**
  - [ ] Login works
  - [ ] Logout works
  - [ ] Session persists on refresh
  
- [ ] **Inventory Management:**
  - [ ] Can view inventory items
  - [ ] Can add new inventory
  - [ ] Inventory updates correctly
  
- [ ] **Production Requests:**
  - [ ] Can create new requests
  - [ ] Requests appear in list
  - [ ] Status updates work
  
- [ ] **Analytics:**
  - [ ] Charts render correctly
  - [ ] Data displays properly
  - [ ] Filters work
  
- [ ] **Sales Data:**
  - [ ] Can add sales entries
  - [ ] Sales appear in reports
  - [ ] Calculations are correct

### 3. Configure Supabase for Production
- [ ] Add Netlify URL to Supabase Auth allowed URLs:
  - Go to Supabase Dashboard → Authentication → URL Configuration
  - Add: `https://your-site.netlify.app`
  - Add to redirect URLs
  
- [ ] Update CORS if needed in Edge Functions

- [ ] Verify API endpoints are accessible from Netlify

### 4. Optional Enhancements
- [ ] **Custom Domain:**
  - [ ] Domain purchased
  - [ ] DNS configured
  - [ ] SSL certificate active
  
- [ ] **Push Notifications:**
  - [ ] Service worker accessible at `/sw.js`
  - [ ] Push subscription works
  - [ ] Test notification received
  
- [ ] **Performance:**
  - [ ] Asset optimization enabled in Netlify
  - [ ] Bundle CSS enabled
  - [ ] Minify JS/CSS enabled

### 5. Monitoring & Security
- [ ] Check Netlify build logs for warnings
- [ ] Verify security headers are active
- [ ] Test on different browsers (Chrome, Firefox, Safari, Edge)
- [ ] Test on mobile devices
- [ ] Set up Netlify Analytics (optional)
- [ ] Configure deploy notifications (optional)

## Troubleshooting Common Issues

### ❌ Build Fails
**Solutions:**
- [ ] Check Netlify build logs
- [ ] Test build locally: `npm install && npm run build`
- [ ] Clear Netlify cache: Site settings → Build & deploy → Clear cache
- [ ] Verify Node version is 18 in `netlify.toml`

### ❌ 404 on Page Refresh
**Solutions:**
- [ ] Verify redirect rule in `netlify.toml`:
  ```toml
  [[redirects]]
    from = "/*"
    to = "/index.html"
    status = 200
  ```
- [ ] Redeploy after adding redirect rule

### ❌ API Calls Fail
**Solutions:**
- [ ] Verify Supabase URL in `/utils/supabase/info.tsx`
- [ ] Check Supabase Edge Function is deployed
- [ ] Verify CORS settings in Edge Function
- [ ] Check browser console for specific errors
- [ ] Verify authentication token is being sent

### ❌ Authentication Errors
**Solutions:**
- [ ] Add Netlify URL to Supabase Auth URLs
- [ ] Clear browser cache and cookies
- [ ] Check Supabase Auth configuration
- [ ] Verify JWT tokens are valid

### ❌ Service Worker Issues
**Solutions:**
- [ ] Verify `public/sw.js` exists
- [ ] Check service worker headers in `netlify.toml`
- [ ] Unregister old service workers in browser
- [ ] Force refresh: Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac)

## Performance Optimization

### After Successful Deployment
- [ ] **Run Lighthouse Audit:**
  - Open DevTools → Lighthouse
  - Run audit for Performance, Accessibility, Best Practices, SEO
  - Address any critical issues

- [ ] **Enable Netlify Features:**
  - Go to Site settings → Build & deploy → Post processing
  - Enable "Bundle CSS"
  - Enable "Minify JS and CSS"
  - Enable "Pretty URLs" (optional)

- [ ] **Monitor Performance:**
  - Check bundle size
  - Optimize images if needed
  - Consider code splitting for large components

## Continuous Deployment Setup

- [ ] **Auto-deploy configured:**
  - Pushes to `main` branch → Production deployment
  - Pushes to other branches → Deploy previews
  - Pull requests → Deploy previews with unique URLs

- [ ] **Deploy Notifications (Optional):**
  - Go to Site settings → Build & deploy → Deploy notifications
  - Add email notification on deploy success/fail
  - Add Slack integration (if using Slack)

## Success Metrics

After deployment, verify these are working:

✅ **Uptime:** Site is accessible 24/7  
✅ **Performance:** Page loads in < 3 seconds  
✅ **Functionality:** All features work as in development  
✅ **Security:** HTTPS enabled, no security warnings  
✅ **Scalability:** Handles expected user load  
✅ **Monitoring:** Can track usage and errors  

## Next Steps After Deployment

1. **Share with stakeholders**
   - [ ] Send Netlify URL to team
   - [ ] Create user accounts for testing
   - [ ] Gather feedback

2. **Documentation**
   - [ ] Update README with live URL
   - [ ] Document any deployment-specific configuration
   - [ ] Create user guide if needed

3. **Maintenance Plan**
   - [ ] Set up monitoring alerts
   - [ ] Schedule regular backups (Supabase)
   - [ ] Plan for updates and maintenance windows

---

## Quick Reference

**Live Site:** `https://your-site.netlify.app`  
**Netlify Dashboard:** `https://app.netlify.com/sites/your-site`  
**Supabase Dashboard:** `https://supabase.com/dashboard/project/xssxnhrzxvtejavoqgwg`  

**Support Resources:**
- [Netlify Docs](https://docs.netlify.com/)
- [Supabase Docs](https://supabase.com/docs)
- [NETLIFY_DEPLOYMENT_GUIDE.md](./NETLIFY_DEPLOYMENT_GUIDE.md)

---

🎉 **Congratulations on your deployment!** 🎉

Your Bhandar-IMS is now live and ready for production use!
