"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { Project, Client } from "@/lib/types";

export default function ProjectSettingsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  const [project, setProject] = useState<Project | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // Basic info
  const [name, setName] = useState("");
  const [clientId, setClientId] = useState("");
  const [description, setDescription] = useState("");
  const [checkMode, setCheckMode] = useState<"soft" | "hard">("soft");
  const [savingInfo, setSavingInfo] = useState(false);
  const [infoSaved, setInfoSaved] = useState(false);

  // CR提出用 Google スプレッドシート
  const [sheetUrl, setSheetUrl] = useState("");
  const [savingSheet, setSavingSheet] = useState(false);
  const [sheetSaved, setSheetSaved] = useState(false);

  // NG集スプレッドシート同期
  const [ngSheetUrl, setNgSheetUrl] = useState("");
  const [ngSheetFormat, setNgSheetFormat] = useState<"rl" | "free">("rl");
  const [savingNgSheet, setSavingNgSheet] = useState(false);
  const [ngSheetSaved, setNgSheetSaved] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ imported: number; total: number; message: string } | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  // 商品詳細資料
  const [productFileName, setProductFileName] = useState<string | null>(null);
  const [uploadingProduct, setUploadingProduct] = useState(false);
  const [productUploadResult, setProductUploadResult] = useState<{ extractedLength: number; preview: string } | null>(null);
  const [productFileError, setProductFileError] = useState<string | null>(null);

  // 企業レギュレーション（ファイル）
  const [companyFileName, setCompanyFileName] = useState<string | null>(null);
  const [uploadingCompanyFile, setUploadingCompanyFile] = useState(false);
  const [companyUploadResult, setCompanyUploadResult] = useState<{ extractedLength: number; preview: string } | null>(null);
  const [companyFileError, setCompanyFileError] = useState<string | null>(null);


  useEffect(() => {
    Promise.all([
      fetch(`/api/projects/${id}`),
      fetch("/api/clients"),
    ]).then(async ([projRes, clientsRes]) => {
      if (!projRes.ok) { setNotFound(true); setLoading(false); return; }
      const data: Project = await projRes.json();
      const clientsData: Client[] = await clientsRes.json();
      setProject(data);
      setClients(clientsData);
      setName(data.name);
      setClientId(data.clientId ?? "");
      setDescription(data.description ?? "");
      setSheetUrl(data.sheetUrl ?? "");
      setNgSheetUrl(data.ngSheetUrl ?? "");
      setNgSheetFormat(data.ngSheetFormat ?? "rl");
      setProductFileName(data.productDetailsFileName ?? null);
      setCompanyFileName(data.companyRegulationsFileName ?? null);
      setCheckMode(data.checkMode ?? "soft");
      setLoading(false);
    });
  }, [id]);

  async function saveInfo() {
    setSavingInfo(true);
    const res = await fetch(`/api/projects/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, clientId: clientId || undefined, description, checkMode }),
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

  async function saveNgSheetUrl() {
    setSavingNgSheet(true);
    const res = await fetch(`/api/projects/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ngSheetUrl, ngSheetFormat }),
    });
    if (res.ok) {
      setNgSheetSaved(true);
      setTimeout(() => setNgSheetSaved(false), 2000);
    }
    setSavingNgSheet(false);
  }

  async function syncNgSheet() {
    setSyncing(true);
    setSyncResult(null);
    setSyncError(null);
    try {
      const res = await fetch(`/api/projects/${id}/sheets-sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ngSheetUrl }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSyncError(data.error ?? "同期に失敗しました");
      } else {
        setSyncResult({ imported: data.imported, total: data.total, message: data.message });
        if (ngSheetUrl) setNgSheetUrl(ngSheetUrl);
      }
    } catch {
      setSyncError("ネットワークエラーが発生しました");
    }
    setSyncing(false);
  }

  async function uploadProductFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setProductFileError(null);
    setUploadingProduct(true);
    setProductUploadResult(null);
    try {
      let extractedText = "";
      if (file.name.endsWith(".txt")) {
        extractedText = await file.text();
      } else {
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
      const res = await fetch(`/api/projects/${id}/product-details`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: file.name, extractedText }),
      });
      if (res.ok) {
        const data = await res.json();
        setProductFileName(file.name);
        setProductUploadResult({ extractedLength: data.extractedLength, preview: data.preview });
      } else {
        setProductFileError("アップロードに失敗しました");
      }
    } catch {
      setProductFileError("ファイルの解析に失敗しました");
    }
    setUploadingProduct(false);
    e.target.value = "";
  }

  async function deleteProductFile() {
    const res = await fetch(`/api/projects/${id}/product-details`, { method: "DELETE" });
    if (res.ok) {
      setProductFileName(null);
      setProductUploadResult(null);
    }
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
          {(project?.client?.name || project?.clientName) && (
            <p className="text-gray-400 mt-1">{project?.client?.name ?? project?.clientName}</p>
          )}
        </div>
        <Link
          href={`/works?project=${id}`}
          className="px-4 py-2 rounded-full text-sm font-medium border border-white/20 hover:border-white/40 transition-colors"
        >
          チェック履歴 →
        </Link>
      </div>

      {/* レギュレーションポータルへのリンク */}
      <Link
        href="/regulations"
        className="mb-8 flex items-center justify-between p-4 rounded-xl bg-violet-500/10 border border-violet-500/20 hover:bg-violet-500/15 transition-colors group"
      >
        <div>
          <p className="text-sm font-bold text-violet-300">レギュレーションポータル</p>
          <p className="text-xs text-gray-400 mt-0.5">NG事例・OK事例の一覧・検索・削除はこちらで管理できます</p>
        </div>
        <span className="text-violet-400 group-hover:translate-x-1 transition-transform text-sm">→</span>
      </Link>

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
              <label className="block text-xs text-gray-400 mb-1">クライアント</label>
              {clients.length > 0 ? (
                <select
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 focus:border-violet-500 focus:outline-none transition-colors text-sm"
                >
                  <option value="">未設定</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              ) : (
                <p className="text-xs text-gray-500 px-1">
                  ※ クライアントを先に登録すると紐付けられます →{" "}
                  <Link href="/clients" className="text-violet-400 hover:underline">クライアント管理</Link>
                </p>
              )}
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">備考</label>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2}
                className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 focus:border-violet-500 focus:outline-none transition-colors resize-none text-sm" />
            </div>
          </div>
            <div>
              <label className="block text-xs text-gray-400 mb-2">AIチェックモード</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setCheckMode("soft")}
                  className={`flex-1 py-2.5 px-4 rounded-xl text-sm font-semibold border transition-colors ${checkMode === "soft" ? "bg-green-500/20 text-green-300 border-green-500/40" : "border-white/10 text-gray-400 hover:border-white/20"}`}
                >
                  ソフト（推奨）<span className="block text-xs font-normal mt-0.5 opacity-70">企業レギュ・NG事例主体。法令は独自解釈しない</span>
                </button>
                <button
                  type="button"
                  onClick={() => setCheckMode("hard")}
                  className={`flex-1 py-2.5 px-4 rounded-xl text-sm font-semibold border transition-colors ${checkMode === "hard" ? "bg-orange-500/20 text-orange-300 border-orange-500/40" : "border-white/10 text-gray-400 hover:border-white/20"}`}
                >
                  ハード<span className="block text-xs font-normal mt-0.5 opacity-70">薬機法・景品表示法も含めて厳しくチェック</span>
                </button>
              </div>
            </div>
          <button onClick={saveInfo} disabled={savingInfo || !name.trim()}
            className="mt-4 px-5 py-2 rounded-xl text-sm font-semibold bg-violet-500 hover:bg-violet-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
            {infoSaved ? "✓ 保存しました" : savingInfo ? "保存中..." : "保存"}
          </button>
        </section>

        {/* 商品詳細資料 */}
        <section className="p-6 rounded-2xl border border-amber-500/20 bg-amber-500/5">
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <h2 className="text-lg font-bold">商品詳細資料</h2>
                <span className="text-xs px-2 py-0.5 rounded-full border border-violet-500/30 bg-violet-500/10 text-violet-300">AI参照</span>
              </div>
              <p className="text-sm text-gray-400">商材の特性・成分・効能・使用方法などをまとめた資料。AIチェック時に商品理解の前提として参照されます。</p>
            </div>
          </div>

          {productFileName ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3 p-3 rounded-xl bg-black/20 border border-amber-500/20">
                <span className="text-amber-300 text-lg">📄</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{productFileName}</p>
                  {productUploadResult && (
                    <p className="text-xs text-gray-500 mt-0.5">{productUploadResult.extractedLength.toLocaleString()} 文字 抽出済み</p>
                  )}
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <label className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white/10 hover:bg-white/15 transition-colors cursor-pointer">
                    差し替え
                    <input type="file" accept=".xlsx,.csv,.txt" onChange={uploadProductFile} className="hidden" />
                  </label>
                  <button onClick={deleteProductFile} className="px-3 py-1.5 rounded-lg text-xs font-semibold text-red-400 hover:bg-red-500/10 transition-colors">
                    削除
                  </button>
                </div>
              </div>
              {productUploadResult?.preview && (
                <div className="p-3 rounded-xl bg-black/20 border border-white/5">
                  <p className="text-xs text-gray-500 mb-1">プレビュー（先頭300文字）</p>
                  <p className="text-xs text-gray-400 font-mono whitespace-pre-wrap leading-relaxed">{productUploadResult.preview}</p>
                </div>
              )}
            </div>
          ) : (
            <label className={`flex flex-col items-center justify-center gap-2 p-8 rounded-xl border-2 border-dashed transition-colors cursor-pointer ${uploadingProduct ? "border-amber-500/50 bg-amber-500/5" : "border-white/10 hover:border-amber-500/40 hover:bg-amber-500/5"}`}>
              {uploadingProduct ? (
                <>
                  <div className="w-6 h-6 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
                  <span className="text-sm text-amber-300">解析中...</span>
                </>
              ) : (
                <>
                  <span className="text-2xl">📋</span>
                  <span className="text-sm font-medium text-gray-300">商品詳細資料をアップロード</span>
                  <span className="text-xs text-gray-500">Excel (.xlsx) / CSV / テキスト (.txt)</span>
                </>
              )}
              <input type="file" accept=".xlsx,.csv,.txt" onChange={uploadProductFile} className="hidden" disabled={uploadingProduct} />
            </label>
          )}
          {productFileError && (
            <p className="mt-2 text-xs text-red-400">{productFileError}</p>
          )}
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

        {/* NG集スプレッドシート同期 */}
        <section className="p-6 rounded-2xl border border-red-500/20 bg-red-500/5">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="text-lg font-bold">NG集シート同期</h2>
              <p className="text-sm text-gray-400 mt-1">
                過去のNG事例を記録したスプレッドシートから自動インポート。
              </p>
            </div>
            <span className="text-xs px-2 py-1 rounded-full border border-violet-500/30 bg-violet-500/10 text-violet-300 flex-shrink-0">AI参照</span>
          </div>
          <div className="flex gap-2 mb-3">
            <button
              onClick={() => setNgSheetFormat("rl")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${ngSheetFormat === "rl" ? "bg-red-500/20 border-red-500/40 text-red-300" : "bg-white/5 border-white/10 text-gray-400 hover:bg-white/10"}`}
            >
              アール形式
            </button>
            <button
              onClick={() => setNgSheetFormat("free")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${ngSheetFormat === "free" ? "bg-red-500/20 border-red-500/40 text-red-300" : "bg-white/5 border-white/10 text-gray-400 hover:bg-white/10"}`}
            >
              汎用形式（全テキスト取込）
            </button>
          </div>
          <p className="text-xs text-gray-600 mb-3">
            {ngSheetFormat === "rl"
              ? "タブ名に「テキスト」「画像」「動画」を含むシートのみ対象、ヘッダー3行目、クライアント指摘列を読み取ります。"
              : "全タブの全テキストセルを取込。フォーマット不問、空白・URL・画像ファイル名は自動スキップ。"}
          </p>
          <div className="flex gap-2 mb-3">
            <input
              type="url"
              value={ngSheetUrl}
              onChange={(e) => setNgSheetUrl(e.target.value)}
              placeholder="https://docs.google.com/spreadsheets/d/..."
              className="flex-1 px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 focus:border-red-500 focus:outline-none transition-colors text-sm font-mono"
            />
            <button
              onClick={saveNgSheetUrl}
              disabled={savingNgSheet}
              className="px-4 py-2.5 rounded-xl text-sm font-semibold bg-white/10 hover:bg-white/15 disabled:opacity-50 transition-colors whitespace-nowrap"
            >
              {ngSheetSaved ? "✓ 保存" : savingNgSheet ? "保存中..." : "URL保存"}
            </button>
          </div>
          <button
            onClick={syncNgSheet}
            disabled={syncing || !ngSheetUrl.trim()}
            className="w-full py-3 rounded-xl text-sm font-semibold bg-red-500/70 hover:bg-red-500/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
          >
            {syncing ? (
              <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />シートから取り込み中...</>
            ) : (
              "🔄 NG集シートからNG事例を取り込む"
            )}
          </button>
          {syncResult && (
            <div className="mt-3 p-3 rounded-xl bg-green-500/10 border border-green-500/30 text-sm text-green-300">
              ✓ {syncResult.message}
            </div>
          )}
          {syncError && (
            <div className="mt-3 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-sm text-red-300">
              ⚠ {syncError}
            </div>
          )}
        </section>

      </div>
    </div>
  );
}
