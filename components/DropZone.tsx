'use client';

import React, { useEffect, useRef } from 'react';
import { UploadCloud } from 'lucide-react';

interface DropZoneProps {
    onImageCaptured: (blob: Blob) => void;
}

export default function DropZone({ onImageCaptured }: DropZoneProps) {
    // Reference for the hidden file input
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Handle click to open file browser
    const handleClick = () => {
        if (fileInputRef.current) {
            fileInputRef.current.click();
        }
    };

    // Handle manual file selection from the browser dialog
    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (files && files.length > 0) {
            const file = files[0];
            if (file.type.startsWith('image/')) {
                onImageCaptured(file);
            }
            // Reset the input value so the same file can be selected again if needed
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
        }
    };

    // Handle file drops manually
    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        const file = e.dataTransfer.files[0];
        if (file && file.type.startsWith('image/')) {
            onImageCaptured(file);
        }
    };

    // Intercept global clipboard pastes (Ctrl+V / Cmd+V)
    useEffect(() => {
        const handlePaste = (e: ClipboardEvent) => {
            const items = e.clipboardData?.items;
            if (!items) return;

            for (let i = 0; i < items.length; i++) {
                if (items[i].type.indexOf('image') !== -1) {
                    const blob = items[i].getAsFile();
                    if (blob) onImageCaptured(blob);
                }
            }
        };

        window.addEventListener('paste', handlePaste);
        return () => window.removeEventListener('paste', handlePaste);
    }, [onImageCaptured]);

    return (
        <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            onClick={handleClick}
            className="border-2 border-dashed border-slate-300 rounded-xl p-12 text-center hover:border-blue-500 transition-colors bg-white cursor-pointer"
        >
            <UploadCloud className="mx-auto h-12 w-12 text-slate-400 mb-4" />
            <p className="text-lg font-medium text-slate-700">
                Drag & drop a table, <span className="text-blue-600 font-semibold">Click to Browse</span>, or <span className="text-blue-600 font-semibold">Paste (Ctrl+V)</span>
            </p>
            <p className="text-xs text-slate-400 mt-2">Supports PNG, JPEG, and WebP copies</p>

            {/* Hidden file input */}
            <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept="image/*"
                className="hidden" // Tailwind class to completely hide the input
            />
        </div>
    );
}