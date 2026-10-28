import * as React from "react";
import { AlertCircle } from "lucide-react@0.487.0";

import { cn } from "./utils";
import { useT } from "../../utils/i18n";

// A form field: label above (14 px medium), the control, then help text (12 px) or an error
// (12 px danger with an icon, role="alert"). Never a placeholder-only field.
//
//   <Field label="Amount paid" helper="₹200 a kg · usual price" error={errors.amount}>
//     <MoneyInput value={amount} onValueChange={setAmount} />
//   </Field>
//
// Input, Textarea, NativeSelect, MoneyInput, SelectTrigger and PickerField read the field's
// id, aria-describedby, aria-invalid and required from context, so nothing needs wiring.

type FieldContextValue = {
  id: string;
  describedBy?: string;
  invalid: boolean;
  required?: boolean;
  disabled?: boolean;
};

const FieldContext = React.createContext<FieldContextValue | null>(null);

export function useFieldContext() {
  return React.useContext(FieldContext);
}

/** Merges the surrounding Field's ids and state into a control's own props (own props win). */
export function useFieldControlProps<
  P extends {
    id?: string;
    "aria-describedby"?: string;
    "aria-invalid"?: React.AriaAttributes["aria-invalid"];
    required?: boolean;
    disabled?: boolean;
  },
>(props: P): P {
  const field = useFieldContext();
  if (!field) return props;
  return {
    ...props,
    id: props.id ?? field.id,
    "aria-describedby": [props["aria-describedby"], field.describedBy].filter(Boolean).join(" ") || undefined,
    "aria-invalid": props["aria-invalid"] ?? (field.invalid || undefined),
    required: props.required ?? field.required,
    disabled: props.disabled ?? field.disabled,
  };
}

export type FieldProps = {
  label: React.ReactNode;
  /** Small secondary text after the label, e.g. the Bengali word for a crew screen. */
  hint?: React.ReactNode;
  helper?: React.ReactNode;
  error?: React.ReactNode;
  required?: boolean;
  /** Shows "Optional" after the label. */
  optional?: boolean;
  disabled?: boolean;
  /** Id for the control; generated when left out. */
  id?: string;
  className?: string;
  /** Hide the label visually (still read out). Use only when the context makes it obvious. */
  hideLabel?: boolean;
  children: React.ReactNode;
};

function Field({
  label,
  hint,
  helper,
  error,
  required,
  optional,
  disabled,
  id,
  className,
  hideLabel,
  children,
}: FieldProps) {
  const { t } = useT();
  const autoId = React.useId();
  const controlId = id ?? `field-${autoId.replace(/:/g, "")}`;
  const messageId = `${controlId}-message`;
  const hasError = Boolean(error);
  const hasMessage = hasError || Boolean(helper);
  const value = React.useMemo<FieldContextValue>(
    () => ({
      id: controlId,
      describedBy: hasMessage ? messageId : undefined,
      invalid: hasError,
      required,
      disabled,
    }),
    [controlId, hasMessage, messageId, hasError, required, disabled],
  );

  return (
    <FieldContext.Provider value={value}>
      <div data-slot="field" className={cn("flex min-w-0 flex-col gap-1.5", className)}>
        <label
          htmlFor={controlId}
          className={cn("text-body-sm font-medium text-text", hideLabel && "sr-only", disabled && "text-text-3")}
        >
          {label}
          {hint && <span className="font-normal text-text-3"> · {hint}</span>}
          {optional && <span className="font-normal text-text-3"> · {t("common.optional")}</span>}
          {required && (
            <span className="text-danger" aria-hidden="true">
              {" "}*
            </span>
          )}
        </label>
        {children}
        {hasError ? (
          <p id={messageId} role="alert" className="flex items-start gap-1.5 text-caption text-danger">
            <AlertCircle className="mt-px size-4 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </p>
        ) : helper ? (
          <p id={messageId} className="text-caption text-text-3">
            {helper}
          </p>
        ) : null}
      </div>
    </FieldContext.Provider>
  );
}

/** Shared look of every text-like control (48 px, 16 px text, 2 px primary focus). */
export const controlClasses = cn(
  "h-12 w-full min-w-0 rounded-md border border-border-strong bg-surface px-3 text-body text-text",
  "placeholder:text-text-3 outline-none transition-[border-color,box-shadow] duration-(--dur-fast)",
  "focus:border-primary focus:ring-1 focus:ring-primary",
  "aria-[invalid=true]:border-danger aria-[invalid=true]:focus:ring-danger",
  "disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-text-disabled",
);

export { Field };
