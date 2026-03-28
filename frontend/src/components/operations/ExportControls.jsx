/**
 * ExportControls.jsx
 *
 * Export button + format dialog for operations plans.
 * Supports:
 *   - PNG image capture (canvas snapshot of the OL map)
 *   - PDF export (using the same canvas capture + metadata)
 *
 * Uses the native Canvas API and the browser's built-in PDF print
 * functionality (window.print with a styled print layout) as a fallback
 * when jsPDF is not available.
 */

import React, { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Download, Image, FileText, X, Loader2,
} from 'lucide-react';

export default function ExportControls({
  mapRef,
  planTitle = 'Operations Plan',
  planDescription = '',
  unitCount = 0,
  createdBy = '',
}) {
  const [showDialog, setShowDialog] = useState(false);
  const [exporting, setExporting] = useState(false);

  // ── Canvas capture from OpenLayers map ─────────────────────────────

  const captureMapCanvas = useCallback(() => {
    if (!mapRef?.current) return null;

    const olMap = mapRef.current;
    const mapCanvas = olMap.getViewport().querySelector('canvas');
    if (!mapCanvas) return null;

    // Create a new canvas with the map content + metadata header
    const headerHeight = 80;
    const footerHeight = 40;
    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = mapCanvas.width;
    exportCanvas.height = mapCanvas.height + headerHeight + footerHeight;

    const ctx = exportCanvas.getContext('2d');

    // Header background
    ctx.fillStyle = '#080e1c';
    ctx.fillRect(0, 0, exportCanvas.width, headerHeight);

    // Title
    ctx.fillStyle = '#C9A227';
    ctx.font = 'bold 24px Rajdhani, sans-serif';
    ctx.fillText(planTitle, 20, 35);

    // Metadata
    ctx.fillStyle = '#999';
    ctx.font = '12px monospace';
    ctx.fillText(
      `${unitCount} units | Created by ${createdBy} | ${new Date().toLocaleDateString()}`,
      20,
      58,
    );

    if (planDescription) {
      ctx.fillStyle = '#777';
      ctx.font = '11px sans-serif';
      const maxWidth = exportCanvas.width - 40;
      const desc = planDescription.length > 120
        ? planDescription.slice(0, 120) + '…'
        : planDescription;
      ctx.fillText(desc, 20, 74);
    }

    // Separator line
    ctx.strokeStyle = '#C9A227';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, headerHeight - 1);
    ctx.lineTo(exportCanvas.width, headerHeight - 1);
    ctx.stroke();

    // Map content
    ctx.drawImage(mapCanvas, 0, headerHeight);

    // Footer
    const footerY = headerHeight + mapCanvas.height;
    ctx.fillStyle = '#080e1c';
    ctx.fillRect(0, footerY, exportCanvas.width, footerHeight);
    ctx.fillStyle = '#555';
    ctx.font = '10px monospace';
    ctx.fillText(
      `25th Infantry Division — Operations Planner Export — ${new Date().toISOString()}`,
      20,
      footerY + 25,
    );

    return exportCanvas;
  }, [mapRef, planTitle, planDescription, unitCount, createdBy]);

  // ── Export as PNG ──────────────────────────────────────────────────

  const exportAsPNG = useCallback(async () => {
    setExporting(true);
    try {
      // Force OL to render
      if (mapRef?.current) {
        mapRef.current.renderSync();
      }

      // Small delay for render to complete
      await new Promise((r) => setTimeout(r, 200));

      const canvas = captureMapCanvas();
      if (!canvas) {
        alert('Unable to capture map. Please ensure a map is loaded.');
        return;
      }

      const link = document.createElement('a');
      link.download = `${planTitle.replace(/[^a-zA-Z0-9]/g, '_')}_export.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (err) {
      console.error('PNG export failed', err);
      alert('Export failed. Please try again.');
    } finally {
      setExporting(false);
      setShowDialog(false);
    }
  }, [captureMapCanvas, planTitle, mapRef]);

  // ── Export as PDF (via print) ─────────────────────────────────────

  const exportAsPDF = useCallback(async () => {
    setExporting(true);
    try {
      if (mapRef?.current) {
        mapRef.current.renderSync();
      }
      await new Promise((r) => setTimeout(r, 200));

      const canvas = captureMapCanvas();
      if (!canvas) {
        alert('Unable to capture map. Please ensure a map is loaded.');
        return;
      }

      // Open a new window with the canvas as an image for printing
      const dataUrl = canvas.toDataURL('image/png');
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(`
          <!DOCTYPE html>
          <html>
          <head>
            <title>${planTitle} — Export</title>
            <style>
              body { margin: 0; padding: 20px; background: #fff; font-family: sans-serif; }
              img { max-width: 100%; height: auto; }
              h1 { font-size: 18px; color: #333; margin-bottom: 4px; }
              p { font-size: 11px; color: #666; margin: 2px 0; }
              @media print { body { padding: 0; } }
            </style>
          </head>
          <body>
            <h1>${planTitle}</h1>
            <p>${planDescription || ''}</p>
            <p>${unitCount} units | Created by ${createdBy} | ${new Date().toLocaleDateString()}</p>
            <hr />
            <img src="${dataUrl}" />
            <script>setTimeout(() => { window.print(); window.close(); }, 500);</script>
          </body>
          </html>
        `);
        printWindow.document.close();
      }
    } catch (err) {
      console.error('PDF export failed', err);
      alert('Export failed. Please try again.');
    } finally {
      setExporting(false);
      setShowDialog(false);
    }
  }, [captureMapCanvas, planTitle, planDescription, unitCount, createdBy, mapRef]);

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        className="border-gray-600 text-gray-300 hover:border-[#C9A227] hover:text-[#C9A227]"
        onClick={() => setShowDialog(true)}
        disabled={exporting}
      >
        <Download className="w-4 h-4 mr-1" />
        {exporting ? 'Exporting…' : 'Export'}
      </Button>

      {showDialog && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <Card className="w-full max-w-sm bg-[#0c1322] border-gray-800">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-[#C9A227]">Export Plan</CardTitle>
                <button onClick={() => setShowDialog(false)}>
                  <X className="w-5 h-5 text-gray-400 hover:text-white" />
                </button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-gray-400">
                Export "{planTitle}" as an image or PDF document.
              </p>

              <Button
                className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                onClick={exportAsPNG}
                disabled={exporting}
              >
                {exporting ? (
                  <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                ) : (
                  <Image className="w-4 h-4 mr-1" />
                )}
                Export as PNG Image
              </Button>

              <Button
                className="w-full bg-red-700 hover:bg-red-800 text-white"
                onClick={exportAsPDF}
                disabled={exporting}
              >
                {exporting ? (
                  <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                ) : (
                  <FileText className="w-4 h-4 mr-1" />
                )}
                Export as PDF
              </Button>

              <p className="text-[10px] text-gray-600 text-center">
                Export includes map, all symbols, title, and metadata.
              </p>
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}
