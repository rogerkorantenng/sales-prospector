"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiPost } from "@/lib/api";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2 } from "lucide-react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await apiPost<{
        token: string;
        user: { id: string; email: string; name: string };
      }>("/auth/login", { email, password });
      localStorage.setItem("token", res.token);
      localStorage.setItem("user", JSON.stringify(res.user));
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f0f2f5] px-4">
      <div className="w-full max-w-sm">
        {/* Logo card floating on top */}
        <div className="flex justify-center -mb-8 relative z-10">
          <div className="flex size-16 items-center justify-center rounded-xl bg-gradient-to-br from-[#e91e63] to-[#c2185b] shadow-lg shadow-[#e91e63]/30">
            <span className="text-xl font-bold text-white">BP</span>
          </div>
        </div>

        <div className="material-card pt-12 pb-6 px-6">
          <div className="space-y-1 text-center mb-6">
            <h1 className="text-xl font-bold text-[#344767]">Brownshift Prospector</h1>
            <p className="text-xs text-[#7b809a]">Sign in to continue</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#7b809a]">
                Email
              </label>
              <Input
                type="email"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="bg-[#f8f9fa] border-[#e9ecef]"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#7b809a]">
                Password
              </label>
              <Input
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="bg-[#f8f9fa] border-[#e9ecef]"
              />
            </div>
            {error && (
              <p className="rounded-lg bg-[#f44335]/10 px-3 py-2 text-xs text-[#f44335] font-medium">
                {error}
              </p>
            )}
            <Button
              type="submit"
              className="w-full bg-gradient-to-r from-[#e91e63] to-[#c2185b] text-white border-0 shadow-md shadow-[#e91e63]/20 hover:shadow-lg hover:shadow-[#e91e63]/30"
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Signing in...
                </>
              ) : (
                "Sign In"
              )}
            </Button>
          </form>
          <p className="mt-6 text-center text-xs text-[#7b809a]">
            Don&apos;t have an account?{" "}
            <Link
              href="/register"
              className="font-semibold text-[#e91e63] underline-offset-2 hover:underline"
            >
              Register
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
