export type ContentType = "image" | "video" | "text" | "lp" | "pdf";

export interface Project {
  id: string;
  name: string;
  clientName?: string;
  description?: string;
  createdAt: string;
  regulations?: string;            // 案件固有レギュレーション・禁止表現（手入力）
  ngCases?: NgCase[];              // 過去のNG事例ナレッジ
  regulationsFilePath?: string;    // アップロードされたレギュレーションファイルのパス
  regulationsFileName?: string;    // 元のファイル名
  regulationsFileContent?: string; // ファイルから抽出したテキスト（AIプロンプト用キャッシュ）
}

export interface NgCase {
  id: string;
  title: string;           // NG事例のタイトル
  description: string;     // 詳細・理由
  category?: RegulationCategory;
  quote?: string;          // 問題のあった具体的な表現
  addedAt: string;
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
  pdf: "PDF",
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
  submittedAt: string;
  complianceResult?: ComplianceResult;
  customRegulations?: string;   // 追加のレギュレーション指定
  targetCategory?: string;      // 商品カテゴリ（化粧品・サプリ・医薬品等）
  projectId?: string;           // 所属案件ID
}

export interface WorkSummary {
  id: string;
  title: string;
  contentType: ContentType;
  filePath?: string;
  fileType?: string;
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
