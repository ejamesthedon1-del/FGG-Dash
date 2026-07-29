import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "./utils";

/**
 * FGG button kit (Untitled UI–inspired surfaces):
 * Primary | Secondary (white + ring) | Soft (brand wash) | Outline (blue) | Tertiary | Text
 * Shapes: rounded (default) | pill
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1 whitespace-nowrap text-sm font-semibold transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 [&_svg]:shrink-0 [&_svg]:stroke-[2.25] shrink-0 outline-none focus-visible:ring-[3px] focus-visible:ring-brand/35 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        // Primary — solid brand
        default:
          "rounded-lg bg-brand text-brand-foreground shadow-xs ring-1 ring-transparent ring-inset hover:bg-brand-hover dark:bg-brand dark:text-brand-foreground dark:hover:bg-brand-hover",
        // Secondary — Untitled-style white / gray ring (default action chrome)
        secondary:
          "rounded-lg bg-white text-[#414651] shadow-xs ring-1 ring-inset ring-[#D5D7DA] hover:bg-[#FAFAFA] hover:text-[#181D27] dark:bg-transparent dark:text-[#E5E7EB] dark:ring-[#4B5568] dark:hover:bg-white/5",
        // Soft — brand wash (former secondary)
        soft:
          "rounded-lg border border-transparent bg-brand-soft text-brand hover:bg-brand-soft-hover dark:bg-brand-soft dark:text-[#5B8FFF] dark:hover:bg-brand-soft-hover",
        // Outline — blue outline
        outline:
          "rounded-lg border border-brand bg-background text-brand hover:bg-brand-soft dark:bg-transparent dark:border-brand dark:text-[#5B8FFF] dark:hover:bg-brand-soft",
        // Tertiary — quiet text / light hover
        tertiary:
          "rounded-lg bg-transparent text-[#414651] hover:bg-[#FAFAFA] hover:text-[#181D27] dark:text-[#E5E7EB] dark:hover:bg-white/5",
        // Text — no chrome, brand-colored label
        ghost:
          "rounded-lg bg-transparent text-brand hover:bg-brand-soft dark:text-[#5B8FFF] dark:hover:bg-brand-soft",
        link: "text-brand underline-offset-4 hover:underline dark:text-[#5B8FFF]",
        destructive:
          "rounded-lg bg-destructive text-white shadow-xs hover:bg-destructive/90 focus-visible:ring-destructive/25 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60",
      },
      size: {
        default: "h-10 px-3.5 py-2.5 has-[>svg]:px-3",
        sm: "h-9 gap-1 px-3 py-2 has-[>svg]:px-2.5",
        lg: "h-11 px-4 py-2.5 has-[>svg]:px-3.5",
        icon: "size-9",
      },
      shape: {
        default: "rounded-lg",
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
