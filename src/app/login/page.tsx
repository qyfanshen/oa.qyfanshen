"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [account, setAccount] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account, password }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.message || "登录失败，请稍后重试");
        return;
      }
      router.replace("/");
      router.refresh();
    } catch {
      setError("网络异常，请检查服务后重试");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-full bg-[radial-gradient(circle_at_top_left,_#e0f2fe,_transparent_35%),linear-gradient(135deg,_#eff6ff,_#f8fafc_55%,_#e0f2fe)] flex items-center justify-center p-5">
      <section className="w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl shadow-slate-300/40 ring-1 ring-slate-200">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-sky-500 text-xl font-bold text-white shadow-lg shadow-sky-500/30">梵</div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-800">梵燊集团 OA 系统</h1>
          <p className="mt-2 text-sm text-slate-500">请输入账号和密码登录</p>
        </div>
        <form className="space-y-5" onSubmit={submit}>
          <label className="block text-sm font-medium text-slate-700">
            账号
            <input value={account} onChange={(e) => setAccount(e.target.value)} autoComplete="username" placeholder="用户名或邮箱" className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2.5 outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-100" />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            密码
            <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" autoComplete="current-password" placeholder="请输入密码" className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2.5 outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-100" />
          </label>
          {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
          <button disabled={loading} className="w-full rounded-lg bg-sky-500 py-3 text-sm font-semibold text-white transition hover:bg-sky-600 disabled:cursor-not-allowed disabled:opacity-60">
            {loading ? "正在登录…" : "登录系统"}
          </button>
        </form>
      </section>
    </main>
  );
}
