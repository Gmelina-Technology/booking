/** Title row of a staff page, with the page's main action (if any) on the right. */
export function PageHeader({ title, subtitle, children }: { title: string; subtitle?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-black/60">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}
