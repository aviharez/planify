"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  ChevronDown,
  CircleHelp,
  Clock3,
  FileCheck2,
  FileUp,
  ImagePlus,
  Leaf,
  LockKeyhole,
  LogOut,
  Minus,
  Pencil,
  Plus,
  RotateCcw,
  Sparkles,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  createSupabaseBrowserClient,
  isSupabaseConfigured,
} from "@/lib/supabase/browser";
import {
  initialOnboardingData,
  ONBOARDING_STEPS,
  DAYS,
  type AcademicEvent,
  type ActivityDensity,
  type Course,
  type FocusPeriod,
  type OnboardingData,
  type Procrastination,
  type StudyPlan,
  type TimeRange,
} from "./types";
import {
  canAdvance,
  jumpToStep,
  nextStep,
  onboardingDataSchema,
  previousStep,
} from "./state";
import {
  extractKrsFile,
  KrsExtractionService,
  type ExtractionProgress,
} from "@/features/krs/extraction";
import {
  buildPlanningSnapshot,
  dateInTimeZone,
  rankPriorities,
  calculatePriority,
} from "@/features/planning/priority";
import { generateStudyPlan } from "@/features/planning/scheduling";
import {
  applyEnrichments,
  enrichStudySessionsResultSchema,
  fallbackEnrichments,
} from "@/features/ai/provider";

gsap.registerPlugin(ScrollTrigger);

const STORAGE_KEY = "planify:onboarding:v1";
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_FILE_TYPES = ["application/pdf", "image/jpeg", "image/png"];

function mapAuthError(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (message.includes("invalid login credentials"))
    return "Email atau kata sandi belum sesuai.";
  if (message.includes("user already registered"))
    return "Email ini sudah terdaftar. Coba masuk.";
  if (
    message.includes("password should be at least") ||
    message.includes("password must be")
  )
    return "Kata sandi minimal 6 karakter.";
  if (message.includes("email not confirmed"))
    return "Konfirmasi email kamu sebelum masuk.";
  if (message.includes("rate limit") || message.includes("too many"))
    return "Terlalu banyak percobaan. Coba lagi beberapa saat.";
  if (message.includes("invalid email"))
    return "Periksa kembali alamat email kamu.";
  return "Akun belum berhasil diproses. Periksa data kamu lalu coba lagi.";
}

function uid(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

function minutesBetween(start: string, end: string) {
  const [startHour, startMinute] = start.split(":").map(Number);
  const [endHour, endMinute] = end.split(":").map(Number);
  return Math.max(0, endHour * 60 + endMinute - (startHour * 60 + startMinute));
}

function makeRange(day: string, start = "19:00", end = "20:30"): TimeRange {
  return { id: uid("range"), day, start, end };
}

function MotionLayer() {
  const root = useRef<HTMLDivElement>(null);
  useGSAP(
    () => {
      const words = gsap.utils.toArray<HTMLElement>("[data-reveal-word]");
      const reducedMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      if (reducedMotion) {
        gsap.set(words, { opacity: 1, y: 0 });
      } else if (words.length) {
        gsap.fromTo(
          words,
          { opacity: 0.18, y: 16 },
          {
            opacity: 1,
            y: 0,
            stagger: 0.1,
            ease: "none",
            scrollTrigger: {
              trigger: words[0].closest("main") ?? root.current,
              start: "top 78%",
              end: "bottom 28%",
              scrub: true,
            },
          },
        );
      }
      const pin = root.current?.querySelector<HTMLElement>("[data-pin]");
      if (pin && window.matchMedia("(min-width: 900px)").matches) {
        ScrollTrigger.create({
          trigger: root.current,
          pin,
          start: "top top+=80",
          end: "bottom bottom-=80",
        });
      }
    },
    { scope: root },
  );
  return (
    <div
      ref={root}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      <div
        data-pin
        className="absolute right-10 top-36 hidden h-28 w-28 rounded-full border border-moss/30 lg:block"
      >
        <span className="absolute inset-4 rounded-full bg-coral/20" />
      </div>
    </div>
  );
}

function ReflectionCarousel() {
  const [index, setIndex] = useState(0);
  const reflections = [
    [
      "Ruang untuk yang penting",
      "Bukan menambah jam belajar, tapi membantu memilih jam yang terasa mungkin.",
    ],
    [
      "Lebih manusiawi",
      "Kamu bisa mulai dari kondisi hari ini, lalu mengubahnya ketika minggu berubah.",
    ],
    [
      "Jelas sejak awal",
      "Setiap pilihanmu terlihat kembali sebelum prioritas dihitung.",
    ],
  ];
  const [title, body] = reflections[index];
  return (
    <section
      className="mt-10 border-t border-ink/15 pt-5"
      aria-label="Catatan dari mahasiswa"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-moss">{title}</p>
          <p className="mt-2 max-w-md text-sm leading-6 text-ink/70">
            “{body}”
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            aria-label="Catatan sebelumnya"
            onClick={() =>
              setIndex((index + reflections.length - 1) % reflections.length)
            }
            className="grid h-9 w-9 place-items-center rounded-full border border-ink/20 bg-cream hover:bg-sage"
          >
            <ArrowLeft size={15} />
          </button>
          <button
            type="button"
            aria-label="Catatan berikutnya"
            onClick={() => setIndex((index + 1) % reflections.length)}
            className="grid h-9 w-9 place-items-center rounded-full border border-ink/20 bg-cream hover:bg-sage"
          >
            <ArrowRight size={15} />
          </button>
        </div>
      </div>
      <div className="mt-4 flex gap-1" aria-hidden="true">
        {reflections.map((_, dotIndex) => (
          <span
            key={dotIndex}
            className={`h-1 rounded-full transition-all ${dotIndex === index ? "w-8 bg-coral" : "w-2 bg-ink/20"}`}
          />
        ))}
      </div>
    </section>
  );
}

function AuthPanel({
  onDemo,
  onAuthenticated,
}: {
  onDemo: () => void;
  onAuthenticated: () => void;
}) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const onAuthenticatedRef = useRef(onAuthenticated);
  const [mode, setMode] = useState<"masuk" | "daftar" | "atur-ulang">(() =>
    typeof window !== "undefined" &&
    window.location.hash.includes("type=recovery")
      ? "atur-ulang"
      : "daftar",
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    onAuthenticatedRef.current = onAuthenticated;
  }, [onAuthenticated]);

  useEffect(() => {
    if (!supabase) return;
    void supabase.auth.getSession().then(({ data }) => {
      if (data.session && !window.location.hash.includes("type=recovery"))
        onAuthenticatedRef.current();
    });
    const { data: listener } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === "PASSWORD_RECOVERY") {
          setMode("atur-ulang");
          setMessage("Buat kata sandi baru untuk akun kamu.");
          return;
        }
        if (window.location.hash.includes("type=recovery")) return;
        if (session) onAuthenticatedRef.current();
      },
    );
    return () => listener.subscription.unsubscribe();
  }, [supabase]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return onDemo();
    setBusy(true);
    setMessage("");
    if (mode === "atur-ulang") {
      if (password !== confirmPassword) {
        setBusy(false);
        return setMessage("Kata sandi baru belum sama.");
      }
      const result = await supabase.auth.updateUser({ password });
      setBusy(false);
      if (result.error) return setMessage(mapAuthError(result.error));
      await supabase.auth.signOut();
      setMode("masuk");
      setPassword("");
      setConfirmPassword("");
      return setMessage("Kata sandi sudah diperbarui. Silakan masuk kembali.");
    }
    const result =
      mode === "daftar"
        ? await supabase.auth.signUp({ email, password })
        : await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (result.error) setMessage(mapAuthError(result.error));
    else if (mode === "daftar")
      setMessage(
        "Pendaftaran berhasil. Periksa email kamu jika verifikasi diminta.",
      );
    if (!result.error && mode === "masuk") onAuthenticated();
  }

  async function resetPassword() {
    if (!supabase || !email)
      return setMessage("Masukkan email terlebih dahulu.");
    setBusy(true);
    const result = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/`,
    });
    setBusy(false);
    setMessage(
      result.error
        ? mapAuthError(result.error)
        : "Tautan untuk mengatur ulang kata sandi sudah dikirim.",
    );
  }

  return (
    <div className="rounded-[2rem] border border-ink/15 bg-cream/90 p-6 shadow-soft sm:p-8">
      <div className="flex items-center gap-3">
        <div className="grid h-11 w-11 place-items-center rounded-2xl bg-moss text-cream">
          <LockKeyhole size={19} />
        </div>
        <div>
          <p className="text-sm font-semibold text-moss">
            {isSupabaseConfigured() ? "Akun Planify" : "Mode demo lokal"}
          </p>
          <p className="text-xs text-ink/60">
            {isSupabaseConfigured()
              ? "Progresmu tersimpan di Supabase."
              : "Tidak perlu akun untuk mencoba alur."}
          </p>
        </div>
      </div>
      <form onSubmit={submit} className="mt-6 space-y-4">
        <label className="block text-sm font-semibold">
          Email
          <input
            required={mode !== "atur-ulang"}
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="nama@kampus.ac.id"
            className="mt-2 h-12 w-full rounded-xl border border-ink/15 bg-white px-4 text-base font-normal outline-none transition placeholder:text-ink/35 focus:border-moss"
          />
        </label>
        <label className="block text-sm font-semibold">
          {mode === "atur-ulang" ? "Kata sandi baru" : "Kata sandi"}
          <input
            required
            minLength={6}
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Minimal 6 karakter"
            className="mt-2 h-12 w-full rounded-xl border border-ink/15 bg-white px-4 text-base font-normal outline-none transition placeholder:text-ink/35 focus:border-moss"
          />
        </label>
        {mode === "atur-ulang" && (
          <label className="block text-sm font-semibold">
            Ulangi kata sandi baru
            <input
              required
              minLength={6}
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="Ulangi kata sandi"
              className="mt-2 h-12 w-full rounded-xl border border-ink/15 bg-white px-4 text-base font-normal outline-none transition placeholder:text-ink/35 focus:border-moss"
            />
          </label>
        )}
        {message && (
          <p
            role="status"
            className="rounded-xl bg-coral/10 p-3 text-sm leading-5 text-ink"
          >
            {message}
          </p>
        )}
        <Button
          disabled={busy}
          type="submit"
          className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-moss px-4 font-semibold text-cream transition hover:bg-ink disabled:cursor-wait disabled:opacity-60"
        >
          {busy
            ? "Menyiapkan..."
            : mode === "daftar"
              ? "Buat akun"
              : mode === "atur-ulang"
                ? "Simpan kata sandi baru"
                : "Masuk"}
          <ArrowRight size={17} />
        </Button>
      </form>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-2 text-sm">
        <button
          type="button"
          onClick={() =>
            setMode(
              mode === "atur-ulang"
                ? "masuk"
                : mode === "daftar"
                  ? "masuk"
                  : "daftar",
            )
          }
          className="font-semibold text-moss underline-offset-4 hover:underline"
        >
          {mode === "atur-ulang"
            ? "Kembali ke masuk"
            : mode === "daftar"
              ? "Sudah punya akun? Masuk"
              : "Belum punya akun? Daftar"}
        </button>
        {mode === "masuk" && (
          <button
            type="button"
            onClick={resetPassword}
            className="text-ink/65 underline-offset-4 hover:underline"
          >
            Lupa kata sandi?
          </button>
        )}
      </div>
      <div className="my-6 flex items-center gap-3 text-xs uppercase tracking-[0.14em] text-ink/40">
        <span className="h-px flex-1 bg-ink/15" />
        atau
        <span className="h-px flex-1 bg-ink/15" />
      </div>
      <button
        type="button"
        onClick={onDemo}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-ink/20 bg-transparent px-4 font-semibold text-ink transition hover:border-moss hover:bg-sage/40"
      >
        <Sparkles size={17} />
        Coba mode demo
      </button>
    </div>
  );
}

function StepHeader({ data }: { data: OnboardingData }) {
  return (
    <div className="mb-8 flex items-end justify-between gap-5">
      <div>
        <p className="text-sm font-semibold text-moss">
          Langkah {data.step + 1} dari 6
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-[-0.04em] text-ink sm:text-4xl">
          {ONBOARDING_STEPS[data.step]}
        </h1>
      </div>
      <div className="hidden text-right sm:block">
        <p className="text-xs uppercase tracking-[0.16em] text-ink/45">
          Ruang untuk bertumbuh
        </p>
        <div className="mt-3 h-1.5 w-36 overflow-hidden rounded-full bg-ink/10">
          <div
            className="h-full rounded-full bg-coral transition-all duration-500"
            style={{ width: `${((data.step + 1) / 6) * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
}

type BrowserSupabase = ReturnType<typeof createSupabaseBrowserClient>;

async function storeKrsDocument(
  supabase: BrowserSupabase,
  file: File,
  extraction: Awaited<ReturnType<typeof extractKrsFile>>,
) {
  if (!supabase) return { warning: "" };
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return { warning: "" };
  const { data: semester } = await supabase
    .from("semesters")
    .select("id")
    .eq("user_id", authData.user.id)
    .eq("is_active", true)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!semester?.id)
    return { warning: "Berkas belum disimpan karena semester aktif belum tersedia. Hasil baca tetap aman." };
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "-");
  const path = `${authData.user.id}/${crypto.randomUUID()}-${safeName}`;
  const upload = await supabase.storage.from("krs").upload(path, file, {
    contentType: file.type,
    upsert: false,
  });
  if (upload.error)
    return { warning: "Hasil sudah terbaca, tetapi berkas asli belum berhasil disimpan. Kamu bisa mencobanya lagi nanti." };
  const inserted = await supabase
    .from("krs_documents")
    .insert({
      semester_id: semester.id,
      user_id: authData.user.id,
      storage_path: path,
      file_name: file.name,
      mime_type: file.type,
      file_size: file.size,
      extraction_status: "completed",
      extraction_source: extraction.source,
      extraction_confidence: extraction.confidence,
      ocr_confidence: extraction.ocrConfidence ?? null,
      needs_verification: extraction.needsVerification,
      academic_period: extraction.academicPeriod ?? null,
      total_courses: extraction.totalCourses ?? null,
      total_credits: extraction.totalCredits ?? null,
      page_count: extraction.pageCount,
      extracted_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (inserted.error) {
    try {
      const removed = await supabase.storage.from("krs").remove([path]);
      if (removed.error)
        return { warning: "Metadata KRS belum tercatat. Berkas asli belum berhasil dibersihkan; coba simpan lagi nanti." };
    } catch {
      return { warning: "Metadata KRS belum tercatat. Berkas asli belum berhasil dibersihkan; coba simpan lagi nanti." };
    }
    return { warning: "Berkas asli tidak sepenuhnya tersimpan dan sudah dihapus. Hasil baca tetap aman." };
  }
  return { path, documentId: inserted.data?.id };
}

async function storePlanningSnapshot(
  supabase: BrowserSupabase,
  snapshot: NonNullable<OnboardingData["planningSnapshot"]>,
) {
  if (!supabase) return "";
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return "";
  const { data: semester } = await supabase
    .from("semesters")
    .select("id")
    .eq("user_id", authData.user.id)
    .eq("is_active", true)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!semester?.id) return "Snapshot belum tersimpan karena semester aktif belum tersedia.";
  const result = await supabase.from("planning_snapshots").insert({
    user_id: authData.user.id,
    semester_id: semester.id,
    reason: snapshot.reason,
    priority_weights: snapshot.weights,
    course_factors: snapshot.courseFactors,
    availability_snapshot: snapshot.availability,
    planning_period_start: snapshot.planningPeriod.start,
    planning_period_end: snapshot.planningPeriod.end,
    generated_at: snapshot.generatedAt,
  });
  return result.error ? "Snapshot prioritas belum tersimpan. Data onboarding tetap aman dan kamu bisa mencoba lagi." : "";
}

async function storeStudyPlan(
  supabase: BrowserSupabase,
  plan: StudyPlan,
) {
  if (!supabase) return { warning: "" };
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return { warning: "" };
  const { data: semester } = await supabase
    .from("semesters")
    .select("id")
    .eq("user_id", authData.user.id)
    .eq("is_active", true)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!semester?.id)
    return { warning: "Rencana tersimpan di perangkat, tetapi semester aktif belum tersedia untuk penyimpanan akun." };
  const inserted = await supabase
    .from("study_plans")
    .insert({
      user_id: authData.user.id,
      semester_id: semester.id,
      priority_snapshot: plan.prioritySnapshot,
      capacity_policy: plan.capacityPolicy,
      weekly_capacity_minutes: plan.weeklyCapacityMinutes,
      planning_period_start: plan.planningPeriod.start,
      planning_period_end: plan.planningPeriod.end,
      generated_at: plan.generatedAt,
    })
    .select("id")
    .single();
  if (inserted.error || !inserted.data?.id)
    return { warning: "Rencana tersusun, tetapi belum berhasil disimpan ke akun. Data lokal tetap aman." };
  const sessions = plan.sessions.map((session) => ({
    study_plan_id: inserted.data.id,
    user_id: authData.user.id,
    semester_id: semester.id,
    course_key: session.courseId,
    course_code: session.courseCode,
    course_name: session.courseName,
    session_key: session.sessionKey,
    session_date: session.date,
    start_time: session.startTime,
    end_time: session.endTime,
    duration_minutes: session.duration,
    status: session.status,
    priority_snapshot: session.prioritySnapshot,
    study_method: session.studyMethod ?? null,
    study_goal: session.studyGoal ?? null,
    explanation: session.explanation ?? null,
    completed_at: session.completedAt ?? null,
  }));
  if (sessions.length) {
    const result = await supabase.from("study_sessions").insert(sessions);
    if (result.error)
      return { warning: "Rencana tersusun, tetapi sesi belum berhasil disimpan ke akun. Data lokal tetap aman." };
  }
  return { remoteId: inserted.data.id, warning: "" };
}

function KrsStep({
  data,
  update,
  supabase,
  authenticated,
}: {
  data: OnboardingData;
  update: (patch: Partial<OnboardingData>) => void;
  supabase: BrowserSupabase;
  authenticated: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const [processing, setProcessing] = useState(false);
  const [stage, setStage] = useState(
    data.krsExtraction?.status === "completed" || data.krsExtraction?.status === "manual" ? 3 : 0,
  );
  const extractionService = useMemo(() => new KrsExtractionService(), []);

  async function selectFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    event.target.value = "";
    if (!ALLOWED_FILE_TYPES.includes(file.type))
      return setError("Gunakan PDF, JPG, JPEG, atau PNG.");
    if (file.size > MAX_FILE_SIZE)
      return setError("Ukuran berkas maksimal 10 MB.");
    setError("");
    setWarning("");
    setProcessing(true);
    setStage(1);
    update({
      krsFileName: file.name,
      krsFileType: file.type,
      krsFileSize: file.size,
      krsUploadedAt: new Date().toISOString(),
      krsExtraction: {
        source: file.type === "application/pdf" ? "pdf-text" : "ocr",
        status: "processing",
        confidence: 0,
        needsVerification: true,
        conflicts: [],
      },
    });
    try {
      const extraction = await extractionService.extract(file, {
        onProgress: (progress: ExtractionProgress) => {
          setStage(progress.progress >= 0.9 ? 3 : progress.progress >= 0.45 ? 2 : 1);
        },
      });
      const courses = extraction.candidates.map((candidate, index) => ({
        id: `course-${candidate.code.toLowerCase()}-${index}`,
        code: candidate.code,
        name: candidate.name,
        credits: candidate.credits,
        semester: candidate.semester,
        status: candidate.status,
        confidence: candidate.confidence,
        needsVerification: candidate.needsVerification,
      }));
      let storage: Awaited<ReturnType<typeof storeKrsDocument>> = { warning: "" };
      if (authenticated && supabase) {
        try {
          storage = await storeKrsDocument(supabase, file, extraction);
        } catch {
          storage = {
            warning: "Hasil sudah terbaca, tetapi berkas asli belum berhasil disimpan. Kamu bisa mencobanya lagi nanti.",
          };
        }
      }
      setStage(3);
      setProcessing(false);
      setWarning(storage.warning ?? "");
      update({
        courses,
        semester: extraction.academicPeriod ?? data.semester,
        krsExtraction: {
          source: extraction.source,
          status: "completed",
          confidence: extraction.confidence,
          ocrConfidence: extraction.ocrConfidence,
          needsVerification: extraction.needsVerification,
          academicPeriod: extraction.academicPeriod,
          totalCourses: extraction.totalCourses,
          totalCredits: extraction.totalCredits,
          pageCount: extraction.pageCount,
          rawTextLength: extraction.rawTextLength,
          conflicts: extraction.conflicts,
        },
        krsStoragePath: storage.path,
        krsDocumentId: storage.documentId,
      });
    } catch {
      setProcessing(false);
      setStage(0);
      update({
        krsExtraction: {
          source: file.type === "application/pdf" ? "pdf-text" : "ocr",
          status: "failed",
          confidence: 0,
          needsVerification: true,
          conflicts: [],
          error: "Dokumen belum berhasil dibaca.",
        },
      });
      setError("KRS belum berhasil dibaca. Coba unggah berkas yang lebih jelas atau isi mata kuliah secara manual.");
    }
  }

  function useManual() {
    setError("");
    update({
      krsFileName: "KRS diisi manual",
      krsFileType: "manual",
      krsFileSize: 0,
      krsUploadedAt: new Date().toISOString(),
      krsExtraction: {
        source: "manual",
        status: "manual",
        confidence: 1,
        needsVerification: true,
        conflicts: [],
      },
      courses: data.courses.length
        ? data.courses
        : [{ id: uid("course"), code: "", name: "", credits: 3, semester: 3 }],
    });
    setStage(3);
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1.12fr_.88fr] lg:items-start">
      <div>
        <p className="max-w-xl text-2xl font-semibold leading-tight tracking-[-0.03em] sm:text-3xl">
          Mari mulai dari KRS kamu.{" "}
          <span className="text-coral">
            Kita beri bentuk pada minggu yang ingin kamu jalani.
          </span>
        </p>
        <p className="mt-5 max-w-lg text-base leading-7 text-ink/65">
          Kami akan menggunakan KRS untuk mengetahui mata kuliah dan beban studi
          yang kamu ambil semester ini.
        </p>
        <div className="mt-8 rounded-[1.75rem] border border-ink/15 bg-white/70 p-5 sm:p-7">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-moss">
                Satu berkas untuk memulai
              </p>
              <p className="mt-2 text-sm leading-6 text-ink/60">
                Kamu tetap memeriksa semua mata kuliah sebelum lanjut.
              </p>
            </div>
            <FileCheck2 className="text-coral" size={24} />
          </div>
          <input
            ref={inputRef}
            onChange={selectFile}
            type="file"
            accept="application/pdf,image/jpeg,image/png"
            className="sr-only"
            id="krs-file"
          />
          <div className="mt-6">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="flex min-h-14 items-center justify-center gap-2 rounded-xl bg-moss px-5 font-semibold text-cream transition hover:bg-ink"
            >
              <Upload size={18} />
              Unggah KRS
            </button>
          </div>
          <button
            type="button"
            onClick={useManual}
            className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-ink/25 px-4 text-sm font-semibold text-moss hover:border-moss hover:bg-sage/30"
          >
            <Pencil size={16} />
            Isi mata kuliah secara manual
          </button>
          <div className="mt-4 flex flex-wrap gap-2 text-xs text-ink/55">
            <span className="rounded-full bg-sage/60 px-3 py-1.5">
              Ambil Foto
            </span>
            <span className="rounded-full bg-sage/60 px-3 py-1.5">
              Pilih Galeri
            </span>
            <span className="rounded-full bg-sage/60 px-3 py-1.5">
              PDF sampai 10 MB
            </span>
          </div>
          {error && (
            <p
              role="alert"
              className="mt-4 rounded-xl bg-coral/10 p-3 text-sm text-coral"
            >
              {error}
            </p>
          )}
          {warning && (
            <p role="status" className="mt-4 rounded-xl bg-sand p-3 text-sm text-ink">
              {warning}
            </p>
          )}
          {data.krsFileName && (
            <div className="mt-6 border-t border-ink/10 pt-5">
              <div className="flex items-center gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-sage">
                  <FileUp size={18} />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">
                    {data.krsFileName}
                  </p>
                  <p className="text-xs text-ink/55">
                    {data.krsFileSize
                      ? `${(data.krsFileSize / 1024).toFixed(0)} KB`
                      : "Isi manual"}{" "}
                    · hasil baca siap diperiksa
                  </p>
                </div>
                {!processing && (
                  <Check className="ml-auto text-moss" size={18} />
                )}
              </div>
              <div
                className="mt-5 flex flex-col gap-2 text-sm sm:flex-row"
                role="list"
                aria-label="Tahapan pembacaan KRS"
                aria-live="polite"
              >
                {[
                  ["Dokumen siap diperiksa", "Berkas dibuka"],
                  ["Mencari mata kuliah yang kamu ambil", "Isi dokumen dikenali"],
                  ["Menyiapkan hasil", "Data siap kamu periksa"],
                ].map(([label, detail], index) => {
                  const completed = stage > index;
                  const current = processing && stage === index + 1;
                  return (
                    <div
                      key={label}
                      role="listitem"
                      aria-current={current ? "step" : undefined}
                      className={`accordion-panel min-w-0 flex-1 rounded-xl border p-3 ${completed ? "border-moss/30 bg-sage/40 text-moss" : current ? "border-coral/40 bg-coral/5 text-ink" : "border-ink/10 bg-cream/60 text-ink/40"}`}
                    >
                      <div className="flex items-center gap-3">
                        {completed ? (
                          <Check size={16} />
                        ) : current ? (
                          <span className="h-4 w-4 rounded-full border-2 border-coral border-t-transparent soft-pulse" />
                        ) : (
                          <span className="h-4 w-4 rounded-full border border-ink/20" />
                        )}
                        <span className="font-semibold">{label}</span>
                      </div>
                      <p className="mt-2 pl-7 text-xs opacity-75">
                        {completed ? "Selesai" : current ? "Sedang berlangsung" : detail}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
        <div className="mt-4 flex items-start gap-2 text-xs leading-5 text-ink/55">
          <LockKeyhole size={15} className="mt-0.5 shrink-0 text-moss" />
          {authenticated
            ? "Berkas asli disimpan privat di Supabase saat berhasil diunggah."
            : "Mode lokal memproses berkas di perangkat ini dan tidak mengunggahnya."}
        </div>
      </div>
      <div className="relative overflow-hidden rounded-[2rem] bg-moss p-7 text-cream shadow-soft sm:p-9">
        <div className="absolute -right-14 -top-16 h-48 w-48 rounded-full border-[18px] border-sage/20" />
        <div className="absolute bottom-8 right-8 h-28 w-28 rounded-full bg-coral/20 blur-2xl" />
        <div className="relative">
          <p className="text-sm font-semibold text-sage">
            Kamu tidak harus sempurna di awal.
          </p>
          <h2 className="mt-5 max-w-md text-4xl font-bold leading-[0.98] tracking-[-0.06em] sm:text-5xl">
            Mulai dari data yang sudah kamu punya.
          </h2>
          <p className="mt-6 max-w-sm text-sm leading-6 text-cream/70">
            Kamu bisa memeriksa hasil baca, mengubahnya, atau beralih ke isian
            manual kapan saja.
          </p>
          <div className="mt-10 flex items-center gap-3 text-sm text-cream/70">
            <div className="grid h-10 w-10 place-items-center rounded-full bg-cream/10">
              <ImagePlus size={18} />
            </div>
            <span>PDF, JPG, JPEG, PNG</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function CourseForm({
  course,
  onSave,
  onCancel,
}: {
  course?: Course;
  onSave: (course: Course) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<Course>(
    course ?? {
      id: uid("course"),
      code: "",
      name: "",
      credits: 3,
      semester: 3,
    },
  );
  return (
    <div className="rounded-2xl border border-coral/30 bg-coral/5 p-4">
      <div className="grid gap-3 sm:grid-cols-[.7fr_1.4fr_.5fr_.5fr_auto]">
        <label className="text-xs font-semibold text-ink/65">
          Kode
          <input
            value={draft.code}
            onChange={(event) =>
              setDraft({ ...draft, code: event.target.value })
            }
            className="mt-1 h-11 w-full rounded-lg border border-ink/15 bg-white px-3 text-sm"
          />
        </label>
        <label className="text-xs font-semibold text-ink/65">
          Nama mata kuliah
          <input
            value={draft.name}
            onChange={(event) =>
              setDraft({ ...draft, name: event.target.value })
            }
            className="mt-1 h-11 w-full rounded-lg border border-ink/15 bg-white px-3 text-sm"
          />
        </label>
        <label className="text-xs font-semibold text-ink/65">
          SKS
          <input
            min={1}
            max={12}
            type="number"
            value={draft.credits}
            onChange={(event) =>
              setDraft({ ...draft, credits: Number(event.target.value) })
            }
            className="mt-1 h-11 w-full rounded-lg border border-ink/15 bg-white px-3 text-sm"
          />
        </label>
        <label className="text-xs font-semibold text-ink/65">
          Semester
          <input
            min={1}
            max={20}
            type="number"
            value={draft.semester}
            onChange={(event) =>
              setDraft({ ...draft, semester: Number(event.target.value) })
            }
            className="mt-1 h-11 w-full rounded-lg border border-ink/15 bg-white px-3 text-sm"
          />
        </label>
        <div className="flex items-end gap-2">
          <button
            type="button"
            onClick={() =>
              draft.code.trim() &&
              draft.name.trim() &&
              onSave({
                ...draft,
                code: draft.code.trim().toUpperCase(),
                name: draft.name.trim(),
              })
            }
            className="h-11 rounded-lg bg-moss px-4 text-sm font-semibold text-cream"
          >
            Simpan
          </button>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Batalkan perubahan"
            className="grid h-11 w-11 place-items-center rounded-lg border border-ink/15"
          >
            <X size={17} />
          </button>
        </div>
      </div>
    </div>
  );
}

function CoursesStep({
  data,
  update,
}: {
  data: OnboardingData;
  update: (patch: Partial<OnboardingData>) => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const totalCredits = data.courses.reduce(
    (sum, course) => sum + course.credits,
    0,
  );
  function saveCourse(course: Course) {
    update({
      courses: data.courses.some((item) => item.id === course.id)
        ? data.courses.map((item) => (item.id === course.id ? course : item))
        : [...data.courses, course],
    });
    setEditing(null);
    setAdding(false);
  }
  return (
    <div className="max-w-4xl">
      <p className="max-w-xl text-2xl font-semibold leading-tight tracking-[-0.03em] sm:text-3xl">
        Kami menemukan{" "}
        <span className="text-coral">{data.courses.length} mata kuliah</span>.
      </p>
      <p className="mt-4 max-w-lg text-base leading-7 text-ink/65">
        Pastikan data berikut sudah benar sebelum kita melihat bentuk minggu
        kamu.
      </p>
      {data.krsExtraction?.needsVerification && (
        <p role="status" className="mt-5 rounded-xl border border-coral/30 bg-coral/5 p-3 text-sm leading-6 text-ink">
          Beberapa hasil baca perlu kamu periksa lebih teliti sebelum
          melanjutkan.
          {data.krsExtraction.conflicts.length > 0 &&
            ` Ada ${data.krsExtraction.conflicts.length} perbedaan data yang ditandai.`}
        </p>
      )}
      <div className="mt-8 divide-y divide-ink/10 rounded-[1.75rem] border border-ink/15 bg-white/70">
        {data.courses.map((course) => (
          <div
            key={course.id}
            className={`p-5 sm:p-6 ${course.needsVerification ? "bg-coral/5" : ""}`}
          >
            {editing === course.id ? (
              <CourseForm
                course={course}
                onSave={saveCourse}
                onCancel={() => setEditing(null)}
              />
            ) : (
              <div className="flex items-center gap-4">
                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-sage font-bold text-moss">
                  {course.code.slice(-2)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{course.code}</p>
                  <p className="mt-1 truncate text-sm text-ink/70">
                    {course.name}
                  </p>
                  <p className="mt-1 text-xs text-ink/50">
                    {course.credits} SKS · Semester {course.semester}
                    {course.status ? ` · ${course.status}` : ""}
                  </p>
                  {course.needsVerification && (
                    <p className="mt-1 text-xs font-semibold text-coral">
                      Perlu diperiksa
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setEditing(course.id)}
                  className="flex h-10 items-center gap-2 rounded-lg px-3 text-sm font-semibold text-moss hover:bg-sage/50"
                >
                  <Pencil size={15} />
                  Ubah
                </button>
                <button
                  type="button"
                  onClick={() =>
                    update({
                      courses: data.courses.filter(
                        (item) => item.id !== course.id,
                      ),
                      evaluations: Object.fromEntries(
                        Object.entries(data.evaluations).filter(
                          ([id]) => id !== course.id,
                        ),
                      ),
                      academicEvents: data.academicEvents.filter(
                        (event) => event.courseId !== course.id,
                      ),
                    })
                  }
                  aria-label={`Hapus ${course.name}`}
                  className="grid h-10 w-10 place-items-center rounded-lg text-ink/40 hover:bg-coral/10 hover:text-coral"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            )}
          </div>
        ))}
        {adding && (
          <div className="p-5">
            <CourseForm onSave={saveCourse} onCancel={() => setAdding(false)} />
          </div>
        )}
      </div>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-moss p-5 text-cream">
        <p className="font-semibold">
          {data.courses.length} Mata Kuliah{" "}
          <span className="font-normal text-cream/60">
            · {totalCredits} SKS
          </span>
        </p>
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="flex h-11 items-center gap-2 rounded-xl bg-cream px-4 text-sm font-semibold text-ink hover:bg-sage"
        >
          <Plus size={17} />
          Tambah Mata Kuliah
        </button>
      </div>
    </div>
  );
}

function TimeRangeEditor({
  ranges,
  onChange,
  emptyLabel = "Belum ada waktu",
}: {
  ranges: TimeRange[];
  onChange: (ranges: TimeRange[]) => void;
  emptyLabel?: string;
}) {
  return (
    <div className="space-y-3">
      {ranges.length === 0 && (
        <p className="rounded-xl border border-dashed border-ink/20 p-4 text-sm text-ink/50">
          {emptyLabel}
        </p>
      )}
      {ranges.map((range) => (
        <div
          key={range.id}
          className="grid gap-2 rounded-xl border border-ink/10 bg-cream/70 p-3 sm:grid-cols-[1fr_.8fr_.8fr_auto] sm:items-end"
        >
          <label className="text-xs font-semibold text-ink/60">
            Hari
            <select
              value={range.day}
              onChange={(event) =>
                onChange(
                  ranges.map((item) =>
                    item.id === range.id
                      ? { ...item, day: event.target.value }
                      : item,
                  ),
                )
              }
              className="mt-1 h-11 w-full rounded-lg border border-ink/15 bg-white px-3 text-sm"
            >
              <option value="">Pilih hari</option>
              {DAYS.map((day) => (
                <option key={day}>{day}</option>
              ))}
            </select>
          </label>
          <label className="text-xs font-semibold text-ink/60">
            Mulai
            <input
              type="time"
              value={range.start}
              onChange={(event) =>
                onChange(
                  ranges.map((item) =>
                    item.id === range.id
                      ? { ...item, start: event.target.value }
                      : item,
                  ),
                )
              }
              className="mt-1 h-11 w-full rounded-lg border border-ink/15 bg-white px-3 text-sm"
            />
          </label>
          <label className="text-xs font-semibold text-ink/60">
            Selesai
            <input
              type="time"
              value={range.end}
              onChange={(event) =>
                onChange(
                  ranges.map((item) =>
                    item.id === range.id
                      ? { ...item, end: event.target.value }
                      : item,
                  ),
                )
              }
              className="mt-1 h-11 w-full rounded-lg border border-ink/15 bg-white px-3 text-sm"
            />
          </label>
          <button
            type="button"
            onClick={() =>
              onChange(ranges.filter((item) => item.id !== range.id))
            }
            aria-label="Hapus waktu"
            className="grid h-11 w-11 place-items-center rounded-lg text-ink/40 hover:bg-coral/10 hover:text-coral"
          >
            <Trash2 size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}

function ScheduleStep({
  data,
  update,
}: {
  data: OnboardingData;
  update: (patch: Partial<OnboardingData>) => void;
}) {
  const [selectedDay, setSelectedDay] = useState("Senin");
  const applyPreset = (preset: "malam" | "akhir-pekan") =>
    update({
      availability:
        preset === "malam"
          ? [
              makeRange("Senin", "19:00", "21:00"),
              makeRange("Selasa", "19:00", "21:00"),
              makeRange("Rabu", "19:00", "21:00"),
              makeRange("Kamis", "19:00", "21:00"),
            ]
          : [
              makeRange("Sabtu", "09:00", "12:00"),
              makeRange("Minggu", "09:00", "12:00"),
            ],
    });
  const updateClass = (courseId: string, ranges: TimeRange[]) =>
    update({ classSchedules: { ...data.classSchedules, [courseId]: ranges } });
  return (
    <div className="max-w-5xl">
      <p className="max-w-2xl text-2xl font-semibold leading-tight tracking-[-0.03em] sm:text-3xl">
        Kita cari{" "}
        <span className="text-coral">ruang yang benar-benar tersedia</span>,
        bukan setiap menit kosong.
      </p>
      <p className="mt-4 max-w-xl text-base leading-7 text-ink/65">
        Jadwal kuliah menjadi batas tetap. Waktu belajar bisa kamu ubah kapan
        pun.
      </p>
      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section className="rounded-[1.75rem] border border-ink/15 bg-white/70 p-5 sm:p-7">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold tracking-[-0.03em]">
                Jadwal Kuliah
              </h2>
              <p className="mt-2 text-sm leading-6 text-ink/60">
                Kami tidak akan menaruh belajar di waktu yang bertabrakan.
              </p>
            </div>
            <CalendarDays className="text-coral" size={24} />
          </div>
          <div className="mt-6 space-y-4">
            {data.courses.map((course) => (
              <div
                key={course.id}
                className="rounded-2xl border border-ink/10 bg-cream/70 p-4"
              >
                <p className="font-semibold">{course.name}</p>
                <TimeRangeEditor
                  ranges={data.classSchedules[course.id] ?? []}
                  onChange={(ranges) => updateClass(course.id, ranges)}
                  emptyLabel="Belum ditambahkan"
                />
                <button
                  type="button"
                  onClick={() =>
                    updateClass(course.id, [
                      ...(data.classSchedules[course.id] ?? []),
                      makeRange("Senin", "08:00", "10:00"),
                    ])
                  }
                  className="mt-3 flex min-h-10 items-center gap-2 rounded-lg px-2 text-sm font-semibold text-moss hover:bg-sage/50"
                >
                  <Plus size={16} />
                  Tambah Jadwal
                </button>
              </div>
            ))}
          </div>
        </section>
        <section className="rounded-[1.75rem] border border-ink/15 bg-white/70 p-5 sm:p-7">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold tracking-[-0.03em]">
                Waktu Belajar Tersedia
              </h2>
              <p className="mt-2 text-sm leading-6 text-ink/60">
                Pilih pola awal, lalu sesuaikan satu per satu.
              </p>
            </div>
            <Clock3 className="text-coral" size={24} />
          </div>
          <div className="mt-6 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => applyPreset("malam")}
              className="rounded-full border border-ink/15 px-3 py-2 text-xs font-semibold hover:border-moss hover:bg-sage/50"
            >
              Malam Hari Kerja
            </button>
            <button
              type="button"
              onClick={() => applyPreset("akhir-pekan")}
              className="rounded-full border border-ink/15 px-3 py-2 text-xs font-semibold hover:border-moss hover:bg-sage/50"
            >
              Pagi Akhir Pekan
            </button>
            <button
              type="button"
              onClick={() => update({ availability: [] })}
              className="rounded-full border border-ink/15 px-3 py-2 text-xs font-semibold hover:border-moss hover:bg-sage/50"
            >
              Atur Sendiri
            </button>
          </div>
          <div className="mt-5 flex gap-1 overflow-x-auto pb-2">
            {DAYS.map((day) => (
              <button
                type="button"
                key={day}
                onClick={() => setSelectedDay(day)}
                className={`min-w-12 rounded-xl px-2 py-3 text-xs font-semibold transition ${selectedDay === day ? "bg-moss text-cream" : "bg-sage/50 text-moss hover:bg-sage"}`}
              >
                {day.slice(0, 3)}
              </button>
            ))}
          </div>
          <TimeRangeEditor
            ranges={data.availability}
            onChange={(ranges) => update({ availability: ranges })}
            emptyLabel="Belum ada waktu belajar"
          />
          <button
            type="button"
            onClick={() =>
              update({
                availability: [...data.availability, makeRange(selectedDay)],
              })
            }
            className="mt-3 flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm font-semibold text-moss hover:bg-sage/50"
          >
            <Plus size={16} />
            Tambah Waktu
          </button>
          <div className="mt-6 rounded-2xl bg-sage/50 p-4 text-sm text-ink/70">
            <p className="font-semibold text-moss">Waktu yang kamu pilih</p>
            <p className="mt-1">
              {Math.round(
                data.availability.reduce(
                  (sum, range) => sum + minutesBetween(range.start, range.end),
                  0,
                ) / 60,
              )}{" "}
              jam per minggu tersedia untuk diatur.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}

function HabitsStep({
  data,
  update,
}: {
  data: OnboardingData;
  update: (patch: Partial<OnboardingData>) => void;
}) {
  const focusPeriods: FocusPeriod[] = ["Pagi", "Siang", "Sore", "Malam"];
  const densities: ActivityDensity[] = [
    "Sangat Longgar",
    "Cukup Longgar",
    "Seimbang",
    "Padat",
    "Sangat Padat",
  ];
  const procrastinations: Procrastination[] = [
    "Jarang",
    "Kadang-kadang",
    "Sering",
    "Sangat Sering",
  ];
  return (
    <div className="max-w-4xl">
      <p className="max-w-2xl text-2xl font-semibold leading-tight tracking-[-0.03em] sm:text-3xl">
        Sedikit konteks membuat rencana terasa{" "}
        <span className="text-coral">lebih masuk akal.</span>
      </p>
      <p className="mt-4 max-w-xl text-base leading-7 text-ink/65">
        Jawab singkat. Tidak ada jawaban yang perlu dinilai benar atau salah.
      </p>
      <div className="mt-8 grid gap-5 md:grid-cols-2">
        <section className="rounded-[1.5rem] border border-ink/15 bg-white/70 p-5 sm:p-6">
          <h2 className="text-lg font-bold">Kapan kamu paling fokus?</h2>
          <p className="mt-2 text-sm text-ink/60">
            Boleh pilih lebih dari satu.
          </p>
          <div className="mt-5 grid grid-cols-2 gap-2">
            {focusPeriods.map((period) => {
              const selected = data.focusPeriods.includes(period);
              return (
                <button
                  type="button"
                  key={period}
                  onClick={() =>
                    update({
                      focusPeriods: selected
                        ? data.focusPeriods.filter((item) => item !== period)
                        : [...data.focusPeriods, period],
                    })
                  }
                  className={`min-h-12 rounded-xl border px-3 text-sm font-semibold transition ${selected ? "border-moss bg-moss text-cream" : "border-ink/15 bg-cream hover:border-moss"}`}
                >
                  {selected && <Check size={15} className="mr-1 inline" />}
                  {period}
                </button>
              );
            })}
          </div>
        </section>
        <section className="rounded-[1.5rem] border border-ink/15 bg-white/70 p-5 sm:p-6">
          <h2 className="text-lg font-bold">Berapa lama kamu bisa fokus?</h2>
          <div className="mt-5 grid grid-cols-2 gap-2">
            {[25, 45, 60, 90].map((duration) => (
              <button
                type="button"
                key={duration}
                onClick={() => update({ focusDuration: duration })}
                className={`min-h-12 rounded-xl border px-3 text-sm font-semibold transition ${data.focusDuration === duration ? "border-moss bg-moss text-cream" : "border-ink/15 bg-cream hover:border-moss"}`}
              >
                {duration} menit
              </button>
            ))}
          </div>
        </section>
        <section className="rounded-[1.5rem] border border-ink/15 bg-white/70 p-5 sm:p-6 md:col-span-2">
          <h2 className="text-lg font-bold">
            Seberapa padat aktivitasmu bulan ini?
          </h2>
          <div className="mt-5 grid gap-2 sm:grid-cols-5">
            {densities.map((density) => (
              <button
                type="button"
                key={density}
                onClick={() => update({ activityDensity: density })}
                className={`min-h-12 rounded-xl border px-3 text-sm font-semibold transition ${data.activityDensity === density ? "border-moss bg-moss text-cream" : "border-ink/15 bg-cream hover:border-moss"}`}
              >
                {density}
              </button>
            ))}
          </div>
          <div className="mt-6 h-2 rounded-full bg-gradient-to-r from-sage via-sand to-coral" />
          <div className="mt-2 flex justify-between text-xs text-ink/50">
            <span>Lebih longgar</span>
            <span>Lebih padat</span>
          </div>
        </section>
        <section className="rounded-[1.5rem] border border-ink/15 bg-white/70 p-5 sm:p-6 md:col-span-2">
          <h2 className="text-lg font-bold">
            Seberapa sering kamu menunda waktu belajar?
          </h2>
          <div className="mt-5 grid gap-2 sm:grid-cols-4">
            {procrastinations.map((answer) => (
              <button
                type="button"
                key={answer}
                onClick={() => update({ procrastination: answer })}
                className={`min-h-12 rounded-xl border px-3 text-sm font-semibold transition ${data.procrastination === answer ? "border-moss bg-moss text-cream" : "border-ink/15 bg-cream hover:border-moss"}`}
              >
                {answer}
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function EvaluationStep({
  data,
  update,
}: {
  data: OnboardingData;
  update: (patch: Partial<OnboardingData>) => void;
}) {
  const [courseIndex, setCourseIndex] = useState(0);
  const [showEvent, setShowEvent] = useState(false);
  const course = data.courses[courseIndex];
  const evaluation = course
    ? (data.evaluations[course.id] ?? { understanding: 3, difficulty: 3 })
    : null;
  const updateEvaluation = (
    key: "understanding" | "difficulty",
    value: number,
  ) =>
    course &&
    update({
      evaluations: {
        ...data.evaluations,
        [course.id]: { ...evaluation!, [key]: value },
      },
    });
  function addEvent() {
    if (!course) return;
    const event: AcademicEvent = {
      id: uid("event"),
      courseId: course.id,
      type: "Tugas",
      title: "",
      date: new Date().toISOString().slice(0, 10),
      importance: 3,
      notes: "",
    };
    update({ academicEvents: [...data.academicEvents, event] });
    setShowEvent(true);
  }
  function updateEvent(id: string, patch: Partial<AcademicEvent>) {
    update({
      academicEvents: data.academicEvents.map((event) =>
        event.id === id ? { ...event, ...patch } : event,
      ),
    });
  }
  return (
    <div className="max-w-5xl">
      <p className="max-w-2xl text-2xl font-semibold leading-tight tracking-[-0.03em] sm:text-3xl">
        Kita cari mata kuliah yang perlu{" "}
        <span className="text-coral">sedikit lebih banyak perhatian.</span>
      </p>
      <p className="mt-4 max-w-xl text-base leading-7 text-ink/65">
        Pemahaman dan kesulitan adalah dua hal berbeda. Keduanya membantu
        memberi konteks.
      </p>
      {course && (
        <div className="mt-8 grid gap-6 lg:grid-cols-[.92fr_1.08fr]">
          <div className="rounded-[1.75rem] bg-moss p-6 text-cream sm:p-8">
            <div className="flex items-center justify-between text-sm text-cream/60">
              <span>
                {courseIndex + 1} dari {data.courses.length} Mata Kuliah
              </span>
              <span>{course.credits} SKS</span>
            </div>
            <h2 className="mt-12 text-3xl font-bold leading-tight tracking-[-0.05em]">
              {course.name}
            </h2>
            <p className="mt-3 text-sm text-cream/60">{course.code}</p>
            <div className="mt-12 flex items-center justify-between gap-2">
              {data.courses.map((item, index) => (
                <button
                  type="button"
                  key={item.id}
                  onClick={() => setCourseIndex(index)}
                  aria-label={`Buka evaluasi ${item.name}`}
                  className={`h-2 flex-1 rounded-full ${index === courseIndex ? "bg-coral" : data.evaluations[item.id] ? "bg-cream/60" : "bg-cream/20"}`}
                />
              ))}
            </div>
          </div>
          <div className="space-y-5">
            <section className="rounded-[1.5rem] border border-ink/15 bg-white/70 p-5 sm:p-7">
              <h2 className="text-lg font-bold">Seberapa paham kamu?</h2>
              <div className="mt-3 flex justify-between text-xs text-ink/50">
                <span>Sangat tidak paham</span>
                <span>Sangat paham</span>
              </div>
              <div className="mt-4 grid grid-cols-5 gap-2">
                {[1, 2, 3, 4, 5].map((value) => (
                  <button
                    type="button"
                    key={value}
                    onClick={() => updateEvaluation("understanding", value)}
                    className={`h-12 rounded-xl border text-sm font-bold ${evaluation?.understanding === value ? "border-coral bg-coral text-white" : "border-ink/15 bg-cream hover:border-moss"}`}
                  >
                    {value}
                  </button>
                ))}
              </div>
            </section>
            <section className="rounded-[1.5rem] border border-ink/15 bg-white/70 p-5 sm:p-7">
              <h2 className="text-lg font-bold">Menurutmu, seberapa sulit?</h2>
              <div className="mt-3 flex justify-between text-xs text-ink/50">
                <span>Sangat mudah</span>
                <span>Sangat sulit</span>
              </div>
              <div className="mt-4 grid grid-cols-5 gap-2">
                {[1, 2, 3, 4, 5].map((value) => (
                  <button
                    type="button"
                    key={value}
                    onClick={() => updateEvaluation("difficulty", value)}
                    className={`h-12 rounded-xl border text-sm font-bold ${evaluation?.difficulty === value ? "border-coral bg-coral text-white" : "border-ink/15 bg-cream hover:border-moss"}`}
                  >
                    {value}
                  </button>
                ))}
              </div>
            </section>
            <section className="rounded-[1.5rem] border border-ink/15 bg-white/70 p-5 sm:p-7">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold">Ada agenda akademik?</h2>
                  <p className="mt-2 text-sm text-ink/60">
                    Tugas, kuis, atau ujian yang akan datang sifatnya opsional.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={addEvent}
                  className="flex h-10 shrink-0 items-center gap-1 rounded-lg bg-sage px-3 text-sm font-semibold text-moss"
                >
                  <Plus size={15} />
                  Tambah
                </button>
              </div>
              {data.academicEvents
                .filter((event) => event.courseId === course.id)
                .map((event) => (
                  <div
                    key={event.id}
                    className="mt-4 grid gap-2 rounded-xl border border-ink/10 bg-cream/70 p-3 sm:grid-cols-2"
                  >
                    <label className="text-xs font-semibold text-ink/60">
                      Jenis
                      <select
                        value={event.type}
                        onChange={(e) =>
                          updateEvent(event.id, {
                            type: e.target.value as AcademicEvent["type"],
                          })
                        }
                        className="mt-1 h-10 w-full rounded-lg border border-ink/15 bg-white px-2 text-sm"
                      >
                        {[
                          "Tugas",
                          "Kuis",
                          "UTS",
                          "UAS",
                          "Presentasi",
                          "Proyek",
                          "Lainnya",
                        ].map((type) => (
                          <option key={type}>{type}</option>
                        ))}
                      </select>
                    </label>
                    <label className="text-xs font-semibold text-ink/60">
                      Judul
                      <input
                        value={event.title}
                        onChange={(e) =>
                          updateEvent(event.id, { title: e.target.value })
                        }
                        placeholder="Contoh: UTS bab 1–4"
                        className="mt-1 h-10 w-full rounded-lg border border-ink/15 bg-white px-2 text-sm"
                      />
                    </label>
                    <label className="text-xs font-semibold text-ink/60">
                      Tanggal
                      <input
                        type="date"
                        value={event.date}
                        onChange={(e) =>
                          updateEvent(event.id, { date: e.target.value })
                        }
                        className="mt-1 h-10 w-full rounded-lg border border-ink/15 bg-white px-2 text-sm"
                      />
                    </label>
                    <label className="text-xs font-semibold text-ink/60">
                      Tingkat kepentingan
                      <select
                        value={event.importance}
                        onChange={(e) =>
                          updateEvent(event.id, {
                            importance: Number(
                              e.target.value,
                            ) as AcademicEvent["importance"],
                          })
                        }
                        className="mt-1 h-10 w-full rounded-lg border border-ink/15 bg-white px-2 text-sm"
                      >
                        {[1, 2, 3, 4, 5].map((value) => (
                          <option key={value} value={value}>
                            {value} dari 5
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="button"
                      onClick={() =>
                        update({
                          academicEvents: data.academicEvents.filter(
                            (item) => item.id !== event.id,
                          ),
                        })
                      }
                      className="flex h-9 items-center gap-2 text-xs font-semibold text-coral sm:col-span-2"
                    >
                      <Trash2 size={14} />
                      Hapus agenda
                    </button>
                  </div>
                ))}
              {showEvent &&
                data.academicEvents.filter(
                  (event) => event.courseId === course.id,
                ).length === 0 && (
                  <p className="mt-4 text-sm text-ink/50">
                    Agenda dihapus. Kamu bisa menambahkannya lagi jika perlu.
                  </p>
                )}
            </section>
            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                disabled={courseIndex === 0}
                onClick={() =>
                  setCourseIndex((index) => Math.max(0, index - 1))
                }
                className="flex min-h-11 items-center gap-2 rounded-xl border border-ink/15 px-4 text-sm font-semibold disabled:opacity-40"
              >
                <ArrowLeft size={16} />
                Sebelumnya
              </button>
              <button
                type="button"
                disabled={courseIndex === data.courses.length - 1}
                onClick={() =>
                  setCourseIndex((index) =>
                    Math.min(data.courses.length - 1, index + 1),
                  )
                }
                className="flex min-h-11 items-center gap-2 rounded-xl bg-moss px-4 text-sm font-semibold text-cream disabled:opacity-40"
              >
                Berikutnya
                <ArrowRight size={16} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryStep({
  data,
  onEdit,
  onGenerate,
}: {
  data: OnboardingData;
  onEdit: (step: number) => void;
  onGenerate: () => void;
}) {
  const totalCredits = data.courses.reduce(
    (sum, course) => sum + course.credits,
    0,
  );
  const availabilityMinutes = data.availability.reduce(
    (sum, range) => sum + minutesBetween(range.start, range.end),
    0,
  );
  const attention = rankPriorities(
    data.courses.map((course) =>
      calculatePriority(
        {
          courseId: course.id,
          code: course.code,
          name: course.name,
          credits: course.credits,
          understanding: data.evaluations[course.id]?.understanding,
          difficulty: data.evaluations[course.id]?.difficulty,
          events: data.academicEvents
            .filter((event) => event.courseId === course.id)
            .map((event) => ({ date: event.date, importance: event.importance })),
        },
        { today: dateInTimeZone(new Date(), data.timezone) },
      ),
    ),
  ).slice(0, 3);
  const nearestEvent = [...data.academicEvents].sort((a, b) =>
    a.date.localeCompare(b.date),
  )[0];
  return (
    <div className="max-w-5xl">
      <p className="max-w-2xl text-2xl font-semibold leading-tight tracking-[-0.03em] sm:text-3xl">
        Semua sudah siap.{" "}
        <span className="text-coral">Lihat sekali lagi sebelum mulai.</span>
      </p>
      <p className="mt-4 max-w-xl text-base leading-7 text-ink/65">
        Kamu bisa kembali mengubah bagian mana pun. Prioritas baru dihitung
        setelah kamu menekan tombol di bawah.
      </p>
      <div className="mt-8 grid grid-flow-dense grid-cols-1 gap-4 sm:grid-cols-6">
        <SummaryCard
          title="Semester"
          className="sm:col-span-3"
          value={data.semester}
          onEdit={() => onEdit(0)}
        />
        <SummaryCard
          title="Mata Kuliah"
          className="sm:col-span-3"
          value={`${data.courses.length} mata kuliah · ${totalCredits} SKS`}
          onEdit={() => onEdit(1)}
        />
        <SummaryCard
          title="Waktu Fokus"
          className="sm:col-span-2"
          value={data.focusPeriods.join(", ")}
          onEdit={() => onEdit(3)}
        />
        <SummaryCard
          title="Durasi Sesi"
          className="sm:col-span-2"
          value={`${data.focusDuration} menit`}
          onEdit={() => onEdit(3)}
        />
        <SummaryCard
          title="Waktu Tersedia"
          className="sm:col-span-2"
          value={`${(availabilityMinutes / 60).toFixed(1)} jam per minggu`}
          onEdit={() => onEdit(2)}
        />
        <div className="rounded-[1.5rem] border border-ink/15 bg-moss p-5 text-cream sm:col-span-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-sage">
                Perlu perhatian lebih
              </p>
              <ol className="mt-4 space-y-2 text-lg font-semibold">
                {attention.map((course) => (
                  <li key={course.courseId}>
                    {course.name}
                  </li>
                ))}
              </ol>
            </div>
            <button
              type="button"
              onClick={() => onEdit(4)}
              className="flex items-center gap-1 text-sm font-semibold text-cream/75 hover:text-cream"
            >
              <Pencil size={14} />
              Ubah
            </button>
          </div>
        </div>
        <div className="rounded-[1.5rem] border border-ink/15 bg-sand p-5 sm:col-span-2">
          <p className="text-sm font-semibold text-moss">Agenda terdekat</p>
          {nearestEvent ? (
            <>
              <p className="mt-4 font-semibold">
                {nearestEvent.type}{" "}
                {nearestEvent.title && `· ${nearestEvent.title}`}
              </p>
              <p className="mt-2 text-sm text-ink/65">
                {new Intl.DateTimeFormat("id-ID", {
                  day: "numeric",
                  month: "long",
                }).format(new Date(nearestEvent.date))}
              </p>
            </>
          ) : (
            <p className="mt-4 text-sm leading-6 text-ink/65">
              Belum ada agenda tambahan.
            </p>
          )}
          <button
            type="button"
            onClick={() => onEdit(4)}
            className="mt-5 flex items-center gap-1 text-sm font-semibold text-moss"
          >
            <Pencil size={14} />
            Ubah
          </button>
        </div>
      </div>
      <div className="mt-6 flex flex-col items-stretch justify-between gap-4 rounded-[1.5rem] bg-coral p-5 text-white sm:flex-row sm:items-center sm:p-6">
        <div>
            <p className="text-xl font-bold tracking-[-0.03em]">
            Siap membuat rencana belajar?
          </p>
          <p className="mt-1 text-sm text-white/75">
            Jadwal empat minggu akan disusun dari informasi yang baru saja kamu periksa.
          </p>
        </div>
        <button
          type="button"
          onClick={onGenerate}
          className="flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-xl bg-white px-5 font-bold text-ink transition hover:bg-cream"
        >
          <Sparkles size={17} />
          Buat Rencana Belajar
        </button>
      </div>
    </div>
  );
}

function SummaryCard({
  title,
  value,
  onEdit,
  className,
}: {
  title: string;
  value: string;
  onEdit: () => void;
  className?: string;
}) {
  return (
    <div
      className={`rounded-[1.5rem] border border-ink/15 bg-white/70 p-5 ${className ?? ""}`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold text-ink/55">{title}</p>
        <button
          type="button"
          onClick={onEdit}
          aria-label={`Ubah ${title}`}
          className="text-moss hover:text-coral"
        >
          <Pencil size={15} />
        </button>
      </div>
      <p className="mt-5 text-lg font-bold tracking-[-0.02em]">{value}</p>
    </div>
  );
}

function PlanReady({
  data,
  onReview,
  warning,
}: {
  data: OnboardingData;
  onReview: () => void;
  warning?: string;
}) {
  const totalCredits = data.courses.reduce(
    (sum, course) => sum + course.credits,
    0,
  );
  const plan = data.studyPlan;
  const upcoming = plan?.sessions.filter((session) => session.status === "planned") ?? [];
  const totalMinutes = upcoming.reduce((sum, session) => sum + session.duration, 0);
  const nextSession = upcoming[0];
  return (
    <div className="mx-auto max-w-3xl rounded-[2rem] border border-ink/15 bg-white/80 p-6 shadow-soft sm:p-10">
      <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-sage text-moss">
        <Sparkles size={30} />
      </div>
      <p className="mt-8 text-sm font-semibold text-moss">
        Prioritas Belajar Siap
      </p>
      <h1 className="mt-3 max-w-2xl text-4xl font-bold leading-[0.98] tracking-[-0.06em] sm:text-6xl">
        Prioritas belajar yang punya ruang untuk hidupmu.
      </h1>
      <p className="mt-6 max-w-xl text-base leading-7 text-ink/65">
        Informasi {data.courses.length} mata kuliah dan {totalCredits} SKS sudah
        dirangkum menjadi rencana belajar empat minggu yang bisa kamu jalani.
      </p>
      {warning && (
        <p role="status" className="mt-5 rounded-xl bg-sand p-3 text-sm leading-6 text-ink">
          {warning}
        </p>
      )}
      <div className="mt-8 space-y-3 rounded-2xl bg-cream p-5">
        <p className="flex items-center gap-3 text-sm font-semibold">
          <Check size={17} className="text-moss" />
          Prioritas mata kuliah dihitung dari kondisi kamu
        </p>
        <p className="flex items-center gap-3 text-sm font-semibold">
          {warning ? <CircleHelp size={17} className="text-coral" /> : <Check size={17} className="text-moss" />}
          {warning ? "Rencana lokal tetap tersedia" : "Rencana empat minggu tersimpan"}
        </p>
        <p className="flex items-center gap-3 text-sm font-semibold">
          <Check size={17} className="text-moss" />
          {upcoming.length} sesi terjadwal · {Math.floor(totalMinutes / 60)} jam {totalMinutes % 60} menit
        </p>
      </div>
      {nextSession && (
        <div className="mt-5 rounded-2xl border border-coral/20 bg-coral/5 p-5">
          <p className="text-sm font-semibold text-coral">Sesi berikutnya</p>
          <p className="mt-2 text-lg font-bold">{nextSession.courseName}</p>
          <p className="mt-1 text-sm text-ink/65">
            {new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "numeric", month: "long" }).format(new Date(`${nextSession.date}T00:00:00`))}
            {" · "}{nextSession.startTime} · {nextSession.duration} menit
          </p>
          {nextSession.studyMethod && (
            <p className="mt-3 text-sm font-semibold text-moss">{nextSession.studyMethod}</p>
          )}
          {nextSession.studyGoal && (
            <p className="mt-1 text-sm leading-6 text-ink/65">{nextSession.studyGoal}</p>
          )}
        </div>
      )}
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <a
          href="/hari-ini"
          className="flex min-h-13 flex-1 items-center justify-center gap-2 rounded-xl bg-moss px-5 py-3 font-semibold text-cream transition hover:bg-ink"
        >
          Mulai dari Hari Ini
          <ArrowRight size={17} />
        </a>
        <button
          type="button"
          onClick={onReview}
          className="flex min-h-13 items-center justify-center gap-2 rounded-xl border border-ink/15 px-5 py-3 font-semibold hover:bg-sage/40"
        >
          <RotateCcw size={16} />
          Tinjau Lagi
        </button>
      </div>
    </div>
  );
}

function PlanGenerating() {
  return (
    <div className="mx-auto max-w-2xl rounded-[2rem] border border-ink/15 bg-white/80 p-6 shadow-soft sm:p-10">
      <div className="grid h-16 w-16 place-items-center rounded-3xl bg-coral text-white">
        <Sparkles size={28} />
      </div>
      <p className="mt-8 text-sm font-semibold text-coral">
        Sedang menghitung prioritas belajarmu...
      </p>
      <h1 className="mt-3 text-4xl font-bold leading-[0.98] tracking-[-0.06em] sm:text-5xl">
        Menyiapkan ringkasan prioritas yang terasa mungkin.
      </h1>
      <div className="mt-8 space-y-3 rounded-2xl bg-cream p-5">
        <p className="flex items-center gap-3 text-sm font-semibold">
          <Check size={17} className="text-moss" />
          Menyimpan ringkasan onboarding
        </p>
        <p className="flex items-center gap-3 text-sm font-semibold">
          <Check size={17} className="text-moss" />
          Menghitung prioritas mata kuliah
        </p>
        <p className="flex items-center gap-3 text-sm text-ink/50">
          <span className="h-4 w-4 rounded-full border-2 border-coral border-t-transparent soft-pulse" />
          Menyimpan snapshot perencanaan
        </p>
      </div>
    </div>
  );
}

export default function OnboardingApp() {
  const [data, setData] = useState<OnboardingData>(initialOnboardingData);
  const [hydrated, setHydrated] = useState(false);
  const [demoStarted, setDemoStarted] = useState(false);
  const [generationReady, setGenerationReady] = useState(false);
  const [generationStatus, setGenerationStatus] = useState<
    "idle" | "processing" | "ready"
  >("idle");
  const [generationWarning, setGenerationWarning] = useState("");
  const [savedNotice, setSavedNotice] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [remoteReady, setRemoteReady] = useState(false);
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  useEffect(() => {
    let cancelled = false;
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const localSetup = (() => {
      try {
        return onboardingDataSchema.parse(
          JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "null"),
        ) as OnboardingData;
      } catch {
        return null;
      }
    })();

    async function hydrate() {
      if (!supabase) {
        if (localSetup) {
          setData({ ...localSetup, timezone, planActive: Boolean(localSetup.planActive && localSetup.studyPlan) });
          setDemoStarted(true);
          setGenerationReady(Boolean(localSetup.planActive && localSetup.studyPlan));
        } else {
          setData((current) => ({ ...current, timezone }));
        }
        if (!cancelled) {
          setRemoteReady(true);
          setHydrated(true);
        }
        return;
      }

      const { data: sessionData } = await supabase.auth.getSession();
      const recoveryFlow = window.location.hash.includes("type=recovery");
      if (!sessionData.session || recoveryFlow) {
        if (!cancelled) {
          setData({ ...initialOnboardingData, timezone });
          setDemoStarted(false);
          setGenerationReady(false);
          setRemoteReady(true);
          setHydrated(true);
        }
        return;
      }

      const { data: semester } = await supabase
        .from("semesters")
        .select("setup_payload")
        .eq("user_id", sessionData.session.user.id)
        .eq("is_active", true)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      let remoteSetup: OnboardingData | null = null;
      try {
        remoteSetup = onboardingDataSchema.parse(
          semester?.setup_payload,
        ) as OnboardingData;
      } catch {
        remoteSetup = null;
      }
      if (!cancelled) {
        const nextData = remoteSetup
          ? { ...remoteSetup, timezone, planActive: Boolean(remoteSetup.planActive && remoteSetup.studyPlan) }
          : { ...initialOnboardingData, timezone };
        setData(nextData);
        setDemoStarted(true);
        setGenerationReady(Boolean(remoteSetup?.planActive && remoteSetup.studyPlan));
        setAuthenticated(true);
        setRemoteReady(true);
        setHydrated(true);
      }
    }
    void hydrate();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  useEffect(() => {
    if (hydrated && remoteReady)
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }, [data, hydrated, remoteReady]);

  useEffect(() => {
    if (!hydrated || !remoteReady || !supabase || !authenticated) return;
    void supabase.auth.getUser().then(async ({ data: authData }) => {
      if (!authData.user) return;
      await supabase.from("profiles").upsert({
        id: authData.user.id,
        timezone: data.timezone,
        updated_at: new Date().toISOString(),
      });
      await supabase.from("semesters").upsert(
        {
          user_id: authData.user.id,
          name: data.semester,
          onboarding_step: data.step,
          setup_payload: data,
          is_active: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,name" },
      );
    });
  }, [data, hydrated, remoteReady, authenticated, supabase]);

  const update = (patch: Partial<OnboardingData>) => {
    setData((current) => ({ ...current, ...patch }));
    setSavedNotice(true);
    window.setTimeout(() => setSavedNotice(false), 1200);
  };
  const beginDemo = () => {
    setDemoStarted(true);
    setAuthenticated(false);
    setRemoteReady(true);
    setData((current) => ({
      ...current,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    }));
  };
  const resumeAuthenticated = async () => {
    if (!supabase) return beginDemo();
    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) return;
    const { data: semester } = await supabase
      .from("semesters")
      .select("setup_payload")
      .eq("user_id", authData.user.id)
      .eq("is_active", true)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    let remoteSetup: OnboardingData | null = null;
    try {
      remoteSetup = onboardingDataSchema.parse(
        semester?.setup_payload,
      ) as OnboardingData;
    } catch {
      remoteSetup = null;
    }
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    setData(
      remoteSetup
        ? { ...remoteSetup, timezone, planActive: Boolean(remoteSetup.planActive && remoteSetup.studyPlan) }
        : { ...initialOnboardingData, timezone },
    );
    setDemoStarted(true);
    setAuthenticated(true);
    setGenerationReady(Boolean(remoteSetup?.planActive && remoteSetup.studyPlan));
    setRemoteReady(true);
  };
  const logout = async () => {
    if (supabase) await supabase.auth.signOut();
    setAuthenticated(false);
    setDemoStarted(false);
    setGenerationReady(false);
    window.location.replace("/");
  };
  const moveNext = () => setData((current) => nextStep(current));
  const moveBack = () => setData((current) => previousStep(current));
  const editStep = (step: number) => {
    setGenerationReady(false);
    setData((current) => jumpToStep(current, step));
  };
  const reviewSummary = () => {
    setGenerationReady(false);
    setGenerationStatus("idle");
    setGenerationWarning("");
    setData((current) => ({ ...current, step: 5, planActive: false }));
  };
  const generatePlan = async () => {
    setGenerationWarning("");
    setGenerationStatus("processing");
    const today = dateInTimeZone(new Date(), data.timezone);
    const snapshot = buildPlanningSnapshot(data, { today });
  const generatedPlan = generateStudyPlan({
      courses: data.courses,
      availability: data.availability,
      classSchedules: data.classSchedules,
      focusPeriods: data.focusPeriods,
      focusDuration: data.focusDuration,
      activityDensity: data.activityDensity,
      procrastination: data.procrastination,
      academicEvents: data.academicEvents,
      snapshot,
      today,
    });
    const plan: StudyPlan = {
      ...generatedPlan,
      sessions: applyEnrichments(
        generatedPlan.sessions,
        fallbackEnrichments(generatedPlan.sessions),
      ),
    };
    setData((current) => ({
      ...current,
      planActive: true,
      planningSnapshot: snapshot,
      studyPlan: plan,
    }));
    let warning = "";
    if (authenticated && supabase) {
      try {
        const snapshotWarning = await storePlanningSnapshot(supabase, snapshot);
        const storedPlan = await storeStudyPlan(supabase, plan);
        warning = snapshotWarning || storedPlan.warning;
        if (storedPlan.remoteId) {
          setData((current) => ({
            ...current,
            studyPlan: current.studyPlan
              ? { ...current.studyPlan, remoteId: storedPlan.remoteId }
              : current.studyPlan,
          }));
          try {
            const response = await fetch("/api/ai/enrich", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                planId: storedPlan.remoteId,
                sessions: plan.sessions.map((session) => ({
                  sessionKey: session.sessionKey,
                  courseName: session.courseName,
                  date: session.date,
                  duration: session.duration,
                  priorityScore: session.prioritySnapshot.score,
                  knowledgeGap: session.prioritySnapshot.knowledgeGap,
                  difficulty: session.prioritySnapshot.difficulty,
                  urgency: session.prioritySnapshot.urgency,
                })),
              }),
            });
            if (response.ok) {
              const body = (await response.json()) as unknown;
              const enrichment = enrichStudySessionsResultSchema.safeParse(body);
              if (enrichment.success) {
                const enrichedSessions = applyEnrichments(plan.sessions, enrichment.data);
                setData((current) => ({
                  ...current,
                  studyPlan: current.studyPlan
                    ? { ...current.studyPlan, sessions: enrichedSessions }
                    : current.studyPlan,
                }));
              }
              if ((body as { fallback?: boolean }).fallback)
                warning = "Strategi belajar bawaan digunakan. Rencana tetap siap dipakai.";
            }
          } catch {
            warning = "Strategi belajar AI belum tersedia. Rencana tetap siap dipakai dengan panduan bawaan.";
          }
        }
      } catch {
        warning = "Rencana tersusun, tetapi belum berhasil disimpan ke akun. Data lokal tetap aman.";
      }
    }
    setGenerationWarning(
      warning ||
        (!authenticated
          ? "Mode lokal: rencana empat minggu tersimpan di perangkat ini."
          : ""),
    );
    setGenerationStatus("ready");
    setGenerationReady(true);
  };

  if (!hydrated)
    return (
      <main className="grid min-h-screen place-items-center bg-cream">
        <div
          className="h-10 w-10 rounded-full border-4 border-moss border-t-transparent soft-pulse"
          aria-label="Memuat Planify"
        />
      </main>
    );
  if (generationStatus === "processing")
    return (
      <main className="grain relative min-h-screen overflow-x-hidden px-5 py-8 sm:px-10 sm:py-12">
        <MotionLayer />
        <div className="relative mx-auto max-w-6xl">
          <header className="flex items-center justify-between">
            <p className="flex items-center gap-2 text-lg font-bold tracking-[-0.04em]">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-moss text-cream">
                <Leaf size={18} />
              </span>
              Planify
            </p>
            <p className="text-sm text-ink/55">Menyimpan perubahan</p>
          </header>
          <div className="mt-16">
            <PlanGenerating />
          </div>
        </div>
      </main>
    );
  if (generationReady || Boolean(data.planActive && data.studyPlan))
    return (
      <main className="grain relative min-h-screen overflow-x-hidden px-5 py-8 sm:px-10 sm:py-12">
        <MotionLayer />
        <div className="relative mx-auto max-w-6xl">
          <header className="flex items-center justify-between">
            <a
              href="/"
              className="flex items-center gap-2 text-lg font-bold tracking-[-0.04em]"
            >
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-moss text-cream">
                <Leaf size={18} />
              </span>
              Planify
            </a>
            <div className="flex items-center gap-3">
              <p className="text-sm text-ink/55">{formatDate(new Date())}</p>
              {authenticated && (
                <button
                  type="button"
                  onClick={logout}
                  className="flex min-h-10 items-center gap-2 rounded-xl border border-ink/15 bg-white/60 px-3 text-sm font-semibold hover:bg-sage"
                >
                  <LogOut size={15} />
                  Keluar
                </button>
              )}
            </div>
          </header>
          <div className="mt-16">
            <PlanReady data={data} onReview={reviewSummary} warning={generationWarning} />
          </div>
        </div>
      </main>
    );
  if (!demoStarted)
    return (
      <main className="grain relative min-h-screen overflow-x-hidden px-5 py-6 sm:px-10 sm:py-8">
        <MotionLayer />
        <div className="relative mx-auto grid min-h-[calc(100vh-3rem)] max-w-6xl items-center gap-10 lg:grid-cols-[1.05fr_.95fr]">
          <div>
            <header className="flex items-center gap-2 text-lg font-bold tracking-[-0.04em]">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-moss text-cream">
                <Leaf size={18} />
              </span>
              Planify
            </header>
            <p className="mt-20 text-sm font-semibold text-coral">
              Teman belajar yang menyesuaikan
            </p>
            <h1 className="mt-5 max-w-6xl text-[clamp(3rem,7vw,6.5rem)] font-bold leading-[0.91] tracking-[-0.08em]">
              <span data-reveal-word>Belajar</span> dengan{" "}
              <span
                className="inline-block h-[.62em] w-[1.45em] translate-y-[.06em] rounded-full bg-[url('https://picsum.photos/seed/quietdesk/600/400')] bg-cover bg-center align-baseline"
                aria-hidden="true"
              />
              <span data-reveal-word>ruang</span> untuk hidupmu.
            </h1>
            <p className="mt-7 max-w-xl text-lg leading-7 text-ink/65">
              Susun langkah yang terasa mungkin dari KRS, jadwal, dan kondisi
              kamu hari ini.
            </p>
            <div className="mt-8 flex items-center gap-3 text-sm text-ink/50">
              <span className="h-px w-12 bg-coral" />
              Enam langkah, satu awal yang jelas.
            </div>
          </div>
          <div>
            <AuthPanel
              onDemo={beginDemo}
              onAuthenticated={resumeAuthenticated}
            />
          </div>
        </div>
        <div className="relative mx-auto max-w-6xl pb-8">
          <ReflectionCarousel />
        </div>
      </main>
    );

  const activeStep = data.step;
  const canMove = canAdvance(data);
  return (
    <main className="grain relative min-h-screen w-full max-w-full overflow-x-hidden px-4 py-5 sm:px-8 sm:py-7">
      <MotionLayer />
      <div className="relative mx-auto max-w-6xl">
        <header className="flex items-center justify-between gap-5">
          <a
            href="/"
            className="flex items-center gap-2 text-lg font-bold tracking-[-0.04em]"
          >
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-moss text-cream">
              <Leaf size={18} />
            </span>
            Planify
          </a>
          <div className="flex items-center gap-3">
            <span className="hidden text-xs text-ink/50 sm:inline">
              {data.timezone}
            </span>
            <span className="flex items-center gap-1 rounded-full bg-sage/60 px-3 py-1.5 text-xs font-semibold text-moss">
              <LockKeyhole size={12} />
              Tersimpan otomatis
            </span>
            {authenticated && (
              <button
                type="button"
                onClick={logout}
                className="flex min-h-9 items-center gap-1 rounded-xl border border-ink/15 bg-white/60 px-3 text-xs font-semibold hover:bg-sage"
              >
                <LogOut size={14} />
                Keluar
              </button>
            )}
          </div>
        </header>
        <div
          className="mt-10 flex gap-2 overflow-x-auto pb-1"
          aria-label="Langkah persiapan"
        >
          {ONBOARDING_STEPS.map((step, index) => (
            <div
              key={step}
              className={`flex shrink-0 items-center gap-2 text-xs font-semibold ${index === activeStep ? "text-ink" : index < activeStep ? "text-moss" : "text-ink/35"}`}
            >
              <span
                className={`grid h-7 w-7 place-items-center rounded-full ${index < activeStep ? "bg-moss text-cream" : index === activeStep ? "bg-coral text-white" : "border border-ink/20"}`}
              >
                {index < activeStep ? <Check size={14} /> : index + 1}
              </span>
              <span className="hidden sm:inline">{step}</span>
              {index < 5 && <span className="mx-1 h-px w-5 bg-ink/10" />}
            </div>
          ))}
        </div>
        <section className="mt-10 rounded-[2rem] border border-ink/10 bg-cream/75 p-5 shadow-[0_20px_70px_rgba(23,37,31,.06)] sm:p-8 md:p-10">
          <StepHeader data={data} />
          {activeStep === 0 && (
            <KrsStep
              data={data}
              update={update}
              supabase={supabase}
              authenticated={authenticated}
            />
          )}
          {activeStep === 1 && <CoursesStep data={data} update={update} />}
          {activeStep === 2 && <ScheduleStep data={data} update={update} />}
          {activeStep === 3 && <HabitsStep data={data} update={update} />}
          {activeStep === 4 && <EvaluationStep data={data} update={update} />}
          {activeStep === 5 && (
            <SummaryStep
              data={data}
              onEdit={editStep}
              onGenerate={() => void generatePlan()}
            />
          )}
          {activeStep !== 5 && (
            <div className="mt-8 flex flex-col-reverse items-stretch justify-between gap-3 border-t border-ink/10 pt-5 sm:flex-row sm:items-center">
              <button
                type="button"
                onClick={moveBack}
                disabled={activeStep === 0}
                className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-ink/15 px-5 font-semibold text-ink transition hover:bg-sage/40 disabled:cursor-not-allowed disabled:opacity-30"
              >
                <ArrowLeft size={17} />
                Kembali
              </button>
              <div className="flex items-center justify-between gap-3 sm:justify-end">
                <span role="status" className="text-xs text-ink/50">
                  {savedNotice
                    ? "Tersimpan"
                    : "Perubahan tersimpan di perangkat"}
                </span>
                <button
                  type="button"
                  onClick={moveNext}
                  disabled={!canMove}
                  className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-moss px-5 font-semibold text-cream transition hover:bg-ink disabled:cursor-not-allowed disabled:opacity-35 sm:flex-none"
                >
                  Lanjutkan
                  <ArrowRight size={17} />
                </button>
              </div>
            </div>
          )}
        </section>
        <div className="mt-8 flex items-start gap-3 text-xs leading-5 text-ink/50">
          <CircleHelp size={16} className="mt-0.5 shrink-0 text-coral" />
          <p>
            Hasil KRS dapat diperiksa dan diubah sebelum disimpan sebagai data
            mata kuliah.
          </p>
        </div>
      </div>
    </main>
  );
}
