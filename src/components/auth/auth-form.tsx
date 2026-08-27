"use client";

import Link from "next/link";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Field, FormError, Input } from "@/components/ui/field";
import type { AuthState } from "@/lib/auth/actions";

type Props = {
  mode: "login" | "signup";
  action: (state: AuthState, formData: FormData) => Promise<AuthState>;
  next?: string;
  initialError?: string;
};

export function AuthForm({ mode, action, next, initialError }: Props) {
  const [state, formAction, pending] = useActionState<AuthState, FormData>(
    action,
    initialError ? { formError: initialError } : {},
  );

  const isSignup = mode === "signup";

  if (state.notice) {
    return (
      <div className="rounded-xl border border-border bg-surface-subtle px-5 py-6 text-center">
        <p className="font-medium">Almost there</p>
        <p className="mt-1.5 text-sm text-muted text-pretty">{state.notice}</p>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4" noValidate>
      {next && <input type="hidden" name="next" value={next} />}

      <FormError>{state.formError}</FormError>

      {isSignup && (
        <Field label="Name" htmlFor="name" error={state.fieldErrors?.name}>
          <Input
            id="name"
            name="name"
            autoComplete="name"
            required
            defaultValue={state.values?.name}
            aria-invalid={Boolean(state.fieldErrors?.name)}
          />
        </Field>
      )}

      <Field label="Email" htmlFor="email" error={state.fieldErrors?.email}>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          defaultValue={state.values?.email}
          aria-invalid={Boolean(state.fieldErrors?.email)}
        />
      </Field>

      <Field
        label="Password"
        htmlFor="password"
        error={state.fieldErrors?.password}
        hint={isSignup ? "At least 8 characters." : undefined}
      >
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete={isSignup ? "new-password" : "current-password"}
          required
          aria-invalid={Boolean(state.fieldErrors?.password)}
        />
      </Field>

      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending
          ? isSignup
            ? "Creating account…"
            : "Signing in…"
          : isSignup
            ? "Create account"
            : "Sign in"}
      </Button>

      <p className="text-center text-sm text-muted">
        {isSignup ? "Already have an account? " : "New to Tender? "}
        <Link
          href={isSignup ? "/login" : "/signup"}
          className="font-medium text-foreground underline underline-offset-4"
        >
          {isSignup ? "Sign in" : "Create an account"}
        </Link>
      </p>
    </form>
  );
}
