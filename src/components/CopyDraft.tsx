"use client";

import { useState } from 'react';

export default function CopyDraft({ text }: { text: string }) {
  const [status, setStatus] = useState('Copy draft');
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setStatus('Copied');
    } catch {
      setStatus('Copy failed — select the text above');
    }
  }
  return <button type="button" className="btn btn-primary" onClick={copy} aria-live="polite">{status}</button>;
}
