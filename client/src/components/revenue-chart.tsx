import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid } from "recharts";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { formatMoney } from "@/lib/format";
import type { RevenueBucket, RevenuePeriod } from "@/lib/revenue";

export function PeriodToggle({ value, onChange, testId }: { value: RevenuePeriod; onChange: (p: RevenuePeriod) => void; testId: string }) {
  return (
    <ToggleGroup
      type="single" size="sm" variant="outline" value={value}
      onValueChange={(v) => v && onChange(v as RevenuePeriod)}
      aria-label="Group revenue by" data-testid={testId}
    >
      <ToggleGroupItem value="month" className="h-8 px-3 text-xs" data-testid={`${testId}-month`}>Month</ToggleGroupItem>
      <ToggleGroupItem value="week" className="h-8 px-3 text-xs" data-testid={`${testId}-week`}>Week</ToggleGroupItem>
    </ToggleGroup>
  );
}

export function RevenueBars({ data, height = 240 }: { data: RevenueBucket[]; height?: number }) {
  return (
    <div className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} interval="preserveStartEnd" minTickGap={12} />
          <YAxis tickLine={false} axisLine={false} fontSize={12} width={48} />
          <Tooltip
            cursor={{ fill: "hsl(var(--muted))" }}
            formatter={(v: number) => [formatMoney(v), "Revenue"]}
            labelFormatter={(_l, payload) => (payload?.[0]?.payload as RevenueBucket | undefined)?.range ?? ""}
            contentStyle={{ borderRadius: 8, fontSize: 12, background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))" }}
          />
          <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
