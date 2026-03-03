@echo off
echo === CREATIVEJUDGE セットアップ ===

echo [1/2] パッケージをインストール中...
npm install
if errorlevel 1 (
  echo エラー: npm install に失敗しました
  pause
  exit /b 1
)

echo [2/2] .env.local を作成中...
echo GEMINI_API_KEY=AIzaSyA8BPs1Q77EjQxz7ZKgpklvhNB8EY1Av1Y> .env.local
echo .env.local を作成しました

echo.
echo セットアップ完了！
echo 次のコマンドでサーバーを起動してください:
echo   npm run dev
echo.
pause
