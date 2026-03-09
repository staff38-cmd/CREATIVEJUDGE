"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChecklistSummary } from "@/lib/types";

const STATUS_BADGE: Record<
  ChecklistSummary["status"],
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

export default function ChecklistsPage() {
  const [checklists, setChecklists] = useState<ChecklistSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/checklists")
      .then((r) => r.json())
      .then((data) => {
        setChecklists(data);
        setLoading(false);
      });
  }, []);

  function handleDelete(id: string) {
    setChecklists((prev) => prev.filter((c) => c.id !== id));
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-12">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-black mb-1">チェックリスト</h1>
          <p className="text-gray-400">
            {loading ? "読み込み中..." : `${checklists.length} 件`}
          </p>
        </div>
        <Link
          href="/checklists/new"
          className="px-5 py-2.5 rounded-full text-sm font-semibold bg-gradient-to-r from-violet-500 to-pink-500 hover:from-violet-600 hover:to-pink-600 transition-all"
        >
          + 新規作成
        </Link>
      </div>

      {loading ? (
        <div className="text-center py-20 text-gray-500">読み込み中...</div>
      ) : checklists.length === 0 ? (
        <div className="text-center py-20 text-gray-500">
          <p className="text-4xl mb-4">✅</p>
          <p className="mb-6">チェックリストがまだありません</p>
          <Link
            href="/checklists/new"
            className="px-6 py-3 rounded-full font-semibold bg-gradient-to-r from-violet-500 to-pink-500 hover:from-violet-600 hover:to-pink-600 transition-all"
          >
            最初のチェックリストを作成
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {checklists.map((cl) => (
            <ChecklistRow key={cl.id} checklist={cl} onDelete={handleDelete} />
          ))}
        </div>
      )}
    </div>
  );
}

function ChecklistRow({
  checklist,
  onDelete,
}: {
  checklist: ChecklistSummary;
  onDelete: (id: string) => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const badge = STATUS_BADGE[checklist.status];
  const total = checklist.totalItems;
  const okPct = total > 0 ? Math.round((checklist.okCount / total) * 100) : 0;

  async function handleDelete(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm("このチェックリストを削除しますか？")) return;
    setDeleting(true);
    await fetch(`/api/checklists/${checklist.id}`, { method: "DELETE" });
    onDelete(checklist.id);
  }

  return (
    <div className="relative group">
      <Link href={`/checklists/${checklist.id}`}>
        <div className="flex items-center gap-4 p-4 pr-14 rounded-2xl border border-white/10 bg-white/5 hover:border-violet-500/30 hover:bg-white/[0.08] transition-all cursor-pointer">
          {/* Icon */}
          <div className="w-12 h-12 rounded-xl bg-black/30 flex items-center justify-center text-2xl flex-shrink-0">
            ✅
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-bold truncate">
                {checklist.projectName ?? "案件なし"}
              </p>
              <span className="text-xs px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-300 border border-violet-500/30">
                {checklist.media}
              </span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-pink-500/20 text-pink-300 border border-pink-500/30">
                {checklist.crType}
              </span>
            </div>
            <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 flex-wrap">
              <span>担当: {checklist.checkerName}</span>
              {checklist.reviewerName && (
                <span>レビュー: {checklist.reviewerName}</span>
              )}
              <span>{new Date(checklist.createdAt).toLocaleDateString("ja-JP")}</span>
            </div>
            {/* Progress bar */}
            {total > 0 && (
              <div className="mt-2 flex items-center gap-2">
                <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden max-w-[160px]">
                  <div
                    className="h-full bg-gradient-to-r from-violet-500 to-pink-500 rounded-full transition-all"
                    style={{ width: `${okPct}%` }}
                  />
                </div>
                <span className="text-xs text-gray-500">{okPct}%</span>
              </div>
            )}
          </div>

          {/* Status & Counts */}
          <div className="flex-shrink-0 text-right space-y-1">
            <div>
              <span className={`text-xs px-2.5 py-1 rounded-full font-bold ${badge.className}`}>
                {badge.label}
              </span>
            </div>
            <div className="flex justify-end gap-2 text-xs">
              <span className="text-green-400">OK: {checklist.okCount}</span>
              <span className="text-red-400">NG: {checklist.ngCount}</span>
              <span className="text-gray-500">未: {checklist.pendingCount}</span>
            </div>
          </div>
        </div>
      </Link>

      {/* Delete button */}
      <button
        onClick={handleDelete}
        disabled={deleting}
        className="absolute right-3 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 p-2 rounded-lg text-gray-600 hover:text-red-400 hover:bg-red-500/10 transition-all disabled:opacity-30"
        title="削除"
      >
        {deleting ? (
          <span className="text-xs">...</span>
        ) : (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
            />
          </svg>
        )}
      </button>
    </div>
  );
}
