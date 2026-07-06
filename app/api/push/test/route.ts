import { NextResponse } from "next/server";
import { headers } from "next/headers";
import webpush from "web-push";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export async function POST() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const profile = await db.profile.findUnique({ where: { userId: session.user.id } });
  if (!profile) return NextResponse.json({ error: "No profile" }, { status: 404 });

  const sub = await db.pushSubscription.findUnique({ where: { profileId: profile.id } });
  if (!sub) return NextResponse.json({ error: "Not subscribed on the server" }, { status: 400 });

  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY || !process.env.VAPID_SUBJECT) {
    return NextResponse.json(
      { error: "Server VAPID keys are not configured. Check VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT." },
      { status: 500 }
    );
  }

  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify({
        title: "Test notification 🔔",
        body: "Notifications are working. You're all set.",
        url: "/settings",
        icon: "/icons/icon-192.png",
      })
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode ?? 500;
    const message = (err as Error).message ?? "Push delivery failed";
    // 404/410 means the subscription is gone on the push service — clean it up
    if (status === 404 || status === 410) {
      await db.pushSubscription.deleteMany({ where: { profileId: profile.id } });
      return NextResponse.json(
        { error: "Subscription expired on the push service. Re-enable notifications.", expired: true },
        { status: 410 }
      );
    }
    console.error("Test push failed:", err);
    return NextResponse.json({ error: `Push failed (${status}): ${message}` }, { status: 500 });
  }
}
