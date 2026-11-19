#!/usr/bin/env bash
# One-time publication helper for the pre-created GitHub repository.
set -euo pipefail
cd "$(dirname "$0")/.."
REPO='https://github.com/JunyeonL/my-apt-calendar.git'
command -v git >/dev/null || { echo 'Git is required: https://git-scm.com/downloads'; exit 1; }
if [[ ! -d .git ]]; then git init -b main; fi
if [[ "$(git branch --show-current)" != 'main' ]]; then
  git branch -M main
fi
if git remote get-url origin >/dev/null 2>&1; then
  ACTUAL="$(git remote get-url origin)"
  if [[ "$ACTUAL" != "$REPO" && "$ACTUAL" != 'git@github.com:JunyeonL/my-apt-calendar.git' ]]; then
    echo "The existing origin remote points to $ACTUAL, not $REPO" >&2
    echo 'Verify the target repository before pushing.' >&2
    exit 1
  fi
else
  git remote add origin "$REPO"
fi
if ! git config user.name >/dev/null 2>&1; then
  echo 'Set your Git name once: git config --global user.name "YOUR_NAME"' >&2
  exit 1
fi
if ! git config user.email >/dev/null 2>&1; then
  echo 'Set your Git email once: git config --global user.email "YOUR_EMAIL"' >&2
  exit 1
fi
git add .github .gitignore .nojekyll README.md app.js data eligibility.mjs index.html scripts styles.css tests
if ! git diff --cached --quiet; then
  git commit -m 'feat: initial personal ApplyHome calendar'
fi
git push --set-upstream origin main
printf '\nPublished to https://github.com/JunyeonL/my-apt-calendar\n'
echo 'Next: Settings > Pages > Source: GitHub Actions; then add DATA_GO_KR_API_KEY to Actions secrets.'
