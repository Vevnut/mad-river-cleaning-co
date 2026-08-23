import { Construction } from "lucide-react";

export function ComingSoonPage({ title }: { title: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        <Construction className="h-6 w-6 text-muted-foreground" />
      </div>
      <h1 className="text-xl font-semibold" data-testid="text-page-title">{title}</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        This section is coming in a later phase of the Ridgeline build. Check back soon.
      </p>
    </div>
  );
}
