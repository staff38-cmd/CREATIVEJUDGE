import Link from "next/link";

export default function HomePage() {
  return (
    <div className="max-w-7xl mx-auto px-4 py-20">
      {/* Hero */}
      <div className="text-center mb-20">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-red-500/30 bg-red-500/10 text-red-300 text-sm mb-8">
          <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
          薬機法・景品表示法・広告レギュレーション対応
        </div>
        <h1 className="text-6xl font-black mb-6 leading-tight">
          広告クリエイティブの
          <br />
          <span className="bg-gradient-to-r from-violet-400 via-pink-400 to-orange-400 bg-clip-text text-transparent">
            コンプライアンスを、AIで。
          </span>
        </h1>
        <p className="text-xl text-gray-400 max-w-2xl mx-auto mb-10">
          CREATIVEJUDGE は、薬機法・景品表示法・健康増進法などの規制に対し、
          広告クリエイティブ（画像・動画・LP・テキスト）が準拠しているかを
          Claude AI が自動チェックするツールです。
        </p>
        <div className="flex items-center justify-center gap-4">
          <Link
            href="/submit"
            className="px-8 py-4 rounded-full font-bold text-lg bg-gradient-to-r from-violet-500 to-pink-500 hover:from-violet-600 hover:to-pink-600 transition-all shadow-lg shadow-violet-500/25"
          >
            今すぐチェック
          </Link>
          <Link
            href="/works"
            className="px-8 py-4 rounded-full font-bold text-lg border border-white/20 hover:border-white/40 transition-all"
          >
            チェック履歴
          </Link>
        </div>
      </div>

      {/* Features */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-20">
        {features.map((f) => (
          <Link
            key={f.title}
            href={f.href}
            className="p-6 rounded-2xl border border-white/10 bg-white/5 hover:border-violet-500/50 hover:bg-violet-500/5 transition-colors cursor-pointer"
          >
            <div className="text-3xl mb-4">{f.icon}</div>
            <h3 className="text-base font-bold mb-2">{f.title}</h3>
            <p className="text-gray-400 text-sm leading-relaxed">{f.description}</p>
          </Link>
        ))}
      </div>

      {/* Regulations */}
      <div className="mb-20">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold mb-4">チェック対象の規制・ガイドライン</h2>
          <p className="text-gray-400">主要な日本の広告規制に対応しています</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {regulations.map((r) => (
            <div key={r.name} className={`p-5 rounded-2xl border ${r.style}`}>
              <div className="flex items-center gap-3 mb-2">
                <span className="text-2xl">{r.icon}</span>
                <h3 className="font-bold">{r.name}</h3>
              </div>
              <p className="text-sm text-gray-400 leading-relaxed">{r.description}</p>
            </div>
          ))}
        </div>
      </div>

      {/* How it works */}
      <div className="text-center mb-12">
        <h2 className="text-3xl font-bold mb-4">使い方</h2>
        <p className="text-gray-400">3ステップで規制チェック完了</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {steps.map((s, i) => (
          <div key={s.title} className="flex flex-col items-center text-center">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-violet-500 to-pink-500 flex items-center justify-center font-bold text-xl mb-4">
              {i + 1}
            </div>
            <h3 className="font-bold mb-2">{s.title}</h3>
            <p className="text-gray-400 text-sm">{s.description}</p>
          </div>
        ))}
      </div>

      {/* Disclaimer */}
      <div className="mt-16 p-5 rounded-2xl border border-yellow-500/20 bg-yellow-500/5 text-center">
        <p className="text-sm text-yellow-400/80">
          ⚠️ 本ツールはAIによる参考情報の提供を目的としており、法的判断の保証・責任は負いません。
          最終的な法的判断は薬事法規の専門家へご相談ください。
        </p>
      </div>
    </div>
  );
}

const features = [
  {
    icon: "🖼️",
    title: "画像チェック",
    description: "バナー・広告画像のテキストや表現をビジョンAIで解析。",
    href: "/submit?mode=file",
  },
  {
    icon: "🎬",
    title: "動画チェック",
    description: "動画広告のタイトル・説明情報をもとに規制リスクを評価。",
    href: "/submit?mode=file",
  },
  {
    icon: "📰",
    title: "LP・記事チェック",
    description: "LPや広告記事のテキストを全文チェック。具体的な問題箇所を引用して指摘。",
    href: "/submit?mode=text&type=lp",
  },
  {
    icon: "📝",
    title: "テキスト原稿チェック",
    description: "キャッチコピーや広告文をそのまま貼り付けてチェック。",
    href: "/submit?mode=text&type=text",
  },
  {
    icon: "✅",
    title: "チェックリスト",
    description: "案件×媒体×CR種別に応じたチェックリストで、確認漏れを防止。二重チェック承認フロー対応。",
    href: "/checklists",
  },
];

const regulations = [
  {
    icon: "💊",
    name: "薬機法（医薬品医療機器等法）",
    description: "化粧品・健康食品・医療機器の効能効果の不当な標榜。未承認効果の記載禁止（68条）。",
    style: "border-red-500/30 bg-red-500/5",
  },
  {
    icon: "🏷️",
    name: "景品表示法",
    description: "根拠のないNo.1・最高・最安値表示。優良誤認・有利誤認表示の禁止。",
    style: "border-orange-500/30 bg-orange-500/5",
  },
  {
    icon: "🥗",
    name: "健康増進法",
    description: "著しく事実に相違する誇大広告。消費者を誤認させる健康効果の表現禁止。",
    style: "border-yellow-500/30 bg-yellow-500/5",
  },
  {
    icon: "🏥",
    name: "医師法・医療法",
    description: "診断・治療・処方を示唆する表現。医療機関との混同を招く表現の禁止。",
    style: "border-blue-500/30 bg-blue-500/5",
  },
  {
    icon: "📋",
    name: "広告ガイドライン",
    description: "ビフォーアフター誇張・根拠なき体験談の使用。効果の根拠提示義務。",
    style: "border-purple-500/30 bg-purple-500/5",
  },
  {
    icon: "⚙️",
    name: "カスタムレギュレーション",
    description: "クライアント独自の禁止表現・競合他社言及禁止・プラットフォームポリシーなどを追加指定可能。",
    style: "border-violet-500/30 bg-violet-500/5",
  },
];

const steps = [
  {
    title: "コンテンツを登録",
    description: "画像・動画・PDFをアップロード、またはLPや広告テキストをそのまま貼り付けます。",
  },
  {
    title: "AIが自動チェック",
    description: "Claude AIが薬機法・景表法などの規制に照らし、違反・警告・注意事項を洗い出します。",
  },
  {
    title: "レポートを確認",
    description: "問題箇所を引用しながら違反レベル・改善案をレポート形式で確認できます。",
  },
];
