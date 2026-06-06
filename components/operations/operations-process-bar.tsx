"use client";

import { cn } from "@/lib/utils";
import {
  Upload,
  Sparkles,
  Wallet,
  Flag,
  Check,
  ChevronRight,
} from "lucide-react";

export type OperationsProcessStep =
  | "upload"
  | "ai-detail"
  | "payment"
  | "outcome";

export type ProcessStepState = "pending" | "active" | "done" | "warning";

export type ProcessStepMeta = {
  id: OperationsProcessStep;
  label: string;
  shortHint?: string;
  status: ProcessStepState;
  badge?: number | string;
};

const stepIcons: Record<OperationsProcessStep, typeof Upload> = {
  upload: Upload,
  "ai-detail": Sparkles,
  payment: Wallet,
  outcome: Flag,
};

function StepButton({
  step,
  isActive,
  onClick,
}: {
  step: ProcessStepMeta;
  isActive: boolean;
  onClick: () => void;
}) {
  const Icon = stepIcons[step.id];
  const done = step.status === "done";
  const warning = step.status === "warning";

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group relative flex min-w-[132px] flex-1 flex-col items-center gap-1 rounded-md px-2 py-2 transition-colors sm:min-w-0",
        "hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        isActive && "bg-background shadow-sm"
      )}
    >
      <span
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded-full border-2 transition-colors",
          isActive && "border-primary bg-primary/10 text-primary",
          !isActive && done && "border-success bg-success/10 text-success",
          !isActive && warning && "border-destructive bg-destructive/10 text-destructive",
          !isActive &&
            !done &&
            !warning &&
            "border-muted-foreground/25 bg-muted/40 text-muted-foreground"
        )}
      >
        {done && !isActive ? (
          <Check className="h-4 w-4" />
        ) : (
          <Icon className="h-4 w-4" />
        )}
      </span>
      <span
        className={cn(
          "text-center text-xs font-medium leading-tight",
          isActive ? "text-primary" : "text-foreground"
        )}
      >
        {step.label}
      </span>
      {step.shortHint ? (
        <span
          className={cn(
            "text-[10px] leading-tight text-center max-w-[88px] truncate",
            warning && !isActive && "text-destructive",
            isActive && "text-primary/80",
            !isActive && !warning && "text-muted-foreground"
          )}
        >
          {step.shortHint}
        </span>
      ) : null}
      {step.badge != null && Number(step.badge) > 0 ? (
        <span className="absolute top-1 right-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-medium text-destructive-foreground">
          {step.badge}
        </span>
      ) : null}
      <span
        className={cn(
          "absolute bottom-0 left-2 right-2 h-0.5 rounded-full transition-opacity",
          isActive ? "bg-primary opacity-100" : "opacity-0"
        )}
        aria-hidden
      />
    </button>
  );
}

type OperationsProcessBarProps = {
  activeStep: OperationsProcessStep;
  steps: ProcessStepMeta[];
  onStepChange: (step: OperationsProcessStep) => void;
  className?: string;
};

export function OperationsProcessBar({
  activeStep,
  steps,
  onStepChange,
  className,
}: OperationsProcessBarProps) {
  return (
    <div
      className={cn(
        "shrink-0 overflow-x-auto rounded-lg border bg-muted/30 px-1 py-1",
        className
      )}
    >
      <div className="flex min-w-max items-stretch sm:min-w-0 sm:w-full">
        {steps.map((step, index) => (
          <div key={step.id} className="flex flex-1 items-center">
            <StepButton
              step={step}
              isActive={activeStep === step.id}
              onClick={() => onStepChange(step.id)}
            />
            {index < steps.length - 1 ? (
              <ChevronRight
                className="h-4 w-4 shrink-0 text-muted-foreground/40 hidden sm:block mx-0.5"
                aria-hidden
              />
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
