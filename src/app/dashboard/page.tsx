export const dynamic = "force-dynamic";

import Link from "next/link";
import { getAllWorks, getAllChecklists, getAllProjects } from "@/lib/storage";
import { ComplianceIssue } from "@/lib/types";

export default async function DashboardPage() {
  const [works, checklists, projects] = await Promise.all([
    getAllWorks(),
    getAllChecklists(),
    getAllProjects(),
  ]);

  // ===== 集計ロジック =====

  // 総件数
  const totalWorks = works.length;
  const checkedWorks = works.filter((w) => w.complianceResult).length;
  const ngWorks = works.filter((w) => w.complianceResult?.overallStatus === "ng").length;
  const warningWorks = works.filter((w) => w.complianceResult?.overallStatus === "warning").length;

  // 全 issue を収集
  const allIssues: ComplianceIssue[] = works.flatMap(
    (w) => w.complianceResult?.issues ?? []
  );
  const totalViolations = allIssues.filter((i) => i.level === "violation").length;
  const totalWarnings = allIssues.filter((i) => i.level === "warning").length;

  // チェックリスト統計
  const totalChecklists = checklists.length;
  const approvedChecklists = checklists.filter((c) => c.status === "approved").length;
  const approvalRate = totalChecklists > 0 ? Math.round((approvedChecklists / totalChecklists) * 100) : 0;

  // カテゴリ別 NG 件数
  const categoryCount: Record<string, number> = {};
  for (const issue of allIssues) {
    categoryCount[issue.category] = (categoryCount[issue.category] ?? 0) + 1;
  }
  const categoryRanking = Object.entries(categoryCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);
  const maxCategoryCount = categoryRanking[0]?.[1] ?? 1;

  // 月別 NG 件数（直近6ヶ月）
  const now = new Date();
  const months: { label: string; key: string }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({
      label: `${d.getMonth() + 1}月`,
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
    });
  }
  const monthlyNg: Record<string, number> = {};
  const monthlyChecked: Record<string, number> = {};
  for (const w of works) {
    const ym = w.submittedAt.slice(0, 7);
    if (w.complianceResult) {
      monthlyChecked[ym] = (monthlyChecked[ym] ?? 0) + 1;
      if (w.complianceResult.overallStatus !== "ok") {
        monthlyNg[ym] = (monthlyNg[ym] ?? 0) + 1;
      }
    }
  }
  const monthlyData = months.map((m) => ({
    label: m.label,
    ng: monthlyNg[m.key] ?? 0,
    checked: monthlyChecked[m.key] ?? 0,
  }));
  const maxMonthly = Math.max(...monthlyData.map((m) => m.checked), 1);

  // 案件別 NG 件数
  const projectStats = projects
    .map((p) => {
      const pWorks = works.filter((w) => w.projectId === p.id && w.complianceResult);
      const pNg = pWorks.filter((w) => w.complianceResult?.overallStatus !== "ok").length;
      return { name: p.name, total: pWorks.length, ng: pNg, id: p.id };
    })
    .filter((p) => p.total > 0)
    .sort((a, b) => b.ng - a.ng)
    .slice(0, 8);

  // よく出る NG タイトル
  const titleCount: Record<string, number> = {};
  for (const issue of allIssues.filter((i) => i.level === "violation" || i.level === "warning")) {
    titleCount[issue.title] = (titleCount[issue.title] ?? 0) + 1;
  }
  const topTitles = Object.entries(titleCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  // 媒体別チェックリスト件数
  const mediaCount: Record<string, number> = {};
  for (const cl of checklists) {
    mediaCount[cl.media] = (mediaCount[cl.media] ?? 0) + 1;
  }
  const mediaRanking = Object.entries(mediaCount).sort((a, b) => b[1] - a[1]);

  return (
    <div className="max-w-7xl mx-auto px-4 py-10">
      <div className="mb-10">
        <h1 className="text-3xl font-black mb-1">ダッシュボード</h1>
        <p className="text-gray-400 text-sm">チェック実績・NG傾向の集計レポート</p>
      </div>

      {/* ===== サマリーカード ===== */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <SummaryCard
          label="総チェック数"
          value={checkedWorks}
          sub={`登録 ${totalWorks} 件`}
          color="violet"
        />
        <SummaryCard
          label="NG・警告件数"
          value={ngWorks + warningWorks}
          sub={`違反 ${ngWorks} ／ 警告 ${warningWorks}`}
          color="red"
        />
        <SummaryCard
          label="違反指摘数合計"
          value={totalViolations + totalWarnings}
          sub={`違反 ${totalViolations} ／ 警告 ${totalWarnings}`}
          color="orange"
        />
        <SummaryCard
          label="チェックリスト承認率"
          value={`${approvalRate}%`}
          sub={`承認 ${approvedChecklists} ／ 計 ${totalChecklists}`}
          color="green"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* ===== 月別チェック・NG推移 ===== */}
        <div className="p-6 rounded-2xl border border-white/10 bg-white/5">
          <h2 className="text-base font-bold mb-5">月別チェック・NG推移（直近6ヶ月）</h2>
          {monthlyData.every((m) => m.checked === 0) ? (
            <p className="text-gray-500 text-sm">データがありません</p>
          ) : (
            <div className="flex items-end gap-3" style={{ height: "160px" }}>
              {monthlyData.map((m) => (
                <div key={m.label} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
                  <div className="flex items-end gap-0.5 w-full" style={{ height: "110px" }}>
                    {/* 総チェック バー */}
                    <div
                      className="flex-1 rounded-t bg-violet-500/50"
                      style={{ height: `${Math.max((m.checked / maxMonthly) * 100, m.checked > 0 ? 4 : 0)}%` }}
                      title={`チェック: ${m.checked}`}
                    />
                    {/* NG バー */}
                    <div
                      className="flex-1 rounded-t bg-red-500/70"
                      style={{ height: `${Math.max((m.ng / maxMonthly) * 100, m.ng > 0 ? 4 : 0)}%` }}
                      title={`NG: ${m.ng}`}
                    />
                  </div>
                  <span className="text-xs text-gray-400">{m.label}</span>
                  <span className="text-xs font-bold text-white">{m.checked}</span>
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-4 mt-3">
            <span className="flex items-center gap-1 text-xs text-gray-400">
              <span className="inline-block w-3 h-3 rounded bg-violet-500/50" />チェック総数
            </span>
            <span className="flex items-center gap-1 text-xs text-gray-400">
              <span className="inline-block w-3 h-3 rounded bg-red-500/70" />NG・警告
            </span>
          </div>
        </div>

        {/* ===== カテゴリ別NG件数 ===== */}
        <div className="p-6 rounded-2xl border border-white/10 bg-white/5">
          <h2 className="text-base font-bold mb-5">規制カテゴリ別NG件数</h2>
          {categoryRanking.length === 0 ? (
            <p className="text-gray-500 text-sm">データがありません</p>
          ) : (
            <div className="space-y-3">
              {categoryRanking.map(([cat, count]) => (
                <div key={cat} className="flex items-center gap-3">
                  <span className="w-28 text-xs text-gray-300 shrink-0">{cat}</span>
                  <div className="flex-1 h-5 bg-white/5 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-orange-500 to-red-500"
                      style={{ width: `${(count / maxCategoryCount) * 100}%` }}
                    />
                  </div>
                  <span className="text-xs font-bold text-white w-6 text-right">{count}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* ===== 案件別NG件数 ===== */}
        <div className="p-6 rounded-2xl border border-white/10 bg-white/5">
          <h2 className="text-base font-bold mb-5">案件別チェック・NG件数</h2>
          {projectStats.length === 0 ? (
            <p className="text-gray-500 text-sm">データがありません</p>
          ) : (
            <div className="space-y-3">
              {projectStats.map((p) => (
                <Link key={p.id} href={`/projects/${p.id}`} className="flex items-center gap-3 hover:opacity-80 transition-opacity">
                  <span className="flex-1 text-xs text-gray-300 truncate">{p.name}</span>
                  <div className="w-32 h-4 bg-white/5 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-violet-500/50"
                      style={{ width: `${(p.total / Math.max(...projectStats.map((x) => x.total))) * 100}%` }}
                    />
                  </div>
                  <span className="text-xs text-gray-400 w-12 text-right">
                    {p.ng > 0 && <span className="text-red-400">NG:{p.ng} / </span>}
                    {p.total}件
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* ===== よく出るNG表現 ===== */}
        <div className="p-6 rounded-2xl border border-white/10 bg-white/5">
          <h2 className="text-base font-bold mb-5">よく出るNG・警告表現 TOP5</h2>
          {topTitles.length === 0 ? (
            <p className="text-gray-500 text-sm">データがありません</p>
          ) : (
            <ol className="space-y-3">
              {topTitles.map(([title, count], i) => (
                <li key={title} className="flex items-start gap-3">
                  <span
                    className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold
                      ${i === 0 ? "bg-red-500/30 text-red-300" : i === 1 ? "bg-orange-500/30 text-orange-300" : "bg-white/10 text-gray-400"}`}
                  >
                    {i + 1}
                  </span>
                  <span className="flex-1 text-sm text-gray-200 leading-snug">{title}</span>
                  <span className="text-xs text-gray-400 shrink-0">{count}回</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>

      {/* ===== 媒体別チェックリスト ===== */}
      {mediaRanking.length > 0 && (
        <div className="p-6 rounded-2xl border border-white/10 bg-white/5 mb-6">
          <h2 className="text-base font-bold mb-5">媒体別チェックリスト件数</h2>
          <div className="flex flex-wrap gap-3">
            {mediaRanking.map(([media, count]) => (
              <div key={media} className="px-4 py-2 rounded-xl border border-white/10 bg-white/5 flex items-center gap-2">
                <span className="text-sm font-bold text-white">{media}</span>
                <span className="text-xs text-gray-400">{count}件</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ===== クイックリンク ===== */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "AIチェック", href: "/submit", icon: "🔍" },
          { label: "チェック履歴", href: "/works", icon: "📋" },
          { label: "チェックリスト", href: "/checklists", icon: "✅" },
          { label: "案件管理", href: "/projects", icon: "📁" },
        ].map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="p-4 rounded-2xl border border-white/10 bg-white/5 hover:border-violet-500/50 hover:bg-violet-500/5 transition-colors text-center"
          >
            <div className="text-2xl mb-1">{link.icon}</div>
            <div className="text-sm font-bold">{link.label}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string | number;
  sub: string;
  color: "violet" | "red" | "orange" | "green";
}) {
  const colorMap = {
    violet: "border-violet-500/30 bg-violet-500/10",
    red: "border-red-500/30 bg-red-500/10",
    orange: "border-orange-500/30 bg-orange-500/10",
    green: "border-green-500/30 bg-green-500/10",
  };
  const textMap = {
    violet: "text-violet-300",
    red: "text-red-300",
    orange: "text-orange-300",
    green: "text-green-300",
  };
  return (
    <div className={`p-5 rounded-2xl border ${colorMap[color]}`}>
      <p className="text-xs text-gray-400 mb-1">{label}</p>
      <p className={`text-3xl font-black mb-1 ${textMap[color]}`}>{value}</p>
      <p className="text-xs text-gray-500">{sub}</p>
    </div>
  );
}
