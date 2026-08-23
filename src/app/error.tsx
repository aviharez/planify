"use client";

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main className="grid min-h-screen place-items-center bg-cream p-6"><section className="max-w-md rounded-[1.75rem] border border-ink/10 bg-white/80 p-7 text-center"><p className="text-sm font-semibold text-coral">Ada gangguan</p><h1 className="mt-3 text-3xl font-bold tracking-[-0.05em]">Halaman belum bisa dimuat.</h1><p className="mt-3 text-sm leading-6 text-ink/60">Coba muat ulang. Rencana yang sudah tersimpan tetap aman.</p><button type="button" onClick={() => reset()} className="mt-6 min-h-12 rounded-xl bg-moss px-5 font-semibold text-cream hover:bg-ink">Coba lagi</button></section></main>;
}
