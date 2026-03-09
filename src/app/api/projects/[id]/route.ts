import { NextRequest, NextResponse } from "next/server";
import { getProject, saveProject, deleteProject } from "@/lib/storage";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const project = getProject(id);
  if (!project) {
    return NextResponse.json({ error: "案件が見つかりません" }, { status: 404 });
  }
  return NextResponse.json(project);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const project = getProject(id);
  if (!project) {
    return NextResponse.json({ error: "案件が見つかりません" }, { status: 404 });
  }

  const body = await req.json();
  const { name, clientName, description, companyRegulations, ngCases, allowedCases } = body;

  if (name !== undefined) project.name = name.trim();
  if (clientName !== undefined) project.clientName = clientName?.trim() || undefined;
  if (description !== undefined) project.description = description?.trim() || undefined;
  if (companyRegulations !== undefined) project.companyRegulations = companyRegulations?.trim() || undefined;
  if (ngCases !== undefined) project.ngCases = ngCases;
  if (allowedCases !== undefined) project.allowedCases = allowedCases;

  saveProject(project);
  return NextResponse.json(project);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const deleted = deleteProject(id);
  if (!deleted) {
    return NextResponse.json({ error: "案件が見つかりません" }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
