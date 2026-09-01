"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const FIELD_LABELS: Record<string, string> = {
  host: "Host",
  port: "Port",
  database: "Database",
  username: "Username",
  user: "User",
  password: "Password",
  url: "Connection URL",
  connectionString: "Connection String",
  internalUrl: "Internal URL",
  externalUrl: "External URL",
  endpoint: "Endpoint",
  accessKey: "Access Key",
  secretKey: "Secret Key",
  bucket: "Bucket",
};

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={copy} aria-label="Copy">
      {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
    </Button>
  );
}

export function ConnectionInfoPanel({
  connectionInfo,
  isProvisioning,
}: {
  connectionInfo?: Record<string, string>;
  isProvisioning?: boolean;
}) {
  if (isProvisioning) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Connection Info</CardTitle>
          <CardDescription>Your service is being provisioned. Connection details will appear here when ready.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!connectionInfo || Object.keys(connectionInfo).length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Connection Info</CardTitle>
          <CardDescription>No connection details available yet.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const entries = Object.entries(connectionInfo);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Connection Info</CardTitle>
        <CardDescription>Use these credentials to connect your application to this service.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {entries.map(([key, value]) => (
          <div
            key={key}
            className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2"
          >
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-muted-foreground">
                {FIELD_LABELS[key] ?? key.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase())}
              </p>
              <p className="truncate font-mono text-sm">{value}</p>
            </div>
            <CopyButton value={value} />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function CopyableCode({ code, label }: { code: string; label?: string }) {
  return (
    <div className="relative rounded-lg border border-border bg-muted/30">
      {label && <p className="border-b border-border px-4 py-2 text-xs font-medium text-muted-foreground">{label}</p>}
      <div className="flex items-start gap-2 p-4">
        <pre className="flex-1 overflow-x-auto text-xs text-foreground">{code}</pre>
        <CopyButton value={code} />
      </div>
    </div>
  );
}
