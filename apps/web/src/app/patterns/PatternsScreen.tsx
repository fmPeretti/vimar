"use client";

import {
  centsFromInput,
  formatMinutes,
  formatMoney,
  formatQty,
  formatUnitCost,
  numberFromInput,
  type Pattern,
  type PatternCostLine,
} from "@vimar/core";
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  PageHeader,
  Panel,
  Select,
  Tag,
  TagToggle,
  Textarea,
} from "@vimar/ui";
import { useMemo, useState } from "react";
import { ImageUploader } from "@/components/ImageUploader";
import {
  archivePatternAction,
  deletePatternAction,
  savePatternAction,
} from "@/lib/actions/pattern-actions";
import { useAction } from "@/lib/use-action";
import { useAssetDisplayUrl } from "@/lib/use-asset-url";

export interface PatternMaterialDto {
  id: string;
  name: string;
  unit: string;
  unitCostCents: number;
  qtyOnHand: number;
}

export interface PatternViewDto {
  pattern: Pattern & { bom: Array<{ materialId: string; qty: number }>; tags: Array<{ id: string; name: string }> };
  totalCents: number;
  craftableUnits: number;
  lines: PatternCostLine[];
}

interface EditorState {
  id?: string;
  name: string;
  description: string;
  imageUrl: string;
  estimatedMinutes: string;
  salePrice: string;
  tagNames: string[];
  bom: Array<{ materialId: string; qty: string }>;
}

function blankEditor(firstMaterialId: string): EditorState {
  return {
    name: "",
    description: "",
    imageUrl: "",
    estimatedMinutes: "60",
    salePrice: "",
    tagNames: [],
    bom: firstMaterialId ? [{ materialId: firstMaterialId, qty: "1" }] : [],
  };
}

export function PatternsScreen({
  views,
  materials,
  allTags,
}: {
  views: PatternViewDto[];
  materials: PatternMaterialDto[];
  allTags: string[];
}) {
  const [editor, setEditor] = useState<EditorState | null>(null);
  const action = useAction();

  const openNew = () => {
    action.reset();
    setEditor(blankEditor(materials[0]?.id ?? ""));
  };

  const openEdit = (view: PatternViewDto) => {
    action.reset();
    setEditor({
      id: view.pattern.id,
      name: view.pattern.name,
      description: view.pattern.description ?? "",
      imageUrl: view.pattern.imageUrl ?? "",
      estimatedMinutes: String(view.pattern.estimatedMinutes),
      salePrice: (view.pattern.salePriceCents / 100).toFixed(2),
      tagNames: view.pattern.tags.map((t) => t.name),
      bom: view.pattern.bom.map((line) => ({ materialId: line.materialId, qty: String(line.qty) })),
    });
  };

  const save = () => {
    if (!editor) return;
    action.run(
      () =>
        savePatternAction({
          id: editor.id,
          name: editor.name,
          description: editor.description,
          imageUrl: editor.imageUrl,
          estimatedMinutes: numberFromInput(editor.estimatedMinutes, 0),
          salePriceCents: centsFromInput(editor.salePrice),
          tagNames: editor.tagNames,
          bom: editor.bom
            .filter((line) => line.materialId)
            .map((line) => ({ materialId: line.materialId, qty: numberFromInput(line.qty, 0) })),
        }),
      () => setEditor(null),
    );
  };

  return (
    <>
      <PageHeader title="Patterns" note="the recipes behind every plushie">
        <Button variant={editor ? "ghost" : "primary"} size="sm" onClick={editor ? () => setEditor(null) : openNew}>
          {editor ? "Close editor" : "+ New pattern"}
        </Button>
      </PageHeader>

      {action.error ? (
        <div style={{ marginBottom: 16 }}>
          <Alert tone="error">{action.error}</Alert>
        </div>
      ) : null}

      {materials.length === 0 ? (
        <Alert tone="warn" title="Add materials first">
          A pattern is a list of materials — add a few on the Materials screen and come back.
        </Alert>
      ) : null}

      {editor ? (
        <div style={{ marginBottom: 28 }}>
          <PatternEditor
            editor={editor}
            setEditor={setEditor}
            materials={materials}
            allTags={allTags}
            onSave={save}
            pending={action.pending}
          />
        </div>
      ) : null}

      {views.length === 0 ? (
        <EmptyState title="no patterns yet">
          <p className="vm-small">
            A pattern holds its bill of materials, how long it takes, its tags and its sale price.
          </p>
        </EmptyState>
      ) : (
        <div className="vm-grid">
          {views.map((view, index) => (
            <PatternCard
              key={view.pattern.id}
              view={view}
              index={index}
              onEdit={() => openEdit(view)}
              pending={action.pending}
              onArchive={() => action.run(() => archivePatternAction(view.pattern.id, true))}
              onDelete={() => action.run(() => deletePatternAction(view.pattern.id))}
            />
          ))}
        </div>
      )}
    </>
  );
}

function PatternCard({
  view,
  index,
  onEdit,
  onArchive,
  onDelete,
  pending,
}: {
  view: PatternViewDto;
  index: number;
  onEdit: () => void;
  onArchive: () => void;
  onDelete: () => void;
  pending: boolean;
}) {
  const { pattern, totalCents, craftableUnits } = view;
  const margin = pattern.salePriceCents - totalCents;
  const marginPct = pattern.salePriceCents > 0 ? (margin / pattern.salePriceCents) * 100 : null;
  const imageUrl = useAssetDisplayUrl(pattern.imageUrl);

  return (
    <div>
      <Card image={imageUrl} caption={pattern.name} tilt={index} />

      <div className="vm-chips" style={{ marginTop: 10 }}>
        {pattern.tags.map((tag) => (
          <Tag key={tag.id}>{tag.name}</Tag>
        ))}
      </div>

      <div className="vm-small" style={{ marginTop: 8, lineHeight: 1.7 }}>
        <div>
          Cost <b className="vm-num">{formatMoney(totalCents)}</b> · sells for{" "}
          <b className="vm-num">{formatMoney(pattern.salePriceCents)}</b>
        </div>
        <div className="vm-muted">
          Margin {formatMoney(margin)}
          {marginPct === null ? "" : ` (${marginPct.toFixed(0)}%)`} ·{" "}
          {formatMinutes(pattern.estimatedMinutes)}
        </div>
        <div className={craftableUnits === 0 ? "vm-muted" : undefined}>
          {craftableUnits === 0 ? (
            <Badge tone="burgundy">Can't make any</Badge>
          ) : (
            <span className="vm-muted">Stock covers {craftableUnits} more</span>
          )}
        </div>
      </div>

      <div className="vm-row" style={{ marginTop: 10 }}>
        <Button variant="ghost" size="sm" onClick={onEdit}>
          Edit
        </Button>
        <Button variant="ghost" size="sm" onClick={onArchive} disabled={pending}>
          Archive
        </Button>
        <Button variant="danger" size="sm" onClick={onDelete} disabled={pending}>
          Delete
        </Button>
      </div>
    </div>
  );
}

function PatternEditor({
  editor,
  setEditor,
  materials,
  allTags,
  onSave,
  pending,
}: {
  editor: EditorState;
  setEditor: (next: EditorState) => void;
  materials: PatternMaterialDto[];
  allTags: string[];
  onSave: () => void;
  pending: boolean;
}) {
  const [customTag, setCustomTag] = useState("");
  const byId = useMemo(() => new Map(materials.map((m) => [m.id, m])), [materials]);

  // Recomputed as you type so the cost of a recipe change is visible immediately.
  const costCents = editor.bom.reduce((sum, line) => {
    const material = byId.get(line.materialId);
    return material ? sum + material.unitCostCents * numberFromInput(line.qty, 0) : sum;
  }, 0);

  const salePriceCents = centsFromInput(editor.salePrice);
  const margin = salePriceCents - costCents;

  const setLine = (index: number, patch: Partial<{ materialId: string; qty: string }>) =>
    setEditor({
      ...editor,
      bom: editor.bom.map((line, i) => (i === index ? { ...line, ...patch } : line)),
    });

  const toggleTag = (name: string) =>
    setEditor({
      ...editor,
      tagNames: editor.tagNames.includes(name)
        ? editor.tagNames.filter((t) => t !== name)
        : [...editor.tagNames, name],
    });

  const addCustomTag = () => {
    const name = customTag.trim();
    if (!name || editor.tagNames.includes(name)) return;
    setEditor({ ...editor, tagNames: [...editor.tagNames, name] });
    setCustomTag("");
  };

  const tagVocabulary = [...new Set([...allTags, ...editor.tagNames])];

  return (
    <Panel
      title={editor.id ? `Edit ${editor.name || "pattern"}` : "New pattern"}
      footer={
        <>
          <Button size="sm" onClick={onSave} disabled={pending}>
            {pending ? "Saving…" : "Save pattern"}
          </Button>
          <span className="vm-small vm-muted">
            Standard cost <b className="vm-num">{formatMoney(costCents)}</b> · margin{" "}
            <b className="vm-num">{formatMoney(margin)}</b>
          </span>
        </>
      }
    >
      <div className="vm-form-grid">
        <Field label="Name">
          <Input
            value={editor.name}
            placeholder="Luma"
            onChange={(e) => setEditor({ ...editor, name: e.target.value })}
          />
        </Field>
        <Field label="Est. time" hint="Minutes per unit">
          <Input
            numeric
            inputMode="numeric"
            value={editor.estimatedMinutes}
            onChange={(e) => setEditor({ ...editor, estimatedMinutes: e.target.value })}
          />
        </Field>
        <Field label="Sale price" hint="Dollars">
          <Input
            numeric
            inputMode="decimal"
            value={editor.salePrice}
            placeholder="24.00"
            onChange={(e) => setEditor({ ...editor, salePrice: e.target.value })}
          />
        </Field>
      </div>

      <div style={{ marginTop: 16 }}>
        <Field label="Photo" hint="Shown on the pattern and inventory cards">
          <ImageUploader
            kind="patterns"
            label={editor.name || "pattern"}
            value={editor.imageUrl || null}
            onChange={(url) => setEditor({ ...editor, imageUrl: url ?? "" })}
            disabled={pending}
          />
        </Field>
      </div>

      <div style={{ marginTop: 16 }}>
        <Field label="Description">
          <Textarea
            rows={2}
            value={editor.description}
            placeholder="Star plushie with embroidered face."
            onChange={(e) => setEditor({ ...editor, description: e.target.value })}
          />
        </Field>
      </div>

      <hr className="vm-divider" />

      <Field label="Tags" hint="Tap to select, or type your own">
        <div className="vm-chips" style={{ marginBottom: 10 }}>
          {tagVocabulary.map((name) => (
            <TagToggle
              key={name}
              label={name}
              selected={editor.tagNames.includes(name)}
              onToggle={() => toggleTag(name)}
            />
          ))}
        </div>
      </Field>
      <div className="vm-row">
        <Input
          value={customTag}
          placeholder="New tag"
          style={{ width: 200 }}
          onChange={(e) => setCustomTag(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addCustomTag();
            }
          }}
        />
        <Button variant="ghost" size="sm" onClick={addCustomTag}>
          + Add tag
        </Button>
      </div>

      <hr className="vm-divider" />

      <div className="vm-row" style={{ justifyContent: "space-between" }}>
        <h3 className="vm-panel__title" style={{ margin: 0 }}>
          Bill of materials
        </h3>
        <span className="vm-small vm-muted">Quantities are per single unit</span>
      </div>

      <div className="vm-stack" style={{ marginTop: 12 }}>
        {editor.bom.map((line, index) => {
          const material = byId.get(line.materialId);
          const qty = numberFromInput(line.qty, 0);
          const lineCost = material ? material.unitCostCents * qty : 0;
          const short = material ? material.qtyOnHand < qty : false;

          return (
            <div key={index} className="vm-row" style={{ alignItems: "flex-end" }}>
              <Field label={index === 0 ? "Material" : undefined}>
                <Select
                  value={line.materialId}
                  onChange={(e) => setLine(index, { materialId: e.target.value })}
                  style={{ minWidth: 230 }}
                >
                  {materials.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={index === 0 ? "Qty per unit" : undefined}>
                <Input
                  numeric
                  inputMode="decimal"
                  value={line.qty}
                  style={{ width: 110 }}
                  onChange={(e) => setLine(index, { qty: e.target.value })}
                />
              </Field>
              <span className="vm-small vm-muted" style={{ paddingBottom: 12 }}>
                {material?.unit} · {formatUnitCost(material?.unitCostCents ?? 0)} each ={" "}
                <b className="vm-num">{formatMoney(lineCost)}</b>
                {short ? (
                  <span style={{ color: "var(--brand-secondary)" }}>
                    {" "}
                    · only {formatQty(material?.qtyOnHand ?? 0)} on hand
                  </span>
                ) : null}
              </span>
              <div style={{ paddingBottom: 6 }}>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() =>
                    setEditor({ ...editor, bom: editor.bom.filter((_, i) => i !== index) })
                  }
                >
                  Remove
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: 12 }}>
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            setEditor({
              ...editor,
              bom: [...editor.bom, { materialId: materials[0]?.id ?? "", qty: "1" }],
            })
          }
        >
          + Add material line
        </Button>
      </div>
    </Panel>
  );
}
