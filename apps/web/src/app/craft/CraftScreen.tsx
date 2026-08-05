"use client";

import {
  formatMinutes,
  formatMoney,
  formatQty,
  formatUnitCost,
  numberFromInput,
  todayISO,
} from "@vimar/core";
import {
  Alert,
  Badge,
  Button,
  EmptyState,
  Field,
  Input,
  PageHeader,
  Panel,
  Select,
  Textarea,
} from "@vimar/ui";
import { useMemo, useState } from "react";
import {
  completeCraftAction,
  type CompleteCraftResponse,
} from "@/lib/actions/craft-actions";
import { useAction } from "@/lib/use-action";

export interface CraftMaterialDto {
  id: string;
  name: string;
  unit: string;
  qtyOnHand: number;
  unitCostCents: number;
}

export interface CraftPatternDto {
  id: string;
  name: string;
  estimatedMinutes: number;
  bom: Array<{ materialId: string; qty: number }>;
}

interface UsageRow {
  materialId: string;
  qty: string;
  /** BOM qty, or null when this line was added on top of the recipe. */
  standard: number | null;
}

export function CraftScreen({
  patterns,
  materials,
  initialPatternId,
  initialQty,
  eventId,
}: {
  patterns: CraftPatternDto[];
  materials: CraftMaterialDto[];
  initialPatternId?: string;
  initialQty?: string;
  eventId?: string;
}) {
  const byId = useMemo(() => new Map(materials.map((m) => [m.id, m])), [materials]);

  const firstValid =
    patterns.find((p) => p.id === initialPatternId)?.id ?? patterns[0]?.id ?? "";

  const [patternId, setPatternId] = useState(firstValid);
  const [qty, setQty] = useState(initialQty && Number(initialQty) > 0 ? initialQty : "1");
  const [craftedAt, setCraftedAt] = useState(todayISO());
  const [minutes, setMinutes] = useState("");
  const [note, setNote] = useState("");
  const [usage, setUsage] = useState<UsageRow[]>(() => rowsFor(patterns, firstValid));
  const [confirmOverdraw, setConfirmOverdraw] = useState(false);
  const [result, setResult] = useState<CompleteCraftResponse | null>(null);

  const action = useAction();
  const pattern = patterns.find((p) => p.id === patternId);
  const qtyNum = Math.max(0, numberFromInput(qty, 0));

  const selectPattern = (id: string) => {
    setPatternId(id);
    setUsage(rowsFor(patterns, id));
    setResult(null);
    setConfirmOverdraw(false);
    action.reset();
  };

  const setRowQty = (materialId: string, value: string) =>
    setUsage(usage.map((row) => (row.materialId === materialId ? { ...row, qty: value } : row)));

  const addExtraLine = () => {
    const unused = materials.find((m) => !usage.some((row) => row.materialId === m.id));
    if (!unused) return;
    setUsage([...usage, { materialId: unused.id, qty: "0.5", standard: null }]);
  };

  // Priced at each material's current average — the committed cost comes from
  // the actual FIFO lots and is reported back after saving.
  const unitCostCents = usage.reduce((sum, row) => {
    const material = byId.get(row.materialId);
    return material ? sum + material.unitCostCents * numberFromInput(row.qty, 0) : sum;
  }, 0);

  const shortLines = usage.filter((row) => {
    const material = byId.get(row.materialId);
    return material ? numberFromInput(row.qty, 0) * qtyNum > material.qtyOnHand : false;
  });

  const extras = usage.filter(
    (row) => row.standard !== null && numberFromInput(row.qty, 0) > row.standard,
  );

  const submit = () => {
    if (!pattern) return;
    setResult(null);
    action.run(
      async () => {
        const response = await completeCraftAction({
          patternId: pattern.id,
          qty: qtyNum,
          craftedAt,
          actualMinutes: minutes ? numberFromInput(minutes, 0) : null,
          note,
          allowNegativeStock: confirmOverdraw,
          usage: usage
            .map((row) => ({ materialId: row.materialId, qtyPerUnit: numberFromInput(row.qty, 0) }))
            .filter((row) => row.qtyPerUnit > 0),
        });
        setResult(response);
        return response.ok
          ? ({ ok: true, message: response.message } as const)
          : ({ ok: false, error: response.error } as const);
      },
      () => {
        setNote("");
        setMinutes("");
        setConfirmOverdraw(false);
        setUsage(rowsFor(patterns, patternId));
      },
    );
  };

  if (patterns.length === 0) {
    return (
      <>
        <PageHeader title="Complete a pattern" note="turn yarn into stock" />
        <EmptyState title="no patterns yet">
          <p className="vm-small">Create a pattern first — this screen works from its recipe.</p>
        </EmptyState>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Complete a pattern" note="turn yarn into stock" />

      {eventId ? (
        <div style={{ marginBottom: 16 }}>
          <Alert tone="info">Completing this craft from a planned calendar event.</Alert>
        </div>
      ) : null}

      {result?.ok ? (
        <div style={{ marginBottom: 16 }}>
          <Alert tone="success" title="Added to stock">
            {result.message}
          </Alert>
        </div>
      ) : null}

      {action.error ? (
        <div style={{ marginBottom: 16 }}>
          <Alert tone="error" title="Couldn't record this craft">
            {action.error}
          </Alert>
        </div>
      ) : null}

      <div style={{ maxWidth: 760 }}>
        <Panel
          footer={
            <>
              <Button size="sm" onClick={submit} disabled={action.pending || qtyNum <= 0}>
                {action.pending ? "Recording…" : "Complete & add to stock"}
              </Button>
              <span className="vm-small vm-muted">
                Est. <b className="vm-num">{formatMoney(unitCostCents)}</b> each ·{" "}
                <b className="vm-num">{formatMoney(unitCostCents * qtyNum)}</b> total
              </span>
            </>
          }
        >
          <div className="vm-form-grid">
            <Field label="Pattern">
              <Select value={patternId} onChange={(e) => selectPattern(e.target.value)}>
                {patterns.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="How many">
              <Input
                numeric
                inputMode="decimal"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
              />
            </Field>
            <Field label="Finished on">
              <Input type="date" value={craftedAt} onChange={(e) => setCraftedAt(e.target.value)} />
            </Field>
            <Field
              label="Time spent"
              hint={pattern ? `Usually ${formatMinutes(pattern.estimatedMinutes)}` : undefined}
            >
              <Input
                numeric
                inputMode="numeric"
                placeholder="minutes"
                value={minutes}
                onChange={(e) => setMinutes(e.target.value)}
              />
            </Field>
          </div>

          <hr className="vm-divider" />

          <div className="vm-row" style={{ justifyContent: "space-between" }}>
            <h3 className="vm-panel__title" style={{ margin: 0 }}>
              Materials actually used
            </h3>
            <span className="vm-small vm-muted">per unit — edit if you used more</span>
          </div>

          <div className="vm-stack" style={{ marginTop: 12 }}>
            {usage.map((row) => {
              const material = byId.get(row.materialId);
              if (!material) return null;

              const perUnit = numberFromInput(row.qty, 0);
              const total = perUnit * qtyNum;
              const isExtra = row.standard !== null && perUnit > row.standard;
              const isShort = total > material.qtyOnHand;

              return (
                <div key={row.materialId} className="vm-row" style={{ alignItems: "center" }}>
                  <span style={{ width: 210 }} className="vm-strong">
                    {material.name}
                    {row.standard === null ? (
                      <span className="vm-table__sub">added on top of the recipe</span>
                    ) : null}
                  </span>

                  <Input
                    numeric
                    inputMode="decimal"
                    value={row.qty}
                    style={{ width: 100 }}
                    onChange={(e) => setRowQty(row.materialId, e.target.value)}
                    aria-label={`${material.name} used per unit`}
                  />

                  <span className="vm-small vm-muted">
                    {material.unit} · {formatQty(total)} total · on hand{" "}
                    {formatQty(material.qtyOnHand)}
                  </span>

                  {isExtra ? (
                    <Badge tone="yellow">extra vs. {formatQty(row.standard ?? 0)}</Badge>
                  ) : null}
                  {isShort ? <Badge tone="burgundy">not enough</Badge> : null}

                  {row.standard === null ? (
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() =>
                        setUsage(usage.filter((r) => r.materialId !== row.materialId))
                      }
                    >
                      Remove
                    </Button>
                  ) : null}
                </div>
              );
            })}
          </div>

          <div className="vm-row" style={{ marginTop: 12 }}>
            <Button variant="ghost" size="sm" onClick={addExtraLine}>
              + Add a material the recipe doesn't include
            </Button>
          </div>

          {extras.length > 0 ? (
            <div style={{ marginTop: 14 }}>
              <Alert tone="warn" title="Extra material on this batch">
                {extras
                  .map((row) => byId.get(row.materialId)?.name)
                  .filter(Boolean)
                  .join(", ")}{" "}
                — this is recorded against this craft only, so the pattern's standard recipe stays
                as it is, and these units cost more accordingly.
              </Alert>
            </div>
          ) : null}

          {shortLines.length > 0 ? (
            <div style={{ marginTop: 14 }}>
              <Alert tone="error" title="Not enough stock">
                <ul style={{ margin: "6px 0 10px", paddingLeft: 18 }}>
                  {shortLines.map((row) => {
                    const material = byId.get(row.materialId);
                    if (!material) return null;
                    const needed = numberFromInput(row.qty, 0) * qtyNum;
                    return (
                      <li key={row.materialId}>
                        {material.name}: need {formatQty(needed, material.unit)}, have{" "}
                        {formatQty(material.qtyOnHand, material.unit)}
                      </li>
                    );
                  })}
                </ul>
                <label className="vm-small" style={{ display: "flex", gap: 8 }}>
                  <input
                    type="checkbox"
                    checked={confirmOverdraw}
                    onChange={(e) => setConfirmOverdraw(e.target.checked)}
                  />
                  Record it anyway — I'll fix the purchase history later
                </label>
              </Alert>
            </div>
          ) : null}

          <div style={{ marginTop: 16 }}>
            <Field label="Note" hint="Worth writing down why a batch cost more">
              <Textarea
                rows={2}
                value={note}
                placeholder="Messed up the first ear — used an extra half skein."
                onChange={(e) => setNote(e.target.value)}
              />
            </Field>
          </div>
        </Panel>
      </div>

      <p className="vm-small vm-muted" style={{ marginTop: 16, maxWidth: 760 }}>
        Materials come out of your oldest purchases first, so these units carry the price you
        actually paid for that yarn — not today's price. The exact figure is confirmed once you
        save.
        {usage.length > 0 ? (
          <>
            {" "}
            Current estimate uses{" "}
            {usage
              .map((row) => {
                const m = byId.get(row.materialId);
                return m ? `${m.name} at ${formatUnitCost(m.unitCostCents)}` : null;
              })
              .filter(Boolean)
              .join(", ")}
            .
          </>
        ) : null}
      </p>
    </>
  );
}

/** Prefill the usage rows from a pattern's standard recipe. */
function rowsFor(patterns: CraftPatternDto[], patternId: string): UsageRow[] {
  const pattern = patterns.find((p) => p.id === patternId);
  if (!pattern) return [];
  return pattern.bom.map((line) => ({
    materialId: line.materialId,
    qty: String(line.qty),
    standard: line.qty,
  }));
}
