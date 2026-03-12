"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { Client, Project } from "@/lib/types";

export default function ClientSettingsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [client, setClient] = useState<Client | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [name, setName] = useState("");
  const [companyRegulations, setCompanyRegulations] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch(`/api/clients/${id}`).then((r) => {
        if (!r.ok) { setNotFound(true); return null; }
        return r.json();
      }),
      fetch("/api/projects").then((r) => r.json()),
    ]).then(([clientData, projectsData]) => {
      if (!clientData) { setLoading(false); return; }
      setClient(clientData);
      setName(clientData.name);
      setCompanyRegulations(clientData.companyRegulations ?? "");
      setProjects((projectsData as Project[]).filter((p) => p.clientId === id));
      setLoading(false);
    });
  }, [id]);

  async function save() {
    setSaving(true);
    const res = await fetch(`/api/clients/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, companyRegulations }),
    });
    if (res.ok) {
      const updated = await res.json();
      setClient(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
    setSaving(false);
  }

  if (loading) return <div className="text-center py-20 text-gray-500">読み込み中...</div>;
  if (notFound) return (
    <div className="text-center py-20 text-gray-500">
      <p className="mb-4">クライアントが見つかりません</p>
      <Link href="/clients" className="text-violet-400 hover:underline">クライアント一覧に戻る</Link>
    </div>
  );

  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <Link href="/clients" className="text-gray-500 hover:text-gray-300 text-sm transition-colors">
        ← クライアント一覧
      </Link>
      <h1 className="text-3xl font-black mt-3 mb-8">{client?.name}</h1>

      <div className="space-y-8">
        {/* 基本情報 */}
        <section className="p-6 rounded-2xl border border-white/10 bg-white/5">
          <h2 className="text-lg font-bold mb-4">基本情報</h2>
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">クライアント名 *</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 focus:border-violet-500 focus:outline-none transition-colors"
              />
            </div>
          </div>
          <button
            onClick={save}
            disabled={saving || !name.trim()}
            className="mt-4 px-5 py-2 rounded-xl text-sm font-semibold bg-violet-500 hover:bg-violet-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saved ? "✓ 保存しました" : saving ? "保存中..." : "保存"}
          </button>
        </section>

        {/* クライアント共通レギュレーション */}
        <section className="p-6 rounded-2xl border border-blue-500/20 bg-blue-500/5">
          <div className="flex items-start justify-between mb-2">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30 font-bold">全商材共通</span>
                <h2 className="text-lg font-bold">クライアント共通レギュレーション</h2>
              </div>
              <p className="text-sm text-gray-400">
                このクライアントの全商材・案件に適用される共通ルール。各商材のAIチェックに自動反映されます。
              </p>
            </div>
            <span className="text-xs px-2 py-1 rounded-full border border-violet-500/30 bg-violet-500/10 text-violet-300 flex-shrink-0">AI参照</span>
          </div>
          <textarea
            value={companyRegulations}
            onChange={(e) => setCompanyRegulations(e.target.value)}
            placeholder={`例:\n- NHK文言禁止\n- 「今だけ」→「今なら」\n- 定期商材認識文言必須\n- リアル内臓・便系画像禁止`}
            rows={8}
            className="w-full mt-4 px-4 py-3 rounded-xl bg-black/30 border border-white/10 focus:border-blue-500 focus:outline-none transition-colors resize-none text-sm font-mono"
          />
          <div className="flex items-center justify-between mt-3">
            <p className="text-xs text-gray-600">{companyRegulations.length} 文字</p>
            <button
              onClick={save}
              disabled={saving}
              className="px-5 py-2 rounded-xl text-sm font-semibold bg-blue-500 hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {saved ? "✓ 保存しました" : saving ? "保存中..." : "保存"}
            </button>
          </div>
        </section>

        {/* 紐付き商材・案件 */}
        <section className="p-6 rounded-2xl border border-white/10 bg-white/5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold">紐付き商材・案件 ({projects.length})</h2>
            <Link
              href={`/projects?clientId=${id}`}
              className="text-xs px-3 py-1.5 rounded-lg border border-white/20 hover:bg-white/5 transition-colors"
            >
              ＋ 案件を追加
            </Link>
          </div>
          {projects.length === 0 ? (
            <p className="text-sm text-gray-600 py-4 text-center">紐付いている案件はありません</p>
          ) : (
            <div className="space-y-2">
              {projects.map((p) => (
                <Link
                  key={p.id}
                  href={`/projects/${p.id}`}
                  className="flex items-center justify-between p-3 rounded-xl border border-white/10 hover:bg-white/5 transition-colors"
                >
                  <span className="text-sm font-medium">{p.name}</span>
                  <span className="text-xs text-gray-500">設定 →</span>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
