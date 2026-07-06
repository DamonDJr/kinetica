import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { NotificationSettings } from "./notification-settings";

export default async function SettingsPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  const profile = await db.profile.findUnique({ where: { userId: session.user.id } });
  if (!profile) redirect("/onboarding");

  const sub = await db.pushSubscription.findUnique({ where: { profileId: profile.id } });

  return (
    <NotificationSettings
      vapidPublicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ""}
      initial={{
        mealRemindersEnabled: profile.mealRemindersEnabled,
        workoutNudgesEnabled: profile.workoutNudgesEnabled,
        notifyStartHour: profile.notifyStartHour,
        notifyEndHour: profile.notifyEndHour,
        subscribed: !!sub,
      }}
    />
  );
}
