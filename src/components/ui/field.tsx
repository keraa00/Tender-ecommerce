import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

export function Label({ className, ...props }: ComponentProps<"label">) {
  return (
    <label
      className={cn("block text-sm font-medium text-foreground", className)}
      {...props}
    />
  );
}

export function Input({ className, ...props }: ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "h-10 w-full rounded-lg border border-border-strong bg-surface px-3",
        "text-sm text-foreground placeholder:text-muted",
        "disabled:cursor-not-allowed disabled:opacity-60",
        "aria-[invalid=true]:border-danger",
        className,
      )}
      {...props}
    />
  );
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return (
    <select
      className={cn(
        "h-10 w-full cursor-pointer rounded-lg border border-border-strong bg-surface px-3",
        "text-sm text-foreground",
        "disabled:cursor-not-allowed disabled:opacity-60",
        "aria-[invalid=true]:border-danger",
        className,
      )}
      {...props}
    />
  );
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(
        "w-full rounded-lg border border-border-strong bg-surface px-3 py-2",
        "text-sm text-foreground placeholder:text-muted",
        "aria-[invalid=true]:border-danger",
        className,
      )}
      {...props}
    />
  );
}

export function Field({
  label,
  hint,
  error,
  htmlFor,
  children,
}: {
  label: string;
  hint?: ReactNode;
  error?: string;
  htmlFor: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error ? (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-sm text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

export function FormError({ children }: { children?: ReactNode }) {
  if (!children) return null;

  return (
    <div
      role="alert"
      className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger"
    >
      {children}
    </div>
  );
}

/** FormError's counterpart for a form that went through: "Saved." */
export function FormNotice({ children }: { children?: ReactNode }) {
  if (!children) return null;

  return (
    <p
      role="status"
      className="rounded-lg border border-success/30 bg-success/5 px-3 py-2 text-sm text-success text-pretty"
    >
      {children}
    </p>
  );
}
