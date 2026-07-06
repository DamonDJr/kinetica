import webpush from "web-push";
import { db } from "./db";

if (
  process.env.VAPID_PUBLIC_KEY &&
  process.env.VAPID_PRIVATE_KEY &&
  process.env.VAPID_SUBJECT
) {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT,
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

export async function sendPushToProfile(
  profileId: string,
  payload: { title: string; body: string; url?: string }
) {
  const sub = await db.pushSubscription.findUnique({ where: { profileId } });
  if (!sub) return;

  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify({ ...payload, icon: "/icons/icon-192.png" })
    );
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode;
    if (status === 404 || status === 410) {
      await db.pushSubscription.deleteMany({ where: { profileId } }).catch(() => {});
      console.warn("Removed stale push subscription for profile", profileId);
    } else {
      console.error("Push failed for profile", profileId, err);
    }
  }
}

export async function sendPushToAll(
  payload: { title: string; body: string; url?: string }
) {
  const subs = await db.pushSubscription.findMany();
  await Promise.allSettled(
    subs.map((sub) =>
      webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify({ ...payload, icon: "/icons/icon-192.png" })
      )
    )
  );
}
