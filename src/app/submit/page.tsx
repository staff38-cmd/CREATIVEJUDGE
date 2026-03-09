"use client";

import { useState, useRef, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ContentType,
  MediaPlatform,
  CreativeType,
  ChecklistItem,
  CheckStatus,
  ComplianceResult,
  Project,
  MEDIA_PLATFORM_LABELS,
  MEDIA_PLATFORM_ICONS,
  MEDIA_PLATFORM_RULES,
  CREATIVE_TYPE_LABELS,
  RISK_LEVEL_LABELS,
  CHECK_STATUS_LABELS,
} from "@/lib/types";

// ── 定数 ────────────────────────────────────────────────────────────────────

const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB
const ALLOWED_TYPES = [
  "image/jpeg", "image/png", "image/gif", "image/webp",
  "video/mp4", "video/webm", "video/quicktime",
];
const TARGET_CATEGORIES = [
  "化粧品・スキンケア", "健康食品・サプリメント", "医薬部外品", "医療機器",
  "食品・飲料", "ダイエット・美容", "医療・クリニック", "エステ・サロン",
  "フィットネス・スポーツ", "その他",
];
const STEPS = [
  { id: 1, label: "案件選択" },
  { id: 2, label: "媒体・CR種別" },
  { id: 3, label: "クリエイティブ登録" },
  { id: 4, label: "AIチェック" },
  { id: 5, label: "チェックリスト" },
  { id: 6, label: "ダブルチェック" },
];

type InputMode = "file" | "text" | "url";

// ── ユーティリティ ───────────────────────────────────────────────────────────

function inferContentType(fileType: string): ContentType {
  if (fileType.startsWith("image/")) return "image";
  return "video";
}

function fileIcon(fileType: string) {
  if (fileType.startsWith("image/")) return "🖼️";
  return "🎬";
}

function generateChecklist(
  aiResult: ComplianceResult,
  platforms: MediaPlatform[]
): ChecklistItem[] {
  const items: ChecklistItem[] = [];

  // AI検出の指摘事項
  for (const issue of aiResult.issues) {
    if (issue.level === "ok") continue;
    items.push({
      id: crypto.randomUUID(),
      category: issue.category,
      description: `${issue.title}${issue.quote ? ` ——「${issue.quote}」` : ""}`,
      status: issue.level === "violation" ? "ng" : "unchecked",
      isAiGenerated: true,
      aiIssueLevel: issue.level,
      note: issue.suggestion,
    });
  }

  // 媒体固有のチェック項目
  for (const platform of platforms) {
    for (const rule of MEDIA_PLATFORM_RULES[platform]) {
      items.push({
        id: crypto.randomUUID(),
        category: MEDIA_PLATFORM_LABELS[platform],
        description: rule,
        status: "unchecked",
        isAiGenerated: false,
      });
    }
  }

  // 標準チェック項目
  const standard = [
    { category: "薬機法", description: "医薬品的効能効果の不当標榜（治す・治療・改善等）がないか確認" },
    { category: "景品表示法", description: "根拠のない優良誤認表現（No.1・最高・業界初等）がないか確認" },
    { category: "健康増進法", description: "科学的根拠のない誇大な健康効果の表現がないか確認" },
    { category: "一般確認", description: "効果効能を裏付ける根拠資料が存在するか確認" },
    { category: "一般確認", description: "免責表記・注意書きが適切に記載されているか確認" },
  ];
  for (const s of standard) {
    items.push({ id: crypto.randomUUID(), ...s, status: "unchecked", isAiGenerated: false });
  }

  return items;
}

// ── メインコンポーネント ─────────────────────────────────────────────────────

function SubmitWizard() {
  const searchParams = useSearchParams();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ウィザードステップ
  const [step, setStep] = useState(1);

  // Step 1: 案件選択
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState(searchParams.get("project") ?? "");
  const [showNewProject, setShowNewProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectClient, setNewProjectClient] = useState("");
  const [creatingProject, setCreatingProject] = useState(false);

  // Step 2: 媒体・CR種別
  const [mediaPlatforms, setMediaPlatforms] = useState<MediaPlatform[]>([]);
  const [creativeType, setCreativeType] = useState<CreativeType>("banner");

  // Step 3: クリエイティブ登録
  const rawMode = searchParams.get("mode");
  const initialMode: InputMode = rawMode === "text" || rawMode === "url" ? rawMode : "file";
  const rawType = searchParams.get("type");
  const initialTextType: "text" | "lp" = rawType === "text" ? "text" : "lp";

  const [inputMode, setInputMode] = useState<InputMode>(initialMode);
  const [targetCategory, setTargetCategory] = useState("");
  const [customRegulations, setCustomRegulations] = useState("");

  // ファイルモード（複数対応）
  const [files, setFiles] = useState<File[]>([]);
  const [dragOver, setDragOver] = useState(false);

  // テキストモード
  const [textContent, setTextContent] = useState("");
  const [textContentType, setTextContentType] = useState<"text" | "lp">(initialTextType);

  // URLモード
  const [sourceUrl, setSourceUrl] = useState("");

  // Step 4: AIチェック
  const [workIds, setWorkIds] = useState<string[]>([]);
  const [registering, setRegistering] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [aiResults, setAiResults] = useState<ComplianceResult[]>([]);

  // Step 5: チェックリスト
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [checkerName, setCheckerName] = useState("");

  // Step 6: ダブルチェック & 提出
  const [doubleCheckerName, setDoubleCheckerName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // エラー
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/projects")
      .then((r) => r.json())
      .then((data) => setProjects(data))
      .catch(() => {});
  }, []);

  // ── 案件作成 ──────────────────────────────────────────────────────────────
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

  // ── ファイル管理 ──────────────────────────────────────────────────────────
  function addFiles(incoming: FileList | File[]) {
    const arr = Array.from(incoming);
    const errors: string[] = [];
    const valid: File[] = [];
    for (const f of arr) {
      if (!ALLOWED_TYPES.includes(f.type)) { errors.push(`${f.name}: 対応していない形式`); continue; }
      if (f.size > MAX_FILE_SIZE) { errors.push(`${f.name}: 500MB超え`); continue; }
      if (files.some((ex) => ex.name === f.name && ex.size === f.size)) continue;
      valid.push(f);
    }
    if (errors.length > 0) setError(errors.join("\n")); else setError("");
    setFiles((prev) => [...prev, ...valid]);
  }

  // ── Step 3→4: 登録 & AIチェック ──────────────────────────────────────────
  async function handleRegisterAndAnalyze() {
    setError("");

    if (inputMode === "file" && files.length === 0) { setError("ファイルを選択してください"); return; }
    if (inputMode === "text" && !textContent.trim()) { setError("テキストを入力してください"); return; }
    if (inputMode === "url") {
      if (!sourceUrl.trim()) { setError("URLを入力してください"); return; }
      if (!/^https?:\/\/.+/.test(sourceUrl.trim())) { setError("http:// または https:// から始まるURLを入力してください"); return; }
    }

    setRegistering(true);
    setStep(4);

    const selectedProject = projects.find((p) => p.id === selectedProjectId);
    const projectRegulations = [
      selectedProject?.companyRegulations,
      selectedProject?.regulations,
      customRegulations,
    ].filter(Boolean).join("\n");

    try {
      const ids: string[] = [];

      if (inputMode === "file") {
        const total = files.length * 2;
        // Step 1: 登録
        for (let i = 0; i < files.length; i++) {
          setProgress({ done: i, total });
          const f = files[i];
          const fd = new FormData();
          fd.append("title", f.name);
          fd.append("contentType", inferContentType(f.type));
          fd.append("targetCategory", targetCategory);
          fd.append("customRegulations", projectRegulations);
          fd.append("projectId", selectedProjectId);
          fd.append("mediaPlatforms", JSON.stringify(mediaPlatforms));
          fd.append("creativeType", creativeType);
          fd.append("file", f);
          const res = await fetch("/api/works", { method: "POST", body: fd });
          if (!res.ok) throw new Error((await res.json()).error || `${f.name} の登録に失敗しました`);
          ids.push((await res.json()).id);
        }
        setRegistering(false);
        setAnalyzing(true);
        // Step 2: AIチェック
        const results: ComplianceResult[] = [];
        for (let i = 0; i < ids.length; i++) {
          setProgress({ done: files.length + i, total });
          const analyzeRes = await fetch("/api/analyze", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ workId: ids[i] }),
          });
          const data = await analyzeRes.json();
          results.push(data.complianceResult ?? data);
        }
        setProgress({ done: total, total });
        setAiResults(results);
        setWorkIds(ids);

        // 全結果を統合してチェックリスト生成
        const merged: ComplianceResult = {
          overallStatus: results.some((r) => r.overallStatus === "ng") ? "ng"
            : results.some((r) => r.overallStatus === "warning") ? "warning" : "ok",
          issues: results.flatMap((r) => r.issues ?? []),
          summary: `${results.length}件のクリエイティブをチェックしました`,
          checkedAt: new Date().toISOString(),
        };
        setChecklist(generateChecklist(merged, mediaPlatforms));

      } else {
        // text / url: 1件
        const body = inputMode === "url"
          ? { title: sourceUrl.trim(), sourceUrl: sourceUrl.trim(), contentType: "url" as ContentType, targetCategory, customRegulations: projectRegulations, projectId: selectedProjectId || undefined, mediaPlatforms, creativeType }
          : { title: textContent.trim().slice(0, 40) || "テキスト", textContent, contentType: textContentType as ContentType, targetCategory, customRegulations: projectRegulations, projectId: selectedProjectId || undefined, mediaPlatforms, creativeType };

        setProgress({ done: 0, total: 2 });
        const res = await fetch("/api/works", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        if (!res.ok) throw new Error((await res.json()).error || "登録に失敗しました");
        const { id } = await res.json();
        ids.push(id);
        setRegistering(false);
        setAnalyzing(true);
        setProgress({ done: 1, total: 2 });
        const analyzeRes = await fetch("/api/analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workId: id }) });
        const data = await analyzeRes.json();
        const result: ComplianceResult = data.complianceResult ?? data;
        setProgress({ done: 2, total: 2 });
        setAiResults([result]);
        setWorkIds([id]);
        setChecklist(generateChecklist(result, mediaPlatforms));
      }

    } catch (e) {
      setError(e instanceof Error ? e.message : "エラーが発生しました");
      setStep(3);
    } finally {
      setRegistering(false);
      setAnalyzing(false);
      setProgress(null);
    }
  }

  // ── Step 5→6: チェックリスト確定 ─────────────────────────────────────────
  function handleChecklistNext() {
    if (!checkerName.trim()) { setError("一次チェック者名を入力してください"); return; }
    setError("");
    setStep(6);
  }

  // ── Step 6: 最終提出 ──────────────────────────────────────────────────────
  async function handleFinalSubmit() {
    if (!doubleCheckerName.trim()) { setError("ダブルチェック者名を入力してください"); return; }
    setError("");
    setSubmitting(true);

    const approvals = [
      { approverName: checkerName, approvedAt: new Date().toISOString(), role: "checker" as const },
      { approverName: doubleCheckerName, approvedAt: new Date().toISOString(), role: "double_checker" as const },
    ];

    try {
      // 全workIdに一括保存
      await Promise.all(workIds.map((id) =>
        fetch(`/api/works/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ checklist, approvals, checkerName, finalSubmittedAt: new Date().toISOString() }),
        })
      ));
      setStep(7);
    } catch {
      setError("提出に失敗しました");
    } finally {
      setSubmitting(false);
    }
  }

  // ── ヘルパー ──────────────────────────────────────────────────────────────
  function updateChecklistItem(itemId: string, status: CheckStatus) {
    setChecklist((prev) => prev.map((item) => item.id === itemId ? { ...item, status } : item));
  }

  function togglePlatform(platform: MediaPlatform) {
    setMediaPlatforms((prev) =>
      prev.includes(platform) ? prev.filter((p) => p !== platform) : [...prev, platform]
    );
  }

  const ngCount = checklist.filter((i) => i.status === "ng").length;
  const uncheckedCount = checklist.filter((i) => i.status === "unchecked").length;
  const blockReasons: string[] = [];
  if (ngCount > 0) blockReasons.push(`NG項目が ${ngCount} 件あります（修正が必要です）`);
  if (uncheckedCount > 0) blockReasons.push(`未確認項目が ${uncheckedCount} 件あります`);
  if (!checkerName.trim()) blockReasons.push("一次チェック者名が入力されていません");
  if (!doubleCheckerName.trim()) blockReasons.push("ダブルチェック者名が入力されていません");

  // ── ステッパー ────────────────────────────────────────────────────────────
  function StepIndicator() {
    if (step >= 7) return null;
    return (
      <div className="flex items-center gap-0 mb-8 overflow-x-auto pb-1">
        {STEPS.map((s, i) => (
          <div key={s.id} className="flex items-center flex-shrink-0">
            <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
              s.id === step ? "bg-violet-500/20 text-violet-300 border border-violet-500/50" :
              s.id < step ? "text-green-400" : "text-gray-600"
            }`}>
              <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${
                s.id < step ? "bg-green-500 text-white" :
                s.id === step ? "bg-violet-500 text-white" : "bg-white/10 text-gray-500"
              }`}>
                {s.id < step ? "✓" : s.id}
              </span>
              {s.label}
            </div>
            {i < STEPS.length - 1 && (
              <div className={`w-3 h-px mx-0.5 ${s.id < step ? "bg-green-500/50" : "bg-white/10"}`} />
            )}
          </div>
        ))}
      </div>
    );
  }

  // ── Step 1: 案件選択 ──────────────────────────────────────────────────────
  function renderStep1() {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold mb-1">案件を選択</h2>
          <p className="text-gray-400 text-sm">チェックする広告が属する案件を選択してください（任意）。</p>
        </div>

        {/* 案件リスト */}
        {projects.length > 0 && (
          <div className="space-y-2">
            {/* 案件なしオプション */}
            <button
              onClick={() => { setSelectedProjectId(""); setShowNewProject(false); }}
              className={`w-full p-3 rounded-xl border text-left transition-colors ${
                selectedProjectId === "" && !showNewProject
                  ? "border-violet-500 bg-violet-500/10"
                  : "border-white/10 bg-white/5 hover:border-white/20"
              }`}
            >
              <div className="text-sm text-gray-400">案件に紐付けない</div>
            </button>
            {projects.map((p) => (
              <button
                key={p.id}
                onClick={() => { setSelectedProjectId(p.id); setShowNewProject(false); }}
                className={`w-full p-4 rounded-xl border text-left transition-colors ${
                  selectedProjectId === p.id
                    ? "border-violet-500 bg-violet-500/10"
                    : "border-white/10 bg-white/5 hover:border-white/20"
                }`}
              >
                <div className="font-semibold text-sm">{p.name}</div>
                {p.clientName && <div className="text-xs text-gray-400 mt-0.5">{p.clientName}</div>}
                {(p.companyRegulations || p.regulations) && (
                  <div className="text-xs text-violet-400 mt-1">
                    レギュレーション設定あり
                  </div>
                )}
              </button>
            ))}
          </div>
        )}

        {projects.length === 0 && !showNewProject && (
          <div className="p-4 rounded-xl border border-white/10 bg-white/5 text-center text-sm text-gray-500">
            案件がまだありません
          </div>
        )}

        {/* 新規案件作成 */}
        <button
          onClick={() => { setShowNewProject(!showNewProject); setSelectedProjectId(""); }}
          className="flex items-center gap-2 text-sm text-violet-400 hover:text-violet-300 transition-colors"
        >
          <span>{showNewProject ? "−" : "+"}</span>
          新規案件を作成
        </button>

        {showNewProject && (
          <div className="p-4 rounded-xl border border-violet-500/30 bg-violet-500/5 space-y-3">
            <p className="text-sm font-medium text-violet-300">新規案件</p>
            <input
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              placeholder="案件名 *"
              className="w-full px-3 py-2.5 rounded-lg bg-white/5 border border-white/10 focus:border-violet-500 focus:outline-none text-sm"
            />
            <input
              value={newProjectClient}
              onChange={(e) => setNewProjectClient(e.target.value)}
              placeholder="クライアント名（任意）"
              className="w-full px-3 py-2.5 rounded-lg bg-white/5 border border-white/10 focus:border-violet-500 focus:outline-none text-sm"
            />
            <div className="flex gap-2">
              <button
                onClick={handleCreateProject}
                disabled={!newProjectName.trim() || creatingProject}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-violet-500 hover:bg-violet-600 disabled:opacity-50 transition-colors"
              >
                {creatingProject ? "作成中..." : "作成して選択"}
              </button>
              <button
                onClick={() => { setShowNewProject(false); setNewProjectName(""); setNewProjectClient(""); }}
                className="px-4 py-2 rounded-lg text-sm border border-white/20 hover:bg-white/5 transition-colors"
              >
                キャンセル
              </button>
            </div>
          </div>
        )}

        {error && <ErrorBanner message={error} />}

        <div className="flex justify-end pt-2">
          <button
            onClick={() => { setError(""); setStep(2); }}
            className="px-8 py-3 rounded-xl font-semibold bg-gradient-to-r from-violet-500 to-pink-500 hover:from-violet-600 hover:to-pink-600 transition-all"
          >
            次へ →
          </button>
        </div>
      </div>
    );
  }

  // ── Step 2: 媒体・CR種別 ─────────────────────────────────────────────────
  function renderStep2() {
    return (
      <div className="space-y-8">
        <div>
          <h2 className="text-2xl font-bold mb-1">媒体・CR種別を選択</h2>
          <p className="text-gray-400 text-sm">出稿媒体を選択すると、媒体固有のチェック項目が自動追加されます。</p>
        </div>

        {/* 媒体選択 */}
        <div>
          <h3 className="text-sm font-semibold text-gray-300 mb-3">
            出稿媒体 <span className="font-normal text-gray-500">（複数選択可・任意）</span>
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {(Object.entries(MEDIA_PLATFORM_LABELS) as [MediaPlatform, string][]).map(([platform, label]) => {
              const isSelected = mediaPlatforms.includes(platform);
              return (
                <button
                  key={platform}
                  onClick={() => togglePlatform(platform)}
                  className={`p-3 rounded-xl border text-left transition-colors ${
                    isSelected ? "border-violet-500 bg-violet-500/10" : "border-white/10 bg-white/5 hover:border-white/20"
                  }`}
                >
                  <div className="text-xl mb-1">{MEDIA_PLATFORM_ICONS[platform]}</div>
                  <div className={`text-xs font-medium ${isSelected ? "text-violet-300" : "text-gray-300"}`}>{label}</div>
                  {isSelected && MEDIA_PLATFORM_RULES[platform].length > 0 && (
                    <div className="text-[10px] text-violet-400 mt-0.5">+{MEDIA_PLATFORM_RULES[platform].length}項目</div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* CR種別 */}
        <div>
          <h3 className="text-sm font-semibold text-gray-300 mb-3">CR種別</h3>
          <div className="flex flex-wrap gap-2">
            {(Object.entries(CREATIVE_TYPE_LABELS) as [CreativeType, string][]).map(([type, label]) => (
              <button
                key={type}
                onClick={() => setCreativeType(type)}
                className={`px-4 py-2 rounded-xl border text-sm font-medium transition-colors ${
                  creativeType === type
                    ? "border-pink-500 bg-pink-500/10 text-pink-300"
                    : "border-white/10 bg-white/5 text-gray-400 hover:border-white/20"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex justify-between pt-2">
          <button onClick={() => { setError(""); setStep(1); }} className="px-6 py-3 rounded-xl border border-white/20 hover:border-white/40 text-sm transition-colors">← 戻る</button>
          <button onClick={() => { setError(""); setStep(3); }} className="px-8 py-3 rounded-xl font-semibold bg-gradient-to-r from-violet-500 to-pink-500 hover:from-violet-600 hover:to-pink-600 transition-all">次へ →</button>
        </div>
      </div>
    );
  }

  // ── Step 3: クリエイティブ登録 ───────────────────────────────────────────
  function renderStep3() {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold mb-1">クリエイティブを登録</h2>
          <p className="text-gray-400 text-sm">
            {CREATIVE_TYPE_LABELS[creativeType]}
            {mediaPlatforms.length > 0 && ` / ${mediaPlatforms.map((p) => MEDIA_PLATFORM_LABELS[p]).join("・")}`}
          </p>
        </div>

        {/* モード切り替え */}
        <div className="flex gap-2 p-1 rounded-xl bg-white/5 border border-white/10">
          {([{ key: "file", label: "📎 ファイル" }, { key: "text", label: "📝 テキスト" }, { key: "url", label: "🔗 URL" }] as { key: InputMode; label: string }[]).map(({ key, label }) => (
            <button key={key} onClick={() => setInputMode(key)}
              className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-colors ${inputMode === key ? "bg-violet-500 text-white" : "text-gray-400 hover:text-white"}`}
            >{label}</button>
          ))}
        </div>

        {/* カテゴリ */}
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1.5">商品・サービスカテゴリ <span className="text-gray-500">（推奨）</span></label>
          <select value={targetCategory} onChange={(e) => setTargetCategory(e.target.value)}
            className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 focus:border-violet-500 focus:outline-none transition-colors text-sm">
            <option value="" className="bg-gray-900">未選択（一般規制でチェック）</option>
            {TARGET_CATEGORIES.map((cat) => <option key={cat} value={cat} className="bg-gray-900">{cat}</option>)}
          </select>
        </div>

        {/* ファイル入力 */}
        {inputMode === "file" && (
          <div>
            <div
              className={`rounded-2xl border-2 border-dashed transition-colors p-8 text-center cursor-pointer ${
                dragOver ? "border-violet-400 bg-violet-500/10" :
                files.length > 0 ? "border-violet-500/40 bg-violet-500/5" : "border-white/20 hover:border-white/40"
              }`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files.length > 0) addFiles(e.dataTransfer.files); }}
              onClick={() => fileInputRef.current?.click()}
            >
              <input ref={fileInputRef} type="file" accept={ALLOWED_TYPES.join(",")} multiple className="hidden"
                onChange={(e) => { if (e.target.files?.length) { addFiles(e.target.files); e.target.value = ""; } }} />
              <div className="text-3xl mb-2">📂</div>
              <p className="font-semibold text-sm">{files.length > 0 ? "さらに追加する場合はクリック／ドロップ" : "ファイルをドロップ、またはクリックして選択"}</p>
              <p className="text-xs text-gray-500 mt-1">画像（JPEG/PNG/WebP/GIF）・動画（MP4/WebM/MOV）最大500MB</p>
            </div>
            {files.length > 0 && (
              <div className="mt-3 space-y-2">
                {files.map((f, i) => (
                  <div key={`${f.name}-${i}`} className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-white/5 border border-white/10">
                    <span className="text-xl flex-shrink-0">{fileIcon(f.type)}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{f.name}</p>
                      <p className="text-xs text-gray-500">{(f.size / 1024 / 1024).toFixed(1)} MB</p>
                    </div>
                    <button onClick={(e) => { e.stopPropagation(); setFiles((prev) => prev.filter((_, j) => j !== i)); }}
                      className="text-gray-600 hover:text-red-400 transition-colors text-xs px-2 py-1 rounded hover:bg-red-500/10">✕</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* URL入力 */}
        {inputMode === "url" && (
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">チェックするページのURL <span className="text-red-400">*</span></label>
            <input type="url" value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)}
              placeholder="https://example.com/lp/product"
              className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 focus:border-violet-500 focus:outline-none font-mono text-sm transition-colors" />
            <p className="text-xs text-gray-500 mt-1">JavaScriptで描画されるSPAページは取得できない場合があります</p>
          </div>
        )}

        {/* テキスト入力 */}
        {inputMode === "text" && (
          <div>
            <div className="flex items-center gap-3 mb-2">
              <label className="text-xs font-medium text-gray-400">コンテンツ種別</label>
              <div className="flex gap-2">
                {(["lp", "text"] as const).map((ct) => (
                  <button key={ct} onClick={() => setTextContentType(ct)}
                    className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${textContentType === ct ? "bg-violet-500 text-white" : "bg-white/5 text-gray-400 hover:bg-white/10"}`}>
                    {ct === "lp" ? "LP・記事" : "テキスト広告・原稿"}
                  </button>
                ))}
              </div>
            </div>
            <textarea value={textContent} onChange={(e) => setTextContent(e.target.value)} rows={12}
              placeholder={textContentType === "lp" ? "LPのテキスト内容を貼り付けてください" : "広告テキスト・原稿・キャッチコピーなどを貼り付けてください"}
              className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 focus:border-violet-500 focus:outline-none resize-none font-mono text-sm" />
            <p className="text-xs text-gray-500 mt-1">{textContent.length} 文字</p>
          </div>
        )}

        {/* 追加レギュレーション */}
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1.5">追加チェック項目・レギュレーション <span className="text-gray-500">（任意）</span></label>
          <textarea value={customRegulations} onChange={(e) => setCustomRegulations(e.target.value)} rows={3}
            placeholder={`例:\n- 競合他社名の言及禁止\n- 「最安値」「No.1」表現禁止`}
            className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 focus:border-violet-500 focus:outline-none resize-none text-sm" />
        </div>

        {error && <ErrorBanner message={error} />}

        <div className="flex justify-between pt-2">
          <button onClick={() => { setError(""); setStep(2); }} className="px-6 py-3 rounded-xl border border-white/20 hover:border-white/40 text-sm transition-colors">← 戻る</button>
          <button onClick={handleRegisterAndAnalyze}
            className="px-8 py-3 rounded-xl font-semibold bg-gradient-to-r from-violet-500 to-pink-500 hover:from-violet-600 hover:to-pink-600 transition-all">
            登録してAIチェック実行 →
          </button>
        </div>
      </div>
    );
  }

  // ── Step 4: AIチェック結果 ────────────────────────────────────────────────
  function renderStep4() {
    const isLoading = registering || analyzing;
    const overallStatus = aiResults.length > 0
      ? (aiResults.some((r) => r.overallStatus === "ng") ? "ng"
        : aiResults.some((r) => r.overallStatus === "warning") ? "warning" : "ok")
      : null;

    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold mb-1">AIチェック</h2>
          <p className="text-gray-400 text-sm">薬機法・景品表示法などの規制への適合性を自動チェックします</p>
        </div>

        {isLoading && (
          <div className="flex flex-col items-center py-16 gap-4">
            <div className="w-16 h-16 rounded-full bg-violet-500/20 border border-violet-500/30 flex items-center justify-center animate-pulse">
              <span className="text-2xl">🔍</span>
            </div>
            <p className="font-semibold">{registering ? "クリエイティブを登録中..." : "AIがチェック中..."}</p>
            {progress && (
              <div className="w-full max-w-xs">
                <div className="w-full bg-white/10 rounded-full h-1.5">
                  <div className="bg-gradient-to-r from-violet-500 to-pink-500 h-1.5 rounded-full transition-all duration-500"
                    style={{ width: `${(progress.done / progress.total) * 100}%` }} />
                </div>
                <p className="text-xs text-center text-gray-500 mt-1">{progress.done}/{progress.total}</p>
              </div>
            )}
          </div>
        )}

        {!isLoading && aiResults.length > 0 && overallStatus && (
          <div className="space-y-4">
            {/* 総合判定 */}
            <div className={`p-5 rounded-2xl border ${
              overallStatus === "ng" ? "border-red-500/40 bg-red-500/10" :
              overallStatus === "warning" ? "border-yellow-500/40 bg-yellow-500/10" :
              "border-green-500/40 bg-green-500/10"
            }`}>
              <div className={`text-xl font-bold ${
                overallStatus === "ng" ? "text-red-300" :
                overallStatus === "warning" ? "text-yellow-300" : "text-green-300"
              }`}>
                {overallStatus === "ng" ? "⛔ NG — 要修正" : overallStatus === "warning" ? "⚠️ 要確認" : "✅ 問題なし"}
              </div>
              <p className="text-sm text-gray-300 mt-1">
                {aiResults.length > 1 ? `${aiResults.length}件のクリエイティブをチェックしました` : aiResults[0]?.summary}
              </p>
            </div>

            {/* 指摘事項 */}
            {aiResults.flatMap((r) => r.issues ?? []).map((issue, i) => (
              <div key={i} className="p-4 rounded-xl border border-white/10 bg-white/5">
                <div className="flex items-center gap-2 mb-2">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                    issue.level === "violation" ? "bg-red-500/20 text-red-300" :
                    issue.level === "warning" ? "bg-yellow-500/20 text-yellow-300" : "bg-blue-500/20 text-blue-300"
                  }`}>{RISK_LEVEL_LABELS[issue.level]}</span>
                  <span className="text-xs text-gray-500">{issue.category}</span>
                </div>
                <p className="font-semibold text-sm mb-1">{issue.title}</p>
                {issue.quote && <p className="text-xs text-gray-400 italic mb-1">「{issue.quote}」</p>}
                <p className="text-xs text-gray-400">{issue.description}</p>
                <p className="text-xs text-violet-400 mt-2">💡 {issue.suggestion}</p>
              </div>
            ))}

            {aiResults.flatMap((r) => r.issues ?? []).length === 0 && (
              <div className="p-4 rounded-xl border border-green-500/20 bg-green-500/5 text-green-300 text-sm text-center">
                明確な問題は検出されませんでした。チェックリストで最終確認を行ってください。
              </div>
            )}
          </div>
        )}

        {!isLoading && aiResults.length > 0 && (
          <div className="flex justify-end pt-2">
            <button onClick={() => { setError(""); setStep(5); }}
              className="px-8 py-3 rounded-xl font-semibold bg-gradient-to-r from-violet-500 to-pink-500 hover:from-violet-600 hover:to-pink-600 transition-all">
              チェックリストへ →
            </button>
          </div>
        )}
      </div>
    );
  }

  // ── Step 5: チェックリスト ────────────────────────────────────────────────
  function renderStep5() {
    const okCount = checklist.filter((i) => i.status === "ok").length;
    const ngCountLocal = checklist.filter((i) => i.status === "ng").length;
    const uncheckedCountLocal = checklist.filter((i) => i.status === "unchecked").length;

    return (
      <div className="space-y-5">
        <div>
          <h2 className="text-2xl font-bold mb-1">チェックリスト確認</h2>
          <p className="text-gray-400 text-sm">AI検出の指摘事項と媒体・規制チェック項目を1件ずつ確認し、OK/NG/未確認を記録してください。</p>
        </div>

        {/* 進捗 */}
        <div className="flex items-center gap-6 p-4 rounded-xl bg-white/5 border border-white/10">
          <div className="text-center"><div className="text-xl font-bold text-green-400">{okCount}</div><div className="text-xs text-gray-500">OK</div></div>
          <div className="text-center"><div className="text-xl font-bold text-red-400">{ngCountLocal}</div><div className="text-xs text-gray-500">NG</div></div>
          <div className="text-center"><div className="text-xl font-bold text-yellow-400">{uncheckedCountLocal}</div><div className="text-xs text-gray-500">未確認</div></div>
          <div className="ml-auto text-xs text-gray-500">計 {checklist.length} 項目</div>
        </div>

        {/* チェックリスト */}
        <div className="space-y-2">
          {checklist.map((item) => (
            <div key={item.id} className={`p-4 rounded-xl border transition-colors ${
              item.status === "ok" ? "border-green-500/30 bg-green-500/5" :
              item.status === "ng" ? "border-red-500/40 bg-red-500/10" :
              "border-white/10 bg-white/5"
            }`}>
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="text-xs px-2 py-0.5 rounded-full bg-white/10 text-gray-300 flex-shrink-0">{item.category}</span>
                    {item.isAiGenerated && item.aiIssueLevel && (
                      <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${
                        item.aiIssueLevel === "violation" ? "bg-red-500/20 text-red-300" : "bg-yellow-500/20 text-yellow-300"
                      }`}>AI: {RISK_LEVEL_LABELS[item.aiIssueLevel]}</span>
                    )}
                  </div>
                  <p className="text-sm">{item.description}</p>
                  {item.note && <p className="text-xs text-violet-400 mt-1">💡 {item.note}</p>}
                </div>
                <div className="flex gap-1 flex-shrink-0">
                  {(["ok", "ng", "unchecked"] as CheckStatus[]).map((s) => (
                    <button key={s} onClick={() => updateChecklistItem(item.id, s)}
                      className={`px-2 py-1 rounded-lg text-xs font-bold transition-colors ${
                        item.status === s
                          ? s === "ok" ? "bg-green-500 text-white" : s === "ng" ? "bg-red-500 text-white" : "bg-yellow-500 text-black"
                          : "bg-white/10 text-gray-400 hover:bg-white/20"
                      }`}>
                      {CHECK_STATUS_LABELS[s]}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* 一次チェック者名 */}
        <div className="pt-3 border-t border-white/10">
          <label className="block text-sm font-medium text-gray-300 mb-2">一次チェック者名 <span className="text-red-400">*</span></label>
          <input value={checkerName} onChange={(e) => setCheckerName(e.target.value)} placeholder="例: 山田 太郎"
            className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 focus:border-violet-500 focus:outline-none transition-colors" />
        </div>

        {error && <ErrorBanner message={error} />}

        <div className="flex justify-between pt-2">
          <button onClick={() => { setError(""); setStep(4); }} className="px-6 py-3 rounded-xl border border-white/20 hover:border-white/40 text-sm transition-colors">← 戻る</button>
          <button onClick={handleChecklistNext}
            className="px-8 py-3 rounded-xl font-semibold bg-gradient-to-r from-violet-500 to-pink-500 hover:from-violet-600 hover:to-pink-600 transition-all">
            ダブルチェックへ →
          </button>
        </div>
      </div>
    );
  }

  // ── Step 6: ダブルチェック & 提出 ────────────────────────────────────────
  function renderStep6() {
    const allOk = blockReasons.length === 0;
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold mb-1">ダブルチェック・提出</h2>
          <p className="text-gray-400 text-sm">二人目の確認者が承認し、提出してください。</p>
        </div>

        {/* ステータスサマリー */}
        <div className="space-y-2">
          {[
            { ok: ngCount === 0 && uncheckedCount === 0, label: ngCount + uncheckedCount === 0 ? `チェックリスト完了（${checklist.filter((i) => i.status === "ok").length}項目 全OK）` : `未完了（NG: ${ngCount} / 未確認: ${uncheckedCount}）` },
            { ok: !!checkerName.trim(), label: checkerName ? `一次チェック: ${checkerName}` : "一次チェック者名 未入力" },
            { ok: !!doubleCheckerName.trim(), label: doubleCheckerName ? `ダブルチェック: ${doubleCheckerName}` : "ダブルチェック者名 未入力" },
          ].map((item, i) => (
            <div key={i} className={`flex items-center gap-3 p-3 rounded-xl border text-sm ${
              item.ok ? "border-green-500/30 bg-green-500/10 text-green-300" : "border-white/10 bg-white/5 text-gray-400"
            }`}>
              <span>{item.ok ? "✅" : "⬜"}</span>
              <span>{item.label}</span>
            </div>
          ))}
        </div>

        {/* ダブルチェック者名 */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">ダブルチェック者名 <span className="text-red-400">*</span></label>
          <input value={doubleCheckerName} onChange={(e) => setDoubleCheckerName(e.target.value)}
            placeholder="例: 佐藤 花子（一次チェック者と別の方）"
            className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 focus:border-violet-500 focus:outline-none transition-colors" />
        </div>

        {/* 提出ブロック理由 */}
        {blockReasons.length > 0 && (
          <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/40">
            <p className="font-semibold text-red-300 text-sm mb-2">⛔ 提出できません</p>
            <ul className="space-y-1">{blockReasons.map((r, i) => <li key={i} className="text-red-400 text-sm">• {r}</li>)}</ul>
          </div>
        )}

        {error && <ErrorBanner message={error} />}

        <div className="flex justify-between pt-2">
          <button onClick={() => { setError(""); setStep(5); }} className="px-6 py-3 rounded-xl border border-white/20 hover:border-white/40 text-sm transition-colors">← 戻る</button>
          <button onClick={handleFinalSubmit} disabled={!allOk || submitting}
            className={`px-8 py-3 rounded-xl font-bold text-base transition-all ${
              allOk ? "bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 shadow-lg shadow-green-500/25" : "bg-white/10 text-gray-500 cursor-not-allowed"
            }`}>
            {submitting ? "提出中..." : allOk ? "✅ 提出する" : "⛔ 提出できません"}
          </button>
        </div>
      </div>
    );
  }

  // ── Step 7: 完了 ──────────────────────────────────────────────────────────
  function renderStep7() {
    return (
      <div className="text-center py-12 space-y-6">
        <div className="w-20 h-20 rounded-full bg-green-500/20 border border-green-500/30 flex items-center justify-center mx-auto">
          <span className="text-4xl">✅</span>
        </div>
        <div>
          <h2 className="text-2xl font-bold mb-2">提出完了</h2>
          <p className="text-gray-400">チェックリストと二重承認記録が保存されました。</p>
        </div>
        <div className="p-4 rounded-xl bg-white/5 border border-white/10 text-left text-sm space-y-1">
          <div className="text-gray-400">一次チェック: <span className="text-white">{checkerName}</span></div>
          <div className="text-gray-400">ダブルチェック: <span className="text-white">{doubleCheckerName}</span></div>
          <div className="text-gray-400">提出日時: <span className="text-white">{new Date().toLocaleString("ja-JP")}</span></div>
        </div>
        <div className="flex gap-4 justify-center">
          {workIds.length === 1 ? (
            <Link href={`/works/${workIds[0]}`} className="px-6 py-3 rounded-xl border border-white/20 hover:border-white/40 text-sm transition-colors">結果を詳しく見る</Link>
          ) : (
            <Link href="/works" className="px-6 py-3 rounded-xl border border-white/20 hover:border-white/40 text-sm transition-colors">チェック履歴へ</Link>
          )}
          <button onClick={() => window.location.reload()}
            className="px-6 py-3 rounded-xl bg-gradient-to-r from-violet-500 to-pink-500 hover:from-violet-600 hover:to-pink-600 text-sm font-semibold transition-all">
            新規チェック
          </button>
        </div>
      </div>
    );
  }

  // ── レンダリング ──────────────────────────────────────────────────────────
  return (
    <div className="max-w-2xl mx-auto px-4 py-12">
      <div className="mb-8">
        <h1 className="text-3xl font-black mb-1">新規チェック</h1>
        <p className="text-gray-400 text-sm">案件選択 → 媒体選択 → AIチェック → チェックリスト → 二重承認 → 提出</p>
      </div>

      <StepIndicator />

      <div className="bg-white/[0.03] rounded-2xl border border-white/10 p-6 md:p-8">
        {step === 1 && renderStep1()}
        {step === 2 && renderStep2()}
        {step === 3 && renderStep3()}
        {step === 4 && renderStep4()}
        {step === 5 && renderStep5()}
        {step === 6 && renderStep6()}
        {step === 7 && renderStep7()}
      </div>
    </div>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm whitespace-pre-line">
      {message}
    </div>
  );
}

export default function SubmitPage() {
  return (
    <Suspense fallback={<div className="text-center py-20 text-gray-500">読み込み中...</div>}>
      <SubmitWizard />
    </Suspense>
  );
}
