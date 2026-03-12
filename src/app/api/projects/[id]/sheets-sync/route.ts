import { NextRequest, NextResponse } from "next/server";
import { getProject, saveProject } from "@/lib/storage";
import { fetchNgRowsFromSheet, convertToNgCases } from "@/lib/sheets";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const project = await getProject(id);
  if (!project) {
    return NextResponse.json({ error: "案件が見つかりません" }, { status: 404 });
  }

  const { ngSheetUrl } = await req.json();
  const targetUrl = ngSheetUrl || project.ngSheetUrl;

  if (!targetUrl) {
    return NextResponse.json({ error: "NG集シートのURLが設定されていません" }, { status: 400 });
  }

  try {
    const rows = await fetchNgRowsFromSheet(targetUrl);
    if (rows.length === 0) {
      return NextResponse.json({
        imported: 0,
        message: "指摘内容のある行が見つかりませんでした。シートの構成・タブ名（「テキスト」「画像」「動画」を含むタブ名）を確認してください。",
      });
    }

    const newCases = convertToNgCases(rows);

    // 既存のシート同期分を削除して上書き（手動追加分は保持）
    const existingManual = (project.ngCases ?? []).filter(
      (c) => !c.id.startsWith("sheet-")
    );
    // sheet-sync由来のidは uuidv4 なので区別できない
    // → シンプルに全件置き換え or 追記を選択できるようにする
    // ここでは「既存に追記」ではなく「シート同期分は上書き」
    // 同期済みフラグを title の接頭辞 "[テキスト]" で判断するのは不安定
    // → 今回はシンプルに全件追記（重複が気になる場合はUIで管理）
    const merged = [...(project.ngCases ?? []), ...newCases];

    project.ngCases = merged;
    if (ngSheetUrl) project.ngSheetUrl = ngSheetUrl.trim();
    await saveProject(project);

    return NextResponse.json({
      imported: newCases.length,
      total: merged.length,
      message: `${newCases.length} 件のNG事例をインポートしました（合計 ${merged.length} 件）`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "不明なエラー";
    console.error("[sheets-sync] error:", err);

    if (message.includes("ENOENT") || message.includes("google-credentials")) {
      return NextResponse.json(
        { error: "Google認証ファイルが見つかりません。サーバーに google-credentials.json を配置してください。" },
        { status: 500 }
      );
    }
    if (message.includes("403") || message.includes("forbidden") || message.toLowerCase().includes("permission")) {
      return NextResponse.json(
        { error: "スプレッドシートへのアクセス権がありません。サービスアカウントに閲覧権限を付与してください。" },
        { status: 403 }
      );
    }

    return NextResponse.json({ error: `取得エラー: ${message}` }, { status: 500 });
  }
}
