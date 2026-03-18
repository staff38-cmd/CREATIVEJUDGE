#!/usr/bin/env node
/**
 * AI校閲レギュレーション同期スクリプト（スタンドアロン版）
 *
 * 概要:
 *   CR提出シートの備考欄（H,I,K,L,M,O,P列）を読み取り、
 *   Claude AIがNG表現を分類して data/regulations-test.json に出力する。
 *   ★ DB書き込みなし。動作確認・テスト用。
 *
 * 実行方法:
 *   node scripts/sync-regulations.mjs
 *   node scripts/sync-regulations.mjs --sheet-id=SHEET_ID --from-row=2
 *   node scripts/sync-regulations.mjs --dry-run   # ファイル出力もしない
 *
 * 環境変数（プロジェクトルートの .env.local から自動読み込み）:
 *   GEMINI_API_KEY             - Gemini APIキー（必須）
 *   GOOGLE_CREDENTIALS_PATH    - google-credentials.json のパス（既存と同じ）
 */

import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

// .env / .env.local 読み込み
function loadDotenv() {
  for (const name of [".env", ".env.local"]) {
  const envPath = path.join(ROOT, name);
  if (!fs.existsSync(envPath)) continue;
  for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx < 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = val;
  }
  }
}
loadDotenv();

// ===== 引数パース =====
const argMap = {};
for (const arg of process.argv.slice(2)) {
  if (arg.startsWith("--")) {
    const [k, v] = arg.slice(2).split("=");
    argMap[k] = v ?? true;
  }
}

const SHEET_ID =
  argMap["sheet-id"] ||
  "1P5uXJks9p2nNRR5pVCl3MGmzw94Uqt9KgtksgrRmQkw"; // ファーマフーズ デフォルト

const GID = argMap["gid"] || "2141079898"; // シートタブID
const FROM_ROW = parseInt(argMap["from-row"] || "2", 10);
const DRY_RUN = argMap["dry-run"] === true || argMap["dry-run"] === "true";
const OUTPUT_PATH = path.join(ROOT, "data", "regulations-test.json");

// CR提出シートの列インデックス
const CR_COL = {
  AD_TEXT: 2,    // C
  CL1_RESULT: 7, // H: 1次CL ○×
  CL1_NOTE: 8,   // I: 1次CL 備考
  CL2_RESULT: 10,// K: 2次CL ○×
  CL2_NOTE: 11,  // L: 2次CL 備考
  MEMO: 12,      // M: 備考
  NG_REASON: 14, // O: NG理由
  AALL_NOTE: 15, // P: アール備考
};

async function main() {
  console.log("=== AI校閲レギュレーション同期（スタンドアロン）===");
  console.log(`実行日時: ${new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}`);
  console.log(`対象シート: ${SHEET_ID} (gid=${GID})`);
  console.log(`読み取り開始行: ${FROM_ROW}`);
  if (DRY_RUN) console.log("【DRY RUN: ファイル出力なし】");
  console.log("");

  if (!process.env.GEMINI_API_KEY) {
    console.error("❌ GEMINI_API_KEY が未設定（.env.local を確認してください）");
    process.exit(1);
  }

  const credPath = process.env.GOOGLE_CREDENTIALS_PATH ||
    path.join(ROOT, "google-credentials.json");
  if (!fs.existsSync(credPath)) {
    console.error(`❌ Google認証ファイルが見つかりません: ${credPath}`);
    process.exit(1);
  }

  // 1. Sheetsからデータ取得
  console.log("📥 Google Sheetsから取得中...");
  const { google } = await import("googleapis");
  const credentials = JSON.parse(fs.readFileSync(credPath, "utf-8"));
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
  const sheets = google.sheets({ version: "v4", auth });

  // GIDからシート名を取得
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
  const sheetObj = (meta.data.sheets ?? []).find(
    (s) => String(s.properties?.sheetId) === GID
  );
  const sheetName = sheetObj?.properties?.title ?? "";
  console.log(`シートタブ名: "${sheetName || "(1枚目)"}"`);

  const rangePrefix = sheetName ? `'${sheetName.replace(/'/g, "''")}'!` : "";
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${rangePrefix}A${FROM_ROW}:P`,
    valueRenderOption: "FORMATTED_VALUE",
  });

  const rawRows = (res.data.values ?? []);
  console.log(`取得行数: ${rawRows.length}`);

  // 2. NGフィードバックのある行を抽出
  const feedbackRows = rawRows
    .map((row, idx) => {
      const cl1Result = (row[CR_COL.CL1_RESULT] ?? "").trim();
      const cl1Note = (row[CR_COL.CL1_NOTE] ?? "").trim();
      const cl2Result = (row[CR_COL.CL2_RESULT] ?? "").trim();
      const cl2Note = (row[CR_COL.CL2_NOTE] ?? "").trim();
      const memo = (row[CR_COL.MEMO] ?? "").trim();
      const ngReason = (row[CR_COL.NG_REASON] ?? "").trim();
      const aallNote = (row[CR_COL.AALL_NOTE] ?? "").trim();

      const hasNg = cl1Result === "×" || cl2Result === "×";
      const hasNote = [cl1Note, cl2Note, memo, ngReason, aallNote].join("").length > 3;
      if (!hasNg && !hasNote) return null;

      return {
        rowNum: FROM_ROW + idx,
        adText: (row[CR_COL.AD_TEXT] ?? "").trim(),
        cl1Result, cl1Note, cl2Result, cl2Note, memo, ngReason, aallNote,
      };
    })
    .filter(Boolean);

  console.log(`フィードバックあり行: ${feedbackRows.length}`);

  if (feedbackRows.length === 0) {
    console.log("✅ 対象行なし。終了します。");
    return;
  }

  // 3. Gemini AIで分類
  console.log("\n🤖 Gemini AIで分類中...");
  const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`;

  const BATCH_SIZE = 20;
  const results = [];

  for (let i = 0; i < feedbackRows.length; i += BATCH_SIZE) {
    const batch = feedbackRows.slice(i, i + BATCH_SIZE);
    console.log(`  バッチ ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(feedbackRows.length / BATCH_SIZE)}...`);

    const rowsText = batch.map((row) => {
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
    }).join("\n\n---\n\n");

    const prompt = `CR提出シートのフィードバックから、今後のクリエイティブ制作に使えるレギュレーションルールを抽出してください。
具体的なNG表現がある行のみ抽出し、単なる指示行・誤字は除外してください。

${rowsText}

JSONのみ出力（\`\`\`不要）:
{"rules":[{"title":"タイトル","description":"NG理由","category":"過去NG事例"|"企業レギュレーション"|"薬機法"|"景品表示法","quote":"NG表現","sourceRow":行番号}]}`;

    const { default: fetch } = await import("node-fetch");
    const res = await fetch(GEMINI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    });

    if (!res.ok) {
      console.error(`  ⚠️ Gemini API エラー ${res.status}`);
      continue;
    }

    const json = await res.json();
    const text = (json.candidates?.[0]?.content?.parts?.[0]?.text ?? "").trim();
    const cleanText = text.replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();

    try {
      const parsed = JSON.parse(cleanText);
      results.push(...(parsed.rules ?? []));
      for (const r of parsed.rules ?? []) {
        const icon = r.category === "過去NG事例" ? "🔴" : "🟡";
        console.log(`  ${icon} [${r.category}] "${r.quote || r.title}" - ${r.description.slice(0, 50)}...`);
      }
    } catch {
      console.error("  ⚠️ JSON parse error:", cleanText.slice(0, 200));
    }

    if (i + BATCH_SIZE < feedbackRows.length) {
      await new Promise((r) => setTimeout(r, 800));
    }
  }

  console.log(`\n抽出合計: ${results.length} 件`);

  if (!DRY_RUN) {
    fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
    fs.writeFileSync(OUTPUT_PATH, JSON.stringify({
      generatedAt: new Date().toISOString(),
      sheetId: SHEET_ID,
      fromRow: FROM_ROW,
      totalFeedbackRows: feedbackRows.length,
      rules: results,
    }, null, 2), "utf-8");
    console.log(`💾 ${OUTPUT_PATH} に保存しました`);
  }

  console.log("\n✅ 完了！");
}

main().catch((err) => {
  console.error("❌ エラー:", err);
  process.exit(1);
});
