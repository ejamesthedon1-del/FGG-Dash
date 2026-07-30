"use client";

import * as React from "react";
import {
  type ColumnDef,
  type ColumnFiltersState,
  type RowSelectionState,
  type SortingState,
  type VisibilityState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { Loader2, MoreHorizontal } from "lucide-react";

import {
  nextStage,
  ORDER_FLOW_STAGES,
  STAGE_LABELS,
  type OrderFlowOrder,
  type OrderFlowStage,
} from "../lib/order-flow";
import { cn } from "./ui/utils";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Checkbox } from "./ui/checkbox";
import { Input } from "./ui/input";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "./ui/combobox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
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

type ComboboxOption = { value: string; label: string };

const STAGE_OPTIONS: ComboboxOption[] = ORDER_FLOW_STAGES.map((s) => ({
  value: s,
  label: STAGE_LABELS[s],
}));

function optionByValue(
  options: ComboboxOption[],
  value: string,
): ComboboxOption | null {
  return options.find((o) => o.value === value) ?? null;
}

function orderRowId(order: OrderFlowOrder) {
  return `${order.brand}::${order.id}`;
}

function deadlineClass(state: OrderFlowOrder["deadlineState"]) {
  switch (state) {
    case "overdue":
      return "text-rose-700 font-semibold";
    case "due_today":
      return "text-amber-800 font-semibold";
    case "upcoming":
      return "text-orange-700 font-medium";
    default:
      return "text-gray-700";
  }
}

function agePriorityBadge(order: OrderFlowOrder) {
  if (order.stage === "shipped") return null;
  if (order.highPriority) {
    return (
      <Badge
        variant="outline"
        className="w-fit border-rose-400 bg-rose-100 font-semibold text-rose-900"
      >
        High priority · {order.orderAgeDays ?? 7}+ days
      </Badge>
    );
  }
  if (order.earlyWarning) {
    const daysLeft = Math.max(0, 7 - (order.orderAgeDays ?? 3));
    return (
      <Badge
        variant="outline"
        className="w-fit border-amber-400 bg-amber-50 font-semibold text-amber-950"
      >
        Early warning · {daysLeft}d to late
      </Badge>
    );
  }
  return null;
}

function deadlineBadge(order: OrderFlowOrder) {
  if (order.stage === "shipped") return null;
  if (order.highPriority || order.earlyWarning) return agePriorityBadge(order);
  if (!order.expectedShipDate) return null;
  if (order.deadlineState === "overdue") {
    return (
      <Badge variant="outline" className="border-rose-300 bg-rose-50 text-rose-800">
        Overdue
      </Badge>
    );
  }
  if (order.deadlineState === "due_today") {
    return (
      <Badge
        variant="outline"
        className="border-amber-300 bg-amber-50 text-amber-900"
      >
        Due today
      </Badge>
    );
  }
  if (order.deadlineState === "upcoming") {
    return (
      <Badge
        variant="outline"
        className="border-orange-200 bg-orange-50 text-orange-800"
      >
        Ships soon
      </Badge>
    );
  }
  return null;
}

export type OrderFlowTableActions = {
  saving: boolean;
  onOpenDetail: (order: OrderFlowOrder) => void;
  onRequestStageChange: (
    stage: OrderFlowStage,
    orders: OrderFlowOrder[],
  ) => void;
};

function buildColumns(
  actions: OrderFlowTableActions,
): ColumnDef<OrderFlowOrder>[] {
  return [
    {
      id: "select",
      header: ({ table }) => (
        <Checkbox
          checked={
            table.getIsAllPageRowsSelected() ||
            (table.getIsSomePageRowsSelected() && "indeterminate")
          }
          onCheckedChange={(value) =>
            table.toggleAllPageRowsSelected(!!value)
          }
          aria-label="Select all"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label={`Select ${row.original.orderNumber}`}
        />
      ),
      enableSorting: false,
      enableHiding: false,
    },
    {
      accessorKey: "brandLabel",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Brand" />
      ),
      cell: ({ row }) => (
        <span className="text-foreground">{row.original.brandLabel}</span>
      ),
    },
    {
      accessorKey: "orderNumber",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Order" />
      ),
      cell: ({ row }) => (
        <button
          type="button"
          className="font-medium text-blue-700 hover:underline"
          onClick={() => actions.onOpenDetail(row.original)}
        >
          {row.original.orderNumber}
        </button>
      ),
    },
    {
      accessorKey: "customer",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Customer" />
      ),
    },
    {
      accessorKey: "product",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Product" />
      ),
      cell: ({ row }) => (
        <span className="block max-w-[180px] truncate" title={row.original.product}>
          {row.original.product}
        </span>
      ),
    },
    {
      accessorKey: "color",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Color" />
      ),
    },
    {
      accessorKey: "size",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Size" />
      ),
    },
    {
      accessorKey: "quantity",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Qty" />
      ),
      cell: ({ row }) => (
        <span className="tabular-nums">{row.original.quantity}</span>
      ),
    },
    {
      accessorKey: "orderDate",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Ordered" />
      ),
      cell: ({ row }) => {
        const order = row.original;
        return (
          <div
            className={cn(
              "flex flex-col gap-1 tabular-nums whitespace-normal",
              order.highPriority
                ? "font-semibold text-rose-800"
                : order.earlyWarning
                  ? "font-semibold text-amber-900"
                  : "text-foreground",
            )}
          >
            <span>{order.orderDate}</span>
            {agePriorityBadge(order)}
          </div>
        );
      },
    },
    {
      accessorKey: "expectedShipDate",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Ship by" />
      ),
      cell: ({ row }) => {
        const order = row.original;
        return (
          <div
            className={cn(
              "flex flex-col gap-1 tabular-nums whitespace-normal",
              deadlineClass(order.deadlineState),
            )}
          >
            <span>{order.expectedShipDate || "—"}</span>
            {!order.highPriority && !order.earlyWarning
              ? deadlineBadge(order)
              : null}
          </div>
        );
      },
    },
    {
      accessorKey: "stage",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Stage" />
      ),
      cell: ({ row }) => {
        const order = row.original;
        return (
          <Combobox
            items={STAGE_OPTIONS}
            value={optionByValue(STAGE_OPTIONS, order.stage)}
            disabled={actions.saving}
            onValueChange={(item) => {
              if (!item || item.value === order.stage) return;
              actions.onRequestStageChange(item.value as OrderFlowStage, [
                order,
              ]);
            }}
            isItemEqualToValue={(a, b) => a.value === b.value}
          >
            <ComboboxInput
              placeholder="Select a stage"
              className="h-8 w-[136px]"
              disabled={actions.saving}
            />
            <ComboboxContent>
              <ComboboxEmpty>No stages found.</ComboboxEmpty>
              <ComboboxList>
                {(item) => (
                  <ComboboxItem key={item.value} value={item}>
                    {item.label}
                  </ComboboxItem>
                )}
              </ComboboxList>
            </ComboboxContent>
          </Combobox>
        );
      },
      enableSorting: true,
      filterFn: (row, _id, value) => {
        if (!value) return true;
        return row.original.stage === value;
      },
    },
    {
      id: "actions",
      enableHiding: false,
      cell: ({ row }) => {
        const order = row.original;
        const nxt = nextStage(order.stage);
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-8 w-8 p-0">
                <span className="sr-only">Open menu</span>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Actions</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => actions.onOpenDetail(order)}>
                View details
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {nxt ? (
                <DropdownMenuItem
                  disabled={actions.saving}
                  onClick={() =>
                    void actions.onRequestStageChange(nxt, [order])
                  }
                >
                  Move to {STAGE_LABELS[nxt]}
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem disabled>Shipped</DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];
}

type OrderFlowDataTableProps = {
  data: OrderFlowOrder[];
  loading?: boolean;
  selected: Record<string, boolean>;
  onSelectedChange: React.Dispatch<
    React.SetStateAction<Record<string, boolean>>
  >;
} & OrderFlowTableActions;

export function OrderFlowDataTable({
  data,
  loading,
  saving,
  selected,
  onSelectedChange,
  onOpenDetail,
  onRequestStageChange,
}: OrderFlowDataTableProps) {
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>(
    [],
  );
  const [columnVisibility, setColumnVisibility] =
    React.useState<VisibilityState>({});
  const [globalFilter, setGlobalFilter] = React.useState("");

  const columns = React.useMemo(
    () =>
      buildColumns({
        saving,
        onOpenDetail,
        onRequestStageChange,
      }),
    [saving, onOpenDetail, onRequestStageChange],
  );

  const rowSelection = React.useMemo<RowSelectionState>(() => {
    const next: RowSelectionState = {};
    for (const order of data) {
      const id = orderRowId(order);
      if (selected[id]) next[id] = true;
    }
    return next;
  }, [data, selected]);

  const table = useReactTable({
    data,
    columns,
    getRowId: (row) => orderRowId(row),
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      rowSelection,
      globalFilter,
    },
    enableRowSelection: true,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onGlobalFilterChange: setGlobalFilter,
    onRowSelectionChange: (updater) => {
      const current = rowSelection;
      const pageSelection =
        typeof updater === "function" ? updater(current) : updater;
      onSelectedChange((prev) => {
        const out = { ...prev };
        const visibleIds = new Set(data.map(orderRowId));
        for (const id of visibleIds) {
          if (pageSelection[id]) out[id] = true;
          else delete out[id];
        }
        return out;
      });
    },
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    globalFilterFn: (row, _columnId, filterValue) => {
      const q = String(filterValue ?? "")
        .trim()
        .toLowerCase();
      if (!q) return true;
      const order = row.original;
      return [
        order.orderNumber,
        order.customer,
        order.product,
        order.brandLabel,
        order.color,
        order.size,
        STAGE_LABELS[order.stage],
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
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Filter orders…"
          value={globalFilter}
          onChange={(event) => setGlobalFilter(event.target.value)}
          className="h-8 max-w-sm"
        />
        <DataTableViewOptions table={table} />
      </div>

      <div className="overflow-hidden rounded-md border">
        {loading ? (
          <div className="flex items-center gap-2 px-4 py-10 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading Shopify orders…
          </div>
        ) : (
          <Table className="min-w-[960px]">
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
                  <TableRow
                    key={row.id}
                    data-state={row.getIsSelected() && "selected"}
                  >
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
                    No orders in this stage.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </div>

      {!loading ? <DataTablePagination table={table} /> : null}
    </div>
  );
}
