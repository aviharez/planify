"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import type { PlanifyCalendarEvent } from "./types";

const WEEKDAYS = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];
const CATEGORY_LABELS = { class: "Kuliah", study: "Belajar", assignment: "Tugas", quiz: "Kuis", exam: "Ujian", presentation: "Presentasi", project: "Proyek", other: "Agenda" } as const;
const CATEGORY_COLORS = { class: "border-moss bg-sage text-moss", study: "border-coral bg-coral/10 text-coral", assignment: "border-amber-600 bg-amber-50 text-amber-800", quiz: "border-violet-500 bg-violet-50 text-violet-800", exam: "border-rose-600 bg-rose-50 text-rose-800", presentation: "border-sky-600 bg-sky-50 text-sky-800", project: "border-indigo-600 bg-indigo-50 text-indigo-800", other: "border-ink/30 bg-sand text-ink" } as const;

function addDays(date: string, offset: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + offset);
  return value.toISOString().slice(0, 10);
}

function weekStart(date: string) {
  const value = new Date(`${date}T12:00:00Z`);
  const day = value.getUTCDay();
  value.setUTCDate(value.getUTCDate() + (day === 0 ? -6 : 1 - day));
  return value.toISOString().slice(0, 10);
}

function formatDay(date: string, options: Intl.DateTimeFormatOptions = { weekday: "long", day: "numeric", month: "long" }) {
  return new Intl.DateTimeFormat("id-ID", { ...options, timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
}

function formatRange(start: string, end: string) {
  return `${formatDay(start, { day: "numeric", month: "long" })} – ${formatDay(end, { day: "numeric", month: "long", year: "numeric" })}`;
}

function EventButton({ event, onSelect }: { event: PlanifyCalendarEvent; onSelect: (event: PlanifyCalendarEvent) => void }) {
  return <button type="button" onClick={() => onSelect(event)} className={`group w-full rounded-lg border-l-2 px-2 py-1.5 text-left text-xs transition hover:-translate-y-0.5 hover:shadow-sm ${CATEGORY_COLORS[event.category]}`} aria-label={`${event.title}, ${event.startTime ? `${event.startTime} sampai ${event.endTime}` : "seharian"}`}><span className="block truncate font-semibold">{event.title}</span>{event.startTime && <span className="mt-0.5 block opacity-70">{event.startTime}–{event.endTime}</span>}</button>;
}

function timeMinutes(value: string | undefined) {
  if (!value) return Number.NaN;
  const [hour, minute] = value.split(":").map(Number);
  return Number.isFinite(hour) && Number.isFinite(minute) ? hour * 60 + minute : Number.NaN;
}

const GRID_START = 6 * 60;
const GRID_END = 24 * 60;
const HOUR_HEIGHT = 52;
const HEADER_HEIGHT = 56;

function WeekTimeGrid({ dates, events, selectedDate, onSelectDate, onSelectEvent }: { dates: string[]; events: PlanifyCalendarEvent[]; selectedDate: string; onSelectDate: (date: string) => void; onSelectEvent: (event: PlanifyCalendarEvent) => void }) {
  const hours = Array.from({ length: 19 }, (_, index) => GRID_START + index * 60);
  const gridHeight = (GRID_END - GRID_START) / 60 * HOUR_HEIGHT;
  const columnHeight = HEADER_HEIGHT + gridHeight;
  return <div className="mt-6 hidden overflow-x-auto lg:block"><div className="grid min-w-[760px] grid-cols-[4rem_repeat(7,minmax(0,1fr))] gap-px rounded-xl bg-ink/10"><div className="relative bg-cream" style={{ height: columnHeight }}>{hours.map((minute) => <span key={minute} className="absolute right-2 text-[10px] text-ink/45" style={{ top: HEADER_HEIGHT + (minute - GRID_START) / 60 * HOUR_HEIGHT - 7 }}>{`${String(Math.floor(minute / 60)).padStart(2, "0")}.00`}</span>)}</div>{dates.map((date, index) => { const dayEvents = events.filter((event) => event.date === date); return <div key={date} className={`relative bg-cream/80 ${date === selectedDate ? "bg-sage/50" : ""}`} style={{ height: columnHeight }}><button type="button" onClick={() => onSelectDate(date)} className="absolute inset-x-0 top-0 z-20 border-b border-ink/10 bg-white/70 px-2 py-2 text-left"><span className="block text-[10px] font-semibold uppercase text-ink/50">{WEEKDAYS[index]}</span><span className={`mt-1 inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${date === selectedDate ? "bg-coral text-white" : "text-ink"}`}>{Number(date.slice(-2))}</span></button>{hours.map((minute) => <span key={minute} className="pointer-events-none absolute inset-x-0 border-t border-ink/10" style={{ top: HEADER_HEIGHT + (minute - GRID_START) / 60 * HOUR_HEIGHT }} />)}<div className="absolute inset-x-0" style={{ top: HEADER_HEIGHT, height: gridHeight }}>{dayEvents.map((event) => { const start = timeMinutes(event.startTime); const end = timeMinutes(event.endTime); const hasTime = Number.isFinite(start) && Number.isFinite(end) && end > start; const clampedStart = Math.max(GRID_START, Math.min(GRID_END - 15, start)); const clampedEnd = Math.max(clampedStart + 15, Math.min(GRID_END, end)); const top = hasTime ? (clampedStart - GRID_START) / 60 * HOUR_HEIGHT : 4; const height = hasTime ? Math.max(28, (clampedEnd - clampedStart) / 60 * HOUR_HEIGHT) : 28; return <div key={event.id} className="absolute inset-x-1 z-10" style={{ top, height }}><EventButton event={event} onSelect={onSelectEvent} /></div>; })}</div></div>; })}</div></div>;
}

function Agenda({ date, events, onSelect }: { date: string; events: PlanifyCalendarEvent[]; onSelect: (event: PlanifyCalendarEvent) => void }) {
  const grouped = events.filter((event) => event.date === date).sort((a, b) => `${a.startTime ?? "99:99"}|${a.title}`.localeCompare(`${b.startTime ?? "99:99"}|${b.title}`));
  return <section aria-labelledby={`agenda-${date}`}><h3 id={`agenda-${date}`} className="text-xs font-bold uppercase tracking-[0.12em] text-ink/55">{formatDay(date)}</h3>{grouped.length ? <div className="mt-3 space-y-2">{grouped.map((event) => <EventButton key={event.id} event={event} onSelect={onSelect} />)}</div> : <p className="mt-3 rounded-xl bg-sand/70 p-4 text-sm text-ink/55">Tidak ada jadwal pada hari ini.</p>}</section>;
}

function EventDetail({ event, onClose }: { event: PlanifyCalendarEvent; onClose: () => void }) {
  return <div className="fixed inset-0 z-40 grid place-items-end bg-ink/30 p-3 sm:place-items-center" role="presentation" onClick={onClose}><section role="dialog" aria-modal="true" aria-labelledby="calendar-event-title" onClick={(eventClick) => eventClick.stopPropagation()} className="w-full max-w-md rounded-[1.5rem] bg-cream p-6 shadow-2xl"><div className="flex items-start justify-between gap-4"><div><p className="text-sm font-semibold text-coral">{CATEGORY_LABELS[event.category]} · {event.source === "google" ? "Google Calendar" : "Planify"}</p><h2 id="calendar-event-title" className="mt-2 text-2xl font-bold tracking-[-0.04em]">{event.title}</h2></div><button type="button" onClick={onClose} className="grid h-10 w-10 place-items-center rounded-full border border-ink/15" aria-label="Tutup detail kegiatan"><X size={18} /></button></div><p className="mt-5 text-sm font-semibold">{formatDay(event.date)}{event.startTime ? ` · ${event.startTime}–${event.endTime}` : ""}</p>{event.courseName && <p className="mt-2 text-sm text-ink/65">{event.courseName}</p>}{event.details && <p className="mt-4 whitespace-pre-line rounded-xl bg-white/70 p-4 text-sm leading-6 text-ink/70">{event.details}</p>}{event.source === "google" && <p className="mt-4 text-xs text-ink/55">Kegiatan Google Calendar hanya dapat dilihat di Planify.</p>}</section></div>;
}

export default function CalendarView({ events, initialDate, range }: { events: PlanifyCalendarEvent[]; initialDate: string; range: { start: string; end: string } }) {
  const [mode, setMode] = useState<"week" | "month">("week");
  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [selectedEvent, setSelectedEvent] = useState<PlanifyCalendarEvent | null>(null);
  const currentWeek = weekStart(selectedDate);
  const weekDates = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(currentWeek, index)), [currentWeek]);
  const monthDate = new Date(`${selectedDate}T12:00:00Z`);
  const monthStart = new Date(Date.UTC(monthDate.getUTCFullYear(), monthDate.getUTCMonth(), 1));
  const monthGridStart = addDays(monthStart.toISOString().slice(0, 10), monthStart.getUTCDay() === 0 ? -6 : 1 - monthStart.getUTCDay());
  const monthDates: string[] = Array.from({ length: 42 }, (_, index) => addDays(monthGridStart, index));
  const monthTitle = new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric", timeZone: "UTC" }).format(monthDate);
  const eventDates = new Set(events.map((event) => event.date));
  const firstWeek = weekStart(range.start);
  const lastWeek = weekStart(range.end);
  const selectedMonth = selectedDate.slice(0, 7);
  const firstMonth = range.start.slice(0, 7);
  const lastMonth = range.end.slice(0, 7);
  const previousDisabled = mode === "week" ? currentWeek <= firstWeek : selectedMonth <= firstMonth;
  const nextDisabled = mode === "week" ? currentWeek >= lastWeek : selectedMonth >= lastMonth;
  function move(offset: number) {
    if (mode === "week") {
      const candidate = addDays(currentWeek, offset * 7);
      if (candidate < firstWeek || candidate > lastWeek) return;
      setSelectedDate(candidate < range.start ? range.start : candidate);
      return;
    }
    const next = new Date(`${selectedDate}T12:00:00Z`);
    next.setUTCMonth(next.getUTCMonth() + offset);
    const candidate = next.toISOString().slice(0, 10);
    if (candidate.slice(0, 7) < firstMonth || candidate.slice(0, 7) > lastMonth) return;
    setSelectedDate(candidate < range.start ? range.start : candidate > range.end ? range.end : candidate);
  }
  return <div className="rounded-[1.75rem] border border-ink/10 bg-white/75 p-4 sm:p-6" aria-label="Kalender Planify"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-semibold text-moss">Kalender Planify</p><h2 className="mt-1 text-2xl font-bold capitalize tracking-[-0.04em]">{mode === "week" ? formatRange(weekDates[0], weekDates[6]) : monthTitle}</h2></div><div className="flex items-center gap-2"><button type="button" disabled={previousDisabled} onClick={() => move(-1)} className="grid h-10 w-10 place-items-center rounded-full border border-ink/15 disabled:cursor-not-allowed disabled:opacity-30" aria-label="Periode sebelumnya"><ChevronLeft size={17} /></button><div className="flex rounded-xl border border-ink/10 bg-cream p-1"><button type="button" aria-pressed={mode === "week"} onClick={() => setMode("week")} className={`min-h-9 rounded-lg px-3 text-sm font-semibold ${mode === "week" ? "bg-moss text-cream" : "text-ink/60"}`}>Minggu</button><button type="button" aria-pressed={mode === "month"} onClick={() => setMode("month")} className={`min-h-9 rounded-lg px-3 text-sm font-semibold ${mode === "month" ? "bg-moss text-cream" : "text-ink/60"}`}>Bulan</button></div><button type="button" disabled={nextDisabled} onClick={() => move(1)} className="grid h-10 w-10 place-items-center rounded-full border border-ink/15 disabled:cursor-not-allowed disabled:opacity-30" aria-label="Periode berikutnya"><ChevronRight size={17} /></button></div></div><div className="mt-5 flex flex-wrap gap-2" aria-label="Keterangan kategori">{(["class", "study", "assignment", "exam"] as const).map((category) => <span key={category} className="inline-flex items-center gap-1.5 text-xs text-ink/60"><span className={`h-2.5 w-2.5 rounded-full ${category === "class" ? "bg-moss" : category === "study" ? "bg-coral" : category === "assignment" ? "bg-amber-600" : "bg-rose-600"}`} />{CATEGORY_LABELS[category]}</span>)}</div>{mode === "week" ? <><WeekTimeGrid dates={weekDates} events={events} selectedDate={selectedDate} onSelectDate={setSelectedDate} onSelectEvent={setSelectedEvent} /><div className="mt-6 grid gap-6 lg:hidden">{weekDates.map((date) => <Agenda key={date} date={date} events={events} onSelect={setSelectedEvent} />)}</div></> : <div className="mt-6"><div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-ink/50">{WEEKDAYS.map((day) => <span key={day} className="py-2">{day}</span>)}</div><div className="grid grid-cols-7 gap-1">{monthDates.map((date) => { const currentMonth = date.slice(0, 7) === selectedDate.slice(0, 7); const outsideRange = date < range.start || date > range.end; return <button type="button" disabled={outsideRange} key={date} onClick={() => setSelectedDate(date)} className={`relative min-h-12 rounded-lg border p-1 text-left text-sm disabled:cursor-not-allowed disabled:opacity-30 ${date === selectedDate ? "border-coral bg-coral/10" : "border-transparent hover:bg-sage/40"} ${currentMonth ? "text-ink" : "text-ink/25"}`}><span className="font-semibold">{Number(date.slice(-2))}</span>{eventDates.has(date) && <span className="absolute bottom-1 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-coral" aria-label="Ada kegiatan" />}</button>; })}</div><div className="mt-6"><Agenda date={selectedDate} events={events} onSelect={setSelectedEvent} /></div></div>}{events.length === 0 && <p className="mt-5 rounded-xl bg-sand p-4 text-sm text-ink/60">Belum ada kegiatan minggu ini. Jadwal kuliah, sesi belajar, dan agenda akademik akan muncul di sini.</p>}{selectedEvent && <EventDetail event={selectedEvent} onClose={() => setSelectedEvent(null)} />}</div>;
}
