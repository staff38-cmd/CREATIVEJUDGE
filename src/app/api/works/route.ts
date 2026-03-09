import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import path from "path";
import fs from "fs";
import { Readable } from "stream";
import Busboy from "busboy";
import { getAllWorks, saveWork, toSummary, getAllProjects } from "@/lib/storage";
import { Work, ContentType } from "@/lib/types";

// 大きな動画ファイルのアップロード受信に対応
export const maxDuration = 300;

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");

const ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "video/mp4",
  "video/webm",
  "video/quicktime",
];

function ensureUploadDir() {
  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  }
}

/** HTMLからメインテキストを抽出 */
function extractTextFromHtml(html: string): string {
  let text = html.replace(/<script[\s\S]*?<\/script>/gi, "");
  text = text.replace(/<style[\s\S]*?<\/style>/gi, "");
  text = text.replace(/<[^>]+>/g, " ");
  text = text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&[a-z]+;/gi, " ");
  return text.replace(/\s+/g, " ").trim();
}

export async function GET() {
  const works = getAllWorks();
  const projects = getAllProjects();
  const summaries = works
    .map((w) => toSummary(w, projects))
    .sort(
      (a, b) =>
        new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime()
    );
  return NextResponse.json(summaries);
}

/** busboy でリクエストをストリーミングパースしてファイルをディスクに保存 */
async function parseMultipartStream(req: NextRequest): Promise<{
  fields: Record<string, string>;
  file: { originalName: string; mimeType: string; filePath: string; fullPath: string; size: number } | null;
}> {
  ensureUploadDir();

  return new Promise((resolve, reject) => {
    const contentType = req.headers.get("content-type") ?? "";
    const bb = Busboy({ headers: { "content-type": contentType }, limits: { fileSize: 600 * 1024 * 1024 } });

    const fields: Record<string, string> = {};
    let fileResult: { originalName: string; mimeType: string; filePath: string; fullPath: string; size: number } | null = null;

    bb.on("field", (name, val) => {
      fields[name] = val;
    });

    bb.on("file", (fieldname, fileStream, info) => {
      const { filename, mimeType } = info;
      const ext = path.extname(filename);
      const fileName = `${uuidv4()}${ext}`;
      const filePath = `/uploads/${fileName}`;
      const fullPath = path.join(UPLOAD_DIR, fileName);
      const writeStream = fs.createWriteStream(fullPath);

      let size = 0;
      fileStream.on("data", (chunk: Buffer) => { size += chunk.length; });
      fileStream.pipe(writeStream);

      writeStream.on("finish", () => {
        fileResult = { originalName: filename, mimeType, filePath, fullPath, size };
      });
      writeStream.on("error", reject);
      fileStream.on("error", reject);
    });

    bb.on("finish", () => resolve({ fields, file: fileResult }));
    bb.on("error", reject);

    // Web ReadableStream → Node.js Readable → busboy
    const nodeStream = Readable.fromWeb(req.body as Parameters<typeof Readable.fromWeb>[0]);
    nodeStream.pipe(bb);
    nodeStream.on("error", reject);
  });
}

export async function POST(req: NextRequest) {
  const contentType = req.headers.get("content-type") ?? "";

  // JSON submission (text / lp / url)
  if (contentType.includes("application/json")) {
    const body = await req.json();
    const {
      title,
      textContent,
      sourceUrl,
      contentType: ct,
      targetCategory,
      customRegulations,
      projectId,
    } = body;

    if (!title || !ct) {
      return NextResponse.json({ error: "必須フィールドが不足しています" }, { status: 400 });
    }

    // URL モード: ページを取得してテキスト抽出
    if (ct === "url") {
      if (!sourceUrl) {
        return NextResponse.json({ error: "URLを入力してください" }, { status: 400 });
      }

      let fetchedText: string;
      try {
        const res = await fetch(sourceUrl, {
          headers: { "User-Agent": "Mozilla/5.0 (compatible; CreativeJudge/1.0)" },
          redirect: "follow",
        });
        if (!res.ok) {
          return NextResponse.json(
            { error: `URLの取得に失敗しました（HTTP ${res.status}）` },
            { status: 400 }
          );
        }
        const html = await res.text();
        fetchedText = extractTextFromHtml(html);
        if (fetchedText.length < 50) {
          return NextResponse.json(
            { error: "ページからテキストを取得できませんでした（JavaScriptで描画されるページは非対応）" },
            { status: 400 }
          );
        }
      } catch {
        return NextResponse.json(
          { error: "URLへのアクセスに失敗しました。URLを確認してください" },
          { status: 400 }
        );
      }

      const work: Work = {
        id: uuidv4(),
        title,
        contentType: "url",
        textContent: fetchedText,
        sourceUrl,
        targetCategory: targetCategory || undefined,
        customRegulations: customRegulations || undefined,
        projectId: projectId || undefined,
        submittedAt: new Date().toISOString(),
      };

      saveWork(work);
      return NextResponse.json({ id: work.id }, { status: 201 });
    }

    // text / lp モード
    if (!textContent) {
      return NextResponse.json({ error: "テキストを入力してください" }, { status: 400 });
    }

    const work: Work = {
      id: uuidv4(),
      title,
      contentType: ct as ContentType,
      textContent,
      targetCategory: targetCategory || undefined,
      customRegulations: customRegulations || undefined,
      projectId: projectId || undefined,
      submittedAt: new Date().toISOString(),
    };

    saveWork(work);
    return NextResponse.json({ id: work.id }, { status: 201 });
  }

  // File submission (FormData) — busboy でストリーミング保存
  let parsed: Awaited<ReturnType<typeof parseMultipartStream>>;
  try {
    parsed = await parseMultipartStream(req);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "ファイルの受信に失敗しました";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  const { fields, file } = parsed;
  const title = fields.title;
  const ct = fields.contentType as ContentType;

  if (!title || !ct || !file) {
    return NextResponse.json({ error: "必須フィールドが不足しています" }, { status: 400 });
  }

  if (!ALLOWED_TYPES.includes(file.mimeType)) {
    // 不正なファイルを削除
    fs.unlink(file.fullPath, () => {});
    return NextResponse.json(
      { error: "対応していないファイル形式です（JPEG/PNG/WebP/GIF/MP4/WebM/MOV）" },
      { status: 400 }
    );
  }

  const resolvedCt: ContentType =
    ct || (file.mimeType.startsWith("image/") ? "image" : "video");

  const work: Work = {
    id: uuidv4(),
    title,
    contentType: resolvedCt,
    fileName: file.originalName,
    fileType: file.mimeType,
    fileSize: file.size,
    filePath: file.filePath,
    targetCategory: fields.targetCategory || undefined,
    customRegulations: fields.customRegulations || undefined,
    projectId: fields.projectId || undefined,
    submittedAt: new Date().toISOString(),
  };

  saveWork(work);
  return NextResponse.json({ id: work.id }, { status: 201 });
}
