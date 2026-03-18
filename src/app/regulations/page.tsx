"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { NgCase, RegulationCategory } from "@/lib/types";

interface ProjectSummary {
  id: string;
  name: string;
  clientName?: string;
  ngCases: NgCase[];
  sheetUrl?: string;
  crSheetSync?: {
    lastSyncRow: number;
    lastSyncAt: string | null;
  };
}

const CATEGORY_CONFIG: Record<
  RegulationCategory,
  { icon: string; label: string; bg: string; text: string; border: string }
> = {
  過去NG事例: {
    icon: "🔴",
    label: "過去NG事例",
    bg: "bg-red-500/10",
    text: "text-red-300",
    border: "border-red-500/20",
  },
  企業レギュレーション: {
    icon: "🏢",
    label: "企業レギュレーション",
    bg: "bg-blue-500/10",
    text: "text-blue-300",
    border: "border-blue-500/20",
  },
  薬機法: {
    icon: "⚖️",
    label: "薬機法",
    bg: "bg-orange-500/10",
    text: "text-orange-300",
    border: "border-orange-500/20",
  },
  景品表示法: {
    icon: "📋",
    label: "景品表示法",
    bg: "bg-yellow-500/10",
    text: "text-yellow-300",
    border: "border-yellow-500/20",
  },
  媒体ガイドライン: {
    icon: "📺",
    label: "媒体ガイドライン",
    bg: "bg-purple-500/10",
    text: "text-purple-300",
    border: "border-purple-500/20",
  },
  カスタム: {
    icon: "📝",
    label: "手動登録",
    bg: "bg-gray-500/10",
    text: "text-gray-300",
    border: "border-gray-500/20",
  },
};

type SortKey = "category" | "addedAt" | "title";

const CATEGORY_ORDER: RegulationCategory[] = [
  "過去NG事例",
  "企業レギュレーション",
  "薬機法",
  "景品表示法",
  "媒体ガイドライン",
  "カスタム",
];

export default function RegulationsPortalPage() {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterCategory, setFilterCategory] = useState<RegulationCategory | "">("");
  const [filterProject, setFilterProject] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("category");
  const [sortAsc, setSortAsc] = useState(true);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [syncMessages, setSyncMessages] = useState<Record<string, string>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      const res = await fetch("/api/projects");
      const data = await res.json();
      const projectList: ProjectSummary[] = data.projects ?? data ?? [];

      const withSync = await Promise.all(
        projectList.map(async (p) => {
          if (!p.sheetUrl) return p;
          try {
            const syncRes = await fetch(`/api/projects/${p.id}/cr-sheet-sync`);
            if (syncRes.ok) {
              const syncData = await syncRes.json();
              return { ...p, crSheetSync: syncData };
            }
          } catch {
            // ignore
          }
          return p;
        })
      );

      setProjects(withSync);
    } catch (e) {
      console.error("データ取得エラー:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSync = async (project: ProjectSummary, dryRun: boolean) => {
    setSyncingId(project.id);
    setSyncMessages((prev) => ({ ...prev, [project.id]: "" }));

    try {
      const res = await fetch(`/api/projects/${project.id}/cr-sheet-sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dryRun }),
      });
      const data = await res.json();

      if (!res.ok) {
        setSyncMessages((prev) => ({
          ...prev,
          [project.id]: `❌ ${data.error}`,
        }));
      } else {
        setSyncMessages((prev) => ({
          ...prev,
          [project.id]: `✅ ${data.message}（フィードバック行: ${data.feedbackRows ?? 0}件 / 抽出: ${data.extracted ?? 0}件）${dryRun ? " [DRY RUN]" : ""}`,
        }));
        if (!dryRun) loadData();
      }
    } catch (e) {
      setSyncMessages((prev) => ({
        ...prev,
        [project.id]: `❌ 通信エラー: ${String(e)}`,
      }));
    } finally {
      setSyncingId(null);
    }
  };

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortAsc((v) => !v);
    } else {
      setSortKey(key);
      setSortAsc(true);
    }
  };

  // 全プロジェクトのngCasesを横断して集計
  const allCases = projects.flatMap((p) =>
    (p.ngCases ?? []).map((c) => ({
      ...c,
      projectName: p.name,
      clientName: p.clientName,
      projectId: p.id,
    }))
  );

  // フィルタ
  const filtered = allCases.filter((c) => {
    if (filterCategory && c.category !== filterCategory) return false;
    if (filterProject && c.projectId !== filterProject) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (
        !c.title.toLowerCase().includes(q) &&
        !c.description.toLowerCase().includes(q) &&
        !(c.quote ?? "").toLowerCase().includes(q)
      )
        return false;
    }
    return true;
  });

  // ソート
  const sorted = [...filtered].sort((a, b) => {
    let cmp = 0;
    if (sortKey === "category") {
      cmp =
        CATEGORY_ORDER.indexOf(a.category ?? "カスタム") -
        CATEGORY_ORDER.indexOf(b.category ?? "カスタム");
      if (cmp === 0) cmp = a.title.localeCompare(b.title, "ja");
    } else if (sortKey === "addedAt") {
      cmp = new Date(a.addedAt).getTime() - new Date(b.addedAt).getTime();
    } else if (sortKey === "title") {
      cmp = a.title.localeCompare(b.title, "ja");
    }
    return sortAsc ? cmp : -cmp;
  });

  const projectsWithSheet = projects.filter((p) => p.sheetUrl);
  const totalNg = allCases.filter(
    (c) => c.category === "過去NG事例" || c.category === "企業レギュレーション"
  ).length;

  const formatDate = (iso: string | null) =>
    iso
      ? new Date(iso).toLocaleDateString("ja-JP", {
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        })
      : "未同期";

  const SortButton = ({ label, k }: { label: string; k: SortKey }) => (
    <button
      onClick={() => toggleSort(k)}
      className={`text-xs px-2 py-1 rounded transition-colors ${
        sortKey === k
          ? "bg-violet-600 text-white"
          : "border border-white/20 text-gray-400 hover:bg-white/10"
      }`}
    >
      {label} {sortKey === k ? (sortAsc ? "↑" : "↓") : ""}
    </button>
  );

  return (
    <div className="min-h-screen">
      {/* ヘッダー */}
      <div className="border-b border-white/10 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-gray-400 hover:text-white text-sm transition-colors">
              ← ホーム
            </Link>
            <span className="text-gray-600">|</span>
            <h1 className="text-lg font-bold">レギュレーションポータル</h1>
          </div>
          <span className="text-xs text-gray-500">
            CR提出シート備考欄からAIが自動抽出したNG表現DB
          </span>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-6 space-y-6">
        {/* サマリー */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-center">
            <div className="text-2xl font-black text-white">{allCases.length}</div>
            <div className="text-xs text-gray-400 mt-1">登録表現 合計</div>
          </div>
          <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-center">
            <div className="text-2xl font-black text-red-300">{totalNg}</div>
            <div className="text-xs text-red-400 mt-1">🔴 NG / 企業レギュ</div>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-center">
            <div className="text-2xl font-black text-white">{projects.length}</div>
            <div className="text-xs text-gray-400 mt-1">案件数</div>
          </div>
          <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 p-4 text-center">
            <div className="text-2xl font-black text-violet-300">{projectsWithSheet.length}</div>
            <div className="text-xs text-violet-400 mt-1">シート連携中</div>
          </div>
        </div>

        {/* CR提出シート 同期パネル */}
        {projectsWithSheet.length > 0 && (
          <div className="rounded-xl border border-white/10 bg-white/5 p-5">
            <h2 className="text-sm font-bold text-gray-300 mb-4">
              CR提出シート 同期 — AI自動抽出
            </h2>
            <div className="space-y-3">
              {projectsWithSheet.map((p) => (
                <div key={p.id}>
                  <div className="flex items-center justify-between bg-white/5 rounded-lg p-3">
                    <div>
                      <span className="font-medium text-sm">
                        {p.clientName && (
                          <span className="text-gray-400 mr-1">{p.clientName} /</span>
                        )}
                        {p.name}
                      </span>
                      <span className="text-xs text-gray-500 ml-3">
                        前回同期: {formatDate(p.crSheetSync?.lastSyncAt ?? null)}
                        {p.crSheetSync?.lastSyncRow
                          ? ` （${p.crSheetSync.lastSyncRow}行目まで）`
                          : ""}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleSync(p, true)}
                        disabled={syncingId !== null}
                        className="text-xs px-3 py-1.5 rounded border border-white/20 text-gray-300 hover:bg-white/10 disabled:opacity-40 transition-colors"
                      >
                        DRY RUN
                      </button>
                      <button
                        onClick={() => handleSync(p, false)}
                        disabled={syncingId !== null}
                        className="text-xs px-3 py-1.5 rounded bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-40 transition-colors"
                      >
                        {syncingId === p.id ? "同期中..." : "今すぐ同期"}
                      </button>
                    </div>
                  </div>
                  {syncMessages[p.id] && (
                    <div className="text-xs mt-1 px-3 py-2 bg-white/5 rounded text-gray-300 font-mono">
                      {syncMessages[p.id]}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* フィルタ・検索・ソート */}
        <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3">
          <div className="flex flex-wrap gap-3">
            <input
              type="text"
              placeholder="表現・理由・コピーを検索..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1 min-w-48 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/50 placeholder-gray-500"
            />
            {/* 案件フィルター */}
            <select
              value={filterProject}
              onChange={(e) => setFilterProject(e.target.value)}
              className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none"
            >
              <option value="">全案件</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.clientName ? `${p.clientName} / ` : ""}{p.name}
                </option>
              ))}
            </select>
            {/* カテゴリフィルター */}
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value as RegulationCategory | "")}
              className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none"
            >
              <option value="">全カテゴリ</option>
              {Object.entries(CATEGORY_CONFIG).map(([cat, cfg]) => (
                <option key={cat} value={cat}>
                  {cfg.icon} {cfg.label}
                </option>
              ))}
            </select>
          </div>
          {/* ソート */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">並び替え:</span>
            <SortButton label="カテゴリ" k="category" />
            <SortButton label="登録日" k="addedAt" />
            <SortButton label="タイトル" k="title" />
          </div>
        </div>

        {/* NG表現一覧 */}
        {loading ? (
          <div className="text-center py-16 text-gray-500">読み込み中...</div>
        ) : sorted.length === 0 ? (
          <div className="text-center py-16 text-gray-500">
            <div className="text-5xl mb-4">📋</div>
            <p className="text-lg mb-2">レギュレーションがまだ登録されていません</p>
            <p className="text-sm text-gray-600">
              案件にCR提出シートを設定して「今すぐ同期」を実行してください
            </p>
            <Link
              href="/projects"
              className="mt-4 inline-block text-sm text-violet-400 hover:text-violet-300 underline"
            >
              案件設定へ →
            </Link>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="text-xs text-gray-500 px-1">{sorted.length} 件表示</div>
            {sorted.map((entry) => {
              const config =
                CATEGORY_CONFIG[entry.category ?? "カスタム"] ?? CATEGORY_CONFIG["カスタム"];
              const isExpanded = expandedId === entry.id;
              return (
                <div
                  key={entry.id}
                  className={`rounded-xl border ${config.border} ${config.bg} overflow-hidden`}
                >
                  <div
                    className="flex items-start gap-3 p-4 cursor-pointer hover:bg-white/5 transition-colors"
                    onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                  >
                    <span className="text-lg mt-0.5 flex-shrink-0">{config.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span
                          className={`text-xs font-bold px-2 py-0.5 rounded-full border ${config.bg} ${config.text} ${config.border}`}
                        >
                          {config.label}
                        </span>
                        <span className="text-xs text-gray-500">
                          {entry.clientName && `${entry.clientName} / `}
                          {entry.projectName}
                        </span>
                      </div>
                      <div className="font-semibold text-white">{entry.title}</div>
                      {entry.quote && (
                        <div className="text-sm text-red-300 mt-0.5 font-mono">
                          「{entry.quote}」
                        </div>
                      )}
                      <div className="text-sm text-gray-400 mt-0.5 line-clamp-2">
                        {entry.description}
                      </div>
                    </div>
                    <span className="text-gray-500 text-xs flex-shrink-0 mt-1">
                      {isExpanded ? "▲" : "▼"}
                    </span>
                  </div>

                  {isExpanded && (
                    <div className="border-t border-white/10 px-4 pb-4 pt-3 bg-black/20">
                      <div className="text-sm text-gray-300 whitespace-pre-wrap">
                        {entry.description}
                      </div>
                      <div className="flex items-center justify-between mt-3 text-xs text-gray-500">
                        <span>
                          登録日:{" "}
                          {new Date(entry.addedAt).toLocaleDateString("ja-JP")}
                        </span>
                        <Link
                          href={`/projects/${entry.projectId}`}
                          className="text-violet-400 hover:text-violet-300 underline"
                        >
                          案件設定で管理 →
                        </Link>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
