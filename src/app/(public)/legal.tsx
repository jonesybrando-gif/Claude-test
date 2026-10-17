import { site } from "@/lib/site";

/** Shared typography for the privacy policy and terms. */
export function LegalPage({ title, intro, children }: { title: string; intro: React.ReactNode; children: React.ReactNode }) {
  return (
    <article className="flex max-w-[720px] flex-col gap-6 text-[15px] leading-relaxed text-text-2 [&_h2]:mt-2 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-text [&_li]:ml-5 [&_li]:list-disc [&_strong]:font-medium [&_strong]:text-text [&_ul]:flex [&_ul]:flex-col [&_ul]:gap-1.5">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold text-text">{title}</h1>
        <p className="text-sm text-text-3">Last updated {site.policyDate}</p>
        <div>{intro}</div>
      </header>
      {children}
    </article>
  );
}

export function Contact() {
  return site.contactEmail ? (
    <>email <strong>{site.contactEmail}</strong></>
  ) : (
    <>contact {site.company} through your usual contact there</>
  );
}
