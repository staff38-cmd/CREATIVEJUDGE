#!/bin/bash
# deploy.sh - OOM対策watchdog付きデプロイスクリプト

echo "=== [1/4] git pull ==="
git pull origin main

echo "=== [2/4] watchdog起動（ビルドがOOMで死んでも15分後に自動復旧） ==="
(sleep 900 && pm2 start all --update-env 2>/dev/null && echo "[watchdog] pm2 restored") &
WATCHDOG_PID=$!
disown $WATCHDOG_PID

echo "=== [3/4] pm2停止 + .next削除 + クリーンビルド ==="
pm2 stop all || true
rm -rf .next

if NODE_OPTIONS="--max-old-space-size=1536" npm run build; then
    echo "=== ビルド成功 ==="
    kill $WATCHDOG_PID 2>/dev/null || true
else
    echo "!!! ビルド失敗 → pm2を再起動します !!!"
    kill $WATCHDOG_PID 2>/dev/null || true
    pm2 start all --update-env
    exit 1
fi

echo "=== [4/4] pm2 再起動 ==="
pm2 start all --update-env

echo "=== デプロイ完了 ==="
