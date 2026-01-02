#!/bin/bash

# Bhandar-IMS - Netlify Deployment Script
# This script helps automate the deployment process

echo "🚀 Bhandar-IMS Netlify Deployment Helper"
echo "=========================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Step 1: Check if Node.js is installed
echo "📦 Checking prerequisites..."
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js is not installed. Please install Node.js 18 or higher.${NC}"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo -e "${YELLOW}⚠️  Warning: Node.js version is less than 18. Current: $(node -v)${NC}"
    echo "   Netlify requires Node.js 18 or higher."
fi

echo -e "${GREEN}✅ Node.js $(node -v) detected${NC}"

# Step 2: Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo -e "${RED}❌ npm is not installed.${NC}"
    exit 1
fi
echo -e "${GREEN}✅ npm $(npm -v) detected${NC}"

# Step 3: Install dependencies
echo ""
echo "📥 Installing dependencies..."
npm install
if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Failed to install dependencies${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Dependencies installed${NC}"

# Step 4: Run type check
echo ""
echo "🔍 Running TypeScript type check..."
npm run type-check
if [ $? -ne 0 ]; then
    echo -e "${YELLOW}⚠️  Warning: TypeScript type check failed. Consider fixing errors before deploying.${NC}"
    read -p "Continue anyway? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
else
    echo -e "${GREEN}✅ Type check passed${NC}"
fi

# Step 5: Test production build
echo ""
echo "🔨 Testing production build..."
npm run build
if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Build failed. Please fix errors before deploying.${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Build successful! Output in ./dist${NC}"

# Step 6: Check if Netlify CLI is installed
echo ""
echo "🌐 Checking Netlify CLI..."
if ! command -v netlify &> /dev/null; then
    echo -e "${YELLOW}⚠️  Netlify CLI not installed${NC}"
    read -p "Install Netlify CLI globally? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        npm install -g netlify-cli
        if [ $? -ne 0 ]; then
            echo -e "${RED}❌ Failed to install Netlify CLI${NC}"
            exit 1
        fi
        echo -e "${GREEN}✅ Netlify CLI installed${NC}"
    else
        echo -e "${YELLOW}Skipping Netlify CLI deployment. You can deploy manually via the Netlify dashboard.${NC}"
        echo ""
        echo "📝 Next steps:"
        echo "   1. Push your code to GitHub/GitLab/Bitbucket"
        echo "   2. Go to https://app.netlify.com/"
        echo "   3. Click 'Add new site' → 'Import an existing project'"
        echo "   4. Connect your repository and deploy!"
        exit 0
    fi
else
    echo -e "${GREEN}✅ Netlify CLI detected${NC}"
fi

# Step 7: Ask about deployment method
echo ""
echo "🎯 Deployment Options:"
echo "   1. Deploy via Netlify CLI (recommended for quick deploy)"
echo "   2. Initialize Netlify site and connect to Git (recommended for continuous deployment)"
echo "   3. Exit and deploy manually via Netlify dashboard"
echo ""
read -p "Choose option (1-3): " -n 1 -r
echo

case $REPLY in
    1)
        echo ""
        echo "🚀 Deploying to Netlify..."
        echo ""
        echo "This will deploy your site. You'll need to log in to Netlify if not already logged in."
        echo ""
        netlify deploy --prod
        ;;
    2)
        echo ""
        echo "🔗 Initializing Netlify site..."
        echo ""
        netlify init
        ;;
    3)
        echo ""
        echo "📝 Manual deployment instructions:"
        echo ""
        echo "1. Push your code to Git:"
        echo "   git add ."
        echo "   git commit -m 'Ready for deployment'"
        echo "   git push origin main"
        echo ""
        echo "2. Go to https://app.netlify.com/"
        echo "3. Click 'Add new site' → 'Import an existing project'"
        echo "4. Connect your Git provider and select your repository"
        echo "5. Verify build settings (should auto-detect from netlify.toml)"
        echo "6. Click 'Deploy site'"
        echo ""
        exit 0
        ;;
    *)
        echo -e "${RED}Invalid option${NC}"
        exit 1
        ;;
esac

echo ""
echo -e "${GREEN}✅ Deployment process completed!${NC}"
echo ""
echo "📚 Next steps:"
echo "   1. Check your Netlify dashboard for deployment status"
echo "   2. Test your live site thoroughly"
echo "   3. Add your Netlify URL to Supabase Auth allowed URLs"
echo "   4. See NETLIFY_DEPLOY_CHECKLIST.md for post-deployment tasks"
echo ""
echo "📖 Documentation:"
echo "   - NETLIFY_DEPLOYMENT_GUIDE.md - Complete deployment guide"
echo "   - NETLIFY_DEPLOY_CHECKLIST.md - Deployment checklist"
echo ""
echo "🎉 Happy deploying!"
