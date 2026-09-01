"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

export function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "default",
  onConfirm,
  loading,
}: {
  trigger: React.ReactNode;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "default" | "destructive";
  onConfirm: () => void | Promise<void>;
  loading?: boolean;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={loading}
            className={variant === "destructive" ? "bg-destructive hover:bg-destructive/90" : undefined}
          >
            {loading ? "Please wait..." : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function ConfirmButton({
  label,
  title,
  description,
  confirmLabel,
  variant = "destructive",
  onConfirm,
  loading,
}: {
  label: string;
  title: string;
  description: string;
  confirmLabel?: string;
  variant?: "default" | "destructive" | "outline" | "secondary" | "ghost";
  onConfirm: () => void | Promise<void>;
  loading?: boolean;
}) {
  return (
    <ConfirmDialog
      trigger={
        <Button variant={variant} size="sm">
          {label}
        </Button>
      }
      title={title}
      description={description}
      confirmLabel={confirmLabel ?? label}
      variant={variant === "destructive" ? "destructive" : "default"}
      onConfirm={onConfirm}
      loading={loading}
    />
  );
}
