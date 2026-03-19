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
  sheetName: string;
  adText: string;
  matchedField: string;
  content: string;
}

export interface AnnotationGroup {
  key: string;       // グループ表示テキスト（全角スペース後の指示部分）
  variants: string[]; // 実際のバリエーション（前置きが異なるものをまとめる）
  count: number;
  examples: { rowNum: number; sheetName: string; adText: string; content: string }[];
}

// 全角スペース（　）の後ろの「指示部分」を抽出してグループキーとする
// 例: "異常肥満　遷移先に注釈要" → "遷移先に注釈要"
// 例: "遷移先に注釈要" → "遷移先に注釈要"（そのまま）
function extractGroupKey(content: string): string {
  const idx = content.indexOf("\u3000"); // 全角スペース
  if (idx > 0 && idx < content.length - 1) {
    return content.slice(idx + 1).trim();
  }
  // 半角スペース2つ以上で区切られた場合
  const m = content.match(/^.+?\s{2,}(.+)$/);
  if (m) return m[1].trim();
  return content;
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

    // スプレッドシートの全シート一覧を取得
    const meta = await sheets.spreadsheets.get({ spreadsheetId });
    const allSheets = (meta.data.sheets ?? []).map((s) => s.properties?.title ?? "").filter(Boolean);

    const results: AnnotationRow[] = [];
    let totalScanned = 0;

    for (const sheetName of allSheets) {
      // ヘッダー行を検索（最初の5行から「備考」を含む行を探す）
      const safeSheetName = `'${sheetName.replace(/'/g, "''")}'`;
      let headerRows: string[][];
      try {
        const headerRes = await sheets.spreadsheets.values.get({
          spreadsheetId,
          range: `${safeSheetName}!A1:T5`,
          valueRenderOption: "FORMATTED_VALUE",
        });
        headerRows = (headerRes.data.values ?? []) as string[][];
      } catch {
        continue;
      }

      // ヘッダー行特定（「備考」「チェック」「CL」を含む行）
      let headerRowIdx = -1;
      let headers: string[] = [];
      for (let i = 0; i < headerRows.length; i++) {
        const text = headerRows[i].join(" ");
        if (text.includes("備考") && (text.includes("チェック") || text.includes("CL"))) {
          headerRowIdx = i;
          headers = headerRows[i];
          break;
        }
      }
      if (headerRowIdx < 0) continue;

      const dataStartRow = headerRowIdx + 2; // 1-indexed

      // 備考列を動的検出
      const noteColIndices: { name: string; idx: number }[] = [];
      let adTextCol = -1;

      for (let j = 0; j < headers.length; j++) {
        const h = headers[j];
        if (!h) continue;
        if ((h === "テキスト" || h === "広告コピー" || h.includes("コピー")) && adTextCol < 0) {
          adTextCol = j;
        }
        if (h.includes("備考") || h.includes("備考欄")) {
          noteColIndices.push({ name: h.replace(/\n/g, ""), idx: j });
        }
      }

      if (noteColIndices.length === 0) continue;

      // データを全行読み取り
      const maxColIdx = Math.max(...noteColIndices.map((c) => c.idx), adTextCol >= 0 ? adTextCol : 0);
      const colLetter = maxColIdx < 26
        ? String.fromCharCode(65 + maxColIdx)
        : "T"; // 最大T列まで

      let dataRows: string[][];
      try {
        const dataRes = await sheets.spreadsheets.values.get({
          spreadsheetId,
          range: `${safeSheetName}!A${dataStartRow}:${colLetter}`,
          valueRenderOption: "FORMATTED_VALUE",
        });
        dataRows = (dataRes.data.values ?? []) as string[][];
      } catch {
        continue;
      }

      totalScanned += dataRows.length;

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
              sheetName,
              adText,
              matchedField: name,
              content: cellValue,
            });
            break; // 1行1件
          }
        }
      }
    }

    // グループキー（指示部分）でグループ化
    const groupMap = new Map<string, AnnotationGroup>();
    for (const r of results) {
      const key = extractGroupKey(r.content);
      if (!groupMap.has(key)) {
        groupMap.set(key, { key, variants: [], count: 0, examples: [] });
      }
      const g = groupMap.get(key)!;
      g.count++;
      // バリエーション（異なる表記）を収集（最大5種）
      if (!g.variants.includes(r.content) && g.variants.length < 5) {
        g.variants.push(r.content);
      }
      if (g.examples.length < 3) {
        g.examples.push({ rowNum: r.rowNum, sheetName: r.sheetName, adText: r.adText, content: r.content });
      }
    }
    const grouped = Array.from(groupMap.values()).sort((a, b) => b.count - a.count);

    return NextResponse.json({
      total: results.length,
      unique: grouped.length,
      scanned: totalScanned,
      sheets: allSheets,
      annotations: grouped,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[sheet-annotations]", err);
    return NextResponse.json({ error: `シート取得エラー: ${msg}` }, { status: 500 });
  }
}
