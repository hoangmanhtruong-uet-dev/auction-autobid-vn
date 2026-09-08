import { NextResponse } from "next/server";

import { getCurrentUser } from "@/src/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ user: null }, { status: 200 });
  }

  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      emailVerified: user.emailVerified,
      fullName: user.fullName,
      role: user.role,
      avatarUrl: user.avatarUrl,
    },
  });
}
