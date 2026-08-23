import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement>
>(({ className, type = "button", ...props }, ref) => (
  <button
    ref={ref}
    type={type}
    className={cn(
      "inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition focus-visible:outline-none disabled:pointer-events-none disabled:opacity-60",
      className,
    )}
    {...props}
  />
));
Button.displayName = "Button";
