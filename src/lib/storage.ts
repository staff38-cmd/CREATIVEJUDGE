import fs from "fs";
import path from "path";
import { Work, WorkSummary, Project } from "./types";

const DATA_FILE = path.join(process.cwd(), "data", "works.json");
const PROJECTS_FILE = path.join(process.cwd(), "data", "projects.json");

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
