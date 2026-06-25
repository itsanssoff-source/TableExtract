/// <reference lib="webworker" />

import { createWorker, PSM } from 'tesseract.js';
import { getCloudflareContext } from "@opennextjs/cloudflare";

declare const self: DedicatedWorkerGlobalScope;

// --- IMAGE PROCESSING HELPERS ---

function otsuThreshold(gray: Uint8Array): number {
  const hist = new Int32Array(256);
  for (let i = 0; i < gray.length; i++) {
    hist[gray[i]]++;
  }
  
  const total = gray.length;
  let sum = 0;
  for (let t = 0; t < 256; t++) {
    sum += t * hist[t];
  }
  
  let sumB = 0;
  let wB = 0;
  let wF = 0;
  let varMax = 0;
  let threshold = 127;
  
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    wF = total - wB;
    if (wF === 0) break;
    
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    
    const varBetween = wB * wF * (mB - mF) * (mB - mF);
    if (varBetween > varMax) {
      varMax = varBetween;
      threshold = t;
    }
  }
  return threshold;
}

function adaptiveThreshold(gray: Uint8Array, width: number, height: number, S: number, C: number): Uint8Array {
  const binary = new Uint8Array(width * height);
  const integral = new Int32Array(width * height);

  // 1. Compute integral image
  for (let y = 0; y < height; y++) {
    let sum = 0;
    const rowOffset = y * width;
    const prevRowOffset = (y - 1) * width;
    for (let x = 0; x < width; x++) {
      sum += gray[rowOffset + x];
      if (y === 0) {
        integral[rowOffset + x] = sum;
      } else {
        integral[rowOffset + x] = integral[prevRowOffset + x] + sum;
      }
    }
  }

  // 2. Perform adaptive thresholding
  const halfS = Math.floor(S / 2);
  for (let y = 0; y < height; y++) {
    const rowOffset = y * width;
    for (let x = 0; x < width; x++) {
      const x0 = Math.max(0, x - halfS);
      const y0 = Math.max(0, y - halfS);
      const x1 = Math.min(width - 1, x + halfS);
      const y1 = Math.min(height - 1, y + halfS);

      const count = (x1 - x0 + 1) * (y1 - y0 + 1);

      let sum = integral[y1 * width + x1];
      if (x0 > 0) sum -= integral[y1 * width + (x0 - 1)];
      if (y0 > 0) sum -= integral[(y0 - 1) * width + x1];
      if (x0 > 0 && y0 > 0) sum += integral[(y0 - 1) * width + (x0 - 1)];

      const mean = sum / count;
      binary[rowOffset + x] = gray[rowOffset + x] < (mean - C) ? 1 : 0;
    }
  }

  return binary;
}

function preprocessCell(cellImageData: ImageData): boolean {
  const data = cellImageData.data;
  const len = data.length;

  // 1. Grayscale & average intensity
  const gray = new Uint8Array(len / 4);
  let sumGray = 0;
  for (let i = 0; i < len; i += 4) {
    const g = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
    gray[i / 4] = g;
    sumGray += g;
  }

  const avgGray = sumGray / gray.length;

  // 2. Calculate standard deviation to detect empty cells
  let sumSqDiff = 0;
  for (let i = 0; i < gray.length; i++) {
    const diff = gray[i] - avgGray;
    sumSqDiff += diff * diff;
  }
  const stdDev = Math.sqrt(sumSqDiff / gray.length);

  // If variance is very low, the cell is empty/blank
  if (stdDev < 5) {
    for (let i = 0; i < len; i += 4) {
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
      data[i + 3] = 255;
    }
    return true; // Is empty
  }

  // 3. Local Binarization using Otsu
  const thresh = otsuThreshold(gray);
  
  let blackCount = 0;
  const binary = new Uint8Array(gray.length);
  for (let i = 0; i < gray.length; i++) {
    if (gray[i] < thresh) {
      binary[i] = 0;
      blackCount++;
    } else {
      binary[i] = 255;
    }
  }

  // 4. Invert if the background is dark (i.e. black pixels make up the majority)
  const shouldInvert = blackCount > (gray.length / 2);

  for (let i = 0; i < len; i += 4) {
    const idx = i / 4;
    let val = binary[idx];
    if (shouldInvert) {
      val = val === 0 ? 255 : 0;
    }
    data[i] = val;
    data[i + 1] = val;
    data[i + 2] = val;
    data[i + 3] = 255;
  }

  return false; // Is not empty
}

function erodeHorizontal(binary: Uint8Array, width: number, height: number, L_h: number): Uint8Array {
  const output = new Uint8Array(width * height);
  const half = Math.floor(L_h / 2);
  for (let y = 0; y < height; y++) {
    const rowOffset = y * width;
    for (let x = 0; x < width; x++) {
      let allOn = true;
      for (let k = -half; k <= half; k++) {
        const nx = x + k;
        if (nx < 0 || nx >= width) {
          allOn = false;
          break;
        }
        if (binary[rowOffset + nx] === 0) {
          allOn = false;
          break;
        }
      }
      output[rowOffset + x] = allOn ? 1 : 0;
    }
  }
  return output;
}

function dilateHorizontal(eroded: Uint8Array, width: number, height: number, L_h: number): Uint8Array {
  const output = new Uint8Array(width * height);
  const half = Math.floor(L_h / 2);
  for (let y = 0; y < height; y++) {
    const rowOffset = y * width;
    for (let x = 0; x < width; x++) {
      let anyOn = false;
      for (let k = -half; k <= half; k++) {
        const nx = x + k;
        if (nx >= 0 && nx < width && eroded[rowOffset + nx] === 1) {
          anyOn = true;
          break;
        }
      }
      output[rowOffset + x] = anyOn ? 1 : 0;
    }
  }
  return output;
}

function erodeVertical(binary: Uint8Array, width: number, height: number, L_v: number): Uint8Array {
  const output = new Uint8Array(width * height);
  const half = Math.floor(L_v / 2);
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      let allOn = true;
      for (let k = -half; k <= half; k++) {
        const ny = y + k;
        if (ny < 0 || ny >= height) {
          allOn = false;
          break;
        }
        if (binary[ny * width + x] === 0) {
          allOn = false;
          break;
        }
      }
      output[y * width + x] = allOn ? 1 : 0;
    }
  }
  return output;
}

function dilateVertical(eroded: Uint8Array, width: number, height: number, L_v: number): Uint8Array {
  const output = new Uint8Array(width * height);
  const half = Math.floor(L_v / 2);
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      let anyOn = false;
      for (let k = -half; k <= half; k++) {
        const ny = y + k;
        if (ny >= 0 && ny < height && eroded[ny * width + x] === 1) {
          anyOn = true;
          break;
        }
      }
      output[y * width + x] = anyOn ? 1 : 0;
    }
  }
  return output;
}

function getGridLines(densities: Float32Array, threshold: number, mergeTolerance: number): number[] {
  const lines: number[] = [];
  let inLine = false;
  let lineSum = 0;
  let lineCount = 0;

  for (let i = 0; i < densities.length; i++) {
    if (densities[i] > threshold) {
      lineSum += i;
      lineCount++;
      inLine = true;
    } else {
      if (inLine) {
        lines.push(Math.round(lineSum / lineCount));
        lineSum = 0;
        lineCount = 0;
        inLine = false;
      }
    }
  }
  if (inLine) {
    lines.push(Math.round(lineSum / lineCount));
  }

  const merged: number[] = [];
  for (const val of lines) {
    if (merged.length === 0) {
      merged.push(val);
    } else {
      const last = merged[merged.length - 1];
      if (val - last < mergeTolerance) {
        merged[merged.length - 1] = Math.round((last + val) / 2);
      } else {
        merged.push(val);
      }
    }
  }
  return merged;
}

function cleanOcrText(text: string): string {
  let cleaned = text.trim();
  
  // Unify minus signs
  cleaned = cleaned.replace(/[–—−]/g, '-');
  // Remove noise characters
  cleaned = cleaned.replace(/[\[\]\|\\\_~`']/g, '');
  
  if (cleaned.length === 1) {
    if (cleaned === 'O') cleaned = '0';
    if (cleaned === 'l' || cleaned === 'I') cleaned = '1';
    if (cleaned === 'o') cleaned = '0';
    if (/[.,\-+*/=xy]/.test(cleaned) && !/[0-9a-zA-Z]/.test(cleaned)) {
      if (cleaned === '-') return '-';
      return '';
    }
  }

  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  cleaned = cleaned.replace(/\s*=\s*/g, '=');
  cleaned = cleaned.replace(/\s*\(\s*/g, '(');
  cleaned = cleaned.replace(/\s*\)\s*/g, ')');
  cleaned = cleaned.replace(/\s*,\s*/g, ',');
  cleaned = cleaned.replace(/\)\s+([0-9])/g, ')$1');
  cleaned = cleaned.replace(/([0-9])\s+\(/g, '$1(');
  
  return cleaned;
}

self.addEventListener('message', async (event: MessageEvent) => {
  const { imageBlob } = event.data;

  if (!imageBlob) return;

  let worker: any = null;
  try {
    // 1. Create ImageBitmap from Blob
    const imageBitmap = await createImageBitmap(imageBlob);
    const width = imageBitmap.width;
    const height = imageBitmap.height;

    // 2. Render to OffscreenCanvas to get ImageData
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error("Could not get 2D context for OffscreenCanvas");
    ctx.drawImage(imageBitmap, 0, 0);

    const imageData = ctx.getImageData(0, 0, width, height);
    const pixelData = imageData.data;

    // 3. Convert to Grayscale
    const gray = new Uint8Array(width * height);
    for (let i = 0; i < pixelData.length; i += 4) {
      gray[i / 4] = Math.round(0.299 * pixelData[i] + 0.587 * pixelData[i + 1] + 0.114 * pixelData[i + 2]);
    }

    // 4. Binarize (Adaptive Thresholding, Window Size: 25, C: 12)
    const binary = adaptiveThreshold(gray, width, height, 25, 12);

    // 5. Morphological line detection
    const L_h = Math.max(30, Math.floor(width * 0.1));
    const L_v = Math.max(30, Math.floor(height * 0.1));

    const eroded_h = erodeHorizontal(binary, width, height, L_h);
    const dilated_h = dilateHorizontal(eroded_h, width, height, L_h);

    const eroded_v = erodeVertical(binary, width, height, L_v);
    const dilated_v = dilateVertical(eroded_v, width, height, L_v);

    // 6. Line densities
    const rowDensities = new Float32Array(height);
    for (let y = 0; y < height; y++) {
      let count = 0;
      for (let x = 0; x < width; x++) {
        if (dilated_h[y * width + x] === 1) count++;
      }
      rowDensities[y] = count / width;
    }

    const colDensities = new Float32Array(width);
    for (let x = 0; x < width; x++) {
      let count = 0;
      for (let y = 0; y < height; y++) {
        if (dilated_v[y * width + x] === 1) count++;
      }
      colDensities[x] = count / width;
    }

    const horizontalLines = getGridLines(rowDensities, 0.15, 15);
    const verticalLines = getGridLines(colDensities, 0.15, 15);

    worker = await createWorker('eng+fra');

    // 7. Grid-Based OCR Path
    if (horizontalLines.length >= 2 && verticalLines.length >= 2) {
      await worker.setParameters({
        tessedit_pageseg_mode: PSM.SINGLE_LINE,
        tesseract_create_hocr: '0'
      });

      const numRows = horizontalLines.length - 1;
      const numCols = verticalLines.length - 1;
      const matrix: string[][] = Array.from({ length: numRows }, () => new Array(numCols).fill('-'));

 for (let r = 0; r < numRows; r++) {
        const y0 = horizontalLines[r];
        const y1 = horizontalLines[r + 1];
        for (let c = 0; c < numCols; c++) {
          const x0 = verticalLines[c];
          const x1 = verticalLines[c + 1];

          // Inset slightly to exclude grid lines
          const dx = x1 - x0;
          const dy = y1 - y0;
          const insetX = Math.min(4, Math.max(2, Math.floor(dx * 0.05)));
          const insetY = Math.min(4, Math.max(2, Math.floor(dy * 0.05)));

          const cropX = x0 + insetX;
          const cropY = y0 + insetY;
          const cropW = dx - 2 * insetX;
          const cropH = dy - 2 * insetY;

          if (cropW <= 2 || cropH <= 2) {
            matrix[r][c] = '-';
            continue;
          }

          // Upscale cell by 2x and add 10px white padding
          const cellCanvas = new OffscreenCanvas(cropW * 2 + 20, cropH * 2 + 20);
          const cellCtx = cellCanvas.getContext('2d');
          
          if (cellCtx) {
            // 1. Draw the white padding background
            cellCtx.fillStyle = '#FFFFFF';
            cellCtx.fillRect(0, 0, cellCanvas.width, cellCanvas.height);
            
            // 2. Draw the upscaled cell image into the center
            cellCtx.drawImage(
              imageBitmap,
              cropX, cropY, cropW, cropH,
              10, 10, cropW * 2, cropH * 2
            );

            // 3. Extract ONLY the inner cell data, ignoring the padding!
            const innerImageData = cellCtx.getImageData(10, 10, cropW * 2, cropH * 2);
            
            // 4. Preprocess (Otsu separates the gray background from the text)
            const isEmpty = preprocessCell(innerImageData);
            
            if (isEmpty) {
              matrix[r][c] = '-';
              continue;
            }
            
            // 5. Put the binarized pixels back into the center
            cellCtx.putImageData(innerImageData, 10, 10);
          }

          const cellBlob = await cellCanvas.convertToBlob({ type: 'image/png' });
          const { data } = await worker.recognize(cellBlob);
          
          let cellText = cleanOcrText(data.text);
          matrix[r][c] = cellText || '-';
        }
      }

      await worker.terminate();
      self.postMessage({ status: 'SUCCESS', matrix });
      self.postMessage({ status: 'SUCCESS', matrix });
    } else {
      // 8. HEURISTIC FALLBACK PATH (for borderless tables)
      await worker.setParameters({
        tessedit_pageseg_mode: PSM.AUTO,
        tesseract_create_hocr: '0'
      });

      const { data } = await worker.recognize(
        imageBlob,
        { rotateAuto: true },
        { blocks: true }
      );

      const allWords = data.blocks
        ? data.blocks.flatMap((block: any) => 
            block.paragraphs.flatMap((paragraph: any) => 
              paragraph.lines.flatMap((line: any) => line.words)
            )
          )
        : [];

      const cleanWords = allWords
        .map((w: any) => {
          let text = cleanOcrText(w.text);
          return { ...w, text };
        })
        .filter((w: any) => w.text.length > 0 && /[a-zA-Z0-9=\(\)\+\-\*\/\.\,xy]/.test(w.text));

      // --- Group into rows ---
      cleanWords.sort((a: any, b: any) => a.bbox.y0 - b.bbox.y0);

      interface RowCluster {
        yCenter: number;
        words: typeof cleanWords;
      }

      const rows: RowCluster[] = [];
      const ROW_HEIGHT_TOLERANCE = 15; 

      cleanWords.forEach((word: any) => {
        const wordYCenter = (word.bbox.y0 + word.bbox.y1) / 2;
        let targetRow = rows.find((r: any) => Math.abs(r.yCenter - wordYCenter) < ROW_HEIGHT_TOLERANCE);

        if (targetRow) {
          targetRow.words.push(word);
          targetRow.yCenter = targetRow.words.reduce((sum: number, w: any) => sum + (w.bbox.y0 + w.bbox.y1) / 2, 0) / targetRow.words.length;
        } else {
          rows.push({ yCenter: wordYCenter, words: [word] });
        }
      });

      rows.sort((a, b) => a.yCenter - b.yCenter);

      // --- Group words into cells ---
      const rawRows = rows.map((row: any) => {
        row.words.sort((a: any, b: any) => a.bbox.x0 - b.bbox.x0);
        
        const cells: { text: string, xCenter: number }[] = [];
        let currentCellWords: string[] = [];
        let cellX0 = row.words[0]?.bbox.x0 || 0;
        let cellX1 = row.words[0]?.bbox.x1 || 0;
        
        const COLUMN_GAP_THRESHOLD = 15; 

        for (let i = 0; i < row.words.length; i++) {
          const currentWord = row.words[i];
          currentCellWords.push(currentWord.text);
          cellX1 = currentWord.bbox.x1;

          const nextWord = row.words[i + 1];
          
          if (!nextWord || (nextWord.bbox.x0 - currentWord.bbox.x1) > COLUMN_GAP_THRESHOLD) {
            cells.push({
              text: currentCellWords.join(""),
              xCenter: (cellX0 + cellX1) / 2
            });
            
            currentCellWords = [];
            if (nextWord) cellX0 = nextWord.bbox.x0;
          }
        }
        return cells;
      });

      // --- Align to global column grid ---
      const columnCenters: number[] = [];
      const COLUMN_MERGE_TOLERANCE = 30; 

      rawRows.forEach((row: any) => {
        row.forEach((cell: any) => {
          const existingColIndex = columnCenters.findIndex((c: any) => Math.abs(c - cell.xCenter) < COLUMN_MERGE_TOLERANCE);
          if (existingColIndex !== -1) {
            columnCenters[existingColIndex] = (columnCenters[existingColIndex] + cell.xCenter) / 2;
          } else {
            columnCenters.push(cell.xCenter);
          }
        });
      });

      columnCenters.sort((a, b) => a - b);

      // --- Build final matrix ---
      const finalCalculatedMatrix = rawRows.map((row: any) => {
        const alignedRow = new Array(columnCenters.length).fill("-");
        
        row.forEach((cell: any) => {
          const colIndex = columnCenters.findIndex((c: any) => Math.abs(c - cell.xCenter) < COLUMN_MERGE_TOLERANCE);
          if (colIndex !== -1) {
            alignedRow[colIndex] = cell.text;
          }
        });
        
        return alignedRow;
      })
      .filter((row: any) => row.some((cell: any) => cell !== "-"));

      await worker.terminate();
      self.postMessage({ status: 'SUCCESS', matrix: finalCalculatedMatrix });
    }
  } catch (error: any) {
    if (worker) {
      try {
        await worker.terminate();
      } catch (e) {}
    }
    self.postMessage({ status: 'ERROR', error: error.message });
  }
});

export {};