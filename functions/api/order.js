// Pages Function: /api/order - capture guesstimate orders before checkout.
// Stores {email, address, tier, ts} to KV, returns the right Stripe payment link
// with prefilled_email. KV binding: ORDERS.
const BYO_LINK = "https://buy.stripe.com/fZubIU8H20i5eDAeoT5os03";
const MINE_LINK = "https://buy.stripe.com/8x24gse1mgh3bro4Oj5os04";

const P2_LINK = "https://buy.stripe.com/7sY28kcXi0i52USeoT5os1A";
export async function onRequestPost(context) {
  const { request, env } = context;
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return new Response(JSON.stringify({ error: "bad json" }), { status: 400, headers: cors });
  }
  const email = String(body.email || "").trim().toLowerCase();
  const address = String(body.address || "").trim();
  const tier = String(body.tier || "");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return new Response(JSON.stringify({ error: "invalid email" }), { status: 400, headers: cors });
  }
  if (address.length < 6) {
    return new Response(JSON.stringify({ error: "invalid address" }), { status: 400, headers: cors });
  }
  if (tier !== "byo" && tier !== "mine" && tier !== "p2") {
    return new Response(JSON.stringify({ error: "invalid tier" }), { status: 400, headers: cors });
  }
  const termsVersion = String(body.terms_version || "");
  const termsAccepted = body.terms_accepted === true;
  if (!termsAccepted) {
    return new Response(JSON.stringify({ error: "terms must be accepted before ordering" }), { status: 400, headers: cors });
  }
  const record = {
    ts: new Date().toISOString(),
    email,
    address,
    tier,
    terms_version: termsVersion,
    terms_accepted: termsAccepted,
  };
  const kvAttached = !!(env && env.ORDERS);
  let kvError = "", kvRoundtrip = null;
  if (kvAttached) {
    try {
      const key = `order-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
      await env.ORDERS.put(key, JSON.stringify(record));
      const back = await env.ORDERS.get(key);
      kvRoundtrip = back ? "GET-OK" : "GET-NULL";
    } catch (e) {
      kvError = String(e && e.message || e);
    }
  }
  const link = (tier === "byo" ? BYO_LINK : tier === "p2" ? P2_LINK : MINE_LINK) + "?prefilled_email=" + encodeURIComponent(email);
  return new Response(JSON.stringify({ url: link, kv_attached: kvAttached, kv_error: kvError, kv_roundtrip: kvRoundtrip }), {
    status: 200,
    headers: { "Content-Type": "application/json", ...cors },
  });
}
