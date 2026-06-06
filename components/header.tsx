"use client";

interface HeaderProps {
  title: string;
  description?: string;
  eyebrow?: string;
}

export function Header({
  title,
  description,
  eyebrow,
}: HeaderProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/95 px-4 py-4 backdrop-blur sm:px-6">
      <div className="min-w-0">
        {eyebrow ? (
          <p className="mb-1 text-xs font-medium text-primary">{eyebrow}</p>
        ) : null}
        <h1 className="text-xl font-semibold tracking-normal text-foreground">
          {title}
        </h1>
        {description && (
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            {description}
          </p>
        )}
      </div>
    </header>
  );
}
