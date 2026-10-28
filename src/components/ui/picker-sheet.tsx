import * as React from "react";
import { Check, ChevronDown, Plus, Search } from "lucide-react@0.487.0";

import { cn } from "./utils";
import { Button } from "./button";
import { Checkbox } from "./checkbox";
import { Input } from "./input";
import { ResponsiveModal } from "./responsive-modal";
import { controlClasses, useFieldControlProps } from "./field";
import { useT } from "../../utils/i18n";

// Searchable picker for long lists (items, employees, categories) instead of a native <select>.
// Opens as a bottom sheet on phones / dialog on desktop, with a search box on top.
//
//   <Field label="What was it for?">
//     <PickerField title="Choose an item" items={items} value={itemId} onValueChange={setItemId}
//       placeholder="Search items" onCreate={(q) => addItem(q)} />
//   </Field>
//
// Or drive the sheet yourself: <PickerSheet open={...} onOpenChange={...} items={...} onSelect={...} />

export type PickerItem = {
  value: string;
  label: string;
  /** Second line (unit, role, last price). */
  description?: string;
  /** Extra words that should match the search (Bengali name, code). */
  keywords?: string;
  /** Group heading the item sits under. */
  group?: string;
  disabled?: boolean;
};

type PickerBaseProps = {
  title: React.ReactNode;
  items: PickerItem[];
  searchPlaceholder?: string;
  /** Shown when nothing matches. */
  emptyText?: string;
  /** Offer "Add “text”" when the search has no exact match. */
  onCreate?: (query: string) => void;
  /** Most rows rendered at once (keeps old phones quick). */
  limit?: number;
};

export type PickerSheetProps = PickerBaseProps & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
} & (
    | { multiple?: false; value?: string | null; onSelect: (value: string, item: PickerItem) => void; onChange?: never }
    | { multiple: true; value?: string[]; onChange: (values: string[]) => void; onSelect?: never }
  );

function normalise(text: string) {
  return text.toLocaleLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").trim();
}

function PickerSheet(props: PickerSheetProps) {
  const { open, onOpenChange, title, items, searchPlaceholder, emptyText, onCreate, limit = 200 } = props;
  const { t } = useT();
  const [query, setQuery] = React.useState("");
  const [picked, setPicked] = React.useState<string[]>([]);
  const searchRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (!open) return;
    setQuery("");
    if (props.multiple) setPicked(props.value ?? []);
    // focus the search box once the sheet is in place (long lists only)
    if (items.length > 8) window.setTimeout(() => searchRef.current?.focus(), 150);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const q = normalise(query);
  const matches = React.useMemo(
    () => (q ? items.filter((it) => normalise(`${it.label} ${it.description ?? ""} ${it.keywords ?? ""}`).includes(q)) : items),
    [items, q],
  );
  const shown = matches.slice(0, limit);
  const exact = q && items.some((it) => normalise(it.label) === q);

  const groups: { name: string | undefined; items: PickerItem[] }[] = [];
  for (const item of shown) {
    const last = groups[groups.length - 1];
    if (last && last.name === item.group) last.items.push(item);
    else groups.push({ name: item.group, items: [item] });
  }

  const isSelected = (value: string) => (props.multiple ? picked.includes(value) : props.value === value);

  const choose = (item: PickerItem) => {
    if (props.multiple) {
      setPicked((prev) => (prev.includes(item.value) ? prev.filter((v) => v !== item.value) : [...prev, item.value]));
    } else {
      props.onSelect(item.value, item);
      onOpenChange(false);
    }
  };

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      bodyClassName="pt-0"
      footer={
        props.multiple ? (
          <>
            <span className="num flex flex-1 items-center text-body-sm text-text-2">{t("common.selectedCount", { n: picked.length })}</span>
            <Button
              size="lg"
              onClick={() => {
                props.onChange(picked);
                onOpenChange(false);
              }}
            >
              {t("common.done")}
            </Button>
          </>
        ) : undefined
      }
    >
      <div className="sticky top-0 z-10 -mx-4 bg-bg px-4 pt-1 pb-3 md:-mx-6 md:px-6">
        <Input
          ref={searchRef}
          type="search"
          enterKeyHint="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={searchPlaceholder ?? t("common.search")}
          aria-label={searchPlaceholder ?? t("common.search")}
          leading={<Search aria-hidden="true" />}
        />
      </div>

      {onCreate && q && !exact && (
        <button
          type="button"
          onClick={() => {
            onCreate(query.trim());
            onOpenChange(false);
          }}
          className="mb-3 flex min-h-13 w-full items-center gap-3 rounded-lg border border-dashed border-border-strong bg-surface px-4 text-left text-body-md font-medium text-primary outline-none hover:bg-primary-soft focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Plus className="size-5 shrink-0" aria-hidden="true" />
          {t("common.addNew", { q: query.trim() })}
        </button>
      )}

      {shown.length === 0 ? (
        <p className="px-1 py-8 text-center text-body-sm text-text-2">{emptyText ?? t("common.noResults", { q: query.trim() })}</p>
      ) : (
        <div className="flex flex-col gap-4" role="listbox" aria-multiselectable={props.multiple || undefined} aria-label={typeof title === "string" ? title : undefined}>
          {groups.map((group, gi) => (
            <div key={`${group.name ?? ""}-${gi}`} role="group" aria-label={group.name}>
              {group.name && <p className="overline-label mx-1 mb-2">{group.name}</p>}
              <div className="overflow-hidden rounded-lg border border-border bg-surface [&>*+*]:border-t [&>*+*]:border-border">
                {group.items.map((item) => {
                  const selected = isSelected(item.value);
                  return (
                    <div
                      key={item.value}
                      role="option"
                      aria-selected={selected}
                      aria-disabled={item.disabled || undefined}
                      tabIndex={item.disabled ? -1 : 0}
                      onClick={() => !item.disabled && choose(item)}
                      onKeyDown={(e) => {
                        if ((e.key === "Enter" || e.key === " ") && !item.disabled) {
                          e.preventDefault();
                          choose(item);
                        }
                      }}
                      className={cn(
                        "flex min-h-13 cursor-pointer items-center gap-3 px-4 py-2 outline-none",
                        "hover:bg-surface-2/60 active:bg-surface-2 focus-visible:bg-surface-2 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                        item.disabled && "cursor-not-allowed opacity-50",
                      )}
                    >
                      {props.multiple && <Checkbox checked={selected} tabIndex={-1} aria-hidden="true" className="pointer-events-none" />}
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className={cn("text-body-md text-text", selected ? "font-semibold" : "font-medium")}>{item.label}</span>
                        {item.description && <span className="text-label text-text-3">{item.description}</span>}
                      </span>
                      {!props.multiple && selected && <Check className="size-5 shrink-0 text-primary" aria-hidden="true" />}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          {matches.length > shown.length && (
            <p className="px-1 text-center text-label text-text-3">{t("common.typeToNarrow", { n: shown.length })}</p>
          )}
        </div>
      )}
    </ResponsiveModal>
  );
}

export type PickerFieldProps = PickerBaseProps & {
  value: string | null | undefined;
  onValueChange: (value: string, item: PickerItem) => void;
  /** Text shown when nothing is chosen. */
  placeholder?: string;
  disabled?: boolean;
  id?: string;
  className?: string;
  /** Leading icon inside the field (e.g. a search icon). */
  leadingIcon?: React.ReactNode;
};

/** Looks like an input (48 px); tapping opens the PickerSheet. */
function PickerField({ value, onValueChange, placeholder, disabled, id, className, leadingIcon, ...pickerProps }: PickerFieldProps) {
  const { t } = useT();
  const [open, setOpen] = React.useState(false);
  const control = useFieldControlProps({ id, disabled } as { id?: string; disabled?: boolean; "aria-describedby"?: string; "aria-invalid"?: boolean; required?: boolean });
  const selected = pickerProps.items.find((it) => it.value === value);

  return (
    <>
      <button
        type="button"
        id={control.id}
        disabled={control.disabled}
        aria-haspopup="dialog"
        aria-describedby={control["aria-describedby"]}
        aria-invalid={control["aria-invalid"]}
        onClick={() => setOpen(true)}
        className={cn(controlClasses, "flex items-center gap-2 text-left", className)}
      >
        {leadingIcon && <span className="flex shrink-0 text-text-3 [&_svg]:size-5">{leadingIcon}</span>}
        <span className={cn("min-w-0 flex-1 truncate", selected ? "text-text" : "text-text-3")}>
          {selected ? selected.label : placeholder ?? t("common.select")}
        </span>
        <ChevronDown className="size-5 shrink-0 text-text-3" aria-hidden="true" />
      </button>
      <PickerSheet {...pickerProps} open={open} onOpenChange={setOpen} value={value ?? null} onSelect={onValueChange} />
    </>
  );
}

export { PickerSheet, PickerField };
