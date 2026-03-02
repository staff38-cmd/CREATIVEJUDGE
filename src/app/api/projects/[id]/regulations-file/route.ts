import { NextRequest, NextResponse } from "next/server";
import { getProject, saveProject } from "@/lib/storage";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const project = getProject(id);
  if (!project) {
    return NextResponse.json({ error: "案件が見つかりません" }, { status: 404 });
  }

  const type = req.nextUrl.searchParams.get("type") ?? "project"; // "company" | "project"

  const { fileName, extractedText } = await req.json() as {
    fileName?: string;
    extractedText?: string;
  };

  if (!fileName || !extractedText) {
    return NextResponse.json({ error: "ファイル名または内容がありません" }, { status: 400 });
  }

  if (type === "company") {
    project.companyRegulationsFileName = fileName;
    project.companyRegulationsFileContent = extractedText;
  } else {
    project.regulationsFileName = fileName;
    project.regulationsFileContent = extractedText;
  }
  saveProject(project);

  return NextResponse.json({
    success: true,
    fileName,
    extractedLength: extractedText.length,
    preview: extractedText.slice(0, 300),
  });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const project = getProject(id);
  if (!project) {
    return NextResponse.json({ error: "案件が見つかりません" }, { status: 404 });
  }

  const type = req.nextUrl.searchParams.get("type") ?? "project";

  if (type === "company") {
    project.companyRegulationsFileName = undefined;
    project.companyRegulationsFileContent = undefined;
  } else {
    project.regulationsFileName = undefined;
    project.regulationsFileContent = undefined;
  }
  saveProject(project);

  return NextResponse.json({ success: true });
}
