import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import * as XLSX from "xlsx";
import { getProject, saveProject } from "@/lib/storage";

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads", "regulations");

function ensureUploadDir() {
  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  }
}

function extractTextFromWorkbook(buffer: Buffer): string {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const lines: string[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: "" });

    if (workbook.SheetNames.length > 1) {
      lines.push(`【シート: ${sheetName}】`);
    }

    for (const row of rows) {
      // 全列空の行はスキップ
      const cells = (row as string[]).map((c) => String(c ?? "").trim());
      if (cells.every((c) => c === "")) continue;

      const colA = cells[0] ?? "";
      const colB = cells[1] ?? "";
      const colC = cells[2] ?? "";

      // A列だけあってB列以降が空 → カテゴリ見出しとして扱う
      if (colA && !colB && !colC) {
        lines.push(`\n[${colA}]`);
        continue;
      }

      // B列がメイン内容
      const main = colB || colA;
      if (!main) continue;

      const reason = colC ? `（${colC}）` : "";
      lines.push(`・${main}${reason}`);
    }
  }

  return lines.join("\n").trim();
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const project = getProject(id);
  if (!project) {
    return NextResponse.json({ error: "案件が見つかりません" }, { status: 404 });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) {
    return NextResponse.json({ error: "ファイルが見つかりません" }, { status: 400 });
  }

  const ext = path.extname(file.name).toLowerCase();
  if (![".xlsx", ".xls", ".csv"].includes(ext)) {
    return NextResponse.json(
      { error: ".xlsx / .xls / .csv ファイルのみ対応しています" },
      { status: 400 }
    );
  }

  ensureUploadDir();

  // 既存ファイルを削除
  if (project.regulationsFilePath) {
    const oldPath = path.join(process.cwd(), "public", project.regulationsFilePath);
    if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
  }

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const fileName = `${id}-regulations${ext}`;
  const savePath = path.join(UPLOAD_DIR, fileName);
  fs.writeFileSync(savePath, buffer);

  const extractedText = extractTextFromWorkbook(buffer);

  project.regulationsFilePath = `uploads/regulations/${fileName}`;
  project.regulationsFileName = file.name;
  project.regulationsFileContent = extractedText;
  saveProject(project);

  return NextResponse.json({
    success: true,
    fileName: file.name,
    extractedLength: extractedText.length,
    preview: extractedText.slice(0, 300),
  });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const project = getProject(id);
  if (!project) {
    return NextResponse.json({ error: "案件が見つかりません" }, { status: 404 });
  }

  if (project.regulationsFilePath) {
    const filePath = path.join(process.cwd(), "public", project.regulationsFilePath);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }

  project.regulationsFilePath = undefined;
  project.regulationsFileName = undefined;
  project.regulationsFileContent = undefined;
  saveProject(project);

  return NextResponse.json({ success: true });
}
