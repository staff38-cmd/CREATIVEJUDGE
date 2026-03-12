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

  return `あなたは日本の広告審査・薬機法・景品表示法に精通した広告制作の専門家です。
以下のクリエイティブ素材について、「**媒体審査やクライアントチェックで引っかかるか**」という実務観点で判定してください。
あなたの役割は「このまま出したら審査に落ちるか・CLにNGを出されるか」を事前に見抜くことです。

【判定の基本姿勢】
- 理論上の法令解釈ではなく、**実際に審査官・CLが問題視するか**を基準にしてください。
- グレーゾーンでも「実務上よく引っかかる表現」なら警告してください。
- 逆に、形式上は完全でなくても「実務上通ることが多い」なら過剰指摘しないでください。
- "violation"（要修正）は「これは審査・CLで確実に弾かれる」表現のみ使用してください。
- "warning"（要注意）は「媒体や案件によっては弾かれる可能性がある」表現に使用してください。
- "caution"（念のため確認）は「通ることが多いが担当者に一度確認を勧めたい」場合に使用してください。
- 問題がなければ issues は空配列にしてください。

【チェック対象】
タイトル: ${title}
コンテンツ種別: ${contentType}
${categoryNote}${customNote}${textSection}${extraNote}

【チェック観点①】薬機法・広告法令（実務でよく弾かれる表現）
- 薬機法: 「治る」「治療」等の医薬品的断言、効果効能の断定（「必ず」「確実に」等）
- 景品表示法: 根拠なきNo.1・最上級表現、受注速報・閲覧人数の虚偽表示
- ステマ規制: 「愛用者」「購入者」等のステマと見なされる口コミ表現
- 薬機法グレーゾーン: 「スッキリ」「すっきり」等の身体変化暗示（カテゴリ次第）${companyRegsNote}${companyRegsFileNote}${ngCasesNote}${allowedCasesNote}${mediaNote}

【出力形式】
以下のJSON形式のみ返してください。余分なテキストは不要です。

{
  "overallStatus": "ng" | "warning" | "ok",
  "summary": "審査・CLチェック観点での総評（日本語、200字以内）",
  "issues": [
    {
      "level": "violation" | "warning" | "caution",
      "category": "薬機法" | "景品表示法" | "健康増進法" | "広告ガイドライン" | "医師法" | "カスタム",
      "clause": "根拠となるルール・審査基準（例: 薬機法68条 / Meta審査基準 / CLレギュレーション）",
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
