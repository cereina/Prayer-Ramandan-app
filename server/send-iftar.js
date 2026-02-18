import webpush from "web-push";
import { pool } from "./db.js";
import { DateTime } from "luxon";
import PrayTime from "praytime";

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT,
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

// Jafari method
const pt = new PrayTime();
pt.setMethod("Jafari");

function hhmmToMinutes(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

async function run() {
  const { rows } = await pool.query("SELECT * FROM subscriptions");

  for (const s of rows) {
    const now = DateTime.now().setZone(s.timezone);
    const todayKey = now.toISODate(); // YYYY-MM-DD

    // compute today's prayer times in that timezone
    const times = pt.getTimes(
      now.toJSDate(),
      [Number(s.lat), Number(s.lng)],
      now.offset / 60,  // tz hours
      0,
      "24h"
    );

    const maghrib = times.maghrib;     // "HH:MM"
    const nowMin = now.hour * 60 + now.minute;
    const magMin = hhmmToMinutes(maghrib);

    // Fire once per day when current minute == maghrib minute
    if (nowMin === magMin && s.last_sent_date !== todayKey) {
      const payload = JSON.stringify({
        title: "Iftar time (Maghrib)",
        body: `${s.city ? (s.city + " • ") : ""}Maghrib: ${maghrib}`,
        url: "/"
      });

      const subscription = {
        endpoint: s.endpoint,
        keys: { p256dh: s.p256dh, auth: s.auth }
      };

      try {
        await webpush.sendNotification(subscription, payload);
        await pool.query(
          "UPDATE subscriptions SET last_sent_date=$1 WHERE endpoint=$2",
          [todayKey, s.endpoint]
        );
      } catch (e) {
        // If subscription is gone/invalid, delete it
        const code = e?.statusCode;
        if (code === 404 || code === 410) {
          await pool.query("DELETE FROM subscriptions WHERE endpoint=$1", [s.endpoint]);
        }
      }
    }
  }
}

run().then(() => process.exit(0)).catch(() => process.exit(1));
