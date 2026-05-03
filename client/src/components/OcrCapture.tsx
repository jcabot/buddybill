import { useState } from 'react';

export interface OcrResult {
  amount?: number;
  date?: string; // YYYY-MM-DD
  rawText: string;
}

interface Props {
  onResult: (r: OcrResult) => void;
}

/**
 * Lazy-loads tesseract.js only when the user actually uses OCR. Keeps the
 * main bundle small and the PWA precache lean.
 */
export function OcrCapture({ onResult }: Props) {
  const [progress, setProgress] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function run(file: File) {
    setErr(null);
    setProgress(0);
    try {
      const { recognize } = await import('tesseract.js');
      const result = await recognize(file, 'eng', {
        logger: (m) => {
          if (typeof m.progress === 'number') setProgress(m.progress);
        },
      });
      const text = result.data.text ?? '';
      onResult({ ...parseReceiptText(text), rawText: text });
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'OCR failed');
    } finally {
      setProgress(null);
    }
  }

  return (
    <div className="space-y-2">
      <label className="btn btn-ghost cursor-pointer w-full">
        <input
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) void run(file);
          }}
        />
        {progress === null ? '📷 Scan a receipt' : `Reading… ${Math.round(progress * 100)}%`}
      </label>
      {err && <p className="text-danger text-sm">{err}</p>}
      {progress === null && (
        <p className="text-xs text-muted">
          Photo stays on your device. We use it to prefill the form, then discard it.
        </p>
      )}
    </div>
  );
}

/**
 * Best-effort parsing of an OCR'd receipt. Picks the largest currency-shaped
 * number as the amount, and the first plausible date.
 */
export function parseReceiptText(text: string): { amount?: number; date?: string } {
  const out: { amount?: number; date?: string } = {};

  const amountRegex = /(?<![\w.])(?:\$|€|£)?\s?(\d{1,5}[.,]\d{2})(?!\d)/g;
  let match: RegExpExecArray | null;
  let largest = 0;
  while ((match = amountRegex.exec(text)) !== null) {
    const n = Number(match[1]!.replace(',', '.'));
    if (Number.isFinite(n) && n > largest) largest = n;
  }
  if (largest > 0) out.amount = largest;

  const dateRegex = /(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})|(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/;
  const m = dateRegex.exec(text);
  if (m) {
    let y: number, mo: number, d: number;
    if (m[1]) {
      y = Number(m[1]);
      mo = Number(m[2]);
      d = Number(m[3]);
    } else {
      d = Number(m[4]);
      mo = Number(m[5]);
      const yy = Number(m[6]);
      y = yy < 100 ? 2000 + yy : yy;
    }
    if (y >= 1990 && y <= 2100 && mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
      out.date = `${y.toString().padStart(4, '0')}-${mo.toString().padStart(2, '0')}-${d
        .toString()
        .padStart(2, '0')}`;
    }
  }
  return out;
}
