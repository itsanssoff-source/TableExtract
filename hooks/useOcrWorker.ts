import { useEffect, useRef, useState } from 'react';
import { getCloudflareContext } from "@opennextjs/cloudflare";

const STORAGE_KEY = 'tableextract_last_matrix';

export function useOcrWorker() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [resultMatrix, setResultMatrix] = useState<string[][] | null>(null);
  const workerRef = useRef<Worker | null>(null);

  useEffect(() => {
    // Instantiate worker using native Next.js-compatible URL syntax
    workerRef.current = new Worker(
      new URL('../workers/ocr.worker.ts', import.meta.url),
      { type: 'module' }
    );

    // Capture messages returning from the background thread
    workerRef.current.onmessage = (event: MessageEvent) => {
      const { status, matrix, error } = event.data;
      setIsProcessing(false);
      if (status === 'SUCCESS') {
        setResultMatrix(matrix);
        // Save to localStorage
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(matrix));
        } catch (e) {
          console.warn('Failed to save to localStorage:', e);
        }
      } else {
        console.error("OCR Error:", error);
      }
    };

    return () => {
      workerRef.current?.terminate();
    };
  }, []);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        setResultMatrix(JSON.parse(saved));
      }
    } catch (e) {
      console.warn('Failed to load from localStorage:', e);
    }
  }, []);

  const processImage = (imageBlob: Blob) => {
    if (!workerRef.current) return;
    setIsProcessing(true);
    workerRef.current.postMessage({ imageBlob });
  };

  const clearSavedMatrix = () => {
    try {
      localStorage.removeItem(STORAGE_KEY);
      setResultMatrix(null);
    } catch (e) {
      console.warn('Failed to clear localStorage:', e);
    }
  };

  return { processImage, isProcessing, resultMatrix, clearSavedMatrix };
}