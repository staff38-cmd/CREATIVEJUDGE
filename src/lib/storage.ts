import fs from "fs";
import path from "path";
import { Work, WorkSummary, Project, ChecklistSession, ChecklistSummary } from "./types";

const DATA_FILE = path.join(process.cwd(), "data", "works.json");
const PROJECTS_FILE = path.join(process.cwd(), "data", "projects.json");
const CHECKLISTS_FILE = path.join(process.cwd(), "data", "checklists.json");

function ensureDataFile() {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify([], null, 2), "utf-8");
  }
}

function ensureProjectsFile() {
  const dir = path.dirname(PROJECTS_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(PROJECTS_FILE)) {
    fs.writeFileSync(PROJECTS_FILE, JSON.stringify([], null, 2), "utf-8");
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

// Project CRUD

export function getAllProjects(): Project[] {
  ensureProjectsFile();
  const raw = fs.readFileSync(PROJECTS_FILE, "utf-8");
  return JSON.parse(raw) as Project[];
}

export function getProject(id: string): Project | null {
  const projects = getAllProjects();
  return projects.find((p) => p.id === id) ?? null;
}

export function saveProject(project: Project): void {
  const projects = getAllProjects();
  const idx = projects.findIndex((p) => p.id === project.id);
  if (idx >= 0) {
    projects[idx] = project;
  } else {
    projects.push(project);
  }
  fs.writeFileSync(PROJECTS_FILE, JSON.stringify(projects, null, 2), "utf-8");
}

export function deleteProject(id: string): boolean {
  const projects = getAllProjects();
  const idx = projects.findIndex((p) => p.id === id);
  if (idx < 0) return false;
  projects.splice(idx, 1);
  fs.writeFileSync(PROJECTS_FILE, JSON.stringify(projects, null, 2), "utf-8");
  return true;
}

// Checklist CRUD

function ensureChecklistsFile() {
  const dir = path.dirname(CHECKLISTS_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(CHECKLISTS_FILE)) {
    fs.writeFileSync(CHECKLISTS_FILE, JSON.stringify([], null, 2), "utf-8");
  }
}

export function getAllChecklists(): ChecklistSession[] {
  ensureChecklistsFile();
  const raw = fs.readFileSync(CHECKLISTS_FILE, "utf-8");
  return JSON.parse(raw) as ChecklistSession[];
}

export function getChecklist(id: string): ChecklistSession | null {
  const checklists = getAllChecklists();
  return checklists.find((c) => c.id === id) ?? null;
}

export function saveChecklist(session: ChecklistSession): void {
  const checklists = getAllChecklists();
  const idx = checklists.findIndex((c) => c.id === session.id);
  if (idx >= 0) {
    checklists[idx] = session;
  } else {
    checklists.push(session);
  }
  fs.writeFileSync(CHECKLISTS_FILE, JSON.stringify(checklists, null, 2), "utf-8");
}

export function deleteChecklist(id: string): boolean {
  const checklists = getAllChecklists();
  const idx = checklists.findIndex((c) => c.id === id);
  if (idx < 0) return false;
  checklists.splice(idx, 1);
  fs.writeFileSync(CHECKLISTS_FILE, JSON.stringify(checklists, null, 2), "utf-8");
  return true;
}

export function toChecklistSummary(session: ChecklistSession): ChecklistSummary {
  const okCount = session.checkResults.filter((r) => r.status === "ok").length;
  const ngCount = session.checkResults.filter((r) => r.status === "ng").length;
  const pendingCount = session.checkResults.filter((r) => r.status === "pending").length;

  return {
    id: session.id,
    projectName: session.projectName,
    media: session.media,
    crType: session.crType,
    checkerName: session.checkerName,
    reviewerName: session.reviewerName,
    status: session.status,
    totalItems: session.checkResults.length,
    okCount,
    ngCount,
    pendingCount,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  };
}

export function toSummary(work: Work, projects?: Project[]): WorkSummary {
  const result = work.complianceResult;
  const issues = result?.issues ?? [];
  const project = work.projectId
    ? (projects ?? getAllProjects()).find((p) => p.id === work.projectId)
    : undefined;

  return {
    id: work.id,
    title: work.title,
    contentType: work.contentType,
    fileType: work.fileType,
    filePath: work.filePath,
    sourceUrl: work.sourceUrl,
    submittedAt: work.submittedAt,
    overallStatus: result?.overallStatus,
    issueCount: issues.length,
    violationCount: issues.filter((i) => i.level === "violation").length,
    warningCount: issues.filter((i) => i.level === "warning").length,
    hasResult: !!result,
    targetCategory: work.targetCategory,
    projectId: work.projectId,
    projectName: project?.name,
  };
}
