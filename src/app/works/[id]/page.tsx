"use client";

import { useEffect, useState, use } from "react";
import Image from "next/image";
import Link from "next/link";
import { Work, ComplianceIssue, RiskLevel, CONTENT_TYPE_LABELS, RISK_LEVEL_LABELS } from "@/lib/types";

const RISK_STYLES: Record<RiskLevel, { border: string; bg: string; badge: string; icon: string }> = {
  violation: {
    border: "border-red-500/50",
    bg: "bg-red-500/10",
    badge: "bg-red-500 text-white",
    icon: "🚫",
  },
  warning: {
    border: "border-yellow-500/50",
    bg: "bg-yellow-500/10",
    badge: "bg-yellow-500 text-black",
    icon: "⚠️",
  },
  caution: {
    border: "border-blue-400/40",
    bg: "bg-blue-400/10",
    badge: "bg-blue-400 text-white",
    icon: "💡",
  },
  ok: {
    border: "border-green-500/40",
    bg: "bg-green-500/10",
    badge: "bg-green-500 text-white",
    icon: "✅",
  },
};

const STATUS_CONFIG = {
  ng: { label: "NG — 違反あり", color: "text-red-400", bg: "bg-red-500/10 border-red-500/30", icon: "🚫" },
  warning: { label: "要注意 — 警告あり", color: "text-yellow-400", bg: "bg-yellow-500/10 border-yellow-500/30", icon: "⚠️" },
  ok: { label: "問題なし", color: "text-green-400", bg: "bg-green-500/10 border-green-500/30", icon: "✅" },
};

export default function WorkDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [work, setWork] = useState<Work | null>(null);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");
  const [expandedIssue, setExpandedIssue] = useState<number | null>(null);

  async function fetchWork() {
    const res = await fetch(`/api/works/${id}`);
    if (res.ok) {
      setWork(await res.json());
    }
    setLoading(false);
  }

  useEffect(() => {
    fetchWork();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function runCheck() {
    setChecking(true);
    setError("");
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workId: id }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "チェックに失敗しました");
      }
      await fetchWork();
    } catch (err) {
      setError(err instanceof Error ? err.message : "チェックに失敗しました");
    } finally {
      setChecking(false);
    }
  }

  if (loading) return <div className="text-center py-20 text-gray-500">読み込み中...</div>;

  if (!work) {
    return (
      <div className="text-center py-20">
        <p className="text-gray-400 mb-4">コンテンツが見つかりません</p>
        <Link href="/works" className="text-violet-400 hover:underline">一覧に戻る</Link>
      </div>
    );
  }

  const isImage = work.fileType?.startsWith("image/");
  const result = work.complianceResult;
  const violations = result?.issues.filter((i) => i.level === "violation") ?? [];
  const warnings = result?.issues.filter((i) => i.level === "warning") ?? [];
  const cautions = result?.issues.filter((i) => i.level === "caution") ?? [];

  return (
    <div className="max-w-5xl mx-auto px-4 py-12">
      <Link href="/works" className="text-sm text-gray-500 hover:text-gray-300 transition-colors mb-6 inline-flex items-center gap-1">
        ← 一覧に戻る
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mt-4">
        {/* Left sidebar */}
        <div className="lg:col-span-1 space-y-5">
          {/* Preview */}
          {work.filePath && (
            <div className="relative aspect-video rounded-2xl overflow-hidden bg-black/30 border border-white/10">
              {isImage ? (
                <Image src={work.filePath} alt={work.title} fill className="object-contain" unoptimized />
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                  <span className="text-5xl">{work.fileType?.startsWith("video/") ? "🎬" : "📄"}</span>
                  <span className="text-xs text-gray-500 px-3 text-center">{work.fileName}</span>
                  <a href={work.filePath} download={work.fileName} className="text-xs text-violet-400 hover:underline">
                    ダウンロード
                  </a>
                </div>
              )}
            </div>
          )}

          {/* Text preview */}
          {work.textContent && (
            <div className="rounded-2xl bg-white/5 border border-white/10 p-4 max-h-48 overflow-y-auto">
              <p className="text-xs text-gray-500 mb-2">チェック対象テキスト</p>
              <p className="text-xs text-gray-300 whitespace-pre-wrap leading-relaxed">{work.textContent}</p>
            </div>
          )}

          {/* Meta info */}
          <div className="rounded-2xl bg-white/5 border border-white/10 p-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">種別</span>
              <span>{CONTENT_TYPE_LABELS[work.contentType]}</span>
            </div>
            {work.targetCategory && (
              <div className="flex justify-between">
                <span className="text-gray-500">カテゴリ</span>
                <span className="text-right text-xs">{work.targetCategory}</span>
              </div>
            )}
            {work.fileSize && (
              <div className="flex justify-between">
                <span className="text-gray-500">サイズ</span>
                <span>{(work.fileSize / 1024 / 1024).toFixed(2)} MB</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-gray-500">登録日</span>
              <span>{new Date(work.submittedAt).toLocaleDateString("ja-JP")}</span>
            </div>
            {result && (
              <div className="flex justify-between">
                <span className="text-gray-500">チェック日時</span>
                <span className="text-xs">{new Date(result.checkedAt).toLocaleString("ja-JP")}</span>
              </div>
            )}
          </div>

          {/* Custom regulations */}
          {work.customRegulations && (
            <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
              <p className="text-xs text-gray-500 mb-2">追加レギュレーション</p>
              <p className="text-xs text-gray-300 whitespace-pre-wrap">{work.customRegulations}</p>
            </div>
          )}
        </div>

        {/* Main content */}
        <div className="lg:col-span-2 space-y-6">
          <div>
            <h1 className="text-2xl font-black mb-1">{work.title}</h1>
          </div>

          {/* Overall status */}
          {result ? (
            <div className={`p-5 rounded-2xl border ${STATUS_CONFIG[result.overallStatus].bg}`}>
              <div className="flex items-center gap-3 mb-3">
                <span className="text-3xl">{STATUS_CONFIG[result.overallStatus].icon}</span>
                <span className={`text-xl font-black ${STATUS_CONFIG[result.overallStatus].color}`}>
                  {STATUS_CONFIG[result.overallStatus].label}
                </span>
              </div>
              <p className="text-sm text-gray-300 leading-relaxed">{result.summary}</p>
              <div className="flex gap-4 mt-4 text-sm">
                <span className="text-red-400 font-bold">🚫 違反 {violations.length}件</span>
                <span className="text-yellow-400 font-bold">⚠️ 警告 {warnings.length}件</span>
                <span className="text-blue-400 font-bold">💡 注意 {cautions.length}件</span>
              </div>
            </div>
          ) : (
            <div className="p-5 rounded-2xl border border-white/10 bg-white/5">
              <p className="text-gray-400 mb-4">まだチェックが実行されていません</p>
              {error && (
                <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
                  {error}
                </div>
              )}
              <button
                onClick={runCheck}
                disabled={checking}
                className="w-full py-3 rounded-xl font-bold bg-gradient-to-r from-violet-500 to-pink-500 hover:from-violet-600 hover:to-pink-600 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
              >
                {checking ? (
                  <><span className="inline-block animate-spin">⚙️</span> AIチェック中...</>
                ) : (
                  <>🔍 規制チェックを実行</>
                )}
              </button>
            </div>
          )}

          {/* Re-check button */}
          {result && (
            <button
              onClick={runCheck}
              disabled={checking}
              className="w-full py-2.5 rounded-xl text-sm font-semibold border border-white/20 hover:border-violet-500/50 hover:text-violet-300 disabled:opacity-50 transition-all"
            >
              {checking ? "チェック中..." : "🔄 再チェック"}
            </button>
          )}

          {/* Issues list */}
          {result && result.issues.length > 0 && (
            <div className="space-y-3">
              <h2 className="font-bold text-lg">指摘事項</h2>
              {result.issues.map((issue, idx) => (
                <IssueCard
                  key={idx}
                  issue={issue}
                  index={idx}
                  expanded={expandedIssue === idx}
                  onToggle={() => setExpandedIssue(expandedIssue === idx ? null : idx)}
                />
              ))}
            </div>
          )}

          {result && result.issues.length === 0 && (
            <div className="text-center py-8 rounded-2xl border border-green-500/20 bg-green-500/5">
              <div className="text-4xl mb-2">✅</div>
              <p className="font-bold text-green-400">指摘事項なし</p>
              <p className="text-sm text-gray-500 mt-1">チェック対象の規制に対して問題は見つかりませんでした</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function IssueCard({
  issue,
  index,
  expanded,
  onToggle,
}: {
  issue: ComplianceIssue;
  index: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  const style = RISK_STYLES[issue.level];

  return (
    <div className={`rounded-2xl border ${style.border} ${style.bg} overflow-hidden`}>
      <button
        onClick={onToggle}
        className="w-full text-left p-4 flex items-start gap-3"
      >
        <span className="text-xl mt-0.5 flex-shrink-0">{style.icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${style.badge}`}>
              {RISK_LEVEL_LABELS[issue.level]}
            </span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-white/10 text-gray-300">
              {issue.category}
            </span>
            {issue.clause && (
              <span className="text-xs text-gray-500">{issue.clause}</span>
            )}
          </div>
          <p className="font-semibold text-sm">{issue.title}</p>
        </div>
        <span className="text-gray-500 flex-shrink-0 mt-0.5">{expanded ? "▲" : "▼"}</span>
      </button>

      {expanded && (
        <div className="px-4 pb-4 pt-0 space-y-3 border-t border-white/10">
          <div>
            <p className="text-xs text-gray-500 mb-1">詳細</p>
            <p className="text-sm text-gray-300 leading-relaxed">{issue.description}</p>
          </div>
          {issue.quote && (
            <div>
              <p className="text-xs text-gray-500 mb-1">問題のある表現</p>
              <blockquote className="text-sm text-red-300 bg-red-500/10 rounded-lg px-3 py-2 border-l-2 border-red-400">
                「{issue.quote}」
              </blockquote>
            </div>
          )}
          <div>
            <p className="text-xs text-gray-500 mb-1">改善案</p>
            <p className="text-sm text-green-300 leading-relaxed bg-green-500/10 rounded-lg px-3 py-2">
              {issue.suggestion}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
