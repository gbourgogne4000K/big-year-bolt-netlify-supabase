import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/family - List all families the user belongs to
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;

    // Get all families where the user is a member
    const familyMembers = await prisma.familyMember.findMany({
      where: { userId },
      include: {
        family: {
          include: {
            members: {
              include: {
                user: {
                  select: {
                    id: true,
                    name: true,
                    email: true,
                    image: true,
                  },
                },
              },
            },
            calendars: true,
          },
        },
      },
    });

    const families = familyMembers.map((fm) => ({
      id: fm.family.id,
      name: fm.family.name,
      inviteCode: fm.role === "admin" ? fm.family.inviteCode : undefined,
      role: fm.role,
      memberCount: fm.family.members.length,
      calendarCount: fm.family.calendars.length,
      members: fm.family.members.map((m) => ({
        id: m.id,
        userId: m.userId,
        role: m.role,
        name: m.user.name,
        email: m.user.email,
        image: m.user.image,
        joinedAt: m.joinedAt,
      })),
      createdAt: fm.family.createdAt,
    }));

    return NextResponse.json({ families });
  } catch (error) {
    console.error("Error fetching families:", error);
    return NextResponse.json(
      { error: "Failed to fetch families" },
      { status: 500 }
    );
  }
}

// POST /api/family - Create a new family
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;
    const body = await request.json();
    const { name } = body;

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json(
        { error: "Family name is required" },
        { status: 400 }
      );
    }

    // Create family and add creator as admin
    const family = await prisma.family.create({
      data: {
        name: name.trim(),
        members: {
          create: {
            userId,
            role: "admin",
          },
        },
      },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                image: true,
              },
            },
          },
        },
      },
    });

    return NextResponse.json({
      family: {
        id: family.id,
        name: family.name,
        inviteCode: family.inviteCode,
        role: "admin",
        memberCount: family.members.length,
        calendarCount: 0,
        members: family.members.map((m) => ({
          id: m.id,
          userId: m.userId,
          role: m.role,
          name: m.user.name,
          email: m.user.email,
          image: m.user.image,
          joinedAt: m.joinedAt,
        })),
        createdAt: family.createdAt,
      },
    });
  } catch (error) {
    console.error("Error creating family:", error);
    return NextResponse.json(
      { error: "Failed to create family" },
      { status: 500 }
    );
  }
}

// PUT /api/family - Update family name
export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;
    const body = await request.json();
    const { familyId, name } = body;

    if (!familyId || !name || typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json(
        { error: "Family ID and name are required" },
        { status: 400 }
      );
    }

    // Check if user is admin of this family
    const membership = await prisma.familyMember.findUnique({
      where: {
        familyId_userId: { familyId, userId },
      },
    });

    if (!membership || membership.role !== "admin") {
      return NextResponse.json(
        { error: "Only admins can update family settings" },
        { status: 403 }
      );
    }

    const family = await prisma.family.update({
      where: { id: familyId },
      data: { name: name.trim() },
    });

    return NextResponse.json({ family });
  } catch (error) {
    console.error("Error updating family:", error);
    return NextResponse.json(
      { error: "Failed to update family" },
      { status: 500 }
    );
  }
}

// DELETE /api/family - Delete a family (admin only)
export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;
    const { searchParams } = new URL(request.url);
    const familyId = searchParams.get("familyId");

    if (!familyId) {
      return NextResponse.json(
        { error: "Family ID is required" },
        { status: 400 }
      );
    }

    // Check if user is admin of this family
    const membership = await prisma.familyMember.findUnique({
      where: {
        familyId_userId: { familyId, userId },
      },
    });

    if (!membership || membership.role !== "admin") {
      return NextResponse.json(
        { error: "Only admins can delete a family" },
        { status: 403 }
      );
    }

    // Delete the family (cascade will delete members and calendars)
    await prisma.family.delete({
      where: { id: familyId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting family:", error);
    return NextResponse.json(
      { error: "Failed to delete family" },
      { status: 500 }
    );
  }
}
