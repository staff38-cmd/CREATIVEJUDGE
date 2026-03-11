#!/bin/bash
# deploy.sh - 緊急時の手動復旧用
# 通常デプロイはGitHub Actionsが自動実行（main pushで起動）

echo "=== 緊急手動復旧 ==="
pm2 restart all --update-env 2>/dev/null || pm2 start all --update-env
echo "=== 完了 ==="
