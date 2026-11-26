"use client";

import { useEffect, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Bot, CalendarCheck, CheckCircle2, Clock, MessageSquare, PhoneCall, RefreshCw, Send, Sparkles, UserCheck } from "lucide-react";

const SAMPLE_INQUIRIES = [
  {
    label: "Emergency Crown (High Intent)",
    channel: "SMS",
    text: "Hi, I'm Sarah Miller. My crown just cracked and I have sharp pain—do you take Delta Dental PPO and have anything tomorrow morning?",
  },
  {
    label: "Invisalign Consult (Web Chat)",
    channel: "Web Chat",
    text: "Hey there, David Chen here. Looking to get a quote for Invisalign aligners next week. I have Aetna insurance.",
  },
  {
    label: "Spam Vendor Pitch (Filter Test)",
    channel: "Web Chat",
    text: "Hi clinic owner! Our marketing agency can 10x your Google SEO rankings—want to hop on a call?",
  },
];

export default function PulseDeskDashboard() {
  const dashboard = useQuery(api.frontdesk.getDashboardState);
  const seedSlots = useMutation(api.frontdesk.seedClinicSlots);
  const resetDemo = useMutation(api.frontdesk.resetDemoData);
  const processInquiry = useAction(api.frontdesk.processInboundInquiry);

  const [message, setMessage] = useState(SAMPLE_INQUIRIES[0].text);
  const [channel, setChannel] = useState("SMS");
  const [autoBook, setAutoBook] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    if (dashboard && dashboard.appointments.length === 0) {
      seedSlots();
    }
  }, [dashboard, seedSlots]);

  const handleSimulate = async () => {
    if (!message.trim() || isProcessing) return;
    setIsProcessing(true);
    try {
      await processInquiry({ message, channel, autoBook });
      setMessage("");
    } finally {
      setIsProcessing(false);
    }
  };

  const leads = dashboard?.leads ?? [];
  const appointments = dashboard?.appointments ?? [];
  const messages = dashboard?.messages ?? [];

  const bookedCount = appointments.filter((a) => a.isBooked).length;
  const qualifiedCount = leads.filter((l) => l.qualificationScore >= 65).length;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Top Bar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="h-9 w-9 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                <Bot className="h-5 w-5" />
              </div>
              <h1 className="text-2xl font-bold tracking-tight">PulseDesk AI</h1>
              <Badge className="bg-emerald-500/15 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/20">
                Convex Reactive Engine · Live
              </Badge>
            </div>
            <p className="text-slate-400 text-sm mt-1">
              24/7 Autonomous AI Front Desk · Instant Lead Qualification &amp; ACID Calendar Booking
            </p>
          </div>

          <div className="flex items-center gap-3">
            <a
              href="/widget"
              target="_blank"
              rel="noreferrer"
              className="text-xs px-3 py-2 rounded-md bg-emerald-600/20 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-600/30 transition font-medium"
            >
              Open Patient Chat Widget
            </a>
            <Button
              variant="outline"
              size="sm"
              className="border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800"
              onClick={() => resetDemo()}
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Reset Demo
            </Button>
          </div>
        </div>

        {/* Live KPI Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card className="bg-slate-900 border-slate-800 text-slate-100">
            <CardContent className="pt-6 flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-wider text-slate-400">Inbound Leads Processed</p>
                <p className="text-3xl font-bold mt-1">{leads.length}</p>
              </div>
              <MessageSquare className="h-8 w-8 text-sky-400 opacity-80" />
            </CardContent>
          </Card>

          <Card className="bg-slate-900 border-slate-800 text-slate-100">
            <CardContent className="pt-6 flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-wider text-slate-400">Qualified Opportunities</p>
                <p className="text-3xl font-bold mt-1 text-emerald-400">{qualifiedCount}</p>
              </div>
              <UserCheck className="h-8 w-8 text-emerald-400 opacity-80" />
            </CardContent>
          </Card>

          <Card className="bg-slate-900 border-slate-800 text-slate-100">
            <CardContent className="pt-6 flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-wider text-slate-400">Slots Booked Autonomously</p>
                <p className="text-3xl font-bold mt-1 text-amber-400">
                  {bookedCount} <span className="text-sm font-normal text-slate-400">/ {appointments.length}</span>
                </p>
              </div>
              <CalendarCheck className="h-8 w-8 text-amber-400 opacity-80" />
            </CardContent>
          </Card>
        </div>

        {/* Main Split Workspace */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Prospect Simulator & Live Transcript */}
          <div className="lg:col-span-5 space-y-6">
            <Card className="bg-slate-900 border-slate-800 text-slate-100">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <PhoneCall className="h-4 w-4 text-emerald-400" />
                  Inbound Prospect Simulator
                </CardTitle>
                <CardDescription className="text-slate-400">
                  Test how the AI front desk qualifies intent, checks insurance, and locks a calendar slot in real time.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  {SAMPLE_INQUIRIES.map((sample) => (
                    <button
                      key={sample.label}
                      type="button"
                      onClick={() => {
                        setMessage(sample.text);
                        setChannel(sample.channel);
                      }}
                      className="text-xs px-2.5 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
                    >
                      {sample.label}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-2 text-xs">
                  <span className="text-slate-400">Channel:</span>
                  {["SMS", "Web Chat", "Phone Transcript"].map((ch) => (
                    <button
                      key={ch}
                      type="button"
                      onClick={() => setChannel(ch)}
                      className={`px-2.5 py-1 rounded ${
                        channel === ch
                          ? "bg-emerald-600 text-white font-medium"
                          : "bg-slate-800 text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      {ch}
                    </button>
                  ))}
                </div>

                <Textarea
                  rows={4}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Type an inbound patient/customer message..."
                  className="bg-slate-950 border-slate-800 text-slate-100 placeholder:text-slate-500"
                />

                <div className="flex items-center justify-between pt-1">
                  <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={autoBook}
                      onChange={(e) => setAutoBook(e.target.checked)}
                      className="rounded border-slate-700 bg-slate-950"
                    />
                    Auto-book open slot if score &ge; 65
                  </label>

                  <Button
                    onClick={handleSimulate}
                    disabled={isProcessing || !message.trim()}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white"
                  >
                    {isProcessing ? (
                      <>
                        <Sparkles className="h-4 w-4 mr-2 animate-spin" />
                        Qualifying...
                      </>
                    ) : (
                      <>
                        <Send className="h-4 w-4 mr-2" />
                        Send Inbound
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Live AI Conversation Feed */}
            <Card className="bg-slate-900 border-slate-800 text-slate-100">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Live Front-Desk Conversation Log</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 max-h-[340px] overflow-y-auto">
                {messages.length === 0 ? (
                  <p className="text-sm text-slate-500 text-center py-8">
                    No messages yet. Send an inbound inquiry above to trigger the AI agent.
                  </p>
                ) : (
                  messages.map((m) => (
                    <div
                      key={m._id}
                      className={`p-3 rounded-lg text-sm ${
                        m.sender === "AI Front Desk"
                          ? "bg-emerald-950/50 border border-emerald-800/50 ml-4"
                          : "bg-slate-800/80 border border-slate-700 mr-4"
                      }`}
                    >
                      <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                        <span className="font-semibold text-slate-200">{m.sender}</span>
                        <span>{m.channel}</span>
                      </div>
                      <p className="text-slate-200 leading-relaxed">{m.body}</p>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right Column: Reactive CRM Table & Appointment Grid */}
          <div className="lg:col-span-7">
            <Tabs defaultValue="crm" className="w-full">
              <TabsList className="bg-slate-900 border border-slate-800">
                <TabsTrigger value="crm">Live Qualified CRM ({leads.length})</TabsTrigger>
                <TabsTrigger value="calendar">Provider Schedule ({bookedCount}/{appointments.length} Booked)</TabsTrigger>
              </TabsList>

              <TabsContent value="crm" className="mt-4">
                <Card className="bg-slate-900 border-slate-800 text-slate-100">
                  <CardHeader>
                    <CardTitle className="text-lg">Real-Time Lead Pipeline</CardTitle>
                    <CardDescription className="text-slate-400">
                      Powered by Convex reactive queries (<code className="text-emerald-400">useQuery</code>) — updates instantaneously with zero polling.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {leads.length === 0 ? (
                      <div className="text-center py-12 text-slate-500 text-sm">
                        CRM queue is empty. Simulate an inbound inquiry on the left to watch a row appear live.
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow className="border-slate-800 hover:bg-transparent">
                              <TableHead className="text-slate-400">Prospect</TableHead>
                              <TableHead className="text-slate-400">Service &amp; Insurance</TableHead>
                              <TableHead className="text-slate-400">Score</TableHead>
                              <TableHead className="text-slate-400">Status &amp; Slot</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {leads.map((lead) => (
                              <TableRow key={lead._id} className="border-slate-800 hover:bg-slate-800/40">
                                <TableCell>
                                  <div className="font-medium text-slate-100">{lead.patientName}</div>
                                  <div className="text-xs text-slate-400">{lead.channel} · {lead.contactInfo}</div>
                                </TableCell>
                                <TableCell>
                                  <div className="text-sm text-slate-200">{lead.serviceRequested}</div>
                                  <div className="text-xs text-slate-400">
                                    {lead.insuranceProvider} · <span className="text-amber-300">{lead.urgency}</span>
                                  </div>
                                  <div className="text-xs text-slate-500 mt-1 max-w-xs">{lead.aiSummary}</div>
                                </TableCell>
                                <TableCell>
                                  <Badge
                                    className={
                                      lead.qualificationScore >= 80
                                        ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
                                        : lead.qualificationScore >= 65
                                        ? "bg-sky-500/20 text-sky-300 border-sky-500/30"
                                        : "bg-rose-500/20 text-rose-300 border-rose-500/30"
                                    }
                                  >
                                    {lead.qualificationScore}/100
                                  </Badge>
                                </TableCell>
                                <TableCell>
                                  <div className="text-xs font-medium text-slate-200">{lead.status}</div>
                                  {lead.bookedSlot && (
                                    <div className="text-xs text-emerald-400 mt-1 flex items-center gap-1">
                                      <CheckCircle2 className="h-3.5 w-3.5" />
                                      {lead.bookedSlot}
                                    </div>
                                  )}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="calendar" className="mt-4">
                <Card className="bg-slate-900 border-slate-800 text-slate-100">
                  <CardHeader>
                    <CardTitle className="text-lg">Clinic Provider Availability</CardTitle>
                    <CardDescription className="text-slate-400">
                      Protected by Convex ACID transactions to prevent concurrent double-booking.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {appointments.map((slot) => (
                      <div
                        key={slot._id}
                        className={`p-4 rounded-lg border ${
                          slot.isBooked
                            ? "bg-emerald-950/30 border-emerald-700/50"
                            : "bg-slate-950 border-slate-800"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-sm flex items-center gap-1.5">
                            <Clock className="h-4 w-4 text-slate-400" />
                            {slot.slotLabel}
                          </span>
                          <Badge
                            variant="outline"
                            className={
                              slot.isBooked
                                ? "border-emerald-500/50 text-emerald-300"
                                : "border-slate-700 text-slate-400"
                            }
                          >
                            {slot.isBooked ? "Booked" : "Open"}
                          </Badge>
                        </div>
                        <p className="text-xs text-slate-400 mt-1">{slot.providerName}</p>
                        {slot.isBooked && (
                          <div className="mt-2 pt-2 border-t border-emerald-800/40 text-xs text-emerald-300">
                            Patient: <span className="font-semibold">{slot.patientName}</span> ({slot.serviceType})
                          </div>
                        )}
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>
    </div>
  );
}