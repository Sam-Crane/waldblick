import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { useToast } from '@/components/Toast';
import { useTranslation } from '@/i18n';

// Adds a QR code + "Write NFC tag" actions to the observation detail so
// the physical tree can be tagged for relocation:
//   QR  — everyone: print on weatherproof label, scan with any camera
//   NFC — Android Chrome only: write an NDEF URL record to a tag
//
// Scanning a written tag works OS-level on iPhone XS+ and Android 9+,
// no app code needed.

// Web NFC isn't in the TS DOM lib yet — declare what we use.
type NdefRecord = { recordType: string; data: string };
type NdefWriter = { write: (msg: { records: NdefRecord[] }) => Promise<void> };
type NdefCtor = new () => NdefWriter;
declare global {
  interface Window {
    NDEFReader?: NdefCtor;
  }
}

type Props = { observationId: string };

export default function TagActions({ observationId }: Props) {
  const t = useTranslation();
  const toast = useToast();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [url] = useState(() => `${window.location.origin}/observations/${observationId}`);
  const [nfcState, setNfcState] = useState<'idle' | 'waiting' | 'success' | 'error'>('idle');
  const nfcSupported = typeof window !== 'undefined' && 'NDEFReader' in window;

  // Render QR once on mount. 256×256 gives good print legibility
  // without blowing up the DOM.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    void QRCode.toCanvas(canvas, url, {
      width: 256,
      margin: 2,
      color: { dark: '#173124', light: '#ffffff' },
    });
  }, [url]);

  const downloadPng = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = `waldblick-${observationId.slice(0, 8)}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success(t('tag.urlCopied'));
    } catch {
      toast.error(t('tag.urlCopyFailed'));
    }
  };

  const writeNfc = async () => {
    const Ctor = window.NDEFReader;
    if (!Ctor) return;
    setNfcState('waiting');
    try {
      const writer = new Ctor();
      await writer.write({ records: [{ recordType: 'url', data: url }] });
      setNfcState('success');
      if ('vibrate' in navigator) navigator.vibrate(150);
      toast.success(t('tag.nfcWritten'));
      window.setTimeout(() => setNfcState('idle'), 3000);
    } catch (err) {
      setNfcState('error');
      const msg = (err as Error).name ?? 'unknown';
      toast.error(t('tag.nfcFailed', { error: msg }));
      window.setTimeout(() => setNfcState('idle'), 3000);
    }
  };

  return (
    <section className="rounded-xl border border-outline-variant bg-surface-container-lowest p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-label-sm uppercase tracking-widest text-outline">{t('tag.title')}</h3>
        <button
          onClick={copyUrl}
          className="flex items-center gap-1 text-label-sm font-semibold text-primary-container underline"
        >
          <span className="material-symbols-outlined text-[14px]">link</span>
          {t('tag.copyUrl')}
        </button>
      </div>

      <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start">
        <canvas
          ref={canvasRef}
          className="shrink-0 rounded-md border border-outline-variant"
          aria-label={t('tag.qrAlt')}
        />
        <div className="flex-1 space-y-3">
          <p className="text-label-md text-on-surface">{t('tag.hint')}</p>

          <button
            onClick={downloadPng}
            className="touch-safe flex w-full items-center justify-center gap-2 rounded-lg border-2 border-primary-container text-primary-container active:scale-95"
          >
            <span className="material-symbols-outlined">download</span>
            <span className="text-label-md font-semibold uppercase tracking-widest">
              {t('tag.downloadQr')}
            </span>
          </button>

          {nfcSupported ? (
            <button
              onClick={writeNfc}
              disabled={nfcState === 'waiting'}
              className="touch-safe flex w-full items-center justify-center gap-2 rounded-lg bg-primary text-on-primary active:scale-95 disabled:opacity-70"
            >
              <span
                className={`material-symbols-outlined ${nfcState === 'waiting' ? 'animate-pulse' : ''}`}
              >
                {nfcState === 'success' ? 'check_circle' : nfcState === 'error' ? 'error' : 'nfc'}
              </span>
              <span className="text-label-md font-semibold uppercase tracking-widest">
                {nfcState === 'waiting'
                  ? t('tag.nfcWaiting')
                  : nfcState === 'success'
                    ? t('tag.nfcSuccess')
                    : t('tag.writeNfc')}
              </span>
            </button>
          ) : (
            <p className="rounded-lg border border-outline-variant bg-surface-container-low p-3 text-label-sm text-outline">
              {t('tag.nfcUnsupported')}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
