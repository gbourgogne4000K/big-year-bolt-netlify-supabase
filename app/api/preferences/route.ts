import { NextRequest, NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/supabase/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// GET user preferences
export async function GET() {
  const userId = await getAuthUserId();
  if (!userId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    let prefs = await prisma.userPreferences.findUnique({
      where: { userId },
    });

    if (!prefs) {
      // Create default preferences
      prefs = await prisma.userPreferences.create({
        data: {
          userId,
          selectedCalendarIds: "[]",
          hiddenEventIds: "[]",
          showDaysOfWeek: true,
          alignWeekends: false,
          showHidden: false,
          calendarColors: "{}",
        },
      });
    }

    return NextResponse.json({
      selectedCalendarIds: JSON.parse(prefs.selectedCalendarIds),
      hiddenEventIds: JSON.parse(prefs.hiddenEventIds),
      showDaysOfWeek: prefs.showDaysOfWeek,
      alignWeekends: prefs.alignWeekends ?? false,
      showHidden: prefs.showHidden,
      calendarColors: JSON.parse(prefs.calendarColors),
      activeFamilyId: prefs.activeFamilyId || null,
    });
  } catch (error: any) {
    console.error("Error fetching preferences:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch preferences" },
      { status: 500 }
    );
  }
}

// PUT/PATCH user preferences
export async function PUT(req: NextRequest) {
  const userId = await getAuthUserId();
  if (!userId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const {
      selectedCalendarIds,
      hiddenEventIds,
      showDaysOfWeek,
      alignWeekends,
      showHidden,
      calendarColors,
      activeFamilyId,
    } = body;

    const updateData: any = {};
    if (selectedCalendarIds !== undefined) {
      updateData.selectedCalendarIds = JSON.stringify(selectedCalendarIds);
    }
    if (hiddenEventIds !== undefined) {
      updateData.hiddenEventIds = JSON.stringify(hiddenEventIds);
    }
    if (showDaysOfWeek !== undefined) {
      updateData.showDaysOfWeek = showDaysOfWeek;
    }
    if (alignWeekends !== undefined) {
      updateData.alignWeekends = Boolean(alignWeekends);
    }
    if (showHidden !== undefined) {
      updateData.showHidden = showHidden;
    }
    if (calendarColors !== undefined) {
      updateData.calendarColors = JSON.stringify(calendarColors);
    }
    if (activeFamilyId !== undefined) {
      updateData.activeFamilyId = activeFamilyId;
    }

    const prefs = await prisma.userPreferences.upsert({
      where: { userId },
      update: updateData,
      create: {
        userId,
        selectedCalendarIds: JSON.stringify(selectedCalendarIds || []),
        hiddenEventIds: JSON.stringify(hiddenEventIds || []),
        showDaysOfWeek: showDaysOfWeek ?? true,
        alignWeekends: alignWeekends ?? false,
        showHidden: showHidden ?? false,
        calendarColors: JSON.stringify(calendarColors || {}),
      },
    });

    return NextResponse.json({
      selectedCalendarIds: JSON.parse(prefs.selectedCalendarIds),
      hiddenEventIds: JSON.parse(prefs.hiddenEventIds),
      showDaysOfWeek: prefs.showDaysOfWeek,
      alignWeekends: prefs.alignWeekends ?? false,
      showHidden: prefs.showHidden,
      calendarColors: JSON.parse(prefs.calendarColors),
      activeFamilyId: prefs.activeFamilyId || null,
    });
  } catch (error: any) {
    console.error("Error updating preferences:", error);
    return NextResponse.json(
      { error: error.message || "Failed to update preferences" },
      { status: 500 }
    );
  }
}

