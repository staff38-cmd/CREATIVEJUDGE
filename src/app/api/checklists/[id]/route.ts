import { NextRequest, NextResponse } from "next/server";
import { getChecklist, saveChecklist, deleteChecklist } from "@/lib/storage";
import { CheckResult, ChecklistSession } from "@/lib/types";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = getChecklist(id);
  if (!session) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(session);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = getChecklist(id);
  if (!session) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json();
  const {
    checkResults,
    status,
    reviewerName,
    note,
  } = body as {
    checkResults?: CheckResult[];
    status?: ChecklistSession["status"];
    reviewerName?: string;
    note?: string;
  };

  if (checkResults !== undefined) session.checkResults = checkResults;
  if (status !== undefined) session.status = status;
  if (reviewerName !== undefined) session.reviewerName = reviewerName;
  if (note !== undefined) session.note = note;
  session.updatedAt = new Date().toISOString();

  saveChecklist(session);
  return NextResponse.json(session);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const ok = deleteChecklist(id);
  if (!ok) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}

