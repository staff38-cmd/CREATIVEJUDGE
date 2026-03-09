import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import path from "path";
import fs from "fs";
import { pipeline } from "stream/promises";
import { Readable } from "stream";
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

  // File submission (FormData) — 画像・動画のみ
  ensureUploadDir();
  const formData = await req.formData();
  const title = formData.get("title") as string;
  const ct = formData.get("contentType") as ContentType;
  const targetCategory = formData.get("targetCategory") as string | null;
  const customRegulations = formData.get("customRegulations") as string | null;
  const projectId = formData.get("projectId") as string | null;
  const file = formData.get("file") as File | null;

  if (!title || !ct || !file) {
    return NextResponse.json({ error: "必須フィールドが不足しています" }, { status: 400 });
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: "対応していないファイル形式です（JPEG/PNG/WebP/GIF/MP4/WebM/MOV）" },
      { status: 400 }
    );
  }

  const ext = path.extname(file.name);
  const fileName = `${uuidv4()}${ext}`;
  const filePath = `/uploads/${fileName}`;
  const fullPath = path.join(UPLOAD_DIR, fileName);
  const writeStream = fs.createWriteStream(fullPath);
  await pipeline(Readable.fromWeb(file.stream() as Parameters<typeof Readable.fromWeb>[0]), writeStream);

  const resolvedCt: ContentType =
    ct || (file.type.startsWith("image/") ? "image" : "video");

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
    projectId: projectId ?? undefined,
    submittedAt: new Date().toISOString(),
  };

  saveWork(work);
  return NextResponse.json({ id: work.id }, { status: 201 });
}
