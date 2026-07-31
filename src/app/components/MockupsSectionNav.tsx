import { Link } from "react-router";
import { cn } from "./ui/utils";

export type MockupsSection = "generate" | "ad-copy" | "creative-assets";

const items: { id: MockupsSection; label: string; to: string }[] = [
  { id: "generate", label: "Generate", to: "/mockups" },
  { id: "ad-copy", label: "Ad copy", to: "/mockups?section=ad-copy" },
  { id: "creative-assets", label: "Creative assets", to: "/creative-assets" },
];

export function MockupsSectionNav({ active }: { active: MockupsSection }) {
  return (
    <nav
      className="bg-muted text-muted-foreground inline-flex h-9 w-fit items-center justify-center rounded-xl p-[3px]"
      aria-label="Studio sections"
    >
      {items.map((item) => {
        const isActive = item.id === active;
        return (
          <Link
            key={item.id}
            to={item.to}
            className={cn(
              "inline-flex h-[calc(100%-1px)] items-center justify-center rounded-xl border border-transparent px-2 py-1 text-sm font-medium whitespace-nowrap transition-[color,box-shadow]",
              isActive
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
            aria-current={isActive ? "page" : undefined}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
