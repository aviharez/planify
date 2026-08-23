"use client";

import { useEffect, useState } from "react";
import { disconnectCalendar, getCalendarStatus, syncCalendar } from "@/app/actions/calendar";
import type { MainData } from "@/features/main/data";

type CalendarStatus = Awaited<ReturnType<typeof getCalendarStatus>>;

export default function ProfileView({ data }: { data: MainData }) {
  const [status, setStatus] = useState<CalendarStatus | null>(null);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  useEffect(() => { void getCalendarStatus().then(setStatus); }, []);
  async function run(action: () => Promise<{ ok: boolean; message: string }>) {
    setPending(true);
    const result = await action();
    setMessage(result.message);
    setPending(false);
    if (result.ok) setStatus(await getCalendarStatus());
  }
  return (
    <div className="mx-auto max-w-5xl">
      <section className="text-center" data-main-reveal>
        <p className="text-sm font-semibold text-coral">Profil</p>
        <h1 className="mx-auto mt-3 max-w-5xl text-5xl font-bold leading-[0.95] tracking-[-0.07em] sm:text-7xl">Atur ruang yang membantu kamu belajar.</h1>
        <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-ink/65">Kelola koneksi kalender dan preferensi akunmu dari satu tempat.</p>
      </section>
      <section className="mt-10 rounded-[1.75rem] border border-ink/10 bg-white/80 p-6 sm:p-8" data-main-reveal>
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div><p className="text-sm font-semibold text-moss">Google Calendar</p><h2 className="mt-2 text-3xl font-bold tracking-[-0.05em]">Sesi belajar di kalender kamu</h2><p className="mt-3 max-w-xl text-sm leading-6 text-ink/60">Planify hanya mengelola acara belajar yang dibuatnya sendiri. Acara lain di kalender kamu tidak disentuh.</p></div>
          {status?.connected && <span className="rounded-full bg-sage/60 px-3 py-1 text-xs font-semibold text-moss">Terhubung</span>}
        </div>
        {!status ? <p className="mt-8 text-sm text-ink/60" role="status">Memuat status kalender...</p> : !status.authenticated ? (
          <div className="mt-8 rounded-xl bg-sand p-4 text-sm leading-6">Masuk ke akun Planify untuk menyambungkan Google Calendar.</div>
        ) : !status.configured ? (
          <div className="mt-8 rounded-xl bg-sand p-4 text-sm leading-6">Koneksi Google Calendar belum tersedia di lingkungan ini.</div>
        ) : !status.connected ? (
          <a href="/api/auth/google/connect" className="mt-8 inline-flex min-h-12 items-center rounded-xl bg-moss px-5 text-sm font-semibold text-cream hover:bg-ink">Sambungkan Google Calendar</a>
        ) : (
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center"><button type="button" disabled={pending} onClick={() => void run(syncCalendar)} className="min-h-12 rounded-xl bg-moss px-5 text-sm font-semibold text-cream hover:bg-ink disabled:opacity-50">{pending ? "Menyinkronkan..." : "Sinkronkan sekarang"}</button><button type="button" disabled={pending} onClick={() => void run(disconnectCalendar)} className="min-h-12 rounded-xl border border-ink/15 px-5 text-sm font-semibold hover:bg-sage/40 disabled:opacity-50">Lepas koneksi</button></div>
        )}
        {status?.lastSyncedAt && <p className="mt-5 text-sm text-ink/55">Sinkronisasi terakhir: {new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: data.setup.timezone }).format(new Date(status.lastSyncedAt))}</p>}
        {message && <p className="mt-4 text-sm font-semibold text-ink/70" role="status">{message}</p>}
      </section>
    </div>
  );
}
