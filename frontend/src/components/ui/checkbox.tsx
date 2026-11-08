import * as React from "react";
import * as C from "@radix-ui/react-checkbox";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
export const Checkbox = React.forwardRef<React.ElementRef<typeof C.Root>, React.ComponentPropsWithoutRef<typeof C.Root>>(({ className, ...p }, ref) => (
  <C.Root ref={ref} className={cn("peer h-4 w-4 shrink-0 rounded-sm border border-primary bg-card focus-visible:ring-2 focus-visible:ring-ring data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground", className)} {...p}>
    <C.Indicator className="flex items-center justify-center"><Check className="h-3.5 w-3.5" /></C.Indicator>
  </C.Root>
));
Checkbox.displayName = "Checkbox";
