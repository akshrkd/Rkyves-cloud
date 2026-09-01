import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export type WizardStep = {
  id: string;
  label: string;
};

export function WizardStepper({
  steps,
  currentStep,
}: {
  steps: WizardStep[];
  currentStep: number;
}) {
  return (
    <nav aria-label="Progress" className="mb-8">
      <ol className="flex items-center gap-2">
        {steps.map((step, index) => {
          const stepNum = index + 1;
          const isComplete = stepNum < currentStep;
          const isCurrent = stepNum === currentStep;

          return (
            <li key={step.id} className="flex flex-1 items-center">
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-medium",
                    isComplete && "bg-primary text-primary-foreground",
                    isCurrent && "border-2 border-primary bg-primary/10 text-primary",
                    !isComplete && !isCurrent && "border border-border bg-muted text-muted-foreground"
                  )}
                >
                  {isComplete ? <Check className="h-4 w-4" /> : stepNum}
                </span>
                <span
                  className={cn(
                    "hidden text-sm font-medium sm:inline",
                    isCurrent ? "text-foreground" : "text-muted-foreground"
                  )}
                >
                  {step.label}
                </span>
              </div>
              {index < steps.length - 1 && (
                <div
                  className={cn(
                    "mx-2 h-px flex-1",
                    isComplete ? "bg-primary" : "bg-border"
                  )}
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
