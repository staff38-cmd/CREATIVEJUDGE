import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { getAllProjects, saveProject } from "@/lib/storage";
import { Project } from "@/lib/types";

export async function GET() {
  const projects = await getAllProjects();
  projects.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  return NextResponse.json(projects);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { name, clientName, description } = body;

  if (!name || !name.trim()) {
    return NextResponse.json({ error: "案件名は必須です" }, { status: 400 });
  }

  const project: Project = {
    id: uuidv4(),
    name: name.trim(),
    clientName: clientName?.trim() || undefined,
    description: description?.trim() || undefined,
    createdAt: new Date().toISOString(),
  };

  await saveProject(project);
  return NextResponse.json(project, { status: 201 });
}
