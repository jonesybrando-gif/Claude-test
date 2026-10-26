"use client";

import { Component, type ReactNode } from "react";
import { RotateCcw } from "lucide-react";

/**
 * Wrap one section of a page so a failure there doesn't take down the rest:
 * shows "This section couldn't load" with a Retry button. Retry re-renders the
 * children; for server-rendered sections pass `onRetry` (e.g. router.refresh)
 * via a client wrapper if the data must be fetched again.
 */
export class SectionErrorBoundary extends Component<
  { children: ReactNode; title?: string; onRetry?: () => void; className?: string },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error("[section]", error);
  }

  private retry = () => {
    this.props.onRetry?.();
    this.setState({ error: null });
  };

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" className={this.props.className ?? "flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface px-4 py-3"}>
        <p className="text-sm text-text-2">
          <span className="font-medium text-text">{this.props.title ? `${this.props.title}: ` : ""}This section couldn&apos;t load.</span> The rest of the page is fine.
        </p>
        <button type="button" onClick={this.retry} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-3 text-xs font-medium hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]">
          <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Retry
        </button>
      </div>
    );
  }
}
