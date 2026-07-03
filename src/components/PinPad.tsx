import './PinPad.css';

interface PinPadProps {
  value: string;
  onChange: (next: string) => void;
  length?: number;
  disabled?: boolean;
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

/**
 * Large, high-contrast numeric PIN pad. Controlled: parent owns `value` and reacts
 * when it reaches `length`. Big tap targets so it works for Nonna too.
 */
export default function PinPad({
  value,
  onChange,
  length = 4,
  disabled = false,
}: PinPadProps) {
  const press = (digit: string) => {
    if (disabled || value.length >= length) return;
    onChange(value + digit);
  };
  const backspace = () => {
    if (disabled) return;
    onChange(value.slice(0, -1));
  };

  return (
    <div className="pinpad">
      <div className="pinpad__dots" aria-label={`${value.length} of ${length} digits`}>
        {Array.from({ length }).map((_, i) => (
          <span
            key={i}
            className={`pinpad__dot${i < value.length ? ' pinpad__dot--filled' : ''}`}
          />
        ))}
      </div>

      <div className="pinpad__grid">
        {KEYS.map((k) => (
          <button
            key={k}
            type="button"
            className="pinpad__key"
            onClick={() => press(k)}
            disabled={disabled}
          >
            {k}
          </button>
        ))}
        <span className="pinpad__key pinpad__key--empty" aria-hidden="true" />
        <button
          type="button"
          className="pinpad__key"
          onClick={() => press('0')}
          disabled={disabled}
        >
          0
        </button>
        <button
          type="button"
          className="pinpad__key pinpad__key--action"
          onClick={backspace}
          disabled={disabled || value.length === 0}
          aria-label="Delete last digit"
        >
          ⌫
        </button>
      </div>
    </div>
  );
}
