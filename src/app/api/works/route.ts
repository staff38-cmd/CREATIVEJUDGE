import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import path from "path";
import fs from "fs";
import { getAllWorks, saveWork, toSummary } from "@/lib/storage";
import { Work, ContentType } from "@/lib/types";

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");

const ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "application/pdf",
];

function ensureUploadDir() {
  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  }
}

export async function GET() {
  const works = getAllWorks();
  const summaries = works
    .map(toSummary)
    .sort(
      (a, b) =>
        new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime()
    );
  return NextResponse.json(summaries);
}

export async function POST(req: NextRequest) {
  const contentType = req.headers.get("content-type") ?? "";

  // Text / LP submission (JSON)
  if (contentType.includes("application/json")) {
    const body = await req.json();
    const { title, textContent, contentType: ct, targetCategory, customRegulations } = body;

    if (!title || !textContent || !ct) {
      return NextResponse.json({ error: "必須フィールドが不足しています" }, { status: 400 });
    }

    const work: Work = {
      id: uuidv4(),
      title,
      contentType: ct as ContentType,
      textContent,
      targetCategory: targetCategory || undefined,
      customRegulations: customRegulations || undefined,
      submittedAt: new Date().toISOString(),
    };

    saveWork(work);
    return NextResponse.json({ id: work.id }, { status: 201 });
  }

  // File submission (FormData)
  ensureUploadDir();
  const formData = await req.formData();
  const title = formData.get("title") as string;
  const ct = formData.get("contentType") as ContentType;
  const targetCategory = formData.get("targetCategory") as string | null;
  const customRegulations = formData.get("customRegulations") as string | null;
  const file = formData.get("file") as File | null;

  if (!title || !ct || !file) {
    return NextResponse.json({ error: "必須フィールドが不足しています" }, { status: 400 });
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: "対応していないファイル形式です（JPEG/PNG/WebP/GIF/MP4/WebM/MOV/PDF）" },
      { status: 400 }
    );
  }

  const ext = path.extname(file.name);
  const fileName = `${uuidv4()}${ext}`;
  const filePath = `/uploads/${fileName}`;
  const fullPath = path.join(UPLOAD_DIR, fileName);
  const buffer = Buffer.from(await file.arrayBuffer());
  fs.writeFileSync(fullPath, buffer);

  // Determine contentType from fileType if not provided
  const resolvedCt: ContentType =
    ct ||
    (file.type.startsWith("image/")
      ? "image"
      : file.type.startsWith("video/")
      ? "video"
      : "pdf");

  const work: Work = {
    id: uuidv4(),
    title,
    contentType: resolvedCt,
    fileName: file.name,
    fileType: file.type,
    fileSize: file.size,
    filePath,
    targetCategory: targetCategory ?? undefined,
    customRegulations: customRegulations ?? undefined,
    submittedAt: new Date().toISOString(),
  };

  saveWork(work);
  return NextResponse.json({ id: work.id }, { status: 201 });
}
