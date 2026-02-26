import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import fs from "fs";
import path from "path";
import { getWork, saveWork, getProject } from "@/lib/storage";
import { ComplianceIssue, ComplianceResult, NgCase, RegulationCategory, RiskLevel } from "@/lib/types";

const client = new Anthropic();

export async function POST(req: NextRequest) {
  const { workId } = await req.json();

  if (!workId) {
    return NextResponse.json({ error: "workId が必要です" }, { status: 400 });
  }

  const work = getWork(workId);
  if (!work) {
    return NextResponse.json({ error: "コンテンツが見つかりません" }, { status: 404 });
  }

  // Fetch project knowledge if the work belongs to a project
  const project = work.projectId ? getProject(work.projectId) : null;

  const isImage = work.fileType?.startsWith("image/");
  const isVideo = work.fileType?.startsWith("video/");
  const isPdf = work.fileType === "application/pdf";

  let messageContent: Anthropic.MessageParam["content"];

  const promptOpts = {
    title: work.title,
    contentType: work.contentType,
    targetCategory: work.targetCategory,
    customRegulations: work.customRegulations,
    projectRegulations: project?.regulations,
    projectNgCases: project?.ngCases,
  };

  if (isImage && work.filePath) {
    // Image: send as vision
    const fullPath = path.join(process.cwd(), "public", work.filePath);
    if (fs.existsSync(fullPath)) {
      const imageBuffer = fs.readFileSync(fullPath);
      const base64 = imageBuffer.toString("base64");
      const mediaType = work.fileType as "image/jpeg" | "image/png" | "image/gif" | "image/webp";
      messageContent = [
        {
          type: "image",
          source: { type: "base64", media_type: mediaType, data: base64 },
        },
        {
          type: "text",
          text: buildPrompt({
            ...promptOpts,
            extra: "画像の文字・ビジュアルすべてを対象にチェックしてください。",
          }),
        },
      ];
    } else {
      messageContent = buildPrompt({
        ...promptOpts,
        extra: "※ 画像ファイルの読み込みに失敗したため、タイトル・カテゴリ情報のみでチェックします。",
      });
    }
  } else if (isVideo) {
    messageContent = buildPrompt({
      ...promptOpts,
      extra: `動画ファイル名: ${work.fileName ?? "不明"}\n※ 動画の内容はファイル名・タイトル・カテゴリ情報をもとにチェックします。映像内のテキストやナレーション原稿があれば別途テキストとして登録することをお勧めします。`,
    });
  } else if (isPdf || work.contentType === "pdf") {
    messageContent = buildPrompt({
      ...promptOpts,
      extra: `PDFファイル名: ${work.fileName ?? "不明"}\n※ PDFのテキスト抽出は未対応です。タイトルとカテゴリ情報でチェックを実施します。テキスト内容を直接貼り付けて「テキスト」として登録することをお勧めします。`,
    });
  } else {
    messageContent = buildPrompt({
      ...promptOpts,
      textContent: work.textContent ?? "",
    });
  }

  let response;
  try {
    response = await client.messages.create({
      model: "claude-opus-4-6",
      max_tokens: 4096,
      messages: [{ role: "user", content: messageContent }],
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Anthropic API エラー";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  const raw = response.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { type: "text"; text: string }).text)
    .join("");

  const complianceResult = parseResponse(raw);

  work.complianceResult = complianceResult;
  saveWork(work);

  return NextResponse.json({ complianceResult });
}

interface BuildPromptOptions {
  title: string;
  contentType: string;
  targetCategory?: string;
  customRegulations?: string;
  projectRegulations?: string;
  projectNgCases?: NgCase[];
  textContent?: string;
  extra?: string;
}

function buildPrompt(opts: BuildPromptOptions): string {
  const {
    title, contentType, targetCategory, customRegulations,
    projectRegulations, projectNgCases, textContent, extra,
  } = opts;

  const categoryNote = targetCategory
    ? `商品・サービスカテゴリ: ${targetCategory}`
    : "商品・サービスカテゴリ: 不明（一般的な規制に基づいてチェック）";

  // Per-work custom regulations
  const customNote = customRegulations
    ? `\n追加チェック項目（このコンテンツ専用）:\n${customRegulations}`
    : "";

  // Project-level regulations (always applied for this project)
  const projectRegsNote = projectRegulations
    ? `\n【案件レギュレーション（この案件すべてに適用）】\n${projectRegulations}`
    : "";

  // Past NG cases as knowledge
  let ngCasesNote = "";
  if (projectNgCases && projectNgCases.length > 0) {
    const casesList = projectNgCases
      .map((c, i) => {
        const parts = [`${i + 1}. 【${c.title}】`];
        if (c.category) parts.push(`   カテゴリ: ${c.category}`);
        if (c.quote) parts.push(`   問題表現例: 「${c.quote}」`);
        parts.push(`   内容: ${c.description}`);
        return parts.join("\n");
      })
      .join("\n\n");
    ngCasesNote = `\n\n【この案件の過去NG事例（参考にして同様の問題を検出してください）】\n${casesList}`;
  }

  const textSection = textContent
    ? `\n--- チェック対象テキスト ---\n${textContent}\n--- テキスト終了 ---`
    : "";

  const extraNote = extra ? `\n【補足】${extra}` : "";

  return `あなたは日本の広告法規・薬機法・景品表示法の専門家AIです。
以下のクリエイティブ素材が、日本の法規制および広告ガイドラインに違反していないかをチェックしてください。

【チェック対象】
タイトル: ${title}
コンテンツ種別: ${contentType}
${categoryNote}${customNote}${projectRegsNote}${ngCasesNote}${textSection}${extraNote}

【チェック対象の法規制・ガイドライン】
1. **薬機法（医薬品医療機器等法）**
   - 未承認医薬品・医療機器の効能効果の標榜（68条）
   - 化粧品の効能範囲を超えた表現（医薬品的効能効果の標榜）
   - 健康食品・サプリメントの医薬品的効果の標榜
   - 「治る」「治療」「改善する」等の医薬品的表現

2. **景品表示法（不当景品類及び不当表示防止法）**
   - 優良誤認表示（実際より著しく優良と示す表現）
   - 有利誤認表示（実際より著しく有利と示す価格・条件）
   - 「No.1」「最高」等の根拠のない最上級表現

3. **健康増進法**
   - 誇大広告（著しく事実に相違する、または著しく人を誤認させる表現）

4. **医師法・医療法**
   - 医療行為・診断・処方を示唆する表現
   - 医師・医療機関との混同を招く表現

5. **広告ガイドライン（一般）**
   - ビフォーアフター画像の過度な誇張
   - 体験談・口コミの使用制限
   - 効果に関する根拠提示義務

【出力形式】
以下のJSON形式で返してください。JSONのみ出力し、余分なテキストは不要です。

{
  "overallStatus": "ng" | "warning" | "ok",
  "summary": "全体的なチェック結果の要約（日本語、200字以内）",
  "issues": [
    {
      "level": "violation" | "warning" | "caution",
      "category": "薬機法" | "景品表示法" | "健康増進法" | "広告ガイドライン" | "医師法" | "カスタム",
      "clause": "条文番号（例: 薬機法68条）",
      "title": "問題点の見出し（30字以内）",
      "description": "詳細な説明（日本語）",
      "quote": "問題のある具体的な表現（テキストがある場合）",
      "suggestion": "改善案（日本語）"
    }
  ]
}

overallStatusの基準:
- "ng": 違反（violation）レベルの問題が1件以上ある
- "warning": 警告（warning）レベルの問題はあるが違反なし
- "ok": 問題なし（cautionのみは ok でも可）

issuesが空の場合は [] としてください。`;
}

interface RawIssue {
  level?: string;
  category?: string;
  clause?: string;
  title?: string;
  description?: string;
  quote?: string;
  suggestion?: string;
}

function parseResponse(raw: string): ComplianceResult {
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return fallbackResult("AI応答のパースに失敗しました。");
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]);

    const issues: ComplianceIssue[] = (parsed.issues ?? []).map((i: RawIssue) => ({
      level: (["violation", "warning", "caution", "ok"].includes(i.level ?? "")
        ? i.level
        : "caution") as RiskLevel,
      category: (
        ["薬機法", "景品表示法", "健康増進法", "広告ガイドライン", "医師法", "カスタム"].includes(
          i.category ?? ""
        )
          ? i.category
          : "広告ガイドライン"
      ) as RegulationCategory,
      clause: i.clause,
      title: String(i.title ?? "指摘事項"),
      description: String(i.description ?? ""),
      quote: i.quote,
      suggestion: String(i.suggestion ?? ""),
    }));

    const overallStatus = (["ng", "warning", "ok"].includes(parsed.overallStatus)
      ? parsed.overallStatus
      : issues.some((i) => i.level === "violation")
      ? "ng"
      : issues.some((i) => i.level === "warning")
      ? "warning"
      : "ok") as "ng" | "warning" | "ok";

    return {
      overallStatus,
      issues,
      summary: String(parsed.summary ?? "チェックが完了しました。"),
      checkedAt: new Date().toISOString(),
    };
  } catch {
    return fallbackResult("AI応答のパースに失敗しました。");
  }
}

function fallbackResult(msg: string): ComplianceResult {
  return {
    overallStatus: "warning",
    issues: [],
    summary: msg,
    checkedAt: new Date().toISOString(),
  };
}
