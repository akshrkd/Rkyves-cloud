import Link from "next/link";
import { LucideIcon } from "lucide-react";
import { ReactNode } from "react";
import { Button } from "@/components/ui/button";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: { label: string; onClick?: () => void; href?: string };
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/50 px-6 py-16 text-center">
      <div className="mb-4 rounded-full bg-muted p-4">
        <Icon className="h-8 w-8 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">{description}</p>
      {action &&
        (action.href ? (
          <Button asChild className="mt-6">
            <Link href={action.href}>{action.label}</Link>
          </Button>
        ) : (
          <Button className="mt-6" onClick={action.onClick}>
            {action.label}
          </Button>
        ))}
    </div>
  );
}
