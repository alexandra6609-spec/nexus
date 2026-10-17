"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { RotateCcw, Send, Smartphone } from "lucide-react";
import { buttonClass, inputClass, secondaryButtonClass } from "../components/ui";
import { SYNC_URL } from "../lib/directory";
import { defaultTransport, syncNow } from "../lib/sync";

type Message = { from: "patient" | "bot"; text: string };

/**
 * Demo only: stands in for a patient's basic phone. Posts to the hub exactly
 * what a GSM modem or SMS gateway will post later.
 */
export default function SmsSimulatorView() {
  const [phone, setPhone] = useState("+15550001");
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "nearest" });
  }, [messages]);

  async function send(text: string) {
    if (!text.trim() || sending) return;
    setSending(true);
    setError("");
    setMessages((m) => [...m, { from: "patient", text }]);
    setDraft("");
    try {
      const response = await fetch(`${SYNC_URL.replace(/\/$/, "")}/v1/sms/inbound`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from: phone, text }),
      });
      if (!response.ok) throw new Error(`Hub answered ${response.status}`);
      const { replies } = (await response.json()) as { replies: string[] };
      setMessages((m) => [...m, ...replies.map((r) => ({ from: "bot" as const, text: r }))]);
      // A new code: pull it now so it shows under Triage without waiting.
      const transport = defaultTransport();
      if (transport && replies.some((r) => r.startsWith("CODE "))) void syncNow(transport);
    } catch {
      setError("Could not reach the hub. Is it running?");
    } finally {
      setSending(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void send(draft);
  }

  return (
    <section id="sms" className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-start gap-3">
        <Smartphone size={19} className="mt-0.5 text-teal-700" />
        <div>
          <h2 className="font-bold text-[#101B35]">SMS bot simulator</h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            Pretend to be a patient texting the clinic hub. Uses demo triage
            rules, not a clinical protocol. Text anything to start, then reply
            with numbers.
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-sm rounded-2xl border-4 border-slate-800 bg-slate-100">
        <div className="flex items-center gap-2 border-b border-slate-300 px-3 py-2">
          <input
            className={`${inputClass} py-1 font-mono text-xs`}
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            aria-label="Patient phone number"
          />
          <button
            type="button"
            className={`${secondaryButtonClass} px-2 py-1`}
            onClick={() => {
              setMessages([]);
              void send("RESET");
            }}
            title="Start over"
            aria-label="Start over"
          >
            <RotateCcw size={14} />
          </button>
        </div>

        <div className="h-96 space-y-2 overflow-y-auto p-3" aria-live="polite">
          {messages.length === 0 && (
            <p className="pt-20 text-center text-xs text-slate-500">No messages yet.</p>
          )}
          {messages.map((message, index) => (
            <p
              key={index}
              className={`max-w-[85%] whitespace-pre-line rounded-xl px-3 py-2 text-sm ${
                message.from === "patient"
                  ? "ml-auto bg-teal-700 text-white"
                  : "bg-white text-slate-800 shadow-sm"
              }`}
            >
              {message.text}
            </p>
          ))}
          <div ref={bottom} />
        </div>

        {error && <p className="px-3 pb-2 text-xs font-medium text-red-700">{error}</p>}

        <form onSubmit={submit} className="flex gap-2 border-t border-slate-300 p-2">
          <input
            className={inputClass}
            value={draft}
            maxLength={160}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Text message"
            aria-label="Text message"
          />
          <button type="submit" className={buttonClass} disabled={sending || !draft.trim()}>
            <Send size={15} />
          </button>
        </form>
      </div>
    </section>
  );
}
