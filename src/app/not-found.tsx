import Link from "next/link";

export default function NotFound() {
  return <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6"><section className="max-w-md text-center"><p className="text-6xl font-bold text-[#1e3a5f]">404</p><h1 className="mt-4 text-xl font-bold text-slate-800">页面不存在</h1><p className="mt-2 text-sm text-slate-500">链接可能已失效，或页面已被移动。</p><Link href="/" className="mt-6 inline-block rounded-lg bg-[#1e3a5f] px-4 py-2 text-sm font-medium text-white hover:bg-[#2d5a8e]">返回工作台</Link></section></main>;
}
