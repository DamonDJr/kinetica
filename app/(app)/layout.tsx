import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { BottomNav } from "@/components/layout/bottom-nav";
import { TopBar } from "@/components/layout/top-bar";
import { GenerationProvider } from "@/components/generation-context";
import { GenerationBanner } from "@/components/layout/generation-banner";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  const profile = await db.profile.findUnique({
    where: { userId: session.user.id },
  });

  if (!profile) redirect("/onboarding");

  const unreadInsights = await db.aiInsight.count({
    where: { profileId: profile.id, read: false },
  });

  return (
    <GenerationProvider>
      <div className="flex flex-col min-h-screen">
        <TopBar
          name={profile.displayName.split(" ")[0]}
          level={profile.level}
          streakDays={profile.streakDays}
          unreadInsights={unreadInsights}
        />
        <GenerationBanner />
        <main className="flex-1 pb-24 px-4 pt-4 max-w-2xl mx-auto w-full">
          {children}
        </main>
        <BottomNav />
      </div>
    </GenerationProvider>
  );
}
