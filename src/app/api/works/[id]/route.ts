import { NextRequest, NextResponse } from "next/server";
import { getWork, deleteWork } from "@/lib/storage";
import fs from "fs";
import path from "path";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const work = await getWork(id);
  if (!work) {
    return NextResponse.json({ error: "作品が見つかりません" }, { status: 404 });
  }
  return NextResponse.json(work);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const work = await getWork(id);
  if (!work) {
    return NextResponse.json({ error: "作品が見つかりません" }, { status: 404 });
  }

  if (work.filePath) {
    const fullPath = path.join(process.cwd(), "public", work.filePath);
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
    }
  }

  await deleteWork(id);
  return NextResponse.json({ success: true });
}
