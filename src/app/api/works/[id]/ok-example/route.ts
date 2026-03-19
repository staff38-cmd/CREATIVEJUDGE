import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import fetch from "node-fetch";
import { HttpsProxyAgent } from "https-proxy-agent";
import { v4 as uuidv4 } from "uuid";
import { getWork, getProject, saveProject } from "@/lib/storage";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY!;
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
const proxyAgent = process.env.HTTP_PROXY ? new HttpsProxyAgent(process.env.HTTP_PROXY) : undefined;

/** 素材の内容をGeminiで説明文にする */
async function generateMediaDescription(work: Awaited<ReturnType<typeof getWork>>): Promise<string> {
  if (!work) return "";

  const isImage = work.fileType?.startsWith("image/");
  const parts: object[] = [];

  if (isImage && work.filePath) {
    const fullPath = path.join(process.cwd(), "public", work.filePath);
    if (fs.existsSync(fullPath)) {
      const imageBuffer = fs.readFileSync(fullPath);
      const base64 = imageBuffer.toString("base64");
      parts.push({ inlineData: { mimeType: work.fileType, data: base64 } });
    }
  } else if (work.textContent) {
    parts.push({ text: `【テキスト内容】\n${work.textContent.slice(0, 3000)}` });
  }

  parts.push({
    text: `このクリエイティブ素材の内容を、広告審査・CLチェックの観点で250字程度で説明してください。
どんなビジュアル・テキスト・演出・訴求ポイントが使われているか、どんなトーンか、何を伝えようとしているかを具体的に記述してください。
説明文のみ返してください（JSONや見出し不要）。`,
  });

  try {
    const res = await fetch(GEMINI_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts }] }),
      ...(proxyAgent ? { agent: proxyAgent } : {}),
    });
    if (!res.ok) return "";
    const json = await res.json() as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    return json.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";
  } catch {
    return "";
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { projectId, userNote } = await req.json() as { projectId: string; userNote?: string };

  if (!projectId) {
    return NextResponse.json({ error: "projectId が必要です" }, { status: 400 });
  }

  const work = await getWork(id);
  if (!work) return NextResponse.json({ error: "作品が見つかりません" }, { status: 404 });

  const project = await getProject(projectId);
  if (!project) return NextResponse.json({ error: "案件が見つかりません" }, { status: 404 });

  // 既に登録済みかチェック
  const alreadyRegistered = project.allowedCases?.some(c => c.workId === id && c.mediaDescription);
  if (alreadyRegistered) {
    return NextResponse.json({ error: "この素材はすでにOK事例として登録されています" }, { status: 409 });
  }

  // Geminiで素材の内容を説明
  const mediaDescription = await generateMediaDescription(work) || `タイトル: ${work.title}（${work.contentType}）`;

  const newCase = {
    id: uuidv4(),
    title: work.title,
    description: userNote?.trim() || "審査・CLチェック通過済みのクリエイティブ事例",
    mediaDescription,
    addedAt: new Date().toISOString(),
    workId: id,
  };

  project.allowedCases = [...(project.allowedCases ?? []), newCase];
  await saveProject(project);

  return NextResponse.json({ success: true, allowedCase: newCase, mediaDescription });
}
