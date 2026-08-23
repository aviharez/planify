import Link from "next/link";

export default function NotFound() {
  return <main className="grid min-h-screen place-items-center bg-cream p-6"><section className="max-w-md rounded-[1.75rem] border border-ink/10 bg-white/80 p-7 text-center"><p className="text-sm font-semibold text-coral">Halaman tidak ditemukan</p><h1 className="mt-3 text-3xl font-bold tracking-[-0.05em]">Kita tersesat sebentar.</h1><p className="mt-3 text-sm leading-6 text-ink/60">Kembali ke halaman utama untuk melihat rencana belajar kamu.</p><Link href="/" className="mt-6 inline-flex min-h-12 items-center rounded-xl bg-moss px-5 font-semibold text-cream hover:bg-ink">Kembali ke awal</Link></section></main>;
}
