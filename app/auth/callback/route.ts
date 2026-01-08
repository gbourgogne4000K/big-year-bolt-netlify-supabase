import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data.session) {
      // Store Google OAuth tokens for Calendar API access
      const providerToken = data.session.provider_token;
      const providerRefreshToken = data.session.provider_refresh_token;
      const user = data.session.user;

      if (user && providerToken) {
        try {
          // Get provider account ID from user identities
          const googleIdentity = user.identities?.find(
            (id) => id.provider === "google"
          );
          const providerAccountId = googleIdentity?.id || user.id;

          // Store or update Google account tokens in the Account table
          await prisma.account.upsert({
            where: {
              provider_providerAccountId: {
                provider: "google",
                providerAccountId: providerAccountId,
              },
            },
            update: {
              access_token: providerToken,
              refresh_token: providerRefreshToken || undefined,
              expires_at: data.session.expires_at,
            },
            create: {
              userId: user.id,
              type: "oauth",
              provider: "google",
              providerAccountId: providerAccountId,
              access_token: providerToken,
              refresh_token: providerRefreshToken || undefined,
              expires_at: data.session.expires_at,
            },
          });

          // Ensure user exists in the User table
          await prisma.user.upsert({
            where: { id: user.id },
            update: {
              email: user.email,
              name: user.user_metadata?.full_name || user.user_metadata?.name,
              image: user.user_metadata?.avatar_url,
            },
            create: {
              id: user.id,
              email: user.email,
              name: user.user_metadata?.full_name || user.user_metadata?.name,
              image: user.user_metadata?.avatar_url,
            },
          });
        } catch (error) {
          console.error("Error storing OAuth tokens:", error);
          // Continue even if token storage fails - user can still authenticate
        }
      }

      const forwardedHost = request.headers.get("x-forwarded-host");
      const isLocalEnv = process.env.NODE_ENV === "development";

      if (isLocalEnv) {
        return NextResponse.redirect(`${origin}${next}`);
      } else if (forwardedHost) {
        return NextResponse.redirect(`https://${forwardedHost}${next}`);
      } else {
        return NextResponse.redirect(`${origin}${next}`);
      }
    }
  }

  // Return the user to an error page with instructions
  return NextResponse.redirect(`${origin}/auth/auth-code-error`);
}
