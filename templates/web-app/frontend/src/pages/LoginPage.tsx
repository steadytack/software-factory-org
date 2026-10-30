import { useEffect, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2 } from "lucide-react";

import { api } from "../api/client";
import { isSafeRelativePath } from "../lib/utils";
import { BRAND, pageTitle } from "../lib/brand";
import { Logo } from "../components/brand/Logo";
import { AuthSplit } from "../components/blocks/AuthSplit";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Alert, AlertDescription } from "../components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../components/ui/card";

const BENEFITS = [
  "Record sites and surveys in the field — with photos from your phone",
  "Keep working when the signal drops: changes upload when you're back online",
  "See your whole portfolio on one map",
];

/** Topographic contour lines echoing the logomark: gently varying, every fifth one heavier,
 *  fading out towards the top of the panel. Decorative only. */
function ContourPattern() {
  const lines = Array.from({ length: 20 }, (_, i) => {
    const y = 230 + i * 24;
    const amp = 40 - i * 1.1;
    return `M-40 ${y} C 60 ${y - amp}, 140 ${y + amp * 1.4}, 240 ${y} S 400 ${y - amp * 1.2}, 460 ${y + amp * 0.4}`;
  });
  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute inset-0 size-full text-white [mask-image:linear-gradient(to_top,black_0%,black_40%,transparent_85%)]"
      preserveAspectRatio="xMidYMax slice"
      viewBox="0 0 400 600"
    >
      {lines.map((d, i) => (
        <path
          key={i}
          d={d}
          fill="none"
          stroke="currentColor"
          strokeWidth={i % 5 === 0 ? 1.4 : 0.8}
          strokeOpacity={i % 5 === 0 ? 0.3 : 0.14}
        />
      ))}
    </svg>
  );
}

function BrandPanel() {
  return (
    <>
      <ContourPattern />
      <Logo inverted className="relative" />
      <div className="relative">
        <h1 className="max-w-md text-hero">{BRAND.tagline}</h1>
        <p className="mt-4 max-w-md text-sm leading-relaxed text-white/70">{BRAND.description}</p>
        <ul className="mt-8 space-y-3">
          {BENEFITS.map((benefit) => (
            <li key={benefit} className="flex items-start gap-3 text-sm text-white/85">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-white/60" />
              {benefit}
            </li>
          ))}
        </ul>
      </div>
      <p className="relative text-xs text-white/60">
        © {new Date().getFullYear()} {BRAND.name}
      </p>
    </>
  );
}

export function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();

  useEffect(() => {
    document.title = pageTitle("Sign in");
  }, []);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    const { error: apiError, response } = await api.POST("/api/auth/login", {
      body: { email, password },
    });
    setSubmitting(false);
    if (apiError) {
      // 403: right password, but this account can't sign in here (e.g.
      // single-user mode) — say why rather than blame the password.
      const detail = (apiError as { detail?: unknown }).detail;
      setError(
        response.status === 403 && typeof detail === "string"
          ? detail
          : "Login failed — check your email and password.",
      );
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ["me"] });
    const from =
      (location.state as { from?: string } | null)?.from ??
      searchParams.get("from");
    if (isSafeRelativePath(from)) {
      navigate(from, { replace: true });
      return;
    }
    sessionStorage.setItem("post-login", "1");
    navigate("/", { replace: true });
  }

  return (
    <AuthSplit brand={<BrandPanel />} form={
      <Card className="rounded-xl shadow-[var(--shadow-overlay)]">
        <CardHeader className="items-start text-left">
          {/* The brand panel is hidden below lg, so the logo sits in the card there. */}
          <Logo className="mb-3 lg:hidden" />
          <CardTitle className="text-display!">Welcome back</CardTitle>
          <CardDescription>Sign in to {BRAND.name}</CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-5">
            <div className="space-y-3">
              <label htmlFor="email" className="block text-sm font-medium">
                Email
              </label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="username"
                placeholder="you@company.com"
              />
            </div>
            <div className="space-y-3">
              <label htmlFor="password" className="block text-sm font-medium">
                Password
              </label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </div>
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <Button type="submit" disabled={submitting} className="w-full">
              {submitting ? "Signing in…" : "Sign in"}
            </Button>
          </CardContent>
        </form>
      </Card>
    }
    />
  );
}
