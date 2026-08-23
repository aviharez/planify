"use client";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <html lang="id"><body className="bg-[#f3f0e7] text-[#17251f]"><main className="grid min-h-screen place-items-center p-6"><section className="max-w-md rounded-[1.75rem] border border-black/10 bg-white/80 p-7 text-center"><h1 className="text-3xl font-bold">Planify sedang memulihkan diri.</h1><p className="mt-3 text-sm leading-6 opacity-65">Coba buka kembali halaman ini.</p><button type="button" onClick={() => reset()} className="mt-6 min-h-12 rounded-xl bg-[#315342] px-5 font-semibold text-[#f3f0e7]">Coba lagi</button></section></main></body></html>;
}
