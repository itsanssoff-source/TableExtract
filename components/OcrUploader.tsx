'use client';
import React, { useState } from 'react';

interface OcrUploaderProps {
  onImageCaptured: (file: Blob) => void;
}

export default function OcrUploader({ onImageCaptured }: OcrUploaderProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // 1. Clean up old preview URLs to save memory
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
      
      // 2. Set the new preview image
      setPreviewUrl(URL.createObjectURL(file));
      
      // 3. Send the file to your existing useOcrWorker hook!
      onImageCaptured(file);
    }
  };

  return (
    <div className="flex flex-col items-center space-y-4 my-6">
      <input 
        type="file" 
        accept="image/*" 
        onChange={handleFileChange} 
        className="block w-full max-w-sm text-sm text-slate-500
          file:mr-4 file:py-2 file:px-4
          file:rounded-full file:border-0
          file:text-sm file:font-semibold
          file:bg-indigo-50 file:text-indigo-700
          hover:file:bg-indigo-100"
      />

      <div className="p-4 border-2 border-dashed border-slate-300 rounded-lg inline-block text-center bg-white w-full max-w-md">
        <h4 className="m-0 mb-3 text-sm font-semibold text-slate-600">OCR Processing Preview</h4>
        
        {previewUrl ? (
          <img 
            src={previewUrl} 
            className="max-w-full max-h-64 object-contain mx-auto rounded border border-slate-200" 
            alt="OCR Target Grid" 
          />
        ) : (
          <p className="m-0 text-slate-400 text-sm py-8">No image uploaded yet</p>
        )}
      </div>
    </div>
  );
}