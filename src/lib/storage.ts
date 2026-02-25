import fs from "fs";
import path from "path";
import { Work, WorkSummary } from "./types";

const DATA_FILE = path.join(process.cwd(), "data", "works.json");

function ensureDataFile() {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify([], null, 2), "utf-8");
  }
}

export function getAllWorks(): Work[] {
  ensureDataFile();
  const raw = fs.readFileSync(DATA_FILE, "utf-8");
  return JSON.parse(raw) as Work[];
}

export function getWork(id: string): Work | null {
  const works = getAllWorks();
  return works.find((w) => w.id === id) ?? null;
}

export function saveWork(work: Work): void {
  const works = getAllWorks();
  const idx = works.findIndex((w) => w.id === work.id);
  if (idx >= 0) {
    works[idx] = work;
  } else {
    works.push(work);
  }
  fs.writeFileSync(DATA_FILE, JSON.stringify(works, null, 2), "utf-8");
}

export function deleteWork(id: string): boolean {
  const works = getAllWorks();
  const idx = works.findIndex((w) => w.id === id);
  if (idx < 0) return false;
  works.splice(idx, 1);
  fs.writeFileSync(DATA_FILE, JSON.stringify(works, null, 2), "utf-8");
  return true;
}

export function toSummary(work: Work): WorkSummary {
  const result = work.complianceResult;
  const issues = result?.issues ?? [];

  return {
    id: work.id,
    title: work.title,
    contentType: work.contentType,
    fileType: work.fileType,
    filePath: work.filePath,
    submittedAt: work.submittedAt,
    overallStatus: result?.overallStatus,
    issueCount: issues.length,
    violationCount: issues.filter((i) => i.level === "violation").length,
    warningCount: issues.filter((i) => i.level === "warning").length,
    hasResult: !!result,
    targetCategory: work.targetCategory,
  };
}
