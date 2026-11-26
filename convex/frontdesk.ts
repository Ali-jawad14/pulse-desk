import { v } from "convex/values";
import { action, internalQuery, mutation, query } from "./_generated/server";
import { api, internal } from "./_generated/api";
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

export const getOpenSlotsInternal = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("appointments")
      .withIndex("by_isBooked", (q) => q.eq("isBooked", false))
      .collect();
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
    preferredSlotLabel: v.optional(v.string()),
  },
  handler: async (
    ctx,
    args
  ): Promise<{ leadId: Id<"leads">; bookedSlotLabel?: string; finalReply: string }> => {
    const now = Date.now();

    let bookedSlotLabel: string | undefined = undefined;
    let targetSlotId: Id<"appointments"> | undefined = undefined;

    if (args.autoBookSlot && args.qualificationScore >= 65) {
      const openSlots = await ctx.db
        .query("appointments")
        .withIndex("by_isBooked", (q) => q.eq("isBooked", false))
        .collect();

      const matchedSlot = args.preferredSlotLabel
        ? openSlots.find((s) => s.slotLabel === args.preferredSlotLabel)
        : openSlots[0];

      if (matchedSlot) {
        bookedSlotLabel = matchedSlot.slotLabel;
        targetSlotId = matchedSlot._id;
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

// 3. AI ACTION (Reads live open slots, calls Groq/Gemini, commits via ACID mutation)
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

    const openSlots = await ctx.runQuery(internal.frontdesk.getOpenSlotsInternal);
    const openSlotLabels = openSlots.map((s) => s.slotLabel);

    const combinedText = `${args.conversationContext ?? ""}\n${args.message}`.toLowerCase();
    const lower = args.message.toLowerCase().trim();

    const isRefusal =
      lower.includes("don't want") ||
      lower.includes("dont want") ||
      lower.includes("no thanks") ||
      lower.includes("cancel");
    const isSpam =
      lower.includes("seo") ||
      lower.includes("marketing agency") ||
      lower.includes("unsubscribe");

    const systemPrompt = `You are an AI Front Desk Receptionist for BrightSmile Dental & Wellness Clinic (Austin, TX).
Currently available appointment slots: ${openSlotLabels.length > 0 ? openSlotLabels.join(", ") : "None available"}.

Analyze the latest inbound message and conversation history, then return valid JSON ONLY (no markdown fences).

STRICT SCHEDULING & SCORING RULES:
- 0 to 25 (Disqualified): Greetings only ("hi", "hey"), vague intros without a dental need, explicit refusals ("i don't want an appointment"), or vendor spam.
- 30 to 60 (Needs Follow-Up):
  1) User asks for a time window that does NOT exist in available slots (for example, requesting "evening" when only morning/afternoon slots up to 04:15 PM exist). Do NOT book a mismatched slot—explain our latest slot is 04:15 PM and ask if an afternoon slot works!
  2) User asks to book without specifying what dental service they need yet.
- 65 to 100 (Qualified & Ready to Book): User specifies a clear dental need/service AND wants an appointment matching one of the available slots. Pick the exact matching string from available slots for "preferredSlotLabel".

Schema:
{
  "patientName": "string (infer from message or conversation history, else 'New Visitor')",
  "contactInfo": "string (phone/email if present, else '(512) 555-0194')",
  "serviceRequested": "string",
  "urgency": "Emergency | High | Routine",
  "insuranceProvider": "string (e.g., 'Delta Dental PPO', 'Cigna', 'Self-Pay', 'Unverified')",
  "qualificationScore": number,
  "status": "Qualified & Booked | Needs Follow-Up | Disqualified",
  "preferredSlotLabel": "exact string from available slots if qualificationScore >= 65, else empty string",
  "aiSummary": "1-sentence crisp CRM note",
  "aiReply": "Natural, direct 1-2 sentence response addressing their exact request and slot availability."
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
      preferredSlotLabel?: string;
      aiSummary: string;
      aiReply: string;
    } | null = null;

    try {
      if (groqKey) {
        const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${groqKey.trim()}`,
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
        if (!res.ok) {
          console.error("Groq HTTP error:", res.status, JSON.stringify(data));
        }
        const rawText = data?.choices?.[0]?.message?.content;
        if (rawText) parsed = JSON.parse(rawText);
      } else if (geminiKey) {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey.trim()}`,
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
      const isGreetingOnly = ["hi", "hey", "hello", "yo", "hola"].includes(
        lower.replace(/[!?.]/g, "")
      );
      const wantsEvening = lower.includes("evening") || lower.includes("night");
      const wantsAfternoon = lower.includes("afternoon") || lower.includes("pm");
      const isUrgent =
        lower.includes("pain") ||
        lower.includes("broke") ||
        lower.includes("cracked") ||
        lower.includes("emergency") ||
        lower.includes("crown");
      const hasCareType =
        isUrgent ||
        lower.includes("clean") ||
        lower.includes("invisalign") ||
        lower.includes("tooth") ||
        lower.includes("checkup") ||
        lower.includes("consult");
      const hasBookingVerb =
        lower.includes("book") || lower.includes("appointment") || lower.includes("schedule");

      const inferredName = combinedText.includes("sarah")
        ? "Sarah Miller"
        : combinedText.includes("david")
        ? "David Chen"
        : combinedText.includes("ali")
        ? "Ali"
        : "New Visitor";

      const nonBooking = isRefusal || isGreetingOnly || isSpam;

      // Match slot time window if available
      const afternoonSlot = openSlotLabels.find((s) => s.includes("PM"));
      const morningSlot = openSlotLabels.find((s) => s.includes("AM"));
      const chosenSlot = wantsAfternoon ? afternoonSlot ?? morningSlot : morningSlot ?? afternoonSlot;

      let score = 45;
      let reply =
        "Hi there! How can BrightSmile Dental help you today—what dental service are you looking for?";

      if (isRefusal) {
        score = 10;
        reply = "No problem at all! If you ever need dental care or have questions later, just reach out.";
      } else if (isSpam) {
        score = 10;
        reply = "Thanks for reaching out, though we aren't looking for outside vendor services right now.";
      } else if (wantsEvening) {
        score = 52;
        reply = `Our clinic closes after our 04:15 PM slot, so we don't have evening appointments—would ${afternoonSlot ?? "Tomorrow · 02:00 PM EST"} work for you instead, and what service do you need?`;
      } else if (hasBookingVerb && !hasCareType) {
        score = 55;
        reply = `I'd be happy to get you scheduled${inferredName !== "New Visitor" ? `, ${inferredName}` : ""}! What dental service do you need (e.g., exam & cleaning, tooth pain, or Invisalign)?`;
      } else if (isUrgent || (hasBookingVerb && hasCareType)) {
        score = isUrgent ? 94 : 80;
        reply = `Thanks${inferredName !== "New Visitor" ? `, ${inferredName}` : ""}! We accept most major PPO plans and have you covered.`;
      }

      parsed = {
        patientName: inferredName,
        contactInfo: "(512) 555-0182",
        serviceRequested: isRefusal
          ? "Declined Appointment"
          : isUrgent
          ? "Emergency Crown / Pain Relief"
          : hasCareType
          ? "Comprehensive Exam & Cleaning"
          : "General Scheduling Inquiry",
        urgency: isUrgent ? "Emergency" : "Routine",
        insuranceProvider: combinedText.includes("delta")
          ? "Delta Dental PPO"
          : combinedText.includes("aetna")
          ? "Aetna PPO"
          : "Self-Pay / Unverified",
        qualificationScore: nonBooking ? 15 : score,
        status: nonBooking ? "Disqualified" : score >= 65 ? "Qualified & Booked" : "Needs Follow-Up",
        preferredSlotLabel: score >= 65 ? chosenSlot : "",
        aiSummary: `Inbound ${args.channel} message from ${inferredName}.`,
        aiReply: reply,
      };
    }

    if (isRefusal || isSpam) {
      parsed.qualificationScore = 10;
      parsed.status = "Disqualified";
      parsed.preferredSlotLabel = "";
    }

    const result: { leadId: Id<"leads">; bookedSlotLabel?: string; finalReply: string } =
      await ctx.runMutation(api.frontdesk.commitQualifiedIntake, {
        prospectMessage: args.message,
        channel: args.channel,
        patientName: parsed.patientName,
        contactInfo: parsed.contactInfo,
        serviceRequested: parsed.serviceRequested,
        urgency: parsed.urgency,
        insuranceProvider: parsed.insuranceProvider,
        qualificationScore: parsed.qualificationScore,
        status: parsed.status,
        aiSummary: parsed.aiSummary,
        aiReply: parsed.aiReply,
        autoBookSlot: args.autoBook,
        preferredSlotLabel: parsed.preferredSlotLabel || undefined,
      });

    return {
      leadId: result.leadId,
      bookedSlotLabel: result.bookedSlotLabel,
      aiReply: result.finalReply,
    };
  },
});