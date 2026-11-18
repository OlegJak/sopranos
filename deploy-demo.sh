#!/usr/bin/env bash
# Builds dist/ (site + /admin) and deploys it with the API in functions/ to Cloudflare Pages.
# Usage: ./deploy-demo.sh   (needs `npx wrangler login` once)
set -euo pipefail
cd "$(dirname "$0")"
rm -rf dist && mkdir dist
cp -R index.html img admin dist/
npx --yes wrangler@4.156.0 pages deploy dist --project-name soprano-demo --branch main --commit-dirty=true
