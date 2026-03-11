#!/bin/bash
# deploy.sh - ビルド失敗時も旧バージョンで自動復旧

echo "=== [1/4] git pull ==="
git pull origin main

echo "=== [2/4] pm2停止 + .nextバックアップ ==="
pm2 stop all || true
if [ -d .next ]; then
    echo "既存の.nextをバックアップ中..."
    cp -r .next .next-backup
    echo "バックアップ完了"
fi

echo "=== [3/4] ビルド ==="

# watchdog: 20分後にpm2を自動復旧（OOMでシェルごと死んだ場合のフォールバック）
(sleep 1200 && echo "[watchdog] 起動 - .nextを復元してpm2再起動" && if [ -d /home/ubuntu/app/.next-backup ] && [ ! -f /home/ubuntu/app/.next/BUILD_ID ]; then rm -rf /home/ubuntu/app/.next; mv /home/ubuntu/app/.next-backup /home/ubuntu/app/.next; fi; pm2 start all --update-env 2>/dev/null) &
WATCHDOG_PID=$!
disown $WATCHDOG_PID

if NODE_OPTIONS="--max-old-space-size=1536" npm run build; then
    echo "=== ビルド成功 ==="
    kill $WATCHDOG_PID 2>/dev/null || true
    rm -rf .next-backup
else
    echo "!!! ビルド失敗 → バックアップから旧バージョンで復旧 !!!"
    kill $WATCHDOG_PID 2>/dev/null || true
    if [ -d .next-backup ]; then
        rm -rf .next
        mv .next-backup .next
        echo "旧バージョンで復旧しました"
    fi
    pm2 start all --update-env
    exit 1
fi

echo "=== [4/4] pm2 再起動 ==="
rm -rf .next-backup
pm2 start all --update-env

echo "=== デプロイ完了 ==="
