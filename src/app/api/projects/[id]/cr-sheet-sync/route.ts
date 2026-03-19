import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { getProject, saveProject } from "@/lib/storage";
import { fetchCrSheetFeedback, getCrSheetLastRow, CrFeedbackRow } from "@/lib/sheets";
import { prisma } from "@/lib/prisma";
import { NgCase, AllowedCase, RegulationCategory } from "@/lib/types";

// GET: 同期状態の取得
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const project = await getProject(id);
  if (!project) {
    return NextResponse.json({ error: "案件が見つかりません" }, { status: 404 });
  }

  const syncState = await prisma.crSheetSync.findUnique({
    where: { projectId: id },
  });

  return NextResponse.json({
    sheetUrl: project.sheetUrl ?? null,
    lastSyncRow: syncState?.lastSyncRow ?? 0,
    lastSyncAt: syncState?.lastSyncAt ?? null,
  });
}

// POST: CR提出シートを同期してNG表現を抽出
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const project = await getProject(id);
  if (!project) {
    return NextResponse.json({ error: "案件が見つかりません" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const dryRun: boolean = body.dryRun ?? false;
  const resetSync: boolean = body.resetSync ?? false; // true=最初から全件再取得
  const maxRows: number = body.maxRows ?? 500; // 1回に処理する最大行数（デフォルト500）

  const sheetUrl = body.sheetUrl || project.sheetUrl;
  if (!sheetUrl) {
    return NextResponse.json(
      { error: "CR提出シートのURLが設定されていません。案件設定で sheetUrl を登録してください。" },
      { status: 400 }
    );
  }

  // 前回の同期状態を取得
  const syncState = await prisma.crSheetSync.findUnique({
    where: { projectId: id },
  });
  const fromRow = resetSync ? 2 : Math.max((syncState?.lastSyncRow ?? 0) + 1, 2);

  // シートから取得（maxRows件に制限）
  let feedbackRows: CrFeedbackRow[];
  let lastRow: number;

  try {
    const allFeedbackRows = await fetchCrSheetFeedback(sheetUrl, fromRow);
    feedbackRows = allFeedbackRows.slice(0, maxRows);
    // 処理した最後の行番号を計算
    const processedUntilRow = feedbackRows.length > 0
      ? feedbackRows[feedbackRows.length - 1].rowNum
      : fromRow - 1;
    lastRow = allFeedbackRows.length > maxRows
      ? processedUntilRow  // まだ続きがある場合は処理済み最終行
      : await getCrSheetLastRow(sheetUrl); // 全件処理済みなら実際の最終行
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[cr-sheet-sync] Sheets取得エラー:", err);

    if (msg.includes("ENOENT") || msg.includes("google-credentials")) {
      return NextResponse.json(
        { error: "Google認証ファイルが見つかりません（google-credentials.json）" },
        { status: 500 }
      );
    }
    if (msg.includes("403") || msg.toLowerCase().includes("permission")) {
      return NextResponse.json(
        { error: "スプレッドシートへのアクセス権がありません。サービスアカウントに閲覧権限を付与してください。" },
        { status: 403 }
      );
    }
    return NextResponse.json({ error: `Sheets取得エラー: ${msg}` }, { status: 500 });
  }

  if (feedbackRows.length === 0) {
    if (!dryRun) {
      await upsertSyncState(id, lastRow);
    }
    return NextResponse.json({
      message: "新しいフィードバック行はありません",
      newRows: lastRow - Math.max(fromRow, 2) + 1,
      feedbackRows: 0,
      extracted: 0,
    });
  }

  // Gemini AI でNG+OK表現を分類
  let extractedNgCases: NgCase[] = [];
  let extractedAllowedCases: AllowedCase[] = [];
  try {
    const result = await classifyFeedbackWithGemini(
      feedbackRows,
      project.name,
      project.clientName ?? ""
    );
    extractedNgCases = result.ngCases;
    extractedAllowedCases = result.allowedCases;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[cr-sheet-sync] AI分類エラー:", err);
    return NextResponse.json({ error: `AI分類エラー: ${msg}` }, { status: 500 });
  }

  if (!dryRun) {
    if (extractedNgCases.length > 0) {
      project.ngCases = mergeNgCases(project.ngCases ?? [], extractedNgCases);
    }
    if (extractedAllowedCases.length > 0) {
      project.allowedCases = mergeAllowedCases(project.allowedCases ?? [], extractedAllowedCases);
    }
    await saveProject(project);
    await upsertSyncState(id, lastRow);
  }

  // 処理件数の情報
  const processedUntil = feedbackRows.length > 0 ? feedbackRows[feedbackRows.length - 1].rowNum : fromRow - 1;
  const hasMore = body.maxRows !== undefined && feedbackRows.length >= maxRows;

  return NextResponse.json({
    message: dryRun
      ? `DRY RUN完了（保存なし）${hasMore ? ` ※まだ続きがあります（${processedUntil}行目まで処理）` : ""}`
      : `NG表現 ${extractedNgCases.length} 件、OK事例 ${extractedAllowedCases.length} 件を抽出・登録しました${hasMore ? ` ※続きあり（${processedUntil}行目まで処理）` : ""}`,
    newRows: feedbackRows.length,
    feedbackRows: feedbackRows.length,
    extracted: extractedNgCases.length,
    extractedOk: extractedAllowedCases.length,
    processedUntilRow: processedUntil,
    hasMore,
    cases: dryRun ? extractedNgCases : undefined,
    okCases: dryRun ? extractedAllowedCases : undefined,
  });
}

// ===== Gemini AI でフィードバックを分類 =====

const GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? "";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

interface ClassificationResult {
  ngCases: NgCase[];
  allowedCases: AllowedCase[];
}

async function classifyFeedbackWithGemini(
  rows: CrFeedbackRow[],
  projectName: string,
  clientName: string
): Promise<ClassificationResult> {
  const BATCH_SIZE = 20;
  const allNgCases: NgCase[] = [];
  const allAllowedCases: AllowedCase[] = [];
  const now = new Date().toISOString();

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);

    const rowsText = batch
      .map((row) => {
        const parts = [`【行${row.rowNum}】${row.isOk ? " ★最終OK" : ""}`];
        if (row.adText) parts.push(`広告コピー: ${row.adText}`);
        if (row.cl1Result) parts.push(`1次CL結果: ${row.cl1Result}`);
        if (row.cl1Note) parts.push(`1次CL備考: ${row.cl1Note}`);
        if (row.cl2Result) parts.push(`2次CL結果: ${row.cl2Result}`);
        if (row.cl2Note) parts.push(`2次CL備考: ${row.cl2Note}`);
        if (row.memo) parts.push(`備考: ${row.memo}`);
        if (row.ngReason) parts.push(`NG理由: ${row.ngReason}`);
        if (row.aallNote) parts.push(`アール備考: ${row.aallNote}`);
        return parts.join("\n");
      })
      .join("\n\n---\n\n");

    const prompt = `あなたは広告クリエイティブのコンプライアンス専門家です。
案件「${projectName}」（クライアント: ${clientName || "不明"}）のCR提出シートからクライアントフィードバックを分析し、
今後のクリエイティブ制作に活用できる知識を2種類抽出してください。

## 抽出①: NGルール（rules）

- 具体的なNG表現・使用禁止フレーズがある行を抽出する
- 注釈・表記に関するフィードバック（「注釈が見えない」「注釈が小さい」「※表記が必要」「注釈要」等）は必ず "注釈・表記ルール" として抽出する
- 単なる「修正してください」「再提出」等の操作指示のみの行は抽出しない
- 誤字脱字・フォーマットミスは除外する
- 1行から複数のNG表現が読み取れる場合は分割して記録する

カテゴリ: "過去NG事例"|"企業レギュレーション"|"薬機法"|"景品表示法"|"注釈・表記ルール"|"媒体ガイドライン"

## 抽出②: OK事例（okCases）

以下のいずれかに該当する「承認・通過が確認できた表現・素材」を抽出する:
- ★最終OKが付いた行の広告コピー（adText）がある場合 → その表現そのものがOK事例
- NG→修正→OK の流れで備考に「○○に変えればOK」「このような表現であれば可」「修正OK」等がある場合 → 承認された修正後の表現
- 動画・画像に対して備考に「演出は問題なし」「訴求方法はOK」等がある場合 → 何がOKだったかの説明をmediaDescriptionに入れる
- 注意: 曖昧なもの・実際にOKと確認できないものは除外する

## 対象データ
${rowsText}

## 出力形式（JSONのみ、前置き・コードブロック不要）
{
  "rules": [
    {"title":"NG表現タイトル","description":"NG理由と詳細","category":"カテゴリ名","quote":"具体的なNG表現（ある場合のみ）","sourceRow":行番号}
  ],
  "okCases": [
    {"title":"OK事例タイトル","description":"なぜOKか・どんな条件でOKか","quote":"承認された具体的な表現（テキスト広告の場合）","mediaDescription":"動画・画像の場合: CLメモから読み取れる承認内容の説明","sourceRow":行番号}
  ]
}

rules・okCases ともに該当なしの場合は空配列 [] を返してください。`;

    const res = await fetch(GEMINI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    });

    if (!res.ok) {
      console.error("[cr-sheet-sync] Gemini API error:", res.status);
      continue;
    }

    const json = await res.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    const rawText = (json.candidates?.[0]?.content?.parts?.[0]?.text ?? "").trim();
    const text = rawText.replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();

    let parsed: {
      rules?: Array<{ title: string; description: string; category: string; quote?: string; sourceRow?: number }>;
      okCases?: Array<{ title: string; description: string; quote?: string; mediaDescription?: string; sourceRow?: number }>;
    };

    try {
      parsed = JSON.parse(text);
    } catch {
      console.error("[cr-sheet-sync] JSON parse error:", text.slice(0, 300));
      continue;
    }

    for (const rule of parsed.rules ?? []) {
      allNgCases.push({
        id: uuidv4(),
        title: rule.title,
        description: rule.description + (rule.sourceRow ? ` （シート${rule.sourceRow}行目）` : ""),
        category: (rule.category as RegulationCategory) ?? "過去NG事例",
        quote: rule.quote ?? undefined,
        addedAt: now,
      });
    }

    for (const ok of parsed.okCases ?? []) {
      allAllowedCases.push({
        id: uuidv4(),
        title: ok.title,
        description: ok.description + (ok.sourceRow ? ` （シート${ok.sourceRow}行目）` : ""),
        quote: ok.quote ?? undefined,
        mediaDescription: ok.mediaDescription ?? undefined,
        addedAt: now,
      });
    }

    // レート制限対策
    if (i + BATCH_SIZE < rows.length) {
      await new Promise((r) => setTimeout(r, 800));
    }
  }

  return { ngCases: allNgCases, allowedCases: allAllowedCases };
}

// 既存のNgCasesとマージ（quoteが同じものは上書き）
function mergeNgCases(existing: NgCase[], newCases: NgCase[]): NgCase[] {
  const map = new Map<string, NgCase>();
  for (const c of existing) {
    map.set(c.quote ?? c.title, c);
  }
  for (const c of newCases) {
    map.set(c.quote ?? c.title, c);
  }
  return Array.from(map.values());
}

// 既存のAllowedCasesとマージ（quoteまたはtitleが同じものは上書き）
function mergeAllowedCases(existing: AllowedCase[], newCases: AllowedCase[]): AllowedCase[] {
  const map = new Map<string, AllowedCase>();
  for (const c of existing) {
    map.set(c.quote ?? c.title, c);
  }
  for (const c of newCases) {
    map.set(c.quote ?? c.title, c);
  }
  return Array.from(map.values());
}

// 同期状態をupsert
async function upsertSyncState(projectId: string, lastRow: number) {
  await prisma.crSheetSync.upsert({
    where: { projectId },
    create: {
      id: uuidv4(),
      projectId,
      lastSyncRow: lastRow,
      lastSyncAt: new Date().toISOString(),
    },
    update: {
      lastSyncRow: lastRow,
      lastSyncAt: new Date().toISOString(),
    },
  });
}
