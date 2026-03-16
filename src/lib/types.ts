export type ContentType = "image" | "video" | "text" | "lp" | "url";

export interface Client {
  id: string;
  name: string;
  companyRegulations?: string;
  createdAt: string;
}

export interface Project {
  id: string;
  name: string;
  clientName?: string;
  description?: string;
  createdAt: string;
  // CR提出用Googleスプレッドシート
  sheetUrl?: string;
  // NG集スプレッドシート（シート同期用）
  ngSheetUrl?: string;
  // 商品詳細資料
  productDetails?: string;
  productDetailsFileName?: string;
  // 企業レギュレーション
  companyRegulations?: string;
  companyRegulationsFileName?: string;
  companyRegulationsFileContent?: string;
  // NG事例ナレッジ
  ngCases?: NgCase[];
  // 許容表現ナレッジ
  allowedCases?: AllowedCase[];
  // AIチェックモード: "soft"=企業レギュ主体（デフォルト）| "hard"=法令も含めて厳しくチェック
  checkMode?: "soft" | "hard";
  // クライアント紐付け
  clientId?: string;
  client?: Client;
  // NG集シートフォーマット: "rl"=アール形式 | "free"=汎用（全テキストセル取込）
  ngSheetFormat?: "rl" | "free";
}

export interface NgCase {
  id: string;
  title: string;
  description: string;
  category?: RegulationCategory;
  quote?: string;
  addedAt: string;
}

export interface AllowedCase {
  id: string;
  title: string;       // 許容表現のタイトル
  description: string; // なぜOKか・どんな条件でOKか
  quote?: string;      // 具体的な表現
  addedAt: string;
  workId?: string;     // 登録元のチェック履歴ID
}

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
  | "企業レギュレーション"
  | "媒体ガイドライン"
  | "過去NG事例"
  | "薬機法"
  | "景品表示法"
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

export interface Work {
  id: string;
  title: string;
  contentType: ContentType;
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
  media?: MediaType;            // 媒体選択
}

export type MediaType = "Meta" | "Google" | "ByteDance" | "LINE" | "SmartNews" | "YDA";
export type MediaRegulations = Partial<Record<MediaType, string>>;
export type CrType = "バナー" | "動画" | "TD" | "入稿";

export interface CheckItemDef {
  id: string;
  text: string;
  required: boolean;
  detail?: string;
  category: "薬機法" | "景品表示法" | "ステマ規制" | "運用" | "媒体";
}

export interface CheckResult {
  itemId: string;
  status: "ok" | "ng" | "pending";
  note?: string;
}

export interface ChecklistSession {
  id: string;
  projectId?: string;
  projectName?: string;
  media: MediaType;
  crType: CrType;
  checkerName: string;
  reviewerName?: string;
  checkResults: CheckResult[];
  status: "draft" | "self-checked" | "review-pending" | "approved" | "rejected";
  note?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChecklistSummary {
  id: string;
  projectName?: string;
  media: MediaType;
  crType: CrType;
  checkerName: string;
  reviewerName?: string;
  status: ChecklistSession["status"];
  totalItems: number;
  okCount: number;
  ngCount: number;
  pendingCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface WorkSummary {
  id: string;
  title: string;
  contentType: ContentType;
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
}
