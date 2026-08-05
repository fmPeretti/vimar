import {
  EVENT_KIND_LABELS,
  formatMoney,
  formatMoneyShort,
  formatQty,
  relativeDayLabel,
  taskProgress,
  todayISO,
} from "@vimar/core";
import { Alert, Badge, EmptyState, PageHeader, StatCard, TableWrap } from "@vimar/ui";
import Link from "next/link";
import { getDashboardData, getUpcomingEvents } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const today = todayISO();
  const [{ totals, lowStock, rollups, recentSessions, patterns }, upcoming] = await Promise.all([
    getDashboardData(),
    getUpcomingEvents(today),
  ]);

  const patternName = (id: string) => patterns.find((p) => p.id === id)?.name ?? "—";
  const blocked = upcoming.filter((item) => item.readiness.applicable && !item.readiness.ready);

  return (
    <>
      <PageHeader title="Dashboard" note="where the money's sitting today" />

      {blocked.length > 0 ? (
        <div style={{ marginBottom: 20 }}>
          <Alert tone="warn" title="Planned crafts you can't make yet">
            <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
              {blocked.map((item) => (
                <li key={item.event.id}>
                  <Link href={`/calendar/${item.event.id}`}>{item.event.title}</Link> —{" "}
                  {relativeDayLabel(item.event.scheduledFor, today).toLowerCase()} · short on{" "}
                  {item.readiness.missing.map((m) => m.materialName).join(", ")}
                </li>
              ))}
            </ul>
          </Alert>
        </div>
      ) : null}

      <div className="vm-stats">
        <StatCard
          label="Money in materials"
          value={formatMoneyShort(totals.materialsValueCents)}
          tone="yellow"
          sub={`${totals.materialTypeCount} material types on the shelf`}
        />
        <StatCard
          label="Money in crafted stock"
          value={formatMoneyShort(totals.craftedValueCents)}
          tone="pink"
          sub={`${formatQty(totals.craftedUnits)} finished units at cost`}
        />
        <StatCard
          label="Total tied up"
          value={formatMoneyShort(totals.totalTiedUpCents)}
          sub="materials + finished goods"
        />
        <StatCard
          label="If it all sold"
          value={formatMoneyShort(totals.retailValueCents)}
          sub={`${formatMoney(totals.potentialProfitCents)} above cost`}
        />
      </div>

      <h2 className="vm-section-title">Coming up</h2>
      {upcoming.length === 0 ? (
        <Alert tone="info">
          Nothing planned. <Link href="/calendar">Open the calendar</Link> to schedule a craft, a
          tutorial or a post.
        </Alert>
      ) : (
        <div className="vm-stack">
          {upcoming.slice(0, 5).map((item) => {
            const progress = taskProgress(item.event.tasks);
            return (
              <div key={item.event.id} className="vm-event">
                <div className="vm-event__when">
                  <b>{item.event.scheduledFor.slice(8)}</b>
                  <span className="vm-tiny vm-muted">
                    {relativeDayLabel(item.event.scheduledFor, today)}
                  </span>
                </div>
                <div className="vm-event__body">
                  <Link href={`/calendar/${item.event.id}`} className="vm-event__title">
                    {item.event.title}
                  </Link>
                  <div className="vm-small vm-muted">
                    {EVENT_KIND_LABELS[item.event.kind]}
                    {item.pattern ? ` · ${item.pattern.name}` : ""}
                    {item.event.plannedQty ? ` ×${formatQty(item.event.plannedQty)}` : ""}
                    {progress.total > 0 ? ` · ${progress.done}/${progress.total} steps` : ""}
                  </div>
                </div>
                {item.readiness.applicable ? (
                  <Badge tone={item.readiness.ready ? "cream" : "burgundy"}>
                    {item.readiness.ready ? "Ready" : "Missing materials"}
                  </Badge>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      <h2 className="vm-section-title">Low stock</h2>
      {lowStock.length === 0 ? (
        <Alert tone="success">Everything is above its reorder level. Nothing to restock.</Alert>
      ) : (
        <div className="vm-stack">
          {lowStock.map(({ material, stock }) => (
            <div key={material.id} className="vm-panel vm-row">
              <div style={{ flex: 1, minWidth: 180 }}>
                <div className="vm-strong">{material.name}</div>
                <div className="vm-small vm-muted">
                  {formatQty(stock.qtyOnHand, material.unit)} left · reorder at{" "}
                  {formatQty(material.reorderLevel, material.unit)}
                  {material.provider ? ` · ${material.provider}` : ""}
                </div>
              </div>
              <div className="vm-small vm-muted vm-num">
                {stock.lifetimeAvgCostCents > 0
                  ? `usually ${formatMoney(stock.lifetimeAvgCostCents)} / ${material.unit}`
                  : "never purchased"}
              </div>
              <Badge tone={stock.isOut ? "burgundy" : "pink"}>
                {stock.isOut ? "Reorder" : "Low stock"}
              </Badge>
            </div>
          ))}
        </div>
      )}

      <h2 className="vm-section-title">Finished stock by pattern</h2>
      {rollups.length === 0 ? (
        <EmptyState title="nothing crafted yet">
          <p className="vm-small">
            Once you <Link href="/craft">complete a pattern</Link>, its finished units and cost
            basis show up here.
          </p>
        </EmptyState>
      ) : (
        <TableWrap>
          <thead>
            <tr>
              <th>Pattern</th>
              <th>In stock</th>
              <th>Avg unit cost</th>
              <th>Value at cost</th>
              <th>Value at sale</th>
              <th>Margin</th>
            </tr>
          </thead>
          <tbody>
            {rollups.map((r) => (
              <tr key={r.pattern.id}>
                <td>
                  <span className="vm-strong">{r.pattern.name}</span>
                </td>
                <td className="vm-num">{formatQty(r.qtyOnHand)}</td>
                <td className="vm-num">{formatMoney(r.avgCostCents)}</td>
                <td className="vm-num">{formatMoney(r.stockValueCents)}</td>
                <td className="vm-num">{formatMoney(r.qtyOnHand * r.pattern.salePriceCents)}</td>
                <td className="vm-num">
                  {formatMoney(r.marginCents)}
                  {r.marginPct === null ? null : (
                    <span className="vm-table__sub">{r.marginPct.toFixed(0)}% of sale price</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}

      <h2 className="vm-section-title">Recent crafts</h2>
      {recentSessions.length === 0 ? (
        <Alert tone="info">No craft sessions recorded yet.</Alert>
      ) : (
        <TableWrap>
          <thead>
            <tr>
              <th>Date</th>
              <th>Pattern</th>
              <th>Made</th>
              <th>Unit cost</th>
              <th>Total cost</th>
              <th>Note</th>
            </tr>
          </thead>
          <tbody>
            {recentSessions.map((session) => (
              <tr key={session.id}>
                <td className="vm-num">{session.craftedAt}</td>
                <td className="vm-strong">{patternName(session.patternId)}</td>
                <td className="vm-num">{formatQty(session.qty)}</td>
                <td className="vm-num">{formatMoney(session.unitCostCents)}</td>
                <td className="vm-num">{formatMoney(session.totalCostCents)}</td>
                <td className="vm-muted">{session.note ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}
    </>
  );
}
