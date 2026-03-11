import { CheckItemDef, CrType, MediaType } from "./types";

// ===== 共通項目（全CR種別） =====
const commonItems: CheckItemDef[] = [
  {
    id: "common-001",
    text: "NG表現セルフチェックリストを確認し、該当表現がないことを確認した",
    required: true,
    detail: "社内NG表現リスト・薬機法NG表現一覧と照らし合わせて確認すること",
    category: "薬機法",
  },
  {
    id: "common-002",
    text: "ステマ対策のPR表記が適切に行われている（広告である旨の明示）",
    required: true,
    detail: "「PR」「広告」「Sponsored」等の表記が視認可能な位置にあること",
    category: "ステマ規制",
  },
  {
    id: "common-003",
    text: "行政機関・自治体等の固有名詞を無断使用していない",
    required: true,
    detail: "厚生労働省・消費者庁等の名称を権威付けに使用していないか確認",
    category: "景品表示法",
  },
  {
    id: "common-004",
    text: "虚偽・根拠のないデータ・数値を使用していない",
    required: true,
    detail: "「〇〇%が実感」等の数値には根拠資料があること。根拠資料のない数値は使用不可",
    category: "景品表示法",
  },
];

// ===== 入稿時チェック項目（全CR種別共通） =====
export const submissionCheckItems: CheckItemDef[] = [
  {
    id: "submit-001",
    text: "広告のリンク先URL（遷移先LP）と、バナー・テキストで訴求している商品・内容が一致している",
    required: true,
    detail: "例：商品Aのバナーなのに遷移先が商品BのLPになっていないか。必ずリンク先を実際にクリックして確認すること",
    category: "運用",
  },
  {
    id: "submit-002",
    text: "AD Ebis（広告管理ツール）の広告ID備考欄に、遷移先LPの内容・商品名を明記した",
    required: true,
    detail: "入稿時に必ずAD Ebisの備考欄に「〇〇商品 × 〇〇LP」等、遷移先の内容を明記すること",
    category: "運用",
  },
  {
    id: "submit-003",
    text: "ダブルチェック者の記名が完了している",
    required: true,
    detail: "入稿前に必ず別担当者がリンク先・内容の整合性を確認し、記名すること",
    category: "運用",
  },
];

// ===== バナー専用項目 =====
const bannerItems: CheckItemDef[] = [
  {
    id: "banner-001",
    text: "未チェックフォルダへの格納が完了している",
    required: true,
    detail: "チェック前のクリエイティブは必ず所定の未チェックフォルダに格納すること",
    category: "運用",
  },
  {
    id: "banner-002",
    text: "提出シートへの転記が正確に行われている",
    required: true,
    detail: "クリエイティブ名・サイズ・配信先媒体等を提出シートに転記し、相違がないか確認",
    category: "運用",
  },
  {
    id: "banner-003",
    text: "二重チェックが完了している（自分以外の担当者がチェック済み）",
    required: true,
    detail: "必ず別の担当者によるチェックを経てから提出すること",
    category: "運用",
  },
  {
    id: "banner-004",
    text: "完全NG表現の削除対応が完了している（修正が必要な場合）",
    required: true,
    detail: "NG判定を受けたクリエイティブは完全に削除または修正済みであること",
    category: "運用",
  },
];

// ===== 動画専用項目 =====
const videoItems: CheckItemDef[] = [
  {
    id: "video-001",
    text: "テキスト起こし内容と実際の音声・ナレーションが一致している",
    required: true,
    detail: "動画内の発言内容とテキスト起こしに相違がないか一言一句確認すること",
    category: "運用",
  },
  {
    id: "video-002",
    text: "ナレーター・出演者の文言が記載・管理されている",
    required: true,
    detail: "ナレーター名・出演者情報・発言内容の記録を管理台帳に記載すること",
    category: "運用",
  },
  {
    id: "video-003",
    text: "体験者コメント（UGC・お客様の声）にステマ対策表記がされている",
    required: true,
    detail: "実際の体験者コメントを使用する場合、PR表記や「個人の感想です」等の注記が必要",
    category: "ステマ規制",
  },
  {
    id: "video-004",
    text: "使用しないNG動画素材がゴミ箱・削除済みフォルダに移動されている",
    required: true,
    detail: "NG判定を受けた動画素材は必ず削除フォルダへ移動し、誤使用を防ぐこと",
    category: "運用",
  },
  {
    id: "video-005",
    text: "修正箇所が赤字・変更履歴で明示されている（修正版の場合）",
    required: false,
    detail: "修正版クリエイティブは変更箇所を赤字または変更履歴で明示し、レビュアーが確認しやすい状態にすること",
    category: "運用",
  },
];

// ===== TD（テキスト広告）専用項目 =====
const tdItems: CheckItemDef[] = [
  {
    id: "td-001",
    text: "タイトル集シート内でタイトル・ディスクリプションを作成している",
    required: true,
    detail: "テキスト広告はタイトル集管理シート内で作成・管理すること。シート外での作成は不可",
    category: "運用",
  },
  {
    id: "td-002",
    text: "NG表現チェックリストとの照合が完了している",
    required: true,
    detail: "テキスト広告のすべての文言をNG表現チェックリストと照合済みであること",
    category: "薬機法",
  },
  {
    id: "td-003",
    text: "二重チェックが完了している（自分以外の担当者がチェック済み）",
    required: true,
    detail: "必ず別の担当者によるチェックを経てから提出すること",
    category: "運用",
  },
];

// ===== Meta追加項目 =====
const metaItems: CheckItemDef[] = [
  {
    id: "meta-001",
    text: "「お腹の脂肪」系文言とお腹周りの素材（画像・動画）を同時使用していない",
    required: true,
    detail: "Metaポリシー：「お腹の脂肪」「ウエスト」「腹部」等の文言と、腹部を強調した素材を同一広告内で使用することは禁止",
    category: "媒体",
  },
  {
    id: "meta-002",
    text: "広告アカウント名・ページ名に効果効能を示す文言が含まれていない",
    required: true,
    detail: "Metaポリシー：アカウント名やFacebookページ名に「〇〇改善」「ダイエット効果」等の効能表現を含めることは禁止",
    category: "媒体",
  },
];

// ===== ByteDance（TikTok）追加項目 =====
const bytedanceItems: CheckItemDef[] = [
  {
    id: "bd-001",
    text: "他媒体（Meta・Google等）でOKでもByteDance（TikTok）でNGになる可能性を確認した",
    required: true,
    detail: "ByteDanceは他媒体と審査基準が異なる場合が多く、特に健康・美容・金融カテゴリは厳しい傾向がある。媒体固有のガイドラインを必ず再確認すること",
    category: "媒体",
  },
  {
    id: "bd-002",
    text: "ByteDance広告ポリシーの最新版を確認し、配信対象商品・サービスが審査通過可能か確認した",
    required: true,
    detail: "ByteDance審査ポリシーは頻繁に更新される。特にサプリ・医療・金融は別途申請・審査が必要な場合がある",
    category: "媒体",
  },
];

// ===== Google追加項目 =====
const googleItems: CheckItemDef[] = [
  {
    id: "google-001",
    text: "Googleの医療・健康広告ポリシーに準拠していることを確認した",
    required: true,
    detail: "Google広告：医療・健康カテゴリは認定が必要な場合がある。規制対象商品（処方薬等）の広告は審査の上、認定を取得すること",
    category: "媒体",
  },
];

// ===== LINE追加項目 =====
const lineItems: CheckItemDef[] = [
  {
    id: "line-001",
    text: "LINE広告の審査基準を確認し、掲載可能なカテゴリであることを確認した",
    required: true,
    detail: "LINE広告：健康食品・化粧品・医薬品等は審査基準が厳しい。事前にLINE広告審査ガイドラインを確認すること",
    category: "媒体",
  },
];

// ===== SmartNews追加項目 =====
const smartnewsItems: CheckItemDef[] = [
  {
    id: "sn-001",
    text: "SmartNewsの広告掲載基準を確認し、掲載可能なカテゴリであることを確認した",
    required: true,
    detail: "SmartNews：ニュースコンテキストに合わせた表現が求められる。センセーショナルな表現・誇大な主張は不可",
    category: "媒体",
  },
];

/**
 * CR種別×媒体の組み合わせに応じたチェック項目一覧を返す
 */
export function getChecklistItems(crType: CrType, media: MediaType): CheckItemDef[] {
  // 入稿チェックは専用項目のみ
  if (crType === "入稿") {
    return [...submissionCheckItems];
  }

  const items: CheckItemDef[] = [...commonItems];

  // CR種別別の追加項目
  switch (crType) {
    case "バナー":
      items.push(...bannerItems);
      break;
    case "動画":
      items.push(...videoItems);
      break;
    case "TD":
      items.push(...tdItems);
      break;
  }

  // 媒体別の追加項目
  switch (media) {
    case "Meta":
      items.push(...metaItems);
      break;
    case "Google":
      items.push(...googleItems);
      break;
    case "ByteDance":
      items.push(...bytedanceItems);
      break;
    case "LINE":
      items.push(...lineItems);
      break;
    case "SmartNews":
      items.push(...smartnewsItems);
      break;
    case "YDA":
      items.push({
        id: "yda-001",
        text: "YDA（Yahoo!ディスプレイ広告）の審査基準を確認し、掲載可能な表現であることを確認した",
        required: true,
        detail: "YDA：薬機法・景品表示法の遵守に加え、Yahoo!独自の表現規制に注意",
        category: "媒体",
      });
      break;
  }

  return items;
}
