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

  // ── 企業レギュレーション ──
  const [companyRegulations, setCompanyRegulations] = useState("");
  const [savingCompanyRegs, setSavingCompanyRegs] = useState(false);
  const [companyRegsSaved, setCompanyRegsSaved] = useState(false);

  const [companyFileName, setCompanyFileName] = useState<string | null>(null);
  const [uploadingCompanyFile, setUploadingCompanyFile] = useState(false);
  const [companyUploadResult, setCompanyUploadResult] = useState<{ extractedLength: number; preview: string } | null>(null);
  const [companyFileError, setCompanyFileError] = useState<string | null>(null);

  // ── 案件レギュレーション ──
  const [regulations, setRegulations] = useState("");
  const [savingRegs, setSavingRegs] = useState(false);
  const [regsSaved, setRegsSaved] = useState(false);

  const [regulationsFileName, setRegulationsFileName] = useState<string | null>(null);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [uploadResult, setUploadResult] = useState<{ extractedLength: number; preview: string } | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

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
        setCompanyRegulations(data.companyRegulations ?? "");
        setCompanyFileName(data.companyRegulationsFileName ?? null);
        setRegulations(data.regulations ?? "");
        setNgCases(data.ngCases ?? []);
        setRegulationsFileName(data.regulationsFileName ?? null);
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

  async function saveCompanyRegulations() {
    setSavingCompanyRegs(true);
    const res = await fetch(`/api/projects/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyRegulations }),
    });
    if (res.ok) {
      setCompanyRegsSaved(true);
      setTimeout(() => setCompanyRegsSaved(false), 2000);
    }
    setSavingCompanyRegs(false);
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

  /** Excel/CSV を解析して指定タイプのエンドポイントに送信 */
  async function uploadRegulationsFile(
    e: React.ChangeEvent<HTMLInputElement>,
    type: "company" | "project"
  ) {
    const file = e.target.files?.[0];
    if (!file) return;

    const isCompany = type === "company";
    isCompany ? setCompanyFileError(null) : setFileError(null);
    isCompany ? setUploadingCompanyFile(true) : setUploadingFile(true);
    isCompany ? setCompanyUploadResult(null) : setUploadResult(null);

    try {
      const XLSX = await import("xlsx");
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: "array" });

      const lines: string[] = [];
      for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: "" });
        if (workbook.SheetNames.length > 1) lines.push(`【シート: ${sheetName}】`);

        for (const row of rows) {
          const cells = (row as string[]).map((c) => String(c ?? "").trim());
          if (cells.every((c) => c === "")) continue;
          const colA = cells[0] ?? "";
          const colB = cells[1] ?? "";
          const colC = cells[2] ?? "";
          if (colA && !colB && !colC) { lines.push(`\n[${colA}]`); continue; }
          const main = colB || colA;
          if (!main) continue;
          lines.push(`・${main}${colC ? `（${colC}）` : ""}`);
        }
      }
      const extractedText = lines.join("\n").trim();

      const res = await fetch(`/api/projects/${id}/regulations-file?type=${type}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: file.name, extractedText }),
      });
      if (res.ok) {
        const data = await res.json();
        if (isCompany) {
          setCompanyFileName(file.name);
          setCompanyUploadResult({ extractedLength: data.extractedLength, preview: data.preview });
        } else {
          setRegulationsFileName(file.name);
          setUploadResult({ extractedLength: data.extractedLength, preview: data.preview });
        }
      } else {
        const err = await res.json();
        const msg = err.error ?? "アップロードに失敗しました";
        isCompany ? setCompanyFileError(msg) : setFileError(msg);
      }
    } catch {
      const msg = "ファイルの解析に失敗しました";
      isCompany ? setCompanyFileError(msg) : setFileError(msg);
    }
    isCompany ? setUploadingCompanyFile(false) : setUploadingFile(false);
    e.target.value = "";
  }

  async function deleteRegulationsFile(type: "company" | "project") {
    const res = await fetch(`/api/projects/${id}/regulations-file?type=${type}`, { method: "DELETE" });
    if (res.ok) {
      if (type === "company") {
        setCompanyFileName(null);
        setCompanyUploadResult(null);
      } else {
        setRegulationsFileName(null);
        setUploadResult(null);
      }
    }
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
      <div className="flex items-center justify-between mb-6">
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

      {/* チェックフロー説明 */}
      <div className="mb-8 p-4 rounded-xl bg-white/5 border border-white/10">
        <p className="text-xs text-gray-400 font-medium mb-2">AIジャッジフロー</p>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="px-3 py-1.5 rounded-lg text-xs font-bold bg-red-500/20 text-red-300 border border-red-500/30">① 薬機法・広告法令</span>
          <span className="text-gray-600">→</span>
          <span className="px-3 py-1.5 rounded-lg text-xs font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30">② 企業レギュレーション</span>
          <span className="text-gray-600">→</span>
          <span className="px-3 py-1.5 rounded-lg text-xs font-bold bg-violet-500/20 text-violet-300 border border-violet-500/30">③ 案件レギュレーション</span>
        </div>
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

        {/* ── Section 2: 企業レギュレーション（手入力） ── */}
        <section className="p-6 rounded-2xl border border-blue-500/20 bg-blue-500/5">
          <div className="flex items-start justify-between mb-2">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30 font-bold">② 企業</span>
                <h2 className="text-lg font-bold">企業レギュレーション</h2>
              </div>
              <p className="text-sm text-gray-400">
                このクライアント企業全体に適用されるルール・禁止事項。薬機法チェックの次に優先してAIが参照します。
              </p>
            </div>
            <span className="text-xs px-2 py-1 rounded-full border border-violet-500/30 bg-violet-500/10 text-violet-300 flex-shrink-0">
              AI参照
            </span>
          </div>
          <textarea
            value={companyRegulations}
            onChange={(e) => setCompanyRegulations(e.target.value)}
            placeholder={`例:\n- 競合他社名（A社・B社）の言及・比較禁止\n- 「医師推薦」「専門家監修」表現は事前承認必須\n- SNS広告ではビフォーアフター画像禁止（Meta規約）\n- ブランドロゴ・カラーはブランドガイドライン準拠`}
            rows={6}
            className="w-full mt-4 px-4 py-3 rounded-xl bg-black/30 border border-white/10 focus:border-blue-500 focus:outline-none transition-colors resize-none text-sm font-mono"
          />
          <div className="flex items-center justify-between mt-3">
            <p className="text-xs text-gray-600">{companyRegulations.length} 文字</p>
            <button
              onClick={saveCompanyRegulations}
              disabled={savingCompanyRegs}
              className="px-5 py-2 rounded-xl text-sm font-semibold bg-blue-500 hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {companyRegsSaved ? "✓ 保存しました" : savingCompanyRegs ? "保存中..." : "保存"}
            </button>
          </div>
        </section>

        {/* ── Section 3: 企業レギュレーションファイル ── */}
        <section className="p-6 rounded-2xl border border-blue-500/20 bg-blue-500/5">
          <div className="flex items-start justify-between mb-2">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30 font-bold">② 企業</span>
                <h2 className="text-lg font-bold">企業レギュレーションファイル</h2>
              </div>
              <p className="text-sm text-gray-400">
                企業共通のレギュレーション表（Excel/CSV）をアップロード。AIチェック時に自動参照されます。
              </p>
            </div>
            <span className="text-xs px-2 py-1 rounded-full border border-violet-500/30 bg-violet-500/10 text-violet-300 flex-shrink-0">
              AI参照
            </span>
          </div>

          <RegulationsFileUploadArea
            fileName={companyFileName}
            uploading={uploadingCompanyFile}
            uploadResult={companyUploadResult}
            fileError={companyFileError}
            accentColor="blue"
            onUpload={(e) => uploadRegulationsFile(e, "company")}
            onDelete={() => deleteRegulationsFile("company")}
          />
        </section>

        {/* ── Section 4: 案件レギュレーション（手入力） ── */}
        <section className="p-6 rounded-2xl border border-violet-500/20 bg-violet-500/5">
          <div className="flex items-start justify-between mb-2">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-300 border border-violet-500/30 font-bold">③ 案件</span>
                <h2 className="text-lg font-bold">案件レギュレーション</h2>
              </div>
              <p className="text-sm text-gray-400">
                この案件専用の禁止表現・注意事項。企業レギュレーションの後にAIが参照します。
              </p>
            </div>
            <span className="text-xs px-2 py-1 rounded-full border border-violet-500/30 bg-violet-500/10 text-violet-300 flex-shrink-0">
              AI参照
            </span>
          </div>
          <textarea
            value={regulations}
            onChange={(e) => setRegulations(e.target.value)}
            placeholder={`例:\n- 「最安値」「業界No.1」表現禁止\n- 「〇〇に効く」等の直接効果訴求禁止\n- 価格表示は税込み表示必須`}
            rows={6}
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

        {/* ── Section 5: 案件レギュレーション・NG一覧ファイル ── */}
        <section className="p-6 rounded-2xl border border-violet-500/20 bg-violet-500/5">
          <div className="flex items-start justify-between mb-2">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-300 border border-violet-500/30 font-bold">③ 案件</span>
                <h2 className="text-lg font-bold">案件レギュレーション・NG一覧ファイル</h2>
              </div>
              <p className="text-sm text-gray-400">
                案件固有のレギュレーション表・NG表現一覧（Excel/CSV）をアップロード。AIチェック時に自動参照されます。
              </p>
            </div>
            <span className="text-xs px-2 py-1 rounded-full border border-violet-500/30 bg-violet-500/10 text-violet-300 flex-shrink-0">
              AI参照
            </span>
          </div>

          <RegulationsFileUploadArea
            fileName={regulationsFileName}
            uploading={uploadingFile}
            uploadResult={uploadResult}
            fileError={fileError}
            accentColor="violet"
            onUpload={(e) => uploadRegulationsFile(e, "project")}
            onDelete={() => deleteRegulationsFile("project")}
          />
        </section>

        {/* ── Section 6: NG Cases ── */}
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

/** ファイルアップロードエリア（企業・案件共用） */
function RegulationsFileUploadArea({
  fileName,
  uploading,
  uploadResult,
  fileError,
  accentColor,
  onUpload,
  onDelete,
}: {
  fileName: string | null;
  uploading: boolean;
  uploadResult: { extractedLength: number; preview: string } | null;
  fileError: string | null;
  accentColor: "blue" | "violet";
  onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onDelete: () => void;
}) {
  const focusClass = accentColor === "blue" ? "focus:border-blue-500" : "focus:border-violet-500";
  const borderClass = accentColor === "blue"
    ? "border-blue-500/50 bg-blue-500/5"
    : "border-violet-500/50 bg-violet-500/5";
  const hoverClass = accentColor === "blue"
    ? "hover:border-blue-500/40 hover:bg-blue-500/5"
    : "hover:border-violet-500/40 hover:bg-violet-500/5";
  const spinClass = accentColor === "blue" ? "border-blue-400" : "border-violet-400";
  const textClass = accentColor === "blue" ? "text-blue-300" : "text-violet-300";

  if (fileName) {
    return (
      <div className="mt-4 p-4 rounded-xl border border-green-500/30 bg-green-500/10">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-green-400 text-lg">✓</span>
            <div className="min-w-0">
              <p className="text-sm font-medium text-green-300 truncate">{fileName}</p>
              {uploadResult && (
                <p className="text-xs text-gray-400 mt-0.5">{uploadResult.extractedLength} 文字を抽出済み</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <label className={`px-3 py-1.5 rounded-lg text-xs font-medium border border-white/20 hover:bg-white/5 cursor-pointer transition-colors ${focusClass}`}>
              差し替え
              <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={onUpload} />
            </label>
            <button
              onClick={onDelete}
              className="px-3 py-1.5 rounded-lg text-xs text-gray-500 hover:text-red-400 hover:bg-red-500/10 border border-white/10 hover:border-red-500/30 transition-colors"
            >
              削除
            </button>
          </div>
        </div>
        {uploadResult?.preview && (
          <div className="mt-3 p-3 rounded-lg bg-black/30 border border-white/10">
            <p className="text-xs text-gray-500 mb-1">抽出プレビュー（先頭300文字）</p>
            <pre className="text-xs text-gray-300 whitespace-pre-wrap font-mono leading-relaxed">{uploadResult.preview}</pre>
          </div>
        )}
        {fileError && <p className="mt-2 text-sm text-red-400">{fileError}</p>}
      </div>
    );
  }

  return (
    <>
      <label className={`mt-4 flex flex-col items-center justify-center w-full py-8 rounded-xl border-2 border-dashed cursor-pointer transition-all ${uploading ? borderClass : `border-white/20 ${hoverClass}`}`}>
        <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={onUpload} disabled={uploading} />
        {uploading ? (
          <>
            <div className={`w-6 h-6 border-2 ${spinClass} border-t-transparent rounded-full animate-spin mb-2`} />
            <p className={`text-sm ${textClass}`}>解析中...</p>
          </>
        ) : (
          <>
            <span className="text-2xl mb-2">📊</span>
            <p className="text-sm font-medium text-gray-300">Excel / CSV をアップロード</p>
            <p className="text-xs text-gray-500 mt-1">.xlsx .xls .csv に対応</p>
          </>
        )}
      </label>
      {fileError && <p className="mt-2 text-sm text-red-400">{fileError}</p>}
    </>
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
