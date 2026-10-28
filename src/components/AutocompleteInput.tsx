import { useId } from 'react';
import { controlClasses, useFieldControlProps } from './ui/field';

type Props = {
  value: string;
  onChange: (value: string) => void;
  suggestions: string[];
  placeholder?: string;
  required?: boolean;
  className?: string;
};

// Native <input list> + <datalist> autocomplete — suggests, never restricts,
// so free-text entry still works for genuinely new descriptions. Looks like every other field
// (48 px, 16 px text); inside a <Field> it picks up the label, help and error wiring.
export function AutocompleteInput({ value, onChange, suggestions, placeholder, required, className }: Props) {
  const listId = useId();
  const uniqueSuggestions = [...new Set(suggestions.map((s) => s.trim()).filter(Boolean))];
  const field = useFieldControlProps({ required } as { required?: boolean; id?: string; 'aria-describedby'?: string; 'aria-invalid'?: boolean; disabled?: boolean });

  return (
    <>
      <input
        type="text"
        list={listId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        {...field}
        className={className || controlClasses}
      />
      <datalist id={listId}>
        {uniqueSuggestions.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
    </>
  );
}
