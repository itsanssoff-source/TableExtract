import React, { useState } from 'react';
import { getCloudflareContext } from "@opennextjs/cloudflare";

interface TablePreviewProps {
    matrix: string[][];
}

export default function TablePreview({ matrix }: TablePreviewProps) {
    const [isCopied, setIsCopied] = useState(false);

    if (!matrix || matrix.length === 0) {
        return null;
    }

    const headers = matrix[0];
    const rows = matrix.slice(1);

    // The Magic Function: Converts the 2D array into Excel-pasteable text
    const handleCopy = async () => {
        // Join columns with a Tab (\t) and rows with a Newline (\n)
        const tsvData = matrix.map(row => row.join('\t')).join('\n');

        try {
            await navigator.clipboard.writeText(tsvData);
            setIsCopied(true);

            // Reset the button back to normal after 2 seconds
            setTimeout(() => setIsCopied(false), 2000);
        } catch (err) {
            console.error("Failed to copy table data: ", err);
            alert("Failed to copy to clipboard. Please check browser permissions.");
        }
    };

    return (
        <div className="w-full mt-4">
            {/* Action Bar (Copy Button) */}
            <div className="flex justify-end mb-3">
                <button
                    onClick={handleCopy}
                    className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 ${isCopied
                            ? 'bg-emerald-500 text-white hover:bg-emerald-600 focus:ring-emerald-500'
                            : 'bg-indigo-600 text-white hover:bg-indigo-700 focus:ring-indigo-500'
                        }`}
                >
                    {isCopied ? (
                        <>
                            {/* Checkmark Icon */}
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                            Copied!
                        </>
                    ) : (
                        <>
                            {/* Copy Clipboard Icon */}
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                            </svg>
                            Copy for Excel
                        </>
                    )}
                </button>
            </div>

            {/* The Table View */}
            <div className="overflow-x-auto rounded-lg border border-slate-200 shadow-sm">
                <table className="min-w-full divide-y divide-slate-200 text-sm text-left">
                    <thead className="bg-slate-100">
                        <tr>
                            {headers.map((header, index) => (
                                <th
                                    key={index}
                                    className="px-4 py-3 font-semibold text-slate-700 uppercase tracking-wider whitespace-nowrap"
                                >
                                    {header}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-slate-200">
                        {rows.map((row, rowIndex) => (
                            <tr key={rowIndex} className="hover:bg-slate-50 transition-colors">
                                {headers.map((_, cellIndex) => (
                                    <td
                                        key={cellIndex}
                                        className="px-4 py-3 text-slate-600 whitespace-nowrap"
                                    >
                                        {row[cellIndex] !== undefined && row[cellIndex] !== "" ? row[cellIndex] : "-"}
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}