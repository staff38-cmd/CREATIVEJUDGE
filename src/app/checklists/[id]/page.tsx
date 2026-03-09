"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ChecklistSession, CheckItemDef, CheckResult } from "@/lib/types";
import { getChecklistItems } from "@/lib/checklistTemplates";

const STATUS_BADGE: Record<
  ChecklistSession["status"],
  { label: string; className: string }
> = {
  draft: {
    label: "下書き",
    className: "bg-gray-500/20 text-gray-400 border border-gray-500/30",
  },
  "self-checked": {
    label: "セルフチェック済",
    className: "bg-blue-500/20 text-blue-400 border border-blue-500/30",
  },
  "review-pending": {
    label: "レビュー待ち",
    className: "bg-yellow-500/20 text-yellow-400 border border-yellow-500/30",
  },
  approved: {
    label: "承認済",
    className: "bg-green-500/20 text-green-400 border border-green-500/30",
  },
  rejected: {
    label: "差し戻し",
    className: "bg-red-500/20 text-red-400 border border-red-500/30",
  },
};

const CATEGORY_COLORS: Record<CheckItemDef["category"], string> = {
  薬機法: "bg-red-500/20 text-red-300 border-red-500/30",
  景品表示法: "bg-orange-500/20 text-orange-300 border-orange-500/30",
  ステマ規制: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
  運用: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  媒体: "bg-purple-500/20 text-purple-300 border-purple-500/30",
};

export default function ChecklistDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [session, setSession] = useState<ChecklistSession | null>(null);
  const [items, setItems] = useState<CheckItemDef[]>([]);
  const [results, setResults] = useState<Record<string, CheckResult>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [reviewerName, setReviewerName] = useState("");
  const [sessionNote, setSessionNote] = useState("");

  // debounce timer ref
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetch(`/api/checklists/${id}`)
      .then((r) => {
        if (!r.ok) {
          router.push("/checklists");
          return null;
        }
        return r.json();
      })
      .then((data: ChecklistSession | null) => {
        if (!data) return;
        setSession(data);
        setReviewerName(data.reviewerName ?? "");
        setSessionNote(data.note ?? "");

        const checkItems = getChecklistItems(data.crType, data.media);
        setItems(checkItems);

        // CheckResults を itemId をキーにしたマップに変換
        const resultMap: Record<string, CheckResult> = {};
        for (const item of checkItems) {
          const existing = data.checkResults.find((r) => r.itemId === item.id);
          resultMap[item.id] = existing ?? { itemId: item.id, status: "pending" };
        }
        setResults(resultMap);
        setLoading(false);
      });
  }, [id, router]);

  // 自動保存（debounce 1.5秒）
  const scheduleSave = useCallback(
    (updatedResults: Record<string, CheckResult>) => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(async () => {
        setSaving(true);
        await fetch(`/api/checklists/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ checkResults: Object.values(updatedResults) }),
        });
        setSaving(false);
      }, 1500);
    },
    [id]
  );

  function handleStatusChange(itemId: string, status: CheckResult["status"]) {
    const updated = {
      ...results,
      [itemId]: { ...results[itemId], status },
    };
    setResults(updated);
    scheduleSave(updated);
  }

  function handleNoteChange(itemId: string, note: string) {
    const updated = {
      ...results,
      [itemId]: { ...results[itemId], note },
    };
    setResults(updated);
    scheduleSave(updated);
  }

  async function saveNow(extra?: Partial<ChecklistSession>) {
    setSaving(true);
    const payload: Record<string, unknown> = {
      checkResults: Object.values(results),
      ...extra,
    };
    const res = await fetch(`/api/checklists/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const updated = await res.json();
    setSession(updated);
    setSaving(false);
    return updated as ChecklistSession;
  }

  async function handleSelfCheck() {
    await saveNow({ status: "self-checked" });
  }

  async function handleApprove() {
    const currentNgCount = Object.values(results).filter((r) => r.status === "ng").length;
    const newStatus = currentNgCount > 0 ? "rejected" : "approved";
    await saveNow({
      status: newStatus,
      reviewerName: reviewerName.trim() || undefined,
    });
  }

  async function handleSaveNote() {
    await saveNow({ note: sessionNote });
  }

  if (loading) {
    return <div className="text-center py-20 text-gray-500">読み込み中...</div>;
  }
  if (!session) return null;

  const resultList = Object.values(results);
  const okCount = resultList.filter((r) => r.status === "ok").length;
  const ngCount = resultList.filter((r) => r.status === "ng").length;
  const pendingCount = resultList.filter((r) => r.status === "pending").length;
  const total = items.length;
  const checkedCount = okCount + ngCount;
  const progressPct = total > 0 ? Math.round((checkedCount / total) * 100) : 0;
  const allConfirmed = pendingCount === 0;
  const noNg = ngCount === 0;
  const badge = STATUS_BADGE[session.status];

  // カテゴリ別にグループ化
  const categories = Array.from(new Set(items.map((i) => i.category)));

  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      {/* Back */}
      <Link
        href="/checklists"
        className="text-sm text-gray-500 hover:text-gray-300 transition-colors mb-6 inline-flex items-center gap-1"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        チェックリスト一覧
      </Link>

      {/* Header */}
      <div className="mb-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-black mb-1">
              {session.projectName ?? "案件なし"}
            </h1>
            <div className="flex items-center gap-2 flex-wrap mt-1">
              <span className="text-xs px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-300 border border-violet-500/30">
                {session.media}
              </span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-pink-500/20 text-pink-300 border border-pink-500/30">
                {session.crType}
              </span>
              <span className={`text-xs px-2.5 py-1 rounded-full font-bold ${badge.className}`}>
                {badge.label}
              </span>
            </div>
            <p className="text-sm text-gray-500 mt-2">
              担当: {session.checkerName}
              {session.reviewerName && ` / レビュー: ${session.reviewerName}`}
            </p>
          </div>
          <div className="text-right text-sm text-gray-500">
            {saving ? (
              <span className="text-violet-400 animate-pulse">保存中...</span>
            ) : (
              <span>自動保存ON</span>
            )}
          </div>
        </div>
      </div>

      {/* Progress */}
      <div className="p-4 rounded-2xl border border-white/10 bg-white/5 mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold">進捗</span>
          <span className="text-sm text-gray-400">{checkedCount} / {total} 確認済み ({progressPct}%)</span>
        </div>
        <div className="h-3 bg-white/10 rounded-full overflow-hidden mb-3">
          <div
            className="h-full bg-gradient-to-r from-violet-500 to-pink-500 rounded-full transition-all duration-300"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <div className="flex gap-4 text-sm">
          <span className="text-green-400">OK: {okCount}</span>
          <span className="text-red-400">NG: {ngCount}</span>
          <span className="text-gray-500">未確認: {pendingCount}</span>
        </div>
      </div>

      {/* Status Banners */}
      {allConfirmed && noNg && (
        <div className="p-4 rounded-2xl border border-green-500/30 bg-green-500/10 mb-6 flex items-center gap-3">
          <span className="text-2xl">🟢</span>
          <div>
            <p className="font-bold text-green-400">提出可能です</p>
            <p className="text-sm text-green-400/70">全項目確認済みで、NGはありません。</p>
          </div>
        </div>
      )}
      {ngCount > 0 && (
        <div className="p-4 rounded-2xl border border-red-500/30 bg-red-500/10 mb-6 flex items-center gap-3">
          <span className="text-2xl">⚠️</span>
          <div>
            <p className="font-bold text-red-400">NG項目が {ngCount} 件あります</p>
            <p className="text-sm text-red-400/70">NG項目を修正・対応してから提出してください。</p>
          </div>
        </div>
      )}

      {/* Check Items by Category */}
      {categories.map((category) => {
        const categoryItems = items.filter((i) => i.category === category);
        const colorClass = CATEGORY_COLORS[category];
        return (
          <div key={category} className="mb-6">
            <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border mb-3 ${colorClass}`}>
              {category}
            </div>
            <div className="space-y-3">
              {categoryItems.map((item) => {
                const result = results[item.id] ?? { itemId: item.id, status: "pending" };
                return (
                  <CheckItemRow
                    key={item.id}
                    item={item}
                    result={result}
                    onStatusChange={handleStatusChange}
                    onNoteChange={handleNoteChange}
                  />
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Session Note */}
      <div className="p-5 rounded-2xl border border-white/10 bg-white/5 mb-6">
        <label className="block text-sm font-semibold mb-2 text-gray-300">
          全体メモ・備考
        </label>
        <textarea
          value={sessionNote}
          onChange={(e) => setSessionNote(e.target.value)}
          rows={3}
          placeholder="気になる点・特記事項など"
          className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-violet-500/50 text-white placeholder-gray-600 resize-none"
        />
        <button
          onClick={handleSaveNote}
          disabled={saving}
          className="mt-2 px-4 py-1.5 rounded-lg text-sm font-medium bg-white/10 hover:bg-white/15 transition-colors disabled:opacity-40"
        >
          メモを保存
        </button>
      </div>

      {/* Action Buttons */}
      <div className="space-y-4 p-5 rounded-2xl border border-white/10 bg-white/5">
        <h2 className="font-bold text-sm text-gray-300">ステータス操作</h2>

        {/* Self Check */}
        {(session.status === "draft" || session.status === "self-checked") && (
          <button
            onClick={handleSelfCheck}
            disabled={saving}
            className="w-full py-3 rounded-xl font-semibold bg-gradient-to-r from-blue-500 to-violet-500 hover:from-blue-600 hover:to-violet-600 transition-all disabled:opacity-40"
          >
            セルフチェック完了としてマーク
          </button>
        )}

        {/* Reviewer Approval */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-400">
            二重チェック者名（任意）
          </label>
          <input
            type="text"
            value={reviewerName}
            onChange={(e) => setReviewerName(e.target.value)}
            placeholder="例：鈴木 花子"
            className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-violet-500/50 text-white placeholder-gray-600"
          />
          <button
            onClick={handleApprove}
            disabled={saving || session.status === "draft"}
            className={`w-full py-3 rounded-xl font-semibold transition-all disabled:opacity-40 ${
              ngCount > 0
                ? "bg-gradient-to-r from-red-500 to-orange-500 hover:from-red-600 hover:to-orange-600"
                : "bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600"
            }`}
          >
            {saving
              ? "保存中..."
              : ngCount > 0
              ? "差し戻し（NG項目あり）"
              : "承認"}
          </button>
          {session.status === "draft" && (
            <p className="text-xs text-gray-500 text-center">
              先にセルフチェック完了をマークしてください
            </p>
          )}
        </div>
      </div>

      <p className="text-xs text-gray-600 text-center mt-6">
        作成: {new Date(session.createdAt).toLocaleString("ja-JP")} /
        更新: {new Date(session.updatedAt).toLocaleString("ja-JP")}
      </p>
    </div>
  );
}

function CheckItemRow({
  item,
  result,
  onStatusChange,
  onNoteChange,
}: {
  item: CheckItemDef;
  result: CheckResult;
  onStatusChange: (itemId: string, status: CheckResult["status"]) => void;
  onNoteChange: (itemId: string, note: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const statusColors: Record<CheckResult["status"], string> = {
    ok: "border-green-500/40 bg-green-500/5",
    ng: "border-red-500/40 bg-red-500/5",
    pending: "border-white/10 bg-white/5",
  };

  return (
    <div
      className={`rounded-2xl border p-4 transition-all ${statusColors[result.status]}`}
    >
      <div className="flex items-start gap-3">
        {/* Status indicator */}
        <div className="flex-shrink-0 mt-0.5">
          {result.status === "ok" ? (
            <span className="text-green-400 text-lg">✅</span>
          ) : result.status === "ng" ? (
            <span className="text-red-400 text-lg">❌</span>
          ) : (
            <span className="text-gray-600 text-lg">⬜</span>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-2 flex-wrap">
            <p className="text-sm font-medium flex-1">{item.text}</p>
            {item.required && (
              <span className="text-xs text-red-400 flex-shrink-0">必須</span>
            )}
          </div>

          {item.detail && (
            <button
              onClick={() => setExpanded((v) => !v)}
              className="text-xs text-gray-500 hover:text-gray-300 mt-1 transition-colors"
            >
              {expanded ? "▲ 詳細を閉じる" : "▼ 詳細を表示"}
            </button>
          )}
          {expanded && item.detail && (
            <p className="text-xs text-gray-400 mt-2 p-3 rounded-lg bg-white/5 border border-white/10 leading-relaxed">
              {item.detail}
            </p>
          )}

          {/* Note field (shown when NG or when there's existing note) */}
          {(result.status === "ng" || result.note) && (
            <textarea
              value={result.note ?? ""}
              onChange={(e) => onNoteChange(item.id, e.target.value)}
              rows={2}
              placeholder="NG理由・対応内容を記載してください"
              className="mt-2 w-full bg-black/40 border border-red-500/20 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-red-500/50 text-white placeholder-gray-600 resize-none"
            />
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex-shrink-0 flex items-center gap-1.5">
          <button
            onClick={() => onStatusChange(item.id, "ok")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              result.status === "ok"
                ? "bg-green-500 text-white"
                : "bg-white/5 text-gray-500 hover:bg-green-500/20 hover:text-green-400"
            }`}
          >
            OK
          </button>
          <button
            onClick={() => onStatusChange(item.id, "ng")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              result.status === "ng"
                ? "bg-red-500 text-white"
                : "bg-white/5 text-gray-500 hover:bg-red-500/20 hover:text-red-400"
            }`}
          >
            NG
          </button>
          <button
            onClick={() => onStatusChange(item.id, "pending")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              result.status === "pending"
                ? "bg-gray-500 text-white"
                : "bg-white/5 text-gray-500 hover:bg-gray-500/20 hover:text-gray-400"
            }`}
          >
            未
          </button>
        </div>
      </div>
    </div>
  );
}
