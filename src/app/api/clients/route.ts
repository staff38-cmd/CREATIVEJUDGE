import { NextRequest, NextResponse } from "next/server";
import { getAllClients, saveClient } from "@/lib/storage";
import { v4 as uuidv4 } from "uuid";

export async function GET() {
  const clients = await getAllClients();
  return NextResponse.json(clients);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { name, companyRegulations } = body;
  if (!name?.trim()) {
    return NextResponse.json({ error: "クライアント名は必須です" }, { status: 400 });
  }
  const client = {
    id: uuidv4(),
    name: name.trim(),
    companyRegulations: companyRegulations?.trim() || undefined,
    createdAt: new Date().toISOString(),
  };
  await saveClient(client);
  return NextResponse.json(client, { status: 201 });
}
