import { cn } from "../ui/utils";

type FolderIconProps = {
  className?: string;
  /** Larger tile icon for Quick Access cards */
  size?: "sm" | "md" | "lg";
};

const SIZE_PX = {
  sm: 28,
  md: 40,
  lg: 48,
} as const;

/** Two-tone blue folder matching the Creative Assets reference UI. */
export function FolderIcon({ className, size = "md" }: FolderIconProps) {
  const px = SIZE_PX[size];
  return (
    <svg
      width={px}
      height={px}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("shrink-0", className)}
      aria-hidden
    >
      {/* Tab */}
      <path
        d="M6 14c0-2.2 1.8-4 4-4h9.2c1.1 0 2.1.4 2.8 1.2l2.2 2.3c.7.8 1.7 1.2 2.8 1.2H38c2.2 0 4 1.8 4 4v2.5H6V14z"
        fill="#2563EB"
      />
      {/* Body */}
      <path
        d="M6 18.5h36c0 0 0 1.2 0 2.5v17c0 2.2-1.8 4-4 4H10c-2.2 0-4-1.8-4-4V18.5z"
        fill="#3B82F6"
      />
      {/* Soft face highlight */}
      <path
        d="M8 21h32v14.5c0 1.4-1.1 2.5-2.5 2.5H10.5C9.1 38 8 36.9 8 35.5V21z"
        fill="#60A5FA"
        opacity="0.35"
      />
    </svg>
  );
}
