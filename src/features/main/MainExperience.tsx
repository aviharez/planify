"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ArrowRight, BookOpen, CalendarDays, ChevronRight, Leaf, ListChecks, LogOut, RotateCcw, UserRound } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { dateInTimeZone } from "@/features/planning/priority";
import type { OnboardingData, StudySession, StudySessionStatus } from "@/features/onboarding/types";
import { updateStudySession } from "@/app/actions/study";
import { getCalendarOverlay } from "@/app/actions/calendar";
import { persistAdaptedPlan, saveWeeklyEvaluation } from "@/app/actions/adaptation";
import { adaptStudyPlan, type WeeklyEvaluation } from "@/features/planning/adaptation";
import { canTransitionSession, shouldAskUnderstanding, transitionSession } from "@/features/study-session/state";
import { loadMainData, saveLocalMainData, type MainData } from "./data";
import ProfileView from "@/features/profile/ProfileView";
import CalendarView from "@/features/calendar/CalendarView";
import { calendarRangeForPlan, combineCalendarEvents } from "@/features/calendar/transform";

type MainView = "hari-ini" | "rencana" | "mata-kuliah" | "profil" | "sesi";

function formatDate(date: string, timeZone: string, options: Intl.DateTimeFormatOptions = { weekday: "long", day: "numeric", month: "long" }) {
  return new Intl.DateTimeFormat("id-ID", { ...options, timeZone }).format(new Date(`${date}T12:00:00Z`));
}

function formatMinutes(minutes: number) {
  return `${Math.floor(minutes / 60)} jam${minutes % 60 ? ` ${minutes % 60} menit` : ""}`;
}

function priorityLabel(score: number) {
  return score >= 0.66 ? "Tinggi" : score >= 0.4 ? "Sedang" : "Terjaga";
}

function statusLabel(status: StudySessionStatus) {
  return status === "completed" ? "Selesai" : status === "partial" ? "Selesai sebagian" : status === "missed" ? "Tidak sempat" : "Terjadwal";
}

function weekStart(date: string) {
  const value = new Date(`${date}T12:00:00Z`);
  const day = value.getUTCDay();
  value.setUTCDate(value.getUTCDate() + (day === 0 ? -6 : 1 - day));
  return value.toISOString().slice(0, 10);
}

function nextDate(date: string, offset: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + offset);
  return value.toISOString().slice(0, 10);
}

function MotionReveal({ children }: { children: React.ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  useGSAP(() => {
    const elements = gsap.utils.toArray<HTMLElement>("[data-main-reveal]");
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      gsap.set(elements, { opacity: 1, y: 0 });
      return;
    }
    gsap.fromTo(elements, { opacity: 0.2, y: 14 }, {
      opacity: 1,
      y: 0,
      stagger: 0.08,
      duration: 0.55,
      ease: "power2.out",
    });
  }, { scope: root });
  return <div ref={root}>{children}</div>;
}

const navigationItems = [
  { key: "hari-ini", label: "Hari Ini", mobileLabel: "Hari", href: "/hari-ini", icon: CalendarDays },
  { key: "rencana", label: "Rencana", mobileLabel: "Rencana", href: "/rencana", icon: ListChecks },
  { key: "mata-kuliah", label: "Mata Kuliah", mobileLabel: "Kuliah", href: "/mata-kuliah", icon: BookOpen },
  { key: "profil", label: "Profil", mobileLabel: "Profil", href: "/profil", icon: UserRound },
] as const;

function MainNavigation({ view }: { view: MainView }) {
  return (
    <nav aria-label="Navigasi utama" className="fixed inset-x-3 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-20 mx-auto max-w-md rounded-[1.25rem] border border-ink/10 bg-cream/95 p-1.5 shadow-[0_12px_30px_rgba(23,37,31,.16)] lg:inset-x-auto lg:bottom-[calc(1.5rem+env(safe-area-inset-bottom))] lg:left-1/2 lg:w-[min(39rem,calc(100vw-2rem))] lg:max-w-none lg:-translate-x-1/2 lg:rounded-[1.25rem] lg:border-ink/20 lg:bg-ink lg:p-1.5 lg:shadow-[0_18px_45px_rgba(23,37,31,.28)]">
      <div className="grid min-w-0 grid-flow-dense grid-cols-4 gap-1 lg:gap-1.5">
        {navigationItems.map(({ key, label, mobileLabel, href, icon: Icon }) => (
          <a
            key={key}
            href={href}
            aria-label={label}
            title={label}
            className={`relative inline-flex min-h-11 min-w-0 flex-col items-center justify-center gap-1 rounded-[0.9rem] px-1.5 py-1.5 text-[10px] font-semibold leading-none transition-colors focus-visible:z-10 sm:px-2 sm:text-xs lg:flex-row lg:justify-center lg:gap-2 lg:px-3 lg:py-2.5 lg:text-sm lg:leading-normal lg:motion-safe:transition-[transform,background-color,color] lg:motion-safe:duration-200 lg:motion-safe:ease-out lg:motion-safe:hover:-translate-y-0.5 lg:motion-safe:hover:scale-[1.02] ${view === key ? "bg-moss text-cream lg:bg-cream lg:text-ink" : "text-ink/70 hover:bg-sage/60 hover:text-ink lg:text-cream/70 lg:hover:bg-cream/10 lg:hover:text-cream"}`}
            aria-current={view === key ? "page" : undefined}
          >
            <Icon size={18} strokeWidth={2} aria-hidden="true" />
            <span className="truncate lg:hidden">{mobileLabel}</span>
            <span className="hidden lg:inline">{label}</span>
          </a>
        ))}
      </div>
    </nav>
  );
}

function SessionCard({ session, action = true }: { session: StudySession; action?: boolean }) {
  return (
    <article className="group rounded-[1.5rem] border border-ink/10 bg-white/80 p-5 transition hover:-translate-y-0.5 hover:border-moss/30 hover:shadow-soft" data-main-reveal>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-coral">{session.startTime} · {session.duration} menit</p>
          <h3 className="mt-2 truncate text-xl font-bold tracking-[-0.03em]">{session.courseName}</h3>
        </div>
        <span className="rounded-full bg-sage/60 px-3 py-1 text-xs font-semibold text-moss">{statusLabel(session.status)}</span>
      </div>
      {session.studyMethod && <p className="mt-4 text-sm font-semibold text-moss">{session.studyMethod}</p>}
      {session.studyGoal && <p className="mt-1 text-sm leading-6 text-ink/65">{session.studyGoal}</p>}
      {action && session.status !== "completed" && session.status !== "missed" && (
        <a href={`/sesi/${encodeURIComponent(session.sessionKey)}`} className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-moss px-4 text-sm font-semibold text-cream hover:bg-ink">
          Mulai Belajar <ArrowRight size={16} />
        </a>
      )}
    </article>
  );
}

function TodayView({ data, onLogout }: { data: MainData; onLogout: () => void }) {
  const { setup } = data;
  const plan = setup.studyPlan!;
  const today = dateInTimeZone(new Date(), setup.timezone);
  const todaySessions = plan.sessions.filter((session) => session.date === today).sort((a, b) => a.startTime.localeCompare(b.startTime));
  const next = todaySessions.find((session) => session.status === "planned" || session.status === "partial");
  const later = todaySessions.filter((session) => session !== next && session.status === "planned");
  const completed = todaySessions.filter((session) => session.status === "completed").length;
  const agenda = [...setup.academicEvents].filter((event) => event.date >= today).sort((a, b) => a.date.localeCompare(b.date))[0];
  const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: setup.timezone, hour: "numeric", hour12: false }).format(new Date()));
  const greeting = hour < 12 ? "Selamat pagi" : hour < 15 ? "Selamat siang" : hour < 18 ? "Selamat sore" : "Selamat malam";
  return (
    <PageFrame data={data} view="hari-ini" onLogout={onLogout}>
      <MotionReveal>
        <section className="grid gap-6 lg:grid-cols-[1.1fr_.9fr] lg:items-end" data-main-reveal>
          <div>
            <p className="text-sm font-semibold text-coral">{greeting}</p>
            <h1 className="mt-3 max-w-6xl text-5xl font-bold leading-[0.95] tracking-[-0.07em] sm:text-7xl">Apa yang perlu kamu pelajari hari ini?</h1>
            <p className="mt-5 text-base text-ink/60">{formatDate(today, setup.timezone)}</p>
          </div>
          <div className="rounded-[1.5rem] bg-moss p-5 text-cream" data-main-reveal>
            <p className="text-sm text-cream/65">Progres hari ini</p>
            <p className="mt-2 text-3xl font-bold">{completed} dari {todaySessions.length} sesi selesai</p>
            <div className="mt-4 h-2 rounded-full bg-cream/20"><div className="h-full rounded-full bg-coral" style={{ width: `${todaySessions.length ? `${(completed / todaySessions.length) * 100}%` : "0%"}` }} /></div>
          </div>
        </section>
        {next ? (
          <section className="mt-10 grid gap-5 lg:grid-cols-[.42fr_1fr]" data-main-reveal>
            <div className="rounded-[1.5rem] bg-coral p-5 text-white"><p className="text-sm text-white/75">Sesi berikutnya</p><p className="mt-3 text-5xl font-bold tracking-[-0.06em]">{next.startTime}</p><p className="mt-2 text-sm text-white/75">{next.duration} menit</p></div>
            <SessionCard session={next} />
          </section>
        ) : (
          <section className="mt-10 rounded-[1.5rem] border border-ink/10 bg-white/70 p-6" data-main-reveal>
            <p className="text-lg font-bold">Hari ini lebih longgar.</p>
            <p className="mt-2 text-sm leading-6 text-ink/65">Belum ada sesi terjadwal untuk hari ini. Rencana berikutnya tetap bisa kamu lihat di Rencana.</p>
          </section>
        )}
        {later.length > 0 && <section className="mt-10"><h2 className="text-2xl font-bold tracking-[-0.04em]">Setelah ini</h2><div className="mt-4 grid gap-3 sm:grid-cols-2">{later.map((session) => <SessionCard key={session.sessionKey} session={session} />)}</div></section>}
        <section className="mt-10 grid gap-4 sm:grid-cols-2">
          <div className="rounded-[1.5rem] border border-ink/10 bg-sand p-5" data-main-reveal>
            <p className="text-sm font-semibold text-moss">Agenda terdekat</p>
            {agenda ? <><p className="mt-3 text-lg font-bold">{agenda.type} · {agenda.title}</p><p className="mt-2 text-sm text-ink/60">{formatDate(agenda.date, setup.timezone, { day: "numeric", month: "long" })}</p></> : <p className="mt-3 text-sm leading-6 text-ink/65">Belum ada agenda akademik yang perlu diperhatikan.</p>}
          </div>
          <div className="rounded-[1.5rem] border border-ink/10 bg-white/70 p-5" data-main-reveal>
            <p className="text-sm font-semibold text-moss">Ritme belajarmu</p>
            <p className="mt-3 text-lg font-bold">{setup.focusDuration} menit per sesi</p>
            <p className="mt-2 text-sm leading-6 text-ink/65">Waktu fokus: {setup.focusPeriods.join(", ")}. Rencana menjaga ruang untuk kegiatan lain.</p>
          </div>
        </section>
      </MotionReveal>
    </PageFrame>
  );
}

function WeeklyEvaluationForm({ data, onSubmit }: { data: MainData; onSubmit: (evaluation: WeeklyEvaluation) => Promise<{ ok: boolean; message: string }> }) {
  const [perceivedLoad, setPerceivedLoad] = useState<number | null>(null);
  const [realism, setRealism] = useState<WeeklyEvaluation["realism"]>("Sebagian Besar");
  const [courseId, setCourseId] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  async function submit() {
    if (perceivedLoad === null) {
      setMessage("Pilih dulu seberapa berat ritmemu minggu ini.");
      return;
    }
    setSaving(true);
    const result = await onSubmit({ perceivedLoad, realism, ...(courseId ? { courseId } : {}) });
    setMessage(result.message);
    setSaving(false);
  }
  return (
    <section className="mt-10 rounded-[1.5rem] border border-ink/10 bg-sand p-5 sm:p-6" data-main-reveal>
      <p className="text-sm font-semibold text-coral">Evaluasi minggu ini</p>
      <h2 className="mt-2 text-2xl font-bold tracking-[-0.04em]">Bagaimana rasanya menjalani rencana ini?</h2>
      <p className="mt-2 text-sm leading-6 text-ink/60">Jawabanmu membantu memindahkan beban tanpa membuat minggu depan terasa penuh.</p>
      <fieldset className="mt-5">
        <legend className="text-sm font-semibold">Seberapa berat ritmemu?</legend>
        <div className="mt-3 grid grid-cols-5 gap-2">
          {[1, 2, 3, 4, 5].map((value) => <button key={value} type="button" aria-pressed={perceivedLoad === value} onClick={() => setPerceivedLoad(value)} className={`min-h-11 rounded-xl border text-sm font-bold ${perceivedLoad === value ? "border-moss bg-moss text-cream" : "border-ink/15 bg-white hover:bg-sage/50"}`}>{value}</button>)}
        </div>
        <div className="mt-2 flex justify-between text-xs text-ink/50"><span>Lebih ringan</span><span>Sangat berat</span></div>
      </fieldset>
      <fieldset className="mt-5">
        <legend className="text-sm font-semibold">Apakah rencana ini terasa realistis?</legend>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {(["Ya", "Sebagian Besar", "Tidak"] as const).map((value) => <button key={value} type="button" aria-pressed={realism === value} onClick={() => setRealism(value)} className={`min-h-11 rounded-xl border px-3 text-sm font-semibold ${realism === value ? "border-moss bg-moss text-cream" : "border-ink/15 bg-white hover:bg-sage/50"}`}>{value}</button>)}
        </div>
      </fieldset>
      <label className="mt-5 block text-sm font-semibold" htmlFor="weekly-course">Mata kuliah yang perlu lebih diperhatikan <span className="font-normal text-ink/50">(opsional)</span>
        <select id="weekly-course" value={courseId} onChange={(event) => setCourseId(event.target.value)} className="mt-2 min-h-11 w-full rounded-xl border border-ink/15 bg-white px-3 text-sm font-normal">
          <option value="">Belum memilih</option>
          {data.setup.courses.map((course) => <option key={course.id} value={course.id}>{course.name}</option>)}
        </select>
      </label>
      <button type="button" onClick={() => void submit()} disabled={saving} className="mt-5 min-h-12 rounded-xl bg-moss px-5 font-semibold text-cream hover:bg-ink disabled:cursor-not-allowed disabled:opacity-50">{saving ? "Memperbarui rencana..." : "Perbarui Rencana"}</button>
      {message && <p className="mt-3 text-sm text-ink/65" role="status">{message}</p>}
    </section>
  );
}

function PlanView({ data, onLogout, onAdapt }: { data: MainData; onLogout: () => void; onAdapt: (evaluation: WeeklyEvaluation) => Promise<{ ok: boolean; message: string }> }) {
  const { setup } = data;
  const plan = setup.studyPlan!;
  const today = dateInTimeZone(new Date(), setup.timezone);
  const range = calendarRangeForPlan(today, plan.planningPeriod);
  const rangeStart = range.start;
  const rangeEnd = range.end;
  const [overlay, setOverlay] = useState<import("@/features/calendar/types").PlanifyCalendarEvent[]>([]);
  const [overlayMessage, setOverlayMessage] = useState("");
  useEffect(() => { void getCalendarOverlay({ start: rangeStart, end: rangeEnd }).then((result) => { setOverlay(result.events); setOverlayMessage(result.message ?? ""); }); }, [rangeStart, rangeEnd]);
  const events = combineCalendarEvents({ courses: setup.courses, classSchedules: setup.classSchedules, sessions: plan.sessions, academicEvents: setup.academicEvents }, range, overlay);
  return (
    <PageFrame data={data} view="rencana" onLogout={onLogout}>
      <MotionReveal>
        <header data-main-reveal><p className="text-sm font-semibold text-coral">Rencana belajar</p><h1 className="mt-3 max-w-6xl text-5xl font-bold leading-[0.95] tracking-[-0.07em]">Kalender yang menjaga langkahmu tetap terlihat.</h1><p className="mt-5 text-base text-ink/60">Kuliah, sesi belajar, dan agenda akademik dalam satu ruang.</p></header>
        <div className="mt-10" data-main-reveal><CalendarView events={events} initialDate={today} range={range} initialMode="week" />{overlayMessage && <p className="mt-3 text-sm text-ink/55" role="status">{overlayMessage}</p>}</div>
        {plan.changeSummary && plan.changeSummary.length > 0 && <aside className="mt-10 rounded-[1.5rem] border border-coral/30 bg-coral/10 p-5" role="status" data-main-reveal><p className="text-sm font-semibold text-coral">Rencanamu Diperbarui</p><p className="mt-2 text-sm leading-6 text-ink/70">{plan.adaptationReason}</p><ul className="mt-4 space-y-2 text-sm leading-6 text-ink/75">{plan.changeSummary.map((change) => <li key={change.sessionKey} className="border-t border-coral/15 pt-2 first:border-0 first:pt-0"><span className="font-semibold">{change.courseName}</span> · {change.reason}</li>)}</ul></aside>}
        <WeeklyEvaluationForm data={data} onSubmit={onAdapt} />
        <p className="mt-6 text-sm leading-6 text-ink/55">Rencana ke depan tetap bisa berubah ketika kamu memberi kabar tentang ritmemu.</p>
      </MotionReveal>
    </PageFrame>
  );
}

function CoursesView({ data, onLogout }: { data: MainData; onLogout: () => void }) {
  const { setup } = data;
  const plan = setup.studyPlan!;
  const today = dateInTimeZone(new Date(), setup.timezone);
  const endOfWeek = nextDate(weekStart(today), 6);
  const factors = new Map(plan.prioritySnapshot.courseFactors.map((factor) => [factor.courseId, factor]));
  return (
    <PageFrame data={data} view="mata-kuliah" onLogout={onLogout}>
      <MotionReveal>
        <header data-main-reveal><p className="text-sm font-semibold text-coral">Mata kuliah</p><h1 className="mt-3 max-w-6xl text-5xl font-bold leading-[0.95] tracking-[-0.07em]">Lihat apa yang sedang kamu jaga.</h1><p className="mt-5 text-base text-ink/60">Prioritas dan ritme minggu ini tetap terlihat dekat dengan kondisi kamu.</p></header>
        <div className="mt-10 space-y-3">
          {setup.courses.map((course) => {
            const factor = factors.get(course.id);
            const sessions = plan.sessions.filter((session) => session.courseId === course.id && session.date >= weekStart(today) && session.date <= endOfWeek);
            const event = setup.academicEvents.filter((item) => item.courseId === course.id && item.date >= today).sort((a, b) => a.date.localeCompare(b.date))[0];
            const evaluation = setup.evaluations[course.id];
            return <details key={course.id} className="accordion-panel group rounded-[1.5rem] border border-ink/10 bg-white/70 p-5" data-main-reveal><summary className="flex cursor-pointer list-none items-start justify-between gap-4"><span><span className="block text-sm font-semibold text-moss">Prioritas {priorityLabel(factor?.score ?? 0)}</span><span className="mt-2 block text-xl font-bold tracking-[-0.03em]">{course.name}</span></span><ChevronRight className="mt-1 shrink-0 transition group-open:rotate-90" size={20} /></summary><div className="mt-5 grid gap-3 border-t border-ink/10 pt-5 sm:grid-cols-3"><div><p className="text-xs font-semibold text-ink/50">Pemahaman</p><p className="mt-1 font-bold">{evaluation?.understanding ?? "—"} dari 5</p></div><div><p className="text-xs font-semibold text-ink/50">Kesulitan</p><p className="mt-1 font-bold">{evaluation?.difficulty ?? "—"} dari 5</p></div><div><p className="text-xs font-semibold text-ink/50">Minggu ini</p><p className="mt-1 font-bold">{sessions.length} sesi · {formatMinutes(sessions.reduce((sum, item) => sum + item.duration, 0))}</p></div></div>{event && <p className="mt-4 rounded-xl bg-sand p-3 text-sm"><span className="font-semibold">Agenda terdekat:</span> {event.type} · {event.title} · {formatDate(event.date, setup.timezone, { day: "numeric", month: "long" })}</p>}</details>;
          })}
        </div>
      </MotionReveal>
    </PageFrame>
  );
}

function SessionView({ data, sessionKey, onSave, onLogout }: { data: MainData; sessionKey: string; onSave: (sessionKey: string, status: Exclude<StudySessionStatus, "planned">, feedback?: { reason?: string; understanding?: number }) => Promise<{ ok: boolean; message: string }>; onLogout: () => void }) {
  const setup = data.setup;
  const session = setup.studyPlan!.sessions.find((item) => item.sessionKey === sessionKey);
  const [pendingStatus, setPendingStatus] = useState<Exclude<StudySessionStatus, "planned"> | null>(null);
  const [reason, setReason] = useState<string>();
  const [understanding, setUnderstanding] = useState<number>();
  const [message, setMessage] = useState("");
  const completedCount = setup.studyPlan!.sessions.filter((item) => item.status === "completed").length;
  if (!session) return <PageFrame data={data} view="sesi" onLogout={onLogout}><p className="rounded-2xl bg-white/70 p-6">Sesi tidak ditemukan.</p></PageFrame>;
  const selectedSession = session;
  const reasons = ["Tidak cukup waktu", "Terlalu lelah", "Materinya terasa sulit", "Lupa", "Ada kegiatan mendadak", "Lainnya"];
  async function submit(status: Exclude<StudySessionStatus, "planned">, selectedReason?: string, selectedUnderstanding?: number) {
    if ((status === "partial" || status === "missed") && !selectedReason) return;
    setMessage("Menyimpan catatan sesi...");
    const result = await onSave(selectedSession.sessionKey, status, { reason: selectedReason, understanding: selectedUnderstanding });
    setMessage(result.message);
    if (result.ok) setPendingStatus(null);
  }
  return (
    <PageFrame data={data} view="sesi" onLogout={onLogout} hideNavigation>
      <MotionReveal>
        <a href="/hari-ini" className="inline-flex items-center gap-2 text-sm font-semibold text-moss hover:text-coral"><RotateCcw size={15} /> Kembali ke Hari Ini</a>
        <section className="mt-8 grid gap-6 lg:grid-cols-[.42fr_1fr]" data-main-reveal>
          <div className="rounded-[1.75rem] bg-moss p-6 text-cream"><p className="text-sm text-cream/65">{formatDate(selectedSession.date, setup.timezone)} · {selectedSession.startTime}</p><p className="mt-8 text-6xl font-bold tracking-[-0.08em]">{selectedSession.duration}</p><p className="mt-1 text-sm text-cream/65">menit untuk satu sesi</p></div>
          <div className="rounded-[1.75rem] border border-ink/10 bg-white/80 p-6 sm:p-8"><p className="text-sm font-semibold text-coral">Sesi belajar</p><h1 className="mt-3 text-4xl font-bold leading-[0.98] tracking-[-0.06em] sm:text-6xl">{selectedSession.courseName}</h1>{selectedSession.studyMethod && <p className="mt-6 text-lg font-semibold text-moss">{selectedSession.studyMethod}</p>}<p className="mt-3 text-base leading-7 text-ink/65">{selectedSession.studyGoal ?? "Tinjau kembali materi terbaru dan latih pemahamanmu."}</p>{selectedSession.explanation && <p className="mt-5 rounded-xl bg-sand p-4 text-sm leading-6">{selectedSession.explanation}</p>}{selectedSession.status !== "planned" && <p className="mt-5 rounded-xl bg-sage/50 p-4 text-sm font-semibold text-moss">Sesi ini: {statusLabel(selectedSession.status)}</p>}{selectedSession.status !== "completed" && selectedSession.status !== "missed" && !pendingStatus && <div className="mt-8 flex flex-col gap-3 sm:flex-row"><button type="button" onClick={() => shouldAskUnderstanding(completedCount) ? setPendingStatus("completed") : void submit("completed")} className="min-h-12 flex-1 rounded-xl bg-moss px-5 font-semibold text-cream hover:bg-ink">Selesai</button><button type="button" onClick={() => setPendingStatus("partial")} className="min-h-12 flex-1 rounded-xl border border-ink/15 px-5 font-semibold hover:bg-sage/50">Selesai Sebagian</button><button type="button" onClick={() => setPendingStatus("missed")} className="min-h-12 flex-1 rounded-xl border border-ink/15 px-5 font-semibold hover:bg-sage/50">Tidak Sempat</button></div>}{pendingStatus && <div className="mt-8 rounded-2xl bg-cream p-5"><p className="font-bold">{pendingStatus === "completed" ? "Seberapa paham kamu setelah sesi ini?" : "Apa yang membuat sesi ini tidak selesai?"}</p>{pendingStatus === "completed" ? <div className="mt-4 grid grid-cols-5 gap-2">{[1, 2, 3, 4, 5].map((value) => <button key={value} type="button" onClick={() => setUnderstanding(value)} className={`min-h-11 rounded-xl border text-sm font-bold ${understanding === value ? "border-moss bg-moss text-cream" : "border-ink/15 bg-white hover:bg-sage/50"}`}>{value}</button>)}</div> : <div className="mt-4 grid gap-2">{reasons.map((value) => <button key={value} type="button" onClick={() => setReason(value)} className={`min-h-11 rounded-xl border px-3 text-left text-sm ${reason === value ? "border-moss bg-moss text-cream" : "border-ink/15 bg-white hover:bg-sage/50"}`}>{value}</button>)}</div>}<button type="button" disabled={pendingStatus === "completed" ? understanding === undefined : !reason} onClick={() => void submit(pendingStatus, reason, understanding)} className="mt-5 min-h-12 w-full rounded-xl bg-moss px-5 font-semibold text-cream disabled:cursor-not-allowed disabled:opacity-40">Simpan Catatan</button></div>}{message && <p role="status" className="mt-4 text-sm text-ink/60">{message}</p>}</div>
        </section>
      </MotionReveal>
    </PageFrame>
  );
}

function PageFrame({ data, view, onLogout, hideNavigation = false, children }: { data: MainData; view: MainView; onLogout: () => void; hideNavigation?: boolean; children: React.ReactNode }) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  return <main className="min-h-screen max-w-full overflow-x-hidden bg-cream px-4 pb-[calc(7rem+env(safe-area-inset-bottom))] pt-5 text-ink sm:px-8 sm:pt-8 lg:px-10 lg:pb-[calc(9rem+env(safe-area-inset-bottom))] lg:pt-5"><div className="mx-auto max-w-6xl"><header className="flex items-center justify-between gap-4 lg:border-b lg:border-ink/10 lg:pb-6"><a href="/hari-ini" className="flex items-center gap-2 text-lg font-bold tracking-[-0.04em] transition hover:text-moss"><span className="grid h-9 w-9 place-items-center rounded-xl bg-moss text-cream"><Leaf size={18} /></span>Planify</a><div className="flex items-center gap-3">{supabase && <button type="button" onClick={onLogout} className="flex min-h-10 items-center gap-2 rounded-xl border border-ink/15 bg-white/70 px-3 text-sm font-semibold transition hover:bg-sage"><LogOut size={15} aria-hidden="true" /> Keluar</button>}</div></header>{!hideNavigation && <MainNavigation view={view} />}<div className="mt-10">{children}</div></div></main>;
}

const loadingLabels: Record<MainView, string> = {
  "hari-ini": "Memuat Hari Ini...",
  rencana: "Memuat Rencana...",
  "mata-kuliah": "Memuat Mata Kuliah...",
  profil: "Memuat Profil...",
  sesi: "Memuat Sesi...",
};

function LoadingBar({ className, tone = "bg-ink/10" }: { className: string; tone?: string }) {
  return <div className={`rounded-xl ${tone} soft-pulse ${className}`} />;
}

function MainLoading({ view }: { view: MainView }) {
  const loadingLabel = loadingLabels[view];
  const showNavigation = view !== "sesi";
  return (
    <main className="min-h-[100dvh] max-w-full overflow-x-hidden bg-cream px-4 pb-[calc(7rem+env(safe-area-inset-bottom))] pt-5 text-ink sm:px-8 sm:pt-8 lg:px-10 lg:pb-[calc(9rem+env(safe-area-inset-bottom))] lg:pt-5" aria-busy="true">
      <div className="mx-auto max-w-6xl">
        <header className="flex items-center justify-between gap-4 lg:border-b lg:border-ink/10 lg:pb-6">
          <a href="/hari-ini" className="flex items-center gap-2 text-lg font-bold tracking-[-0.04em] transition hover:text-moss">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-moss text-cream"><Leaf size={18} /></span>
            Planify
          </a>
        </header>
        {showNavigation && <MainNavigation view={view} />}
        <p className="mt-10 text-sm font-semibold text-coral" role="status" aria-live="polite">{loadingLabel}</p>
        <div aria-hidden="true" className="mt-4">
          {view === "hari-ini" && <>
            <section className="grid gap-6 lg:grid-cols-[1.1fr_.9fr] lg:items-end">
              <div><LoadingBar className="h-12 max-w-3xl rounded-2xl sm:h-16" tone="bg-moss/15" /><LoadingBar className="mt-4 h-5 w-56 rounded-full" /></div>
              <div className="rounded-[1.5rem] bg-moss p-5"><LoadingBar className="h-4 w-32 rounded-full" tone="bg-cream/25" /><LoadingBar className="mt-3 h-9 w-48" tone="bg-cream/20" /><div className="mt-5 h-2 rounded-full bg-cream/20"><LoadingBar className="h-full w-2/5 rounded-full" tone="bg-coral" /></div></div>
            </section>
            <section className="mt-10 grid gap-5 lg:grid-cols-[.42fr_1fr]"><div className="rounded-[1.5rem] bg-coral p-5"><LoadingBar className="h-4 w-32 rounded-full" tone="bg-white/35" /><LoadingBar className="mt-4 h-14 w-28 rounded-2xl" tone="bg-white/25" /><LoadingBar className="mt-3 h-4 w-20 rounded-full" tone="bg-white/30" /></div><div className="rounded-[1.5rem] border border-ink/10 bg-white/80 p-5"><div className="flex items-start justify-between gap-4"><div className="min-w-0 flex-1"><LoadingBar className="h-4 w-36 rounded-full" tone="bg-coral/25" /><LoadingBar className="mt-3 h-7 max-w-sm" /></div><LoadingBar className="h-6 w-20 rounded-full" tone="bg-sage/70" /></div><LoadingBar className="mt-5 h-4 w-32 rounded-full" tone="bg-moss/15" /><LoadingBar className="mt-2 h-4 max-w-md rounded-full" /></div></section>
            <section className="mt-10 grid gap-4 sm:grid-cols-2"><div className="rounded-[1.5rem] border border-ink/10 bg-sand p-5"><LoadingBar className="h-4 w-32 rounded-full" tone="bg-moss/20" /><LoadingBar className="mt-4 h-6 w-48" /><LoadingBar className="mt-3 h-4 w-28 rounded-full" /></div><div className="rounded-[1.5rem] border border-ink/10 bg-white/70 p-5"><LoadingBar className="h-4 w-32 rounded-full" tone="bg-moss/20" /><LoadingBar className="mt-4 h-6 w-44" /><LoadingBar className="mt-3 h-4 max-w-xs rounded-full" /></div></section>
          </>}
          {view === "rencana" && <>
            <section><LoadingBar className="h-12 max-w-3xl rounded-2xl sm:h-16" tone="bg-moss/15" /><LoadingBar className="mt-4 h-5 w-80 rounded-full" /></section>
            <section className="mt-10 rounded-[1.5rem] border border-ink/10 bg-white/80 p-5 sm:p-6"><div className="flex items-center justify-between gap-4"><LoadingBar className="h-7 w-44" /><LoadingBar className="h-9 w-24 rounded-xl" tone="bg-sage/70" /></div><div className="mt-6 grid grid-cols-7 gap-2"><LoadingBar className="h-5 rounded-full" tone="bg-moss/15" /><LoadingBar className="h-5 rounded-full" tone="bg-moss/15" /><LoadingBar className="h-5 rounded-full" tone="bg-moss/15" /><LoadingBar className="h-5 rounded-full" tone="bg-moss/15" /><LoadingBar className="h-5 rounded-full" tone="bg-moss/15" /><LoadingBar className="h-5 rounded-full" tone="bg-moss/15" /><LoadingBar className="h-5 rounded-full" tone="bg-moss/15" /></div><div className="mt-4 h-52 rounded-2xl bg-cream/70 soft-pulse" /></section>
            <section className="mt-10 rounded-[1.5rem] border border-ink/10 bg-sand p-5 sm:p-6"><LoadingBar className="h-4 w-40 rounded-full" tone="bg-coral/25" /><LoadingBar className="mt-4 h-7 max-w-lg" /><LoadingBar className="mt-3 h-4 max-w-md rounded-full" /></section>
          </>}
          {view === "mata-kuliah" && <>
            <section><LoadingBar className="h-12 max-w-3xl rounded-2xl sm:h-16" tone="bg-moss/15" /><LoadingBar className="mt-4 h-5 w-72 rounded-full" /></section>
            <section className="mt-10 space-y-3">{["w-full", "w-11/12", "w-full", "w-10/12"].map((width, index) => <div key={`${width}-${index}`} className="rounded-[1.5rem] border border-ink/10 bg-white/70 p-5"><div className="flex items-center justify-between gap-4"><LoadingBar className={`h-6 ${width}`} tone="bg-moss/15" /><LoadingBar className="h-5 w-5 rounded-full" tone="bg-ink/10" /></div></div>)}</section>
          </>}
          {view === "profil" && <>
            <section className="mx-auto max-w-5xl text-center"><LoadingBar className="mx-auto h-12 max-w-3xl rounded-2xl sm:h-16" tone="bg-moss/15" /><LoadingBar className="mx-auto mt-4 h-5 w-72 rounded-full" /></section>
            <section className="mt-10 rounded-[1.75rem] border border-ink/10 bg-white/80 p-6 sm:p-8"><div className="flex items-start justify-between gap-4"><div><LoadingBar className="h-4 w-40 rounded-full" tone="bg-moss/20" /><LoadingBar className="mt-3 h-8 w-64" /></div><LoadingBar className="h-6 w-28 rounded-full" tone="bg-sage/70" /></div><div className="mt-8 grid gap-8 lg:grid-cols-2"><div><LoadingBar className="h-5 w-48" /><LoadingBar className="mt-4 h-11 w-full rounded-xl" /><LoadingBar className="mt-2 h-11 w-full rounded-xl" /></div><div><LoadingBar className="h-5 w-40" /><LoadingBar className="mt-4 h-14 w-full rounded-xl" /><LoadingBar className="mt-2 h-14 w-full rounded-xl" /></div></div><LoadingBar className="mt-8 h-12 w-48 rounded-xl" tone="bg-moss/20" /></section>
          </>}
          {view === "sesi" && <>
            <LoadingBar className="h-4 w-40 rounded-full" tone="bg-moss/15" />
            <section className="mt-8 grid gap-6 lg:grid-cols-[.42fr_1fr]"><div className="rounded-[1.75rem] bg-moss p-6"><LoadingBar className="h-4 w-48 rounded-full" tone="bg-cream/25" /><LoadingBar className="mt-8 h-16 w-28 rounded-2xl" tone="bg-cream/20" /><LoadingBar className="mt-3 h-4 w-24 rounded-full" tone="bg-cream/20" /></div><div className="rounded-[1.75rem] border border-ink/10 bg-white/80 p-6 sm:p-8"><LoadingBar className="h-4 w-32 rounded-full" tone="bg-coral/25" /><LoadingBar className="mt-4 h-12 max-w-xl rounded-2xl sm:h-16" /><LoadingBar className="mt-6 h-5 w-40 rounded-full" tone="bg-moss/15" /><LoadingBar className="mt-3 h-4 max-w-lg rounded-full" /><LoadingBar className="mt-8 h-12 w-full rounded-xl" tone="bg-moss/20" /></div></section>
          </>}
        </div>
      </div>
    </main>
  );
}

export default function MainExperience({ view, sessionKey }: { view: MainView; sessionKey?: string }) {
  const [data, setData] = useState<MainData | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    void loadMainData().then((result) => {
      if (cancelled) return;
      if (!result) {
        window.location.replace("/");
        return;
      }
      setData(result);
      setLoading(false);
    }).catch(() => {
      if (!cancelled) window.location.replace("/");
    });
    return () => { cancelled = true; };
  }, []);
  if (loading || !data) return <MainLoading view={view} />;
  const activeData = data;
  async function saveSession(sessionKeyValue: string, status: Exclude<StudySessionStatus, "planned">, feedback?: { reason?: string; understanding?: number }) {
    const current = activeData.setup.studyPlan?.sessions.find((session) => session.sessionKey === sessionKeyValue);
    if (!current) return { ok: false, message: "Sesi tidak ditemukan." };
    if (!canTransitionSession(current.status, status)) return { ok: false, message: "Sesi yang sudah tercatat tidak dapat diubah lagi." };
    if (activeData.remotePlanId) {
      const result = await updateStudySession({ planId: activeData.remotePlanId, sessionKey: sessionKeyValue, status, ...feedback });
      if (!result.ok) return result;
    }
    const updated = transitionSession(current, status, feedback);
    const setup: OnboardingData = { ...activeData.setup, studyPlan: { ...activeData.setup.studyPlan!, sessions: activeData.setup.studyPlan!.sessions.map((session) => session.sessionKey === sessionKeyValue ? updated : session) } };
    saveLocalMainData(setup);
    setData({ ...activeData, setup });
    return { ok: true, message: "Perubahan sesi tersimpan." };
  }
  async function adaptPlan(evaluation: WeeklyEvaluation) {
    const currentPlan = activeData.setup.studyPlan;
    if (!currentPlan) return { ok: false, message: "Rencana belajar belum tersedia." };
    const today = dateInTimeZone(new Date(), activeData.setup.timezone);
    const result = adaptStudyPlan({ data: activeData.setup, plan: currentPlan, today, evaluation });
    if (activeData.remotePlanId) {
      const evaluationResult = await saveWeeklyEvaluation({ ...evaluation, weekStart: weekStart(today) });
      if (!evaluationResult.ok) return evaluationResult;
      const persisted = await persistAdaptedPlan({ sourcePlanId: activeData.remotePlanId, plan: result.plan });
      if (!persisted.ok) return persisted;
      result.plan.remoteId = persisted.remotePlanId;
    }
    const setup: OnboardingData = {
      ...activeData.setup,
      planningSnapshot: result.snapshot,
      studyPlan: result.plan,
    };
    saveLocalMainData(setup);
    setData({ ...activeData, setup, remotePlanId: result.plan.remoteId ?? activeData.remotePlanId });
    return {
      ok: true,
      message: result.changes.length ? "Rencanamu diperbarui dengan beberapa penyesuaian." : "Evaluasi tersimpan. Rencana tetap sama karena belum ada perubahan yang aman.",
    };
  }
  function logout() {
    const supabase = createSupabaseBrowserClient();
    void supabase?.auth.signOut().finally(() => window.location.replace("/"));
  }
  if (view === "sesi") return <SessionView data={data} sessionKey={sessionKey ? decodeURIComponent(sessionKey) : ""} onSave={saveSession} onLogout={logout} />;
  if (view === "profil") return <PageFrame data={data} view={view} onLogout={logout}><MotionReveal><ProfileView data={data} onLogout={logout} /></MotionReveal></PageFrame>;
  return view === "rencana" ? <PlanView data={data} onLogout={logout} onAdapt={adaptPlan} /> : view === "mata-kuliah" ? <CoursesView data={data} onLogout={logout} /> : <TodayView data={data} onLogout={logout} />;
}
