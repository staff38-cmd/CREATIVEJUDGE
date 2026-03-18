import { NextRequest, NextResponse } from "next/server";
import { getProject } from "@/lib/storage";
import { fetchCrSheetFeedback } from "@/lib/sheets";

// 注釈・表記に関するキーワード
const ANNOTATION_KEYWORDS = [
  "注釈", "注記", "注意書き", "但し書き", "免責",
  "※", "＊", "asterisk",
  "注釈が見えない", "注釈が小さい", "注釈要", "注釈必要",
  "表記が必要", "表記要", "表記必要",
  "but_sh", "文字が小さい",
];

export interface AnnotationRow {
  rowNum: number;
  adText: string;
  matchedField: string;   // どの列でヒットしたか
  content: string;        // ヒットした備考テキスト
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const maxRows = parseInt(searchParams.get("maxRows") ?? "2000", 10);

  const project = await getProject(id);
  if (!project) {
    return NextResponse.json({ error: "案件が見つかりません" }, { status: 404 });
  }

  const sheetUrl = project.sheetUrl;
  if (!sheetUrl) {
    return NextResponse.json(
      { error: "CR提出シートのURLが設定されていません" },
      { status: 400 }
    );
  }

  try {
    const allRows = await fetchCrSheetFeedback(sheetUrl, 2);
    const rows = allRows.slice(0, maxRows);

    const results: AnnotationRow[] = [];

    for (const row of rows) {
      const fields: { name: string; value: string }[] = [
        { name: "1次CL備考", value: row.cl1Note },
        { name: "2次CL備考", value: row.cl2Note },
        { name: "備考", value: row.memo },
        { name: "NG理由", value: row.ngReason },
        { name: "アール備考", value: row.aallNote },
      ];

      for (const field of fields) {
        if (!field.value) continue;
        const isAnnotation = ANNOTATION_KEYWORDS.some((kw) =>
          field.value.includes(kw)
        );
        if (isAnnotation) {
          results.push({
            rowNum: row.rowNum,
            adText: row.adText,
            matchedField: field.name,
            content: field.value,
          });
          break; // 1行につき1件
        }
      }
    }

    return NextResponse.json({
      total: results.length,
      scanned: rows.length,
      annotations: results,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `シート取得エラー: ${msg}` }, { status: 500 });
  }
}
