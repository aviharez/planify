"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Plus, Trash2 } from "lucide-react";
import { disconnectCalendar, getCalendarStatus, syncCalendar } from "@/app/actions/calendar";
import { savePreferences, startNewSemester as createSemester } from "@/app/actions/lifecycle";
import { persistAdaptedPlan } from "@/app/actions/adaptation";
import { adaptStudyPlan } from "@/features/planning/adaptation";
import { dateInTimeZone } from "@/features/planning/priority";
import { DAYS, type ActivityDensity, type FocusPeriod, type OnboardingData, type Procrastination, type TimeRange } from "@/features/onboarding/types";
import type { MainData } from "@/features/main/data";
import { saveLocalMainData } from "@/features/main/data";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

type CalendarStatus = Awaited<ReturnType<typeof getCalendarStatus>>;
type SemesterHistoryItem = { id: string; name: string; is_active: boolean; setup_payload: unknown };

function samePreferences(a: OnboardingData, b: OnboardingData) {
  return JSON.stringify({ availability: a.availability, classSchedules: a.classSchedules, focusPeriods: a.focusPeriods, focusDuration: a.focusDuration, activityDensity: a.activityDensity, procrastination: a.procrastination }) === JSON.stringify({ availability: b.availability, classSchedules: b.classSchedules, focusPeriods: b.focusPeriods, focusDuration: b.focusDuration, activityDensity: b.activityDensity, procrastination: b.procrastination });
}

function PreferenceEditor({ data }: { data: MainData }) {
  const [draft, setDraft] = useState(data.setup);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [choice, setChoice] = useState(false);
  const [pendingDraft, setPendingDraft] = useState<OnboardingData | null>(null);
  const [replanning, setReplanning] = useState(false);
  const update = (patch: Partial<OnboardingData>) => setDraft((current) => ({ ...current, ...patch }));
  const updateAvailability = (id: string, patch: Partial<TimeRange>) => update({ availability: draft.availability.map((range) => range.id === id ? { ...range, ...patch } : range) });
  const updateClassSchedule = (courseId: string, id: string, patch: Partial<TimeRange>) => update({ classSchedules: { ...draft.classSchedules, [courseId]: (draft.classSchedules[courseId] ?? []).map((range) => range.id === id ? { ...range, ...patch } : range) } });
  const addAvailability = () => update({ availability: [...draft.availability, { id: `availability-${draft.availability.length + 1}`, day: "Senin", start: "19:00", end: "20:00" }] });
  const addClass = (courseId: string) => update({ classSchedules: { ...draft.classSchedules, [courseId]: [...(draft.classSchedules[courseId] ?? []), { id: `class-${(draft.classSchedules[courseId] ?? []).length + 1}`, day: "Senin", start: "09:00", end: "10:00" }] } });
  async function persist(next: OnboardingData) {
    setSaving(true);
    const result = await savePreferences(next);
    setSaving(false);
    setMessage(result.message);
    if (result.ok) saveLocalMainData(next);
    return result.ok;
  }
  async function save() {
    const changed = !samePreferences(data.setup, draft);
    if (!(await persist(draft))) return;
    if (changed && data.setup.studyPlan) {
      setPendingDraft(draft);
      setChoice(true);
    } else setMessage("Preferensi tersimpan.");
  }
  async function chooseReplan(replan: boolean) {
    setChoice(false);
    if (!pendingDraft || !replan || !data.setup.studyPlan) {
      setMessage("Rencana saat ini dipertahankan.");
      return;
    }
    setReplanning(true);
    const result = adaptStudyPlan({ data: pendingDraft, plan: data.setup.studyPlan, today: dateInTimeZone(new Date(), pendingDraft.timezone), evaluation: { perceivedLoad: 3, realism: "Ya" }, replanFuture: true });
    if (data.remotePlanId) {
      const persisted = await persistAdaptedPlan({ sourcePlanId: data.remotePlanId, plan: result.plan });
      if (!persisted.ok) {
        setMessage(persisted.message);
        setReplanning(false);
        return;
      }
      result.plan.remoteId = persisted.remotePlanId;
    }
    const next = { ...pendingDraft, planningSnapshot: result.snapshot, studyPlan: result.plan, planActive: true };
    setDraft(next);
    saveLocalMainData(next);
    setMessage(result.changes.length ? "Rencana disesuaikan untuk preferensi barumu." : "Preferensi tersimpan, rencana tetap aman.");
    setReplanning(false);
  }
  return <section className="mt-10 rounded-[1.75rem] border border-ink/10 bg-white/80 p-6 sm:p-8"><div className="flex items-start justify-between gap-4"><div><p className="text-sm font-semibold text-moss">Preferensi Belajar</p><h2 className="mt-2 text-3xl font-bold tracking-[-0.05em]">Atur ritme yang cocok untukmu.</h2></div><span className="rounded-full bg-sage/60 px-3 py-1 text-xs font-semibold text-moss">Bisa diubah kapan saja</span></div><div className="mt-8 grid gap-8 lg:grid-cols-2"><div><div className="flex items-center justify-between"><h3 className="text-sm font-bold">Waktu belajar tersedia</h3><button type="button" onClick={addAvailability} className="inline-flex min-h-9 items-center gap-1 rounded-lg bg-sage px-3 text-xs font-semibold text-moss"><Plus size={14} /> Tambah waktu</button></div><div className="mt-3 space-y-2">{draft.availability.map((range) => <div key={range.id} className="grid grid-cols-[1fr_auto_auto_auto] gap-2"><select aria-label="Hari waktu belajar" value={range.day} onChange={(event) => updateAvailability(range.id, { day: event.target.value })} className="min-h-10 rounded-lg border border-ink/15 bg-cream px-2 text-sm">{DAYS.map((day) => <option key={day}>{day}</option>)}</select><input aria-label="Mulai waktu belajar" type="time" value={range.start} onChange={(event) => updateAvailability(range.id, { start: event.target.value })} className="min-h-10 rounded-lg border border-ink/15 bg-cream px-2 text-sm" /><input aria-label="Selesai waktu belajar" type="time" value={range.end} onChange={(event) => updateAvailability(range.id, { end: event.target.value })} className="min-h-10 rounded-lg border border-ink/15 bg-cream px-2 text-sm" /><button type="button" aria-label="Hapus waktu belajar" onClick={() => update({ availability: draft.availability.filter((item) => item.id !== range.id) })} className="grid h-10 w-10 place-items-center rounded-lg border border-ink/10 text-coral"><Trash2 size={15} /></button></div>)}{draft.availability.length === 0 && <p className="rounded-xl bg-sand p-3 text-sm text-ink/60">Belum ada waktu belajar. Tambahkan slot yang realistis.</p>}</div></div><div><div className="flex items-center justify-between"><h3 className="text-sm font-bold">Jadwal kuliah</h3><span className="text-xs text-ink/50">Per semester</span></div><div className="mt-3 space-y-3">{draft.courses.map((course) => <details key={course.id} className="rounded-xl border border-ink/10 bg-cream p-3"><summary className="flex cursor-pointer list-none items-center justify-between text-sm font-semibold">{course.name}<ChevronDown size={15} /></summary><div className="mt-3 space-y-2">{(draft.classSchedules[course.id] ?? []).map((range) => <div key={range.id} className="grid grid-cols-[1fr_auto_auto_auto] gap-2"><select aria-label={`Hari kuliah ${course.name}`} value={range.day} onChange={(event) => updateClassSchedule(course.id, range.id, { day: event.target.value })} className="min-h-10 rounded-lg border border-ink/15 bg-white px-2 text-sm">{DAYS.map((day) => <option key={day}>{day}</option>)}</select><input aria-label={`Mulai kuliah ${course.name}`} type="time" value={range.start} onChange={(event) => updateClassSchedule(course.id, range.id, { start: event.target.value })} className="min-h-10 rounded-lg border border-ink/15 bg-white px-2 text-sm" /><input aria-label={`Selesai kuliah ${course.name}`} type="time" value={range.end} onChange={(event) => updateClassSchedule(course.id, range.id, { end: event.target.value })} className="min-h-10 rounded-lg border border-ink/15 bg-white px-2 text-sm" /><button type="button" aria-label={`Hapus jadwal kuliah ${course.name}`} onClick={() => update({ classSchedules: { ...draft.classSchedules, [course.id]: (draft.classSchedules[course.id] ?? []).filter((item) => item.id !== range.id) } })} className="grid h-10 w-10 place-items-center rounded-lg border border-ink/10 text-coral"><Trash2 size={15} /></button></div>)}<button type="button" onClick={() => addClass(course.id)} className="text-xs font-semibold text-moss">+ Tambah jadwal</button></div></details>)}</div></div></div><div className="mt-8 grid gap-4 border-t border-ink/10 pt-6 sm:grid-cols-2 lg:grid-cols-4"><fieldset className="text-sm font-semibold"><legend>Waktu fokus</legend><div className="mt-2 grid grid-cols-2 gap-2">{(["Pagi", "Siang", "Sore", "Malam"] as FocusPeriod[]).map((period) => { const selected = draft.focusPeriods.includes(period); return <button key={period} type="button" aria-pressed={selected} onClick={() => { if (selected && draft.focusPeriods.length === 1) { setMessage("Pilih setidaknya satu waktu fokus."); return; } update({ focusPeriods: selected ? draft.focusPeriods.filter((item) => item !== period) : [...draft.focusPeriods, period] }); }} className={`min-h-11 rounded-xl border px-3 text-sm font-normal ${selected ? "border-moss bg-moss text-cream" : "border-ink/15 bg-cream hover:bg-sage/40"}`}>{period}</button>; })}</div></fieldset><label className="text-sm font-semibold">Durasi sesi<select value={draft.focusDuration} onChange={(event) => update({ focusDuration: Number(event.target.value) })} className="mt-2 min-h-11 w-full rounded-xl border border-ink/15 bg-cream px-3 text-sm font-normal">{[25, 45, 60, 90].map((minutes) => <option key={minutes} value={minutes}>{minutes} menit</option>)}</select></label><label className="text-sm font-semibold">Kepadatan<select value={draft.activityDensity} onChange={(event) => update({ activityDensity: event.target.value as ActivityDensity })} className="mt-2 min-h-11 w-full rounded-xl border border-ink/15 bg-cream px-3 text-sm font-normal">{["Sangat Longgar", "Cukup Longgar", "Seimbang", "Padat", "Sangat Padat"].map((value) => <option key={value}>{value}</option>)}</select></label><label className="text-sm font-semibold">Kebiasaan menunda<select value={draft.procrastination} onChange={(event) => update({ procrastination: event.target.value as Procrastination })} className="mt-2 min-h-11 w-full rounded-xl border border-ink/15 bg-cream px-3 text-sm font-normal">{["Jarang", "Kadang-kadang", "Sering", "Sangat Sering"].map((value) => <option key={value}>{value}</option>)}</select></label></div><div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center"><button type="button" onClick={() => void save()} disabled={saving || replanning} className="min-h-12 rounded-xl bg-moss px-5 font-semibold text-cream disabled:opacity-50">{saving ? "Menyimpan..." : "Simpan Preferensi"}</button>{message && <p role="status" className="text-sm text-ink/65">{message}</p>}</div>{choice && <div className="mt-5 rounded-2xl border border-coral/25 bg-coral/5 p-5" role="dialog" aria-labelledby="preference-choice"><h3 id="preference-choice" className="font-bold">Preferensi belajarmu berubah</h3><p className="mt-2 text-sm leading-6 text-ink/65">Perubahan ini dapat memengaruhi jadwal belajar yang belum dijalankan.</p><div className="mt-4 flex flex-col gap-2 sm:flex-row"><button type="button" onClick={() => void chooseReplan(true)} className="min-h-11 rounded-xl bg-moss px-4 text-sm font-semibold text-cream">Sesuaikan Rencana</button><button type="button" onClick={() => void chooseReplan(false)} className="min-h-11 rounded-xl border border-ink/15 px-4 text-sm font-semibold">Pertahankan Rencana Saat Ini</button></div></div>}</section>;
}

export default function ProfileView({ data, onLogout }: { data: MainData; onLogout: () => void }) {
  const [status, setStatus] = useState<CalendarStatus | null>(null);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [email, setEmail] = useState("");
  const [history, setHistory] = useState<SemesterHistoryItem[]>([]);
  const [confirmNew, setConfirmNew] = useState(false);
  const [reuse, setReuse] = useState(true);
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  useEffect(() => { void getCalendarStatus().then(setStatus); }, []);
  useEffect(() => {
    if (!supabase || !data.authenticated) return;
    void supabase.auth.getUser().then(({ data: authData }) => {
      if (!authData.user) return;
      setEmail(authData.user.email ?? "");
      void supabase.from("semesters").select("id, name, is_active, setup_payload").eq("user_id", authData.user.id).order("updated_at", { ascending: false }).then(({ data: semesters }) => setHistory((semesters ?? []) as SemesterHistoryItem[]));
    });
  }, [data.authenticated, supabase]);
  async function run(action: () => Promise<{ ok: boolean; message: string }>) {
    setPending(true);
    const result = await action();
    setMessage(result.message);
    setPending(false);
    if (result.ok) setStatus(await getCalendarStatus());
  }
  async function beginSemester() {
    setConfirmNew(false);
    if (!data.authenticated) {
      setMessage("Masuk ke akun untuk memulai semester baru.");
      return;
    }
    const result = await createSemester(reuse);
    if (result.ok) window.location.replace("/");
    else setMessage(result.message);
  }
  const active = history.find((item) => item.is_active);
  const inactiveHistory = history.filter((item) => item.id !== active?.id && !item.is_active);
  return <div className="mx-auto max-w-5xl"><section className="text-center" data-main-reveal><p className="text-sm font-semibold text-coral">Profil</p><h1 className="mx-auto mt-3 max-w-6xl text-5xl font-bold leading-[0.95] tracking-[-0.07em] sm:text-7xl">Ruang belajar yang tetap terasa milikmu.</h1><p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-ink/65">Kelola akun, semester aktif, preferensi, dan integrasi dari satu tempat.</p></section><section className="mt-10 rounded-[1.75rem] border border-ink/10 bg-white/80 p-6 sm:p-8" data-main-reveal><p className="text-sm font-semibold text-moss">Akun</p><h2 className="mt-2 text-3xl font-bold tracking-[-0.05em]">Akun Planify</h2><p className="mt-3 text-sm text-ink/60">{email || "Akun tersambung dan data semester tersimpan aman."}</p></section><section className="mt-6 rounded-[1.75rem] border border-ink/10 bg-white/80 p-6 sm:p-8" data-main-reveal><div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-sm font-semibold text-moss">Semester Aktif</p><h2 className="mt-2 text-3xl font-bold tracking-[-0.05em]">{data.setup.semester}</h2><p className="mt-2 text-sm text-ink/60">{data.setup.courses.length} mata kuliah · {data.setup.courses.reduce((sum, course) => sum + course.credits, 0)} SKS</p></div><button type="button" onClick={() => setConfirmNew(true)} className="min-h-11 rounded-xl bg-moss px-4 text-sm font-semibold text-cream">Mulai Semester Baru</button></div>{inactiveHistory.length > 0 && <div className="mt-7 border-t border-ink/10 pt-5"><h3 className="text-sm font-bold">Riwayat Semester</h3><div className="mt-3 space-y-2">{inactiveHistory.map((item) => { const payload = item.setup_payload as Partial<OnboardingData>; const credits = payload.courses?.reduce((sum, course) => sum + (course.credits ?? 0), 0) ?? 0; return <div key={item.id} className="flex items-center justify-between rounded-xl bg-cream p-3 text-sm"><span><span className="block font-semibold">{item.name}</span><span className="text-ink/55">{payload.courses?.length ?? 0} mata kuliah · {credits} SKS · Riwayat</span></span><span className="text-xs text-ink/50">Hanya baca</span></div>; })}</div></div>}</section><PreferenceEditor data={data} /><section className="mt-6 rounded-[1.75rem] border border-ink/10 bg-white/80 p-6 sm:p-8" data-main-reveal><div><p className="text-sm font-semibold text-moss">Integrasi</p><h2 className="mt-2 text-3xl font-bold tracking-[-0.05em]">Google Calendar</h2><p className="mt-3 max-w-xl text-sm leading-6 text-ink/60">Hubungkan Google Calendar untuk menyinkronkan sesi belajar Planify dan menampilkan agenda dari Google Calendar di kalender Planify. Agenda dari Google hanya ditampilkan dan tidak akan diubah oleh Planify.</p></div>{!status ? <p className="mt-8 text-sm text-ink/60" role="status">Memuat status kalender...</p> : !status.authenticated ? <div className="mt-8 rounded-xl bg-sand p-4 text-sm leading-6">Masuk ke akun Planify untuk menyambungkan Google Calendar.</div> : !status.configured ? <div className="mt-8 rounded-xl bg-sand p-4 text-sm leading-6">Koneksi Google Calendar belum tersedia di lingkungan ini.</div> : !status.connected ? <a href="/api/auth/google/connect" className="mt-8 inline-flex min-h-12 items-center rounded-xl bg-moss px-5 text-sm font-semibold text-cream hover:bg-ink">Sambungkan Google Calendar</a> : <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center"><button type="button" disabled={pending} onClick={() => void run(syncCalendar)} className="min-h-12 rounded-xl bg-moss px-5 text-sm font-semibold text-cream hover:bg-ink disabled:opacity-50">{pending ? "Menyinkronkan..." : "Sinkronkan sekarang"}</button><button type="button" disabled={pending} onClick={() => void run(disconnectCalendar)} className="min-h-12 rounded-xl border border-ink/15 px-5 text-sm font-semibold hover:bg-sage/40 disabled:opacity-50">Lepas koneksi</button></div>}{status?.lastSyncedAt && <p className="mt-5 text-sm text-ink/55">Sinkronisasi terakhir: {new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: data.setup.timezone }).format(new Date(status.lastSyncedAt))}</p>}{message && <p className="mt-4 text-sm font-semibold text-ink/70" role="status">{message}</p>}</section><section className="mt-6 rounded-[1.75rem] border border-ink/10 bg-white/80 p-6 sm:p-8" data-main-reveal><p className="text-sm font-semibold text-moss">Pengaturan Akun</p><h2 className="mt-2 text-2xl font-bold">Keluar dari Planify</h2><button type="button" onClick={onLogout} className="mt-5 min-h-11 rounded-xl border border-ink/15 px-4 text-sm font-semibold hover:bg-sage/40">Keluar</button></section>{confirmNew && <div className="fixed inset-0 z-30 grid place-items-center bg-ink/30 p-4" role="presentation"><section role="dialog" aria-modal="true" aria-labelledby="new-semester-title" className="w-full max-w-md rounded-[1.5rem] bg-cream p-6"><h2 id="new-semester-title" className="text-2xl font-bold tracking-[-0.04em]">Mulai Semester Baru</h2><p className="mt-3 text-sm leading-6 text-ink/65">Semester sebelumnya tetap tersimpan sebagai riwayat.</p><label className="mt-5 flex items-center gap-3 text-sm font-semibold"><input type="checkbox" checked={reuse} onChange={(event) => setReuse(event.target.checked)} /> Gunakan preferensi belajar sebelumnya</label><p className="mt-3 text-sm leading-6 text-ink/65">Jika dipilih, preferensi perilaku belajar akan digunakan kembali; jadwal kuliah dan waktu belajar tersedia tetap perlu disesuaikan untuk semester baru. Jika tidak dipilih, semua preferensi perlu diatur lagi.</p><div className="mt-6 flex gap-2"><button type="button" onClick={() => void beginSemester()} className="min-h-11 flex-1 rounded-xl bg-moss px-4 text-sm font-semibold text-cream">Lanjutkan</button><button type="button" onClick={() => setConfirmNew(false)} className="min-h-11 flex-1 rounded-xl border border-ink/15 px-4 text-sm font-semibold">Batal</button></div></section></div>}</div>;
}
