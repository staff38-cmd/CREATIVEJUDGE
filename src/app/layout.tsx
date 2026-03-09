import type { Metadata } from "next";
import "./globals.css";
import Link from "next/link";
import { cookies } from "next/headers";
import { verifySessionToken, COOKIE_NAME } from "@/lib/auth";
import LogoutButton from "@/components/LogoutButton";
import { ThemeProvider } from "@/components/ThemeProvider";
import ThemeToggle from "@/components/ThemeToggle";

export const metadata: Metadata = {
  title: "CREATIVEJUDGE | 広告・クリエイティブ 薬機法チェックシステム",
  description: "薬機法・景品表示法・広告レギュレーションへの適合性をAIが自動チェックするプラットフォーム",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  const user = token ? await verifySessionToken(token) : null;

  return (
    <html lang="ja" suppressHydrationWarning>
      <body className="min-h-screen bg-[#0a0a0f] text-white">
        <ThemeProvider>
          <nav className="border-b border-white/10 bg-black/40 backdrop-blur-sm sticky top-0 z-50">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="flex items-center justify-between h-16">
                <div className="flex items-center gap-3">
                  <Link href="/" className="flex items-center gap-2">
                    <span className="text-2xl font-black tracking-tight bg-gradient-to-r from-violet-400 to-pink-400 bg-clip-text text-transparent">
                      CREATIVE<span className="text-white">JUDGE</span>
                    </span>
                  </Link>
                  <ThemeToggle />
                </div>
                <div className="flex items-center gap-6">
                  <Link href="/projects" className="text-sm text-gray-400 hover:text-white transition-colors">
                    案件
                  </Link>
                  <Link href="/works" className="text-sm text-gray-400 hover:text-white transition-colors">
                    チェック履歴
                  </Link>
                  <Link href="/checklists" className="text-sm text-gray-400 hover:text-white transition-colors">
                    チェックリスト
                  </Link>
                  <Link href="/settings/media-regulations" className="text-sm text-gray-400 hover:text-white transition-colors">
                    設定
                  </Link>
                  <Link
                    href="/submit"
                    className="px-4 py-2 rounded-full text-sm font-semibold bg-gradient-to-r from-violet-500 to-pink-500 hover:from-violet-600 hover:to-pink-600 transition-all"
                  >
                    新規チェック
                  </Link>
                  {user && (
                    <div className="flex items-center gap-3 pl-3 border-l border-white/10">
                      <span className="text-xs text-gray-500 max-w-[140px] truncate">{user.email}</span>
                      <LogoutButton />
                    </div>
                  )}
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
        </ThemeProvider>
      </body>
    </html>
  );
}
