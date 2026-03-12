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
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // レギュレーションファイル
  const [regsFileName, setRegsFileName] = useState<string | null>(null);
  const [regsExtractedLength, setRegsExtractedLength] = useState<number | null>(null);
  const [regsPreview, setRegsPreview] = useState<string | null>(null);
  const [uploadingRegs, setUploadingRegs] = useState(false);
  const [regsFileError, setRegsFileError] = useState<string | null>(null);

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
      if (clientData.companyRegulations) {
        setRegsExtractedLength(clientData.companyRegulations.length);
        setRegsPreview(clientData.companyRegulations.slice(0, 300));
      }
      setProjects((projectsData as Project[]).filter((p) => p.clientId === id));
      setLoading(false);
    });
  }, [id]);

  async function saveName() {
    setSaving(true);
    const res = await fetch(`/api/clients/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (res.ok) {
      const updated = await res.json();
      setClient(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
    setSaving(false);
  }

  async function uploadRegsFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setRegsFileError(null);
    setUploadingRegs(true);

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

      const res = await fetch(`/api/clients/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyRegulations: extractedText }),
      });
      if (res.ok) {
        const updated = await res.json();
        setClient(updated);
        setRegsFileName(file.name);
        setRegsExtractedLength(extractedText.length);
        setRegsPreview(extractedText.slice(0, 300));
      } else {
        setRegsFileError("保存に失敗しました");
      }
    } catch {
      setRegsFileError("ファイルの解析に失敗しました");
    }
    setUploadingRegs(false);
    e.target.value = "";
  }

  async function deleteRegsFile() {
    const res = await fetch(`/api/clients/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyRegulations: "" }),
    });
    if (res.ok) {
      setRegsFileName(null);
      setRegsExtractedLength(null);
      setRegsPreview(null);
    }
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
            onClick={saveName}
            disabled={saving || !name.trim()}
            className="mt-4 px-5 py-2 rounded-xl text-sm font-semibold bg-violet-500 hover:bg-violet-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saved ? "✓ 保存しました" : saving ? "保存中..." : "保存"}
          </button>
        </section>

        {/* クライアント共通レギュレーション（ファイル） */}
        <section className="p-6 rounded-2xl border border-blue-500/20 bg-blue-500/5">
          <div className="flex items-start justify-between mb-2">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30 font-bold">全商材共通</span>
                <h2 className="text-lg font-bold">クライアント共通レギュレーション</h2>
              </div>
              <p className="text-sm text-gray-400">
                このクライアントの全商材に適用される共通ルール（Excel/CSV/TXT）。各商材のAIチェックに自動反映されます。
              </p>
            </div>
            <span className="text-xs px-2 py-1 rounded-full border border-violet-500/30 bg-violet-500/10 text-violet-300 flex-shrink-0">AI参照</span>
          </div>

          {(regsFileName || regsExtractedLength) ? (
            <div className="mt-4 p-4 rounded-xl border border-green-500/30 bg-green-500/10">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-green-400 text-lg">✓</span>
                  <div className="min-w-0">
                    {regsFileName && <p className="text-sm font-medium text-green-300 truncate">{regsFileName}</p>}
                    {regsExtractedLength && <p className="text-xs text-gray-400 mt-0.5">{regsExtractedLength} 文字を取り込み済み</p>}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <label className="px-3 py-1.5 rounded-lg text-xs font-medium border border-white/20 hover:bg-white/5 cursor-pointer transition-colors">
                    差し替え
                    <input type="file" accept=".xlsx,.xls,.csv,.txt" className="hidden" onChange={uploadRegsFile} />
                  </label>
                  <button
                    onClick={deleteRegsFile}
                    className="px-3 py-1.5 rounded-lg text-xs text-gray-500 hover:text-red-400 hover:bg-red-500/10 border border-white/10 hover:border-red-500/30 transition-colors"
                  >
                    削除
                  </button>
                </div>
              </div>
              {regsPreview && (
                <div className="mt-3 p-3 rounded-lg bg-black/30 border border-white/10">
                  <p className="text-xs text-gray-500 mb-1">取り込みプレビュー（先頭300文字）</p>
                  <pre className="text-xs text-gray-300 whitespace-pre-wrap font-mono leading-relaxed">{regsPreview}</pre>
                </div>
              )}
              {regsFileError && <p className="mt-2 text-sm text-red-400">{regsFileError}</p>}
            </div>
          ) : (
            <>
              <label className={`mt-4 flex flex-col items-center justify-center w-full py-8 rounded-xl border-2 border-dashed cursor-pointer transition-all ${uploadingRegs ? "border-blue-500/50 bg-blue-500/5" : "border-white/20 hover:border-blue-500/40 hover:bg-blue-500/5"}`}>
                <input type="file" accept=".xlsx,.xls,.csv,.txt" className="hidden" onChange={uploadRegsFile} disabled={uploadingRegs} />
                {uploadingRegs ? (
                  <><div className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin mb-2" /><p className="text-sm text-blue-300">解析中...</p></>
                ) : (
                  <><span className="text-2xl mb-2">📊</span><p className="text-sm font-medium text-gray-300">レギュレーションファイルをアップロード</p><p className="text-xs text-gray-500 mt-1">.xlsx .xls .csv .txt に対応</p></>
                )}
              </label>
              {regsFileError && <p className="mt-2 text-sm text-red-400">{regsFileError}</p>}
            </>
          )}
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
