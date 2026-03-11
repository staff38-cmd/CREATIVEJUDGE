#!/bin/bash
# deploy.sh - クリーンビルド＋失敗時も自動復旧
set -e

echo "=== [1/4] git pull ==="
git pull origin main

echo "=== [2/4] pm2停止（RAM確保のため） ==="
pm2 stop all || true

echo "=== [3/4] .nextを削除してクリーンビルド ==="
rm -rf .next

# ビルド失敗時も必ずpm2を再起動
trap 'echo "!!! ビルド失敗 → pm2を再起動します !!!"; pm2 start all --update-env; exit 1' ERR

NODE_OPTIONS="--max-old-space-size=1536" npm run build

echo "=== [4/4] pm2 再起動 ==="
trap - ERR
pm2 start all --update-env

echo "=== デプロイ完了 ==="
