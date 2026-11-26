import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { api } from "./_generated/api";

const http = httpRouter();

// CORS preflight handler so external web apps/n8n/browser clients can call the webhook
http.route({
  path: "/api/webhook/inbound",
  method: "OPTIONS",
  handler: httpAction(async () => {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    });
  }),
});

// Public REST Webhook Endpoint: POST https://<your-deployment>.convex.site/api/webhook/inbound
http.route({
  path: "/api/webhook/inbound",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      const message = typeof body.message === "string" ? body.message.trim() : "";

      if (!message) {
        return new Response(
          JSON.stringify({ ok: false, error: "Missing required 'message' string in JSON body." }),
          {
            status: 400,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
            },
          }
        );
      }

      const channel = typeof body.channel === "string" ? body.channel : "External Webhook";
      const autoBook = typeof body.autoBook === "boolean" ? body.autoBook : true;

      const result = await ctx.runAction(api.frontdesk.processInboundInquiry, {
        message,
        channel,
        autoBook,
      });

      return new Response(
        JSON.stringify({
          ok: true,
          leadId: result.leadId,
          bookedSlot: result.bookedSlotLabel ?? null,
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    } catch (err) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: err instanceof Error ? err.message : "Invalid JSON payload",
        }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }
  }),
});

export default http;