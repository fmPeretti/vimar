"use client";

import { Alert, Button, Field, Input } from "@vimar/ui";
import { useState } from "react";
import { loginAction } from "@/lib/actions/auth-actions";
import { useAction } from "@/lib/use-action";

export function LoginScreen({
  from,
  initiallyLocked,
}: {
  from: string | null;
  initiallyLocked: boolean;
}) {
  const action = useAction();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const locked = initiallyLocked && !action.error;

  const submit = () => {
    action.run(() => loginAction(username, password, from));
  };

  return (
    <div className="vm-login">
      <div className="vm-login__card">
        {/* eslint-disable-next-line @next/next/no-img-element -- local static asset, no need for next/image here */}
        <img className="vm-login__mark" src="/logo.png" alt="" aria-hidden="true" />
        <h1 className="vm-login__title">Sign in</h1>
        <span className="vm-login__tagline">stitches &amp; stock</span>

        {locked ? (
          <Alert tone="error" title="Locked">
            Too many failed attempts. Restart the server, or clear it in the database.
          </Alert>
        ) : action.error ? (
          <Alert tone="error">{action.error}</Alert>
        ) : null}

        <form
          className="vm-login__form"
          style={{ marginTop: 20 }}
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <Field label="Username">
            <Input
              value={username}
              autoComplete="username"
              autoFocus
              disabled={locked || action.pending}
              onChange={(e) => setUsername(e.target.value)}
            />
          </Field>
          <Field label="Password">
            <Input
              type="password"
              value={password}
              autoComplete="current-password"
              disabled={locked || action.pending}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          <Button type="submit" disabled={locked || action.pending}>
            {action.pending ? "Signing in…" : "Sign in"}
          </Button>
        </form>

        <p className="vm-login__foot">Three wrong passwords in a row locks the site.</p>
      </div>
    </div>
  );
}
