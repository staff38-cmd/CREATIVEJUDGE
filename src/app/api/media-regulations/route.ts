import { NextRequest, NextResponse } from "next/server";
import { getMediaRegulations, saveMediaRegulations } from "@/lib/storage";
import { MediaRegulations } from "@/lib/types";

export async function GET() {
  try {
    const regs = getMediaRegulations();
    return NextResponse.json(regs);
  } catch {
    return NextResponse.json({ error: "取得に失敗しました" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json() as MediaRegulations;
    saveMediaRegulations(body);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "保存に失敗しました" }, { status: 500 });
  }
}
