import { google } from "googleapis";
import path from "path";
import fs from "fs";
import { NgCase } from "./types";
import { v4 as uuidv4 } from "uuid";

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

type ContentTabType = "text" | "image" | "video";

interface SheetNgRow {
  contentType: ContentTabType;
  tabName: string;
  content: string;   // テキスト / 動画テキストおこし
  url: string;       // 画像URL / 動画URL
  indication1: string; // クライアント指摘
  indication2: string; // クライアント指摘（二次）
}

function detectContentType(sheetName: string): ContentTabType | null {
  if (sheetName.includes("テキスト")) return "text";
  if (sheetName.includes("画像")) return "image";
  if (sheetName.includes("動画")) return "video";
  return null;
}

function findCol(headers: string[], matcher: (h: string) => boolean): number {
  return headers.findIndex(matcher);
}

export async function fetchNgRowsFromSheet(sheetUrl: string): Promise<SheetNgRow[]> {
  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });
  const spreadsheetId = extractSheetId(sheetUrl);

  // シート一覧を取得
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const sheetNames = (meta.data.sheets ?? []).map(
    (s) => s.properties?.title ?? ""
  );

  const results: SheetNgRow[] = [];

  for (const sheetName of sheetNames) {
    const contentType = detectContentType(sheetName);
    if (!contentType) continue;

    // ヘッダーは3行目 → A3:Z で取得
    const range = `${sheetName}!A3:Z`;
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range,
    });
    const rows = (response.data.values ?? []) as string[][];
    if (rows.length < 2) continue; // ヘッダー行のみ or 空

    const headers = rows[0].map((h) => String(h ?? "").trim());

    // 列インデックスを動的検出
    let contentCol = -1;
    let urlCol = -1;

    if (contentType === "text") {
      contentCol = findCol(headers, (h) => h === "テキスト" || h.includes("テキスト"));
    } else if (contentType === "image") {
      contentCol = findCol(headers, (h) => h === "画像" || (h.includes("画像") && !h.includes("URL") && !h.includes("サムネ") && !h.includes("APNG")));
      urlCol = findCol(headers, (h) => h === "URL" || h.includes("画像URL") || (h.toLowerCase() === "url"));
    } else {
      // video
      contentCol = findCol(headers, (h) => h.includes("動画テキスト") || h.includes("テキストおこし") || h.includes("テキスト起こし"));
      urlCol = findCol(headers, (h) => h === "URL" || h.includes("動画URL") || h.toLowerCase() === "url");
    }

    // クライアント指摘列（一次・二次）
    const ind1Col = findCol(
      headers,
      (h) => h.includes("クライアント指摘") && !h.includes("二次") && !h.includes("備考")
    );
    const ind2Col = findCol(
      headers,
      (h) => h.includes("クライアント指摘") && h.includes("二次")
    );

    // データ行（4行目以降）
    for (const row of rows.slice(1)) {
      const content = contentCol >= 0 ? String(row[contentCol] ?? "").trim() : "";
      const url = urlCol >= 0 ? String(row[urlCol] ?? "").trim() : "";
      const indication1 = ind1Col >= 0 ? String(row[ind1Col] ?? "").trim() : "";
      const indication2 = ind2Col >= 0 ? String(row[ind2Col] ?? "").trim() : "";

      // 指摘内容が空の行はスキップ
      if (!indication1 && !indication2) continue;

      results.push({ contentType, tabName: sheetName, content, url, indication1, indication2 });
    }
  }

  return results;
}

export function convertToNgCases(rows: SheetNgRow[]): NgCase[] {
  return rows.map((row) => {
    const contentTypeLabel =
      row.contentType === "text" ? "テキスト" :
      row.contentType === "image" ? "画像" : "動画";

    // タイトル: 指摘内容の先頭50文字
    const indicationText = row.indication1 || row.indication2;
    const title = indicationText.length > 50
      ? indicationText.slice(0, 50) + "…"
      : indicationText;

    // descriptionに一次・二次両方を含める
    let description = "";
    if (row.indication1) description += `一次指摘: ${row.indication1}`;
    if (row.indication2) description += (description ? "\n" : "") + `二次指摘: ${row.indication2}`;

    // quoteはNG表現本体（テキスト内容 or URL）
    const quote =
      row.contentType === "text"
        ? row.content || undefined
        : row.url || undefined;

    return {
      id: uuidv4(),
      title: `[${contentTypeLabel}] ${title}`,
      description,
      category: "カスタム" as const,
      quote,
      addedAt: new Date().toISOString(),
    };
  });
}
