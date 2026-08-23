"use client";

import type { MainData } from "@/features/main/data";
import { dateInTimeZone } from "@/features/planning/priority";
import { calculateProgressMetrics, formatProgressMinutes, formatProgressPercent } from "./metrics";

function formatDate(date: string, timeZone: string) {
  return new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "numeric", month: "long", timeZone }).format(new Date(`${date}T12:00:00Z`));
}

export default function ProgressView({ data }: { data: MainData }) {
  const setup = data.setup;
  const plan = setup.studyPlan!;
  const today = dateInTimeZone(new Date(), setup.timezone);
  const metrics = calculateProgressMetrics(plan.sessions, setup.courses, today);
  const nextSession = plan.sessions.find((session) => session.status === "planned" && session.date >= today);
  const summary = metrics.hasEnoughData
    ? metrics.needsAttention
      ? `Minggu ini kamu sudah menyelesaikan ${metrics.counts.completed} sesi. ${metrics.needsAttention.courseName} perlu ruang perhatian berikutnya.`
      : `Minggu ini kamu sudah menyelesaikan ${metrics.counts.completed} sesi dan menjaga ritme belajar yang baik.`
    : "Belum ada cukup catatan sesi untuk membaca pola belajar minggu ini.";

  return (
    <div>
      <section className="mx-auto max-w-5xl text-center" data-main-reveal>
        <p className="text-sm font-semibold text-coral">Progres minggu ini</p>
        <h1 className="mx-auto mt-3 max-w-5xl text-5xl font-bold leading-[0.95] tracking-[-0.07em] sm:text-7xl">Lihat ritme belajar yang mulai terbentuk.</h1>
        <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-ink/65">{formatDate(metrics.weekStart, setup.timezone)} — {formatDate(metrics.weekEnd, setup.timezone)}. {summary}</p>
      </section>

      <section className="mt-10 grid grid-cols-1 gap-4 lg:grid-cols-12 lg:grid-flow-dense" aria-label="Ringkasan progres">
        <article className="rounded-[1.75rem] bg-moss p-6 text-cream lg:col-span-6" data-main-reveal>
          <p className="text-sm font-semibold text-cream/70">Keterjagaan rencana</p>
          <p className="mt-8 text-6xl font-bold tracking-[-0.08em]">{formatProgressPercent(metrics.adherence)}</p>
          <p className="mt-3 max-w-sm text-sm leading-6 text-cream/70">Sesi yang selesai dibandingkan dengan sesi yang sudah waktunya dicatat.</p>
        </article>
        <article className="rounded-[1.75rem] border border-ink/10 bg-white/80 p-6 lg:col-span-6" data-main-reveal>
          <p className="text-sm font-semibold text-coral">Waktu belajar selesai</p>
          <p className="mt-8 text-5xl font-bold tracking-[-0.07em]">{formatProgressMinutes(metrics.completedMinutes)}</p>
          <p className="mt-3 text-sm leading-6 text-ink/60">Dari {formatProgressMinutes(metrics.plannedMinutes)} yang tercantum minggu ini. Sesi parsial tidak dihitung sebagai menit selesai.</p>
        </article>
        <article className="rounded-[1.5rem] border border-ink/10 bg-sage/40 p-5 lg:col-span-4" data-main-reveal>
          <p className="text-sm font-semibold text-ink/60">Sesi selesai</p><p className="mt-4 text-4xl font-bold tracking-[-0.06em]">{metrics.counts.completed}</p>
        </article>
        <article className="rounded-[1.5rem] border border-ink/10 bg-white/80 p-5 lg:col-span-4" data-main-reveal>
          <p className="text-sm font-semibold text-ink/60">Sesi belum selesai</p><p className="mt-4 text-4xl font-bold tracking-[-0.06em]">{metrics.counts.missed + metrics.counts.partial}</p>
        </article>
        <article className="rounded-[1.5rem] border border-ink/10 bg-white/80 p-5 lg:col-span-4" data-main-reveal>
          <p className="text-sm font-semibold text-ink/60">Konsistensi hari</p><p className="mt-4 text-4xl font-bold tracking-[-0.06em]">{formatProgressPercent(metrics.consistency)}</p>
        </article>
      </section>

      {!metrics.hasEnoughData ? (
        <section className="mt-6 rounded-[1.5rem] border border-dashed border-ink/20 bg-white/60 p-6 text-center" data-main-reveal>
          <h2 className="text-2xl font-bold tracking-[-0.04em]">Progresmu akan terlihat setelah sesi pertama</h2>
          <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-ink/60">Mulai dari sesi yang sudah tersedia di Hari Ini. Kami hanya akan menampilkan catatan yang benar-benar kamu selesaikan.</p>
          {nextSession && <a href={`/sesi/${encodeURIComponent(nextSession.sessionKey)}`} className="mt-5 inline-flex min-h-11 items-center rounded-xl bg-moss px-5 text-sm font-semibold text-cream hover:bg-ink">Mulai sesi berikutnya</a>}
        </section>
      ) : (
        <section className="mt-6 grid gap-4 lg:grid-cols-12 lg:grid-flow-dense">
          <article className="rounded-[1.75rem] border border-ink/10 bg-coral p-6 text-cream lg:col-span-5" data-main-reveal>
            <p className="text-sm font-semibold text-cream/75">Sinyal untuk langkah berikutnya</p>
            <h2 className="mt-4 text-3xl font-bold leading-tight tracking-[-0.05em]">{metrics.needsAttention ? metrics.needsAttention.courseName : "Pertahankan ritmemu"}</h2>
            <p className="mt-3 text-sm leading-6 text-cream/80">{metrics.needsAttention?.message ?? "Belum ada sinyal yang cukup kuat untuk mengubah fokus belajar."}</p>
            {metrics.needsAttention && <a href="/mata-kuliah" className="mt-6 inline-flex min-h-11 items-center rounded-xl bg-cream px-4 text-sm font-semibold text-ink hover:bg-white">Lihat mata kuliah</a>}
          </article>
          <article className="rounded-[1.75rem] border border-ink/10 bg-white/80 p-6 lg:col-span-7" data-main-reveal>
            <p className="text-sm font-semibold text-moss">Cerita dari sesi kamu</p>
            <div className="mt-5 divide-y divide-ink/10">
              {metrics.courseProgress.filter((course) => course.plannedMinutes > 0).map((course) => (
                <details key={course.courseId} className="group py-4 first:pt-0 last:pb-0">
                  <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 font-bold">{course.courseName}<span className="text-sm font-semibold text-ink/50">{formatProgressMinutes(course.completedMinutes)}</span></summary>
                  <p className="mt-2 text-sm leading-6 text-ink/60">{course.completed} sesi selesai · {course.missed} tidak sempat · {course.partial} selesai sebagian.</p>
                </details>
              ))}
            </div>
            {metrics.strongestImprovement && <p className="mt-6 rounded-xl bg-sage/50 p-4 text-sm leading-6"><span className="font-semibold">Perkembangan kuat:</span> {metrics.strongestImprovement.courseName}. {metrics.strongestImprovement.message}</p>}
          </article>
        </section>
      )}

      {nextSession && <section className="mt-6 rounded-[1.75rem] bg-ink p-6 text-cream sm:flex sm:items-center sm:justify-between sm:gap-6" data-main-reveal><div><p className="text-sm font-semibold text-cream/60">Langkah belajar berikutnya</p><h2 className="mt-2 text-2xl font-bold tracking-[-0.04em]">{nextSession.courseName}</h2><p className="mt-1 text-sm text-cream/65">{formatDate(nextSession.date, setup.timezone)} · {nextSession.startTime} · {nextSession.duration} menit</p></div><a href={`/sesi/${encodeURIComponent(nextSession.sessionKey)}`} className="mt-5 inline-flex min-h-11 items-center justify-center rounded-xl bg-cream px-5 text-sm font-semibold text-ink hover:bg-white sm:mt-0">Mulai belajar</a></section>}
    </div>
  );
}
