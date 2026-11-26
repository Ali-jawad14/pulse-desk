import { v } from "convex/values";
import { action, mutation, query } from "./_generated/server";
import { api } from "./_generated/api";
import { Id } from "./_generated/dataModel";

// 1. REACTIVE QUERIES (Auto-update React UI in real time)
export const getDashboardState = query({
  args: {},
  handler: async (ctx) => {
    const leads = await ctx.db
      .query("leads")
      .withIndex("by_createdAt")
      .order("desc")
      .take(25);

    const appointments = await ctx.db.query("appointments").collect();

    const messages = await ctx.db
      .query("messages")
      .withIndex("by_timestamp")
      .order("desc")
      .take(20);

    return {
      leads,
      appointments,
      messages: messages.reverse(),
    };
  },
});

// 2. TRANSACTIONAL MUTATIONS (ACID-compliant DB writes)
export const seedClinicSlots = mutation({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db.query("appointments").collect();
    if (existing.length > 0) return { seeded: false, count: existing.length };

    const defaultSlots = [
      { slotLabel: "Tomorrow · 09:00 AM EST", providerName: "Dr. Sarah Jenkins (Emergency/General)" },
      { slotLabel: "Tomorrow · 11:30 AM EST", providerName: "Dr. Sarah Jenkins (Emergency/General)" },
      { slotLabel: "Tomorrow · 02:00 PM EST", providerName: "Dr. Marcus Vance (Restorative/Ortho)" },
      { slotLabel: "Tomorrow · 04:15 PM EST", providerName: "Dr. Marcus Vance (Restorative/Ortho)" },
      { slotLabel: "Thursday · 10:00 AM EST", providerName: "Dr. Sarah Jenkins (Hygiene & Consult)" },
      { slotLabel: "Thursday · 01:30 PM EST", providerName: "Dr. Marcus Vance (Restorative/Ortho)" },
    ];

    for (const slot of defaultSlots) {
      await ctx.db.insert("appointments", {
        slotLabel: slot.slotLabel,
        providerName: slot.providerName,
        isBooked: false,
      });
    }
    return { seeded: true, count: defaultSlots.length };
  },
});

export const resetDemoData = mutation({
  args: {},
  handler: async (ctx) => {
    const leads = await ctx.db.query("leads").collect();
    for (const l of leads) await ctx.db.delete(l._id);

    const messages = await ctx.db.query("messages").collect();
    for (const m of messages) await ctx.db.delete(m._id);

    const slots = await ctx.db.query("appointments").collect();
    for (const s of slots) {
      await ctx.db.patch(s._id, {
        isBooked: false,
        leadId: undefined,
        patientName: undefined,
        serviceType: undefined,
      });
    }
    return { reset: true };
  },
});

export const commitQualifiedIntake = mutation({
  args: {
    prospectMessage: v.string(),
    channel: v.string(),
    patientName: v.string(),
    contactInfo: v.string(),
    serviceRequested: v.string(),
    urgency: v.string(),
    insuranceProvider: v.string(),
    qualificationScore: v.number(),
    status: v.string(),
    aiSummary: v.string(),
    aiReply: v.string(),
    autoBookSlot: v.boolean(),
  },
  handler: async (
    ctx,
    args
  ): Promise<{ leadId: Id<"leads">; bookedSlotLabel?: string; finalReply: string }> => {
    const now = Date.now();

    let bookedSlotLabel: string | undefined = undefined;
    let targetSlotId: Id<"appointments"> | undefined = undefined;

    if (args.autoBookSlot && args.qualificationScore >= 65) {
      const openSlot = await ctx.db
        .query("appointments")
        .withIndex("by_isBooked", (q) => q.eq("isBooked", false))
        .first();

      if (openSlot) {
        bookedSlotLabel = openSlot.slotLabel;
        targetSlotId = openSlot._id;
      }
    }

    const leadId = await ctx.db.insert("leads", {
      patientName: args.patientName,
      contactInfo: args.contactInfo,
      channel: args.channel,
      serviceRequested: args.serviceRequested,
      urgency: args.urgency,
      insuranceProvider: args.insuranceProvider,
      qualificationScore: args.qualificationScore,
      status: bookedSlotLabel ? "Qualified & Booked" : args.status,
      aiSummary: args.aiSummary,
      bookedSlot: bookedSlotLabel,
      createdAt: now,
    });

    if (targetSlotId && bookedSlotLabel) {
      await ctx.db.patch(targetSlotId, {
        isBooked: true,
        leadId,
        patientName: args.patientName,
        serviceType: args.serviceRequested,
      });
    }

    await ctx.db.insert("messages", {
      leadId,
      sender: "Prospect",
      channel: args.channel,
      body: args.prospectMessage,
      timestamp: now,
    });

    const finalReply = bookedSlotLabel
      ? `${args.aiReply} I've reserved ${bookedSlotLabel} for you and sent a confirmation text.`
      : args.aiReply;

    await ctx.db.insert("messages", {
      leadId,
      sender: "AI Front Desk",
      channel: args.channel,
      body: finalReply,
      timestamp: now + 1,
    });

    return { leadId, bookedSlotLabel, finalReply };
  },
});

// 3. AI ACTION (Calls Groq/Gemini LLM API, then commits via ACID mutation)
export const processInboundInquiry = action({
  args: {
    message: v.string(),
    channel: v.string(),
    autoBook: v.boolean(),
    conversationContext: v.optional(v.string()),
  },
  handler: async (
    ctx,
    args
  ): Promise<{ leadId: Id<"leads">; bookedSlotLabel?: string; aiReply: string }> => {
    const geminiKey = process.env.GEMINI_API_KEY;
    const groqKey = process.env.GROQ_API_KEY;

    const systemPrompt = `You are an AI Front Desk Receptionist for BrightSmile Dental & Wellness Clinic (Austin, TX).
Analyze the latest inbound message (and optional conversation history) and extract structured CRM fields as valid JSON ONLY (no markdown fences).

STRICT QUALIFICATION SCORING RULES (CRITICAL):
- 0 to 25 (Disqualified / Non-Booking): Greetings only ("hi", "hey", "hello"), explicit refusals ("i don't want an appointment", "no thanks", "stop"), or B2B/vendor spam pitches. NEVER score these 65 or higher.
- 30 to 60 (Needs Follow-Up): User asks a general question or mentions a symptom without stating they want to book, OR hasn't shared what dental service they need yet. Ask a helpful clarifying question in "aiReply" without booking.
- 65 to 100 (Qualified for Auto-Booking): User clearly states a dental need/service AND wants to book/schedule an appointment (or describes urgent dental pain/emergency care).

Schema:
{
  "patientName": "string (infer from message/history or 'New Caller')",
  "contactInfo": "string (phone/email if present, else '(512) 555-0194')",
  "serviceRequested": "string (e.g., 'Emergency Crown Repair', 'Routine Cleaning', 'Invisalign Consult', 'General Greeting / No Booking')",
  "urgency": "Emergency | High | Routine",
  "insuranceProvider": "string (e.g., 'Delta Dental PPO', 'Cigna', 'Self-Pay', 'Unverified')",
  "qualificationScore": number,
  "status": "Qualified & Booked | Needs Follow-Up | Disqualified",
  "aiSummary": "1-sentence crisp CRM note for the clinic coordinator",
  "aiReply": "Natural, warm, conversational 1-2 sentence response tailored directly to what the user just said. Do NOT invent or mention an appointment slot in aiReply."
}`;

    const userPayload = args.conversationContext
      ? `Recent conversation:\n${args.conversationContext}\n\nLatest Inbound (${args.channel}): "${args.message}"`
      : `Inbound (${args.channel}): "${args.message}"`;

    let parsed: {
      patientName: string;
      contactInfo: string;
      serviceRequested: string;
      urgency: string;
      insuranceProvider: string;
      qualificationScore: number;
      status: string;
      aiSummary: string;
      aiReply: string;
    } | null = null;

    try {
      if (groqKey) {
        const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${groqKey}`,
          },
          body: JSON.stringify({
            model: "llama-3.3-70b-versatile",
            response_format: { type: "json_object" },
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPayload },
            ],
          }),
        });
        const data = await res.json();
        const rawText = data?.choices?.[0]?.message?.content;
        if (rawText) parsed = JSON.parse(rawText);
      } else if (geminiKey) {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ parts: [{ text: `${systemPrompt}\n\n${userPayload}` }] }],
              generationConfig: { responseMimeType: "application/json" },
            }),
          }
        );
        const data = await res.json();
        const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (rawText) parsed = JSON.parse(rawText);
      }
    } catch (err) {
      console.error("LLM call failed, falling back to deterministic parser:", err);
    }

    if (!parsed) {
      const lower = args.message.toLowerCase().trim();
      const isRefusal =
        lower.includes("don't want") ||
        lower.includes("dont want") ||
        lower.includes("no thanks") ||
        lower.includes("cancel");
      const isGreetingOnly = ["hi", "hey", "hello", "yo", "hola"].includes(lower.replace(/[!?.]/g, ""));
      const isUrgent =
        lower.includes("pain") ||
        lower.includes("broke") ||
        lower.includes("emergency") ||
        lower.includes("crown");
      const isSpam =
        lower.includes("seo") ||
        lower.includes("marketing agency") ||
        lower.includes("unsubscribe");

      const nonBooking = isRefusal || isGreetingOnly || isSpam;

      parsed = {
        patientName: lower.includes("sarah")
          ? "Sarah Miller"
          : lower.includes("david")
          ? "David Chen"
          : "New Visitor",
        contactInfo: "(512) 555-0182",
        serviceRequested: isRefusal
          ? "Declined Appointment"
          : isGreetingOnly
          ? "Initial Greeting"
          : isUrgent
          ? "Emergency Crown / Pain Relief"
          : isSpam
          ? "Vendor Solicitation"
          : "Comprehensive Exam & Cleaning",
        urgency: isUrgent ? "Emergency" : "Routine",
        insuranceProvider: lower.includes("delta")
          ? "Delta Dental PPO"
          : lower.includes("aetna")
          ? "Aetna PPO"
          : "Self-Pay / Unverified",
        qualificationScore: nonBooking ? 15 : isUrgent ? 94 : 78,
        status: nonBooking ? "Disqualified" : "Needs Follow-Up",
        aiSummary: isRefusal
          ? "Visitor stated they do not want an appointment."
          : isGreetingOnly
          ? "Visitor sent an opening greeting without specifying a dental need."
          : isSpam
          ? "Outbound B2B vendor pitch filtered out automatically."
          : `Inbound ${args.channel} lead requesting ${isUrgent ? "urgent" : "standard"} dental care.`,
        aiReply: isRefusal
          ? "No problem at all! If you ever need dental care or have questions in the future, just reach out."
          : isGreetingOnly
          ? "Hi there! How can BrightSmile Dental help you today—are you looking to schedule a visit or ask a question?"
          : isSpam
          ? "Thanks for reaching out, though we aren't looking for outside vendor services right now."
          : "Hi! Thanks for contacting BrightSmile Dental—we accept most major PPO plans and would love to get you taken care of.",
      };
    }

    const result: { leadId: Id<"leads">; bookedSlotLabel?: string; finalReply: string } =
      await ctx.runMutation(api.frontdesk.commitQualifiedIntake, {
        prospectMessage: args.message,
        channel: args.channel,
        ...parsed,
        autoBookSlot: args.autoBook,
      });

    return {
      leadId: result.leadId,
      bookedSlotLabel: result.bookedSlotLabel,
      aiReply: result.finalReply,
    };
  },
});