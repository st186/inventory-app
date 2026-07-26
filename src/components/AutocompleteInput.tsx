import { useId } from 'react';

type Props = {
  value: string;
  onChange: (value: string) => void;
  suggestions: string[];
  placeholder?: string;
  required?: boolean;
  className?: string;
};

// Native <input list> + <datalist> autocomplete — suggests, never restricts,
// so free-text entry still works for genuinely new descriptions.
export function AutocompleteInput({ value, onChange, suggestions, placeholder, required, className }: Props) {
  const listId = useId();
  const uniqueSuggestions = [...new Set(suggestions.map((s) => s.trim()).filter(Boolean))];

  return (
    <>
      <input
        type="text"
        list={listId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        className={className || 'w-full px-3 py-2 border border-gray-300 rounded-lg'}
      />
      <datalist id={listId}>
        {uniqueSuggestions.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
    </>
  );
}
