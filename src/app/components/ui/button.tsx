import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "./utils";

/**
 * FGG button kit:
 * Primary | Secondary (blue outline) | Secondary Filled | Tertiary (gray outline) | Text
 * Shapes: rounded (default) | pill
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:ring-[3px] focus-visible:ring-brand/35 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        // Primary — solid brand blue
        default:
          "bg-brand text-brand-foreground hover:bg-brand-hover dark:bg-brand dark:text-brand-foreground dark:hover:bg-brand-hover",
        // Secondary — blue outline
        outline:
          "border border-brand bg-background text-brand hover:bg-brand-soft dark:bg-transparent dark:border-brand dark:text-[#5B8FFF] dark:hover:bg-brand-soft",
        // Secondary Filled — soft blue wash
        secondary:
          "bg-brand-soft text-brand hover:bg-brand-soft-hover border border-transparent dark:bg-brand-soft dark:text-[#5B8FFF] dark:hover:bg-brand-soft-hover",
        // Tertiary — neutral gray outline
        tertiary:
          "border border-[#D1D5DB] bg-background text-[#111827] hover:bg-[#F8FAFC] dark:border-[#4B5568] dark:bg-transparent dark:text-[#E5E7EB] dark:hover:bg-white/5",
        // Text — no chrome, brand-colored label
        ghost:
          "bg-transparent text-brand hover:bg-brand-soft dark:text-[#5B8FFF] dark:hover:bg-brand-soft",
        link: "text-brand underline-offset-4 hover:underline dark:text-[#5B8FFF]",
        destructive:
          "bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/25 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        sm: "h-8 gap-1.5 px-3 has-[>svg]:px-2.5",
        lg: "h-10 px-6 has-[>svg]:px-4",
        icon: "size-9",
      },
      shape: {
        default: "rounded-md",
        pill: "rounded-full",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
      shape: "default",
    },
  },
);

function Button({
  className,
  variant,
  size,
  shape,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot : "button";

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, shape, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
