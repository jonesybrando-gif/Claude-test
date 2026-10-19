"use client";

import { useActionState } from "react";
import { createOwnerAction } from "./actions";
import { useFormSubmit } from "@/components/use-form-submit";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";

const ZONES = ["America/New_York", "America/Chicago", "America/Denver", "America/Phoenix", "America/Los_Angeles", "America/Anchorage", "Pacific/Honolulu"];

export function SetupForm() {
  const [state, action, pending] = useActionState(createOwnerAction, undefined);
  const form = useFormSubmit(action);
  const field = (id: string, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} name={id} required {...props} />
    </div>
  );
  return (
    <form {...form} className="flex flex-col gap-4">
      {field("setupToken", "Setup code (the SETUP_TOKEN value)", { type: "password", autoComplete: "off" })}
      {field("agency", "Agency name", { maxLength: 100, autoComplete: "organization" })}
      {field("name", "Your name", { maxLength: 100, autoComplete: "name" })}
      {field("email", "Your email (you'll sign in with this)", { type: "email", autoComplete: "email" })}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="timezone">Agency time zone</Label>
        <Select id="timezone" name="timezone" defaultValue="America/New_York">
          {ZONES.map((z) => <option key={z} value={z}>{z.replace("_", " ")}</option>)}
        </Select>
      </div>
      <Button type="submit" disabled={pending}>{pending ? "Creating…" : "Create my account"}</Button>
      {state?.error && <p className="text-sm text-critical-ink" role="alert">{state.error}</p>}
    </form>
  );
}
