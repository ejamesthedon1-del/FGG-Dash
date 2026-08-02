"use client";

import * as React from "react";
import {
  ChevronDown,
  ChevronsUpDown,
  Loader2,
  MoreHorizontal,
  Printer,
  Undo2,
} from "lucide-react";
import { toast } from "sonner";

import {
  blankProductKey,
  estimateBlankLineTotal,
  readBlanksCatalog,
  resolveBlankLines,
  resolveBlankUnitCost,
  upsertBlankCatalogEntry,
  type ResolvedBlankLine,
} from "../lib/blanks-catalog-storage";
import {
  pruneBlanksBatchOverrides,
  setOrderMinBatchIndex,
  writeBlanksBatchOverrides,
} from "../lib/blanks-batch-overrides-storage";
import {
  buildBlankOrderBatches,
  orderBatchKey,
  type BlankOrderBatch,
} from "../lib/blanks-order-batches";
import {
  buildBlankLines,
  buildBlanksPrintHtml,
} from "../lib/blanks-print-slip";
import { formatOrderLabel, type OrderFlowOrder } from "../lib/order-flow";
import { cn } from "./ui/utils";
import { Button } from "./ui/button";
import { Checkbox } from "./ui/checkbox";
import { Input } from "./ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./ui/table";

type Props = {
  orders: OrderFlowOrder[];
  loading?: boolean;
  saving?: boolean;
  onMarkOrdered: (orders: OrderFlowOrder[]) => void;
  onPrintPreview: (html: string) => void;
};

type BatchLine = {
  id: string;
  color: string;
  size: string;
  quantity: number;
  blankName: string;
  supplier: string;
  estimateTotal: number | null;
  line: ResolvedBlankLine;
  /** Full Shopify orders for this blank line (for print / mark ordered). */
  sourceOrders: OrderFlowOrder[];
};

type BlankGroup = {
  key: string;
  blankName: string;
  lines: BatchLine[];
  quantity: number;
  supplier: string;
};

type BatchSection = {
  batch: BlankOrderBatch;
  lines: BatchLine[];
  groups: BlankGroup[];
  quantity: number;
  estimateTotal: number | null;
};

function lineId(batchId: string, line: ResolvedBlankLine): string {
  return [
    batchId,
    line.blankName,
    line.color,
    line.size,
    line.supplier,
    line.productIds[0] || line.product,
  ]
    .join("::")
    .toLowerCase();
}

function resolveSourceOrders(
  refs: ResolvedBlankLine["orders"],
  pool: OrderFlowOrder[],
): OrderFlowOrder[] {
  const byKey = new Map(
    pool.map((order) => [`${order.brand}::${order.id}`, order] as const),
  );
  const byNumber = new Map(
    pool.map((order) => [String(order.orderNumber), order] as const),
  );
  const out: OrderFlowOrder[] = [];
  const seen = new Set<string>();
  for (const ref of refs) {
    const order =
      byKey.get(`${ref.brand}::${ref.id}`) ??
      byNumber.get(String(ref.orderNumber));
    if (!order) continue;
    const key = `${order.brand}::${order.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(order);
  }
  return out;
}

function uniqueOrdersFromLines(lines: BatchLine[]): OrderFlowOrder[] {
  const out: OrderFlowOrder[] = [];
  const seen = new Set<string>();
  for (const row of lines) {
    for (const order of row.sourceOrders) {
      const key = `${order.brand}::${order.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(order);
    }
  }
  return out;
}

function groupLinesByBlank(lines: BatchLine[]): BlankGroup[] {
  const order: string[] = [];
  const map = new Map<string, BatchLine[]>();
  for (const line of lines) {
    const key = line.blankName.trim().toLowerCase() || "blank";
    if (!map.has(key)) {
      map.set(key, []);
      order.push(key);
    }
    map.get(key)!.push(line);
  }
  return order.map((key) => {
    const groupLines = map.get(key)!;
    const suppliers = new Set(
      groupLines.map((l) => l.supplier).filter((s) => s && s !== "—"),
    );
    return {
      key,
      blankName: groupLines[0]?.blankName || "Blank",
      lines: groupLines,
      quantity: groupLines.reduce((sum, l) => sum + l.quantity, 0),
      supplier: suppliers.size === 1 ? [...suppliers][0]! : "—",
    };
  });
}

function buildSections(batches: BlankOrderBatch[]): BatchSection[] {
  const catalog = readBlanksCatalog();
  return batches.map((batch) => {
    const resolved = resolveBlankLines(buildBlankLines(batch.orders), catalog);
    const lines: BatchLine[] = resolved.map((line) => ({
      id: lineId(batch.id, line),
      color: line.color,
      size: line.size,
      quantity: line.quantity,
      blankName: line.blankName,
      supplier: line.supplier,
      estimateTotal: estimateBlankLineTotal(line),
      line,
      sourceOrders: resolveSourceOrders(line.orders, batch.orders),
    }));
    const quantity = lines.reduce((sum, l) => sum + l.quantity, 0);
    const estimates = lines.map((l) => l.estimateTotal);
    const estimateTotal = estimates.every((v) => v != null)
      ? estimates.reduce((sum, v) => sum + (v as number), 0)
      : estimates.some((v) => v != null)
        ? estimates.reduce((sum, v) => sum + (v ?? 0), 0)
        : null;
    return {
      batch,
      lines,
      groups: groupLinesByBlank(lines),
      quantity,
      estimateTotal:
        estimateTotal != null
          ? Math.round(estimateTotal * 100) / 100
          : null,
    };
  });
}

function matchesFilters(
  line: BatchLine,
  itemFilter: string,
  qtyFilter: string,
): boolean {
  const item = itemFilter.trim().toLowerCase();
  if (item) {
    const hay =
      `${line.blankName} ${line.color} ${line.size} ${line.supplier}`.toLowerCase();
    if (!hay.includes(item)) return false;
  }
  if (qtyFilter === "1") return line.quantity === 1;
  if (qtyFilter === "2-4") return line.quantity >= 2 && line.quantity <= 4;
  if (qtyFilter === "5+") return line.quantity >= 5;
  return true;
}

export function NeedsBlanksBoard({
  orders,
  loading,
  saving,
  onMarkOrdered,
  onPrintPreview,
}: Props) {
  const [catalogTick, setCatalogTick] = React.useState(0);
  const [overrideTick, setOverrideTick] = React.useState(0);
  const [itemFilter, setItemFilter] = React.useState("");
  const [qtyFilter, setQtyFilter] = React.useState("all");
  const [selected, setSelected] = React.useState<Record<string, boolean>>({});
  const [openBatches, setOpenBatches] = React.useState<Record<string, boolean>>(
    {},
  );
  const [linkTarget, setLinkTarget] = React.useState<ResolvedBlankLine | null>(
    null,
  );
  const [blankName, setBlankName] = React.useState("");
  const [supplier, setSupplier] = React.useState("");
  const [orderUrl, setOrderUrl] = React.useState("");
  const [unitCost, setUnitCost] = React.useState("");

  const batchOverrides = React.useMemo(() => {
    void overrideTick;
    return pruneBlanksBatchOverrides(orders);
  }, [orders, overrideTick]);

  const hasBatchMoves = Object.keys(batchOverrides.minBatchIndex).length > 0;

  const batches = React.useMemo(
    () =>
      buildBlankOrderBatches(orders, {
        minBatchIndex: batchOverrides.minBatchIndex,
      }),
    [orders, batchOverrides],
  );

  const moveLineToBatch = (
    batch: BlankOrderBatch,
    line: BatchLine,
    targetIndex: number,
  ) => {
    if (!Number.isFinite(targetIndex) || targetIndex < 1) return;
    if (targetIndex === batch.index) return;

    const refs = line.line.orders;
    if (refs.length === 0) return;

    const label =
      `${formatOrderLabel(line.color)} ${formatOrderLabel(line.size)}`.trim();

    if (targetIndex > batch.index) {
      const movingKeys = new Set(
        refs.map((ref) => orderBatchKey({ brand: ref.brand, id: ref.id })),
      );
      const remainingOrders = batch.orders.filter(
        (order) => !movingKeys.has(orderBatchKey(order)),
      );
      if (remainingOrders.length === 0) {
        toast.message("Keep at least one order in this batch");
        return;
      }
    }

    for (const ref of refs) {
      setOrderMinBatchIndex(
        { brand: ref.brand, id: ref.id },
        targetIndex,
      );
    }
    setOverrideTick((n) => n + 1);
    setSelected({});
    toast.success(`Moved ${label} to batch ${targetIndex}`);
  };

  const resetBatchMoves = () => {
    writeBlanksBatchOverrides({ version: 1, minBatchIndex: {} });
    setOverrideTick((n) => n + 1);
    setSelected({});
    toast.success("Batch moves cleared");
  };

  const sections = React.useMemo(() => {
    void catalogTick;
    return buildSections(batches)
      .map((section) => {
        const lines = section.lines.filter((line) =>
          matchesFilters(line, itemFilter, qtyFilter),
        );
        const quantity = lines.reduce((sum, l) => sum + l.quantity, 0);
        const estimates = lines.map((l) => l.estimateTotal);
        const estimateTotal = estimates.every((v) => v != null)
          ? estimates.reduce((sum, v) => sum + (v as number), 0)
          : estimates.some((v) => v != null)
            ? estimates.reduce((sum, v) => sum + (v ?? 0), 0)
            : null;
        return {
          ...section,
          lines,
          groups: groupLinesByBlank(lines),
          quantity,
          estimateTotal:
            estimateTotal != null
              ? Math.round(estimateTotal * 100) / 100
              : null,
        };
      })
      .filter((section) => section.lines.length > 0);
  }, [batches, catalogTick, itemFilter, qtyFilter]);

  const allVisibleLines = sections.flatMap((s) => s.lines);

  const showColorSize = sections.some((s) => Boolean(openBatches[s.batch.id]));
  const selectedLines = allVisibleLines.filter((line) => selected[line.id]);

  const selectedOrders = React.useMemo(
    () => uniqueOrdersFromLines(selectedLines),
    [selectedLines],
  );

  const hasSelection = selectedOrders.length > 0;

  const totalQty = allVisibleLines.reduce((sum, line) => sum + line.quantity, 0);

  const selectionStateForIds = (ids: string[]) => {
    const count = ids.filter((id) => selected[id]).length;
    if (count === 0) return false as const;
    if (count === ids.length) return true as const;
    return "indeterminate" as const;
  };

  const batchSelectionState = (section: BatchSection) =>
    selectionStateForIds(section.lines.map((l) => l.id));

  const toggleLineIds = (ids: string[], checked: boolean) => {
    setSelected((prev) => {
      const next = { ...prev };
      for (const id of ids) {
        if (checked) next[id] = true;
        else delete next[id];
      }
      return next;
    });
  };

  const toggleBatch = (section: BatchSection, checked: boolean) => {
    toggleLineIds(
      section.lines.map((l) => l.id),
      checked,
    );
  };

  const toggleBlankGroup = (group: BlankGroup, checked: boolean) => {
    toggleLineIds(
      group.lines.map((l) => l.id),
      checked,
    );
  };

  const toggleAll = (checked: boolean) => {
    if (!checked) {
      setSelected({});
      return;
    }
    const next: Record<string, boolean> = {};
    for (const line of allVisibleLines) next[line.id] = true;
    setSelected(next);
  };

  const openLinkDialog = (line: ResolvedBlankLine) => {
    setLinkTarget(line);
    setBlankName(line.linked ? line.blankName : "");
    setSupplier(line.supplier === "—" ? "" : line.supplier);
    setOrderUrl(line.orderUrl || "");
    const resolvedCost = resolveBlankUnitCost(line);
    setUnitCost(resolvedCost != null ? String(resolvedCost) : "");
  };

  const saveLink = () => {
    if (!linkTarget) return;
    const name = blankName.trim();
    if (!name) {
      toast.error("Enter the wholesale blank name");
      return;
    }
    const parsedCost = Number(unitCost);
    const keys = linkTarget.productIds.length
      ? linkTarget.productIds
      : [blankProductKey(undefined, linkTarget.product)];
    for (const productKey of keys) {
      upsertBlankCatalogEntry({
        productKey,
        shopifyProductName: linkTarget.product,
        blankName: name,
        supplier: supplier.trim(),
        orderUrl: orderUrl.trim() || undefined,
        unitCost:
          unitCost.trim() && Number.isFinite(parsedCost) && parsedCost > 0
            ? parsedCost
            : undefined,
      });
    }
    setCatalogTick((n) => n + 1);
    setLinkTarget(null);
    toast.success("Blank linked");
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Filter item…"
          value={itemFilter}
          onChange={(e) => setItemFilter(e.target.value)}
          className="h-7 max-w-[200px] rounded-md shadow-none"
        />
        <Select value={qtyFilter} onValueChange={setQtyFilter}>
          <SelectTrigger
            size="sm"
            className="h-7 w-[120px] rounded-md border-gray-200 shadow-none"
            aria-label="Filter by qty"
          >
            <SelectValue placeholder="Qty" />
          </SelectTrigger>
          <SelectContent align="start">
            <SelectItem value="all">All qty</SelectItem>
            <SelectItem value="1">Qty 1</SelectItem>
            <SelectItem value="2-4">Qty 2–4</SelectItem>
            <SelectItem value="5+">Qty 5+</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          className="gap-2 border-gray-200 text-gray-700 hover:bg-gray-50 disabled:border-gray-100 disabled:bg-gray-50 disabled:text-gray-400 disabled:opacity-100"
          disabled={!hasSelection}
          onClick={() => {
            try {
              onPrintPreview(buildBlanksPrintHtml(selectedOrders));
            } catch (err) {
              toast.error(
                err instanceof Error ? err.message : "Could not open blanks slip",
              );
            }
          }}
        >
          <Printer className="h-4 w-4" />
          Print
        </Button>
        <Button
          type="button"
          disabled={saving || !hasSelection}
          className="bg-brand text-white hover:bg-brand-hover disabled:bg-gray-200 disabled:text-gray-400 disabled:opacity-100"
          onClick={() => onMarkOrdered(selectedOrders)}
        >
          Mark ordered
          {hasSelection ? ` (${selectedOrders.length})` : ""}
        </Button>
        {hasBatchMoves ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5 border-gray-200"
            onClick={resetBatchMoves}
          >
            <Undo2 className="h-3.5 w-3.5" />
            Reset batch moves
          </Button>
        ) : null}
        <p className="text-sm text-muted-foreground sm:ml-1">
          {hasSelection
            ? `${selectedLines.length} line(s) · ${selectedOrders.length} order(s)`
            : "Select lines, or use Print on a batch row"}
        </p>
      </div>

      <div className="space-y-2">
        {loading ? (
          <div className="flex items-center gap-2 px-4 py-10 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading blanks needed…
          </div>
        ) : sections.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-muted-foreground">
            No blanks match these filters.
          </div>
        ) : (
          <Table className="min-w-[520px]">
            <TableHeader>
              <TableRow className="border-b border-black/[0.06] hover:bg-transparent">
                <TableHead className="w-10 px-2 py-3">
                  <Checkbox
                    checked={
                      allVisibleLines.length > 0 &&
                      selectedLines.length === allVisibleLines.length
                        ? true
                        : selectedLines.length > 0
                          ? "indeterminate"
                          : false
                    }
                    onCheckedChange={(v) => toggleAll(Boolean(v))}
                    aria-label="Select all"
                    className="rounded-md"
                  />
                </TableHead>
                <TableHead className="px-2 py-3">
                  <button
                    type="button"
                    className="-ml-1 inline-flex h-8 items-center gap-1.5 rounded-md px-1 text-muted-foreground hover:text-foreground"
                  >
                    <span className="text-xs font-medium text-foreground/70">
                      Batch
                    </span>
                    <ChevronsUpDown className="size-3 stroke-[1.5] text-muted-foreground/50" />
                  </button>
                </TableHead>
                {showColorSize ? (
                  <TableHead className="px-2 py-3">
                    <button
                      type="button"
                      className="-ml-1 inline-flex h-8 items-center gap-1.5 rounded-md px-1 text-muted-foreground hover:text-foreground"
                    >
                      <span className="text-xs font-medium text-foreground/70">
                        Color
                      </span>
                      <ChevronsUpDown className="size-3 stroke-[1.5] text-muted-foreground/50" />
                    </button>
                  </TableHead>
                ) : null}
                <TableHead className="px-2 py-3 text-center">
                  <button
                    type="button"
                    className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md px-1 text-muted-foreground hover:text-foreground"
                  >
                    <span className="text-xs font-medium text-foreground/70">
                      Qty needed
                    </span>
                    <ChevronsUpDown className="size-3 stroke-[1.5] text-muted-foreground/50" />
                  </button>
                </TableHead>
                {showColorSize ? (
                  <TableHead className="px-2 py-3">
                    <button
                      type="button"
                      className="-ml-1 inline-flex h-8 items-center gap-1.5 rounded-md px-1 text-muted-foreground hover:text-foreground"
                    >
                      <span className="text-xs font-medium text-foreground/70">
                        Supplier
                      </span>
                      <ChevronsUpDown className="size-3 stroke-[1.5] text-muted-foreground/50" />
                    </button>
                  </TableHead>
                ) : null}
                <TableHead className="px-2 py-3 text-right text-xs font-medium text-muted-foreground">
                  {totalQty} total
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sections.map((section, sectionIndex) => {
                const { batch } = section;
                const open = Boolean(openBatches[batch.id]);
                const checked = batchSelectionState(section);
                const lastGroup =
                  section.groups[section.groups.length - 1] ?? null;
                const lastLineId =
                  lastGroup?.lines[lastGroup.lines.length - 1]?.id ?? null;
                const batchEndBorder =
                  "border-b-2 border-b-gray-300";
                const colCount = showColorSize ? 6 : 4;

                return (
                  <React.Fragment key={batch.id}>
                    {sectionIndex > 0 ? (
                      <TableRow className="hover:bg-transparent">
                        <TableCell
                          colSpan={colCount}
                          className="h-2.5 border-0 bg-gray-100 p-0"
                        />
                      </TableRow>
                    ) : null}
                    <TableRow
                      className={cn(
                        "border-b border-gray-200 bg-gray-50/70",
                        sectionIndex > 0 && "border-t-2 border-t-gray-300",
                        !open && batchEndBorder,
                      )}
                    >
                      <TableCell className="px-2 py-3.5">
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(v) =>
                            toggleBatch(section, Boolean(v))
                          }
                          aria-label={`Select batch ${batch.index}`}
                          className="rounded-md"
                        />
                      </TableCell>
                      <TableCell className="px-2 py-3.5">
                        <button
                          type="button"
                          className="inline-flex items-center gap-1.5 text-left"
                          aria-expanded={open}
                          onClick={() =>
                            setOpenBatches((prev) => ({
                              ...prev,
                              [batch.id]: !open,
                            }))
                          }
                        >
                          <ChevronDown
                            className={cn(
                              "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                              open ? "rotate-0" : "-rotate-90",
                            )}
                          />
                          <span className="font-medium text-foreground">
                            Batch {batch.index}
                          </span>
                        </button>
                      </TableCell>
                      {showColorSize ? (
                        <TableCell className="px-2 py-3.5" />
                      ) : null}
                      <TableCell className="px-2 py-3.5 text-center font-semibold tabular-nums text-foreground">
                        {section.quantity}
                      </TableCell>
                      {showColorSize ? (
                        <TableCell className="px-2 py-3.5" />
                      ) : null}
                      <TableCell className="px-2 py-3.5 text-right">
                        <div className="inline-flex gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="border-gray-200"
                            onClick={() => {
                              try {
                                const fromLines = uniqueOrdersFromLines(
                                  section.lines,
                                );
                                onPrintPreview(
                                  buildBlanksPrintHtml(
                                    fromLines.length > 0
                                      ? fromLines
                                      : batch.orders,
                                  ),
                                );
                              } catch (err) {
                                toast.error(
                                  err instanceof Error
                                    ? err.message
                                    : "Could not open blanks slip",
                                );
                              }
                            }}
                          >
                            Print
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            className="bg-brand text-white hover:bg-brand-hover"
                            disabled={saving}
                            onClick={() => {
                              const fromLines = uniqueOrdersFromLines(
                                section.lines,
                              );
                              onMarkOrdered(
                                fromLines.length > 0
                                  ? fromLines
                                  : batch.orders,
                              );
                            }}
                          >
                            Mark ordered
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>

                    {open
                      ? section.groups.map((group) => {
                          const groupChecked = selectionStateForIds(
                            group.lines.map((l) => l.id),
                          );
                          return (
                            <React.Fragment key={`${batch.id}::${group.key}`}>
                              <TableRow className="border-b border-black/[0.06] bg-black/[0.015]">
                                <TableCell className="px-2 py-2.5">
                                  <Checkbox
                                    checked={groupChecked}
                                    onCheckedChange={(v) =>
                                      toggleBlankGroup(group, Boolean(v))
                                    }
                                    aria-label={`Select ${group.blankName}`}
                                    className="rounded-md"
                                  />
                                </TableCell>
                                <TableCell className="px-2 py-2.5" colSpan={2}>
                                  <span className="pl-5 text-sm font-medium text-foreground">
                                    {formatOrderLabel(group.blankName)}
                                  </span>
                                </TableCell>
                                <TableCell className="px-2 py-2.5 text-center font-semibold tabular-nums text-foreground">
                                  {group.quantity}
                                </TableCell>
                                <TableCell className="px-2 py-2.5 text-sm text-muted-foreground">
                                  {group.supplier}
                                </TableCell>
                                <TableCell className="px-2 py-2.5" />
                              </TableRow>
                              {group.lines.map((row) => {
                                const rowChecked = Boolean(selected[row.id]);
                                const isBatchEnd = row.id === lastLineId;
                                const movingKeys = new Set(
                                  row.line.orders.map((ref) =>
                                    orderBatchKey({
                                      brand: ref.brand,
                                      id: ref.id,
                                    }),
                                  ),
                                );
                                const canMoveDown =
                                  batch.orders.length > 1 &&
                                  batch.orders.some(
                                    (order) =>
                                      !movingKeys.has(orderBatchKey(order)),
                                  );
                                const batchOptions = Array.from(
                                  {
                                    length:
                                      Math.max(batches.length, batch.index) +
                                      (canMoveDown ? 1 : 0),
                                  },
                                  (_, i) => i + 1,
                                );
                                return (
                                  <TableRow
                                    key={row.id}
                                    data-state={rowChecked && "selected"}
                                    className={cn(
                                      "border-b border-black/[0.06]",
                                      isBatchEnd && batchEndBorder,
                                    )}
                                  >
                                    <TableCell className="px-2 py-3">
                                      <Checkbox
                                        checked={rowChecked}
                                        onCheckedChange={(v) =>
                                          setSelected((prev) => {
                                            const next = { ...prev };
                                            if (v) next[row.id] = true;
                                            else delete next[row.id];
                                            return next;
                                          })
                                        }
                                        aria-label={`Select ${row.color} ${row.size}`}
                                        className="rounded-md"
                                      />
                                    </TableCell>
                                    <TableCell className="px-2 py-3">
                                      <span className="pl-5 text-sm font-normal tabular-nums text-muted-foreground">
                                        {formatOrderLabel(row.size)}
                                      </span>
                                    </TableCell>
                                    <TableCell className="px-2 py-3 text-sm font-normal">
                                      {formatOrderLabel(row.color)}
                                    </TableCell>
                                    <TableCell className="px-2 py-3 text-center font-semibold tabular-nums text-foreground">
                                      {row.quantity}
                                    </TableCell>
                                    <TableCell className="px-2 py-3">
                                      <button
                                        type="button"
                                        onClick={() =>
                                          openLinkDialog(row.line)
                                        }
                                        className={cn(
                                          "text-left text-sm hover:underline",
                                          row.supplier === "—"
                                            ? "text-muted-foreground"
                                            : "text-foreground",
                                        )}
                                      >
                                        {row.supplier}
                                      </button>
                                    </TableCell>
                                    <TableCell className="px-2 py-3 text-right">
                                      <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                          <Button
                                            type="button"
                                            size="icon-sm"
                                            variant="outline"
                                            className="border-gray-200"
                                            disabled={batchOptions.length <= 1}
                                            aria-label="Move to batch"
                                            title="Move this line to another batch"
                                          >
                                            <MoreHorizontal className="size-3.5" />
                                          </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                                            Move to batch
                                          </DropdownMenuLabel>
                                          {batchOptions.map((index) => (
                                            <DropdownMenuItem
                                              key={index}
                                              disabled={
                                                index === batch.index ||
                                                (index > batch.index &&
                                                  !canMoveDown)
                                              }
                                              onClick={() =>
                                                moveLineToBatch(
                                                  batch,
                                                  row,
                                                  index,
                                                )
                                              }
                                            >
                                              Batch {index}
                                            </DropdownMenuItem>
                                          ))}
                                        </DropdownMenuContent>
                                      </DropdownMenu>
                                    </TableCell>
                                  </TableRow>
                                );
                              })}
                            </React.Fragment>
                          );
                        })
                      : null}
                  </React.Fragment>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>

      <Dialog
        open={Boolean(linkTarget)}
        onOpenChange={(open) => {
          if (!open) setLinkTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Link blank</DialogTitle>
            <DialogDescription>
              Map{" "}
              <span className="font-medium text-foreground">
                {linkTarget ? formatOrderLabel(linkTarget.product) : ""}
              </span>{" "}
              to the wholesale blank you order.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <label className="block space-y-1.5">
              <span className="text-sm text-muted-foreground">Blank name</span>
              <Input
                value={blankName}
                onChange={(e) => setBlankName(e.target.value)}
                placeholder="Port & Co. Fan Favorite Hoodie"
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm text-muted-foreground">Supplier</span>
              <Input
                value={supplier}
                onChange={(e) => setSupplier(e.target.value)}
                placeholder="All Day Shirts"
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm text-muted-foreground">Order link</span>
              <Input
                value={orderUrl}
                onChange={(e) => setOrderUrl(e.target.value)}
                placeholder="https://…"
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm text-muted-foreground">
                Est. unit cost (USD)
              </span>
              <Input
                value={unitCost}
                onChange={(e) => setUnitCost(e.target.value)}
                placeholder="12.50"
                inputMode="decimal"
              />
            </label>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="tertiary"
              onClick={() => setLinkTarget(null)}
            >
              Cancel
            </Button>
            <Button type="button" onClick={saveLink}>
              Save link
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
