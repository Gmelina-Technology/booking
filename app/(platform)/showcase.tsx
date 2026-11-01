// Static mock-ups of the app for the home page. They mirror the real staff
// calendar and customer booking page, with sample data, so visitors can see the
// product before they sign up.

const courts = ["Court 1", "Court 2", "Court 3", "Court 4"];
const hours = ["4 PM", "5 PM", "6 PM", "7 PM", "8 PM", "9 PM"];

type Block = { court: number; start: number; span: number; name: string; status: "confirmed" | "awaiting" | "pending" | "event" };

const blocks: Block[] = [
  { court: 0, start: 0, span: 2, name: "Maria Santos", status: "confirmed" },
  { court: 0, start: 3, span: 3, name: "Friday Open Play", status: "event" },
  { court: 1, start: 1, span: 1, name: "Kenji Uy", status: "awaiting" },
  { court: 1, start: 3, span: 3, name: "Friday Open Play", status: "event" },
  { court: 2, start: 0, span: 1, name: "Leo Tan", status: "pending" },
  { court: 2, start: 2, span: 2, name: "Aria Lim", status: "confirmed" },
  { court: 3, start: 1, span: 2, name: "Nina Ong", status: "confirmed" },
  { court: 3, start: 4, span: 2, name: "Trish Lim", status: "awaiting" },
];

const blockStyle: Record<Block["status"], string> = {
  confirmed: "bg-emerald-100 text-emerald-900 border-emerald-300",
  awaiting: "bg-amber-50 text-amber-900 border-amber-300",
  pending: "bg-sky-50 text-sky-900 border-sky-300 border-dashed",
  event: "bg-lime-200 text-emerald-950 border-lime-400",
};

export const statusLegend: { status: Block["status"]; label: string }[] = [
  { status: "pending", label: "New request" },
  { status: "awaiting", label: "Awaiting payment" },
  { status: "confirmed", label: "Confirmed" },
  { status: "event", label: "Event" },
];

// Phones show the first three courts, which between them have every status, so
// the mock fits without scrolling sideways.
const PHONE_COURTS = 3;
const phoneHidden = (court: number) => (court >= PHONE_COURTS ? "hidden sm:block" : "");
const calendarCols = "grid-cols-[3rem_repeat(3,1fr)] sm:grid-cols-[3.5rem_repeat(4,1fr)]";

/** Browser-framed mock of the staff day calendar: courts across, hours down. A picture to screen readers. */
export function CalendarMock() {
  return (
    <div
      role="img"
      aria-label="Preview of the staff calendar: one day of bookings across four courts, each coloured by status"
      className="select-none overflow-hidden rounded-2xl border border-black/10 bg-white text-foreground shadow-2xl shadow-emerald-950/20"
    >
      <div className="flex items-center gap-2 border-b border-black/5 bg-stone-50 px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-black/15" />
        <span className="h-2.5 w-2.5 rounded-full bg-black/15" />
        <span className="h-2.5 w-2.5 rounded-full bg-black/15" />
        <span className="ml-3 truncate rounded-md bg-white px-3 py-0.5 text-xs text-black/40">courtside / app · Bookings</span>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-4">
        <div>
          <p className="text-lg font-bold tracking-tight">Bookings</p>
          <p className="text-xs text-black/50">Friday, Jul 24 · Day view</p>
        </div>
        <span className="rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white">+ Create booking</span>
      </div>
      <div className="mt-3 flex gap-1 overflow-hidden px-4">
        {["F 24", "S 25", "S 26", "M 27", "T 28", "W 29", "T 30"].map((d, i) => (
          <span
            key={d}
            className={`shrink-0 rounded-lg px-2.5 py-1 text-center text-xs font-medium ${i === 0 ? "bg-emerald-700 text-white" : "bg-black/5 text-black/60"}`}
          >
            {d}
          </span>
        ))}
      </div>
      <div className="mt-4 px-4 pb-4">
        <div className={`grid text-xs ${calendarCols}`}>
          <span />
          {courts.map((c, ci) => (
            <span key={c} className={`pb-2 text-center font-semibold text-black/60 ${phoneHidden(ci)}`}>
              {c}
            </span>
          ))}
          <div className={`col-span-4 grid sm:col-span-5 ${calendarCols}`} style={{ gridTemplateRows: `repeat(${hours.length}, 2.75rem)` }}>
            {hours.map((h, i) => (
              <span key={h} className="border-t border-black/5 pr-2 pt-1 text-right text-black/40" style={{ gridRow: i + 1, gridColumn: 1 }}>
                {h}
              </span>
            ))}
            {hours.map((h, i) =>
              courts.map((c, ci) => (
                <span key={`${h}-${c}`} className={`border-t border-l border-black/5 ${phoneHidden(ci)}`} style={{ gridRow: i + 1, gridColumn: ci + 2 }} />
              )),
            )}
            {blocks.map((b) => (
              <span
                key={`${b.court}-${b.start}`}
                className={`z-10 m-0.5 overflow-hidden rounded-md border px-1.5 py-1 leading-tight ${blockStyle[b.status]} ${phoneHidden(b.court)}`}
                style={{ gridRow: `${b.start + 1} / span ${b.span}`, gridColumn: b.court + 2 }}
              >
                <span className="block truncate font-semibold">{b.name}</span>
                <span className="block truncate opacity-70">
                  {hours[b.start]} – {hours[b.start + b.span] ?? "10 PM"}
                </span>
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export type MockStatus = Block["status"];

/** A booking status as a small pill, in the same colours as the calendar mock. */
export function StatusChip({ status, label }: { status: MockStatus; label: string }) {
  return <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${blockStyle[status]}`}>{label}</span>;
}

export function LegendChips({ dark = false }: { dark?: boolean }) {
  return (
    <ul className="flex flex-wrap gap-2 text-xs font-medium">
      {statusLegend.map((s) => (
        <li key={s.status} className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 ${dark ? "bg-white/10 text-white/80" : "bg-black/5 text-black/70"}`}>
          <span className={`h-2.5 w-2.5 rounded-sm border ${blockStyle[s.status]}`} />
          {s.label}
        </li>
      ))}
    </ul>
  );
}

/** Phone-framed mock of a customer's view: pick a time, then pay the downpayment by QR. */
export function PhoneMock() {
  const slots = ["5 PM", "6 PM", "7 PM", "8 PM", "9 PM", "10 PM"];
  return (
    <div
      role="img"
      aria-label="Preview of a customer booking on a phone: pick a day and a start time, then request with a downpayment by QR"
      className="mx-auto w-[260px] select-none rounded-[2.5rem] border-[10px] border-emerald-950 bg-emerald-950 shadow-2xl shadow-emerald-950/30"
    >
      <div className="overflow-hidden rounded-[1.8rem] bg-[#f7f8f4]">
        <div className="flex justify-between px-5 pt-3 text-[10px] font-semibold text-black/70">
          <span>9:41</span>
          <span>●●● ▮</span>
        </div>
        <div className="mx-3 mt-3 rounded-2xl bg-gradient-to-br from-lime-400 to-emerald-600 p-4 text-white">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-white/80">@courtsidehub</p>
          <p className="mt-1 text-lg font-bold leading-tight">🏓 Pickleball</p>
          <p className="text-xs text-white/85">₱300 / hour · Up to 4 players</p>
        </div>
        <div className="px-3 pt-3">
          <p className="text-[11px] font-semibold text-black/60">Pick a day</p>
          <div className="mt-1.5 flex gap-1">
            {["Fri\n24", "Sat\n25", "Sun\n26", "Mon\n27"].map((d, i) => (
              <span
                key={d}
                className={`flex-1 whitespace-pre-line rounded-lg py-1 text-center text-[10px] font-semibold leading-tight ${i === 1 ? "bg-emerald-700 text-white" : "bg-white text-black/60"}`}
              >
                {d}
              </span>
            ))}
          </div>
          <p className="mt-3 text-[11px] font-semibold text-black/60">Start time</p>
          <div className="mt-1.5 grid grid-cols-3 gap-1">
            {slots.map((s, i) => (
              <span
                key={s}
                className={`rounded-lg py-1.5 text-center text-[10px] font-semibold ${
                  i === 1 ? "bg-emerald-700 text-white" : i === 3 ? "bg-black/5 text-black/25 line-through" : "bg-white text-black/70"
                }`}
              >
                {s}
              </span>
            ))}
          </div>
          <div className="mt-3 rounded-xl bg-white p-3 text-[11px]">
            <div className="flex justify-between text-black/60">
              <span>Court 2 · 6 – 8 PM</span>
              <span>₱600</span>
            </div>
            <div className="mt-1 flex justify-between font-semibold">
              <span>Downpayment by QR</span>
              <span className="text-emerald-700">₱300</span>
            </div>
          </div>
          <span className="mb-4 mt-3 block rounded-xl bg-emerald-700 py-2.5 text-center text-xs font-semibold text-white">Request booking</span>
        </div>
      </div>
    </div>
  );
}

/** The before picture: a booking negotiated over chat with a payment screenshot. */
export function ChatMock() {
  return (
    <div
      role="img"
      aria-label="A booking over chat: the customer asks for a court, is told to send money by GCash, sends a screenshot and waits for a reply"
      className="mx-auto w-full max-w-sm select-none space-y-3 rounded-3xl bg-white p-5 text-sm shadow-xl shadow-black/5"
    >
      <p className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-sky-500 px-3.5 py-2 text-white">
        Hi! Is Court 4 free Thursday, 8 to 10 AM?
      </p>
      <p className="w-fit max-w-[85%] rounded-2xl rounded-bl-md bg-black/5 px-3.5 py-2">
        Yes po! Send ₱600 to our GCash 0917 000 0000, then a screenshot to confirm.
      </p>
      <div className="ml-auto w-fit rounded-2xl border border-black/10 bg-sky-50 px-4 py-3 text-xs text-sky-950">
        <p className="font-semibold">GCash · Sent</p>
        <p className="mt-1 text-lg font-bold">₱600.00</p>
        <p className="text-sky-950/60">Ref no. 0123 4567 8910</p>
      </div>
      <p className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-sky-500 px-3.5 py-2 text-white">Sent na. Booked na po?</p>
      <p className="w-fit max-w-[85%] rounded-2xl rounded-bl-md bg-black/5 px-3.5 py-2">Checking now, I&apos;ll update you shortly.</p>
      <p className="w-fit rounded-2xl bg-black/5 px-3.5 py-2 tracking-widest text-black/40">● ● ●</p>
    </div>
  );
}
