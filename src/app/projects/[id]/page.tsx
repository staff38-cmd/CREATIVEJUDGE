"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { v4 as uuidv4 } from "uuid";
import { Project, NgCase, RegulationCategory } from "@/lib/types";

const REGULATION_CATEGORIES: RegulationCategory[] = [
  "薬機法",
  "景品表示法",
  "健康増進法",
  "広告ガイドライン",
  "医師法",
  "カスタム",
];

const CATEGORY_COLOR: Record<RegulationCategory, string> = {
  薬機法: "bg-red-500/20 text-red-300 border-red-500/30",
  景品表示法: "bg-orange-500/20 text-orange-300 border-orange-500/30",
  健康増進法: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
  広告ガイドライン: "bg-purple-500/20 text-purple-300 border-purple-500/30",
  医師法: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  カスタム: "bg-gray-500/20 text-gray-300 border-gray-500/30",
};

export default function ProjectSettingsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // Basic info editing
  const [name, setName] = useState("");
  const [clientName, setClientName] = useState("");
  const [description, setDescription] = useState("");
  const [savingInfo, setSavingInfo] = useState(false);
  const [infoSaved, setInfoSaved] = useState(false);

  // Regulations editing
  const [regulations, setRegulations] = useState("");
  const [savingRegs, setSavingRegs] = useState(false);
  const [regsSaved, setRegsSaved] = useState(false);

  // NG cases
  const [ngCases, setNgCases] = useState<NgCase[]>([]);
  const [showNgForm, setShowNgForm] = useState(false);
  const [ngTitle, setNgTitle] = useState("");
  const [ngDescription, setNgDescription] = useState("");
  const [ngCategory, setNgCategory] = useState<RegulationCategory | "">("");
  const [ngQuote, setNgQuote] = useState("");
  const [addingNg, setAddingNg] = useState(false);

  useEffect(() => {
    fetch(`/api/projects/${id}`)
      .then((r) => {
        if (!r.ok) { setNotFound(true); setLoading(false); return null; }
        return r.json();
      })
      .then((data: Project | null) => {
        if (!data) return;
        setProject(data);
        setName(data.name);
        setClientName(data.clientName ?? "");
        setDescription(data.description ?? "");
        setRegulations(data.regulations ?? "");
        setNgCases(data.ngCases ?? []);
        setLoading(false);
      });
  }, [id]);

  async function saveInfo() {
    setSavingInfo(true);
    const res = await fetch(`/api/projects/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, clientName, description }),
    });
    if (res.ok) {
      const updated = await res.json();
      setProject(updated);
      setInfoSaved(true);
      setTimeout(() => setInfoSaved(false), 2000);
    }
    setSavingInfo(false);
  }

  async function saveRegulations() {
    setSavingRegs(true);
    const res = await fetch(`/api/projects/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ regulations }),
    });
    if (res.ok) {
      setRegsSaved(true);
      setTimeout(() => setRegsSaved(false), 2000);
    }
    setSavingRegs(false);
  }

  async function addNgCase() {
    if (!ngTitle.trim() || !ngDescription.trim()) return;
    setAddingNg(true);

    const newCase: NgCase = {
      id: uuidv4(),
      title: ngTitle.trim(),
      description: ngDescription.trim(),
      category: ngCategory || undefined,
      quote: ngQuote.trim() || undefined,
      addedAt: new Date().toISOString(),
    };

    const updated = [...ngCases, newCase];
    const res = await fetch(`/api/projects/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ngCases: updated }),
    });
    if (res.ok) {
      setNgCases(updated);
      setNgTitle("");
      setNgDescription("");
      setNgCategory("");
      setNgQuote("");
      setShowNgForm(false);
    }
    setAddingNg(false);
  }

  async function deleteNgCase(caseId: string) {
    const updated = ngCases.filter((c) => c.id !== caseId);
    const res = await fetch(`/api/projects/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ngCases: updated }),
    });
    if (res.ok) setNgCases(updated);
  }

  if (loading) return <div className="text-center py-20 text-gray-500">読み込み中...</div>;
  if (notFound) return (
    <div className="text-center py-20 text-gray-500">
      <p className="mb-4">案件が見つかりません</p>
      <Link href="/projects" className="text-violet-400 hover:underline">案件一覧に戻る</Link>
    </div>
  );

  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      {/* Header */}
      <div className="flex items-center gap-3 mb-2">
        <Link href="/projects" className="text-gray-500 hover:text-gray-300 text-sm transition-colors">
          ← 案件一覧
        </Link>
      </div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-black">{project?.name}</h1>
          {project?.clientName && <p className="text-gray-400 mt-1">{project.clientName}</p>}
        </div>
        <Link
          href={`/works?project=${id}`}
          className="px-4 py-2 rounded-full text-sm font-medium border border-white/20 hover:border-white/40 transition-colors"
        >
          チェック履歴 →
        </Link>
      </div>

      <div className="space-y-8">
        {/* ── Section 1: Basic Info ── */}
        <section className="p-6 rounded-2xl border border-white/10 bg-white/5">
          <h2 className="text-lg font-bold mb-4">基本情報</h2>
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">案件名 *</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 focus:border-violet-500 focus:outline-none transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">クライアント名</label>
              <input
                type="text"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 focus:border-violet-500 focus:outline-none transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">備考</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 focus:border-violet-500 focus:outline-none transition-colors resize-none text-sm"
              />
            </div>
          </div>
          <button
            onClick={saveInfo}
            disabled={savingInfo || !name.trim()}
            className="mt-4 px-5 py-2 rounded-xl text-sm font-semibold bg-violet-500 hover:bg-violet-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {infoSaved ? "✓ 保存しました" : savingInfo ? "保存中..." : "保存"}
          </button>
        </section>

        {/* ── Section 2: Regulations Knowledge ── */}
        <section className="p-6 rounded-2xl border border-white/10 bg-white/5">
          <div className="flex items-start justify-between mb-2">
            <div>
              <h2 className="text-lg font-bold">案件レギュレーション</h2>
              <p className="text-sm text-gray-400 mt-1">
                この案件専用の禁止表現・注意事項を記入します。AIチェック時に毎回自動で参照されます。
              </p>
            </div>
            <span className="text-xs px-2 py-1 rounded-full border border-violet-500/30 bg-violet-500/10 text-violet-300 flex-shrink-0">
              AI参照
            </span>
          </div>
          <textarea
            value={regulations}
            onChange={(e) => setRegulations(e.target.value)}
            placeholder={`例:\n- 「最安値」「業界No.1」表現禁止\n- 競合他社名（△△社、○○ブランド等）の言及禁止\n- Meta広告ポリシー準拠（ビフォーアフター画像禁止）\n- 「〇〇に効く」等の直接効果訴求禁止\n- 「医師推薦」「専門家監修」表現は根拠資料が必要`}
            rows={8}
            className="w-full mt-4 px-4 py-3 rounded-xl bg-black/30 border border-white/10 focus:border-violet-500 focus:outline-none transition-colors resize-none text-sm font-mono"
          />
          <div className="flex items-center justify-between mt-3">
            <p className="text-xs text-gray-600">{regulations.length} 文字</p>
            <button
              onClick={saveRegulations}
              disabled={savingRegs}
              className="px-5 py-2 rounded-xl text-sm font-semibold bg-violet-500 hover:bg-violet-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {regsSaved ? "✓ 保存しました" : savingRegs ? "保存中..." : "保存"}
            </button>
          </div>
        </section>

        {/* ── Section 3: NG Cases ── */}
        <section className="p-6 rounded-2xl border border-white/10 bg-white/5">
          <div className="flex items-start justify-between mb-2">
            <div>
              <h2 className="text-lg font-bold">過去のNG事例ナレッジ</h2>
              <p className="text-sm text-gray-400 mt-1">
                過去に指摘・修正したNG事例を登録。AIチェック時に「この案件での前例」として参照されます。
              </p>
            </div>
            <span className="text-xs px-2 py-1 rounded-full border border-violet-500/30 bg-violet-500/10 text-violet-300 flex-shrink-0">
              AI参照
            </span>
          </div>

          {/* Add NG Case Form */}
          {showNgForm ? (
            <div className="mt-4 p-4 rounded-xl border border-white/10 bg-black/20 space-y-3">
              <p className="text-sm font-medium text-gray-300">新しいNG事例を追加</p>
              <input
                type="text"
                value={ngTitle}
                onChange={(e) => setNgTitle(e.target.value)}
                placeholder="事例タイトル（例：効能効果の断言表現） *"
                className="w-full px-4 py-2.5 rounded-lg bg-white/5 border border-white/10 focus:border-violet-500 focus:outline-none text-sm transition-colors"
              />
              <textarea
                value={ngDescription}
                onChange={(e) => setNgDescription(e.target.value)}
                placeholder="詳細・なぜNGか（例：「〇〇が改善される」という断言は薬機法68条に抵触するため修正） *"
                rows={3}
                className="w-full px-4 py-2.5 rounded-lg bg-white/5 border border-white/10 focus:border-violet-500 focus:outline-none text-sm transition-colors resize-none"
              />
              <input
                type="text"
                value={ngQuote}
                onChange={(e) => setNgQuote(e.target.value)}
                placeholder="問題のあった表現（任意）　例：「3日で痩せる」"
                className="w-full px-4 py-2.5 rounded-lg bg-white/5 border border-white/10 focus:border-violet-500 focus:outline-none text-sm font-mono transition-colors"
              />
              <div>
                <label className="block text-xs text-gray-500 mb-1">関連する規制カテゴリ（任意）</label>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setNgCategory("")}
                    className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                      ngCategory === "" ? "bg-white/20 text-white border-white/40" : "border-white/10 text-gray-400 hover:border-white/30"
                    }`}
                  >
                    未分類
                  </button>
                  {REGULATION_CATEGORIES.map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setNgCategory(cat)}
                      className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                        ngCategory === cat
                          ? `${CATEGORY_COLOR[cat]}`
                          : "border-white/10 text-gray-400 hover:border-white/30"
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  onClick={addNgCase}
                  disabled={!ngTitle.trim() || !ngDescription.trim() || addingNg}
                  className="px-5 py-2 rounded-lg text-sm font-semibold bg-red-500/80 hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {addingNg ? "追加中..." : "NG事例を追加"}
                </button>
                <button
                  onClick={() => { setShowNgForm(false); setNgTitle(""); setNgDescription(""); setNgCategory(""); setNgQuote(""); }}
                  className="px-5 py-2 rounded-lg text-sm border border-white/20 hover:bg-white/5 transition-colors"
                >
                  キャンセル
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowNgForm(true)}
              className="mt-4 w-full py-3 rounded-xl text-sm font-medium border border-dashed border-white/20 hover:border-red-500/40 hover:bg-red-500/5 text-gray-400 hover:text-red-300 transition-all"
            >
              ＋ NG事例を追加
            </button>
          )}

          {/* NG Cases List */}
          {ngCases.length > 0 && (
            <div className="mt-4 space-y-3">
              <p className="text-xs text-gray-500">{ngCases.length} 件のNG事例が登録されています</p>
              {ngCases.map((c) => (
                <NgCaseCard key={c.id} ngCase={c} onDelete={() => deleteNgCase(c.id)} />
              ))}
            </div>
          )}

          {ngCases.length === 0 && !showNgForm && (
            <p className="mt-4 text-center text-sm text-gray-600 py-6">
              NG事例はまだ登録されていません
            </p>
          )}
        </section>
      </div>
    </div>
  );
}

function NgCaseCard({ ngCase, onDelete }: { ngCase: NgCase; onDelete: () => void }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="p-4 rounded-xl border border-white/10 bg-black/20">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-bold text-red-400">🚫</span>
            <span className="text-sm font-bold">{ngCase.title}</span>
            {ngCase.category && (
              <span className={`text-xs px-2 py-0.5 rounded-full border ${CATEGORY_COLOR[ngCase.category]}`}>
                {ngCase.category}
              </span>
            )}
          </div>
          {ngCase.quote && (
            <p className="text-xs font-mono text-orange-300/80 bg-orange-500/10 border border-orange-500/20 rounded px-2 py-1 mt-2 inline-block">
              &ldquo;{ngCase.quote}&rdquo;
            </p>
          )}
          {expanded && (
            <p className="text-sm text-gray-300 mt-2 leading-relaxed">{ngCase.description}</p>
          )}
          {!expanded && (
            <p className="text-xs text-gray-500 mt-1 truncate">{ngCase.description}</p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
          >
            {expanded ? "折りたたむ" : "詳細"}
          </button>
          <button
            onClick={onDelete}
            className="text-xs text-gray-600 hover:text-red-400 transition-colors px-2 py-1 rounded hover:bg-red-500/10"
          >
            削除
          </button>
        </div>
      </div>
      <p className="text-xs text-gray-700 mt-2">
        {new Date(ngCase.addedAt).toLocaleDateString("ja-JP")} 追加
      </p>
    </div>
  );
}
