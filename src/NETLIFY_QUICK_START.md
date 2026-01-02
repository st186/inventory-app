# Netlify Quick Start Guide 🚀

## 5-Minute Deployment

### Method 1: Automated Script (Easiest)

**For Linux/Mac:**
```bash
chmod +x deploy-to-netlify.sh
./deploy-to-netlify.sh
```

**For Windows:**
```cmd
deploy-to-netlify.bat
```

The script will:
✅ Check prerequisites  
✅ Install dependencies  
✅ Test build  
✅ Deploy to Netlify  

---

### Method 2: Manual Deployment (Most Common)

#### Step 1: Prepare Your Code
```bash
npm install
npm run build
```

#### Step 2: Push to Git
```bash
git add .
git commit -m "Deploy to Netlify"
git push origin main
```

#### Step 3: Deploy on Netlify
1. Go to [https://app.netlify.com/](https://app.netlify.com/)
2. Click **"Add new site"** → **"Import an existing project"**
3. Choose your Git provider (GitHub/GitLab/Bitbucket)
4. Select your repository
5. Netlify will auto-detect settings from `netlify.toml`:
   - Build command: `npm run build`
   - Publish directory: `dist`
6. Click **"Deploy site"**
7. Wait 2-3 minutes ⏱️
8. Done! 🎉

---

## After Deployment

### ✅ Essential Post-Deployment Steps

1. **Test Your Site**
   - Visit your Netlify URL (e.g., `https://random-name-123456.netlify.app`)
   - Log in with test credentials
   - Test core features

2. **Update Supabase Auth**
   - Go to [Supabase Dashboard](https://supabase.com/dashboard)
   - Navigate to: Authentication → URL Configuration
   - Add your Netlify URL to:
     - Site URL: `https://your-site.netlify.app`
     - Redirect URLs: `https://your-site.netlify.app/**`

3. **Set Custom Domain (Optional)**
   - Netlify Dashboard → Domain settings
   - Click "Add custom domain"
   - Follow DNS configuration instructions

---

## Troubleshooting

### 🔴 Build Failed?
```bash
# Test locally first
npm install
npm run build

# If it works locally, try:
# 1. Clear Netlify cache (Site settings → Clear cache)
# 2. Check build logs in Netlify dashboard
```

### 🔴 404 Errors on Refresh?
The `netlify.toml` redirect rule should handle this.
If not working, verify `netlify.toml` contains:
```toml
[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

### 🔴 Can't Log In?
1. Add Netlify URL to Supabase Auth (see step 2 above)
2. Clear browser cache
3. Check browser console for errors

### 🔴 API Calls Failing?
1. Verify Supabase Edge Functions are deployed
2. Check `/utils/supabase/info.tsx` has correct credentials
3. Open browser DevTools → Network tab to see failed requests

---

## Configuration Files (Already Set Up!)

✅ **netlify.toml** - Netlify configuration  
✅ **package.json** - Build scripts  
✅ **vite.config.ts** - Vite configuration  
✅ **.gitignore** - Prevents committing sensitive files  

You don't need to modify these - they're ready to go!

---

## Useful Commands

```bash
# Local development
npm run dev

# Test production build
npm run build
npm run preview

# Type checking
npm run type-check

# Netlify CLI commands (after installing netlify-cli)
netlify login              # Login to Netlify
netlify init               # Initialize site
netlify deploy             # Deploy preview
netlify deploy --prod      # Deploy to production
netlify open               # Open dashboard
netlify logs               # View logs
```

---

## Environment Variables (If Needed)

Your Supabase credentials are in `/utils/supabase/info.tsx`.

If you want to use environment variables instead:

1. **In Netlify Dashboard:**
   - Site settings → Environment variables
   - Add: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`

2. **In your code:**
   ```typescript
   const url = import.meta.env.VITE_SUPABASE_URL || 'fallback-url'
   const key = import.meta.env.VITE_SUPABASE_ANON_KEY || 'fallback-key'
   ```

**Note:** Variables must be prefixed with `VITE_` to be accessible in Vite.

---

## Continuous Deployment

Once you connect your Git repository to Netlify:

🔄 **Auto-deploy on every push:**
- Push to `main` → Production deploy
- Push to other branches → Preview deploy
- Pull requests → Preview deploy with unique URL

**To skip a deploy:**
```bash
git commit -m "Update README [skip ci]"
```

---

## Cost

### Netlify Free Tier:
✅ 100 GB bandwidth/month  
✅ 300 build minutes/month  
✅ Unlimited sites  
✅ HTTPS & CDN included  
✅ Continuous deployment  

Perfect for most use cases! 💰

---

## Support

📖 **Full Documentation:**
- [NETLIFY_DEPLOYMENT_GUIDE.md](./NETLIFY_DEPLOYMENT_GUIDE.md) - Comprehensive guide
- [NETLIFY_DEPLOY_CHECKLIST.md](./NETLIFY_DEPLOY_CHECKLIST.md) - Deployment checklist

🔗 **External Resources:**
- [Netlify Docs](https://docs.netlify.com/)
- [Netlify Community](https://answers.netlify.com/)
- [Vite Docs](https://vitejs.dev/)

---

## Quick Reference

| Task | Command |
|------|---------|
| Install dependencies | `npm install` |
| Start dev server | `npm run dev` |
| Build for production | `npm run build` |
| Preview production build | `npm run preview` |
| Type check | `npm run type-check` |
| Deploy to Netlify | `netlify deploy --prod` |

---

**That's it! Your Bhandar-IMS is now live on Netlify! 🎉**

Happy deploying! 🚀
