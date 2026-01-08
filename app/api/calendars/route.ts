import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/supabase/auth";
import { getGoogleAccountsForUser, refreshGoogleAccessToken } from "@/lib/google-accounts";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const debug = url.searchParams.get("debug") === "1";
  const userId = await getAuthUserId();
  if (!userId) {
    return NextResponse.json({ calendars: [] }, { status: 200 });
  }
  let accounts = await getGoogleAccountsForUser(userId);
  if (accounts.length === 0) {
    return NextResponse.json({ calendars: [] }, { status: 200 });
  }
  const fetches = accounts.map(async (acc: any) => {
    const baseUrl =
      "https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=reader&maxResults=250";
    let tokenToUse: string | undefined = acc.accessToken as string | undefined;
    let finalStatus: number | undefined;
    let finalError: string | undefined;
    async function doFetch(accessToken: string) {
      const res = await fetch(baseUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
      });
      const status = res.status;
      if (!res.ok) {
        let error: string | undefined;
        try {
          const errJson = await res.json();
          error = errJson?.error?.message || errJson?.error_description;
        } catch {}
        return { ok: false as const, status, error, data: null as any };
      }
      const data = await res.json();
      return { ok: true as const, status, error: undefined, data };
    }
    if (!tokenToUse) {
      return {
        items: [] as any[],
        accountId: acc.accountId,
        email: acc.email,
        status: 0,
        error: "missing access token",
        _debug: debug ? { status: 0, error: "missing access token" } : undefined,
      };
    }
    let attempt = await doFetch(tokenToUse);
    if (!attempt.ok && attempt.status === 401 && acc.refreshToken) {
      // refresh and retry once
      try {
        const refreshed = await refreshGoogleAccessToken(acc.refreshToken);
        tokenToUse = refreshed.accessToken;
        attempt = await doFetch(tokenToUse);
      } catch (e) {
        // keep first error
      }
    }
    if (!attempt.ok) {
      finalStatus = attempt.status;
      finalError = attempt.error;
      return {
        items: [] as any[],
        accountId: acc.accountId,
        email: acc.email,
        status: finalStatus,
        error: finalError,
        _debug: debug ? { status: finalStatus, error: finalError } : undefined,
      };
    }
    return {
      items: attempt.data.items || [],
      accountId: acc.accountId,
      email: acc.email,
      status: attempt.status,
      _debug: debug ? { status: attempt.status } : undefined,
    };
  });
  const results = await Promise.all(fetches);
  const calendars = results.flatMap((r) =>
    (r.items || []).map((c: any) => ({
      id: `${r.accountId}|${c.id as string}`,
      originalId: c.id as string,
      accountId: r.accountId,
      accountEmail: r.email,
      summary: (c.summary as string) || "(Untitled)",
      primary: !!c.primary,
      backgroundColor: c.backgroundColor as string | undefined,
      accessRole: c.accessRole as string | undefined,
    }))
  );
  const accountsSummary = results.map((r) => ({
    accountId: r.accountId,
    email: r.email,
    status: (r as any).status,
    error: (r as any).error,
  }));
  if (debug) {
    const diag = results.map((r) => ({
      accountId: (r as any).accountId,
      ...(r as any)._debug,
    }));
    return NextResponse.json({ calendars, accounts: accountsSummary, debug: diag });
  }
  return NextResponse.json({ calendars, accounts: accountsSummary });
}

