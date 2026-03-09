import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import fetch from "node-fetch";
import { HttpsProxyAgent } from "https-proxy-agent";
import { getWork, saveWork, getProject, getMediaRegulations } from "@/lib/storage";
import { ComplianceIssue, ComplianceResult, NgCase, RegulationCategory, RiskLevel, MediaType } from "@/lib/types";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY!;
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
const GEMINI_UPLOAD_ENDPOINT = `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${GEMINI_API_KEY}`;
const proxyAgent = process.env.HTTP_PROXY ? new HttpsProxyAgent(process.env.HTTP_PROXY) : undefined;

type GeminiPart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } }
  | { fileData: { mimeType: string; fileUri: string } };

/** Gemini Files API に動画/PDFをアップロードし、ファイルURIを返す */
async function uploadToFilesAPI(filePath: string, mimeType: string, displayName: string): Promise<string> {
  const fileBuffer = fs.readFileSync(filePath);
  const fileSize = fileBuffer.length;

  // 1. Resumable upload を開始
  const initRes = await fetch(GEMINI_UPLOAD_ENDPOINT, {
    method: "POST",
    headers: {
      "X-Goog-Upload-Protocol": "resumable",
      "X-Goog-Upload-Command": "start",
      "X-Goog-Upload-Header-Content-Length": String(fileSize),
      "X-Goog-Upload-Header-Content-Type": mimeType,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ file: { display_name: displayName } }),
    ...(proxyAgent ? { agent: proxyAgent } : {}),
  });

  const uploadUrl = initRes.headers.get("x-goog-upload-url");
  if (!uploadUrl) throw new Error("Files API: upload URL が取得できませんでした");

  // 2. ファイルデータをアップロード
  const uploadRes = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "Content-Length": String(fileSize),
      "X-Goog-Upload-Offset": "0",
      "X-Goog-Upload-Command": "upload, finalize",
    },
    body: fileBuffer,
    ...(proxyAgent ? { agent: proxyAgent } : {}),
  });

  const uploadJson = await uploadRes.json() as { file?: { uri?: string; name?: string; state?: string } };
  const fileUri = uploadJson.file?.uri;
  if (!fileUri) throw new Error("Files API: ファイルURIが取得できませんでした");

  // 3. 動画は処理完了まで待機（最大120秒）
  const resourceName = uploadJson.file?.name;
  if (resourceName && uploadJson.file?.state !== "ACTIVE") {
    await waitForFileActive(resourceName, 120_000);
  }

  return fileUri;
}

async function waitForFileActive(resourceName: string, maxWaitMs: number): Promise<void> {
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 3000));
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/${resourceName}?key=${GEMINI_API_KEY}`,
      { ...(proxyAgent ? { agent: proxyAgent } : {}) }
    );
    const json = await res.json() as { state?: string };
    if (json.state === "ACTIVE") return;
    if (json.state === "FAILED") throw new Error("Files API: 動画の処理に失敗しました");
  }
  throw new Error("Files API: 動画処理がタイムアウトしました");
}

export async function POST(req: NextRequest) {
  const { workId, media } = await req.json() as { workId: string; media?: MediaType };

  if (!workId) {
    return NextResponse.json({ error: "workId が必要です" }, { status: 400 });
  }

  const work = getWork(workId);
  if (!work) {
    return NextResponse.json({ error: "コンテンツが見つかりません" }, { status: 404 });
  }

  // Fetch project knowledge if the work belongs to a project
  const project = work.projectId ? getProject(work.projectId) : null;

  // Fetch media-specific regulations if media is specified
  const selectedMedia = media || work.media;
  let mediaRegulationNote: string | undefined;
  if (selectedMedia) {
    const allMediaRegs = getMediaRegulations();
    const reg = allMediaRegs[selectedMedia];
    if (reg) {
      mediaRegulationNote = `${selectedMedia}広告ガイドライン準拠でチェック:\n${reg}`;
    } else {
      mediaRegulationNote = `${selectedMedia}広告ガイドライン準拠でチェック`;
    }
  }

  const isImage = work.fileType?.startsWith("image/");
  const isVideo = work.fileType?.startsWith("video/");

  const promptOpts = {
    title: work.title,
    contentType: work.contentType,
    targetCategory: work.targetCategory,
    customRegulations: work.customRegulations,
    companyRegulations: project?.companyRegulations,
    companyRegulationsFile: project?.companyRegulationsFileContent,
    companyRegulationsFileName: project?.companyRegulationsFileName,
    projectNgCases: project?.ngCases,
    projectAllowedCases: project?.allowedCases,
    mediaRegulationNote,
    selectedMedia,
  };

  const parts: GeminiPart[] = [];

  if (isImage && work.filePath) {
    const fullPath = path.join(process.cwd(), "public", work.filePath);
    if (fs.existsSync(fullPath)) {
      const imageBuffer = fs.readFileSync(fullPath);
      const base64 = imageBuffer.toString("base64");
      const mimeType = (work.fileType ?? "image/jpeg") as "image/jpeg" | "image/png" | "image/gif" | "image/webp";
      parts.push({ inlineData: { mimeType, data: base64 } });
      parts.push({
        text: buildPrompt({
          ...promptOpts,
          extra: "画像の文字・ビジュアルすべてを対象にチェックしてください。",
        }),
      });
    } else {
      parts.push({
        text: buildPrompt({
          ...promptOpts,
          extra: "※ 画像ファイルの読み込みに失敗したため、タイトル・カテゴリ情報のみでチェックします。",
        }),
      });
    }
  } else if (isVideo && work.filePath) {
    const fullPath = path.join(process.cwd(), "public", work.filePath);
    if (fs.existsSync(fullPath)) {
      try {
        const fileUri = await uploadToFilesAPI(fullPath, work.fileType!, work.fileName ?? "video");
        parts.push({ fileData: { mimeType: work.fileType!, fileUri } });
        parts.push({
          text: buildPrompt({
            ...promptOpts,
            extra: "動画全体（映像・音声・テロップ・ナレーション・BGM）を対象に詳細にチェックしてください。",
          }),
        });
      } catch (uploadErr) {
        const msg = uploadErr instanceof Error ? uploadErr.message : "動画アップロードエラー";
        parts.push({
          text: buildPrompt({
            ...promptOpts,
            extra: `動画ファイル名: ${work.fileName ?? "不明"}\n※ 動画のアップロードに失敗したためテキスト情報のみでチェックします（${msg}）。`,
          }),
        });
      }
    } else {
      parts.push({
        text: buildPrompt({
          ...promptOpts,
          extra: `動画ファイル名: ${work.fileName ?? "不明"}\n※ 動画ファイルが見つからないためタイトル・カテゴリ情報のみでチェックします。`,
        }),
      });
    }
  } else {
    const extra = work.contentType === "url" && work.sourceUrl
      ? `取得元URL: ${work.sourceUrl}`
      : undefined;
    parts.push({
      text: buildPrompt({
        ...promptOpts,
        textContent: work.textContent ?? "",
        extra,
      }),
    });
  }

  // Build Gemini REST request body
  const geminiParts = parts.map((p) => {
    if ("inlineData" in p) return { inlineData: p.inlineData };
    if ("fileData" in p) return { fileData: p.fileData };
    return { text: (p as { text: string }).text };
  });

  let responseText: string;
  try {
    const res = await fetch(GEMINI_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: geminiParts }] }),
      ...(proxyAgent ? { agent: proxyAgent } : {}),
    });
    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`Gemini API ${res.status}: ${errBody}`);
    }
    const json = await res.json() as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    responseText = json.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Gemini API エラー";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  const complianceResult = parseResponse(responseText);

  work.complianceResult = complianceResult;
  saveWork(work);

  return NextResponse.json({ complianceResult });
}

interface BuildPromptOptions {
  title: string;
  contentType: string;
  targetCategory?: string;
  customRegulations?: string;
  companyRegulations?: string;
  companyRegulationsFile?: string;
  companyRegulationsFileName?: string;
  projectNgCases?: NgCase[];
  projectAllowedCases?: import("@/lib/types").AllowedCase[];
  textContent?: string;
  extra?: string;
  mediaRegulationNote?: string;
  selectedMedia?: MediaType;
}

function buildPrompt(opts: BuildPromptOptions): string {
  const {
    title, contentType, targetCategory, customRegulations,
    companyRegulations, companyRegulationsFile, companyRegulationsFileName,
    projectNgCases, projectAllowedCases, textContent, extra,
    mediaRegulationNote, selectedMedia,
  } = opts;

  const categoryNote = targetCategory
    ? `商品・サービスカテゴリ: ${targetCategory}`
    : "商品・サービスカテゴリ: 不明（一般的な規制に基づいてチェック）";

  const customNote = customRegulations
    ? `\n追加チェック項目（このコンテンツ専用）:\n${customRegulations}`
    : "";

  // ── フェーズ②: 企業レギュレーション ──
  const companyRegsNote = companyRegulations
    ? `\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n【フェーズ②】企業レギュレーション（法令チェックの次に優先）\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n${companyRegulations}`
    : "";

  const companyRegsFileNote = companyRegulationsFile
    ? `\n\n【企業レギュレーションファイル${companyRegulationsFileName ? `（${companyRegulationsFileName}）` : ""}】\n${companyRegulationsFile}`
    : "";

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
    ngCasesNote = `\n\n【この案件の過去NG事例（同様の問題を検出してください）】\n${casesList}`;
  }

  let allowedCasesNote = "";
  if (projectAllowedCases && projectAllowedCases.length > 0) {
    const casesList = projectAllowedCases
      .map((c, i) => {
        const parts = [`${i + 1}. 【${c.title}】`];
        if (c.quote) parts.push(`   表現例: 「${c.quote}」`);
        parts.push(`   理由・条件: ${c.description}`);
        return parts.join("\n");
      })
      .join("\n\n");
    allowedCasesNote = `\n\n【この案件で使用が承認・確認された許容表現（これらはNGと判定しないでください）】\n${casesList}`;
  }

  const textSection = textContent
    ? `\n--- チェック対象テキスト ---\n${textContent}\n--- テキスト終了 ---`
    : "";

  const extraNote = extra ? `\n【補足】${extra}` : "";

  const mediaNote = mediaRegulationNote
    ? `\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n【媒体別レギュレーション】${selectedMedia ? `（${selectedMedia}）` : ""}\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n${mediaRegulationNote}`
    : "";

  return `あなたは日本の広告法規・薬機法・景品表示法に詳しいアシスタントです。
以下のクリエイティブ素材について、**一次スクリーニング**として問題点を指摘してください。
最終判断は人間の担当者が行うため、あなたの役割は「見落としを防ぐための気づきの提供」です。

【重要な判定方針】
- "violation"（要修正）は、法律・規制に**明らかに抵触する**と判断できる場合のみ使用してください。解釈の余地がある場合は使わないでください。
- "warning"（要確認）は、グレーゾーンや文脈次第では問題になりうる表現に使用してください。
- "caution"（参考情報）は、軽微な懸念や念のため人間が確認すべき点に使用してください。
- 問題がなければ issues は空配列にしてください。些細な指摘を無理やり入れる必要はありません。

【チェック対象】
タイトル: ${title}
コンテンツ種別: ${contentType}
${categoryNote}${customNote}${textSection}${extraNote}

【フェーズ①】薬機法・広告法令（明確な違反のみ指摘）
- 薬機法: 未承認の効能効果の断言、「治る」「治療」等の明確な医薬品的表現
- 景品表示法: 根拠のない「No.1」「最高」等の最上級表現、著しい優良誤認
- 健康増進法: 著しく事実に相違する誇大表現
- 医師法・医療法: 医療行為・診断を断言する表現
- 広告ガイドライン: 根拠のないビフォーアフター、効果の断言${companyRegsNote}${companyRegsFileNote}${ngCasesNote}${allowedCasesNote}${mediaNote}

【出力形式】
以下のJSON形式のみ返してください。余分なテキストは不要です。

{
  "overallStatus": "ng" | "warning" | "ok",
  "summary": "全体的なチェック結果の要約（日本語、200字以内）",
  "issues": [
    {
      "level": "violation" | "warning" | "caution",
      "category": "薬機法" | "景品表示法" | "健康増進法" | "広告ガイドライン" | "医師法" | "カスタム",
      "clause": "根拠となる条文・ルール（例: 薬機法68条 / 企業レギュレーション: 競合比較禁止）",
      "title": "問題点の見出し（30字以内）",
      "description": "詳細な説明（日本語）",
      "quote": "問題のある具体的な表現（テキストがある場合）",
      "suggestion": "改善案（日本語）"
    }
  ]
}

overallStatusの基準:
- "ng": violation が1件以上ある（明確な法令違反）
- "warning": violation はないが warning がある（グレーゾーン・要人間確認）
- "ok": 問題なし（caution のみ、または issues が空）

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
