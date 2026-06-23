'use client';

import { useState, useEffect } from 'react';
import DropZone from '@/components/DropZone';
import { useOcrWorker } from '@/hooks/useOcrWorker';
import TablePreview from '@/components/TablePreview';

export default function Home() {
  const { processImage, isProcessing, resultMatrix, clearSavedMatrix } = useOcrWorker();

  // 1. Manage the preview URL here at the very top level
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isRestoredFromCache, setIsRestoredFromCache] = useState(false);

  // 2. Create a single handler for any image upload
  const handleImageSubmit = (file: Blob) => {
    // Clean up the old preview to save browser memory
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }

    // Generate the new preview URL and show it
    const newUrl = URL.createObjectURL(file);
    setPreviewUrl(newUrl);

    // Clear the cache restore indicator
    setIsRestoredFromCache(false);

    // Send it to your background worker
    processImage(file);
  };

  // Track when data is restored from localStorage
  useEffect(() => {
    if (resultMatrix && !isProcessing && !previewUrl) {
      setIsRestoredFromCache(true);
    } else {
      setIsRestoredFromCache(false);
    }
  }, [resultMatrix, isProcessing, previewUrl])

  // Prevent memory leaks when the user leaves the page
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  return (
    <main className="min-h-screen bg-slate-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto space-y-8">
        <div className="text-center">
          <h1 className="text-4xl font-extrabold text-slate-900 tracking-tight">TableExtract</h1>
          <p className="mt-2 text-md text-slate-600">Convert table images to structured spreadsheets locally on your browser.</p>
        </div>

        {/* 3. Pass the unified handler to your DropZone */}
        <DropZone onImageCaptured={handleImageSubmit} />

        {/* 4. The Image Preview Window */}
        {previewUrl && (
          <div className="p-4 border-2 border-slate-200 rounded-lg inline-block text-center bg-white w-full shadow-sm">
            <h4 className="m-0 mb-3 text-sm font-semibold text-slate-600">Processing Preview</h4>
            <img
              src={previewUrl}
              className="max-w-full max-h-64 object-contain mx-auto rounded border border-slate-200"
              alt="OCR Target"
            />
          </div>
        )}

        {isProcessing && (
          <div className="text-center text-slate-600 py-4 animate-pulse">
            Spawning WASM threads and aligning cell spatial data...
          </div>
        )}

        {resultMatrix && (
          <div className="bg-white shadow rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-800">Parsed Matrix Extraction Complete</h2>
                {isRestoredFromCache && (
                  <p className="text-sm text-blue-600 mt-1">✓ Restored from your browser cache</p>
                )}
              </div>
              <button
                onClick={() => {
                  clearSavedMatrix();
                  setPreviewUrl(null);
                }}
                className="px-3 py-2 text-sm bg-slate-100 hover:bg-slate-200 text-slate-700 rounded transition-colors"
              >
                Clear
              </button>
            </div>
            <TablePreview matrix={resultMatrix} />
          </div>
        )}
      </div>
    </main>
  );
}