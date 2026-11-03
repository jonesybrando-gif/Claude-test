import { initials } from "@/lib/logo";

const SIZES = {
  sm: "h-8 min-w-8 max-w-24 text-xs",
  md: "h-12 min-w-12 max-w-40 text-sm",
  lg: "h-16 min-w-16 max-w-56 text-lg",
} as const;

/**
 * A client's logo, or their initials on a neutral tile when none is set.
 * Logos keep their own shape (wide wordmarks stay wide) inside a fixed height.
 */
export function ClientLogo({ name, logoUrl, size = "md", className = "" }: { name: string; logoUrl: string | null | undefined; size?: keyof typeof SIZES; className?: string }) {
  const box = `${SIZES[size]} shrink-0 rounded-xl`;
  if (logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={logoUrl} alt={`${name} logo`} className={`${box} w-auto border border-border bg-white object-contain p-1.5 ${className}`} />
    );
  }
  return (
    <div role="img" aria-label={name} className={`${box} flex aspect-square items-center justify-center border border-border bg-surface font-bold tracking-wide text-text ${className}`}>
      {initials(name)}
    </div>
  );
}
