import webpush from "npm:web-push@3.6.7";

const apiUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const dbHeaders = { apikey: serviceKey, Authorization: "Bearer " + serviceKey, "Content-Type": "application/json" };
async function rpc(name: string, args: Record<string, unknown> = {}) {
  const response = await fetch(apiUrl + "/rest/v1/rpc/" + name, { method: "POST", headers: dbHeaders, body: JSON.stringify(args) });
  if (!response.ok) throw new Error("Database operation failed: " + response.status);
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}
async function patch(table: string, id: string, body: Record<string, unknown>) {
  const response = await fetch(apiUrl + "/rest/v1/" + table + "?id=eq." + encodeURIComponent(id), { method: "PATCH", headers: dbHeaders, body: JSON.stringify(body) });
  if (!response.ok) throw new Error("Delivery status update failed");
}
async function sameSecret(a: string, b: string) {
  const left = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(a)));
  const right = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(b)));
  let difference = 0;
  for (let i = 0; i < left.length; i++) difference |= left[i] ^ right[i];
  return difference === 0;
}
Deno.serve(async (request: Request) => {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const secret = request.headers.get("x-tito-worker-secret");
  if (!secret || secret.length !== 64) return new Response("Unauthorized", { status: 401 });
  try {
    let config = await rpc("tito_push_server_config");
    if (!config.workerSecret || !(await sameSecret(secret, config.workerSecret))) return new Response("Unauthorized", { status: 401 });
    if (!config.vapid) {
      const keys = webpush.generateVAPIDKeys();
      await rpc("tito_initialize_push_vapid", { keys });
      config = await rpc("tito_push_server_config");
    }
    // Bootstrap validates deployment and initializes server keys without sending anything.
    const command = await request.json().catch(() => ({}));
    if (command.bootstrap === true) {
      // Exercise payload encryption without contacting a push provider or a user's device.
      const testKey = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
      const toBase64Url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
      const rawPublic = new Uint8Array(await crypto.subtle.exportKey("raw", testKey.publicKey));
      const details = webpush.generateRequestDetails({
        endpoint: "https://fcm.googleapis.com/fcm/send/tito-encryption-selftest",
        keys: { p256dh: toBase64Url(rawPublic), auth: toBase64Url(crypto.getRandomValues(new Uint8Array(16))) },
      }, '{"title":"TiTo self-test"}', {
        vapidDetails: { subject: "https://pelomatrix10.github.io/App-finanzas/", ...config.vapid },
      });
      return Response.json({ ready: !!config.vapid, encryption: details.body.length > 0 && !!details.headers.Authorization });
    }
    const jobs = await rpc("tito_claim_reminders");
    let sent = 0, failed = 0;
    async function send(job: any) {
      try {
        if (!(await rpc("tito_reminder_is_current", { delivery_id: job.id }))) {
          await patch("tito_push_deliveries", job.id, { attempts: 5, locked_until: null, last_error: "Reservation no longer active" });
          return;
        }
        // Build encrypted Web Push using the standard library; use native fetch for Edge compatibility.
        const details = webpush.generateRequestDetails(job.subscription, JSON.stringify(job.payload), {
          vapidDetails: { subject: "https://pelomatrix10.github.io/App-finanzas/", publicKey: config.vapid.publicKey, privateKey: config.vapid.privateKey },
          TTL: 1800, urgency: "high",
        });
        const headers = new Headers(details.headers);
        headers.delete("content-length");
        const response = await fetch(details.endpoint, { method: "POST", headers, body: details.body, redirect: "error", signal: AbortSignal.timeout(15000) });
        if (response.status === 404 || response.status === 410) {
          await patch("tito_push_subscriptions", job.subscriptionId, { disabled_at: new Date().toISOString() });
          await patch("tito_push_deliveries", job.id, { last_error: "Subscription expired", locked_until: null });
          failed++;
        } else if (response.ok) {
          await patch("tito_push_deliveries", job.id, { sent_at: new Date().toISOString(), locked_until: null, last_error: null });
          sent++;
        } else {
          await patch("tito_push_deliveries", job.id, { last_error: "Push service HTTP " + response.status, locked_until: null });
          failed++;
        }
        await response.body?.cancel();
      } catch {
        // Do not log endpoints, payloads, credentials or subscription encryption keys.
        await patch("tito_push_deliveries", job.id, { last_error: "Delivery failed", locked_until: null }).catch(() => {});
        failed++;
      }
    }
    // Bounded parallel delivery keeps the batch within its two-minute database lease.
    const pending = [...jobs];
    await Promise.all(Array.from({ length: Math.min(5, jobs.length) }, async () => {
      while (pending.length) await send(pending.shift());
    }));
    return Response.json({ processed: jobs.length, sent, failed });
  } catch {
    return Response.json({ error: "Reminder worker failed" }, { status: 500 });
  }
});