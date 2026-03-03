import type { Metadata } from "next";
import "./globals.css";
import Link from "next/link";

export const metadata: Metadata = {
  title: "CREATIVEJUDGE | 広告・クリエイティブ 薬機法チェックシステム",
  description: "薬機法・景品表示法・広告レギュレーションへの適合性をAIが自動チェックするプラットフォーム",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body className="min-h-screen bg-[#0a0a0f] text-white">
        <nav className="border-b border-white/10 bg-black/40 backdrop-blur-sm sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
              <Link href="/" className="flex items-center gap-2">
                <span className="text-2xl font-black tracking-tight bg-gradient-to-r from-violet-400 to-pink-400 bg-clip-text text-transparent">
                  CREATIVE<span className="text-white">JUDGE</span>
                </span>
              </Link>
              <div className="flex items-center gap-6">
                <Link href="/projects" className="text-sm text-gray-400 hover:text-white transition-colors">
                  案件
                </Link>
                <Link href="/works" className="text-sm text-gray-400 hover:text-white transition-colors">
                  チェック履歴
                </Link>
                <Link
                  href="/submit"
                  className="px-4 py-2 rounded-full text-sm font-semibold bg-gradient-to-r from-violet-500 to-pink-500 hover:from-violet-600 hover:to-pink-600 transition-all"
                >
                  新規チェック
                </Link>
              </div>
            </div>
          </div>
        </nav>
        <main>{children}</main>
        <footer className="border-t border-white/10 mt-20 py-8 text-center text-sm text-gray-600">
          © 2025 CREATIVEJUDGE — AI Compliance Check Platform
          <p className="mt-1 text-xs text-gray-700">
            ※ 本ツールはAIによる参考情報の提供であり、法的判断の保証はしません。最終確認は専門家にご相談ください。
          </p>
        </footer>
      </body>
    </html>
  );
}
