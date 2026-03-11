"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { MediaType, CrType, Project } from "@/lib/types";

const MEDIA_OPTIONS: MediaType[] = ["Meta", "Google", "ByteDance", "LINE", "SmartNews", "YDA"];
const CR_TYPE_OPTIONS: CrType[] = ["バナー", "動画", "TD", "入稿"];

export default function NewChecklistPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState<string>("");
  const [media, setMedia] = useState<MediaType | "">("");
  const [crType, setCrType] = useState<CrType | "">("");
  const [checkerName, setCheckerName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/projects")
      .then((r) => r.json())
      .then((data: Project[]) => setProjects(data));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!media || !crType || !checkerName.trim()) {
      setError("媒体・CR種別・担当者名は必須です");
      return;
    }
    setError("");
    setSubmitting(true);

    const body: Record<string, string> = {
      media,
      crType,
      checkerName: checkerName.trim(),
    };
    if (projectId) body.projectId = projectId;

    const res = await fetch("/api/checklists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      setError("作成に失敗しました。もう一度お試しください。");
      setSubmitting(false);
      return;
    }

    const session = await res.json();
    router.push(`/checklists/${session.id}`);
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-12">
      {/* Header */}
      <div className="mb-8">
        <Link
          href="/checklists"
          className="text-sm text-gray-500 hover:text-gray-300 transition-colors mb-4 inline-flex items-center gap-1"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          チェックリスト一覧
        </Link>
        <h1 className="text-3xl font-black mb-2">新規チェックリスト作成</h1>
        <p className="text-gray-400">媒体・CR種別に応じたチェック項目が自動生成されます</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* 案件選択 */}
        <div className="p-5 rounded-2xl border border-white/10 bg-white/5">
          <label className="block text-sm font-semibold mb-3 text-gray-300">
            案件選択
            <span className="ml-2 text-xs font-normal text-gray-500">（任意）</span>
          </label>
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-violet-500/50 text-white"
          >
            <option value="">案件なし</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.clientName ? ` （${p.clientName}）` : ""}
              </option>
            ))}
          </select>
        </div>

        {/* 媒体選択 */}
        <div className="p-5 rounded-2xl border border-white/10 bg-white/5">
          <label className="block text-sm font-semibold mb-3 text-gray-300">
            媒体
            <span className="ml-2 text-xs font-normal text-red-400">必須</span>
          </label>
          <div className="flex flex-wrap gap-2">
            {MEDIA_OPTIONS.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMedia(m)}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-all border ${
                  media === m
                    ? "bg-violet-500 border-violet-400 text-white"
                    : "bg-white/5 border-white/10 text-gray-400 hover:border-violet-500/40 hover:text-gray-200"
                }`}
              >
                {m}
              </button>
            ))}
          </div>
          {media === "ByteDance" && (
            <p className="mt-2 text-xs text-yellow-400/80 bg-yellow-500/10 border border-yellow-500/20 rounded-lg px-3 py-2">
              ByteDanceは他媒体と審査基準が異なる場合があります。固有の追加チェック項目が含まれます。
            </p>
          )}
        </div>

        {/* CR種別選択 */}
        <div className="p-5 rounded-2xl border border-white/10 bg-white/5">
          <label className="block text-sm font-semibold mb-3 text-gray-300">
            CR種別
            <span className="ml-2 text-xs font-normal text-red-400">必須</span>
          </label>
          <div className="flex flex-wrap gap-2">
            {CR_TYPE_OPTIONS.map((ct) => (
              <button
                key={ct}
                type="button"
                onClick={() => setCrType(ct)}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-all border ${
                  crType === ct
                    ? "bg-pink-500 border-pink-400 text-white"
                    : "bg-white/5 border-white/10 text-gray-400 hover:border-pink-500/40 hover:text-gray-200"
                }`}
              >
                {ct}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-gray-500">
            TD = テキスト広告（タイトル・ディスクリプション）
          </p>
        </div>

        {/* 担当者名 */}
        <div className="p-5 rounded-2xl border border-white/10 bg-white/5">
          <label className="block text-sm font-semibold mb-3 text-gray-300">
            チェック担当者名
            <span className="ml-2 text-xs font-normal text-red-400">必須</span>
          </label>
          <input
            type="text"
            value={checkerName}
            onChange={(e) => setCheckerName(e.target.value)}
            placeholder="例：山田 太郎"
            className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-violet-500/50 text-white placeholder-gray-600"
          />
        </div>

        {/* Error */}
        {error && (
          <div className="p-4 rounded-xl border border-red-500/30 bg-red-500/10 text-red-400 text-sm">
            {error}
          </div>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={submitting || !media || !crType || !checkerName.trim()}
          className="w-full py-4 rounded-2xl font-bold text-lg bg-gradient-to-r from-violet-500 to-pink-500 hover:from-violet-600 hover:to-pink-600 transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-violet-500/20"
        >
          {submitting ? "作成中..." : "チェック開始"}
        </button>
      </form>
    </div>
  );
}
