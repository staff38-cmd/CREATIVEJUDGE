export type ContentType = "image" | "video" | "text" | "lp" | "url";

// ── 媒体プラットフォーム ──────────────────────────────────────
export type MediaPlatform =
  | "meta"
  | "google"
  | "line"
  | "bytedance"
  | "smartnews"
  | "other";

export const MEDIA_PLATFORM_LABELS: Record<MediaPlatform, string> = {
  meta: "Meta（Facebook/Instagram）",
  google: "Google Display / YouTube",
  line: "LINE Ads",
  bytedance: "TikTok / ByteDance",
  smartnews: "SmartNews",
  other: "その他",
};

export const MEDIA_PLATFORM_ICONS: Record<MediaPlatform, string> = {
  meta: "📘",
  google: "🔵",
  line: "💚",
  bytedance: "🎵",
  smartnews: "📰",
  other: "📡",
};

// 媒体ごとの固有チェックルール
export const MEDIA_PLATFORM_RULES: Record<MediaPlatform, string[]> = {
  meta: [
    "ビフォーアフター画像・表現がないか確認",
    "体重・体型の変化を誇張する画像がないか確認",
    "クリックベイト的な煽り文句（「これを見るな」等）がないか確認",
    "医薬品・処方薬の直接広告になっていないか確認",
  ],
  google: [
    "根拠なき「保証」「確実」「絶対」表現がないか確認",
    "医療的効果の誇大な主張がないか確認",
    "センシティブカテゴリ（医療・金融）として審査申請済みか確認",
  ],
  line: [
    "LINE独自の薬機法NGワードに抵触していないか確認",
    "健康食品の効能効果訴求がLINE基準の範囲内か確認",
    "ターゲティング広告の個人情報取扱いが明示されているか確認",
  ],
  bytedance: [
    "若年層向け健康・ダイエット広告の規制に準拠しているか確認",
    "Before/After動画コンテンツになっていないか確認",
    "誇大な変身・劇的効果演出がないか確認",
  ],
  smartnews: [
    "PR・広告であることが明示（PR表記）されているか確認",
    "クリックベイト型見出しになっていないか確認",
    "医療・健康記事として根拠・出典の表示があるか確認",
  ],
  other: [],
};

// ── CR種別 ────────────────────────────────────────────────────
export type CreativeType = "banner" | "video" | "td" | "text" | "lp";

export const CREATIVE_TYPE_LABELS: Record<CreativeType, string> = {
  banner: "バナー",
  video: "動画",
  td: "テキストデザイン（TD）",
  text: "テキスト原稿",
  lp: "LP・記事",
};

// ── チェックリスト ────────────────────────────────────────────
export type CheckStatus = "ok" | "ng" | "unchecked";

export const CHECK_STATUS_LABELS: Record<CheckStatus, string> = {
  ok: "OK",
  ng: "NG",
  unchecked: "未確認",
};

export interface ChecklistItem {
  id: string;
  category: string;
  description: string;
  status: CheckStatus;
  note?: string;
  isAiGenerated?: boolean;
  aiIssueLevel?: RiskLevel;
}

// ── 承認 ──────────────────────────────────────────────────────
export interface Approval {
  approverName: string;
  approvedAt: string;
  role: "checker" | "double_checker";
  comment?: string;
}

// ── Project ───────────────────────────────────────────────────

export interface NgCase {
  id: string;
  title: string;           // NG事例のタイトル
  description: string;     // 詳細・理由
  category?: RegulationCategory;
  quote?: string;          // 問題のあった具体的な表現
  addedAt: string;
}

export interface Project {
  id: string;
  name: string;
  clientName?: string;
  description?: string;
  createdAt: string;
  // 企業レギュレーション（薬機法チェックの次に優先）
  companyRegulations?: string;            // 企業共通レギュレーション（手入力）
  companyRegulationsFileName?: string;    // 企業レギュレーションファイル名
  companyRegulationsFileContent?: string; // 企業レギュレーションファイル抽出テキスト
  // 案件レギュレーション（企業の次に優先）
  regulations?: string;            // 案件固有レギュレーション・禁止表現（手入力）
  ngCases?: NgCase[];              // 過去のNG事例ナレッジ
  regulationsFilePath?: string;    // アップロードされたレギュレーションファイルのパス
  regulationsFileName?: string;    // 元のファイル名
  regulationsFileContent?: string; // ファイルから抽出したテキスト（AIプロンプト用キャッシュ）
}

// ── リスクレベル ──────────────────────────────────────────────
export type RiskLevel = "violation" | "warning" | "caution" | "ok";

export const RISK_LEVEL_LABELS: Record<RiskLevel, string> = {
  violation: "違反",
  warning: "警告",
  caution: "注意",
  ok: "問題なし",
};

export const CONTENT_TYPE_LABELS: Record<ContentType, string> = {
  image: "画像",
  video: "動画",
  text: "テキスト",
  lp: "LP・記事",
  url: "URL取得",
};

export type RegulationCategory =
  | "薬機法"
  | "景品表示法"
  | "健康増進法"
  | "広告ガイドライン"
  | "医師法"
  | "カスタム";

export interface ComplianceIssue {
  level: RiskLevel;
  category: RegulationCategory;
  clause?: string;          // 例: "薬機法68条"
  title: string;            // 例: "効能効果の標榜"
  description: string;      // 詳細説明
  quote?: string;           // 問題箇所の引用テキスト
  suggestion: string;       // 改善案
}

export interface ComplianceResult {
  overallStatus: "ng" | "warning" | "ok";
  issues: ComplianceIssue[];
  summary: string;
  checkedAt: string;
}

// ── Work ─────────────────────────────────────────────────────
export interface Work {
  id: string;
  title: string;
  contentType: ContentType;
  creativeType?: CreativeType;      // CR種別
  mediaPlatforms?: MediaPlatform[]; // 出稿媒体
  // File-based content
  fileName?: string;
  fileType?: string;
  fileSize?: number;
  filePath?: string;
  // Text-based content
  textContent?: string;
  // URL-based content
  sourceUrl?: string;
  submittedAt: string;
  complianceResult?: ComplianceResult;
  customRegulations?: string;   // 追加のレギュレーション指定
  targetCategory?: string;      // 商品カテゴリ（化粧品・サプリ・医薬品等）
  projectId?: string;           // 所属案件ID
  // チェックリスト & 二重承認
  checklist?: ChecklistItem[];
  approvals?: Approval[];
  checkerName?: string;
  finalSubmittedAt?: string;
}

export interface WorkSummary {
  id: string;
  title: string;
  contentType: ContentType;
  creativeType?: CreativeType;
  mediaPlatforms?: MediaPlatform[];
  filePath?: string;
  fileType?: string;
  sourceUrl?: string;
  submittedAt: string;
  overallStatus?: "ng" | "warning" | "ok";
  issueCount: number;
  violationCount: number;
  warningCount: number;
  hasResult: boolean;
  targetCategory?: string;
  projectId?: string;
  projectName?: string;
  checklistDone?: boolean;
  approvalCount?: number;
  finalSubmittedAt?: string;
}
