import { useEffect, useState } from 'react';

function formatBRL(value) {
  return (Number(value) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/**
 * Interpreta o que foi digitado no jeito brasileiro:
 * - vírgula é sempre decimal ("1.500,50" = 1500.5, "12,5" = 12.5);
 * - sem vírgula, ponto seguido de exatamente 3 dígitos é milhar
 *   ("1.500" = 1500, "1.250.000" = 1250000);
 * - sem vírgula, ponto com 1 ou 2 dígitos depois é decimal
 *   ("6.29" = 6.29 — teclado numérico do celular às vezes só tem ponto).
 */
export function parseBRL(text) {
  if (!text) return 0;
  let normalized;
  if (text.includes(',')) {
    const [inteiro, ...resto] = text.split(',');
    normalized = inteiro.replace(/\./g, '') + '.' + resto.join('');
  } else if (/^\d{1,3}(\.\d{3})+$/.test(text)) {
    normalized = text.replace(/\./g, '');
  } else {
    const lastDot = text.lastIndexOf('.');
    normalized =
      lastDot === -1 ? text : text.slice(0, lastDot).replace(/\./g, '') + '.' + text.slice(lastDot + 1);
  }
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
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
    const text = e.target.value.replace(/[^\d.,]/g, '');
    setRaw(text);
    onChange(parseBRL(text));
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
