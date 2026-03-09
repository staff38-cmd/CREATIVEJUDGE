"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Project, WorkSummary } from "@/lib/types";

interface ProjectWithStats extends Project {
  workCount: number;
  ngCount: number;
  warningCount: number;
  okCount: number;
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<ProjectWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newClient, setNewClient] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function load() {
    const [projectsRes, worksRes] = await Promise.all([
      fetch("/api/projects"),
      fetch("/api/works"),
    ]);
    const projectsData: Project[] = await projectsRes.json();
    const worksData: WorkSummary[] = await worksRes.json();

    const withStats: ProjectWithStats[] = projectsData.map((p) => {
      const works = worksData.filter((w) => w.projectId === p.id);
      return {
        ...p,
        workCount: works.length,
        ngCount: works.filter((w) => w.overallStatus === "ng").length,
        warningCount: works.filter((w) => w.overallStatus === "warning").length,
        okCount: works.filter((w) => w.overallStatus === "ok").length,
      };
    });

    setProjects(withStats);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function handleCreate() {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim(), clientName: newClient.trim(), description: newDescription.trim() }),
      });
      if (res.ok) {
        setNewName("");
        setNewClient("");
        setNewDescription("");
        setShowCreateForm(false);
        await load();
      }
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("この案件を削除しますか？（紐づくチェック履歴は案件なしになります）")) return;
    setDeletingId(id);
    await fetch(`/api/projects/${id}`, { method: "DELETE" });
    setDeletingId(null);
    await load();
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-black mb-1">案件一覧</h1>
          <p className="text-gray-400">{projects.length} 件の案件</p>
        </div>
        <button
          onClick={() => setShowCreateForm(true)}
          className="px-5 py-2.5 rounded-full text-sm font-semibold bg-gradient-to-r from-violet-500 to-pink-500 hover:from-violet-600 hover:to-pink-600 transition-all"
        >
          ＋ 新規案件
        </button>
      </div>

      {/* Create form */}
      {showCreateForm && (
        <div className="mb-8 p-6 rounded-2xl border border-violet-500/30 bg-violet-500/5">
          <h2 className="text-lg font-bold mb-4 text-violet-300">新規案件を作成</h2>
          <div className="space-y-3">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="案件名 *"
              className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 focus:border-violet-500 focus:outline-none transition-colors"
            />
            <input
              type="text"
              value={newClient}
              onChange={(e) => setNewClient(e.target.value)}
              placeholder="クライアント名（任意）"
              className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 focus:border-violet-500 focus:outline-none transition-colors"
            />
            <textarea
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              placeholder="備考・説明（任意）"
              rows={2}
              className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 focus:border-violet-500 focus:outline-none transition-colors resize-none text-sm"
            />
            <div className="flex gap-3">
              <button
                onClick={handleCreate}
                disabled={!newName.trim() || creating}
                className="px-6 py-2.5 rounded-xl font-semibold text-sm bg-violet-500 hover:bg-violet-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {creating ? "作成中..." : "作成"}
              </button>
              <button
                onClick={() => { setShowCreateForm(false); setNewName(""); setNewClient(""); setNewDescription(""); }}
                className="px-6 py-2.5 rounded-xl font-semibold text-sm border border-white/20 hover:bg-white/5 transition-colors"
              >
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center py-20 text-gray-500">読み込み中...</div>
      ) : projects.length === 0 ? (
        <div className="text-center py-20 text-gray-500">
          <p className="text-4xl mb-4">📁</p>
          <p className="mb-2">案件がまだありません</p>
          <p className="text-sm">「＋ 新規案件」から作成してください</p>
        </div>
      ) : (
        <div className="space-y-4">
          {projects.map((p) => (
            <ProjectCard
              key={p.id}
              project={p}
              onDelete={handleDelete}
              deleting={deletingId === p.id}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ProjectCard({
  project,
  onDelete,
  deleting,
}: {
  project: ProjectWithStats;
  onDelete: (id: string) => void;
  deleting: boolean;
}) {
  return (
    <div className="p-5 rounded-2xl border border-white/10 bg-white/5 hover:border-white/20 transition-all">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-1">
            <span className="text-xl">📁</span>
            <h3 className="text-lg font-bold truncate">{project.name}</h3>
          </div>
          {project.clientName && (
            <p className="text-sm text-gray-400 ml-9 mb-1">{project.clientName}</p>
          )}
          {project.description && (
            <p className="text-xs text-gray-500 ml-9 mb-2">{project.description}</p>
          )}
          <div className="flex items-center gap-2 ml-9 mt-2 flex-wrap">
            {project.companyRegulations && (
              <span className="text-xs px-2 py-0.5 rounded-full border border-violet-500/30 bg-violet-500/10 text-violet-300">
                レギュレーション設定済み
              </span>
            )}
            {(project.ngCases?.length ?? 0) > 0 && (
              <span className="text-xs px-2 py-0.5 rounded-full border border-red-500/30 bg-red-500/10 text-red-300">
                NG事例 {project.ngCases!.length}件
              </span>
            )}
          </div>
          <p className="text-xs text-gray-600 ml-9 mt-1">
            {new Date(project.createdAt).toLocaleDateString("ja-JP")} 作成
          </p>
        </div>

        {/* Stats */}
        <div className="flex items-center gap-3 flex-shrink-0">
          <div className="text-right">
            <p className="text-xs text-gray-500 mb-1">チェック数</p>
            <p className="text-xl font-bold">{project.workCount}</p>
          </div>
          {project.workCount > 0 && (
            <div className="flex gap-1.5">
              {project.ngCount > 0 && (
                <span className="px-2 py-1 rounded-full text-xs font-bold bg-red-500/20 text-red-400 border border-red-500/30">
                  NG {project.ngCount}
                </span>
              )}
              {project.warningCount > 0 && (
                <span className="px-2 py-1 rounded-full text-xs font-bold bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">
                  要注意 {project.warningCount}
                </span>
              )}
              {project.okCount > 0 && (
                <span className="px-2 py-1 rounded-full text-xs font-bold bg-green-500/20 text-green-400 border border-green-500/30">
                  OK {project.okCount}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3 mt-4 pt-4 border-t border-white/5">
        <Link
          href={`/works?project=${project.id}`}
          className="px-4 py-2 rounded-lg text-xs font-medium bg-white/5 hover:bg-white/10 transition-colors"
        >
          チェック履歴 →
        </Link>
        <Link
          href={`/submit?project=${project.id}`}
          className="px-4 py-2 rounded-lg text-xs font-medium bg-violet-500/20 text-violet-300 hover:bg-violet-500/30 transition-colors"
        >
          ＋ チェック追加
        </Link>
        <Link
          href={`/projects/${project.id}`}
          className="px-4 py-2 rounded-lg text-xs font-medium border border-white/10 hover:border-white/30 hover:bg-white/5 transition-colors"
        >
          ⚙ レギュレーション設定
        </Link>
        <button
          onClick={() => onDelete(project.id)}
          disabled={deleting}
          className="ml-auto px-3 py-2 rounded-lg text-xs text-gray-600 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
        >
          {deleting ? "削除中..." : "削除"}
        </button>
      </div>
    </div>
  );
}
