#!/bin/bash
# deploy.sh - ビルド中はサイト稼働継続、成功時のみpm2再起動（数秒ダウン）

echo "=== [1/4] git pull ==="
git pull origin main

echo "=== [2/4] .nextバックアップ（pm2は稼働継続）==="
if [ -d .next ]; then
    cp -r .next .next-backup
fi

echo "=== [3/4] ビルド（サイト稼働中）==="

# watchdog: 8分後にOOM等でシェルが死んでいたら自動復旧
(sleep 480 && if [ -d /home/ubuntu/app/.next-backup ] && [ ! -f /home/ubuntu/app/.next/BUILD_ID ]; then rm -rf /home/ubuntu/app/.next; mv /home/ubuntu/app/.next-backup /home/ubuntu/app/.next; fi; pm2 restart all --update-env 2>/dev/null || pm2 start all --update-env 2>/dev/null) &
WATCHDOG_PID=$!
disown $WATCHDOG_PID

if NODE_OPTIONS="--max-old-space-size=1024" npm run build; then
    echo "=== ビルド成功 ==="
    kill $WATCHDOG_PID 2>/dev/null || true
    rm -rf .next-backup
else
    echo "!!! ビルド失敗 → バックアップから旧バージョンで復旧 !!!"
    kill $WATCHDOG_PID 2>/dev/null || true
    if [ -d .next-backup ]; then
        rm -rf .next
        mv .next-backup .next
    fi
    pm2 restart all --update-env 2>/dev/null || pm2 start all --update-env
    exit 1
fi

echo "=== [4/4] pm2 再起動（数秒のダウンタイム）==="
pm2 restart all --update-env

echo "=== デプロイ完了 ==="
