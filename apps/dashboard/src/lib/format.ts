import { formatDistanceToNow } from "date-fns";

export function formatRelativeTime(date: string | Date | null | undefined): string {
  if (!date) return "Never";
  try {
    return formatDistanceToNow(new Date(date), { addSuffix: true });
  } catch {
    return "Unknown";
  }
}

const STATUS_LABELS: Record<string, string> = {
  running: "Running",
  pending: "Provisioning",
  provisioning: "Provisioning",
  failed: "Failed",
  stopped: "Stopped",
  building: "Building",
  deploying: "Deploying",
  online: "Online",
  offline: "Offline",
  success: "Success",
  queued: "Queued",
};

export function formatStatus(status: string): string {
  return STATUS_LABELS[status] ?? status.charAt(0).toUpperCase() + status.slice(1);
}

export function truncate(str: string, max = 32): string {
  if (str.length <= max) return str;
  return `${str.slice(0, max - 1)}…`;
}
