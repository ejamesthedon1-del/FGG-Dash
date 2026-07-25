import type { OrderFlowLineItem, OrderFlowOrder } from "./order-flow";

const SIZE_RANK: Record<string, number> = {
  xs: 1,
  xsmall: 1,
  "x-small": 1,
  s: 2,
  small: 2,
  m: 3,
  medium: 3,
  l: 4,
  large: 4,
  xl: 5,
  "x-large": 5,
  xxl: 6,
  "2xl": 6,
  "2x": 6,
  xxxl: 7,
  "3xl": 7,
  "3x": 7,
  "4xl": 8,
  "5xl": 9,
};

export type BlankLine = {
  brand: string;
  brandLabel: string;
  product: string;
  color: string;
  size: string;
  quantity: number;
  orderNumbers: string[];
};

function sizeSortKey(size: string): [number, string] {
  const key = size.trim().toLowerCase();
  return [SIZE_RANK[key] ?? 100, key];
}

function lineItemsForOrder(order: OrderFlowOrder): OrderFlowLineItem[] {
  if (order.lineItems?.length) return order.lineItems;
  return [
    {
      product: order.product,
      variant: order.variant,
      color: order.color,
      size: order.size,
      quantity: order.quantity,
    },
  ];
}

/** Aggregate selected orders into blank lines grouped for ordering. */
export function buildBlankLines(orders: OrderFlowOrder[]): BlankLine[] {
  const map = new Map<string, BlankLine>();

  for (const order of orders) {
    for (const item of lineItemsForOrder(order)) {
      const product = (item.product || "Unknown").trim();
      const color = (item.color || "—").trim() || "—";
      const size = (item.size || "—").trim() || "—";
      const qty = Number(item.quantity) || 0;
      if (qty <= 0) continue;

      const key = [order.brand, product.toLowerCase(), color.toLowerCase(), size.toLowerCase()].join(
        "::",
      );
      const existing = map.get(key);
      if (existing) {
        existing.quantity += qty;
        if (!existing.orderNumbers.includes(order.orderNumber)) {
          existing.orderNumbers.push(order.orderNumber);
        }
      } else {
        map.set(key, {
          brand: order.brand,
          brandLabel: order.brandLabel,
          product,
          color,
          size,
          quantity: qty,
          orderNumbers: [order.orderNumber],
        });
      }
    }
  }

  return [...map.values()].sort((a, b) => {
    const brand = a.brandLabel.localeCompare(b.brandLabel);
    if (brand) return brand;
    const product = a.product.localeCompare(b.product);
    if (product) return product;
    const color = a.color.localeCompare(b.color);
    if (color) return color;
    const [ar, as] = sizeSortKey(a.size);
    const [br, bs] = sizeSortKey(b.size);
    return ar - br || as.localeCompare(bs);
  });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

type ColorBlock = {
  color: string;
  lines: BlankLine[];
  totalQty: number;
};

type ProductBlock = {
  product: string;
  colors: ColorBlock[];
  totalQty: number;
};

type BrandBlock = {
  brandLabel: string;
  products: ProductBlock[];
  totalQty: number;
};

function groupForPrint(lines: BlankLine[]): BrandBlock[] {
  const brands = new Map<string, Map<string, Map<string, BlankLine[]>>>();

  for (const line of lines) {
    if (!brands.has(line.brandLabel)) brands.set(line.brandLabel, new Map());
    const products = brands.get(line.brandLabel)!;
    if (!products.has(line.product)) products.set(line.product, new Map());
    const colors = products.get(line.product)!;
    if (!colors.has(line.color)) colors.set(line.color, []);
    colors.get(line.color)!.push(line);
  }

  return [...brands.entries()].map(([brandLabel, products]) => {
    const productBlocks: ProductBlock[] = [...products.entries()].map(([product, colors]) => {
      const colorBlocks: ColorBlock[] = [...colors.entries()].map(([color, lines]) => ({
        color,
        lines,
        totalQty: lines.reduce((sum, l) => sum + l.quantity, 0),
      }));
      return {
        product,
        colors: colorBlocks,
        totalQty: colorBlocks.reduce((sum, c) => sum + c.totalQty, 0),
      };
    });
    return {
      brandLabel,
      products: productBlocks,
      totalQty: productBlocks.reduce((sum, p) => sum + p.totalQty, 0),
    };
  });
}

function buildQuickMatrix(lines: BlankLine[]): string {
  // One matrix per product when there are multiple colors/sizes — easiest for blank sites.
  const byProduct = new Map<string, BlankLine[]>();
  for (const line of lines) {
    const key = `${line.brandLabel} · ${line.product}`;
    const list = byProduct.get(key) ?? [];
    list.push(line);
    byProduct.set(key, list);
  }

  const sections: string[] = [];
  for (const [productKey, productLines] of byProduct) {
    const colors = [...new Set(productLines.map((l) => l.color))].sort((a, b) =>
      a.localeCompare(b),
    );
    const sizes = [
      ...new Set(productLines.map((l) => l.size)),
    ].sort((a, b) => {
      const [ar, as] = sizeSortKey(a);
      const [br, bs] = sizeSortKey(b);
      return ar - br || as.localeCompare(bs);
    });

    if (colors.length === 0 || sizes.length === 0) continue;

    const qtyMap = new Map<string, number>();
    for (const line of productLines) {
      qtyMap.set(`${line.color}::${line.size}`, line.quantity);
    }

    const head = sizes
      .map((s) => `<th>${escapeHtml(s)}</th>`)
      .join("");
    const body = colors
      .map((color) => {
        const cells = sizes
          .map((size) => {
            const qty = qtyMap.get(`${color}::${size}`) ?? 0;
            return `<td class="${qty ? "qty" : "empty"}">${qty || "—"}</td>`;
          })
          .join("");
        const rowTotal = sizes.reduce(
          (sum, size) => sum + (qtyMap.get(`${color}::${size}`) ?? 0),
          0,
        );
        return `<tr><th class="color-cell">${escapeHtml(color)}</th>${cells}<td class="qty total">${rowTotal}</td></tr>`;
      })
      .join("");

    sections.push(`
      <div class="matrix-block">
        <h3>${escapeHtml(productKey)}</h3>
        <table class="matrix">
          <thead>
            <tr><th>Color \\ Size</th>${head}<th>Total</th></tr>
          </thead>
          <tbody>${body}</tbody>
        </table>
      </div>
    `);
  }

  return sections.join("");
}

export function buildBlanksPrintHtml(
  orders: OrderFlowOrder[],
  options?: { showWindowActions?: boolean },
): string {
  if (orders.length === 0) {
    throw new Error("Select at least one order first.");
  }

  const lines = buildBlankLines(orders);
  if (lines.length === 0) {
    throw new Error("No blank line items found on the selected orders.");
  }

  const showWindowActions = options?.showWindowActions ?? false;
  const grouped = groupForPrint(lines);
  const printedAt = new Date().toLocaleString();
  const orderList = [...new Set(orders.map((o) => o.orderNumber))].join(", ");
  const totalUnits = lines.reduce((sum, l) => sum + l.quantity, 0);

  const detailHtml = grouped
    .map((brand) => {
      const products = brand.products
        .map((product) => {
          const colors = product.colors
            .map((colorBlock) => {
              const rows = colorBlock.lines
                .map(
                  (line) => `
                  <tr>
                    <td class="size">${escapeHtml(line.size)}</td>
                    <td class="qty">${line.quantity}</td>
                    <td class="orders">${escapeHtml(line.orderNumbers.join(", "))}</td>
                  </tr>`,
                )
                .join("");
              return `
                <div class="color-card">
                  <div class="color-head">
                    <span class="swatch" aria-hidden="true"></span>
                    <div>
                      <p class="color-name">${escapeHtml(colorBlock.color)}</p>
                      <p class="color-meta">${colorBlock.totalQty} blank${colorBlock.totalQty === 1 ? "" : "s"}</p>
                    </div>
                  </div>
                  <table>
                    <thead>
                      <tr>
                        <th>Size</th>
                        <th>Qty</th>
                        <th>Shopify orders</th>
                      </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                  </table>
                </div>`;
            })
            .join("");

          return `
            <section class="product-block">
              <div class="product-head">
                <h2>${escapeHtml(product.product)}</h2>
                <span>${product.totalQty} total</span>
              </div>
              <div class="color-grid">${colors}</div>
            </section>`;
        })
        .join("");

      return `
        <section class="brand-block">
          <div class="brand-head">
            <h1>${escapeHtml(brand.brandLabel)}</h1>
            <span>${brand.totalQty} blanks</span>
          </div>
          ${products}
        </section>`;
    })
    .join("");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>FGG Blanks Order Slip</title>
  <style>
    @page { margin: 0.6in; size: letter; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "IBM Plex Sans", "Segoe UI", Helvetica, Arial, sans-serif;
      color: #111827;
      background: #fff;
      line-height: 1.35;
    }
    .sheet { max-width: 8.5in; margin: 0 auto; padding: 24px; }
    .masthead {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      border-bottom: 3px solid #111827;
      padding-bottom: 14px;
      margin-bottom: 18px;
    }
    .masthead h1 {
      margin: 0;
      font-size: 22px;
      letter-spacing: 0.02em;
    }
    .masthead p { margin: 4px 0 0; color: #4b5563; font-size: 12px; }
    .meta {
      text-align: right;
      font-size: 12px;
      color: #374151;
    }
    .meta strong { display: block; font-size: 18px; color: #111827; }
    .callout {
      background: #f3f4f6;
      border: 1px solid #e5e7eb;
      border-radius: 10px;
      padding: 12px 14px;
      margin-bottom: 18px;
      font-size: 12px;
    }
    .callout strong { color: #111827; }
    .brand-block { margin-bottom: 28px; page-break-inside: avoid; }
    .brand-head, .product-head {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      gap: 12px;
    }
    .brand-head {
      border-bottom: 2px solid #d1d5db;
      padding-bottom: 8px;
      margin-bottom: 12px;
    }
    .brand-head h1 { margin: 0; font-size: 18px; }
    .product-block { margin: 0 0 18px; }
    .product-head h2 { margin: 0; font-size: 15px; }
    .product-head span, .brand-head span {
      font-size: 12px;
      font-weight: 600;
      color: #1d4ed8;
    }
    .color-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 10px;
      margin-top: 10px;
    }
    .color-card {
      border: 1px solid #d1d5db;
      border-radius: 10px;
      overflow: hidden;
      page-break-inside: avoid;
    }
    .color-head {
      display: flex;
      gap: 10px;
      align-items: center;
      padding: 10px 12px;
      background: #111827;
      color: #fff;
    }
    .swatch {
      width: 14px;
      height: 14px;
      border-radius: 999px;
      background: #93c5fd;
      border: 2px solid rgba(255,255,255,0.7);
      flex-shrink: 0;
    }
    .color-name { margin: 0; font-size: 14px; font-weight: 700; }
    .color-meta { margin: 2px 0 0; font-size: 11px; opacity: 0.85; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th, td { padding: 7px 10px; text-align: left; border-top: 1px solid #e5e7eb; }
    th { font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; color: #6b7280; }
    td.qty, td.total, .matrix .qty {
      font-variant-numeric: tabular-nums;
      font-weight: 700;
      text-align: right;
    }
    td.size { font-weight: 600; }
    td.orders { color: #6b7280; font-size: 11px; }
    .matrix-wrap { margin-top: 22px; }
    .matrix-wrap > h2 {
      margin: 0 0 10px;
      font-size: 14px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: #374151;
    }
    .matrix-block { margin-bottom: 16px; page-break-inside: avoid; }
    .matrix-block h3 { margin: 0 0 6px; font-size: 13px; }
    table.matrix th, table.matrix td {
      border: 1px solid #d1d5db;
      text-align: center;
      padding: 8px;
    }
    table.matrix th.color-cell, table.matrix thead th:first-child {
      text-align: left;
      background: #f9fafb;
    }
    table.matrix td.empty { color: #9ca3af; font-weight: 400; }
    .footer {
      margin-top: 24px;
      padding-top: 12px;
      border-top: 1px solid #e5e7eb;
      font-size: 11px;
      color: #6b7280;
    }
    .actions {
      display: flex;
      gap: 8px;
      margin: 0 0 16px;
    }
    .actions button {
      border: 1px solid #111827;
      background: #111827;
      color: #fff;
      border-radius: 8px;
      padding: 8px 14px;
      font-size: 13px;
      cursor: pointer;
    }
    .actions button.secondary {
      background: #fff;
      color: #111827;
    }
    @media print {
      .actions { display: none; }
      .sheet { padding: 0; }
    }
  </style>
</head>
<body>
  <div class="sheet">
    ${
      showWindowActions
        ? `<div class="actions">
      <button type="button" onclick="window.print()">Print / Save PDF</button>
      <button type="button" class="secondary" onclick="window.close()">Close</button>
    </div>`
        : ""
    }

    <header class="masthead">
      <div>
        <h1>FGG Blanks Order Slip</h1>
        <p>Organized by product → color → size for clean blank ordering</p>
      </div>
      <div class="meta">
        <strong>${totalUnits} blanks</strong>
        ${orders.length} order${orders.length === 1 ? "" : "s"} · ${escapeHtml(printedAt)}
      </div>
    </header>

    <div class="callout">
      <strong>How to use:</strong> Order one color at a time from the blank supplier.
      Match each size row quantity exactly. Do not mix colors in the same cart line.
      <div style="margin-top:6px"><strong>Orders included:</strong> ${escapeHtml(orderList)}</div>
    </div>

    ${detailHtml}

    <div class="matrix-wrap">
      <h2>Quick order matrix</h2>
      ${buildQuickMatrix(lines)}
    </div>

    <footer class="footer">
      Future Garment Group · Internal blanks purchasing slip · Not a customer invoice
    </footer>
  </div>
</body>
</html>`;

  return html;
}

/** Print via a hidden iframe so browsers do not block a pop-up. */
export function printBlanksSlip(orders: OrderFlowOrder[]): void {
  const html = buildBlanksPrintHtml(orders, { showWindowActions: false });
  const iframe = document.createElement("iframe");
  iframe.setAttribute("title", "FGG Blanks Order Slip");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.style.opacity = "0";
  iframe.style.pointerEvents = "none";
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument || iframe.contentWindow?.document;
  if (!doc) {
    iframe.remove();
    throw new Error("Could not prepare the print slip in this browser.");
  }

  doc.open();
  doc.write(html);
  doc.close();

  const triggerPrint = () => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } finally {
      window.setTimeout(() => iframe.remove(), 1000);
    }
  };

  // Give the document a moment to layout before printing.
  window.setTimeout(triggerPrint, 250);
}
