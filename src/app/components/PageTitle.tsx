import type { ComponentPropsWithoutRef, ElementType, ReactNode } from "react";
import { cn } from "./ui/utils";

/** Internal-tool page title: 26px / 600 — not marketing-scale. */
export const PAGE_TITLE_CLASS =
  "text-[26px] font-semibold leading-[1.2] tracking-[-0.22px] text-gray-900";

type PageTitleProps<T extends ElementType = "h1"> = {
  as?: T;
  children: ReactNode;
  className?: string;
} & Omit<ComponentPropsWithoutRef<T>, "as" | "children" | "className">;

export function PageTitle<T extends ElementType = "h1">({
  as,
  children,
  className,
  ...props
}: PageTitleProps<T>) {
  const Tag = (as ?? "h1") as ElementType;
  return (
    <Tag className={cn(PAGE_TITLE_CLASS, className)} {...props}>
      {children}
    </Tag>
  );
}
