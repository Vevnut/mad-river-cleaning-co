import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { formatMoney } from "@/lib/format";

export type EditableLineItem = {
  key: string;
  description: string;
  itemType: "service" | "labor" | "supplies" | "addon" | "discount" | "fee";
  quantity: number;
  unitPrice: number;
};

const ITEM_TYPES: EditableLineItem["itemType"][] = ["service", "labor", "supplies", "addon", "discount", "fee"];

/** Live-computed line items table: add/remove rows, auto-calculated amount per row. */
export function LineItemsEditor({
  items,
  onChange,
}: {
  items: EditableLineItem[];
  onChange: (items: EditableLineItem[]) => void;
}) {
  function updateItem(key: string, patch: Partial<EditableLineItem>) {
    onChange(items.map((it) => (it.key === key ? { ...it, ...patch } : it)));
  }
  function removeItem(key: string) {
    onChange(items.filter((it) => it.key !== key));
  }
  function addItem() {
    onChange([
      ...items,
      { key: `new-${Date.now()}-${Math.random()}`, description: "", itemType: "service", quantity: 1, unitPrice: 0 },
    ]);
  }

  return (
    <div className="space-y-2" data-testid="line-items-editor">
      <div className="overflow-x-auto rounded-md border">
        <Table className="min-w-[720px]">
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-[180px]">Description</TableHead>
              <TableHead className="w-[110px] whitespace-nowrap">Type</TableHead>
              <TableHead className="w-[80px] text-right whitespace-nowrap">Qty</TableHead>
              <TableHead className="w-[110px] text-right whitespace-nowrap">Unit Price</TableHead>
              <TableHead className="w-[100px] text-right whitespace-nowrap">Amount</TableHead>
              <TableHead className="w-[40px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-6">
                  No line items yet. Add one below.
                </TableCell>
              </TableRow>
            ) : (
              items.map((item) => (
                <TableRow key={item.key} data-testid={`row-line-item-${item.key}`}>
                  <TableCell>
                    <Input
                      value={item.description}
                      onChange={(e) => updateItem(item.key, { description: e.target.value })}
                      placeholder="e.g. Turnover clean base fee"
                      className="h-8 text-sm"
                      data-testid={`input-item-description-${item.key}`}
                    />
                  </TableCell>
                  <TableCell>
                    <Select value={item.itemType} onValueChange={(v) => updateItem(item.key, { itemType: v as EditableLineItem["itemType"] })}>
                      <SelectTrigger className="h-8 text-xs" data-testid={`select-item-type-${item.key}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ITEM_TYPES.map((t) => (
                          <SelectItem key={t} value={t} className="capitalize text-xs">{t}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      min={0}
                      step="0.5"
                      value={item.quantity}
                      onChange={(e) => updateItem(item.key, { quantity: Number(e.target.value) })}
                      className="h-8 text-sm text-right tabular-nums"
                      data-testid={`input-item-quantity-${item.key}`}
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      value={item.unitPrice}
                      onChange={(e) => updateItem(item.key, { unitPrice: Number(e.target.value) })}
                      className="h-8 text-sm text-right tabular-nums"
                      data-testid={`input-item-unit-price-${item.key}`}
                    />
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-medium" data-testid={`text-item-amount-${item.key}`}>
                    {formatMoney(item.quantity * item.unitPrice)}
                  </TableCell>
                  <TableCell>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={() => removeItem(item.key)}
                      data-testid={`button-remove-item-${item.key}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      <Button size="sm" variant="outline" className="gap-1.5" onClick={addItem} data-testid="button-add-line-item">
        <Plus className="h-3.5 w-3.5" /> Add Line Item
      </Button>
    </div>
  );
}
