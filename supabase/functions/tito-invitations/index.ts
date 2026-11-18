import webpush from "npm:web-push@3.6.7";
import { timingSafeEqual } from "node:crypto";

const db = Deno.env.get("SUPABASE_URL");
const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const headers = { apikey: key!, Authorization: "Bearer " + key, "Content-Type": "application/json" };
const app = "https://pelomatrix10.github.io/App-finanzas/";
const encoder = new TextEncoder();

async function rpc(name: string) {
  const result = await fetch(db + "/rest/v1/rpc/" + name, {
    method: "POST", headers, body: "{}", signal: AbortSignal.timeout(10000),
  });
  if (!result.ok) throw new Error(name + " returned " + result.status);
  return result.json();
}

async function mark(id: string, delivery: string) {
  const result = await fetch(db + "/rest/v1/tito_job_invitations?id=eq." + encodeURIComponent(id), {
    method: "PATCH", headers, body: JSON.stringify({delivery}), signal: AbortSignal.timeout(10000),
  });
  if (!result.ok) throw new Error("Could not update delivery");
}

function supportedEndpoint(endpoint: string) {
  const url = new URL(endpoint);
  return url.protocol === "https:" && !url.username && !url.password && !url.port &&
    (["fcm.googleapis.com","updates.push.services.mozilla.com","web.push.apple.com"].includes(url.hostname) ||
      /^[a-z0-9-]+[.]notify[.]windows[.]com$/.test(url.hostname));
}

async function sendPush(job: any, vapid: any) {
  if (!vapid || !job.subscriptions.length) return "inbox";
  // Lock-screen notifications carry no job, role, date, location or contact details.
  const payload = {
    title: "Invitación de trabajo en TiTo",
    body: "Abre TiTo para revisar y responder tu invitación.",
    tag: "tito-invite-" + job.id, url: app + "?invitacion=" + job.id,
  };
  const statuses = await Promise.allSettled(job.subscriptions.map(async (subscription: any) => {
    if (!supportedEndpoint(subscription.endpoint)) return 410;
    const details = webpush.generateRequestDetails(subscription, JSON.stringify(payload), {
      vapidDetails: { subject: app, publicKey: vapid.publicKey, privateKey: vapid.privateKey }, TTL: 14400, urgency: "high",
    });
    const pushHeaders = new Headers(details.headers);
    pushHeaders.delete("content-length");
    const response = await fetch(details.endpoint, {
      method: "POST", headers: pushHeaders, body: details.body, redirect: "error", signal: AbortSignal.timeout(9000),
    });
    await response.body?.cancel();
    return response.status;
  }));
  if (statuses.some(s => s.status === "fulfilled" && s.value >= 200 && s.value < 300)) return "sent";
  if (statuses.every(s => s.status === "fulfilled" && [404,410].includes(s.value))) return "inbox";
  throw new Error("Push unavailable");
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return new Response("Method not allowed", {status:405});
  const token = request.headers.get("x-tito-worker-secret");
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return new Response("Unauthorized", {status:401});
  try {
    const config = await rpc("tito_push_server_config");
    if (!config.workerSecret || !timingSafeEqual(encoder.encode(token), encoder.encode(config.workerSecret))) {
      return new Response("Unauthorized", {status:401});
    }
    const body = await request.json().catch(() => ({}));
    if (body.bootstrap) return Response.json({pushReady: Boolean(config.vapid)});
    const jobs = await rpc("claim_job_invitation_deliveries");
    await Promise.all(jobs.map(async (job: any) => {
      try {
        const outcome = job.eligible ? await sendPush(job, config.vapid) : "failed";
        await mark(job.id, outcome);
      } catch {
        if (job.attempts >= 4) await mark(job.id, "inbox");
      }
    }));
    return Response.json({processed:jobs.length});
  } catch {
    return Response.json({error:"Invitation worker unavailable"}, {status:500});
  }
});