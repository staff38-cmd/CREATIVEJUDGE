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
    const safeSheetName = `'${sheetName.replace(/'/g, "''")}'`;
    let response;
    try {
      response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `${safeSheetName}!A3:Z`,
      });
    } catch {
      continue;
    }
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

/** 汎用モード: 全シートの全テキストセルを1件ずつNG事例として取込 */
export async function fetchNgRowsFree(sheetUrl: string): Promise<NgCase[]> {
  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });
  const spreadsheetId = extractSheetId(sheetUrl);

  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const sheetNames = (meta.data.sheets ?? []).map((s) => s.properties?.title ?? "");

  const results: NgCase[] = [];

  for (const sheetName of sheetNames) {
    // シート名に特殊文字・スペースが含まれる場合はシングルクォートで囲む
    const safeSheetName = `'${sheetName.replace(/'/g, "''")}'`;
    let response;
    try {
      response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `${safeSheetName}!A1:Z`,
      });
    } catch {
      // 読み取れないシート（画像のみ・特殊形式など）はスキップ
      continue;
    }
    const rows = (response.data.values ?? []) as string[][];

    for (const row of rows) {
      for (const cell of row) {
        const text = String(cell ?? "").trim();
        if (!text) continue;
        // 短すぎる・URLだけ・画像ファイル名っぽいものはスキップ
        if (text.length < 10) continue;
        if (/^https?:\/\//.test(text)) continue;
        if (/\.(png|jpg|jpeg|gif|webp)$/i.test(text)) continue;
        if (/^スクリーンショット|^image/i.test(text)) continue;

        results.push({
          id: uuidv4(),
          title: text.length > 50 ? text.slice(0, 50) + "…" : text,
          description: text,
          category: "カスタム" as const,
          addedAt: new Date().toISOString(),
        });
      }
    }
  }

  return results;
}

// ===== CR提出シート（備考欄）から増分読取 =====

// CR提出シートの列インデックス（固定フォーマット）
const CR_COL = {
  AD_TEXT: 2,    // C: 広告コピー本文
  CL1_RESULT: 7, // H: 1次CL ○×
  CL1_NOTE: 8,   // I: 1次CL 備考
  CL2_RESULT: 10,// K: 2次CL ○×
  CL2_NOTE: 11,  // L: 2次CL 備考
  MEMO: 12,      // M: 備考
  NG_REASON: 14, // O: 最終可否備考（NG理由）
  AALL_NOTE: 15, // P: アール備考
};

export interface CrFeedbackRow {
  rowNum: number;
  adText: string;
  cl1Result: string;
  cl1Note: string;
  cl2Result: string;
  cl2Note: string;
  memo: string;
  ngReason: string;
  aallNote: string;
  /** true = 最終的にOK(○)で通った行 */
  isOk: boolean;
}

/**
 * CR提出シートから指定行以降のフィードバック行を取得する
 * @param sheetUrl - スプレッドシートURL（gidパラメータ対応）
 * @param fromRow - 読み取り開始行（1-indexed、デフォルト=2でヘッダースキップ）
 */
export async function fetchCrSheetFeedback(
  sheetUrl: string,
  fromRow = 2
): Promise<CrFeedbackRow[]> {
  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });

  const spreadsheetId = extractSheetId(sheetUrl);

  // gid（シートタブ）を URL から抽出
  const gidMatch = sheetUrl.match(/[#&?]gid=(\d+)/);
  const gid = gidMatch ? gidMatch[1] : null;

  // gidが指定されている場合はシート名を取得
  let sheetName = "";
  if (gid) {
    const meta = await sheets.spreadsheets.get({ spreadsheetId });
    const found = (meta.data.sheets ?? []).find(
      (s) => String(s.properties?.sheetId) === gid
    );
    if (found?.properties?.title) {
      sheetName = found.properties.title;
    }
  }

  const rangePrefix = sheetName ? `'${sheetName.replace(/'/g, "''")}'!` : "";
  const range = `${rangePrefix}A${fromRow}:P`;

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
    valueRenderOption: "FORMATTED_VALUE",
  });

  const rawRows = (res.data.values ?? []) as string[][];

  return rawRows
    .map((row, idx) => {
      const cl1Result = (row[CR_COL.CL1_RESULT] ?? "").trim();
      const cl1Note = (row[CR_COL.CL1_NOTE] ?? "").trim();
      const cl2Result = (row[CR_COL.CL2_RESULT] ?? "").trim();
      const cl2Note = (row[CR_COL.CL2_NOTE] ?? "").trim();
      const memo = (row[CR_COL.MEMO] ?? "").trim();
      const ngReason = (row[CR_COL.NG_REASON] ?? "").trim();
      const aallNote = (row[CR_COL.AALL_NOTE] ?? "").trim();

      // NG行: ×が付いているか、何らかのメモがある行
      const hasNg = cl1Result === "×" || cl2Result === "×";
      const hasNote = [cl1Note, cl2Note, memo, ngReason, aallNote].join("").length > 3;
      // OK行: 2次CLが○(最終承認)で、テキストか備考がある行
      const isOk = cl2Result === "○" && ((row[CR_COL.AD_TEXT] ?? "").trim().length > 0 || hasNote);

      if (!hasNg && !hasNote && !isOk) return null;

      return {
        rowNum: fromRow + idx,
        adText: (row[CR_COL.AD_TEXT] ?? "").trim(),
        cl1Result,
        cl1Note,
        cl2Result,
        cl2Note,
        memo,
        ngReason,
        aallNote,
        isOk,
      };
    })
    .filter((r): r is CrFeedbackRow => r !== null);
}

/** CR提出シートの総行数（最終行番号）を取得 */
export async function getCrSheetLastRow(sheetUrl: string): Promise<number> {
  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });
  const spreadsheetId = extractSheetId(sheetUrl);

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
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${rangePrefix}A:A`,
    valueRenderOption: "FORMATTED_VALUE",
  });

  return (res.data.values ?? []).length;
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
