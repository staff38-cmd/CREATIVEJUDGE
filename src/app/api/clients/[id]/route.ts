import { NextRequest, NextResponse } from "next/server";
import { getClient, saveClient, deleteClient } from "@/lib/storage";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const client = await getClient(id);
  if (!client) {
    return NextResponse.json({ error: "クライアントが見つかりません" }, { status: 404 });
  }
  return NextResponse.json(client);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const client = await getClient(id);
  if (!client) {
    return NextResponse.json({ error: "クライアントが見つかりません" }, { status: 404 });
  }
  const body = await req.json();
  const { name, companyRegulations } = body;
  if (name !== undefined) client.name = name.trim();
  if (companyRegulations !== undefined) client.companyRegulations = companyRegulations?.trim() || undefined;
  await saveClient(client);
  return NextResponse.json(client);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const deleted = await deleteClient(id);
  if (!deleted) {
    return NextResponse.json({ error: "クライアントが見つかりません" }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
