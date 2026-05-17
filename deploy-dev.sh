#!/bin/bash
DEPLOY_MODE=${1:-false}
FUNC_MODE=${2:-none}

REQUIRED_FB="13"
FB_VERSION=$(firebase --version | cut -d. -f1)
if [ "$FB_VERSION" -lt "$REQUIRED_FB" ]; then
  echo "❌ Firebase CLI too old. Run: npm install -g firebase-tools"
  exit 1
fi

firebase use dev

echo "📂 Fetching Dev Keys from floplug-dev folder..."
cp floplug-dev/.env.development frontend/.env.development
trap 'rm -f frontend/.env.development; echo "🧹 Cleaned up."' EXIT

# 1.a Build shared types first
echo "⚙️ Building shared types..."
npm --prefix packages/shared run build

# 1.b Sync shared dist into functions/shared so it deploys correctly
echo "📦 Syncing shared package into functions..."
rm -rf functions/shared
mkdir -p functions/shared/dist

# Copy the ENTIRE contents of dist into a dist folder in functions
cp -r packages/shared/dist/* functions/shared/dist/
# Copy the package.json so the 'main' and 'exports' fields remain valid
cp packages/shared/package.json functions/shared/package.json

# 1.c Build Functions (TypeScript to JS)
echo "⚙️ Compiling TypeScript Functions..."
cd functions && npm run build && cd ..

echo "🏗️ Starting Development Build..."
cd frontend
if npx vite build --mode development; then
    echo "✅ Build successful."
    cd ..
else
    echo "❌ Build failed. Cleaning up."
    rm frontend/.env.development
    exit 1
fi
echo `pwd`
if [ "$DEPLOY_MODE" = "true" ]; then
    if [ "$FUNC_MODE" = "rules" ]; then
        # 🌟 ADDED OPTION: Deploy Security Rules and Indexes only
        echo "🔒 Deploying Firestore Security Rules ONLY..."
        firebase deploy --only firestore:rules
    elif [ "$FUNC_MODE" = "none" ]; then
        echo "🚀 Deploying Hosting ONLY..."
        firebase deploy --only hosting
    elif [ "$FUNC_MODE" = "all" ]; then
        echo "🚀 Deploying Full Stack..."
        firebase deploy
    else
        echo "🚀 Deploying Hosting + Function: $FUNC_MODE..."
        firebase deploy --only hosting,functions:$FUNC_MODE
    fi
else
    echo "ℹ️ Compile-only mode finished."
fi

rm frontend/.env.development