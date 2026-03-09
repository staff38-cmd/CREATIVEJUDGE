import { NextRequest, NextResponse } from "next/server";
import {
  getAllChecklists,
  saveChecklist,
  toChecklistSummary,
  getAllProjects,
} from "@/lib/storage";
import { ChecklistSession, MediaType, CrType } from "@/lib/types";
import { getChecklistItems } from "@/lib/checklistTemplates";

export async function GET() {
  const checklists = getAllChecklists();
  const summaries = checklists.map(toChecklistSummary);
  // 新しい順にソート
  summaries.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  return NextResponse.json(summaries);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { projectId, media, crType, checkerName } = body as {
    projectId?: string;
    media: MediaType;
    crType: CrType;
    checkerName: string;
  };

  if (!media || !crType || !checkerName) {
    return NextResponse.json(
      { error: "media, crType, checkerName は必須です" },
      { status: 400 }
    );
  }

  // プロジェクト名を解決
  let projectName: string | undefined;
  if (projectId) {
    const projects = getAllProjects();
    const project = projects.find((p) => p.id === projectId);
    projectName = project?.name;
  }

  // チェック項目を取得して初期状態（pending）で CheckResult を作成
  const items = getChecklistItems(crType, media);
  const checkResults = items.map((item) => ({
    itemId: item.id,
    status: "pending" as const,
  }));

  const now = new Date().toISOString();
  const session: ChecklistSession = {
    id: crypto.randomUUID(),
    projectId,
    projectName,
    media,
    crType,
    checkerName,
    checkResults,
    status: "draft",
    createdAt: now,
    updatedAt: now,
  };

  saveChecklist(session);
  return NextResponse.json(session, { status: 201 });
}
