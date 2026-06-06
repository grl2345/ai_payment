import { Badge } from "@/components/ui/badge";
import {
  getMatchConfirmChannelClassName,
  getMatchConfirmChannelLabel,
  type MatchConfirmChannel,
} from "@/lib/import/document-verification";
import { cn } from "@/lib/utils";
import { Cog, Sparkles, UserRound } from "lucide-react";

const channelIcon: Record<MatchConfirmChannel, typeof Sparkles> = {
  ai: Sparkles,
  system: Cog,
  manual: UserRound,
};

const compactLabel: Record<MatchConfirmChannel, string> = {
  ai: "AI",
  system: "系统",
  manual: "人工",
};

export function MatchConfirmChannelBadge({
  channel,
  className,
  compact = false,
}: {
  channel: MatchConfirmChannel;
  className?: string;
  compact?: boolean;
}) {
  const Icon = channelIcon[channel];
  return (
    <Badge
      variant="outline"
      className={cn(
        compact
          ? "h-4 gap-0.5 px-1 text-[9px] font-medium"
          : "gap-1 px-2 py-0.5 text-xs font-semibold shadow-sm",
        getMatchConfirmChannelClassName(channel),
        className
      )}
    >
      <Icon className={cn("shrink-0", compact ? "h-2.5 w-2.5" : "h-3.5 w-3.5")} aria-hidden />
      {compact ? compactLabel[channel] : getMatchConfirmChannelLabel(channel)}
    </Badge>
  );
}
