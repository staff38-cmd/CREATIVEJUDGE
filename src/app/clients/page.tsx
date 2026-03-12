"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Client } from "@/lib/types";

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetch("/api/clients")
      .then((r) => r.json())
      .then((data) => { setClients(data); setLoading(false); });
  }, []);

  async function createClient() {
    if (!newName.trim()) return;
    setCreating(true);
    const res = await fetch("/api/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim() }),
    });
    if (res.ok) {
      const created = await res.json();
      setClients((prev) => [created, ...prev]);
      setNewName("");
    }
    setCreating(false);
  }

  async function deleteClient(id: string) {
    if (!confirm("このクライアントを削除しますか？\n（紐付いている商材・案件は削除されません）")) return;
    const res = await fetch(`/api/clients/${id}`, { method: "DELETE" });
    if (res.ok) setClients((prev) => prev.filter((c) => c.id !== id));
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-black">クライアント</h1>
          <p className="text-gray-400 mt-1 text-sm">クライアント別に共通レギュレーションを管理します</p>
        </div>
      </div>

      {/* 新規作成 */}
      <div className="mb-6 flex gap-3">
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && createClient()}
          placeholder="クライアント名（例: ファーマフーズ）"
          className="flex-1 px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 focus:border-violet-500 focus:outline-none transition-colors"
        />
        <button
          onClick={createClient}
          disabled={creating || !newName.trim()}
          className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-violet-500 hover:bg-violet-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
        >
          {creating ? "作成中..." : "＋ 追加"}
        </button>
      </div>

      {loading ? (
        <div className="text-center py-20 text-gray-500">読み込み中...</div>
      ) : clients.length === 0 ? (
        <div className="text-center py-20 text-gray-500">
          <p className="text-4xl mb-4">🏢</p>
          <p>クライアントがまだ登録されていません</p>
        </div>
      ) : (
        <div className="space-y-3">
          {clients.map((client) => (
            <div key={client.id} className="p-5 rounded-2xl border border-white/10 bg-white/5 flex items-center justify-between gap-4">
              <div className="flex-1 min-w-0">
                <h2 className="font-bold text-lg">{client.name}</h2>
                {client.companyRegulations ? (
                  <p className="text-xs text-gray-400 mt-1 truncate">
                    レギュレーション: {client.companyRegulations.slice(0, 60)}…
                  </p>
                ) : (
                  <p className="text-xs text-gray-600 mt-1">レギュレーション未設定</p>
                )}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <Link
                  href={`/clients/${client.id}`}
                  className="px-4 py-1.5 rounded-lg text-sm border border-white/20 hover:bg-white/5 transition-colors"
                >
                  設定
                </Link>
                <button
                  onClick={() => deleteClient(client.id)}
                  className="px-3 py-1.5 rounded-lg text-sm text-gray-500 hover:text-red-400 hover:bg-red-500/10 border border-white/10 hover:border-red-500/30 transition-colors"
                >
                  削除
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
