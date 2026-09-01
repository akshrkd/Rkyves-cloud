import { Clock, Database, Globe, Package, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

const SERVICE_TYPES = [
  {
    type: "web",
    label: "Web / API",
    desc: "Deploy from Git with automatic builds and Traefik routing.",
    detail: "Best for Node.js, Python, or any Dockerized app. Connects to GitHub for push-to-deploy.",
    icon: Globe,
    color: "text-blue-400",
  },
  {
    type: "postgres",
    label: "Postgres",
    desc: "Managed PostgreSQL database with PgBouncer connection pooling.",
    detail: "Ideal for persistent relational data. Connection string provided after provisioning.",
    icon: Database,
    color: "text-sky-400",
  },
  {
    type: "redis",
    label: "Redis",
    desc: "In-memory cache, pub/sub, and job queue.",
    detail: "Use for sessions, caching, rate limiting, or BullMQ job queues.",
    icon: Zap,
    color: "text-yellow-400",
  },
  {
    type: "storage",
    label: "Object Storage",
    desc: "S3-compatible MinIO bucket for files and assets.",
    detail: "Store uploads, backups, or static assets with S3-compatible APIs.",
    icon: Package,
    color: "text-purple-400",
  },
  {
    type: "cron",
    label: "Cron Jobs",
    desc: "Scheduled HTTP requests or container tasks.",
    detail: "Run periodic tasks like cleanup jobs, reports, or health checks.",
    icon: Clock,
    color: "text-orange-400",
  },
] as const;

export { SERVICE_TYPES };

export function ServiceTypeCard({
  type,
  label,
  desc,
  detail,
  icon: Icon,
  color,
  onClick,
  selected,
}: {
  type: string;
  label: string;
  desc: string;
  detail: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  onClick: () => void;
  selected?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full rounded-xl border bg-card p-6 text-left shadow transition-colors hover:border-primary/50",
        selected && "border-primary ring-1 ring-primary"
      )}
    >
      <div className="flex items-start gap-4">
        <div className={cn("rounded-lg bg-muted p-3", color)}>
          <Icon className="h-6 w-6" />
        </div>
        <div>
          <h3 className="font-semibold">{label}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{desc}</p>
          <p className="mt-2 text-xs text-muted-foreground/80">{detail}</p>
        </div>
      </div>
    </button>
  );
}

export function ServiceTypeGrid({ onSelect }: { onSelect: (type: string) => void }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {SERVICE_TYPES.map((t) => (
        <ServiceTypeCard key={t.type} {...t} onClick={() => onSelect(t.type)} />
      ))}
    </div>
  );
}
