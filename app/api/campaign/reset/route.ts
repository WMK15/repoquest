import { NextResponse } from "next/server";
import { clearSessions } from "@/lib/campaign/session-store";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    clearSessions();
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("campaign/reset failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Reset failed." },
      { status: 500 }
    );
  }
}
