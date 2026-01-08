import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/supabase/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  const userId = await getAuthUserId();
  if (!userId) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  try {
    const { accountId } = await req.json();
    if (!accountId || typeof accountId !== "string") {
      return NextResponse.json({ ok: false, error: "Missing accountId" }, { status: 400 });
    }
    // Only delete if the account belongs to this user
    await prisma.account.deleteMany({
      where: {
        userId,
        provider: "google",
        providerAccountId: accountId,
      },
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}


