#!/bin/bash
# deploy.sh - ビルド前にpm2停止→ビルド→再起動（失敗時も再起動）
set -e

echo "=== [1/3] git pull ==="
git pull origin main

echo "=== [2/3] pm2停止（RAM確保のため） ==="
pm2 stop all || true

echo "=== [3/3] build (メモリ上限1536MB) ==="
# ビルド失敗時も必ずpm2を再起動するようにtrapを設定
trap 'echo "!!! ビルド失敗 → pm2を再起動します !!!"; pm2 start all --update-env; exit 1' ERR

NODE_OPTIONS="--max-old-space-size=1536" npm run build

echo "=== pm2 再起動 ==="
trap - ERR
pm2 start all --update-env

echo "=== デプロイ完了 ==="
