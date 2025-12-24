# Build Troubleshooting Guide

## Quick Fix Checklist

If your Netlify build is failing with "Deploy directory 'dist' does not exist":

### ✅ Step 1: Test Build Locally

```bash
# Install all dependencies
npm install

# Try to build
npm run build
```

If this fails locally, you'll see the actual error. Fix it before deploying to Netlify.

### ✅ Step 2: Common Issues & Fixes

#### Issue: "Cannot find module '@radix-ui/...'"

**Fix:** The versioned imports in Figma Make need to work with standard npm packages.

Make sure these are in your `package.json` dependencies:
```json
"@radix-ui/react-accordion": "^1.2.3",
"@radix-ui/react-alert-dialog": "^1.1.6",
"@radix-ui/react-aspect-ratio": "^1.1.2",
"@radix-ui/react-avatar": "^1.1.3",
"@radix-ui/react-slot": "^1.1.2",
"class-variance-authority": "^0.7.1",
"clsx": "^2.0.0",
"tailwind-merge": "^2.2.0"
```

#### Issue: "lucide-react icon not found"

**Fix:** Lucide React icons must match exactly. The versions might differ.

Check if the icon exists:
```bash
# In your node_modules
cat node_modules/lucide-react/dist/esm/icons/index.d.ts | grep YourIcon
```

#### Issue: TypeScript errors

**Fix:** Run type checking locally:
```bash
npm run type-check
```

If there are errors, you can either:
1. Fix the TypeScript errors
2. Or temporarily disable strict type checking in `tsconfig.json`:
```json
"strict": false,
"noUnusedLocals": false,
"noUnusedParameters": false
```

#### Issue: Missing environment variables

**Fix:** Make sure you've added these in Netlify:
- `VITE_SUPABASE_PROJECT_ID`
- `VITE_SUPABASE_ANON_KEY`

The build should work without them (using fallbacks), but the app won't work properly.

### ✅ Step 3: Verify Build Command

In Netlify, make sure the build command is:
```
npm run build
```

NOT:
- `npm run build && tsc` (too strict)
- `vite build` (missing npm install)
- `yarn build` (using wrong package manager)

### ✅ Step 4: Check Node Version

In `netlify.toml`, verify:
```toml
[build.environment]
  NODE_VERSION = "18"
```

### ✅ Step 5: Clear Netlify Cache

If you've made changes and it's still failing:
1. Go to Netlify Dashboard
2. Site Configuration → Build & Deploy
3. Click "Clear cache and retry deploy"

---

## Detailed Debugging

### Get Full Build Logs

1. Go to Netlify Dashboard
2. Click on the failed deployment
3. Scroll through the build log to find the actual error
4. Look for lines like:
   - `Error: Cannot find module...`
   - `Build failed with exit code...`
   - `TypeScript error...`

### Common Error Patterns

#### Pattern: "X is not exported by Y"

```
Error: 'SomeIcon' is not exported by 'node_modules/lucide-react/...'
```

**Solution:** The icon name is wrong or doesn't exist in that version of lucide-react.

Fix:
1. Check the correct icon name in lucide-react docs
2. Or use a different icon
3. Or update lucide-react version

#### Pattern: "Cannot resolve module"

```
Error: Cannot resolve './components/SomeComponent'
```

**Solution:** Import path is incorrect.

Fix:
1. Verify the file exists
2. Check the file extension (.tsx, .ts, .jsx, .js)
3. Ensure relative paths start with `./` or `../`

#### Pattern: "Unexpected token"

```
Error: Unexpected token '<' or 'export'
```

**Solution:** File is being parsed incorrectly or has syntax errors.

Fix:
1. Check for unmatched brackets/parentheses
2. Verify JSX is in .tsx or .jsx files
3. Check for ES6+ syntax that needs transpilation

---

## If All Else Fails

### Nuclear Option: Simplify the Build

1. **Temporarily remove strict TypeScript checking:**

Edit `package.json`:
```json
"scripts": {
  "build": "vite build"
}
```

2. **Check if Tailwind is causing issues:**

Try commenting out Tailwind import in `globals.css`:
```css
/* @import "tailwindcss"; */
```

3. **Test with minimal dependencies:**

Temporarily comment out unused components in `App.tsx` to see if a specific component is breaking the build.

---

## Success Indicators

When the build succeeds, you'll see:
```
✓ built in XXXms
✓ XX modules transformed
Deploy directory 'dist' ready for deployment
```

The `dist` folder will contain:
- `index.html`
- `assets/` folder with JS and CSS files
- Any static assets (images, fonts, etc.)

---

## Still Stuck?

1. **Compare with working build:**
   - Check if the local build works: `npm run build`
   - If local works but Netlify doesn't, it's an environment issue

2. **Check Netlify's build logs carefully:**
   - The actual error is usually 10-20 lines before "Build failed"
   - Look for red error messages, not yellow warnings

3. **Verify all files are committed:**
   ```bash
   git status
   # Make sure nothing is ignored that shouldn't be
   ```

4. **Try deploying to Vercel instead:**
   Sometimes platform-specific issues occur. Vercel might work if Netlify doesn't.

---

Good luck! 🚀
