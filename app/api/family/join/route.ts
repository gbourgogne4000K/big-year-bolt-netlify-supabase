import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// POST /api/family/join - Join a family using invite code
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;
    const body = await request.json();
    const { inviteCode } = body;

    if (!inviteCode || typeof inviteCode !== "string" || inviteCode.trim().length === 0) {
      return NextResponse.json(
        { error: "Invite code is required" },
        { status: 400 }
      );
    }

    // Find family by invite code
    const family = await prisma.family.findUnique({
      where: { inviteCode: inviteCode.trim() },
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
    });

    if (!family) {
      return NextResponse.json(
        { error: "Invalid invite code" },
        { status: 404 }
      );
    }

    // Check if user is already a member
    const existingMembership = family.members.find((m) => m.userId === userId);
    if (existingMembership) {
      return NextResponse.json(
        { error: "You are already a member of this family" },
        { status: 400 }
      );
    }

    // Add user as member
    await prisma.familyMember.create({
      data: {
        familyId: family.id,
        userId,
        role: "member",
      },
    });

    // Fetch updated family data
    const updatedFamily = await prisma.family.findUnique({
      where: { id: family.id },
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
    });

    return NextResponse.json({
      family: {
        id: updatedFamily!.id,
        name: updatedFamily!.name,
        role: "member",
        memberCount: updatedFamily!.members.length,
        calendarCount: updatedFamily!.calendars.length,
        members: updatedFamily!.members.map((m) => ({
          id: m.id,
          userId: m.userId,
          role: m.role,
          name: m.user.name,
          email: m.user.email,
          image: m.user.image,
          joinedAt: m.joinedAt,
        })),
        createdAt: updatedFamily!.createdAt,
      },
    });
  } catch (error) {
    console.error("Error joining family:", error);
    return NextResponse.json(
      { error: "Failed to join family" },
      { status: 500 }
    );
  }
}
