"use client";

import { useActionState } from "react";
import { Sparkles } from "lucide-react";
import { generateSuggestionsAction } from "@/server/ai/actions";
import { useFormSubmit } from "@/components/use-form-submit";
import { Button } from "@/components/ui/button";

export function GenerateSuggestionsButton({ clientId, query, hasExisting }: { clientId: string; query: Record<string, string | undefined>; hasExisting: boolean }) {
  const [state, action, pending] = useActionState(generateSuggestionsAction.bind(null, clientId), undefined);
  const form = useFormSubmit(action);
  return (
    <form {...form} className="flex flex-col items-end gap-1">
      {(["range", "compare", "from", "to"] as const).map((k) => query[k] && <input key={k} type="hidden" name={k} value={query[k]} />)}
      <Button type="submit" variant="outline" size="sm" disabled={pending}>
        <Sparkles className="h-3.5 w-3.5" aria-hidden /> {pending ? "Analysing… (up to a minute)" : hasExisting ? "Refresh suggestions" : "Generate suggestions"}
      </Button>
      {state?.error && <p className="max-w-80 text-right text-xs text-critical-ink" role="alert">{state.error}</p>}
      {state?.ok && <p className="sr-only" role="status">{state.ok}</p>}
    </form>
  );
}
