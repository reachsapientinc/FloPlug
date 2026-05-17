#!/bin/bash

# ── git-push.sh ───────────────────────────────────────────────────────────────
# Usage: ./git-push.sh "commit message" [branch]
# Branch must be one of: dev, sandbox, stage, main
# Branch defaults to current branch if not provided.
# Extra confirmation required if pushing to non-dev branches.
# ─────────────────────────────────────────────────────────────────────────────

VALID_BRANCHES=("dev" "sandbox" "stage" "main")

# ── Require commit message ────────────────────────────────────────────────────
if [ -z "$1" ]; then
  echo "❌ Commit message is required."
  echo "   Usage: ./git-push.sh \"your commit message\" [branch]"
  echo "   Valid branches: dev | sandbox | stage | main"
  echo "   Examples:"
  echo "     ./git-push.sh \"feat: add email node\""
  echo "     ./git-push.sh \"feat: add email node\" dev"
  echo "     ./git-push.sh \"release: v1.2.0\" main"
  exit 1
fi

COMMIT_MSG="$1"

# ── Verify we're in a git repo ────────────────────────────────────────────────
if ! git rev-parse --git-dir > /dev/null 2>&1; then
  echo "❌ Not a git repository. Run git init first."
  exit 1
fi

# ── Determine target branch ───────────────────────────────────────────────────
CURRENT_BRANCH=$(git branch --show-current)

if [ -n "$2" ]; then
  TARGET_BRANCH="$2"

  # ── Validate branch is in allowed list ─────────────────────────────────────
  VALID=false
  for b in "${VALID_BRANCHES[@]}"; do
    if [ "$b" = "$TARGET_BRANCH" ]; then
      VALID=true
      break
    fi
  done

  if [ "$VALID" = false ]; then
    echo "❌ Invalid branch: '$TARGET_BRANCH'"
    echo "   Valid branches are: ${VALID_BRANCHES[*]}"
    exit 1
  fi
else
  TARGET_BRANCH="$CURRENT_BRANCH"

  # ── Validate current branch is also in allowed list ────────────────────────
  VALID=false
  for b in "${VALID_BRANCHES[@]}"; do
    if [ "$b" = "$TARGET_BRANCH" ]; then
      VALID=true
      break
    fi
  done

  if [ "$VALID" = false ]; then
    echo "❌ Current branch '$TARGET_BRANCH' is not a valid deployment branch."
    echo "   Valid branches are: ${VALID_BRANCHES[*]}"
    echo "   Switch to a valid branch first or provide one as parameter."
    exit 1
  fi
fi

echo "📌 Current branch : $CURRENT_BRANCH"
echo "🎯 Target branch  : $TARGET_BRANCH"

# ── Warn and double-confirm if pushing to non-dev branch ─────────────────────
if [ "$TARGET_BRANCH" != "dev" ]; then
  echo ""
  echo "⚠️  ─────────────────────────────────────────────────────────"
  echo "⚠️  You are pushing to '$TARGET_BRANCH' which is NOT the dev branch."

  case "$TARGET_BRANCH" in
    "main")
      echo "⚠️  This will affect PRODUCTION (floplug-prod)."
      ;;
    "sandbox")
      echo "⚠️  This will affect SANDBOX (floplug-sandbox)."
      ;;
    "stage")
      echo "⚠️  This will affect STAGING (floplug-stage)."
      ;;
  esac

  echo "⚠️  ─────────────────────────────────────────────────────────"
  echo ""
  read -p "❓ Are you sure you want to push to '$TARGET_BRANCH'? (y/n) " -n 1 -r
  echo ""
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Push cancelled."
    exit 0
  fi

  echo ""
  read -p "❓ Please confirm again — push to '$TARGET_BRANCH'? Type 'yes' to confirm: " CONFIRM
  if [ "$CONFIRM" != "yes" ]; then
    echo "❌ Push cancelled — you must type 'yes' to confirm a non-dev push."
    exit 0
  fi
fi

# ── Switch to target branch if different from current ─────────────────────────
if [ "$TARGET_BRANCH" != "$CURRENT_BRANCH" ]; then
  echo ""
  echo "🔀 Switching from '$CURRENT_BRANCH' to '$TARGET_BRANCH'..."
  git checkout "$TARGET_BRANCH" 2>/dev/null || git checkout -b "$TARGET_BRANCH"
fi

# ── Safety check — these paths must be ignored ────────────────────────────────
echo ""
echo "🔍 Checking .gitignore safety..."

SAFE=true
PROTECTED=(
  "floplug-dev/"
  "floplug-sb/"
  "floplug-stage/"
  "floplug-sandbox/"
  "floplug-prod/"
  "firebaseAdmin/"
  "functions/src/scripts/floplug-dev-serviceAccountKey.json"
  "functions/src/scripts/floplug-prod-serviceAccountKey.json"
  "functions/src/scripts/floplug-stage-serviceAccountKey.json"
  "functions/src/scripts/floplug-sandbox-serviceAccountKey.json"
  "backup/"
  "functions/lib/"
  "frontend/dist/"
  "packages/shared/dist/"
  "functions/node_modules/"
  "frontend/node_modules/"
  "functions/src/scripts"
  "node_modules/"
)

for path in "${PROTECTED[@]}"; do
  result=$(git check-ignore -q "$path" 2>/dev/null; echo $?)
  if [ "$result" != "0" ]; then
    echo "  ⚠️  NOT ignored: $path"
    SAFE=false
  else
    echo "  ✅ Ignored: $path"
  fi
done

if [ "$SAFE" = false ]; then
  echo ""
  echo "❌ Some protected paths are not in .gitignore."
  echo "   Fix .gitignore before pushing."
  if [ "$TARGET_BRANCH" != "$CURRENT_BRANCH" ]; then
    git checkout "$CURRENT_BRANCH"
  fi
  exit 1
fi

echo ""
echo "✅ All protected paths are ignored."

# ── Stage all changes ─────────────────────────────────────────────────────────
echo ""
echo "📦 Staging changes..."
git add .

# ── Show what's being committed ───────────────────────────────────────────────
echo ""
echo "📋 Files to be committed:"
git status --short

# ── Nothing to commit? ───────────────────────────────────────────────────────
if git diff --cached --quiet; then
  echo ""
  echo "ℹ️  Nothing to commit — working tree is clean."
  if [ "$TARGET_BRANCH" != "$CURRENT_BRANCH" ]; then
    git checkout "$CURRENT_BRANCH"
  fi
  exit 0
fi

# ── Final confirmation ────────────────────────────────────────────────────────
echo ""
read -p "🚀 Commit and push to '$TARGET_BRANCH' with message: \"$COMMIT_MSG\" ? (y/n) " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "❌ Push cancelled. Changes remain staged."
  echo "   Run 'git reset HEAD .' to unstage if needed."
  if [ "$TARGET_BRANCH" != "$CURRENT_BRANCH" ]; then
    git checkout "$CURRENT_BRANCH"
  fi
  exit 0
fi

# ── Commit ────────────────────────────────────────────────────────────────────
git commit -m "$COMMIT_MSG"

# ── Push ─────────────────────────────────────────────────────────────────────
echo ""
echo "⬆️  Pushing to origin/$TARGET_BRANCH..."
git push origin "$TARGET_BRANCH"

if [ $? -eq 0 ]; then
  echo ""
  echo "🎉 Successfully pushed to $TARGET_BRANCH"
  if [ "$TARGET_BRANCH" != "$CURRENT_BRANCH" ]; then
    echo "🔀 Switching back to '$CURRENT_BRANCH'..."
    git checkout "$CURRENT_BRANCH"
  fi
else
  echo ""
  echo "❌ Push failed. Check your connection and GitHub credentials."
  if [ "$TARGET_BRANCH" != "$CURRENT_BRANCH" ]; then
    git checkout "$CURRENT_BRANCH"
  fi
  exit 1
fi