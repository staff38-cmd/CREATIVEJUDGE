import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { getProject, saveProject } from "@/lib/storage";
import { fetchCrSheetFeedback, getCrSheetLastRow, CrFeedbackRow } from "@/lib/sheets";
import { prisma } from "@/lib/prisma";
import { NgCase, RegulationCategory } from "@/lib/types";

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

  // Claude AI でNG表現を分類
  let extractedCases: NgCase[] = [];
  try {
    extractedCases = await classifyFeedbackWithClaude(
      feedbackRows,
      project.name,
      project.clientName ?? ""
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[cr-sheet-sync] AI分類エラー:", err);
    return NextResponse.json({ error: `AI分類エラー: ${msg}` }, { status: 500 });
  }

  if (!dryRun && extractedCases.length > 0) {
    // 既存のngCasesにマージ（重複排除: 同じquote+descriptionは上書き）
    const existingCases: NgCase[] = project.ngCases ?? [];
    const merged = mergeNgCases(existingCases, extractedCases);
    project.ngCases = merged;
    await saveProject(project);
    await upsertSyncState(id, lastRow);
  } else if (!dryRun) {
    await upsertSyncState(id, lastRow);
  }

  // 処理件数の情報
  const processedUntil = feedbackRows.length > 0 ? feedbackRows[feedbackRows.length - 1].rowNum : fromRow - 1;
  const hasMore = body.maxRows !== undefined && feedbackRows.length >= maxRows;

  return NextResponse.json({
    message: dryRun
      ? `DRY RUN完了（保存なし）${hasMore ? ` ※まだ続きがあります（${processedUntil}行目まで処理）` : ""}`
      : `${extractedCases.length} 件のNG表現を抽出・登録しました${hasMore ? ` ※続きあり（${processedUntil}行目まで処理）` : ""}`,
    newRows: feedbackRows.length,
    feedbackRows: feedbackRows.length,
    extracted: extractedCases.length,
    processedUntilRow: processedUntil,
    hasMore,
    cases: dryRun ? extractedCases : undefined, // DRY RUN時のみ内容を返す
  });
}

// ===== Gemini AI でフィードバックを分類 =====

const GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? "";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

async function classifyFeedbackWithClaude(
  rows: CrFeedbackRow[],
  projectName: string,
  clientName: string
): Promise<NgCase[]> {
  const BATCH_SIZE = 20;
  const allCases: NgCase[] = [];
  const now = new Date().toISOString();

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);

    const rowsText = batch
      .map((row) => {
        const parts = [`【行${row.rowNum}】`];
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
今後のクリエイティブ制作に活用できる「レギュレーションルール」を抽出してください。

【抽出ルール】
- 具体的なNG表現・使用禁止フレーズがある行のみ抽出する
- 単なる「修正してください」「再提出」等の操作指示は抽出しない
- 誤字脱字・フォーマットミスはレギュレーションではないため除外する
- OK代替表現が示されている場合は別エントリとして "過去NG事例" カテゴリに記録する
- 1行のフィードバックから複数のNG表現が読み取れる場合は分割して記録する

【対象データ】
${rowsText}

【出力形式】JSONのみ出力（前置き・説明・コードブロック不要）:
{"rules":[{"title":"NG表現のタイトル","description":"NG理由と詳細","category":"過去NG事例"|"企業レギュレーション"|"薬機法"|"景品表示法","quote":"具体的なNG表現・フレーズ（ある場合のみ）","sourceRow":行番号}]}

rulesが空なら {"rules":[]} を返してください。`;

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

    let parsed: { rules: Array<{ title: string; description: string; category: string; quote?: string; sourceRow?: number }> };

    try {
      parsed = JSON.parse(text);
    } catch {
      console.error("[cr-sheet-sync] JSON parse error:", text.slice(0, 300));
      continue;
    }

    for (const rule of parsed.rules ?? []) {
      allCases.push({
        id: uuidv4(),
        title: rule.title,
        description: rule.description + (rule.sourceRow ? ` （シート${rule.sourceRow}行目）` : ""),
        category: (rule.category as RegulationCategory) ?? "過去NG事例",
        quote: rule.quote ?? undefined,
        addedAt: now,
      });
    }

    // レート制限対策
    if (i + BATCH_SIZE < rows.length) {
      await new Promise((r) => setTimeout(r, 800));
    }
  }

  return allCases;
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
