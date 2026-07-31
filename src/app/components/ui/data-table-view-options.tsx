"use client";

import { type Table } from "@tanstack/react-table";
import { Settings2 } from "lucide-react";

import { Button } from "./button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./dropdown-menu";

const COLUMN_LABELS: Record<string, string> = {
  brandLabel: "Brand",
  orderNumber: "Order",
  customer: "Customer",
  product: "Product",
  color: "Color",
  size: "Size",
  quantity: "Qty",
  orderDate: "Ordered",
  expectedShipDate: "Ship by",
  stage: "Stage",
};

export function DataTableViewOptions<TData>({
  table,
  columnLabels,
}: {
  table: Table<TData>;
  columnLabels?: Record<string, string>;
}) {
  const labels = { ...COLUMN_LABELS, ...columnLabels };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="ml-auto hidden h-8 lg:flex"
        >
          <Settings2 className="size-4" />
          Columns
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[160px]">
        <DropdownMenuLabel>Toggle columns</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {table
          .getAllColumns()
          .filter(
            (column) =>
              typeof column.accessorFn !== "undefined" && column.getCanHide(),
          )
          .map((column) => (
            <DropdownMenuCheckboxItem
              key={column.id}
              className="capitalize"
              checked={column.getIsVisible()}
              onCheckedChange={(value) => column.toggleVisibility(!!value)}
            >
              {labels[column.id] ?? column.id}
            </DropdownMenuCheckboxItem>
          ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
