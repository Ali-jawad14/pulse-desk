import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  leads: defineTable({
    patientName: v.string(),
    contactInfo: v.string(),
    channel: v.string(), // "SMS" | "Web Chat" | "Phone Transcript"
    serviceRequested: v.string(),
    urgency: v.string(), // "Emergency" | "High" | "Routine"
    insuranceProvider: v.string(),
    qualificationScore: v.number(), // 0 - 100
    status: v.string(), // "Qualified & Booked" | "Needs Follow-Up" | "Disqualified"
    aiSummary: v.string(),
    bookedSlot: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_createdAt", ["createdAt"]),

  appointments: defineTable({
    slotLabel: v.string(), // e.g., "Tomorrow · 9:00 AM EST"
    providerName: v.string(),
    isBooked: v.boolean(),
    leadId: v.optional(v.id("leads")),
    patientName: v.optional(v.string()),
    serviceType: v.optional(v.string()),
  }).index("by_isBooked", ["isBooked"]),

  messages: defineTable({
    leadId: v.optional(v.id("leads")),
    sender: v.string(), // "Prospect" | "AI Front Desk"
    channel: v.string(),
    body: v.string(),
    timestamp: v.number(),
  }).index("by_timestamp", ["timestamp"]),
});