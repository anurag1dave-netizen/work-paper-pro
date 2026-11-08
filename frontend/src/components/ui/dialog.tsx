import * as React from "react";
import * as D from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
export const Dialog = D.Root;
export const DialogContent = React.forwardRef<React.ElementRef<typeof D.Content>, React.ComponentPropsWithoutRef<typeof D.Content>>(({ className, children, ...p }, ref) => (
  <D.Portal>
    <D.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
    <D.Content ref={ref} aria-describedby={undefined} className={cn("fixed left-1/2 top-1/2 z-50 grid max-h-[90vh] w-[95vw] -translate-x-1/2 -translate-y-1/2 gap-4 overflow-y-auto rounded-lg border bg-card p-6 shadow-lg", className)} {...p}>
      {children}
      <D.Close className="absolute right-3 top-3 rounded-sm opacity-70 hover:opacity-100"><X className="h-4 w-4" /></D.Close>
    </D.Content>
  </D.Portal>
));
DialogContent.displayName = "DialogContent";
export const DialogHeader = (p: React.HTMLAttributes<HTMLDivElement>) => <div className={cn("flex flex-col gap-1", p.className)} {...p} />;
export const DialogFooter = (p: React.HTMLAttributes<HTMLDivElement>) => <div className={cn("flex justify-end gap-2", p.className)} {...p} />;
export const DialogTitle = React.forwardRef<React.ElementRef<typeof D.Title>, React.ComponentPropsWithoutRef<typeof D.Title>>(({ className, ...p }, ref) => (
  <D.Title ref={ref} className={cn("text-lg font-semibold text-primary", className)} {...p} />
));
DialogTitle.displayName = "DialogTitle";
