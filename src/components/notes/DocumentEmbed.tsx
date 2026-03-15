import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import mammoth from 'mammoth';
import { useEffect, useRef, useState } from 'react';
import { pdfjsLib } from '../../lib/pdfjs';
import { UI } from '../../ui-strings';
import styles from './DocumentEmbed.module.css';

type DocumentEmbedAttrs = {
  fileName: string;
  fileType: 'pdf' | 'docx';
  dataUrl: string;
};

type PdfDocument = Awaited<ReturnType<typeof pdfjsLib.getDocument>['promise']>;

function PdfEmbedPreview({ attrs }: { attrs: DocumentEmbedAttrs }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [pageNumber, setPageNumber] = useState(1);
  const [pdfDocument, setPdfDocument] = useState<PdfDocument | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const loadingTask = pdfjsLib.getDocument(attrs.dataUrl);
        const loaded = await loadingTask.promise;

        if (cancelled) {
          await loaded.destroy();
          return;
        }

        setPdfDocument(loaded);
        setPageCount(loaded.numPages);
        setPageNumber(1);
        setError(null);
      } catch {
        if (!cancelled) {
          setError(UI.common.error);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
      setPdfDocument(null);
    };
  }, [attrs.dataUrl]);

  useEffect(() => {
    let cancelled = false;

    const renderPage = async () => {
      if (!pdfDocument || !canvasRef.current) {
        return;
      }

      try {
        const page = await pdfDocument.getPage(pageNumber);
        const viewport = page.getViewport({ scale: 1.25 });
        const canvas = canvasRef.current;
        const context = canvas.getContext('2d');

        if (!context) {
          return;
        }

        canvas.width = viewport.width;
        canvas.height = viewport.height;

        const renderTask = page.render({
          canvas,
          canvasContext: context,
          viewport,
        });

        await renderTask.promise;

        if (!cancelled) {
          setError(null);
        }
      } catch {
        if (!cancelled) {
          setError(UI.common.error);
        }
      }
    };

    void renderPage();

    return () => {
      cancelled = true;
    };
  }, [pdfDocument, pageNumber]);

  return (
    <div>
      <div className={styles.embedHeader}>
        <span className={styles.fileName}>{attrs.fileName}</span>
        <div className={styles.controls}>
          <button
            type="button"
            className={styles.controlButton}
            onClick={() => setPageNumber((current) => Math.max(1, current - 1))}
            disabled={pageNumber <= 1}
          >
            {UI.notes.embedPrev}
          </button>
          <span className={styles.pageLabel}>
            {UI.notes.embedPageOf(pageNumber, pageCount || 1)}
          </span>
          <button
            type="button"
            className={styles.controlButton}
            onClick={() =>
              setPageNumber((current) => Math.min(pageCount || 1, current + 1))
            }
            disabled={pageCount === 0 || pageNumber >= pageCount}
          >
            {UI.notes.embedNext}
          </button>
        </div>
      </div>

      <div className={styles.pdfCanvasWrap}>
        <canvas ref={canvasRef} className={styles.pdfCanvas} />
      </div>

      {error && <p className={styles.previewError}>{error}</p>}
    </div>
  );
}

function DocxEmbedPreview({ attrs }: { attrs: DocumentEmbedAttrs }) {
  const [html, setHtml] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const renderDocx = async () => {
      try {
        const response = await fetch(attrs.dataUrl);
        const arrayBuffer = await response.arrayBuffer();
        const result = await mammoth.convertToHtml({ arrayBuffer });

        if (!cancelled) {
          setHtml(result.value);
          setError(null);
        }
      } catch {
        if (!cancelled) {
          setError(UI.common.error);
        }
      }
    };

    void renderDocx();

    return () => {
      cancelled = true;
    };
  }, [attrs.dataUrl]);

  return (
    <div>
      <div className={styles.embedHeader}>
        <span className={styles.fileName}>{attrs.fileName}</span>
      </div>

      {error ? <p className={styles.previewError}>{error}</p> : null}

      {!error ? (
        <div
          className={styles.docxPreviewRoot}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ) : null}
    </div>
  );
}

export function DocumentEmbedNodeView({ node }: NodeViewProps) {
  const attrs = node.attrs as DocumentEmbedAttrs;

  return (
    <NodeViewWrapper className={styles.embedRoot} data-document-embed="true">
      {attrs.fileType === 'pdf' ? (
        <PdfEmbedPreview attrs={attrs} />
      ) : (
        <DocxEmbedPreview attrs={attrs} />
      )}
    </NodeViewWrapper>
  );
}
