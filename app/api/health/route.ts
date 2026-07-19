import { NextResponse } from "next/server";
import { aiAvailable } from "@/lib/agent/client";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    ok: true,
    aiConfigured: aiAvailable(),
  });
}
