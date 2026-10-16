// Pages Function: /api/stripe-webhook - records paid sessions to KV (binding ORDERS).
// Verify signature with WebCrypto; no Stripe SDK needed.
export async function onRequestPost(context) {
  const { request, env } = context;
  const sig = request.headers.get("stripe-signature") || "";
  const secret = env.STRIPE_WEBHOOK_SECRET || "";
  if (!secret) return new Response("not configured", { status: 500 });
  const raw = await request.text();
  const parts = Object.fromEntries(sig.split(",").map(p => p.split("=")));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${parts.t}.${raw}`));
  const expected = [...new Uint8Array(mac)].map(b => b.toString(16).padStart(2, "0")).join("");
  if (expected !== parts.v1) return new Response("bad signature", { status: 400 });
  const evt = JSON.parse(raw);
  if (evt.type === "checkout.session.completed") {
    const s = evt.data.object;
    await env.ORDERS.put(`paid-${s.id}`,
      JSON.stringify({ amount: s.amount_total, email: s.customer_details?.email,
                       link: s.payment_link, ts: new Date().toISOString() }));
  }
  if (evt.type === "checkout.session.expired") {
    const s = evt.data.object;
    // record abandons too, so recovery outreach has the email when present
    await env.ORDERS.put(`abandoned-${s.id}`,
      JSON.stringify({ amount: s.amount_total, email: s.customer_details?.email || null,
                       link: s.payment_link, ts: new Date().toISOString() }));
  }
  return new Response(JSON.stringify({ received: true }), { status: 200 });
}
