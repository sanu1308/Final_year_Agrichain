import React, { useEffect, useState, useRef } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { useNavigate } from 'react-router-dom';
import { X, Camera, ArrowRight } from 'lucide-react';

export const QRScannerModal = ({
  isOpen,
  onClose,
  onScanSuccess,
}) => {
  const navigate = useNavigate();
  const [manualInput, setManualInput] = useState('');
  const [scanError, setScanError] = useState(null);
  const scannerRef = useRef(null);

  useEffect(() => {
    if (!isOpen) {
      if (scannerRef.current) {
        scannerRef.current.clear().catch(console.error);
        scannerRef.current = null;
      }
      return;
    }

    const timer = setTimeout(() => {
      try {
        const scanner = new Html5QrcodeScanner(
          'qr-reader-container',
          {
            fps: 10,
            qrbox: { width: 250, height: 250 },
            rememberLastUsedCamera: true,
          },
          false
        );

        scanner.render(
          (decodedText) => {
            scanner.clear().catch(console.error);
            handleDecodedText(decodedText);
          },
          (errorMessage) => {
            // non-fatal scanning noise
          }
        );

        scannerRef.current = scanner;
      } catch (err) {
        setScanError('Could not initialize camera. You can use manual entry below.');
      }
    }, 200);

    return () => {
      clearTimeout(timer);
      if (scannerRef.current) {
        scannerRef.current.clear().catch(console.error);
        scannerRef.current = null;
      }
    };
  }, [isOpen]);

  const handleDecodedText = (text) => {
    // If URL like http://localhost:5173/verify/1 or https://agrichain.app/verify/1
    let extractedId = text.trim();
    if (extractedId.includes('/verify/')) {
      const parts = extractedId.split('/verify/');
      extractedId = parts[1].split('?')[0].split('/')[0];
    }

    if (onScanSuccess) {
      onScanSuccess(extractedId);
      onClose();
    } else {
      onClose();
      navigate(`/verify/${extractedId}`);
    }
  };

  const handleManualSubmit = (e) => {
    e.preventDefault();
    if (!manualInput.trim()) return;
    handleDecodedText(manualInput);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-lg overflow-hidden bg-white rounded-2xl shadow-2xl border border-slate-100">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50">
          <div className="flex items-center space-x-2">
            <div className="p-2 bg-emerald-100 rounded-lg text-emerald-800">
              <Camera className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-800">Scan Produce QR Code</h3>
              <p className="text-xs text-slate-500">Scan crate tag or shelf label for verification</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-200 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scanner Body */}
        <div className="p-6">
          <div
            id="qr-reader-container"
            className="w-full overflow-hidden rounded-xl bg-slate-950 min-h-[260px] flex items-center justify-center text-slate-400 text-sm"
          ></div>

          {scanError && (
            <p className="mt-2 text-xs text-amber-600 text-center">{scanError}</p>
          )}

          {/* Quick Manual / URL Fallback */}
          <div className="mt-6 pt-4 border-t border-slate-100">
            <label className="block text-xs font-semibold text-slate-600 mb-2">
              Or enter Batch ID / Verification Link directly:
            </label>
            <form onSubmit={handleManualSubmit} className="flex gap-2">
              <input
                type="text"
                value={manualInput}
                onChange={(e) => setManualInput(e.target.value)}
                placeholder="e.g. 1 or paste full link"
                className="flex-1 px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <button
                type="submit"
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-lg flex items-center gap-1.5 transition shadow-sm"
              >
                Go <ArrowRight className="w-4 h-4" />
              </button>
            </form>
            <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
              <span>Quick Test:</span>
              <button
                type="button"
                onClick={() => handleDecodedText('1')}
                className="font-medium text-emerald-700 hover:underline"
              >
                Test with Demo Batch #1 (Alphonso Mangoes)
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
