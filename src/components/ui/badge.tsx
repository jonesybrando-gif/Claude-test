import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "./cn";

const badgeVariants = cva("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap", {
  variants: {
    variant: {
      neutral: "bg-surface-2 text-text-2 border border-border",
      good: "bg-good-bg text-good-ink",
      warning: "bg-warning-bg text-warning-ink",
      serious: "bg-serious-bg text-serious-ink",
      critical: "bg-critical-bg text-critical-ink",
      info: "bg-info-bg text-info-ink",
    },
  },
  defaultVariants: { variant: "neutral" },
});

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
