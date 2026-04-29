import * as React from "react";
import * as ProgressPrimitive from "@radix-ui/react-progress";

import { cn } from "@/lib/utils";

interface ProgressProps extends React.ComponentPropsWithoutRef<typeof ProgressPrimitive.Root> {
  variant?: 'default' | 'motoboy';
}

const Progress = React.forwardRef<
  React.ElementRef<typeof ProgressPrimitive.Root>,
  ProgressProps
>(({ className, value, variant = 'default', ...props }, ref) => {
  const baseRoot = "relative h-4 w-full overflow-hidden rounded-full bg-secondary";
  const indicatorBase = cn(
    "h-full w-full flex-1 transition-all",
    variant === 'default' ? "bg-primary" : "bg-orange-500"
  );

  return (
    <ProgressPrimitive.Root
      ref={ref}
      className={cn(baseRoot, className)}
      {...props}
    >
      <ProgressPrimitive.Indicator
        className={indicatorBase}
        style={{ transform: `translateX(-${100 - (value || 0)}%)` }}
      />
    </ProgressPrimitive.Root>
  );
});

Progress.displayName = ProgressPrimitive.Root.displayName;

export { Progress };
