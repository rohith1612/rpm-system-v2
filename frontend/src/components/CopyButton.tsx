import { useState } from 'react';

interface Props {
  text: string;
  className?: string;
}

export default function CopyButton({ text, className = '' }: Props) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  return (
    <button
      className={`copy-button-wire ${copied ? 'copied' : ''} ${className}`}
      onClick={handleCopy}
      title={copied ? "Copied!" : "Copy Cerner ID"}
      type="button"
      style={{
        background: 'none',
        border: 'none',
        padding: '2px',
        margin: '0 0 0 6px',
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'inherit',
        opacity: copied ? 1 : 0.4,
        verticalAlign: 'middle',
        transition: 'all 0.2s ease-in-out',
        borderRadius: '3px',
      }}
      onMouseEnter={(e) => {
        if (!copied) e.currentTarget.style.opacity = '0.9';
      }}
      onMouseLeave={(e) => {
        if (!copied) e.currentTarget.style.opacity = '0.4';
      }}
    >
      {copied ? (
        <svg
          viewBox="0 0 24 24"
          width="13"
          height="13"
          fill="none"
          stroke="var(--green)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="copied-svg-icon"
          style={{
            animation: 'copiedPulse 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275) both',
          }}
        >
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
      ) : (
        <svg
          viewBox="0 0 24 24"
          width="13"
          height="13"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="copy-svg-icon"
        >
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
        </svg>
      )}
    </button>
  );
}
