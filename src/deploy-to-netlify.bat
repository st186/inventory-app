@echo off
REM Bhandar-IMS - Netlify Deployment Script for Windows
REM This script helps automate the deployment process

echo ========================================
echo 🚀 Bhandar-IMS Netlify Deployment Helper
echo ========================================
echo.

REM Step 1: Check if Node.js is installed
echo 📦 Checking prerequisites...
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ❌ Node.js is not installed. Please install Node.js 18 or higher.
    pause
    exit /b 1
)

for /f "tokens=*" %%i in ('node -v') do set NODE_VERSION=%%i
echo ✅ Node.js %NODE_VERSION% detected

REM Step 2: Check if npm is installed
where npm >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ❌ npm is not installed.
    pause
    exit /b 1
)

for /f "tokens=*" %%i in ('npm -v') do set NPM_VERSION=%%i
echo ✅ npm %NPM_VERSION% detected
echo.

REM Step 3: Install dependencies
echo 📥 Installing dependencies...
call npm install
if %ERRORLEVEL% NEQ 0 (
    echo ❌ Failed to install dependencies
    pause
    exit /b 1
)
echo ✅ Dependencies installed
echo.

REM Step 4: Run type check
echo 🔍 Running TypeScript type check...
call npm run type-check
if %ERRORLEVEL% NEQ 0 (
    echo ⚠️  Warning: TypeScript type check failed.
    set /p CONTINUE="Continue anyway? (y/n): "
    if /i not "%CONTINUE%"=="y" (
        pause
        exit /b 1
    )
) else (
    echo ✅ Type check passed
)
echo.

REM Step 5: Test production build
echo 🔨 Testing production build...
call npm run build
if %ERRORLEVEL% NEQ 0 (
    echo ❌ Build failed. Please fix errors before deploying.
    pause
    exit /b 1
)
echo ✅ Build successful! Output in ./dist
echo.

REM Step 6: Check if Netlify CLI is installed
echo 🌐 Checking Netlify CLI...
where netlify >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ⚠️  Netlify CLI not installed
    set /p INSTALL_CLI="Install Netlify CLI globally? (y/n): "
    if /i "%INSTALL_CLI%"=="y" (
        call npm install -g netlify-cli
        if %ERRORLEVEL% NEQ 0 (
            echo ❌ Failed to install Netlify CLI
            pause
            exit /b 1
        )
        echo ✅ Netlify CLI installed
    ) else (
        echo.
        echo Skipping Netlify CLI deployment.
        echo.
        echo 📝 Next steps:
        echo    1. Push your code to GitHub/GitLab/Bitbucket
        echo    2. Go to https://app.netlify.com/
        echo    3. Click 'Add new site' → 'Import an existing project'
        echo    4. Connect your repository and deploy!
        pause
        exit /b 0
    )
) else (
    echo ✅ Netlify CLI detected
)
echo.

REM Step 7: Ask about deployment method
echo 🎯 Deployment Options:
echo    1. Deploy via Netlify CLI (recommended for quick deploy)
echo    2. Initialize Netlify site and connect to Git (recommended for continuous deployment)
echo    3. Exit and deploy manually via Netlify dashboard
echo.
set /p DEPLOY_OPTION="Choose option (1-3): "

if "%DEPLOY_OPTION%"=="1" (
    echo.
    echo 🚀 Deploying to Netlify...
    echo.
    echo This will deploy your site. You'll need to log in to Netlify if not already logged in.
    echo.
    call netlify deploy --prod
) else if "%DEPLOY_OPTION%"=="2" (
    echo.
    echo 🔗 Initializing Netlify site...
    echo.
    call netlify init
) else if "%DEPLOY_OPTION%"=="3" (
    echo.
    echo 📝 Manual deployment instructions:
    echo.
    echo 1. Push your code to Git:
    echo    git add .
    echo    git commit -m "Ready for deployment"
    echo    git push origin main
    echo.
    echo 2. Go to https://app.netlify.com/
    echo 3. Click 'Add new site' → 'Import an existing project'
    echo 4. Connect your Git provider and select your repository
    echo 5. Verify build settings (should auto-detect from netlify.toml)
    echo 6. Click 'Deploy site'
    echo.
    pause
    exit /b 0
) else (
    echo ❌ Invalid option
    pause
    exit /b 1
)

echo.
echo ✅ Deployment process completed!
echo.
echo 📚 Next steps:
echo    1. Check your Netlify dashboard for deployment status
echo    2. Test your live site thoroughly
echo    3. Add your Netlify URL to Supabase Auth allowed URLs
echo    4. See NETLIFY_DEPLOY_CHECKLIST.md for post-deployment tasks
echo.
echo 📖 Documentation:
echo    - NETLIFY_DEPLOYMENT_GUIDE.md - Complete deployment guide
echo    - NETLIFY_DEPLOY_CHECKLIST.md - Deployment checklist
echo.
echo 🎉 Happy deploying!
echo.
pause
