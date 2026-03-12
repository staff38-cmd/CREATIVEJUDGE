import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import fetch from "node-fetch";
import { HttpsProxyAgent } from "https-proxy-agent";
import { getWork, saveWork, getProject, getMediaRegulations } from "@/lib/storage";
import { ComplianceIssue, ComplianceResult, NgCase, RegulationCategory, RiskLevel, MediaType } from "@/lib/types";

// 動画のGeminiアップロード+処理待ちで最大5分かかりうる
export const maxDuration = 300;

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
  // readSyncでなくstatSyncでサイズだけ取得してメモリを節約
  const fileSize = fs.statSync(filePath).size;

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

  // 2. createReadStream でアップロード（readFileSync でファイル全体をメモリに載せない）
  const fileStream = fs.createReadStream(filePath);
  const uploadRes = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "Content-Length": String(fileSize),
      "X-Goog-Upload-Offset": "0",
      "X-Goog-Upload-Command": "upload, finalize",
    },
    // node-fetch v3 は Node.js Readable を body として受け付ける
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    body: fileStream as any,
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

  const work = await getWork(workId);
  if (!work) {
    return NextResponse.json({ error: "コンテンツが見つかりません" }, { status: 404 });
  }

  // Fetch project knowledge if the work belongs to a project
  const project = work.projectId ? await getProject(work.projectId) : null;

  // Fetch media-specific regulations if media is specified
  const selectedMedia = media || work.media;
  let mediaRegulationNote: string | undefined;
  if (selectedMedia) {
    const allMediaRegs = await getMediaRegulations();
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
    checkMode: project?.checkMode ?? "soft",
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

  // テキストコンテンツがある場合、過去NG事例のquoteと直接照合して確実に検出
  if (work.textContent && project?.ngCases && project.ngCases.length > 0) {
    const directMatches = detectNgMatches(work.textContent, project.ngCases);
    if (directMatches.length > 0) {
      // AIが既に同じquoteを検出していない場合のみ追加
      const existingQuotes = new Set(
        complianceResult.issues.map((i) => i.quote?.trim()).filter(Boolean)
      );
      const newIssues = directMatches.filter(
        (m) => !existingQuotes.has(m.quote?.trim())
      );
      if (newIssues.length > 0) {
        complianceResult.issues = [...newIssues, ...complianceResult.issues];
        // violationが追加された場合はoverallStatusを更新
        if (complianceResult.overallStatus !== "ng") {
          complianceResult.overallStatus = "ng";
        }
      }
    }
  }

  work.complianceResult = complianceResult;
  await saveWork(work);

  return NextResponse.json({ complianceResult });
}

/** 過去NG事例のquoteとテキストを直接照合してissueを生成する */
function detectNgMatches(textContent: string, ngCases: NgCase[]): ComplianceIssue[] {
  const issues: ComplianceIssue[] = [];
  const seen = new Set<string>();

  for (const ngCase of ngCases) {
    const quote = ngCase.quote?.trim();
    if (!quote || quote.length < 2) continue;
    if (seen.has(quote)) continue;

    if (textContent.includes(quote)) {
      seen.add(quote);
      // タイトルから [テキスト] / [画像] などのプレフィックスを除去
      const cleanTitle = ngCase.title.replace(/^\[.*?\]\s*/, "").slice(0, 30);
      issues.push({
        level: "violation",
        category: ngCase.category ?? "カスタム",
        clause: "過去NG事例（直接照合）",
        title: cleanTitle || "NG表現検出",
        description: `過去NG事例との照合で検出されました。${ngCase.description ? `\n${ngCase.description}` : ""}`,
        quote,
        suggestion: "該当表現を除去または修正してください。",
      });
    }
  }

  return issues;
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
  checkMode?: "soft" | "hard";
}

function buildPrompt(opts: BuildPromptOptions): string {
  const {
    title, contentType, targetCategory, customRegulations,
    companyRegulations, companyRegulationsFile, companyRegulationsFileName,
    projectNgCases, projectAllowedCases, textContent, extra,
    mediaRegulationNote, selectedMedia, checkMode,
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

  const modeInstruction = checkMode === "hard"
    ? `【チェックモード: ハード】
- 企業レギュレーション・過去NG事例に加え、薬機法・景品表示法・景品表示法・ステマ規制も厳しくチェックしてください。
- 「誰が見ても問題ない」表現以外は積極的に指摘してください。
- 法令違反・グレーゾーンも violation または warning として拾ってください。`
    : `【チェックモード: ソフト（デフォルト）】
- チェックの主軸は「企業レギュレーション」「過去NG事例」「媒体ガイドライン」です。
- 薬機法・景品表示法は企業レギュレーションに明記されている場合のみ指摘してください。独自解釈での法令指摘は不要です。
- 指摘は「実際に差し戻しになるもの」に絞ってください。念のための過剰指摘は不要です。`;

  return `あなたは日本の広告制作チームの審査担当です。
以下のクリエイティブ素材について、「**クライアントチェックや媒体審査で実際に引っかかるか**」という実務観点で判定してください。

${modeInstruction}

【共通ルール】
- 許容表現として登録されているものは絶対にNGにしないでください。
- 企業レギュレーションやクライアント固有ルールへの違反は確実に violation にしてください。

【チェック対象】
タイトル: ${title}
コンテンツ種別: ${contentType}
${categoryNote}${customNote}${textSection}${extraNote}${companyRegsNote}${companyRegsFileNote}${ngCasesNote}${allowedCasesNote}${mediaNote}

【出力形式】
以下のJSON形式のみ返してください。余分なテキストは不要です。

{
  "overallStatus": "ng" | "warning" | "ok",
  "summary": "審査・CLチェック観点での総評（日本語、200字以内）",
  "issues": [
    {
      "level": "violation" | "warning" | "caution",
      "category": "企業レギュレーション" | "媒体ガイドライン" | "過去NG事例" | "薬機法" | "景品表示法" | "カスタム",
      "clause": "根拠となるルール・審査基準（例: 薬機法68条 / CLレギュレーション / 過去NG事例）",
      "title": "問題点の見出し（30字以内）",
      "description": "なぜ審査・CLに引っかかるリスクがあるか（実務的な説明）",
      "quote": "問題のある具体的な表現（テキストがある場合）",
      "suggestion": "審査を通すための修正案（具体的な代替表現を含めてください）"
    }
  ]
}

overallStatusの基準:
- "ng": violation が1件以上ある（このまま出したら審査・CLで確実に弾かれる）
- "warning": violation はないが warning がある（要注意・媒体や案件次第でNG）
- "ok": 通る可能性が高い（caution のみ、または issues が空）

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
        ["企業レギュレーション", "媒体ガイドライン", "過去NG事例", "薬機法", "景品表示法", "カスタム"].includes(
          i.category ?? ""
        )
          ? i.category
          : "企業レギュレーション"
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
