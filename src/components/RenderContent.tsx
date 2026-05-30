/**
 * RenderContent.tsx — Shared content renderer with image zoom lightbox
 * Parses Nostr text: images → <img> with zoom, links → <a>, rest → text spans
 */

import { useState, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

const IMAGE_EXTS = /\.(jpg|jpeg|png|gif|webp|svg|avif|bmp)(\?.*)?$/i;
const URL_RE = /(https?:\/\/[^\s<>"')\]]+)/g;

function isImageUrl(url: string) {
  return IMAGE_EXTS.test(url) || url.includes("nostr.build") || url.includes("imgur.com") || url.includes("i.imgur.com") || url.includes("pbs.twimg.com");
}

interface LightboxProps {
  src: string;
  onClose: () => void;
}

function Lightbox({ src, onClose }: LightboxProps) {
  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 10000,
        background: "rgba(0,0,0,0.92)", display: "flex",
        alignItems: "center", justifyContent: "center",
        padding: 24, cursor: "pointer",
        animation: "fadeIn 0.15s ease-out",
      }}
    >
      <button
        onClick={onClose}
        style={{
          position: "absolute", top: 16, right: 16,
          background: "rgba(255,255,255,0.1)", border: "none",
          borderRadius: "50%", width: 40, height: 40,
          display: "flex", alignItems: "center", justifyContent: "center",
          cursor: "pointer", color: "#fff", fontSize: 20,
        }}
      >
        <X size={24} />
      </button>
      <img
        src={src}
        alt=""
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: "100%", maxHeight: "100%",
          objectFit: "contain", borderRadius: 8,
          cursor: "default",
        }}
      />
    </div>,
    document.body,
  );
}

interface RenderContentProps {
  text: string;
  /** Max image height in px (default 500) */
  maxImageHeight?: number;
}

export default function RenderContent({ text, maxImageHeight = 500 }: RenderContentProps) {
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const openLightbox = useCallback((src: string) => setLightboxSrc(src), []);
  const closeLightbox = useCallback(() => setLightboxSrc(null), []);

  const parts: (string | { url: string; isImage: boolean })[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  URL_RE.lastIndex = 0;
  while ((match = URL_RE.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    const url = match[1];
    parts.push({ url, isImage: isImageUrl(url) });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return (
    <>
      {parts.map((part, i) => {
        if (typeof part === "string") {
          return <span key={i} style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{part}</span>;
        }
        if (part.isImage) {
          return (
            <div key={i} style={{ marginTop: 8, borderRadius: 8, overflow: "hidden", border: "1px solid var(--surface-border)" }}>
              <img
                src={part.url}
                alt=""
                loading="lazy"
                onClick={() => openLightbox(part.url)}
                style={{
                  width: "100%", maxHeight: maxImageHeight, objectFit: "cover",
                  display: "block", cursor: "zoom-in",
                }}
                onError={(e) => { (e.currentTarget.style.display = "none"); }}
              />
            </div>
          );
        }
        return (
          <a key={i} href={part.url} target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)", wordBreak: "break-word" }}>
            {part.url}
          </a>
        );
      })}
      {lightboxSrc && <Lightbox src={lightboxSrc} onClose={closeLightbox} />}
    </>
  );
}
