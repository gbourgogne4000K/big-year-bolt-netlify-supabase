import { NextRequest, NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/supabase/auth";
import { prisma } from "@/lib/prisma";
import { refreshGoogleAccessToken } from "@/lib/google-accounts";

export const dynamic = "force-dynamic";

function startOfYearIso(year: number) {
  return new Date(Date.UTC(year, 0, 1)).toISOString();
}
function endOfYearIso(year: number) {
  return new Date(Date.UTC(year + 1, 0, 1)).toISOString();
}

// GET /api/family/events - Get events from all family shared calendars
export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const familyId = searchParams.get("familyId");
    const year = parseInt(
      searchParams.get("year") || `${new Date().getFullYear()}`,
      10
    );

    if (!familyId) {
      return NextResponse.json(
        { error: "Family ID is required" },
        { status: 400 }
      );
    }

    // Check if user is a member of this family
    const membership = await prisma.familyMember.findUnique({
      where: {
        familyId_userId: { familyId, userId },
      },
    });

    if (!membership) {
      return NextResponse.json(
        { error: "You are not a member of this family" },
        { status: 403 }
      );
    }

    // Get all calendars shared with this family
    const familyCalendars = await prisma.familyCalendar.findMany({
      where: { familyId },
      include: {
        sharedBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    if (familyCalendars.length === 0) {
      return NextResponse.json({ events: [] });
    }

    // Group calendars by the user who shared them
    const calendarsByUser = new Map<string, typeof familyCalendars>();
    for (const fc of familyCalendars) {
      const existing = calendarsByUser.get(fc.sharedByUserId) || [];
      existing.push(fc);
      calendarsByUser.set(fc.sharedByUserId, existing);
    }

    const params = new URLSearchParams({
      singleEvents: "true",
      orderBy: "startTime",
      timeMin: startOfYearIso(year),
      timeMax: endOfYearIso(year),
      maxResults: "2500",
    });

    const allEvents: any[] = [];

    // For each user who shared calendars, fetch their Google accounts and events
    for (const [sharedByUserId, userCalendars] of calendarsByUser.entries()) {
      // Get the Google accounts for this user
      const accounts = await prisma.account.findMany({
        where: { userId: sharedByUserId, provider: "google" },
        select: {
          providerAccountId: true,
          access_token: true,
          refresh_token: true,
          expires_at: true,
        },
      });

      // Group calendars by account
      const calendarsByAccount = new Map<string, typeof userCalendars>();
      for (const fc of userCalendars) {
        // calendarId format: accountId|googleCalendarId
        const [accountId] = fc.calendarId.split("|");
        if (!accountId) continue;
        const existing = calendarsByAccount.get(accountId) || [];
        existing.push(fc);
        calendarsByAccount.set(accountId, existing);
      }

      // Fetch events for each account's calendars
      for (const [accountId, accountCalendars] of calendarsByAccount.entries()) {
        const account = accounts.find((a) => a.providerAccountId === accountId);
        if (!account) continue;

        let accessToken = account.access_token || "";
        const refreshToken = account.refresh_token || undefined;
        const expiresAt = account.expires_at ? account.expires_at * 1000 : 0;

        // Refresh token if expired
        if (expiresAt < Date.now() + 60000 && refreshToken) {
          try {
            const refreshed = await refreshGoogleAccessToken(refreshToken);
            accessToken = refreshed.accessToken;
            // Update in DB
            await prisma.account.update({
              where: {
                provider_providerAccountId: {
                  provider: "google",
                  providerAccountId: accountId,
                },
              },
              data: {
                access_token: accessToken,
                expires_at: Math.floor(refreshed.expiresAtMs / 1000),
              },
            });
          } catch {
            // Skip this account if refresh fails
            continue;
          }
        }

        if (!accessToken) continue;

        // Fetch events for each calendar
        for (const fc of accountCalendars) {
          const [, googleCalendarId] = fc.calendarId.split("|");
          if (!googleCalendarId) continue;

          try {
            const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
              googleCalendarId
            )}/events?${params.toString()}`;

            const res = await fetch(url, {
              headers: { Authorization: `Bearer ${accessToken}` },
              cache: "no-store",
            });

            if (!res.ok) continue;

            const data = await res.json();
            const items = data.items || [];

            for (const e of items) {
              if (!e?.start?.date || e.status === "cancelled") continue;
              allEvents.push({
                id: `${fc.calendarId}:${e.id}`,
                calendarId: fc.calendarId,
                familyCalendarId: fc.id,
                summary: e.summary || "(Untitled)",
                startDate: e.start.date,
                endDate: e.end?.date,
                sharedBy: {
                  id: fc.sharedBy.id,
                  name: fc.sharedBy.name,
                  email: fc.sharedBy.email,
                },
                color: fc.color,
                displayName: fc.displayName,
              });
            }
          } catch {
            // Skip calendar on error
          }
        }
      }
    }

    return NextResponse.json({ events: allEvents });
  } catch (error) {
    console.error("Error fetching family events:", error);
    return NextResponse.json(
      { error: "Failed to fetch events" },
      { status: 500 }
    );
  }
}
