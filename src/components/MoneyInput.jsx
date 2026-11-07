import { useEffect, useState } from 'react';

function formatBRL(value) {
  return (Number(value) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function toEditableText(value) {
  if (value === '' || value === null || value === undefined) return '';
  return String(value).replace('.', ',');
}

/**
 * Campo de valor em reais: mostra formatado ("R$ 1.500,50") quando não está
 * em foco, e vira edição livre (dígitos + vírgula decimal) ao tocar nele —
 * evita o usuário ter que lidar com ponto/vírgula misturado com "R$" e
 * separador de milhar enquanto digita. `value`/`onChange` trabalham em
 * reais (número), não em string.
 */
export default function MoneyInput({ value, onChange, onFocus, onBlur, ...rest }) {
  const [focused, setFocused] = useState(false);
  const [raw, setRaw] = useState(() => toEditableText(value));

  useEffect(() => {
    if (!focused) setRaw(toEditableText(value));
  }, [value, focused]);

  function handleChange(e) {
    let text = e.target.value.replace(/[^\d.,]/g, '').replace(/\./g, ',');
    const firstComma = text.indexOf(',');
    if (firstComma !== -1) {
      text = text.slice(0, firstComma + 1) + text.slice(firstComma + 1).replace(/,/g, '');
    }
    setRaw(text);
    const numeric = Number(text.replace(',', '.'));
    onChange(Number.isFinite(numeric) ? numeric : 0);
  }

  function handleFocus(e) {
    setFocused(true);
    setRaw(toEditableText(value));
    onFocus?.(e);
  }

  function handleBlur(e) {
    setFocused(false);
    onBlur?.(e);
  }

  return (
    <input
      type="text"
      inputMode="decimal"
      value={focused ? raw : formatBRL(value)}
      onChange={handleChange}
      onFocus={handleFocus}
      onBlur={handleBlur}
      {...rest}
    />
  );
}
