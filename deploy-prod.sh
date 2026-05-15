#!/bin/bash
DEPLOY_MODE=${1:-false}

REQUIRED_FB="13"
FB_VERSION=$(firebase --version | cut -d. -f1)
if [ "$FB_VERSION" -lt "$REQUIRED_FB" ]; then
  echo "❌ Firebase CLI too old. Run: npm install -g firebase-tools"
  exit 1
fi

firebase use prod

echo "📂 Fetching Production Keys from floplug-prod folder..."
cp floplug-prod/.env.production frontend/.env.production
cp floplug-prod/.env.functions  functions/.env
trap 'rm -f frontend/.env.production functions/.env; echo "🧹 Cleaned up."' EXIT

# 1.a Build shared types first
echo "⚙️ Building shared types..."
npm --prefix packages/shared run build

# 1.b Sync shared dist into functions/shared so it deploys correctly
echo "📦 Syncing shared package into functions..."
cp packages/shared/dist/index.js functions/shared/index.js
cp packages/shared/dist/index.d.ts functions/shared/index.d.ts
rm -rf functions/shared/types
cp -r packages/shared/dist/types functions/shared/types

# 1.c Build Functions
echo "⚙️ Compiling TypeScript Functions..."
cd functions && npm run build && cd ..

echo "🏗️ Starting Production Build..."
cd frontend
if npm run build; then
    echo "✅ Build successful."
    cd ..
else
    echo "❌ Build failed. Cleaning up and stopping."
    exit 1
fi
echo `pwd`
if [ "$DEPLOY_MODE" = "true" ]; then
    echo "🚀 Deploying to Preview Channel for final check..."
    PREVIEW_URL=$(firebase hosting:channel:deploy pre-release --json | jq -r '.result.hosting.links[0]')
    echo "--------------------------------------------------------"
    echo "✅ Preview ready: $PREVIEW_URL"
    echo "--------------------------------------------------------"
    read -p "Ready to go live on floplug.xyz? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "🌐 Pushing to LIVE..."
        firebase hosting:clone floplug-prod:pre-release floplug-prod:live
        echo "🎉 Done!"
    else
        echo "❌ Live deployment cancelled."
    fi
else
    echo "ℹ️ Compile-only mode: Code is valid."
fi