"use client";

import { formatMoney, formatQty, type PatternInventory } from "@vimar/core";
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  PageHeader,
  StatCard,
} from "@vimar/ui";
import Link from "next/link";
import { useState } from "react";
import { removeUnitsAction, undoCraftAction } from "@/lib/actions/craft-actions";
import { useAction } from "@/lib/use-action";
import { useAssetDisplayUrl } from "@/lib/use-asset-url";

export function InventoryScreen({ rollups }: { rollups: PatternInventory[] }) {
  const action = useAction();

  const totalUnits = rollups.reduce((sum, r) => sum + r.qtyOnHand, 0);
  const totalCost = rollups.reduce((sum, r) => sum + r.stockValueCents, 0);
  const totalRetail = rollups.reduce((sum, r) => sum + r.qtyOnHand * r.pattern.salePriceCents, 0);

  return (
    <>
      <PageHeader title="Finished inventory" note="every plushie waiting for a home" />

      {action.error ? (
        <div style={{ marginBottom: 16 }}>
          <Alert tone="error">{action.error}</Alert>
        </div>
      ) : null}

      <div className="vm-stats">
        <StatCard label="Units in stock" value={formatQty(totalUnits)} tone="pink" />
        <StatCard label="Value at cost" value={formatMoney(totalCost)} tone="yellow" />
        <StatCard
          label="Value at sale price"
          value={formatMoney(totalRetail)}
          sub={`${formatMoney(totalRetail - totalCost)} above cost`}
        />
      </div>

      {rollups.length === 0 ? (
        <EmptyState title="nothing finished yet">
          <p className="vm-small">
            <Link href="/craft">Complete a pattern</Link> and its units land here with the cost the
            materials actually carried.
          </p>
        </EmptyState>
      ) : (
        <div className="vm-grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))" }}>
          {rollups.map((rollup, index) => (
            <InventoryCard
              key={rollup.pattern.id}
              rollup={rollup}
              index={index}
              pending={action.pending}
              onRemove={(qty) => action.run(() => removeUnitsAction(rollup.pattern.id, qty))}
              onUndo={(sessionId) => action.run(() => undoCraftAction(sessionId))}
            />
          ))}
        </div>
      )}
    </>
  );
}

function InventoryCard({
  rollup,
  index,
  pending,
  onRemove,
  onUndo,
}: {
  rollup: PatternInventory;
  index: number;
  pending: boolean;
  onRemove: (qty: number) => void;
  onUndo: (sessionId: string) => void;
}) {
  const [removing, setRemoving] = useState(false);
  const [qty, setQty] = useState("1");
  const { pattern } = rollup;
  const imageUrl = useAssetDisplayUrl(pattern.imageUrl);

  return (
    <div>
      <Card image={imageUrl} caption={pattern.name} tilt={index} />

      <div style={{ marginTop: 10 }}>
        {rollup.qtyOnHand <= 0 ? (
          <Badge tone="burgundy">Out of stock</Badge>
        ) : rollup.qtyOnHand < 4 ? (
          <Badge tone="pink">Running low</Badge>
        ) : (
          <Badge tone="cream">Stocked</Badge>
        )}
      </div>

      <div className="vm-small" style={{ marginTop: 8, lineHeight: 1.8 }}>
        <div>
          In stock <b className="vm-num">{formatQty(rollup.qtyOnHand)}</b> · worth{" "}
          <b className="vm-num">{formatMoney(rollup.stockValueCents)}</b>
        </div>
        <div className="vm-muted">
          Avg cost {formatMoney(rollup.avgCostCents)} · sells for{" "}
          {formatMoney(pattern.salePriceCents)}
        </div>
        <div className="vm-muted">
          Margin {formatMoney(rollup.marginCents)}
          {rollup.marginPct === null ? "" : ` (${rollup.marginPct.toFixed(0)}%)`}
        </div>
        {rollup.qtyProduced !== rollup.qtyOnHand ? (
          <div className="vm-muted">
            {formatQty(rollup.qtyProduced)} made all time · avg{" "}
            {formatMoney(rollup.lifetimeAvgCostCents)}
          </div>
        ) : null}
      </div>

      <div className="vm-row" style={{ marginTop: 10 }}>
        <Button
          variant="ghost"
          size="sm"
          disabled={rollup.qtyOnHand <= 0}
          onClick={() => setRemoving(!removing)}
        >
          Sold / gifted
        </Button>
      </div>

      {removing ? (
        <div className="vm-row" style={{ marginTop: 8 }}>
          <Input
            numeric
            inputMode="decimal"
            value={qty}
            style={{ width: 80 }}
            onChange={(e) => setQty(e.target.value)}
            aria-label="Units leaving stock"
          />
          <Button
            size="sm"
            disabled={pending}
            onClick={() => {
              onRemove(Number(qty) || 0);
              setRemoving(false);
            }}
          >
            Remove
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setRemoving(false)}>
            Cancel
          </Button>
        </div>
      ) : null}

      {rollup.sessions.length > 0 ? (
        <details style={{ marginTop: 12 }}>
          <summary className="vm-small" style={{ cursor: "pointer", color: "var(--link-color)" }}>
            Cost history ({rollup.sessions.length} craft
            {rollup.sessions.length === 1 ? "" : "s"})
          </summary>
          <div className="vm-stack" style={{ marginTop: 8 }}>
            {rollup.sessions.map((session) => (
              <div key={session.id} className="vm-tiny" style={{ lineHeight: 1.6 }}>
                <div>
                  <b className="vm-num">{session.craftedAt}</b> · {formatQty(session.qty)} units @{" "}
                  <b className="vm-num">{formatMoney(session.unitCostCents)}</b>
                  {session.qtyRemaining !== session.qty ? (
                    <span className="vm-muted"> · {formatQty(session.qtyRemaining)} left</span>
                  ) : null}
                </div>
                {session.note ? (
                  <div className="vm-muted" style={{ fontStyle: "italic" }}>
                    {session.note}
                  </div>
                ) : null}
                {session.qtyRemaining === session.qty ? (
                  <Button variant="danger" size="sm" disabled={pending} onClick={() => onUndo(session.id)}>
                    Undo this craft
                  </Button>
                ) : null}
              </div>
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}
