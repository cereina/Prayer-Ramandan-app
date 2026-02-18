import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import webpush from "web-push";
import { pool } from "./db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT,
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

const app = express();
app.use(express.json());

// Serve your PWA
app.use(express.static(path.join(__dirname, "..", "public")));

app.get("/api/vapid-public-key", (req, res) => {
  res.json({ publicKey: process.env.VAPID_PUBLIC_KEY });
});

app.post("/api/subscribe", async (req, res) => {
  const { subscription, lat, lng, city, timeZone } = req.body;
  if (!subscription?.endpoint) return res.status(400).json({ ok: false });

  const p256dh = subscription.keys?.p256dh;
  const auth = subscription.keys?.auth;

  await pool.query(
    `INSERT INTO subscriptions(endpoint, p256dh, auth, lat, lng, city, timezone, last_sent_date)
     VALUES($1,$2,$3,$4,$5,$6,$7,NULL)
     ON CONFLICT(endpoint) DO UPDATE SET
       p256dh=EXCLUDED.p256dh, auth=EXCLUDED.auth,
       lat=EXCLUDED.lat, lng=EXCLUDED.lng, city=EXCLUDED.city, timezone=EXCLUDED.timezone`,
    [subscription.endpoint, p256dh, auth, lat, lng, city || "", timeZone || "UTC"]
  );

  res.json({ ok: true });
});

app.post("/api/unsubscribe", async (req, res) => {
  const { endpoint } = req.body;
  if (!endpoint) return res.json({ ok: true });
  await pool.query(`DELETE FROM subscriptions WHERE endpoint=$1`, [endpoint]);
  res.json({ ok: true });
});

app.get("/api/health", (req, res) => res.json({ ok: true }));

const port = process.env.PORT || 3000;
app.listen(port, () => console.log("Server running on", port));
