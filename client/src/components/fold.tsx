import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronsDownUp, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Collapsible cards. Wrap a page in <FoldGroup scope="property">, each card in <Fold id="rates">,
 * put <FoldToggle /> in the card's header and wrap its body in <FoldBody>. Which cards are
 * collapsed is remembered per browser for the whole scope, so every property opens the same way.
 * Outside a <Fold> (e.g. the same card on the Settings page) the toggle renders nothing.
 */
type Group = { collapsed: (id: string) => boolean; set: (id: string, v: boolean) => void; setAll: (v: boolean) => void; register: (id: string) => () => void; anyOpen: boolean };
const GroupCtx = createContext<Group | null>(null);
const FoldCtx = createContext<{ id: string; collapsed: boolean; toggle: () => void; label: string } | null>(null);

const read = (key: string): Record<string, boolean> => { try { return JSON.parse(localStorage.getItem(key) || "{}") || {}; } catch { return {}; } };
const write = (key: string, v: Record<string, boolean>) => { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* storage off */ } };

export function FoldGroup({ scope, children }: { scope: string; children: React.ReactNode }) {
  const key = `mrcc.folds.${scope}`;
  const [state, setState] = useState<Record<string, boolean>>(() => read(key));
  const ids = useRef(new Set<string>());
  const [version, setVersion] = useState(0);
  // Stable, so cards register once rather than on every change.
  const register = useCallback((id: string) => {
    ids.current.add(id); setVersion(v => v + 1);
    return () => { ids.current.delete(id); setVersion(v => v + 1); };
  }, []);
  const update = useCallback((fn: (s: Record<string, boolean>) => Record<string, boolean>) => setState(s => { const next = fn(s); write(key, next); return next; }), [key]);
  const group = useMemo<Group>(() => ({
    collapsed: id => !!state[id],
    set: (id, v) => update(s => ({ ...s, [id]: v })),
    setAll: v => update(s => ({ ...s, ...Object.fromEntries(Array.from(ids.current).map(id => [id, v])) })),
    register,
    anyOpen: Array.from(ids.current).some(id => !state[id]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [state, update, register, version]);
  return <GroupCtx.Provider value={group}>{children}</GroupCtx.Provider>;
}

/** "Collapse all" / "Expand all" for the group. */
export function FoldAllButton() {
  const g = useContext(GroupCtx);
  if (!g) return null;
  return <Button size="sm" variant="ghost" className="gap-1.5" onClick={() => g.setAll(g.anyOpen)} data-testid="button-fold-all">
    {g.anyOpen ? <><ChevronsDownUp className="h-4 w-4" />Collapse all</> : <><ChevronsUpDown className="h-4 w-4" />Expand all</>}
  </Button>;
}

export function Fold({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  const g = useContext(GroupCtx);
  const register = g?.register;
  useEffect(() => register?.(id), [register, id]);
  const collapsed = g ? g.collapsed(id) : false;
  const set = g?.set;
  const value = useMemo(() => ({ id, collapsed, label, toggle: () => set?.(id, !collapsed) }), [id, collapsed, label, set]);
  return <FoldCtx.Provider value={value}><div data-testid={`fold-${id}`}>{children}</div></FoldCtx.Provider>;
}

/** The arrow in a card header. Put it first, before the title. */
export function FoldToggle() {
  const f = useContext(FoldCtx);
  if (!f) return null;
  return <Button type="button" size="icon" variant="ghost" className="-ml-2 h-8 w-8 shrink-0" onClick={f.toggle} aria-expanded={!f.collapsed}
    aria-label={`${f.collapsed ? "Show" : "Hide"} ${f.label}`} data-testid={`button-fold-${f.id}`}>
    <ChevronDown className={`h-4 w-4 transition-transform ${f.collapsed ? "-rotate-90" : ""}`} />
  </Button>;
}

/** The part of a card that hides when it's collapsed. */
export function FoldBody({ children }: { children: React.ReactNode }) {
  const f = useContext(FoldCtx);
  return f?.collapsed ? null : <>{children}</>;
}

/** True inside a collapsed card, for hiding header extras (like buttons) along with the body. */
export const useFolded = () => !!useContext(FoldCtx)?.collapsed;
