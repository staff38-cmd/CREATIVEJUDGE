"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { WorkSummary, ContentType, CONTENT_TYPE_LABELS } from "@/lib/types";

const ALL = "all";

const STATUS_BADGE = {
  ng: { label: "NG", className: "bg-red-500/20 text-red-400 border border-red-500/30" },
  warning: { label: "要注意", className: "bg-yellow-500/20 text-yellow-400 border border-yellow-500/30" },
  ok: { label: "OK", className: "bg-green-500/20 text-green-400 border border-green-500/30" },
};

export default function WorksPage() {
  const [works, setWorks] = useState<WorkSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>(ALL);
  const [statusFilter, setStatusFilter] = useState<string>(ALL);

  useEffect(() => {
    fetch("/api/works")
      .then((r) => r.json())
      .then((data) => {
        setWorks(data);
        setLoading(false);
      });
  }, []);

  const filtered = works
    .filter((w) => filter === ALL || w.contentType === filter)
    .filter((w) => statusFilter === ALL || w.overallStatus === statusFilter);

  return (
    <div className="max-w-7xl mx-auto px-4 py-12">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-black mb-1">チェック履歴</h1>
          <p className="text-gray-400">{works.length} 件</p>
        </div>
        <Link
          href="/submit"
          className="px-5 py-2.5 rounded-full text-sm font-semibold bg-gradient-to-r from-violet-500 to-pink-500 hover:from-violet-600 hover:to-pink-600 transition-all"
        >
          + 新規チェック
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-4">
        <button
          onClick={() => setFilter(ALL)}
          className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${filter === ALL ? "bg-violet-500 text-white" : "bg-white/5 text-gray-400 hover:bg-white/10"}`}
        >
          すべての種別
        </button>
        {(Object.entries(CONTENT_TYPE_LABELS) as [ContentType, string][]).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${filter === key ? "bg-violet-500 text-white" : "bg-white/5 text-gray-400 hover:bg-white/10"}`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="flex gap-2 mb-8">
        {[ALL, "ng", "warning", "ok"].map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              statusFilter === s
                ? "bg-white/20 text-white"
                : "bg-white/5 text-gray-400 hover:bg-white/10"
            }`}
          >
            {s === ALL ? "すべての状態" : s === "ng" ? "🚫 NG" : s === "warning" ? "⚠️ 要注意" : "✅ OK"}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-20 text-gray-500">読み込み中...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-gray-500">
          <p className="text-4xl mb-4">📋</p>
          <p>チェック済みのコンテンツがありません</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((work) => (
            <WorkRow key={work.id} work={work} />
          ))}
        </div>
      )}
    </div>
  );
}

function WorkRow({ work }: { work: WorkSummary }) {
  const isImage = work.fileType?.startsWith("image/");
  const statusBadge = work.overallStatus ? STATUS_BADGE[work.overallStatus] : null;

  return (
    <Link href={`/works/${work.id}`}>
      <div className="flex items-center gap-4 p-4 rounded-2xl border border-white/10 bg-white/5 hover:border-violet-500/30 hover:bg-white/8 transition-all cursor-pointer">
        {/* Thumbnail */}
        <div className="relative w-14 h-14 rounded-xl overflow-hidden bg-black/30 flex-shrink-0">
          {isImage && work.filePath ? (
            <Image src={work.filePath} alt={work.title} fill className="object-cover" unoptimized />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-2xl">
              {work.contentType === "video"
                ? "🎬"
                : work.contentType === "pdf"
                ? "📄"
                : work.contentType === "lp"
                ? "📰"
                : "📝"}
            </div>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <p className="font-bold truncate">{work.title}</p>
          <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
            <span>{CONTENT_TYPE_LABELS[work.contentType]}</span>
            {work.targetCategory && <span>{work.targetCategory}</span>}
            <span>{new Date(work.submittedAt).toLocaleDateString("ja-JP")}</span>
          </div>
        </div>

        {/* Status */}
        <div className="flex-shrink-0 text-right">
          {statusBadge ? (
            <div>
              <span className={`text-xs px-2.5 py-1 rounded-full font-bold ${statusBadge.className}`}>
                {statusBadge.label}
              </span>
              {work.issueCount > 0 && (
                <div className="flex justify-end gap-2 mt-1.5 text-xs">
                  {work.violationCount > 0 && (
                    <span className="text-red-400">🚫 {work.violationCount}</span>
                  )}
                  {work.warningCount > 0 && (
                    <span className="text-yellow-400">⚠️ {work.warningCount}</span>
                  )}
                </div>
              )}
            </div>
          ) : (
            <span className="text-xs text-gray-600">未チェック</span>
          )}
        </div>
      </div>
    </Link>
  );
}
