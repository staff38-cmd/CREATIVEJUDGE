/**
 * JSON ファイルから PostgreSQL へのデータ移行スクリプト
 * サーバー上で実行: node ~/app/scripts/migrate-json-to-pg.mjs
 */

import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const DATA_DIR = join(ROOT, "data");

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
console.log("✅ DB 接続成功");

let projectCount = 0, workCount = 0, checklistCount = 0, mediaCount = 0;

// ── Projects ──────────────────────────────────────────────
const projectsFile = join(DATA_DIR, "projects.json");
if (existsSync(projectsFile)) {
  const projects = JSON.parse(readFileSync(projectsFile, "utf8"));
  for (const p of projects) {
    await client.query(
      `INSERT INTO "Project" (
        id, name, "clientName", description, "createdAt",
        "sheetUrl", "ngSheetUrl", "companyRegulations",
        "companyRegulationsFileName", "companyRegulationsFileContent",
        "ngCases", "allowedCases"
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      ON CONFLICT (id) DO NOTHING`,
      [
        p.id, p.name, p.clientName ?? null, p.description ?? null,
        p.createdAt, p.sheetUrl ?? null, p.ngSheetUrl ?? null,
        p.companyRegulations ?? null, p.companyRegulationsFileName ?? null,
        p.companyRegulationsFileContent ?? null,
        JSON.stringify(p.ngCases ?? []),
        JSON.stringify(p.allowedCases ?? []),
      ]
    );
    projectCount++;
  }
  console.log(`✅ Projects: ${projectCount} 件`);
}

// ── Works ─────────────────────────────────────────────────
const worksFile = join(DATA_DIR, "works.json");
if (existsSync(worksFile)) {
  const works = JSON.parse(readFileSync(worksFile, "utf8"));
  for (const w of works) {
    await client.query(
      `INSERT INTO "Work" (
        id, title, "contentType", "fileName", "fileType", "fileSize",
        "filePath", "textContent", "sourceUrl", "submittedAt",
        "complianceResult", "customRegulations", "targetCategory",
        "projectId", media
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
      ON CONFLICT (id) DO NOTHING`,
      [
        w.id, w.title, w.contentType,
        w.fileName ?? null, w.fileType ?? null, w.fileSize ?? null,
        w.filePath ?? null, w.textContent ?? null, w.sourceUrl ?? null,
        w.submittedAt,
        w.complianceResult ? JSON.stringify(w.complianceResult) : null,
        w.customRegulations ?? null, w.targetCategory ?? null,
        w.projectId || null, w.media || null,
      ]
    );
    workCount++;
  }
  console.log(`✅ Works: ${workCount} 件`);
}

// ── Checklists ────────────────────────────────────────────
const checklistsFile = join(DATA_DIR, "checklists.json");
if (existsSync(checklistsFile)) {
  const checklists = JSON.parse(readFileSync(checklistsFile, "utf8"));
  for (const c of checklists) {
    await client.query(
      `INSERT INTO "ChecklistSession" (
        id, "projectId", "projectName", media, "crType",
        "checkerName", "reviewerName", "checkResults",
        status, note, "createdAt", "updatedAt"
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      ON CONFLICT (id) DO NOTHING`,
      [
        c.id, c.projectId ?? null, c.projectName ?? null,
        c.media, c.crType, c.checkerName, c.reviewerName ?? null,
        JSON.stringify(c.checkResults ?? []),
        c.status ?? "draft", c.note ?? null,
        c.createdAt, c.updatedAt,
      ]
    );
    checklistCount++;
  }
  console.log(`✅ Checklists: ${checklistCount} 件`);
}

// ── Media Regulations ─────────────────────────────────────
const mediaFile = join(DATA_DIR, "media-regulations.json");
if (existsSync(mediaFile)) {
  const regs = JSON.parse(readFileSync(mediaFile, "utf8"));
  for (const [media, content] of Object.entries(regs)) {
    await client.query(
      `INSERT INTO "MediaRegulation" (media, content)
       VALUES ($1, $2)
       ON CONFLICT (media) DO UPDATE SET content = EXCLUDED.content`,
      [media, content]
    );
    mediaCount++;
  }
  console.log(`✅ MediaRegulations: ${mediaCount} 件`);
}

await client.end();
console.log("\n🎉 移行完了！");
console.log(`   Projects: ${projectCount}, Works: ${workCount}, Checklists: ${checklistCount}, MediaRegs: ${mediaCount}`);
