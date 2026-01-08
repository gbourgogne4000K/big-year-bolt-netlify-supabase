import { NextRequest, NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/supabase/auth";
import { prisma } from "@/lib/prisma";

// GET /api/family/calendars - Get all calendars shared with a family
export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const familyId = searchParams.get("familyId");

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
    const calendars = await prisma.familyCalendar.findMany({
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

    return NextResponse.json({
      calendars: calendars.map((c) => ({
        id: c.id,
        calendarId: c.calendarId,
        displayName: c.displayName,
        color: c.color,
        sharedBy: c.sharedBy,
        createdAt: c.createdAt,
      })),
    });
  } catch (error) {
    console.error("Error fetching family calendars:", error);
    return NextResponse.json(
      { error: "Failed to fetch calendars" },
      { status: 500 }
    );
  }
}

// POST /api/family/calendars - Share a calendar with the family
export async function POST(request: NextRequest) {
  try {
    const userId = await getAuthUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { familyId, calendarId, displayName, color } = body;

    if (!familyId || !calendarId) {
      return NextResponse.json(
        { error: "Family ID and calendar ID are required" },
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

    // Check if calendar is already shared
    const existingShare = await prisma.familyCalendar.findUnique({
      where: {
        familyId_calendarId: { familyId, calendarId },
      },
    });

    if (existingShare) {
      return NextResponse.json(
        { error: "This calendar is already shared with the family" },
        { status: 400 }
      );
    }

    // Share the calendar
    const familyCalendar = await prisma.familyCalendar.create({
      data: {
        familyId,
        calendarId,
        sharedByUserId: userId,
        displayName: displayName || null,
        color: color || null,
      },
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

    return NextResponse.json({
      calendar: {
        id: familyCalendar.id,
        calendarId: familyCalendar.calendarId,
        displayName: familyCalendar.displayName,
        color: familyCalendar.color,
        sharedBy: familyCalendar.sharedBy,
        createdAt: familyCalendar.createdAt,
      },
    });
  } catch (error) {
    console.error("Error sharing calendar:", error);
    return NextResponse.json(
      { error: "Failed to share calendar" },
      { status: 500 }
    );
  }
}

// PUT /api/family/calendars - Update a shared calendar (color, displayName)
export async function PUT(request: NextRequest) {
  try {
    const userId = await getAuthUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { familyCalendarId, displayName, color } = body;

    if (!familyCalendarId) {
      return NextResponse.json(
        { error: "Family calendar ID is required" },
        { status: 400 }
      );
    }

    // Get the family calendar
    const familyCalendar = await prisma.familyCalendar.findUnique({
      where: { id: familyCalendarId },
    });

    if (!familyCalendar) {
      return NextResponse.json(
        { error: "Calendar not found" },
        { status: 404 }
      );
    }

    // Check if user is a member of this family
    const membership = await prisma.familyMember.findUnique({
      where: {
        familyId_userId: { familyId: familyCalendar.familyId, userId },
      },
    });

    if (!membership) {
      return NextResponse.json(
        { error: "You are not a member of this family" },
        { status: 403 }
      );
    }

    // Update the calendar
    const updated = await prisma.familyCalendar.update({
      where: { id: familyCalendarId },
      data: {
        displayName: displayName !== undefined ? displayName : undefined,
        color: color !== undefined ? color : undefined,
      },
    });

    return NextResponse.json({ calendar: updated });
  } catch (error) {
    console.error("Error updating family calendar:", error);
    return NextResponse.json(
      { error: "Failed to update calendar" },
      { status: 500 }
    );
  }
}

// DELETE /api/family/calendars - Unshare a calendar from family
export async function DELETE(request: NextRequest) {
  try {
    const userId = await getAuthUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const familyCalendarId = searchParams.get("familyCalendarId");

    if (!familyCalendarId) {
      return NextResponse.json(
        { error: "Family calendar ID is required" },
        { status: 400 }
      );
    }

    // Get the family calendar
    const familyCalendar = await prisma.familyCalendar.findUnique({
      where: { id: familyCalendarId },
    });

    if (!familyCalendar) {
      return NextResponse.json(
        { error: "Calendar not found" },
        { status: 404 }
      );
    }

    // Check if user is a member of this family
    const membership = await prisma.familyMember.findUnique({
      where: {
        familyId_userId: { familyId: familyCalendar.familyId, userId },
      },
    });

    if (!membership) {
      return NextResponse.json(
        { error: "You are not a member of this family" },
        { status: 403 }
      );
    }

    // Only the person who shared or an admin can unshare
    const isOwner = familyCalendar.sharedByUserId === userId;
    const isAdmin = membership.role === "admin";

    if (!isOwner && !isAdmin) {
      return NextResponse.json(
        { error: "Only the owner or an admin can remove this calendar" },
        { status: 403 }
      );
    }

    // Delete the shared calendar
    await prisma.familyCalendar.delete({
      where: { id: familyCalendarId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error unsharing calendar:", error);
    return NextResponse.json(
      { error: "Failed to unshare calendar" },
      { status: 500 }
    );
  }
}
