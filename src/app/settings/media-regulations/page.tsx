"use client";

import { useState, useEffect } from "react";
import { MediaType, MediaRegulations } from "@/lib/types";

const MEDIA_LIST: MediaType[] = ["Meta", "Google", "ByteDance", "LINE", "SmartNews", "YDA"];

const MEDIA_DESCRIPTIONS: Record<MediaType, string> = {
  Meta: "Meta（Facebook/Instagram）広告のレギュレーション",
  Google: "Google広告のレギュレーション",
  ByteDance: "TikTok（ByteDance）広告のレギュレーション",
  LINE: "LINE広告のレギュレーション",
  SmartNews: "SmartNews広告のレギュレーション",
  YDA: "Yahoo!ディスプレイ広告（YDA）のレギュレーション",
};

export default function MediaRegulationsPage() {
  const [regs, setRegs] = useState<MediaRegulations>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/media-regulations")
      .then((r) => r.json())
      .then((data: MediaRegulations) => {
        setRegs(data);
        setLoading(false);
      })
      .catch(() => {
        setError("読み込みに失敗しました");
        setLoading(false);
      });
  }, []);

  async function handleSave() {
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      const res = await fetch("/api/media-regulations", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(regs),
      });
      if (!res.ok) throw new Error("保存に失敗しました");
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存に失敗しました");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <div className="mb-8">
        <h1 className="text-3xl font-black mb-2">媒体別レギュレーション設定</h1>
        <p className="text-gray-400">
          各媒体のレギュレーションを設定します。CR登録時に媒体を選択すると、ここで設定した内容がAIチェックのプロンプトに追加されます。
        </p>
      </div>

      {loading ? (
        <div className="text-center py-20 text-gray-500">読み込み中...</div>
      ) : (
        <div className="space-y-6">
          {MEDIA_LIST.map((media) => (
            <div
              key={media}
              className="p-6 rounded-2xl border border-white/10 bg-white/5"
            >
              <div className="flex items-center gap-3 mb-3">
                <span className="px-3 py-1 rounded-full text-sm font-bold bg-violet-500/20 text-violet-300 border border-violet-500/30">
                  {media}
                </span>
                <span className="text-sm text-gray-400">{MEDIA_DESCRIPTIONS[media]}</span>
              </div>
              <textarea
                value={regs[media] ?? ""}
                onChange={(e) => setRegs({ ...regs, [media]: e.target.value })}
                placeholder={`${media}のレギュレーション・注意事項を入力...`}
                rows={4}
                className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500 transition-colors resize-none text-sm"
              />
            </div>
          ))}

          {error && (
            <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
              {error}
            </div>
          )}

          {saved && (
            <div className="p-4 rounded-xl bg-green-500/10 border border-green-500/30 text-green-400 text-sm">
              保存しました
            </div>
          )}

          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full py-4 rounded-xl font-bold text-lg bg-gradient-to-r from-violet-500 to-pink-500 hover:from-violet-600 hover:to-pink-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {saving ? "保存中..." : "保存"}
          </button>
        </div>
      )}
    </div>
  );
}
