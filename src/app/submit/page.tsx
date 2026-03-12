"use client";

import { useState, useRef, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Client, ContentType, Project, MediaType } from "@/lib/types";

type InputMode = "file" | "text" | "url";

const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB
const ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "video/mp4",
  "video/webm",
  "video/quicktime",
];

const MEDIA_OPTIONS: MediaType[] = ["Meta", "Google", "ByteDance", "LINE", "SmartNews", "YDA"];

const TARGET_CATEGORIES = [
  "化粧品・スキンケア",
  "健康食品・サプリメント",
  "医薬部外品",
  "医療機器",
  "食品・飲料",
  "ダイエット・美容",
  "医療・クリニック",
  "エステ・サロン",
  "フィットネス・スポーツ",
  "その他",
];

function fileIcon(fileType: string) {
  if (fileType.startsWith("image/")) return "🖼️";
  if (fileType.startsWith("video/")) return "🎬";
  return "📄";
}

function inferContentType(fileType: string): ContentType {
  if (fileType.startsWith("image/")) return "image";
  return "video";
}

function SubmitForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const rawMode = searchParams.get("mode");
  const initialMode: InputMode = rawMode === "text" || rawMode === "url" ? rawMode : "file";
  const rawType = searchParams.get("type");
  const initialType: "text" | "lp" = rawType === "text" ? "text" : "lp";

  const [inputMode, setInputMode] = useState<InputMode>(initialMode);

  const [form, setForm] = useState({
    targetCategory: "",
    customRegulations: "",
    media: "" as MediaType | "",
  });
  const [textContent, setTextContent] = useState("");
  const [textContentType, setTextContentType] = useState<"text" | "lp">(initialType);
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");

  // 複数ファイル対応
  const [files, setFiles] = useState<File[]>([]);
  const [dragOver, setDragOver] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState("");

  // チェック結果サマリー
  type ResultItem = { id: string; name: string; status: "ng" | "warning" | "ok" };
  const [resultItems, setResultItems] = useState<ResultItem[]>([]);

  // Project / Client state
  const [projects, setProjects] = useState<Project[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [selectedProjectId, setSelectedProjectId] = useState<string>(searchParams.get("project") ?? "");
  const [showNewProject, setShowNewProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [creatingProject, setCreatingProject] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/projects").then((r) => r.json()),
      fetch("/api/clients").then((r) => r.json()),
    ]).then(([projectsData, clientsData]) => {
      setProjects(projectsData);
      setClients(clientsData);
      // URLパラメータでproject指定がある場合、対応クライアントを自動選択
      const presetProject = projectsData.find((p: Project) => p.id === (searchParams.get("project") ?? ""));
      if (presetProject?.clientId) setSelectedClientId(presetProject.clientId);
    }).catch(() => {});
  }, []);

  async function handleCreateProject() {
    if (!newProjectName.trim()) return;
    setCreatingProject(true);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newProjectName.trim(), clientId: selectedClientId || undefined }),
      });
      if (res.ok) {
        const project: Project = await res.json();
        setProjects((prev) => [project, ...prev]);
        setSelectedProjectId(project.id);
        setShowNewProject(false);
        setNewProjectName("");
        setNewProjectClient("");
      }
    } finally {
      setCreatingProject(false);
    }
  }

  function addFiles(incoming: FileList | File[]) {
    const arr = Array.from(incoming);
    const errors: string[] = [];
    const valid: File[] = [];

    for (const f of arr) {
      if (!ALLOWED_TYPES.includes(f.type)) {
        errors.push(`${f.name}: 対応していない形式です`);
        continue;
      }
      if (f.size > MAX_FILE_SIZE) {
        errors.push(`${f.name}: 500MB を超えています`);
        continue;
      }
      if (files.some((ex) => ex.name === f.name && ex.size === f.size)) continue;
      valid.push(f);
    }

    if (errors.length > 0) setError(errors.join("\n"));
    else setError("");

    setFiles((prev) => [...prev, ...valid]);
  }

  function removeFile(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError("");

    try {
      if (inputMode === "file") {
        if (files.length === 0) {
          setError("ファイルを選択してください");
          setSubmitting(false);
          return;
        }

        const workIds: string[] = [];

        // Step 1: 全ファイルを登録
        for (let i = 0; i < files.length; i++) {
          const f = files[i];
          const title = f.name;
          setProgress({ done: i, total: files.length * 2 });

          const fd = new FormData();
          fd.append("title", title);
          fd.append("contentType", inferContentType(f.type));
          fd.append("targetCategory", form.targetCategory);
          fd.append("customRegulations", form.customRegulations);
          fd.append("projectId", selectedProjectId);
          fd.append("file", f);

          const res = await fetch("/api/works", { method: "POST", body: fd });
          if (!res.ok) {
            const data = await res.json();
            throw new Error(data.error || `${f.name} の登録に失敗しました`);
          }
          const { id } = await res.json();
          workIds.push(id);
        }

        // Step 2: 全件AIチェック
        const results: ResultItem[] = [];
        for (let i = 0; i < workIds.length; i++) {
          setProgress({ done: files.length + i, total: files.length * 2 });
          const analyzeRes = await fetch("/api/analyze", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ workId: workIds[i], media: form.media || undefined }),
          });
          const analyzeData = await analyzeRes.json();
          results.push({
            id: workIds[i],
            name: files[i].name,
            status: analyzeData.complianceResult?.overallStatus ?? "warning",
          });
        }

        setProgress({ done: files.length * 2, total: files.length * 2 });
        setResultItems(results);

      } else if (inputMode === "url") {
        // URL モード（1件ずつ）
        if (!sourceUrl.trim()) {
          setError("URLを入力してください");
          setSubmitting(false);
          return;
        }
        if (!/^https?:\/\/.+/.test(sourceUrl.trim())) {
          setError("http:// または https:// から始まるURLを入力してください");
          setSubmitting(false);
          return;
        }

        const res = await fetch("/api/works", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: sourceUrl.trim(),
            sourceUrl: sourceUrl.trim(),
            contentType: "url",
            targetCategory: form.targetCategory,
            customRegulations: form.customRegulations,
            projectId: selectedProjectId || undefined,
          }),
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "登録に失敗しました");
        }
        const { id: urlWorkId } = await res.json();
        const analyzeRes = await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ workId: urlWorkId, media: form.media || undefined }),
        });
        const analyzeData = await analyzeRes.json();
        setResultItems([{
          id: urlWorkId,
          name: sourceUrl.trim(),
          status: analyzeData.complianceResult?.overallStatus ?? "warning",
        }]);

      } else {
        // テキストモード（単体 or 一括）
        const lines = bulkMode
          ? bulkText.split("\n").map((l) => l.trim()).filter((l) => l.length > 0)
          : textContent.trim() ? [textContent.trim()] : [];

        if (lines.length === 0) {
          setError("チェックするテキストを入力してください");
          setSubmitting(false);
          return;
        }

        const workIds: string[] = [];
        for (let i = 0; i < lines.length; i++) {
          setProgress({ done: i, total: lines.length * 2 });
          const res = await fetch("/api/works", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title: lines[i].slice(0, 40) || "テキスト",
              textContent: lines[i],
              contentType: textContentType,
              targetCategory: form.targetCategory,
              customRegulations: form.customRegulations,
              projectId: selectedProjectId || undefined,
            }),
          });
          if (!res.ok) {
            const data = await res.json();
            throw new Error(data.error || "登録に失敗しました");
          }
          const { id } = await res.json();
          workIds.push(id);
        }

        const results: ResultItem[] = [];
        for (let i = 0; i < workIds.length; i++) {
          setProgress({ done: lines.length + i, total: lines.length * 2 });
          const analyzeRes = await fetch("/api/analyze", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ workId: workIds[i], media: form.media || undefined }),
          });
          const analyzeData = await analyzeRes.json();
          results.push({
            id: workIds[i],
            name: lines[i],
            status: analyzeData.complianceResult?.overallStatus ?? "warning",
          });
        }
        setProgress({ done: lines.length * 2, total: lines.length * 2 });
        setResultItems(results);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "登録に失敗しました");
    } finally {
      setSubmitting(false);
      setProgress(null);
    }
  }

  const submitLabel = () => {
    if (!submitting) {
      if (inputMode === "file" && files.length > 1) return `${files.length}件を登録してAIチェック`;
      if (inputMode === "url") return "URLを取得してAIチェックへ";
      if (inputMode === "text" && bulkMode) {
        const count = bulkText.split("\n").filter((l) => l.trim()).length;
        return count > 0 ? `${count}件を一括AIチェック` : "一括AIチェック";
      }
      return "登録してAIチェックへ";
    }
    if (progress) {
      const { done, total } = progress;
      const half = total / 2;
      if (done < half) return `登録中... (${done + 1}/${half}件)`;
      return `AIチェック中... (${done - half + 1}/${half}件)`;
    }
    return "処理中...";
  };

  const STATUS_INFO = {
    ng:      { label: "NG",   cls: "bg-red-500/20 text-red-400 border-red-500/30" },
    warning: { label: "要注意", cls: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30" },
    ok:      { label: "OK",   cls: "bg-green-500/20 text-green-400 border-green-500/30" },
  };

  // 結果サマリー画面
  if (resultItems.length > 0) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12">
        <h1 className="text-3xl font-black mb-2">チェック完了</h1>
        <p className="text-gray-400 mb-8">{resultItems.length} 件のチェックが完了しました</p>

        <div className="space-y-3 mb-8">
          {resultItems.map((item) => {
            const s = STATUS_INFO[item.status];
            return (
              <div
                key={item.id}
                className="flex items-center gap-4 p-4 rounded-2xl border border-white/10 bg-white/5"
              >
                <span className={`flex-shrink-0 text-xs font-bold px-2.5 py-1 rounded-full border ${s.cls}`}>
                  {s.label}
                </span>
                <p className="flex-1 text-sm font-medium truncate">{item.name}</p>
                <a
                  href={`/works/${item.id}`}
                  className="flex-shrink-0 text-sm text-violet-400 hover:text-violet-300 transition-colors whitespace-nowrap"
                >
                  詳細を見る →
                </a>
              </div>
            );
          })}
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => { setResultItems([]); setFiles([]); setTextContent(""); setBulkText(""); setSourceUrl(""); setError(""); }}
            className="flex-1 py-3 rounded-xl font-semibold border border-white/20 hover:bg-white/5 transition-colors"
          >
            新しくチェックする
          </button>
          <a
            href="/works"
            className="flex-1 py-3 rounded-xl font-semibold text-center bg-gradient-to-r from-violet-500 to-pink-500 hover:from-violet-600 hover:to-pink-600 transition-all"
          >
            チェック履歴へ
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-12">
      <h1 className="text-3xl font-black mb-2">コンテンツを登録</h1>
      <p className="text-gray-400 mb-8">
        登録後、薬機法・景品表示法などへの適合性をAIが自動チェックします
      </p>

      {/* Input Mode Toggle */}
      <div className="flex gap-2 mb-8 p-1 rounded-xl bg-white/5 border border-white/10">
        {([
          { key: "file", label: "📎 ファイル" },
          { key: "text", label: "📝 テキスト貼り付け" },
          { key: "url",  label: "🔗 URL取得" },
        ] as { key: InputMode; label: string }[]).map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setInputMode(key)}
            className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
              inputMode === key
                ? "bg-violet-500 text-white"
                : "text-gray-400 hover:text-white"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Project Selector: クライアント → 商材の2段階 */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-300">
            案件 <span className="text-gray-500">（任意）</span>
          </label>
          {clients.length > 0 && (
            <select
              value={selectedClientId}
              onChange={(e) => { setSelectedClientId(e.target.value); setSelectedProjectId(""); }}
              className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 focus:border-blue-500 focus:outline-none transition-colors text-sm"
            >
              <option value="" className="bg-gray-900">① クライアントを選択</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id} className="bg-gray-900">{c.name}</option>
              ))}
            </select>
          )}
          {!showNewProject ? (
            <div className="flex gap-2">
              <select
                value={selectedProjectId}
                onChange={(e) => setSelectedProjectId(e.target.value)}
                className="flex-1 px-4 py-3 rounded-xl bg-white/5 border border-white/10 focus:border-violet-500 focus:outline-none transition-colors"
              >
                <option value="" className="bg-gray-900">
                  {clients.length > 0 ? "② 商材・案件を選択" : "案件なし"}
                </option>
                {projects
                  .filter((p) => selectedClientId ? p.clientId === selectedClientId : true)
                  .map((p) => (
                    <option key={p.id} value={p.id} className="bg-gray-900">
                      {p.name}
                    </option>
                  ))}
              </select>
              <button
                type="button"
                onClick={() => setShowNewProject(true)}
                className="px-4 py-3 rounded-xl text-sm font-medium border border-white/20 hover:border-violet-500/50 hover:bg-violet-500/10 transition-colors whitespace-nowrap"
              >
                ＋ 新規
              </button>
            </div>
          ) : (
            <div className="p-4 rounded-xl border border-violet-500/30 bg-violet-500/5 space-y-3">
              <p className="text-sm font-medium text-violet-300">新規案件を作成</p>
              <input
                type="text"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                placeholder="案件名・商材名 *"
                className="w-full px-4 py-2.5 rounded-lg bg-white/5 border border-white/10 focus:border-violet-500 focus:outline-none text-sm transition-colors"
              />
              <div className="flex gap-2">
                <button type="button" onClick={handleCreateProject} disabled={!newProjectName.trim() || creatingProject}
                  className="px-4 py-2 rounded-lg text-sm font-medium bg-violet-500 hover:bg-violet-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                  {creatingProject ? "作成中..." : "作成して選択"}
                </button>
                <button type="button" onClick={() => { setShowNewProject(false); setNewProjectName(""); }}
                  className="px-4 py-2 rounded-lg text-sm font-medium border border-white/20 hover:bg-white/5 transition-colors">
                  キャンセル
                </button>
              </div>
            </div>
          )}
          {selectedProjectId && !showNewProject && (
            <p className="text-xs text-violet-400 mt-1">
              ✓ {projects.find((p) => p.id === selectedProjectId)?.name} に登録されます
            </p>
          )}
        </div>

        {/* Target Category */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            商品・サービスカテゴリ <span className="text-gray-500">（推奨）</span>
          </label>
          <select
            value={form.targetCategory}
            onChange={(e) => setForm({ ...form, targetCategory: e.target.value })}
            className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500 transition-colors"
          >
            <option value="" className="bg-gray-900">未選択（一般規制でチェック）</option>
            {TARGET_CATEGORIES.map((cat) => (
              <option key={cat} value={cat} className="bg-gray-900">
                {cat}
              </option>
            ))}
          </select>
          <p className="text-xs text-gray-500 mt-1">
            カテゴリを指定すると、そのカテゴリに特有の規制を重点的にチェックします
          </p>
        </div>

        {/* Media Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            媒体 <span className="text-gray-500">（任意）</span>
          </label>
          <div className="flex flex-wrap gap-2">
            {MEDIA_OPTIONS.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setForm({ ...form, media: form.media === m ? "" : m })}
                className={`px-4 py-2 rounded-full text-sm font-semibold transition-colors border ${
                  form.media === m
                    ? "bg-violet-500 text-white border-violet-500"
                    : "bg-white/5 text-gray-400 border-white/10 hover:border-violet-500/50 hover:text-white"
                }`}
              >
                {m}
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-500 mt-1">
            媒体を選択すると、その媒体のレギュレーションを考慮してチェックします
          </p>
        </div>

        {/* ── Input area ── */}
        {inputMode === "file" ? (
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              ファイル <span className="text-red-400">*</span>
              <span className="ml-2 text-xs text-gray-500 font-normal">複数選択・ドロップ可（画像・動画）</span>
            </label>

            <div
              className={`rounded-2xl border-2 border-dashed transition-colors p-8 text-center cursor-pointer ${
                dragOver
                  ? "border-violet-400 bg-violet-500/10"
                  : files.length > 0
                  ? "border-violet-500/40 bg-violet-500/5"
                  : "border-white/20 hover:border-white/40"
              }`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                if (e.dataTransfer.files.length > 0) addFiles(e.dataTransfer.files);
              }}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept={ALLOWED_TYPES.join(",")}
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files.length > 0) {
                    addFiles(e.target.files);
                    e.target.value = "";
                  }
                }}
              />
              <div className="text-3xl mb-2">📂</div>
              <p className="font-semibold text-sm">
                {files.length > 0
                  ? "さらに追加する場合はここをクリック／ドロップ"
                  : "ファイルをドロップ、またはクリックして選択"}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                画像（JPEG/PNG/WebP/GIF）・動画（MP4/WebM/MOV）（最大500MB）
              </p>
            </div>

            {files.length > 0 && (
              <div className="mt-3 space-y-2">
                <p className="text-xs text-gray-400">{files.length} 件選択中</p>
                {files.map((f, i) => (
                  <div
                    key={`${f.name}-${f.size}-${i}`}
                    className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-white/5 border border-white/10"
                  >
                    <span className="text-xl flex-shrink-0">{fileIcon(f.type)}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{f.name}</p>
                      <p className="text-xs text-gray-500">{(f.size / 1024 / 1024).toFixed(2)} MB</p>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); removeFile(i); }}
                      className="text-gray-600 hover:text-red-400 transition-colors text-sm px-2 py-1 rounded hover:bg-red-500/10 flex-shrink-0"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

        ) : inputMode === "url" ? (
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              チェックするページのURL <span className="text-red-400">*</span>
            </label>
            <input
              type="url"
              value={sourceUrl}
              onChange={(e) => setSourceUrl(e.target.value)}
              placeholder="https://example.com/lp/product"
              className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500 transition-colors font-mono text-sm"
            />
            <p className="text-xs text-gray-500 mt-2">
              登録時にページのHTMLを取得してテキストを抽出します。<br />
              JavaScriptで描画されるSPAページは取得できない場合があります。
            </p>
          </div>

        ) : (
          <div>
            <div className="flex items-center gap-3 mb-3 flex-wrap">
              <label className="block text-sm font-medium text-gray-300">
                コンテンツ種別 <span className="text-red-400">*</span>
              </label>
              <div className="flex gap-2">
                {(["lp", "text"] as const).map((ct) => (
                  <button
                    key={ct}
                    type="button"
                    onClick={() => setTextContentType(ct)}
                    className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                      textContentType === ct
                        ? "bg-violet-500 text-white"
                        : "bg-white/5 text-gray-400 hover:bg-white/10"
                    }`}
                  >
                    {ct === "lp" ? "LP・記事" : "テキスト広告・原稿"}
                  </button>
                ))}
              </div>
              {/* 一括モードトグル（テキスト広告のみ） */}
              {textContentType === "text" && (
                <button
                  type="button"
                  onClick={() => setBulkMode((v) => !v)}
                  className={`ml-auto px-3 py-1 rounded-full text-xs font-bold border transition-colors ${
                    bulkMode
                      ? "bg-orange-500/20 text-orange-300 border-orange-500/40"
                      : "bg-white/5 text-gray-400 border-white/10 hover:border-orange-500/40 hover:text-orange-300"
                  }`}
                >
                  {bulkMode ? "✓ 一括モード" : "一括モード"}
                </button>
              )}
            </div>

            {bulkMode && textContentType === "text" ? (
              <>
                <div className="mb-2 p-3 rounded-xl bg-orange-500/10 border border-orange-500/20 text-xs text-orange-300">
                  <strong>1行につき1件</strong>でチェックします。改行で区切って複数のテキストCRを貼り付けてください。
                </div>
                <textarea
                  value={bulkText}
                  onChange={(e) => setBulkText(e.target.value)}
                  placeholder={"例:\n若々しい肌へ導く美容液\nコシのある髪に\n毎朝スッキリ目覚める\n飲むだけで簡単ダイエット"}
                  rows={14}
                  className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 transition-colors resize-none font-mono text-sm"
                />
                <p className="text-xs text-gray-500 mt-1">
                  {bulkText.split("\n").filter((l) => l.trim()).length} 件
                </p>
              </>
            ) : (
              <>
                <textarea
                  value={textContent}
                  onChange={(e) => setTextContent(e.target.value)}
                  placeholder={
                    textContentType === "lp"
                      ? "LPのテキスト内容を貼り付けてください（見出し・本文・キャッチコピーなど）"
                      : "広告テキスト・原稿・キャッチコピーなどを貼り付けてください"
                  }
                  rows={12}
                  className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500 transition-colors resize-none font-mono text-sm"
                />
                <p className="text-xs text-gray-500 mt-1">{textContent.length} 文字</p>
              </>
            )}
          </div>
        )}

        {/* Custom Regulations */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            追加チェック項目・レギュレーション <span className="text-gray-500">（任意）</span>
          </label>
          <textarea
            value={form.customRegulations}
            onChange={(e) => setForm({ ...form, customRegulations: e.target.value })}
            placeholder={`例:\n- 競合他社名の言及禁止\n- 「最安値」「業界No.1」表現禁止\n- Meta広告ポリシー準拠\n- 特定の訴求文言の使用禁止`}
            rows={4}
            className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500 transition-colors resize-none text-sm"
          />
        </div>

        {error && (
          <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm whitespace-pre-line">
            {error}
          </div>
        )}

        {/* Progress bar */}
        {submitting && progress && (
          <div className="space-y-2">
            <div className="w-full bg-white/10 rounded-full h-2">
              <div
                className="bg-gradient-to-r from-violet-500 to-pink-500 h-2 rounded-full transition-all duration-500"
                style={{ width: `${(progress.done / progress.total) * 100}%` }}
              />
            </div>
            <p className="text-xs text-center text-gray-400">{submitLabel()}</p>
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full py-4 rounded-xl font-bold text-lg bg-gradient-to-r from-violet-500 to-pink-500 hover:from-violet-600 hover:to-pink-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
          {submitLabel()}
        </button>
      </form>
    </div>
  );
}

export default function SubmitPage() {
  return (
    <Suspense fallback={<div className="text-center py-20 text-gray-500">読み込み中...</div>}>
      <SubmitForm />
    </Suspense>
  );
}
