"use client";

import { useState } from "react";
import { useAction } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Bot, CheckCircle2, Send, Sparkles } from "lucide-react";
import Link from "next/link";

interface ChatBubble {
  sender: "patient" | "ai";
  text: string;
  bookedSlot?: string;
}

export default function PublicPatientWidget() {
  const processInquiry = useAction(api.frontdesk.processInboundInquiry);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [chat, setChat] = useState<ChatBubble[]>([
    {
      sender: "ai",
      text: "Hi! Welcome to BrightSmile Dental & Wellness. Tell me what you need help with (e.g., tooth pain, cleaning, Invisalign) and your insurance plan, and I can book your visit right away.",
    },
  ]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || sending) return;

    const historyContext = chat
      .slice(-4)
      .map((m) => `${m.sender === "patient" ? "Patient" : "Receptionist"}: ${m.text}`)
      .join("\n");

    setChat((prev) => [...prev, { sender: "patient", text: trimmed }]);
    setInput("");
    setSending(true);

    try {
      const res = await processInquiry({
        message: trimmed,
        channel: "Public Web Widget",
        autoBook: true,
        conversationContext: historyContext,
      });

      setChat((prev) => [
        ...prev,
        {
          sender: "ai",
          text: res.aiReply,
          bookedSlot: res.bookedSlotLabel,
        },
      ]);
    } catch {
      setChat((prev) => [
        ...prev,
        {
          sender: "ai",
          text: "Sorry, I hit a quick connection snag—please try sending that message again.",
        },
      ]);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-4">
      <Card className="w-full max-w-md bg-slate-900 border-slate-800 text-slate-100 shadow-2xl">
        <CardHeader className="border-b border-slate-800 pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="h-9 w-9 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
                <Bot className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-base">BrightSmile AI Receptionist</CardTitle>
                <p className="text-xs text-emerald-400">Online · Instant Scheduling</p>
              </div>
            </div>
            <Link
              href="/"
              className="text-xs text-slate-400 hover:text-emerald-300 underline underline-offset-4"
            >
              Staff CRM &rarr;
            </Link>
          </div>
        </CardHeader>

        <CardContent className="p-4 space-y-4">
          <div className="space-y-3 h-[360px] overflow-y-auto pr-1">
            {chat.map((msg, idx) => (
              <div
                key={idx}
                className={`p-3 rounded-xl text-sm leading-relaxed ${
                  msg.sender === "ai"
                    ? "bg-slate-800/90 border border-slate-700 mr-6 text-slate-100"
                    : "bg-emerald-600 text-white ml-8"
                }`}
              >
                <p>{msg.text}</p>
                {msg.bookedSlot && (
                  <div className="mt-2 pt-2 border-t border-slate-700 flex items-center gap-1.5 text-xs text-emerald-300 font-medium">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Confirmed: {msg.bookedSlot}
                  </div>
                )}
              </div>
            ))}
          </div>

          <form onSubmit={handleSend} className="flex gap-2 pt-2 border-t border-slate-800">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="e.g., I'm Ali, cracked tooth, Delta Dental..."
              className="bg-slate-950 border-slate-800 text-slate-100 placeholder:text-slate-500"
            />
            <Button
              type="submit"
              disabled={sending || !input.trim()}
              className="bg-emerald-600 hover:bg-emerald-500 text-white px-3"
            >
              {sending ? <Sparkles className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}