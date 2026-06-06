"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  Upload,
  CheckSquare,
  Receipt,
  Check,
  AlertCircle,
  Circle,
  ChevronRight,
} from "lucide-react";
import type { WorkflowStep, WorkflowStepKey } from "@/lib/import/workflow-view";

const stepIcons: Record<WorkflowStepKey, typeof Upload> = {
  import: Upload,
  verify: CheckSquare,
  payment: Receipt,
};

function StepNode({
  step,
  isLast,
}: {
  step: WorkflowStep;
  isLast: boolean;
}) {
  const Icon = stepIcons[step.key];

  const nodeClass = cn(
    "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
    step.status === "done" &&
      "border-success bg-success/15 text-success",
    step.status === "active" &&
      "border-primary bg-primary/15 text-primary",
    step.status === "error" &&
      "border-destructive bg-destructive/15 text-destructive",
    step.status === "pending" &&
      "border-muted-foreground/30 bg-muted text-muted-foreground"
  );

  return (
    <div className="flex items-center flex-1 min-w-0">
      <Link
        href={step.href}
        className="group flex flex-col items-center gap-1.5 min-w-[88px] flex-1"
        title={`${step.label}：${step.summary}`}
      >
        <div className={nodeClass}>
          {step.status === "done" ? (
            <Check className="h-4 w-4" />
          ) : step.status === "error" ? (
            <AlertCircle className="h-4 w-4" />
          ) : (
            <Icon className="h-4 w-4" />
          )}
        </div>
        <span className="text-xs font-medium text-foreground group-hover:text-primary">
          {step.label}
        </span>
        <span
          className={cn(
            "text-[11px] text-center leading-tight max-w-[100px] truncate px-1",
            step.status === "error" && "text-destructive",
            step.status === "active" && "text-primary",
            step.status === "done" && "text-muted-foreground",
            step.status === "pending" && "text-muted-foreground"
          )}
        >
          {step.summary}
        </span>
      </Link>
      {!isLast && (
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/50 mx-1 hidden sm:block" />
      )}
    </div>
  );
}

export function WorkflowPipeline({ steps }: { steps: WorkflowStep[] }) {
  return (
    <div className="flex items-start w-full py-2">
      {steps.map((step, index) => (
        <StepNode key={step.key} step={step} isLast={index === steps.length - 1} />
      ))}
    </div>
  );
}

export function WorkflowPipelineCompact({ steps }: { steps: WorkflowStep[] }) {
  return (
    <div className="flex items-center gap-1">
      {steps.map((step, index) => (
        <div key={step.key} className="flex items-center gap-1">
          <span
            className={cn(
              "inline-flex h-2 w-2 rounded-full",
              step.status === "done" && "bg-success",
              step.status === "active" && "bg-primary",
              step.status === "error" && "bg-destructive",
              step.status === "pending" && "bg-muted-foreground/40"
            )}
            title={`${step.label}：${step.summary}`}
          />
          {index < steps.length - 1 && (
            <Circle className="h-1 w-1 fill-muted-foreground/30 text-muted-foreground/30" />
          )}
        </div>
      ))}
    </div>
  );
}
