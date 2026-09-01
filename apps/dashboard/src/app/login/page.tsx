"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Cloud, Loader2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, setToken } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await api<{ token: string }>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      setToken(res.token);
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen">
      <div className="hidden w-1/2 flex-col justify-between border-r border-border bg-card p-12 lg:flex">
        <div className="flex items-center gap-2">
          <Cloud className="h-8 w-8 text-primary" />
          <span className="text-xl font-bold">Rkyves Cloud</span>
        </div>
        <div>
          <h2 className="text-3xl font-bold">Deploy and manage your applications</h2>
          <p className="mt-4 text-muted-foreground">
            Rkyves Cloud is your internal Platform-as-a-Service. Deploy web apps from GitHub,
            provision databases, manage workers, and monitor services — all in one place.
          </p>
          <ul className="mt-8 space-y-3 text-sm text-muted-foreground">
            <li>• Push-to-deploy from GitHub repositories</li>
            <li>• Managed Postgres, Redis, and object storage</li>
            <li>• VM workers with real-time health monitoring</li>
          </ul>
        </div>
        <p className="text-xs text-muted-foreground">Internal use only — Rkyves team</p>
      </div>

      <div className="flex flex-1 items-center justify-center p-6">
        <Card className="w-full max-w-md border-0 shadow-none lg:border lg:shadow-sm">
          <CardHeader className="text-center lg:text-left">
            <div className="mb-2 flex items-center justify-center gap-2 lg:hidden">
              <Cloud className="h-6 w-6 text-primary" />
              <span className="text-lg font-bold">Rkyves Cloud</span>
            </div>
            <CardTitle>Sign in</CardTitle>
            <CardDescription>Enter your credentials to access the dashboard</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@rkyves.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
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
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Signing in...
                  </>
                ) : (
                  "Sign in"
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
