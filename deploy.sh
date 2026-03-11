#!/bin/bash
# deploy.sh - ビルド完了後にのみ再起動する安全なデプロイスクリプト
set -e

echo "=== [1/3] git pull ==="
git pull origin main

echo "=== [2/3] build (メモリ上限1536MB) ==="
NODE_OPTIONS="--max-old-space-size=1536" npm run build

echo "=== [3/3] pm2 restart ==="
pm2 restart all --update-env

echo "=== デプロイ完了 ==="
