"use client";

import Link from "next/link";
import { CheckCircle2, Circle, HardDrive, FolderKanban, GitBranch } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Step = {
  id: string;
  label: string;
  description: string;
  done: boolean;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
};

export function OnboardingChecklist({
  orgId,
  projectCount,
  workerCount,
  githubConnected,
}: {
  orgId: string;
  projectCount: number;
  workerCount: number;
  githubConnected: boolean;
}) {
  const steps: Step[] = [
    {
      id: "worker",
      label: "Add a worker VM",
      description: "Deploy the agent on a VM to run services",
      done: workerCount > 0,
      href: "/dashboard/workers",
      icon: HardDrive,
    },
    {
      id: "github",
      label: "Connect GitHub",
      description: "Enable repo listing and push-to-deploy",
      done: githubConnected,
      href: `/dashboard/settings/integrations?organizationId=${orgId}`,
      icon: GitBranch,
    },
    {
      id: "project",
      label: "Create a project",
      description: "Group your apps and databases together",
      done: projectCount > 0,
      href: "/dashboard/projects",
      icon: FolderKanban,
    },
  ];

  const completed = steps.filter((s) => s.done).length;
  if (completed === steps.length) return null;

  return (
    <Card className="mb-8 border-primary/30 bg-primary/5">
      <CardHeader>
        <CardTitle className="text-base">Getting started</CardTitle>
        <CardDescription>
          {completed} of {steps.length} steps complete — finish setup to deploy your first app
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="space-y-3">
          {steps.map((step) => {
            const Icon = step.icon;
            return (
              <li key={step.id}>
                <Link
                  href={step.href}
                  className={cn(
                    "flex items-start gap-3 rounded-lg border border-border px-4 py-3 transition-colors hover:border-primary/50",
                    step.done && "opacity-60"
                  )}
                >
                  {step.done ? (
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" />
                  ) : (
                    <Circle className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Icon className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{step.label}</span>
                    </div>
                    <p className="mt-0.5 text-sm text-muted-foreground">{step.description}</p>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
