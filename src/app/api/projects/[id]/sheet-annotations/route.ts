import { NextRequest, NextResponse } from "next/server";
import { getProject } from "@/lib/storage";
import { google } from "googleapis";
import path from "path";
import fs from "fs";

// 注釈・表記に関するキーワード
const ANNOTATION_KEYWORDS = [
  "注釈", "注記", "注意書き", "但し書き", "免責",
  "※", "必須表記", "表記要", "表記必要", "表記が必要",
  "注釈要", "注釈必要", "注釈が見えない", "注釈が小さい",
  "脚注", "打消し", "景表法", "景品表示",
];

function extractSheetId(urlOrId: string): string {
  const match = urlOrId.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : urlOrId;
}

function getAuth() {
  const credentialsPath =
    process.env.GOOGLE_CREDENTIALS_PATH ||
    path.join(process.cwd(), "google-credentials.json");
  const credentials = JSON.parse(fs.readFileSync(credentialsPath, "utf-8"));
  return new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
}

export interface AnnotationRow {
  rowNum: number;
  adText: string;
  matchedField: string;
  content: string;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const project = await getProject(id);
  if (!project) {
    return NextResponse.json({ error: "案件が見つかりません" }, { status: 404 });
  }

  const sheetUrl = project.sheetUrl;
  if (!sheetUrl) {
    return NextResponse.json(
      { error: "CR提出シートのURLが設定されていません" },
      { status: 400 }
    );
  }

  try {
    const auth = getAuth();
    const sheets = google.sheets({ version: "v4", auth });
    const spreadsheetId = extractSheetId(sheetUrl);

    // gidからシート名を取得
    const gidMatch = sheetUrl.match(/[#&?]gid=(\d+)/);
    const gid = gidMatch ? gidMatch[1] : null;
    let sheetName = "";
    if (gid) {
      const meta = await sheets.spreadsheets.get({ spreadsheetId });
      const found = (meta.data.sheets ?? []).find(
        (s) => String(s.properties?.sheetId) === gid
      );
      if (found?.properties?.title) sheetName = found.properties.title;
    }

    const rangePrefix = sheetName ? `'${sheetName.replace(/'/g, "''")}'!` : "";

    // ヘッダー行を検索（最初の5行から「備考」を含む行を探す）
    const headerRes = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${rangePrefix}A1:T5`,
      valueRenderOption: "FORMATTED_VALUE",
    });
    const headerRows = (headerRes.data.values ?? []) as string[][];

    // ヘッダー行を特定（「備考」「チェック」「コピー」「テキスト」「画像」を含む行）
    let headerRowIdx = -1;
    let headers: string[] = [];
    for (let i = 0; i < headerRows.length; i++) {
      const row = headerRows[i];
      const text = row.join(" ");
      if (text.includes("備考") && (text.includes("チェック") || text.includes("CL"))) {
        headerRowIdx = i;
        headers = row;
        break;
      }
    }

    if (headerRowIdx < 0) {
      return NextResponse.json({ error: "ヘッダー行が見つかりません" }, { status: 400 });
    }

    const dataStartRow = headerRowIdx + 2; // 1-indexed, skip header row

    // 列インデックスを動的に検出
    const noteColIndices: { name: string; idx: number }[] = [];
    let adTextCol = -1;

    for (let j = 0; j < headers.length; j++) {
      const h = headers[j];
      if (!h) continue;
      // 広告コピー/テキスト列
      if ((h === "テキスト" || h === "広告コピー" || h.includes("コピー")) && adTextCol < 0) {
        adTextCol = j;
      }
      // 備考系列をすべて収集
      if (h.includes("備考") || h.includes("備考欄")) {
        noteColIndices.push({ name: h.replace(/\n/g, ""), idx: j });
      }
    }

    if (noteColIndices.length === 0) {
      return NextResponse.json({ error: "備考列が見つかりません" }, { status: 400 });
    }

    // データを読み取り（最大2000行）
    const maxCols = Math.max(...noteColIndices.map((c) => c.idx), adTextCol) + 1;
    const colLetter = String.fromCharCode(65 + maxCols); // A + maxCols
    const dataRes = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${rangePrefix}A${dataStartRow}:${colLetter}${dataStartRow + 1999}`,
      valueRenderOption: "FORMATTED_VALUE",
    });
    const dataRows = (dataRes.data.values ?? []) as string[][];

    const results: AnnotationRow[] = [];

    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i];
      const adText = adTextCol >= 0 ? String(row[adTextCol] ?? "").trim() : "";

      for (const { name, idx } of noteColIndices) {
        const cellValue = String(row[idx] ?? "").trim();
        if (!cellValue) continue;

        const isAnnotation = ANNOTATION_KEYWORDS.some((kw) =>
          cellValue.includes(kw)
        );
        if (isAnnotation) {
          results.push({
            rowNum: dataStartRow + i,
            adText,
            matchedField: name,
            content: cellValue,
          });
          break; // 1行1件
        }
      }
    }

    return NextResponse.json({
      total: results.length,
      scanned: dataRows.length,
      headerRow: headerRowIdx + 1,
      noteCols: noteColIndices.map((c) => c.name),
      annotations: results,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[sheet-annotations]", err);
    return NextResponse.json({ error: `シート取得エラー: ${msg}` }, { status: 500 });
  }
}
