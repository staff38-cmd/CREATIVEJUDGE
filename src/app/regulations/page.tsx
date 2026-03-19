"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { NgCase, AllowedCase, RegulationCategory } from "@/lib/types";

interface ProjectSummary {
  id: string;
  name: string;
  clientName?: string;
  ngCases: NgCase[];
  allowedCases: AllowedCase[];
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
  "注釈・表記ルール": {
    icon: "✏️",
    label: "注釈・表記ルール",
    bg: "bg-teal-500/10",
    text: "text-teal-300",
    border: "border-teal-500/20",
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
type TabKey = "ng" | "ok";

const CATEGORY_ORDER: RegulationCategory[] = [
  "過去NG事例",
  "企業レギュレーション",
  "薬機法",
  "景品表示法",
  "注釈・表記ルール",
  "媒体ガイドライン",
  "カスタム",
];

interface AnnotationGroup {
  key: string;
  variants: string[];
  count: number;
  examples: { rowNum: number; sheetName: string; adText: string; content: string }[];
}

export default function RegulationsPortalPage() {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabKey>("ng");
  const [filterCategory, setFilterCategory] = useState<RegulationCategory | "">("");
  const [filterProject, setFilterProject] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("category");
  const [sortAsc, setSortAsc] = useState(true);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [syncMessages, setSyncMessages] = useState<Record<string, string>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [annotations, setAnnotations] = useState<AnnotationGroup[]>([]);
  const [annotationLoading, setAnnotationLoading] = useState(false);
  const [annotationError, setAnnotationError] = useState("");

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

  const handleSync = async (project: ProjectSummary, dryRun: boolean, resetSync = false) => {
    setSyncingId(project.id);
    setSyncMessages((prev) => ({ ...prev, [project.id]: "" }));

    try {
      const res = await fetch(`/api/projects/${project.id}/cr-sheet-sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dryRun, resetSync }),
      });
      const data = await res.json();

      if (!res.ok) {
        setSyncMessages((prev) => ({
          ...prev,
          [project.id]: `❌ ${data.error}`,
        }));
      } else {
        const okCount = data.extractedOk ?? 0;
        setSyncMessages((prev) => ({
          ...prev,
          [project.id]: `✅ ${data.message}（フィードバック行: ${data.feedbackRows ?? 0}件 / NG抽出: ${data.extracted ?? 0}件 / OK抽出: ${okCount}件）${dryRun ? " [DRY RUN]" : ""}`,
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

  const deleteNgCase = async (projectId: string, caseId: string) => {
    const project = projects.find((p) => p.id === projectId);
    if (!project) return;
    const updated = (project.ngCases ?? []).filter((c) => c.id !== caseId);
    const res = await fetch(`/api/projects/${projectId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ngCases: updated }),
    });
    if (res.ok) loadData();
  };

  const deleteAllowedCase = async (projectId: string, caseId: string) => {
    const project = projects.find((p) => p.id === projectId);
    if (!project) return;
    const updated = (project.allowedCases ?? []).filter((c) => c.id !== caseId);
    const res = await fetch(`/api/projects/${projectId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ allowedCases: updated }),
    });
    if (res.ok) loadData();
  };

  const loadAnnotations = async (projectId: string) => {
    setAnnotationLoading(true);
    setAnnotationError("");
    setAnnotations([]);
    try {
      const res = await fetch(`/api/projects/${projectId}/sheet-annotations`);
      const data = await res.json();
      if (!res.ok) {
        setAnnotationError(data.error ?? "取得エラー");
      } else {
        setAnnotations(data.annotations ?? []);
      }
    } catch (e) {
      setAnnotationError(`通信エラー: ${String(e)}`);
    } finally {
      setAnnotationLoading(false);
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
  const allNgCases = projects.flatMap((p) =>
    (p.ngCases ?? []).map((c) => ({
      ...c,
      projectName: p.name,
      clientName: p.clientName,
      projectId: p.id,
    }))
  );

  // 全プロジェクトのallowedCasesを横断して集計
  const allAllowedCases = projects.flatMap((p) =>
    (p.allowedCases ?? []).map((c) => ({
      ...c,
      projectName: p.name,
      clientName: p.clientName,
      projectId: p.id,
    }))
  );

  // NGフィルタ
  const filteredNg = allNgCases.filter((c) => {
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

  // OKフィルタ
  const filteredOk = allAllowedCases.filter((c) => {
    if (filterProject && c.projectId !== filterProject) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (
        !c.title.toLowerCase().includes(q) &&
        !c.description.toLowerCase().includes(q) &&
        !(c.quote ?? "").toLowerCase().includes(q) &&
        !(c.mediaDescription ?? "").toLowerCase().includes(q)
      )
        return false;
    }
    return true;
  });

  // NGソート
  const sortedNg = [...filteredNg].sort((a, b) => {
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

  // OKソート（カテゴリなし → addedAt / title のみ）
  const sortedOk = [...filteredOk].sort((a, b) => {
    let cmp = 0;
    if (sortKey === "addedAt") {
      cmp = new Date(a.addedAt).getTime() - new Date(b.addedAt).getTime();
    } else {
      cmp = a.title.localeCompare(b.title, "ja");
    }
    return sortAsc ? cmp : -cmp;
  });

  const projectsWithSheet = projects.filter((p) => p.sheetUrl);
  const totalNg = allNgCases.filter(
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
            CR提出シート備考欄からAIが自動抽出したNG/OK表現DB
          </span>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-6 space-y-6">
        {/* サマリー */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-center">
            <div className="text-2xl font-black text-white">{allNgCases.length}</div>
            <div className="text-xs text-gray-400 mt-1">NG登録 合計</div>
          </div>
          <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-center">
            <div className="text-2xl font-black text-red-300">{totalNg}</div>
            <div className="text-xs text-red-400 mt-1">🔴 NG / 企業レギュ</div>
          </div>
          <div className="rounded-xl border border-green-500/20 bg-green-500/5 p-4 text-center">
            <div className="text-2xl font-black text-green-300">{allAllowedCases.length}</div>
            <div className="text-xs text-green-400 mt-1">✅ OK事例</div>
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
              CR提出シート 同期 — AI自動抽出（NG + OK）
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
                      <button
                        onClick={() => {
                          if (confirm("全件再分類します。既存のNG/OK表現はすべて上書きされます。よろしいですか？")) {
                            handleSync(p, false, true);
                          }
                        }}
                        disabled={syncingId !== null}
                        title="最初から全件再取得・再分類"
                        className="text-xs px-3 py-1.5 rounded border border-orange-500/40 text-orange-300 hover:bg-orange-500/10 disabled:opacity-40 transition-colors"
                      >
                        全件再同期
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

        {/* タブ切り替え */}
        <div className="flex gap-1 p-1 rounded-xl bg-white/5 border border-white/10 w-fit">
          <button
            onClick={() => { setActiveTab("ng"); setFilterCategory(""); setExpandedId(null); }}
            className={`px-5 py-2 rounded-lg text-sm font-semibold transition-colors ${
              activeTab === "ng"
                ? "bg-red-500/20 text-red-300 border border-red-500/30"
                : "text-gray-400 hover:text-white"
            }`}
          >
            🚫 NG事例 {allNgCases.length > 0 && <span className="ml-1 text-xs opacity-70">{allNgCases.length}</span>}
          </button>
          <button
            onClick={() => { setActiveTab("ok"); setFilterCategory(""); setExpandedId(null); }}
            className={`px-5 py-2 rounded-lg text-sm font-semibold transition-colors ${
              activeTab === "ok"
                ? "bg-green-500/20 text-green-300 border border-green-500/30"
                : "text-gray-400 hover:text-white"
            }`}
          >
            ✅ OK事例 {allAllowedCases.length > 0 && <span className="ml-1 text-xs opacity-70">{allAllowedCases.length}</span>}
          </button>
        </div>

        {/* フィルタ・検索・ソート */}
        <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3">
          <div className="flex flex-wrap gap-3">
            <input
              type="text"
              placeholder={activeTab === "ng" ? "表現・理由・コピーを検索..." : "表現・承認理由・素材説明を検索..."}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1 min-w-48 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/50 placeholder-gray-500"
            />
            {/* 案件フィルター */}
            <select
              value={filterProject}
              onChange={(e) => setFilterProject(e.target.value)}
              className="bg-gray-900 text-white border border-white/20 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/50"
              style={{ colorScheme: "dark" }}
            >
              <option value="">全案件</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.clientName ? `${p.clientName} / ` : ""}{p.name}
                </option>
              ))}
            </select>
            {/* カテゴリフィルター（NGタブのみ） */}
            {activeTab === "ng" && (
              <select
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value as RegulationCategory | "")}
                className="bg-gray-900 text-white border border-white/20 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                style={{ colorScheme: "dark" }}
              >
                <option value="">全カテゴリ</option>
                {Object.entries(CATEGORY_CONFIG).map(([cat, cfg]) => (
                  <option key={cat} value={cat}>
                    {cfg.icon} {cfg.label}
                  </option>
                ))}
              </select>
            )}
          </div>
          {/* ソート */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">並び替え:</span>
            {(activeTab === "ng"
              ? (["category", "addedAt", "title"] as SortKey[])
              : (["addedAt", "title"] as SortKey[])
            ).map((k) => {
              const labels: Record<SortKey, string> = { category: "カテゴリ", addedAt: "登録日", title: "タイトル" };
              return (
                <button
                  key={k}
                  onClick={() => toggleSort(k)}
                  className={`text-xs px-2 py-1 rounded transition-colors ${
                    sortKey === k
                      ? "bg-violet-600 text-white"
                      : "border border-white/20 text-gray-400 hover:bg-white/10"
                  }`}
                >
                  {labels[k]} {sortKey === k ? (sortAsc ? "↑" : "↓") : ""}
                </button>
              );
            })}
          </div>
        </div>

        {/* 注釈・表記ルール: シート生指摘パネル（NGタブのみ） */}
        {activeTab === "ng" && filterCategory === "注釈・表記ルール" && (
          <div className="rounded-xl border border-teal-500/30 bg-teal-500/5 p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold text-teal-300">
                ✏️ シートの注釈指摘（生データ）
              </h2>
              <div className="flex gap-2 items-center">
                <select
                  onChange={(e) => {
                    if (e.target.value) loadAnnotations(e.target.value);
                  }}
                  className="bg-gray-900 text-white border border-teal-500/30 rounded-lg px-3 py-1.5 text-xs focus:outline-none"
                  style={{ colorScheme: "dark" }}
                  defaultValue=""
                >
                  <option value="">案件を選んで読み込む</option>
                  {projects.filter((p) => p.sheetUrl).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.clientName ? `${p.clientName} / ` : ""}{p.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {annotationLoading && (
              <div className="text-sm text-gray-400 text-center py-4">読み込み中...</div>
            )}
            {annotationError && (
              <div className="text-sm text-red-400 py-2">❌ {annotationError}</div>
            )}
            {!annotationLoading && annotations.length === 0 && !annotationError && (
              <div className="text-xs text-gray-500">
                案件を選択するとシートから注釈関連の備考を一覧表示します（AIなし・キーワード検索）
              </div>
            )}
            {annotations.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs text-gray-500 mb-2">{annotations.reduce((s, g) => s + g.count, 0)} 件ヒット（{annotations.length} 種類）</div>
                {annotations.map((group, idx) => (
                  <div
                    key={idx}
                    className="bg-black/20 rounded-lg p-3 border border-teal-500/10"
                  >
                    <div className="flex items-start gap-3">
                      <span className="text-xs bg-teal-500/20 text-teal-400 font-mono flex-shrink-0 mt-0.5 px-1.5 py-0.5 rounded">
                        {group.count}回
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-white mb-1">{group.key}</div>
                        {group.variants.length > 1 && (
                          <div className="flex flex-wrap gap-1 mb-1">
                            {group.variants.map((v, i) => (
                              <span key={i} className="text-xs bg-gray-700/50 text-gray-400 px-1.5 py-0.5 rounded">
                                {v}
                              </span>
                            ))}
                            {group.count > group.variants.length && (
                              <span className="text-xs text-gray-600">他バリエーションあり</span>
                            )}
                          </div>
                        )}
                        <div className="text-xs text-gray-500">
                          {group.examples.map((ex, i) => (
                            <span key={i} className="mr-3">
                              {ex.sheetName && <span className="text-gray-600">{ex.sheetName}/</span>}{ex.rowNum}行
                              {ex.adText && <span className="text-gray-600 ml-1">「{ex.adText.slice(0, 30)}{ex.adText.length > 30 ? "…" : ""}」</span>}
                            </span>
                          ))}
                          {group.count > group.examples.length && (
                            <span className="text-gray-600">他{group.count - group.examples.length}件</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* NG事例一覧 */}
        {activeTab === "ng" && (
          loading ? (
            <div className="text-center py-16 text-gray-500">読み込み中...</div>
          ) : sortedNg.length === 0 ? (
            <div className="text-center py-16 text-gray-500">
              <div className="text-5xl mb-4">📋</div>
              <p className="text-lg mb-2">NGレギュレーションがまだ登録されていません</p>
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
              <div className="text-xs text-gray-500 px-1">{sortedNg.length} 件表示</div>
              {sortedNg.map((entry) => {
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
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (confirm("このNG事例を削除しますか？")) {
                                deleteNgCase(entry.projectId, entry.id);
                              }
                            }}
                            className="text-xs text-gray-600 hover:text-red-400 transition-colors px-2 py-1 rounded hover:bg-red-500/10"
                          >
                            削除
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )
        )}

        {/* OK事例一覧 */}
        {activeTab === "ok" && (
          loading ? (
            <div className="text-center py-16 text-gray-500">読み込み中...</div>
          ) : sortedOk.length === 0 ? (
            <div className="text-center py-16 text-gray-500">
              <div className="text-5xl mb-4">✅</div>
              <p className="text-lg mb-2">OK事例がまだ蓄積されていません</p>
              <p className="text-sm text-gray-600 max-w-md mx-auto">
                CR提出シートを同期すると、2次CL通過済みの表現や備考欄の承認情報からOK事例を自動抽出します。
                またチェック履歴から手動でOK事例として登録することもできます。
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="text-xs text-gray-500 px-1">{sortedOk.length} 件表示</div>
              {sortedOk.map((entry) => {
                const isExpanded = expandedId === entry.id;
                return (
                  <div
                    key={entry.id}
                    className="rounded-xl border border-green-500/20 bg-green-500/5 overflow-hidden"
                  >
                    <div
                      className="flex items-start gap-3 p-4 cursor-pointer hover:bg-white/5 transition-colors"
                      onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                    >
                      <span className="text-lg mt-0.5 flex-shrink-0">✅</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="text-xs font-bold px-2 py-0.5 rounded-full border bg-green-500/10 text-green-300 border-green-500/20">
                            OK事例
                          </span>
                          <span className="text-xs text-gray-500">
                            {entry.clientName && `${entry.clientName} / `}
                            {entry.projectName}
                          </span>
                        </div>
                        <div className="font-semibold text-white">{entry.title}</div>
                        {entry.quote && (
                          <div className="text-sm text-green-300 mt-0.5 font-mono">
                            「{entry.quote}」
                          </div>
                        )}
                        {entry.mediaDescription && (
                          <div className="text-xs text-teal-300/80 mt-0.5 italic">
                            📹 {entry.mediaDescription}
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
                        {entry.mediaDescription && (
                          <div className="text-sm text-teal-300/80 mb-2 italic">
                            📹 素材説明: {entry.mediaDescription}
                          </div>
                        )}
                        <div className="text-sm text-gray-300 whitespace-pre-wrap">
                          {entry.description}
                        </div>
                        <div className="flex items-center justify-between mt-3 text-xs text-gray-500">
                          <span>
                            登録日:{" "}
                            {new Date(entry.addedAt).toLocaleDateString("ja-JP")}
                          </span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (confirm("このOK事例を削除しますか？")) {
                                deleteAllowedCase(entry.projectId, entry.id);
                              }
                            }}
                            className="text-xs text-gray-600 hover:text-red-400 transition-colors px-2 py-1 rounded hover:bg-red-500/10"
                          >
                            削除
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )
        )}
      </div>
    </div>
  );
}
