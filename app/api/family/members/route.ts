import { NextRequest, NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/supabase/auth";
import { prisma } from "@/lib/prisma";

// DELETE /api/family/members - Remove a member from family or leave family
export async function DELETE(request: NextRequest) {
  try {
    const userId = await getAuthUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const familyId = searchParams.get("familyId");
    const memberId = searchParams.get("memberId"); // The member to remove (can be self or another user)

    if (!familyId || !memberId) {
      return NextResponse.json(
        { error: "Family ID and member ID are required" },
        { status: 400 }
      );
    }

    // Get the family member to remove
    const memberToRemove = await prisma.familyMember.findUnique({
      where: { id: memberId },
      include: { family: { include: { members: true } } },
    });

    if (!memberToRemove || memberToRemove.familyId !== familyId) {
      return NextResponse.json(
        { error: "Member not found in this family" },
        { status: 404 }
      );
    }

    // Check if user is the member being removed (leaving) or an admin (removing)
    const currentUserMembership = await prisma.familyMember.findUnique({
      where: {
        familyId_userId: { familyId, userId },
      },
    });

    if (!currentUserMembership) {
      return NextResponse.json(
        { error: "You are not a member of this family" },
        { status: 403 }
      );
    }

    const isSelf = memberToRemove.userId === userId;
    const isAdmin = currentUserMembership.role === "admin";

    // Only admins can remove others, anyone can leave
    if (!isSelf && !isAdmin) {
      return NextResponse.json(
        { error: "Only admins can remove other members" },
        { status: 403 }
      );
    }

    // Check if removing the last admin
    if (memberToRemove.role === "admin") {
      const adminCount = memberToRemove.family.members.filter(
        (m) => m.role === "admin"
      ).length;

      if (adminCount === 1 && memberToRemove.family.members.length > 1) {
        return NextResponse.json(
          { error: "Cannot remove the last admin. Promote another member first or delete the family." },
          { status: 400 }
        );
      }
    }

    // If this is the last member, delete the family entirely
    if (memberToRemove.family.members.length === 1) {
      await prisma.family.delete({
        where: { id: familyId },
      });
      return NextResponse.json({ success: true, familyDeleted: true });
    }

    // Also remove any calendars shared by this user in this family
    await prisma.familyCalendar.deleteMany({
      where: {
        familyId,
        sharedByUserId: memberToRemove.userId,
      },
    });

    // Remove the member
    await prisma.familyMember.delete({
      where: { id: memberId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error removing family member:", error);
    return NextResponse.json(
      { error: "Failed to remove member" },
      { status: 500 }
    );
  }
}

// PUT /api/family/members - Update member role
export async function PUT(request: NextRequest) {
  try {
    const userId = await getAuthUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { familyId, memberId, role } = body;

    if (!familyId || !memberId || !role) {
      return NextResponse.json(
        { error: "Family ID, member ID, and role are required" },
        { status: 400 }
      );
    }

    if (role !== "admin" && role !== "member") {
      return NextResponse.json(
        { error: "Role must be 'admin' or 'member'" },
        { status: 400 }
      );
    }

    // Check if current user is admin
    const currentUserMembership = await prisma.familyMember.findUnique({
      where: {
        familyId_userId: { familyId, userId },
      },
    });

    if (!currentUserMembership || currentUserMembership.role !== "admin") {
      return NextResponse.json(
        { error: "Only admins can change member roles" },
        { status: 403 }
      );
    }

    // Get the member to update
    const memberToUpdate = await prisma.familyMember.findUnique({
      where: { id: memberId },
      include: { family: { include: { members: true } } },
    });

    if (!memberToUpdate || memberToUpdate.familyId !== familyId) {
      return NextResponse.json(
        { error: "Member not found in this family" },
        { status: 404 }
      );
    }

    // Check if demoting the last admin
    if (memberToUpdate.role === "admin" && role === "member") {
      const adminCount = memberToUpdate.family.members.filter(
        (m) => m.role === "admin"
      ).length;

      if (adminCount === 1) {
        return NextResponse.json(
          { error: "Cannot demote the last admin. Promote another member first." },
          { status: 400 }
        );
      }
    }

    // Update the role
    const updatedMember = await prisma.familyMember.update({
      where: { id: memberId },
      data: { role },
    });

    return NextResponse.json({ member: updatedMember });
  } catch (error) {
    console.error("Error updating family member:", error);
    return NextResponse.json(
      { error: "Failed to update member" },
      { status: 500 }
    );
  }
}
