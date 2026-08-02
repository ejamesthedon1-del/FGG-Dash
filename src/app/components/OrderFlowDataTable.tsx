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
import { ArrowRight, CheckCircle2, Copy, Eye, Loader2, MoreHorizontal } from "lucide-react";
import { toast } from "sonner";

import {
  nextStage,
  STAGE_LABELS,
  formatOrderLabel,
  type OrderFlowOrder,
  type OrderFlowStage,
} from "../lib/order-flow";
import { cn } from "./ui/utils";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { ButtonGroup } from "./ui/button-group";
import { Checkbox } from "./ui/checkbox";
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
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "./ui/hover-card";
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

function orderRowId(order: OrderFlowOrder) {
  return `${order.brand}::${order.id}`;
}

function orderedAgeLabel(order: OrderFlowOrder): string | null {
  if (order.stage === "shipped") return null;
  if (order.orderAgeDays == null) return null;
  return `${order.orderAgeDays}d`;
}

function orderedTitle(order: OrderFlowOrder): string | undefined {
  if (order.stage === "shipped") return undefined;
  if (order.highPriority) {
    return `High priority · ${order.orderAgeDays ?? 7}+ days old`;
  }
  if (order.earlyWarning) {
    const daysLeft = Math.max(0, 7 - (order.orderAgeDays ?? 3));
    return `Early warning · ${daysLeft}d until late`;
  }
  return undefined;
}

function stageBadgeClass(stage: OrderFlowStage) {
  if (stage === "shipped") {
    return "border-transparent bg-emerald-50 text-emerald-800";
  }
  return "border-transparent bg-gray-200/90 text-gray-900";
}

const CHECKBOX_CLASS = "rounded-md";
const CELL_PAD = "px-2 py-3.5";


function orderLines(order: OrderFlowOrder) {
  return order.lineItems?.length > 0
    ? order.lineItems
    : [
        {
          product: order.product,
          variant: order.variant,
          color: order.color,
          size: order.size,
          quantity: order.quantity,
        },
      ];
}

function productSubtitle(order: OrderFlowOrder): string {
  const lines = orderLines(order);
  if (lines.length > 1) return `${lines.length} lines`;
  const line = lines[0];
  return (
    [line?.color, line?.size]
      .filter(Boolean)
      .map((part) => formatOrderLabel(part))
      .join(" · ") || "—"
  );
}

/** Color / size for blanks ordering — surface what to buy, not a date. */
function lineSpecLabel(
  order: OrderFlowOrder,
  field: "color" | "size",
): string {
  const lines = orderLines(order);
  if (lines.length > 1) {
    const values = [
      ...new Set(
        lines
          .map((l) => String(l[field] ?? "").trim())
          .filter(Boolean)
          .map((v) => formatOrderLabel(v)),
      ),
    ];
    if (values.length === 1) return `${values[0]} · ${lines.length} lines`;
    return `${lines.length} lines`;
  }
  return formatOrderLabel(lines[0]?.[field]) || "—";
}

/** Default visible columns per stage — hide noise, keep the job in focus. */
function stageColumnVisibility(stage: OrderFlowStage): VisibilityState {
  switch (stage) {
    case "needs_blanks":
      return {
        brandLabel: true,
        orderNumber: true,
        customer: true,
        product: true,
        color: false,
        size: false,
        quantity: true,
        orderDate: true,
        shipBy: false,
        stage: true,
      };
    case "blanks_ordered":
      return {
        brandLabel: true,
        orderNumber: true,
        customer: false,
        product: true,
        color: false,
        size: false,
        quantity: true,
        orderDate: true,
        shipBy: false,
        stage: false,
      };
    case "in_production":
      return {
        brandLabel: true,
        orderNumber: true,
        customer: true,
        product: true,
        color: false,
        size: false,
        quantity: true,
        orderDate: false,
        shipBy: true,
        stage: false,
      };
    case "ready_to_ship":
      return {
        brandLabel: true,
        orderNumber: true,
        customer: true,
        product: true,
        color: false,
        size: false,
        quantity: true,
        orderDate: false,
        shipBy: true,
        stage: false,
      };
    case "shipped":
      return {
        brandLabel: true,
        orderNumber: true,
        customer: true,
        product: true,
        color: false,
        size: false,
        quantity: true,
        orderDate: true,
        shipBy: false,
        stage: false,
      };
    default:
      return {};
  }
}

function OrderRowActions({
  order,
  saving,
  onOpenDetail,
  onRequestStageChange,
}: {
  order: OrderFlowOrder;
  saving: boolean;
  onOpenDetail: (order: OrderFlowOrder) => void;
  onRequestStageChange: (
    stage: OrderFlowStage,
    orders: OrderFlowOrder[],
  ) => void;
}) {
  const nxt = nextStage(order.stage);

  return (
    <ButtonGroup>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="More options"
          >
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="z-[100] w-40">
          <DropdownMenuGroup>
            <DropdownMenuItem
              onSelect={() => {
                onOpenDetail(order);
              }}
            >
              <Eye />
              View details
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={async () => {
                try {
                  await navigator.clipboard.writeText(order.orderNumber);
                  toast.success("Order number copied");
                } catch {
                  toast.error("Could not copy");
                }
              }}
            >
              <Copy />
              Copy order #
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            {nxt ? (
              <DropdownMenuItem
                disabled={saving}
                onSelect={() => {
                  void onRequestStageChange(nxt, [order]);
                }}
              >
                <ArrowRight />
                Move to {STAGE_LABELS[nxt]}
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem disabled>
                <CheckCircle2 />
                Shipped
              </DropdownMenuItem>
            )}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </ButtonGroup>
  );
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
  opts: { emphasizeOrderSpecs: boolean },
): ColumnDef<OrderFlowOrder>[] {
  const { emphasizeOrderSpecs } = opts;

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
          className={CHECKBOX_CLASS}
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label={`Select ${row.original.orderNumber}`}
          className={CHECKBOX_CLASS}
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
      cell: ({ row }) => {
        const order = row.original;
        const urgent = Boolean(order.highPriority || order.earlyWarning);
        return (
          <button
            type="button"
            title={orderedTitle(order)}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-brand hover:underline"
            onClick={() => actions.onOpenDetail(order)}
          >
            {urgent ? (
              <span
                className="size-1.5 shrink-0 rounded-full bg-amber-500"
                aria-hidden
              />
            ) : null}
            {order.orderNumber}
          </button>
        );
      },
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
      cell: ({ row }) => {
        const order = row.original;
        const lines = orderLines(order);
        const subtitle = productSubtitle(order);
        return (
          <HoverCard openDelay={10} closeDelay={100}>
            <HoverCardTrigger asChild>
              <button
                type="button"
                className="block max-w-[220px] text-left underline-offset-4 hover:underline"
              >
                <span className="block truncate font-medium text-foreground">
                  {formatOrderLabel(order.product)}
                </span>
                {!emphasizeOrderSpecs ? (
                  <span className="block truncate text-xs text-muted-foreground">
                    {subtitle}
                  </span>
                ) : lines.length > 1 ? (
                  <span className="block truncate text-xs text-muted-foreground">
                    {lines.length} lines
                  </span>
                ) : null}
              </button>
            </HoverCardTrigger>
            <HoverCardContent
              align="start"
              side="right"
              className="flex w-64 flex-col gap-2"
            >
              <div>
                <div className="font-semibold">
                  {formatOrderLabel(order.product)}
                </div>
                <div className="text-xs text-muted-foreground">
                  {order.brandLabel}
                </div>
              </div>
              <div className="flex flex-col gap-1.5 border-t border-border pt-2">
                {lines.map((line, i) => (
                  <div key={`${line.product}-${i}`} className="text-sm">
                    <div className="font-medium leading-snug">
                      {formatOrderLabel(line.product || order.product)}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {[line.variant, line.color, line.size]
                        .filter(Boolean)
                        .map((part) => formatOrderLabel(part))
                        .join(" · ") || "—"}
                      {line.quantity != null ? ` · qty ${line.quantity}` : ""}
                    </div>
                  </div>
                ))}
              </div>
            </HoverCardContent>
          </HoverCard>
        );
      },
    },
    {
      id: "color",
      accessorFn: (row) => lineSpecLabel(row, "color"),
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Color" />
      ),
      cell: ({ row }) => (
        <span className="font-medium text-foreground">
          {lineSpecLabel(row.original, "color")}
        </span>
      ),
    },
    {
      id: "size",
      accessorFn: (row) => lineSpecLabel(row, "size"),
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Size" />
      ),
      cell: ({ row }) => (
        <span className="font-medium tabular-nums text-foreground">
          {lineSpecLabel(row.original, "size")}
        </span>
      ),
    },
    {
      accessorKey: "quantity",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Qty" />
      ),
      cell: ({ row }) => (
        <span className="font-medium tabular-nums">{row.original.quantity}</span>
      ),
    },
    {
      accessorKey: "orderDate",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Ordered" />
      ),
      cell: ({ row }) => {
        const order = row.original;
        const age = orderedAgeLabel(order);
        const urgent = Boolean(order.highPriority || order.earlyWarning);
        return (
          <span
            title={orderedTitle(order)}
            className="inline-flex items-center gap-1.5 whitespace-nowrap tabular-nums text-foreground"
          >
            {urgent ? (
              <span
                className="size-1.5 shrink-0 rounded-full bg-amber-500"
                aria-hidden
              />
            ) : null}
            <span>
              {order.orderDate}
              {age ? (
                <span className="text-muted-foreground"> · {age}</span>
              ) : null}
            </span>
          </span>
        );
      },
    },
    {
      id: "shipBy",
      accessorFn: (row) => row.expectedShipDate || "",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Ship by" />
      ),
      cell: ({ row }) => {
        const order = row.original;
        const urgent =
          order.deadlineState === "overdue" ||
          order.deadlineState === "due_today" ||
          Boolean(order.highPriority || order.earlyWarning);
        return (
          <span
            title={orderedTitle(order)}
            className="inline-flex items-center gap-1.5 whitespace-nowrap tabular-nums text-foreground"
          >
            {urgent ? (
              <span
                className="size-1.5 shrink-0 rounded-full bg-amber-500"
                aria-hidden
              />
            ) : null}
            <span>{order.expectedShipDate || "—"}</span>
          </span>
        );
      },
    },
    {
      accessorKey: "stage",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Stage" />
      ),
      cell: ({ row }) => (
        <Badge
          variant="outline"
          className={cn("font-medium", stageBadgeClass(row.original.stage))}
        >
          {STAGE_LABELS[row.original.stage]}
        </Badge>
      ),
      enableSorting: true,
      filterFn: (row, _id, value) => {
        if (!value) return true;
        return row.original.stage === value;
      },
    },
    {
      id: "actions",
      enableHiding: false,
      cell: ({ row }) => (
        <OrderRowActions
          order={row.original}
          saving={actions.saving}
          onOpenDetail={actions.onOpenDetail}
          onRequestStageChange={actions.onRequestStageChange}
        />
      ),
    },
  ];
}

type OrderFlowDataTableProps = {
  data: OrderFlowOrder[];
  stage: OrderFlowStage;
  loading?: boolean;
  selected: Record<string, boolean>;
  onSelectedChange: React.Dispatch<
    React.SetStateAction<Record<string, boolean>>
  >;
  toolbarActions?: React.ReactNode;
} & OrderFlowTableActions;

export function OrderFlowDataTable({
  data,
  stage,
  loading,
  saving,
  selected,
  onSelectedChange,
  onOpenDetail,
  onRequestStageChange,
  toolbarActions,
}: OrderFlowDataTableProps) {
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>(
    [],
  );
  const [columnVisibility, setColumnVisibility] =
    React.useState<VisibilityState>(() => stageColumnVisibility(stage));
  const [globalFilter, setGlobalFilter] = React.useState("");

  React.useEffect(() => {
    setColumnVisibility(stageColumnVisibility(stage));
  }, [stage]);

  const emphasizeOrderSpecs = false;

  const columns = React.useMemo(
    () =>
      buildColumns(
        {
          saving,
          onOpenDetail,
          onRequestStageChange,
        },
        { emphasizeOrderSpecs },
      ),
    [saving, onOpenDetail, onRequestStageChange, emphasizeOrderSpecs],
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
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            placeholder="Filter orders…"
            value={globalFilter}
            onChange={(event) => setGlobalFilter(event.target.value)}
            className="h-7 max-w-sm rounded-md shadow-none"
          />
          <DataTableViewOptions table={table} />
        </div>
        {toolbarActions ? (
          <div className="flex flex-wrap items-center gap-2">
            {toolbarActions}
          </div>
        ) : null}
      </div>

      <div className="overflow-x-auto">
        {loading ? (
          <div className="flex items-center gap-2 px-4 py-10 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading Shopify orders…
          </div>
        ) : (
          <Table
            className={cn(
              emphasizeOrderSpecs ? "min-w-[720px]" : "min-w-[800px]",
            )}
          >
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow
                  key={headerGroup.id}
                  className="border-b border-black/[0.06] hover:bg-transparent"
                >
                  {headerGroup.headers.map((header) => (
                    <TableHead key={header.id} className={CELL_PAD}>
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
                    className="border-b border-black/[0.06]"
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id} className={CELL_PAD}>
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
                    className="h-24 py-3.5 text-center text-muted-foreground"
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
