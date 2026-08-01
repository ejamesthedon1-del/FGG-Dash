"use client";

import * as React from "react";
import {
  type ColumnDef,
  type ColumnFiltersState,
  type SortingState,
  type VisibilityState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { Eye, MoreHorizontal, Package, Trash2 } from "lucide-react";

import {
  isLowStock,
  materialInventoryValue,
  materialUnitCost,
  SUPPLY_CATEGORY_LABELS,
  type SupplyMaterial,
} from "../lib/shop-supplies-storage";
import { cn } from "./ui/utils";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { ButtonGroup } from "./ui/button-group";
import { Input } from "./ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./ui/table";
import { DataTableColumnHeader } from "./ui/data-table-column-header";
import { DataTablePagination } from "./ui/data-table-pagination";
import { DataTableViewOptions } from "./ui/data-table-view-options";

function MaterialThumb({
  photoDataUrl,
  name,
}: {
  photoDataUrl?: string;
  name: string;
}) {
  if (photoDataUrl) {
    return (
      <img
        src={photoDataUrl}
        alt=""
        className="size-9 shrink-0 rounded-md border border-border object-cover"
      />
    );
  }
  return (
    <div
      className="flex size-9 shrink-0 items-center justify-center rounded-md border border-dashed border-border bg-muted/40 text-muted-foreground"
      aria-hidden
      title={name}
    >
      <Package className="size-3.5" />
    </div>
  );
}

function InventoryRowActions({
  material,
  onOpenDetail,
  onDelete,
}: {
  material: SupplyMaterial;
  onOpenDetail: (material: SupplyMaterial) => void;
  onDelete: (material: SupplyMaterial) => void;
}) {
  return (
    <ButtonGroup>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label={`More options for ${material.name}`}
          >
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="z-[100] w-40">
          <DropdownMenuGroup>
            <DropdownMenuItem onSelect={() => onOpenDetail(material)}>
              <Eye />
              Manage stock
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem
              variant="destructive"
              onSelect={() => onDelete(material)}
            >
              <Trash2 />
              Delete
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </ButtonGroup>
  );
}

export type InventoryDataTableProps = {
  data: SupplyMaterial[];
  onOpenDetail: (material: SupplyMaterial) => void;
  onDelete: (material: SupplyMaterial) => void;
  toolbarActions?: React.ReactNode;
};

export function InventoryDataTable({
  data,
  onOpenDetail,
  onDelete,
  toolbarActions,
}: InventoryDataTableProps) {
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>(
    [],
  );
  const [columnVisibility, setColumnVisibility] =
    React.useState<VisibilityState>({});
  const [globalFilter, setGlobalFilter] = React.useState("");

  const columns = React.useMemo<ColumnDef<SupplyMaterial>[]>(
    () => [
      {
        id: "image",
        header: () => <span className="sr-only">Image</span>,
        enableHiding: false,
        enableSorting: false,
        cell: ({ row }) => (
          <button
            type="button"
            className="block"
            onClick={() => onOpenDetail(row.original)}
            aria-label={`Open ${row.original.name}`}
          >
            <MaterialThumb
              photoDataUrl={row.original.photoDataUrl}
              name={row.original.name}
            />
          </button>
        ),
      },
      {
        accessorKey: "name",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Item" />
        ),
        cell: ({ row }) => {
          const m = row.original;
          return (
            <button
              type="button"
              className="max-w-[220px] text-left underline-offset-4 hover:underline"
              onClick={() => onOpenDetail(m)}
            >
              <span className="block truncate font-medium text-foreground">
                {m.name}
              </span>
              {m.notes?.trim() ? (
                <span className="block truncate text-xs text-muted-foreground">
                  {m.notes.trim()}
                </span>
              ) : null}
            </button>
          );
        },
      },
      {
        accessorKey: "category",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Category" />
        ),
        cell: ({ row }) => (
          <Badge variant="outline" className="font-normal">
            {SUPPLY_CATEGORY_LABELS[row.original.category]}
          </Badge>
        ),
      },
      {
        accessorKey: "qtyOnHand",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="On hand" />
        ),
        cell: ({ row }) => {
          const m = row.original;
          return (
            <span
              className={cn(
                "tabular-nums",
                isLowStock(m) ? "font-medium text-rose-700" : "text-foreground",
              )}
            >
              {m.qtyOnHand}{" "}
              <span className="text-muted-foreground">{m.unit}</span>
            </span>
          );
        },
      },
      {
        id: "unitCost",
        accessorFn: (row) => materialUnitCost(row),
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Unit cost" />
        ),
        cell: ({ row }) => {
          const cost = materialUnitCost(row.original);
          return (
            <span className="tabular-nums text-foreground">
              {cost > 0
                ? cost.toLocaleString("en-US", {
                    style: "currency",
                    currency: "USD",
                  })
                : "—"}
            </span>
          );
        },
      },
      {
        id: "value",
        accessorFn: (row) => materialInventoryValue(row),
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Value" />
        ),
        cell: ({ row }) => {
          const value = materialInventoryValue(row.original);
          return (
            <span className="tabular-nums text-foreground">
              {value > 0
                ? value.toLocaleString("en-US", {
                    style: "currency",
                    currency: "USD",
                  })
                : "—"}
            </span>
          );
        },
      },
      {
        id: "status",
        accessorFn: (row) => (isLowStock(row) ? "low" : "ok"),
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Status" />
        ),
        cell: ({ row }) =>
          isLowStock(row.original) ? (
            <Badge variant="destructive">Low</Badge>
          ) : (
            <Badge variant="secondary">In stock</Badge>
          ),
      },
      {
        id: "actions",
        enableHiding: false,
        cell: ({ row }) => (
          <InventoryRowActions
            material={row.original}
            onOpenDetail={onOpenDetail}
            onDelete={onDelete}
          />
        ),
      },
    ],
    [onDelete, onOpenDetail],
  );

  const table = useReactTable({
    data,
    columns,
    getRowId: (row) => row.id,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      globalFilter,
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    globalFilterFn: (row, _columnId, filterValue) => {
      const q = String(filterValue ?? "")
        .trim()
        .toLowerCase();
      if (!q) return true;
      const m = row.original;
      return [
        m.name,
        m.notes,
        SUPPLY_CATEGORY_LABELS[m.category],
        m.unit,
        String(m.qtyOnHand),
      ]
        .join(" ")
        .toLowerCase()
        .includes(q);
    },
    initialState: {
      pagination: { pageSize: 20 },
    },
  });

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
          <Input
            placeholder="Filter inventory…"
            value={globalFilter}
            onChange={(event) => setGlobalFilter(event.target.value)}
            className="h-7 max-w-sm py-0 text-sm"
          />
          {toolbarActions}
          <DataTableViewOptions
            table={table}
            columnLabels={{
              name: "Item",
              category: "Category",
              qtyOnHand: "On hand",
              status: "Status",
            }}
          />
        </div>

      <div className="overflow-x-auto rounded-md border">
        <Table className="min-w-[720px]">
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center text-muted-foreground"
                >
                  No materials yet. Add tags, prints, bags, and shipping
                  supplies above.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <DataTablePagination table={table} />
    </div>
  );
}
