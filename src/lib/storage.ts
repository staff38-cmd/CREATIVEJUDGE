import { prisma } from "./prisma";
import {
  Work,
  WorkSummary,
  Project,
  NgCase,
  AllowedCase,
  ChecklistSession,
  ChecklistSummary,
  MediaRegulations,
  MediaType,
  ComplianceResult,
  CheckResult,
} from "./types";
import type { WorkModel as PrismaWork, ProjectModel as PrismaProject, ChecklistSessionModel as PrismaChecklist } from "../generated/prisma/models";

// ────────── Type Converters ──────────

function toWork(row: PrismaWork): Work {
  return {
    id: row.id,
    title: row.title,
    contentType: row.contentType as Work["contentType"],
    fileName: row.fileName ?? undefined,
    fileType: row.fileType ?? undefined,
    fileSize: row.fileSize ?? undefined,
    filePath: row.filePath ?? undefined,
    textContent: row.textContent ?? undefined,
    sourceUrl: row.sourceUrl ?? undefined,
    submittedAt: row.submittedAt,
    complianceResult: row.complianceResult
      ? (row.complianceResult as unknown as ComplianceResult)
      : undefined,
    customRegulations: row.customRegulations ?? undefined,
    targetCategory: row.targetCategory ?? undefined,
    projectId: row.projectId ?? undefined,
    media: row.media as Work["media"],
  };
}

function toProject(row: PrismaProject): Project {
  return {
    id: row.id,
    name: row.name,
    clientName: row.clientName ?? undefined,
    description: row.description ?? undefined,
    createdAt: row.createdAt,
    sheetUrl: row.sheetUrl ?? undefined,
    ngSheetUrl: row.ngSheetUrl ?? undefined,
    companyRegulations: row.companyRegulations ?? undefined,
    companyRegulationsFileName: row.companyRegulationsFileName ?? undefined,
    companyRegulationsFileContent: row.companyRegulationsFileContent ?? undefined,
    ngCases: (row.ngCases as unknown as NgCase[]) ?? [],
    allowedCases: (row.allowedCases as unknown as AllowedCase[]) ?? [],
    checkMode: ((row as unknown as { checkMode?: string }).checkMode as "soft" | "hard") ?? "soft",
  };
}

function toChecklist(row: PrismaChecklist): ChecklistSession {
  return {
    id: row.id,
    projectId: row.projectId ?? undefined,
    projectName: row.projectName ?? undefined,
    media: row.media as MediaType,
    crType: row.crType as ChecklistSession["crType"],
    checkerName: row.checkerName,
    reviewerName: row.reviewerName ?? undefined,
    checkResults: (row.checkResults as unknown as CheckResult[]) ?? [],
    status: row.status as ChecklistSession["status"],
    note: row.note ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// ────────── Work CRUD ──────────

export async function getAllWorks(): Promise<Work[]> {
  const rows = await prisma.work.findMany({ orderBy: { submittedAt: "desc" } });
  return rows.map(toWork);
}

export async function getWork(id: string): Promise<Work | null> {
  const row = await prisma.work.findUnique({ where: { id } });
  return row ? toWork(row) : null;
}

export async function saveWork(work: Work): Promise<void> {
  const data = {
    title: work.title,
    contentType: work.contentType,
    fileName: work.fileName ?? null,
    fileType: work.fileType ?? null,
    fileSize: work.fileSize ?? null,
    filePath: work.filePath ?? null,
    textContent: work.textContent ?? null,
    sourceUrl: work.sourceUrl ?? null,
    submittedAt: work.submittedAt,
    complianceResult: work.complianceResult
      ? (work.complianceResult as unknown as object)
      : undefined,
    customRegulations: work.customRegulations ?? null,
    targetCategory: work.targetCategory ?? null,
    projectId: work.projectId ?? null,
    media: work.media ?? null,
  };
  await prisma.work.upsert({
    where: { id: work.id },
    create: { id: work.id, ...data },
    update: data,
  });
}

export async function deleteWork(id: string): Promise<boolean> {
  try {
    await prisma.work.delete({ where: { id } });
    return true;
  } catch {
    return false;
  }
}

// ────────── Project CRUD ──────────

export async function getAllProjects(): Promise<Project[]> {
  const rows = await prisma.project.findMany({ orderBy: { createdAt: "desc" } });
  return rows.map(toProject);
}

export async function getProject(id: string): Promise<Project | null> {
  const row = await prisma.project.findUnique({ where: { id } });
  return row ? toProject(row) : null;
}

export async function saveProject(project: Project): Promise<void> {
  const data = {
    name: project.name,
    clientName: project.clientName ?? null,
    description: project.description ?? null,
    createdAt: project.createdAt,
    sheetUrl: project.sheetUrl ?? null,
    ngSheetUrl: project.ngSheetUrl ?? null,
    companyRegulations: project.companyRegulations ?? null,
    companyRegulationsFileName: project.companyRegulationsFileName ?? null,
    companyRegulationsFileContent: project.companyRegulationsFileContent ?? null,
    ngCases: (project.ngCases ?? []) as unknown as object[],
    allowedCases: (project.allowedCases ?? []) as unknown as object[],
  };
  const dataWithMode = { ...data, checkMode: project.checkMode ?? "soft" };
  await prisma.project.upsert({
    where: { id: project.id },
    create: { id: project.id, ...dataWithMode },
    update: dataWithMode,
  } as Parameters<typeof prisma.project.upsert>[0]);
}

export async function deleteProject(id: string): Promise<boolean> {
  try {
    await prisma.project.delete({ where: { id } });
    return true;
  } catch {
    return false;
  }
}

// ────────── Checklist CRUD ──────────

export async function getAllChecklists(): Promise<ChecklistSession[]> {
  const rows = await prisma.checklistSession.findMany({ orderBy: { createdAt: "desc" } });
  return rows.map(toChecklist);
}

export async function getChecklist(id: string): Promise<ChecklistSession | null> {
  const row = await prisma.checklistSession.findUnique({ where: { id } });
  return row ? toChecklist(row) : null;
}

export async function saveChecklist(session: ChecklistSession): Promise<void> {
  const data = {
    projectId: session.projectId ?? null,
    projectName: session.projectName ?? null,
    media: session.media,
    crType: session.crType,
    checkerName: session.checkerName,
    reviewerName: session.reviewerName ?? null,
    checkResults: (session.checkResults ?? []) as unknown as object[],
    status: session.status,
    note: session.note ?? null,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  };
  await prisma.checklistSession.upsert({
    where: { id: session.id },
    create: { id: session.id, ...data },
    update: data,
  });
}

export async function deleteChecklist(id: string): Promise<boolean> {
  try {
    await prisma.checklistSession.delete({ where: { id } });
    return true;
  } catch {
    return false;
  }
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

// ────────── Media Regulations ──────────

const DEFAULT_MEDIA_REGULATIONS: MediaRegulations = {
  Meta: "お腹の脂肪系文言+お腹素材の同時使用禁止、ビフォーアフター表現は加工対策必須、広告アカウント名に効果効能表現を使用しない",
  Google: "医薬品審査フォーム提出必要",
  ByteDance: "審査精度が高い。他媒体OKでもBDでNG可能性あり。SPC表現は特に注意",
  LINE: "審査否認理由の問い合わせフローあり",
  SmartNews: "独自審査基準あり（スマニュー審査基準.pdf参照）",
  YDA: "Yahoo!ディスプレイ広告（YDA）審査基準準拠。薬機法・景品表示法の遵守必須",
};

export async function getMediaRegulations(): Promise<MediaRegulations> {
  const rows = await prisma.mediaRegulation.findMany();
  if (rows.length === 0) {
    // Seed defaults
    await saveMediaRegulations(DEFAULT_MEDIA_REGULATIONS);
    return DEFAULT_MEDIA_REGULATIONS;
  }
  const result: MediaRegulations = {};
  for (const row of rows) {
    result[row.media as MediaType] = row.content;
  }
  return result;
}

export async function saveMediaRegulations(regs: MediaRegulations): Promise<void> {
  const entries = Object.entries(regs) as [MediaType, string][];
  await Promise.all(
    entries.map(([media, content]) =>
      prisma.mediaRegulation.upsert({
        where: { media },
        create: { media, content },
        update: { content },
      })
    )
  );
}

// ────────── Work Summary ──────────

export async function toSummary(work: Work, projects?: Project[]): Promise<WorkSummary> {
  const result = work.complianceResult;
  const issues = result?.issues ?? [];
  let projectName: string | undefined;
  if (work.projectId) {
    const project = projects
      ? projects.find((p) => p.id === work.projectId)
      : await getProject(work.projectId);
    projectName = project?.name;
  }
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
    projectName,
  };
}
