"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Check,
  CircleUserRound,
  Leaf,
  LogOut,
  Sparkles,
} from "lucide-react";
import {
  createSupabaseBrowserClient,
  isSupabaseConfigured,
} from "@/lib/supabase/browser";
import { onboardingDataSchema } from "@/features/onboarding/state";
import type { OnboardingData } from "@/features/onboarding/types";

const STORAGE_KEY = "planify:onboarding:v1";

function readLocalSetup() {
  try {
    const parsed = onboardingDataSchema.parse(
      JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "null"),
    ) as OnboardingData;
    return parsed.planActive ? parsed : null;
  } catch {
    return null;
  }
}

export default function HariIniPage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [status, setStatus] = useState<"memuat" | "siap" | "tidak-valid">(
    "memuat",
  );
  const [setup, setSetup] = useState<OnboardingData | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function hydrate() {
      let validSetup = readLocalSetup();
      if (supabase) {
        const { data: authData } = await supabase.auth.getUser();
        if (authData.user) {
          const { data: semester } = await supabase
            .from("semesters")
            .select("setup_payload")
            .eq("user_id", authData.user.id)
            .eq("is_active", true)
            .order("updated_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          try {
            const remoteSetup = onboardingDataSchema.parse(
              semester?.setup_payload,
            ) as OnboardingData;
            validSetup = remoteSetup.planActive ? remoteSetup : null;
          } catch {
            // A missing or incomplete remote setup is not an active plan.
          }
        } else {
          validSetup = null;
        }
      }
      if (cancelled) return;
      if (!validSetup) {
        setStatus("tidak-valid");
        window.location.replace("/");
        return;
      }
      setSetup(validSetup);
      setStatus("siap");
    }
    void hydrate();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  async function logout() {
    if (supabase) await supabase.auth.signOut();
    window.location.replace("/");
  }

  if (status === "memuat") {
    return (
      <main className="grid min-h-screen place-items-center bg-cream">
        <div
          className="h-10 w-10 rounded-full border-4 border-moss border-t-transparent soft-pulse"
          aria-label="Memuat halaman"
        />
      </main>
    );
  }
  if (status === "tidak-valid" || !setup) return null;

  return (
    <main className="min-h-screen overflow-x-hidden bg-cream px-5 py-6 text-ink sm:px-10 sm:py-8">
      <div className="mx-auto max-w-4xl">
        <header className="flex items-center justify-between gap-4">
          <a
            href="/"
            className="flex items-center gap-2 text-lg font-bold tracking-[-0.04em]"
          >
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-moss text-cream">
              <Leaf size={18} />
            </span>
            Planify
          </a>
          {isSupabaseConfigured() && (
            <button
              type="button"
              onClick={logout}
              className="flex min-h-10 items-center gap-2 rounded-xl border border-ink/15 bg-white/60 px-3 text-sm font-semibold hover:bg-sage"
            >
              <LogOut size={16} />
              Keluar
            </button>
          )}
        </header>
        <section className="mt-20 rounded-[2rem] border border-ink/15 bg-white/80 p-6 shadow-soft sm:p-12">
          <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-sage text-moss">
            <Check size={30} />
          </div>
          <p className="mt-8 text-sm font-semibold text-coral">
            Persiapan selesai
          </p>
          <h1 className="mt-3 max-w-3xl text-5xl font-bold leading-[0.95] tracking-[-0.07em] sm:text-7xl">
            Kamu siap memberi ruang untuk belajar.
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-7 text-ink/65">
            Onboarding untuk {setup.courses.length} mata kuliah sudah tersimpan.
            Prioritas belajarmu sudah siap ditinjau sebelum jadwal sesi dibuat.
          </p>
          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl bg-cream p-4">
              <p className="text-xs font-semibold text-ink/50">Semester</p>
              <p className="mt-2 font-bold">{setup.semester}</p>
            </div>
            <div className="rounded-2xl bg-cream p-4">
              <p className="text-xs font-semibold text-ink/50">Beban studi</p>
              <p className="mt-2 font-bold">
                {setup.courses.reduce(
                  (total, course) => total + course.credits,
                  0,
                )}{" "}
                SKS
              </p>
            </div>
            <div className="rounded-2xl bg-cream p-4">
              <p className="text-xs font-semibold text-ink/50">Zona waktu</p>
              <p className="mt-2 truncate font-bold">{setup.timezone}</p>
            </div>
          </div>
          <div className="mt-8 rounded-2xl border border-coral/20 bg-coral/5 p-5">
            <div className="flex items-start gap-3">
              <Sparkles className="mt-1 shrink-0 text-coral" size={20} />
              <div>
                <p className="font-semibold">
                  Jadwal sesi belajar akan hadir di fase berikutnya.
                </p>
                <p className="mt-2 text-sm leading-6 text-ink/65">
                  Mesin prioritas sudah menyiapkan snapshot. Jadwal sesi dan
                  navigasi utama akan hadir pada fase berikutnya.
                </p>
              </div>
            </div>
          </div>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <a
              href="/"
              className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-moss px-5 font-semibold text-cream hover:bg-ink"
            >
              <ArrowLeft size={17} />
              Tinjau onboarding
            </a>
            {isSupabaseConfigured() && (
              <button
                type="button"
                onClick={logout}
                className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-ink/15 px-5 font-semibold hover:bg-sage"
              >
                <CircleUserRound size={17} />
                Keluar dari akun
              </button>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
