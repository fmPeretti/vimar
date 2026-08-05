"use client";

import {
  centsFromInput,
  formatMoney,
  formatQty,
  formatUnitCost,
  numberFromInput,
  todayISO,
  type MaterialStock,
  type MaterialWithBatches,
} from "@vimar/core";
import {
  Alert,
  Badge,
  Button,
  ConfirmDialog,
  EmptyState,
  Field,
  Input,
  PageHeader,
  Panel,
  Select,
  StockBadge,
  TableWrap,
  Textarea,
} from "@vimar/ui";
import { Fragment, useState } from "react";
import { ImageUploader } from "@/components/ImageUploader";
import {
  addBatchAction,
  archiveMaterialAction,
  createMaterialAction,
  deleteBatchAction,
  deleteMaterialAction,
  updateMaterialAction,
} from "@/lib/actions/material-actions";
import { useAction } from "@/lib/use-action";
import { useAssetDisplayUrl } from "@/lib/use-asset-url";

export interface MaterialViewDto {
  material: MaterialWithBatches;
  stock: MaterialStock;
}

const EMPTY_MATERIAL = {
  name: "",
  category: "Yarn",
  unit: "skein",
  provider: "",
  description: "",
  reorderLevel: "5",
  imageUrl: null as string | null,
  openingQty: "",
  openingCost: "",
  openingDate: todayISO(),
};

export function MaterialsScreen({
  views,
  categories,
  units,
}: {
  views: MaterialViewDto[];
  categories: string[];
  units: string[];
}) {
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(EMPTY_MATERIAL);
  const [query, setQuery] = useState("");
  const action = useAction();

  const totalValue = views.reduce((sum, v) => sum + v.stock.stockValueCents, 0);

  const needle = query.trim().toLowerCase();
  const filtered = needle
    ? views.filter((v) => {
        const { material } = v;
        return (
          material.name.toLowerCase().includes(needle) ||
          material.category.toLowerCase().includes(needle) ||
          (material.provider?.toLowerCase().includes(needle) ?? false)
        );
      })
    : views;

  const submit = () => {
    action.run(
      () =>
        createMaterialAction({
          name: form.name,
          category: form.category,
          unit: form.unit,
          provider: form.provider,
          description: form.description,
          reorderLevel: numberFromInput(form.reorderLevel, 0),
          imageUrl: form.imageUrl,
          openingQty: numberFromInput(form.openingQty, 0),
          openingUnitCostCents: centsFromInput(form.openingCost),
          openingPurchasedAt: form.openingDate,
        }),
      () => {
        setForm(EMPTY_MATERIAL);
        setCreating(false);
      },
    );
  };

  return (
    <>
      <PageHeader title="Materials" note="what's on the shelf right now">
        <Button
          variant={creating ? "ghost" : "primary"}
          size="sm"
          onClick={() => {
            setCreating(!creating);
            action.reset();
          }}
        >
          {creating ? "Cancel" : "+ Add material"}
        </Button>
      </PageHeader>

      {action.error ? (
        <div style={{ marginBottom: 16 }}>
          <Alert tone="error">{action.error}</Alert>
        </div>
      ) : null}

      {creating ? (
        <div style={{ marginBottom: 24 }}>
          <Panel
            title="New material"
            footer={
              <>
                <Button size="sm" onClick={submit} disabled={action.pending}>
                  {action.pending ? "Saving…" : "Save material"}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setCreating(false)}>
                  Cancel
                </Button>
                <span className="vm-small vm-muted">
                  The opening purchase is optional — you can record purchases any time.
                </span>
              </>
            }
          >
            <div className="vm-form-grid">
              <Field label="Name">
                <Input
                  value={form.name}
                  placeholder="Sunshine Yellow Chenille"
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </Field>
              <Field label="Category">
                <Select
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                >
                  {categories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Unit" hint="How you buy and use it">
                <Select value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })}>
                  {units.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Provider" hint="Optional">
                <Input
                  value={form.provider}
                  placeholder="Bernat (Yarnspirations)"
                  onChange={(e) => setForm({ ...form, provider: e.target.value })}
                />
              </Field>
              <Field label="Reorder level" hint="Warn below this">
                <Input
                  numeric
                  inputMode="decimal"
                  value={form.reorderLevel}
                  onChange={(e) => setForm({ ...form, reorderLevel: e.target.value })}
                />
              </Field>
            </div>

            <div style={{ marginTop: 16 }}>
              <Field label="Description">
                <Textarea
                  rows={2}
                  value={form.description}
                  placeholder="Baby Blanket chenille — main Luma colour"
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </Field>
            </div>

            <div style={{ marginTop: 16 }}>
              <Field label="Photo" hint="Optional">
                <ImageUploader
                  kind="materials"
                  label={form.name || "material"}
                  value={form.imageUrl}
                  onChange={(url) => setForm({ ...form, imageUrl: url })}
                  disabled={action.pending}
                />
              </Field>
            </div>

            <hr className="vm-divider" />

            <div className="vm-form-grid">
              <Field label="Opening qty" hint="Optional first purchase">
                <Input
                  numeric
                  inputMode="decimal"
                  value={form.openingQty}
                  placeholder="6"
                  onChange={(e) => setForm({ ...form, openingQty: e.target.value })}
                />
              </Field>
              <Field label={`Cost per ${form.unit}`} hint="What you paid, in dollars">
                <Input
                  numeric
                  inputMode="decimal"
                  value={form.openingCost}
                  placeholder="6.25"
                  onChange={(e) => setForm({ ...form, openingCost: e.target.value })}
                />
              </Field>
              <Field label="Purchase date">
                <Input
                  type="date"
                  value={form.openingDate}
                  onChange={(e) => setForm({ ...form, openingDate: e.target.value })}
                />
              </Field>
            </div>
          </Panel>
        </div>
      ) : null}

      {views.length === 0 ? (
        <EmptyState title="no materials yet">
          <p className="vm-small">
            Add your yarns, stuffing and notions — each purchase keeps the price you actually paid.
          </p>
        </EmptyState>
      ) : (
        <>
          <div style={{ marginBottom: 16, maxWidth: 320 }}>
            <Input
              value={query}
              placeholder="Search by name, category or provider…"
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search materials"
            />
          </div>

          {filtered.length === 0 ? (
            <EmptyState title="no materials match">
              <p className="vm-small">Try a different name, category or provider.</p>
            </EmptyState>
          ) : (
            <TableWrap>
              <thead>
                <tr>
                  <th>Material</th>
                  <th>On hand</th>
                  <th>Stock cost</th>
                  <th>Usually costs</th>
                  <th>Value</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filtered.map((view) => (
                  <MaterialRow key={view.material.id} view={view} />
                ))}
              </tbody>
            </TableWrap>
          )}
          <p className="vm-small vm-muted" style={{ marginTop: 12 }}>
            Total tied up in materials: <b className="vm-num">{formatMoney(totalValue)}</b>. “Stock
            cost” is the weighted average of what's still on the shelf; “usually costs” averages
            every purchase you've ever made.
          </p>
        </>
      )}
    </>
  );
}

function MaterialRow({ view }: { view: MaterialViewDto }) {
  const { material, stock } = view;
  const [expanded, setExpanded] = useState(false);
  const [buying, setBuying] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirmDeleteMaterial, setConfirmDeleteMaterial] = useState(false);
  const [confirmDeleteBatchId, setConfirmDeleteBatchId] = useState<string | null>(null);
  const action = useAction();
  const thumbUrl = useAssetDisplayUrl(material.imageUrl);

  const [purchase, setPurchase] = useState({ qty: "", cost: "", date: todayISO(), note: "" });
  const initialEdit = {
    name: material.name,
    category: material.category,
    unit: material.unit,
    provider: material.provider ?? "",
    description: material.description ?? "",
    reorderLevel: String(material.reorderLevel),
    imageUrl: material.imageUrl,
  };
  const [edit, setEdit] = useState(initialEdit);

  const openEditing = () => {
    setEdit(initialEdit);
    setEditing(true);
  };

  const cancelEditing = () => {
    setEdit(initialEdit);
    setEditing(false);
    action.reset();
  };

  const savePurchase = () => {
    action.run(
      () =>
        addBatchAction({
          materialId: material.id,
          purchasedAt: purchase.date,
          qty: numberFromInput(purchase.qty, 0),
          unitCostCents: centsFromInput(purchase.cost),
          note: purchase.note,
        }),
      () => {
        setPurchase({ qty: "", cost: "", date: todayISO(), note: "" });
        setBuying(false);
        setExpanded(true);
      },
    );
  };

  const saveEdit = () => {
    action.run(
      () =>
        updateMaterialAction(material.id, {
          name: edit.name,
          category: edit.category,
          unit: edit.unit,
          provider: edit.provider,
          description: edit.description,
          reorderLevel: numberFromInput(edit.reorderLevel, 0),
          imageUrl: edit.imageUrl,
        }),
      () => setEditing(false),
    );
  };

  return (
    <Fragment>
      <tr
        onClick={() => (editing ? cancelEditing() : openEditing())}
        style={{ cursor: "pointer" }}
        title="Click to edit"
      >
        <td>
          <div className="vm-cell-media">
            {thumbUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- arbitrary blob/user URLs
              <img className="vm-thumb" src={thumbUrl} alt="" />
            ) : (
              <span className="vm-thumb vm-thumb--empty" aria-hidden="true">
                {material.name.charAt(0).toUpperCase()}
              </span>
            )}
            <span>
              <span className="vm-strong">{material.name}</span>
              <span className="vm-table__sub">
                {material.category}
                {material.provider ? ` · ${material.provider}` : " · no provider"}
              </span>
            </span>
          </div>
        </td>
        <td className="vm-num">{formatQty(stock.qtyOnHand, material.unit)}</td>
        <td className="vm-num">
          {stock.avgCostCents > 0 ? formatUnitCost(stock.avgCostCents) : "—"}
        </td>
        <td className="vm-num">
          {stock.lifetimeAvgCostCents > 0 ? formatUnitCost(stock.lifetimeAvgCostCents) : "—"}
          {stock.latestCostCents !== null && stock.latestCostCents !== stock.lifetimeAvgCostCents ? (
            <span className="vm-table__sub">last {formatUnitCost(stock.latestCostCents)}</span>
          ) : null}
        </td>
        <td className="vm-num">{formatMoney(stock.stockValueCents)}</td>
        <td>
          <StockBadge isOut={stock.isOut} isLow={stock.isLow} />
        </td>
        <td onClick={(e) => e.stopPropagation()}>
          <div className="vm-table__actions">
            <Button variant="ghost" size="sm" onClick={() => setBuying(!buying)}>
              + Purchase
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setExpanded(!expanded)}>
              {expanded ? "Hide" : `Lots (${material.batches.length})`}
            </Button>
          </div>
        </td>
      </tr>

      {action.error ? (
        <tr className="vm-table__nested">
          <td colSpan={7}>
            <Alert tone="error">{action.error}</Alert>
          </td>
        </tr>
      ) : null}

      {buying ? (
        <tr className="vm-table__nested">
          <td colSpan={7}>
            <div className="vm-row" style={{ alignItems: "flex-end" }}>
              <Field label="Qty" className="vm-field--sm">
                <Input
                  numeric
                  inputMode="decimal"
                  value={purchase.qty}
                  placeholder={material.unit}
                  onChange={(e) => setPurchase({ ...purchase, qty: e.target.value })}
                  style={{ width: 110 }}
                />
              </Field>
              <Field label={`$ per ${material.unit}`}>
                <Input
                  numeric
                  inputMode="decimal"
                  value={purchase.cost}
                  placeholder="6.75"
                  onChange={(e) => setPurchase({ ...purchase, cost: e.target.value })}
                  style={{ width: 120 }}
                />
              </Field>
              <Field label="Date">
                <Input
                  type="date"
                  value={purchase.date}
                  onChange={(e) => setPurchase({ ...purchase, date: e.target.value })}
                  style={{ width: 160 }}
                />
              </Field>
              <Field label="Note">
                <Input
                  value={purchase.note}
                  placeholder="Sale price, new dye lot…"
                  onChange={(e) => setPurchase({ ...purchase, note: e.target.value })}
                  style={{ width: 220 }}
                />
              </Field>
              <Button size="sm" onClick={savePurchase} disabled={action.pending}>
                {action.pending ? "Saving…" : "Record purchase"}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setBuying(false)}>
                Cancel
              </Button>
            </div>
          </td>
        </tr>
      ) : null}

      {expanded ? (
        <tr className="vm-table__nested">
          <td colSpan={7}>
            {material.description ? (
              <p className="vm-small vm-muted" style={{ marginTop: 0 }}>
                {material.description}
              </p>
            ) : null}

            {material.batches.length === 0 ? (
              <p className="vm-small vm-muted">
                No purchases recorded yet — add one to start tracking cost.
              </p>
            ) : (
              <table className="vm-table" style={{ minWidth: 0, background: "transparent" }}>
                <thead>
                  <tr>
                    <th>Purchased</th>
                    <th>Bought</th>
                    <th>Left</th>
                    <th>Cost / {material.unit}</th>
                    <th>Value left</th>
                    <th>Note</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {material.batches.map((batch) => (
                    <tr key={batch.id}>
                      <td className="vm-num">{batch.purchasedAt}</td>
                      <td className="vm-num">{formatQty(batch.qty)}</td>
                      <td className="vm-num">
                        {formatQty(batch.qtyRemaining)}
                        {batch.qtyRemaining <= 0 ? (
                          <span className="vm-table__sub">used up</span>
                        ) : null}
                      </td>
                      <td className="vm-num">{formatUnitCost(batch.unitCostCents)}</td>
                      <td className="vm-num">
                        {formatMoney(batch.qtyRemaining * batch.unitCostCents)}
                      </td>
                      <td className="vm-muted">{batch.note ?? "—"}</td>
                      <td>
                        <div className="vm-table__actions">
                          <Button
                            variant="danger"
                            size="sm"
                            disabled={action.pending}
                            onClick={() => setConfirmDeleteBatchId(batch.id)}
                          >
                            Delete
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </td>
        </tr>
      ) : null}

      {editing ? (
        <tr className="vm-table__nested">
          <td colSpan={7}>
            <div className="vm-form-grid">
              <Field label="Name">
                <Input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
              </Field>
              <Field label="Category">
                <Input
                  value={edit.category}
                  onChange={(e) => setEdit({ ...edit, category: e.target.value })}
                />
              </Field>
              <Field label="Unit">
                <Input value={edit.unit} onChange={(e) => setEdit({ ...edit, unit: e.target.value })} />
              </Field>
              <Field label="Provider">
                <Input
                  value={edit.provider}
                  onChange={(e) => setEdit({ ...edit, provider: e.target.value })}
                />
              </Field>
              <Field label="Reorder level">
                <Input
                  numeric
                  inputMode="decimal"
                  value={edit.reorderLevel}
                  onChange={(e) => setEdit({ ...edit, reorderLevel: e.target.value })}
                />
              </Field>
            </div>
            <div style={{ marginTop: 12 }}>
              <Field label="Description">
                <Textarea
                  rows={2}
                  value={edit.description}
                  onChange={(e) => setEdit({ ...edit, description: e.target.value })}
                />
              </Field>
            </div>
            <div style={{ marginTop: 12 }}>
              <Field label="Photo">
                <ImageUploader
                  kind="materials"
                  label={edit.name || material.name}
                  value={edit.imageUrl}
                  onChange={(url) => setEdit({ ...edit, imageUrl: url })}
                  disabled={action.pending}
                />
              </Field>
            </div>
            <div className="vm-row" style={{ marginTop: 12 }}>
              <Button size="sm" onClick={saveEdit} disabled={action.pending}>
                {action.pending ? "Saving…" : "Save changes"}
              </Button>
              <Button variant="ghost" size="sm" onClick={cancelEditing} disabled={action.pending}>
                Cancel
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={action.pending}
                onClick={() => action.run(() => archiveMaterialAction(material.id, true))}
              >
                Archive
              </Button>
              <Button
                variant="danger"
                size="sm"
                disabled={action.pending}
                onClick={() => setConfirmDeleteMaterial(true)}
              >
                Delete
              </Button>
              <span className="vm-tiny vm-muted">
                Archiving keeps past costs intact; deleting is only possible before the material has
                been used.
              </span>
            </div>
          </td>
        </tr>
      ) : null}

      <ConfirmDialog
        open={confirmDeleteMaterial}
        title={`Delete ${material.name}?`}
        pending={action.pending}
        onCancel={() => setConfirmDeleteMaterial(false)}
        onConfirm={() =>
          action.run(
            () => deleteMaterialAction(material.id),
            () => setConfirmDeleteMaterial(false),
          )
        }
      >
        This removes the material and its purchase lots. Only possible if it has never been used in a
        craft — this can't be undone.
      </ConfirmDialog>

      <ConfirmDialog
        open={confirmDeleteBatchId !== null}
        title="Delete this purchase lot?"
        pending={action.pending}
        onCancel={() => setConfirmDeleteBatchId(null)}
        onConfirm={() => {
          const id = confirmDeleteBatchId;
          if (!id) return;
          action.run(
            () => deleteBatchAction(id),
            () => setConfirmDeleteBatchId(null),
          );
        }}
      >
        This removes the purchase record and its remaining stock. Only possible if none of it has been
        used yet — this can't be undone.
      </ConfirmDialog>
    </Fragment>
  );
}
