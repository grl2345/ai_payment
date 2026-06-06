"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  Upload,
  Banknote,
  BarChart3,
  Truck,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import type { AiTodoSummary } from "@/lib/import/ai-suggestions";

type NavItem = {
  title: string;
  mobileTitle: string;
  href: string;
  icon: typeof Upload;
  badgeKey?: "pendingRecognition" | "todo" | "importHub" | "canGeneratePayment";
};

const mainNavItems: NavItem[] = [
  {
    title: "单据中心",
    mobileTitle: "单据",
    href: "/import",
    icon: Upload,
    badgeKey: "importHub",
  },
  { title: "付款中心", mobileTitle: "付款", href: "/payment", icon: Banknote, badgeKey: "canGeneratePayment" },
  { title: "统计查询", mobileTitle: "统计", href: "/statistics", icon: BarChart3 },
];

const settingsNavItems: NavItem[] = [
  { title: "车辆结算档案", mobileTitle: "档案", href: "/settings", icon: Truck },
];

function badgeValue(
  key: NavItem["badgeKey"],
  summary: AiTodoSummary | null
): number {
  if (!key || !summary) return 0;
  if (key === "pendingRecognition") return summary.pendingRecognition;
  if (key === "canGeneratePayment") return summary.canGeneratePayment;
  if (key === "importHub") {
    return (
      summary.pendingRecognition +
      summary.aiFixable +
      summary.manual
    );
  }
  // todo：可一键 + 需人工
  return summary.aiFixable + summary.manual;
}

function useAiBadges() {
  const pathname = usePathname();
  const [summary, setSummary] = useState<AiTodoSummary | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/import");
      const data = await res.json();
      if (res.ok) setSummary(data.aiTodos?.summary ?? null);
    } catch {
      /* 角标非关键 */
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, pathname]);

  return summary;
}

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const summary = useAiBadges();

  const renderNav = (items: NavItem[]) =>
    items.map((item) => {
      const isActive =
        pathname === item.href || pathname.startsWith(item.href + "/");
      const badge = badgeValue(item.badgeKey, summary);
      return (
        <Link
          key={item.href}
          href={item.href}
          className={cn(
            "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
            isActive
              ? "bg-sidebar-accent text-sidebar-accent-foreground"
              : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          )}
        >
          <div className="relative">
            <item.icon className="h-5 w-5 shrink-0" />
            {collapsed && badge > 0 && (
              <span className="absolute -right-1.5 -top-1.5 h-2 w-2 rounded-full bg-destructive" />
            )}
          </div>
          {!collapsed && <span className="flex-1">{item.title}</span>}
          {!collapsed && badge > 0 && (
            <span
              className={cn(
                "min-w-[18px] rounded-full px-1.5 py-0.5 text-center text-[10px] font-semibold",
                item.badgeKey === "canGeneratePayment"
                  ? "bg-primary/15 text-primary"
                  : "bg-destructive/15 text-destructive"
              )}
            >
              {badge}
            </span>
          )}
        </Link>
      );
    });

  return (
    <div
      className={cn(
        "hidden md:flex h-screen flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border transition-all duration-300",
        collapsed ? "w-16" : "w-60"
      )}
    >
      {/* Logo */}
      <div className="flex h-16 items-center justify-between border-b border-sidebar-border px-4">
        {!collapsed && (
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-sidebar-primary">
              <span className="text-sm font-bold text-sidebar-primary-foreground">竹</span>
            </div>
            <span className="text-sm font-semibold">竹核通</span>
          </div>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-sidebar-foreground hover:bg-sidebar-accent"
          onClick={() => setCollapsed(!collapsed)}
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </Button>
      </div>

      {/* Main Navigation */}
      <div className="flex-1 overflow-y-auto py-4">
        <nav className="space-y-1 px-2">{renderNav(mainNavItems)}</nav>

        {/* Settings Section */}
        <div className="mt-6 px-2">
          {!collapsed && (
            <div className="px-3 mb-2">
              <span className="text-xs font-medium text-sidebar-foreground/50 uppercase tracking-wider">
                基础设置
              </span>
            </div>
          )}
          <nav className="space-y-1">{renderNav(settingsNavItems)}</nav>
        </div>
      </div>

      {/* User Info */}
      <div className="border-t border-sidebar-border p-4">
        <div className={cn("flex items-center gap-3", collapsed && "justify-center")}>
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary">
            <span className="text-xs font-medium text-primary-foreground">管</span>
          </div>
          {!collapsed && (
            <div className="flex flex-col">
              <span className="text-sm font-medium">管理员</span>
              <span className="text-xs text-sidebar-foreground/60">财务部</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function MobileNav() {
  const pathname = usePathname();
  const summary = useAiBadges();
  const items = [...mainNavItems, ...settingsNavItems];

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-sidebar-border bg-sidebar/95 px-1 pb-[env(safe-area-inset-bottom)] shadow-lg backdrop-blur md:hidden">
      <div className="grid grid-cols-4 gap-0.5">
        {items.map((item) => {
          const isActive =
            pathname === item.href || pathname.startsWith(item.href + "/");
          const badge = badgeValue(item.badgeKey, summary);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "relative flex min-h-14 flex-col items-center justify-center gap-1 rounded-md px-1 text-[10px] transition-colors",
                isActive
                  ? "text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/65"
              )}
            >
              <div className="relative">
                <item.icon
                  className={cn(
                    "h-5 w-5",
                    isActive &&
                      "rounded-md bg-sidebar-accent p-0.5 text-sidebar-accent-foreground"
                  )}
                />
                {badge > 0 && (
                  <span className="absolute -right-2 -top-1.5 min-w-[14px] rounded-full bg-destructive px-1 text-center text-[9px] font-semibold text-white">
                    {badge}
                  </span>
                )}
              </div>
              <span className="whitespace-nowrap">{item.mobileTitle}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
