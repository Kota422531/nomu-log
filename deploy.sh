#!/usr/bin/env bash
# 通知サーバー(Cloud Functions)と Firestore ルールをデプロイする(Cloud Shell 用)
set -euo pipefail
cd "$(dirname "$0")"
command -v firebase >/dev/null || npm install -g firebase-tools --no-audit --no-fund
(cd functions && npm install --no-audit --no-fund --loglevel=error)
firebase deploy --only firestore:rules,functions --project nomu-log --force --non-interactive 2>&1 | tee ~/nomu-deploy.log
echo "=== DEPLOY FINISHED ==="
