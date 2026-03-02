"use client";

import { useState, useRef, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ContentType, Project } from "@/lib/types";

type InputMode = "file" | "text";

const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB
const ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "application/pdf",
];

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
  if (fileType.startsWith("video/")) return "video";
  return "pdf";
}

function SubmitForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [inputMode, setInputMode] = useState<InputMode>("file");

  const [form, setForm] = useState({
    title: "",
    targetCategory: "",
    customRegulations: "",
  });
  const [textContent, setTextContent] = useState("");
  const [textContentType, setTextContentType] = useState<"text" | "lp">("lp");

  // 複数ファイル対応
  const [files, setFiles] = useState<File[]>([]);
  const [dragOver, setDragOver] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState("");

  // Project state
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>(searchParams.get("project") ?? "");
  const [showNewProject, setShowNewProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectClient, setNewProjectClient] = useState("");
  const [creatingProject, setCreatingProject] = useState(false);

  useEffect(() => {
    fetch("/api/projects")
      .then((r) => r.json())
      .then((data) => setProjects(data))
      .catch(() => {});
  }, []);

  async function handleCreateProject() {
    if (!newProjectName.trim()) return;
    setCreatingProject(true);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newProjectName.trim(), clientName: newProjectClient.trim() }),
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
      // 重複チェック
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
    if (!form.title.trim()) {
      setError("タイトルを入力してください");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      if (inputMode === "file") {
        if (files.length === 0) {
          setError("ファイルを選択してください");
          setSubmitting(false);
          return;
        }

        const baseTitle = form.title.trim();
        const isMultiple = files.length > 1;
        const workIds: string[] = [];

        // ── Step 1: 全ファイルを登録 ──
        for (let i = 0; i < files.length; i++) {
          const f = files[i];
          const title = isMultiple ? `${baseTitle} (${i + 1}/${files.length})` : baseTitle;
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

        // ── Step 2: 全件AIチェック ──
        for (let i = 0; i < workIds.length; i++) {
          setProgress({ done: files.length + i, total: files.length * 2 });
          await fetch("/api/analyze", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ workId: workIds[i] }),
          });
        }

        setProgress({ done: files.length * 2, total: files.length * 2 });

        // 1件なら結果ページ、複数なら一覧へ
        if (workIds.length === 1) {
          router.push(`/works/${workIds[0]}`);
        } else {
          const qs = selectedProjectId ? `?project=${selectedProjectId}` : "";
          router.push(`/works${qs}`);
        }
      } else {
        // テキストモード（単一）
        if (!textContent.trim()) {
          setError("チェックするテキストを入力してください");
          setSubmitting(false);
          return;
        }
        const res = await fetch("/api/works", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: form.title,
            textContent,
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
        router.push(`/works/${id}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "登録に失敗しました");
      setSubmitting(false);
      setProgress(null);
    }
  }

  const submitLabel = () => {
    if (!submitting) {
      if (inputMode === "file" && files.length > 1) return `${files.length}件を登録してAIチェック`;
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

  return (
    <div className="max-w-2xl mx-auto px-4 py-12">
      <h1 className="text-3xl font-black mb-2">コンテンツを登録</h1>
      <p className="text-gray-400 mb-8">
        登録後、薬機法・景品表示法などへの適合性をAIが自動チェックします
      </p>

      {/* Input Mode Toggle */}
      <div className="flex gap-2 mb-8 p-1 rounded-xl bg-white/5 border border-white/10">
        {(["file", "text"] as InputMode[]).map((mode) => (
          <button
            key={mode}
            type="button"
            onClick={() => setInputMode(mode)}
            className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
              inputMode === mode
                ? "bg-violet-500 text-white"
                : "text-gray-400 hover:text-white"
            }`}
          >
            {mode === "file" ? "📎 ファイルアップロード" : "📝 テキスト・LP貼り付け"}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Project Selector */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            案件 <span className="text-gray-500">（任意）</span>
          </label>
          {!showNewProject ? (
            <div className="flex gap-2">
              <select
                value={selectedProjectId}
                onChange={(e) => setSelectedProjectId(e.target.value)}
                className="flex-1 px-4 py-3 rounded-xl bg-white/5 border border-white/10 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500 transition-colors"
              >
                <option value="" className="bg-gray-900">案件なし</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id} className="bg-gray-900">
                    {p.name}{p.clientName ? ` (${p.clientName})` : ""}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setShowNewProject(true)}
                className="px-4 py-3 rounded-xl text-sm font-medium border border-white/20 hover:border-violet-500/50 hover:bg-violet-500/10 transition-colors whitespace-nowrap"
              >
                ＋ 新規案件
              </button>
            </div>
          ) : (
            <div className="p-4 rounded-xl border border-violet-500/30 bg-violet-500/5 space-y-3">
              <p className="text-sm font-medium text-violet-300">新規案件を作成</p>
              <input
                type="text"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                placeholder="案件名 *"
                className="w-full px-4 py-2.5 rounded-lg bg-white/5 border border-white/10 focus:border-violet-500 focus:outline-none text-sm transition-colors"
              />
              <input
                type="text"
                value={newProjectClient}
                onChange={(e) => setNewProjectClient(e.target.value)}
                placeholder="クライアント名（任意）"
                className="w-full px-4 py-2.5 rounded-lg bg-white/5 border border-white/10 focus:border-violet-500 focus:outline-none text-sm transition-colors"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleCreateProject}
                  disabled={!newProjectName.trim() || creatingProject}
                  className="px-4 py-2 rounded-lg text-sm font-medium bg-violet-500 hover:bg-violet-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {creatingProject ? "作成中..." : "作成して選択"}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowNewProject(false); setNewProjectName(""); setNewProjectClient(""); }}
                  className="px-4 py-2 rounded-lg text-sm font-medium border border-white/20 hover:bg-white/5 transition-colors"
                >
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

        {/* Title */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            タイトル・管理名 <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="例: ○○サプリ LP 2025年3月版"
            required
            className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500 transition-colors"
          />
          {inputMode === "file" && files.length > 1 && (
            <p className="text-xs text-gray-500 mt-1">
              複数ファイル時は自動で「タイトル (1/N)」「タイトル (2/N)」と連番が付きます
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

        {/* File or Text Input */}
        {inputMode === "file" ? (
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              ファイル <span className="text-red-400">*</span>
              <span className="ml-2 text-xs text-gray-500 font-normal">複数選択・ドロップ可（画像・PDF）</span>
            </label>

            {/* Drop zone */}
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
                {files.length > 0 ? "さらに追加する場合はここをクリック／ドロップ" : "ファイルをドロップ、またはクリックして選択"}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                画像（JPEG/PNG/WebP/GIF）・動画（MP4/WebM/MOV）・PDF（最大500MB）
              </p>
            </div>

            {/* ファイルリスト */}
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
        ) : (
          <div>
            <div className="flex items-center gap-3 mb-3">
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
            </div>
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
          {submitting ? submitLabel() : submitLabel()}
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
