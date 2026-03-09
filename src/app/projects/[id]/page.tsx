"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { v4 as uuidv4 } from "uuid";
import { Project, NgCase, AllowedCase, RegulationCategory } from "@/lib/types";

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

  // Basic info
  const [name, setName] = useState("");
  const [clientName, setClientName] = useState("");
  const [description, setDescription] = useState("");
  const [savingInfo, setSavingInfo] = useState(false);
  const [infoSaved, setInfoSaved] = useState(false);

  // Google スプレッドシート
  const [sheetUrl, setSheetUrl] = useState("");
  const [savingSheet, setSavingSheet] = useState(false);
  const [sheetSaved, setSheetSaved] = useState(false);

  // 企業レギュレーション（テキスト）
  const [companyRegulations, setCompanyRegulations] = useState("");
  const [savingCompanyRegs, setSavingCompanyRegs] = useState(false);
  const [companyRegsSaved, setCompanyRegsSaved] = useState(false);

  // 企業レギュレーション（ファイル）
  const [companyFileName, setCompanyFileName] = useState<string | null>(null);
  const [uploadingCompanyFile, setUploadingCompanyFile] = useState(false);
  const [companyUploadResult, setCompanyUploadResult] = useState<{ extractedLength: number; preview: string } | null>(null);
  const [companyFileError, setCompanyFileError] = useState<string | null>(null);

  // NG事例
  const [ngCases, setNgCases] = useState<NgCase[]>([]);
  const [showNgForm, setShowNgForm] = useState(false);
  const [ngTitle, setNgTitle] = useState("");
  const [ngDescription, setNgDescription] = useState("");
  const [ngCategory, setNgCategory] = useState<RegulationCategory | "">("");
  const [ngQuote, setNgQuote] = useState("");
  const [addingNg, setAddingNg] = useState(false);

  // 許容表現
  const [allowedCases, setAllowedCases] = useState<AllowedCase[]>([]);
  const [showAllowedForm, setShowAllowedForm] = useState(false);
  const [allowedTitle, setAllowedTitle] = useState("");
  const [allowedDescription, setAllowedDescription] = useState("");
  const [allowedQuote, setAllowedQuote] = useState("");
  const [addingAllowed, setAddingAllowed] = useState(false);

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
        setSheetUrl(data.sheetUrl ?? "");
        setCompanyRegulations(data.companyRegulations ?? "");
        setCompanyFileName(data.companyRegulationsFileName ?? null);
        setNgCases(data.ngCases ?? []);
        setAllowedCases(data.allowedCases ?? []);
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

  async function saveSheetUrl() {
    setSavingSheet(true);
    const res = await fetch(`/api/projects/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sheetUrl }),
    });
    if (res.ok) {
      setSheetSaved(true);
      setTimeout(() => setSheetSaved(false), 2000);
    }
    setSavingSheet(false);
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

  async function uploadRegulationsFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setCompanyFileError(null);
    setUploadingCompanyFile(true);
    setCompanyUploadResult(null);

    try {
      let extractedText = "";

      if (file.name.endsWith(".txt")) {
        // TXTはそのまま読み込む
        extractedText = await file.text();
      } else {
        // Excel / CSV
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
        extractedText = lines.join("\n").trim();
      }

      const res = await fetch(`/api/projects/${id}/regulations-file`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: file.name, extractedText }),
      });
      if (res.ok) {
        const data = await res.json();
        setCompanyFileName(file.name);
        setCompanyUploadResult({ extractedLength: data.extractedLength, preview: data.preview });
      } else {
        const err = await res.json();
        setCompanyFileError(err.error ?? "アップロードに失敗しました");
      }
    } catch {
      setCompanyFileError("ファイルの解析に失敗しました");
    }
    setUploadingCompanyFile(false);
    e.target.value = "";
  }

  async function deleteRegulationsFile() {
    const res = await fetch(`/api/projects/${id}/regulations-file`, { method: "DELETE" });
    if (res.ok) {
      setCompanyFileName(null);
      setCompanyUploadResult(null);
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
      setNgTitle(""); setNgDescription(""); setNgCategory(""); setNgQuote("");
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

  async function addAllowedCase() {
    if (!allowedTitle.trim() || !allowedDescription.trim()) return;
    setAddingAllowed(true);
    const newCase: AllowedCase = {
      id: uuidv4(),
      title: allowedTitle.trim(),
      description: allowedDescription.trim(),
      quote: allowedQuote.trim() || undefined,
      addedAt: new Date().toISOString(),
    };
    const updated = [...allowedCases, newCase];
    const res = await fetch(`/api/projects/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ allowedCases: updated }),
    });
    if (res.ok) {
      setAllowedCases(updated);
      setAllowedTitle(""); setAllowedDescription(""); setAllowedQuote("");
      setShowAllowedForm(false);
    }
    setAddingAllowed(false);
  }

  async function deleteAllowedCase(caseId: string) {
    const updated = allowedCases.filter((c) => c.id !== caseId);
    const res = await fetch(`/api/projects/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ allowedCases: updated }),
    });
    if (res.ok) setAllowedCases(updated);
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

      {/* AIジャッジフロー説明 */}
      <div className="mb-8 p-4 rounded-xl bg-white/5 border border-white/10">
        <p className="text-xs text-gray-400 font-medium mb-2">AIジャッジフロー</p>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="px-3 py-1.5 rounded-lg text-xs font-bold bg-red-500/20 text-red-300 border border-red-500/30">① 薬機法・広告法令</span>
          <span className="text-gray-600">→</span>
          <span className="px-3 py-1.5 rounded-lg text-xs font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30">② 企業レギュレーション</span>
          <span className="text-gray-600">→</span>
          <span className="px-3 py-1.5 rounded-lg text-xs font-bold bg-red-500/20 text-red-300 border border-red-500/30">NG事例照合</span>
          <span className="text-gray-600">+</span>
          <span className="px-3 py-1.5 rounded-lg text-xs font-bold bg-green-500/20 text-green-300 border border-green-500/30">許容表現参照</span>
        </div>
      </div>

      <div className="space-y-8">
        {/* 基本情報 */}
        <section className="p-6 rounded-2xl border border-white/10 bg-white/5">
          <h2 className="text-lg font-bold mb-4">基本情報</h2>
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">案件名 *</label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 focus:border-violet-500 focus:outline-none transition-colors" />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">クライアント名</label>
              <input type="text" value={clientName} onChange={(e) => setClientName(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 focus:border-violet-500 focus:outline-none transition-colors" />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">備考</label>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2}
                className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 focus:border-violet-500 focus:outline-none transition-colors resize-none text-sm" />
            </div>
          </div>
          <button onClick={saveInfo} disabled={savingInfo || !name.trim()}
            className="mt-4 px-5 py-2 rounded-xl text-sm font-semibold bg-violet-500 hover:bg-violet-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
            {infoSaved ? "✓ 保存しました" : savingInfo ? "保存中..." : "保存"}
          </button>
        </section>

        {/* CR提出用 Google スプレッドシート */}
        <section className="p-6 rounded-2xl border border-green-500/20 bg-green-500/5">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="text-lg font-bold">CR提出用スプレッドシート</h2>
              <p className="text-sm text-gray-400 mt-1">この案件のCR提出管理シートのURLを登録します。</p>
            </div>
            {sheetUrl && (
              <a href={sheetUrl} target="_blank" rel="noopener noreferrer"
                className="flex-shrink-0 px-4 py-2 rounded-xl text-sm font-semibold bg-green-600 hover:bg-green-500 transition-colors">
                シートを開く →
              </a>
            )}
          </div>
          <div className="flex gap-3">
            <input
              type="url"
              value={sheetUrl}
              onChange={(e) => setSheetUrl(e.target.value)}
              placeholder="https://docs.google.com/spreadsheets/d/..."
              className="flex-1 px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 focus:border-green-500 focus:outline-none transition-colors text-sm font-mono"
            />
            <button onClick={saveSheetUrl} disabled={savingSheet}
              className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-green-600 hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap">
              {sheetSaved ? "✓ 保存" : savingSheet ? "保存中..." : "保存"}
            </button>
          </div>
        </section>

        {/* 企業レギュレーション（テキスト） */}
        <section className="p-6 rounded-2xl border border-blue-500/20 bg-blue-500/5">
          <div className="flex items-start justify-between mb-2">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30 font-bold">② 企業</span>
                <h2 className="text-lg font-bold">企業レギュレーション</h2>
              </div>
              <p className="text-sm text-gray-400">このクライアント全案件に適用される共通ルール。薬機法チェックの次にAIが参照します。</p>
            </div>
            <span className="text-xs px-2 py-1 rounded-full border border-violet-500/30 bg-violet-500/10 text-violet-300 flex-shrink-0">AI参照</span>
          </div>
          <textarea value={companyRegulations} onChange={(e) => setCompanyRegulations(e.target.value)}
            placeholder={`例:\n- 競合他社名（A社・B社）の言及・比較禁止\n- 「医師推薦」「専門家監修」表現は事前承認必須\n- SNS広告ではビフォーアフター画像禁止`}
            rows={6}
            className="w-full mt-4 px-4 py-3 rounded-xl bg-black/30 border border-white/10 focus:border-blue-500 focus:outline-none transition-colors resize-none text-sm font-mono" />
          <div className="flex items-center justify-between mt-3">
            <p className="text-xs text-gray-600">{companyRegulations.length} 文字</p>
            <button onClick={saveCompanyRegulations} disabled={savingCompanyRegs}
              className="px-5 py-2 rounded-xl text-sm font-semibold bg-blue-500 hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
              {companyRegsSaved ? "✓ 保存しました" : savingCompanyRegs ? "保存中..." : "保存"}
            </button>
          </div>
        </section>

        {/* 企業レギュレーション（ファイル） */}
        <section className="p-6 rounded-2xl border border-blue-500/20 bg-blue-500/5">
          <div className="flex items-start justify-between mb-2">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30 font-bold">② 企業</span>
                <h2 className="text-lg font-bold">企業レギュレーションファイル</h2>
              </div>
              <p className="text-sm text-gray-400">企業共通レギュレーション表（Excel/CSV）をアップロード。AIチェック時に自動参照されます。</p>
            </div>
            <span className="text-xs px-2 py-1 rounded-full border border-violet-500/30 bg-violet-500/10 text-violet-300 flex-shrink-0">AI参照</span>
          </div>

          {companyFileName ? (
            <div className="mt-4 p-4 rounded-xl border border-green-500/30 bg-green-500/10">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-green-400 text-lg">✓</span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-green-300 truncate">{companyFileName}</p>
                    {companyUploadResult && <p className="text-xs text-gray-400 mt-0.5">{companyUploadResult.extractedLength} 文字を抽出済み</p>}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <label className="px-3 py-1.5 rounded-lg text-xs font-medium border border-white/20 hover:bg-white/5 cursor-pointer transition-colors">
                    差し替え
                    <input type="file" accept=".xlsx,.xls,.csv,.txt" className="hidden" onChange={uploadRegulationsFile} />
                  </label>
                  <button onClick={deleteRegulationsFile}
                    className="px-3 py-1.5 rounded-lg text-xs text-gray-500 hover:text-red-400 hover:bg-red-500/10 border border-white/10 hover:border-red-500/30 transition-colors">
                    削除
                  </button>
                </div>
              </div>
              {companyUploadResult?.preview && (
                <div className="mt-3 p-3 rounded-lg bg-black/30 border border-white/10">
                  <p className="text-xs text-gray-500 mb-1">抽出プレビュー（先頭300文字）</p>
                  <pre className="text-xs text-gray-300 whitespace-pre-wrap font-mono leading-relaxed">{companyUploadResult.preview}</pre>
                </div>
              )}
              {companyFileError && <p className="mt-2 text-sm text-red-400">{companyFileError}</p>}
            </div>
          ) : (
            <>
              <label className={`mt-4 flex flex-col items-center justify-center w-full py-8 rounded-xl border-2 border-dashed cursor-pointer transition-all ${uploadingCompanyFile ? "border-blue-500/50 bg-blue-500/5" : "border-white/20 hover:border-blue-500/40 hover:bg-blue-500/5"}`}>
                <input type="file" accept=".xlsx,.xls,.csv,.txt" className="hidden" onChange={uploadRegulationsFile} disabled={uploadingCompanyFile} />
                {uploadingCompanyFile ? (
                  <><div className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin mb-2" /><p className="text-sm text-blue-300">解析中...</p></>
                ) : (
                  <><span className="text-2xl mb-2">📊</span><p className="text-sm font-medium text-gray-300">ファイルをアップロード</p><p className="text-xs text-gray-500 mt-1">.xlsx .xls .csv .txt に対応</p></>
                )}
              </label>
              {companyFileError && <p className="mt-2 text-sm text-red-400">{companyFileError}</p>}
            </>
          )}
        </section>

        {/* NG事例ナレッジ */}
        <section className="p-6 rounded-2xl border border-red-500/20 bg-red-500/5">
          <div className="flex items-start justify-between mb-2">
            <div>
              <h2 className="text-lg font-bold">過去のNG事例ナレッジ</h2>
              <p className="text-sm text-gray-400 mt-1">過去に指摘・修正したNG事例を登録。AIチェック時に「この案件での前例」として参照されます。</p>
            </div>
            <span className="text-xs px-2 py-1 rounded-full border border-violet-500/30 bg-violet-500/10 text-violet-300 flex-shrink-0">AI参照</span>
          </div>

          {showNgForm ? (
            <div className="mt-4 p-4 rounded-xl border border-white/10 bg-black/20 space-y-3">
              <p className="text-sm font-medium text-gray-300">新しいNG事例を追加</p>
              <input type="text" value={ngTitle} onChange={(e) => setNgTitle(e.target.value)}
                placeholder="事例タイトル（例：効能効果の断言表現） *"
                className="w-full px-4 py-2.5 rounded-lg bg-white/5 border border-white/10 focus:border-red-500 focus:outline-none text-sm transition-colors" />
              <textarea value={ngDescription} onChange={(e) => setNgDescription(e.target.value)}
                placeholder="詳細・なぜNGか *" rows={3}
                className="w-full px-4 py-2.5 rounded-lg bg-white/5 border border-white/10 focus:border-red-500 focus:outline-none text-sm transition-colors resize-none" />
              <input type="text" value={ngQuote} onChange={(e) => setNgQuote(e.target.value)}
                placeholder="問題のあった表現（任意）　例：「3日で痩せる」"
                className="w-full px-4 py-2.5 rounded-lg bg-white/5 border border-white/10 focus:border-red-500 focus:outline-none text-sm font-mono transition-colors" />
              <div>
                <label className="block text-xs text-gray-500 mb-1">関連する規制カテゴリ（任意）</label>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => setNgCategory("")}
                    className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${ngCategory === "" ? "bg-white/20 text-white border-white/40" : "border-white/10 text-gray-400 hover:border-white/30"}`}>
                    未分類
                  </button>
                  {REGULATION_CATEGORIES.map((cat) => (
                    <button key={cat} type="button" onClick={() => setNgCategory(cat)}
                      className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${ngCategory === cat ? CATEGORY_COLOR[cat] : "border-white/10 text-gray-400 hover:border-white/30"}`}>
                      {cat}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <button onClick={addNgCase} disabled={!ngTitle.trim() || !ngDescription.trim() || addingNg}
                  className="px-5 py-2 rounded-lg text-sm font-semibold bg-red-500/80 hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                  {addingNg ? "追加中..." : "NG事例を追加"}
                </button>
                <button onClick={() => { setShowNgForm(false); setNgTitle(""); setNgDescription(""); setNgCategory(""); setNgQuote(""); }}
                  className="px-5 py-2 rounded-lg text-sm border border-white/20 hover:bg-white/5 transition-colors">
                  キャンセル
                </button>
              </div>
            </div>
          ) : (
            <button onClick={() => setShowNgForm(true)}
              className="mt-4 w-full py-3 rounded-xl text-sm font-medium border border-dashed border-white/20 hover:border-red-500/40 hover:bg-red-500/5 text-gray-400 hover:text-red-300 transition-all">
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
            <p className="mt-4 text-center text-sm text-gray-600 py-6">NG事例はまだ登録されていません</p>
          )}
        </section>

        {/* 許容表現ナレッジ */}
        <section className="p-6 rounded-2xl border border-green-500/20 bg-green-500/5">
          <div className="flex items-start justify-between mb-2">
            <div>
              <h2 className="text-lg font-bold">許容表現ナレッジ</h2>
              <p className="text-sm text-gray-400 mt-1">
                薬機法的にグレーに見えても、この案件・クライアントで使用が確認・承認された表現。AIが過剰にNGと判定するのを防ぎます。
              </p>
            </div>
            <span className="text-xs px-2 py-1 rounded-full border border-green-500/30 bg-green-500/10 text-green-300 flex-shrink-0">AI参照</span>
          </div>

          {showAllowedForm ? (
            <div className="mt-4 p-4 rounded-xl border border-white/10 bg-black/20 space-y-3">
              <p className="text-sm font-medium text-gray-300">許容表現を追加</p>
              <input type="text" value={allowedTitle} onChange={(e) => setAllowedTitle(e.target.value)}
                placeholder="タイトル（例：「うるおい」訴求はOK） *"
                className="w-full px-4 py-2.5 rounded-lg bg-white/5 border border-white/10 focus:border-green-500 focus:outline-none text-sm transition-colors" />
              <textarea value={allowedDescription} onChange={(e) => setAllowedDescription(e.target.value)}
                placeholder="なぜOKか・使用条件（例：保湿効果の訴求は化粧品の効能範囲内であり使用可。ただし「治る」等の医薬品的表現は不可） *"
                rows={3}
                className="w-full px-4 py-2.5 rounded-lg bg-white/5 border border-white/10 focus:border-green-500 focus:outline-none text-sm transition-colors resize-none" />
              <input type="text" value={allowedQuote} onChange={(e) => setAllowedQuote(e.target.value)}
                placeholder="具体的な表現（任意）　例：「肌にうるおいを与える」"
                className="w-full px-4 py-2.5 rounded-lg bg-white/5 border border-white/10 focus:border-green-500 focus:outline-none text-sm font-mono transition-colors" />
              <div className="flex gap-2 pt-1">
                <button onClick={addAllowedCase} disabled={!allowedTitle.trim() || !allowedDescription.trim() || addingAllowed}
                  className="px-5 py-2 rounded-lg text-sm font-semibold bg-green-600 hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                  {addingAllowed ? "追加中..." : "許容表現を追加"}
                </button>
                <button onClick={() => { setShowAllowedForm(false); setAllowedTitle(""); setAllowedDescription(""); setAllowedQuote(""); }}
                  className="px-5 py-2 rounded-lg text-sm border border-white/20 hover:bg-white/5 transition-colors">
                  キャンセル
                </button>
              </div>
            </div>
          ) : (
            <button onClick={() => setShowAllowedForm(true)}
              className="mt-4 w-full py-3 rounded-xl text-sm font-medium border border-dashed border-white/20 hover:border-green-500/40 hover:bg-green-500/5 text-gray-400 hover:text-green-300 transition-all">
              ＋ 許容表現を追加
            </button>
          )}

          {allowedCases.length > 0 && (
            <div className="mt-4 space-y-3">
              <p className="text-xs text-gray-500">{allowedCases.length} 件の許容表現が登録されています</p>
              {allowedCases.map((c) => (
                <AllowedCaseCard key={c.id} allowedCase={c} onDelete={() => deleteAllowedCase(c.id)} />
              ))}
            </div>
          )}
          {allowedCases.length === 0 && !showAllowedForm && (
            <p className="mt-4 text-center text-sm text-gray-600 py-6">許容表現はまだ登録されていません</p>
          )}
        </section>
      </div>
    </div>
  );
}

function NgCaseCard({ ngCase, onDelete }: { ngCase: NgCase; onDelete: () => void }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="p-4 rounded-xl border border-red-500/20 bg-black/20">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-bold text-red-400">🚫</span>
            <span className="text-sm font-bold">{ngCase.title}</span>
            {ngCase.category && (
              <span className={`text-xs px-2 py-0.5 rounded-full border ${CATEGORY_COLOR[ngCase.category]}`}>{ngCase.category}</span>
            )}
          </div>
          {ngCase.quote && (
            <p className="text-xs font-mono text-orange-300/80 bg-orange-500/10 border border-orange-500/20 rounded px-2 py-1 mt-2 inline-block">
              &ldquo;{ngCase.quote}&rdquo;
            </p>
          )}
          {expanded && <p className="text-sm text-gray-300 mt-2 leading-relaxed">{ngCase.description}</p>}
          {!expanded && <p className="text-xs text-gray-500 mt-1 truncate">{ngCase.description}</p>}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button onClick={() => setExpanded(!expanded)} className="text-xs text-gray-500 hover:text-gray-300 transition-colors">
            {expanded ? "折りたたむ" : "詳細"}
          </button>
          <button onClick={onDelete} className="text-xs text-gray-600 hover:text-red-400 transition-colors px-2 py-1 rounded hover:bg-red-500/10">削除</button>
        </div>
      </div>
      <p className="text-xs text-gray-700 mt-2">{new Date(ngCase.addedAt).toLocaleDateString("ja-JP")} 追加</p>
    </div>
  );
}

function AllowedCaseCard({ allowedCase, onDelete }: { allowedCase: AllowedCase; onDelete: () => void }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="p-4 rounded-xl border border-green-500/20 bg-black/20">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-bold text-green-400">✅</span>
            <span className="text-sm font-bold">{allowedCase.title}</span>
          </div>
          {allowedCase.quote && (
            <p className="text-xs font-mono text-green-300/80 bg-green-500/10 border border-green-500/20 rounded px-2 py-1 mt-2 inline-block">
              &ldquo;{allowedCase.quote}&rdquo;
            </p>
          )}
          {expanded && <p className="text-sm text-gray-300 mt-2 leading-relaxed">{allowedCase.description}</p>}
          {!expanded && <p className="text-xs text-gray-500 mt-1 truncate">{allowedCase.description}</p>}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button onClick={() => setExpanded(!expanded)} className="text-xs text-gray-500 hover:text-gray-300 transition-colors">
            {expanded ? "折りたたむ" : "詳細"}
          </button>
          <button onClick={onDelete} className="text-xs text-gray-600 hover:text-red-400 transition-colors px-2 py-1 rounded hover:bg-red-500/10">削除</button>
        </div>
      </div>
      <p className="text-xs text-gray-700 mt-2">{new Date(allowedCase.addedAt).toLocaleDateString("ja-JP")} 追加</p>
    </div>
  );
}
