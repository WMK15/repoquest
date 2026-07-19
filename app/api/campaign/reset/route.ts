import { NextResponse } from "next/server";
import { clearSessions } from "@/lib/campaign/session-store";
import { resetDemoRepo } from "@/lib/repository/reset-repository";
import { runDemoRepoTests } from "@/lib/repository/run-tests";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const { resetTo } = await resetDemoRepo();
    const verification = await runDemoRepoTests();
    clearSessions();

    return NextResponse.json({
      resetTo,
      // A correct reset means the authentication test fails again.
      brokenStateConfirmed: !verification.success,
      testSummary: verification.summary,
    });
  } catch (error) {
    console.error("campaign/reset failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Reset failed." },
      { status: 500 }
    );
  }
}
