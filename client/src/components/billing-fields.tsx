import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-2"><Label>{label}</Label>{children}</div>;
}
export function Choice({ value, onChange, options, label }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; label: string }) {
  return <Select value={value} onValueChange={onChange}><SelectTrigger aria-label={label}><SelectValue placeholder={label} /></SelectTrigger><SelectContent>
    {options.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
  </SelectContent></Select>;
}
export const rateOptions = [{ value: "standard", label: "Standard Departure Rate" }, { value: "owner", label: "Owner Rate" }, { value: "custom", label: "Custom / No Default Rate" }];
export const behaviorOptions = [{ value: "auto_include", label: "Automatically included" }, { value: "suggested", label: "Suggested / optional" }, { value: "manual", label: "Manual only" }];
