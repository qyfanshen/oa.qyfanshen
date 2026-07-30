"use client";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="flex min-h-full items-center justify-center bg-slate-50 p-6">
      <section className="max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-red-50 text-xl text-red-500">!</div>
        <h1 className="text-xl font-bold text-slate-800">页面暂时无法打开</h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">请稍后重试；如果问题持续，请联系系统管理员。</p>
        <button onClick={reset} className="mt-6 rounded-lg bg-[#1e3a5f] px-4 py-2 text-sm font-medium text-white hover:bg-[#2d5a8e]">重新加载</button>
      </section>
    </main>
  );
}
