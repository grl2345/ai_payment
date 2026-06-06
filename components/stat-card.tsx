import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: React.ReactNode;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  variant?: "default" | "primary" | "success" | "warning" | "destructive";
  compact?: boolean;
  /** QuickBI 风格：左图标 + 右指标，白底轻阴影 */
  quickBi?: boolean;
}

export function StatCard({
  title,
  value,
  subtitle,
  icon,
  trend,
  variant = "default",
  compact = false,
  quickBi = false,
}: StatCardProps) {
  const variantStyles = {
    default: "bg-card border-border/80",
    primary: "bg-card border-primary/20",
    success: "bg-card border-emerald-500/20",
    warning: "bg-amber-50/90 border-amber-200/80 dark:bg-amber-950/25 dark:border-amber-800/50",
    destructive: "bg-destructive/5 border-destructive/25",
  };

  const iconStyles = {
    default: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
    primary: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400",
    success: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400",
    warning: "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300",
    destructive: "bg-red-50 text-destructive dark:bg-red-950/40",
  };

  if (quickBi) {
    return (
      <Card
        className={cn(
          "border shadow-sm transition-shadow hover:shadow-md",
          variantStyles[variant]
        )}
      >
        <CardContent className="flex items-center gap-3.5 p-4">
          {icon ? (
            <div
              className={cn(
                "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl",
                iconStyles[variant]
              )}
            >
              {icon}
            </div>
          ) : null}
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-muted-foreground">{title}</p>
            <p
              className={cn(
                "mt-0.5 truncate text-xl font-semibold tracking-tight tabular-nums sm:text-2xl",
                variant === "warning" && "text-amber-900 dark:text-amber-100",
                variant === "destructive" && "text-destructive",
                variant === "success" && "text-emerald-700 dark:text-emerald-300"
              )}
            >
              {value}
            </p>
            {(subtitle || trend) && (
              <p className="mt-1 truncate text-[11px] text-muted-foreground">
                {trend ? (
                  <span
                    className={cn(
                      "mr-1.5 font-medium",
                      trend.isPositive ? "text-emerald-600" : "text-destructive"
                    )}
                  >
                    {trend.isPositive ? "+" : "-"}
                    {Math.abs(trend.value)}%
                  </span>
                ) : null}
                {subtitle}
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (compact) {
    return (
      <Card className={cn("border", variantStyles[variant])}>
        <CardContent className="flex min-h-[92px] items-center gap-3 p-3">
          {icon && (
            <div
              className={cn(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-md",
                iconStyles[variant]
              )}
            >
              {icon}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted-foreground truncate">{title}</p>
            <p
              className={cn(
                "truncate text-lg font-semibold leading-tight tabular-nums",
                variant === "warning" && "text-warning-foreground",
                variant === "destructive" && "text-destructive"
              )}
            >
              {value}
            </p>
            {(subtitle || trend) && (
              <p className="text-[11px] text-muted-foreground truncate">
                {trend && (
                  <span
                    className={cn(
                      "font-medium mr-1",
                      trend.isPositive ? "text-success" : "text-destructive"
                    )}
                  >
                    {trend.isPositive ? "+" : "-"}
                    {Math.abs(trend.value)}%
                  </span>
                )}
                {subtitle}
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn("border", variantStyles[variant])}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <p className="text-xs font-medium text-muted-foreground">{title}</p>
          {icon && (
            <div
              className={cn(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-md",
                iconStyles[variant]
              )}
            >
              {icon}
            </div>
          )}
        </div>
        <div className="text-xl font-bold text-card-foreground mt-1 tabular-nums">
          {value}
        </div>
        {(subtitle || trend) && (
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {trend && (
              <span
                className={cn(
                  "font-medium mr-1",
                  trend.isPositive ? "text-success" : "text-destructive"
                )}
              >
                {trend.isPositive ? "+" : "-"}
                {Math.abs(trend.value)}%
              </span>
            )}
            {subtitle}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
