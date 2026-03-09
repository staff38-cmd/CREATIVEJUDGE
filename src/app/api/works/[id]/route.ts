import { NextRequest, NextResponse } from "next/server";
import { getWork, saveWork, deleteWork } from "@/lib/storage";
import { ChecklistItem, Approval, MediaPlatform, CreativeType } from "@/lib/types";
import fs from "fs";
import path from "path";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const work = getWork(id);
  if (!work) {
    return NextResponse.json({ error: "作品が見つかりません" }, { status: 404 });
  }
  return NextResponse.json(work);
}

/** チェックリスト・承認・最終提出を一括更新 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const work = getWork(id);
  if (!work) {
    return NextResponse.json({ error: "作品が見つかりません" }, { status: 404 });
  }

  const body = await req.json() as {
    checklist?: ChecklistItem[];
    approvals?: Approval[];
    checkerName?: string;
    finalSubmittedAt?: string;
    mediaPlatforms?: MediaPlatform[];
    creativeType?: CreativeType;
  };

  if (body.checklist !== undefined) work.checklist = body.checklist;
  if (body.approvals !== undefined) work.approvals = body.approvals;
  if (body.checkerName !== undefined) work.checkerName = body.checkerName;
  if (body.finalSubmittedAt !== undefined) work.finalSubmittedAt = body.finalSubmittedAt;
  if (body.mediaPlatforms !== undefined) work.mediaPlatforms = body.mediaPlatforms;
  if (body.creativeType !== undefined) work.creativeType = body.creativeType;

  saveWork(work);
  return NextResponse.json(work);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const work = getWork(id);
  if (!work) {
    return NextResponse.json({ error: "作品が見つかりません" }, { status: 404 });
  }

  if (work.filePath) {
    const fullPath = path.join(process.cwd(), "public", work.filePath);
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
    }
  }

  deleteWork(id);
  return NextResponse.json({ success: true });
}
