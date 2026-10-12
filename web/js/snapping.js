/* Smart Magnetic Alignment Guidelines & Modular Grid Snapping (Figma/Canva style)
 *
 * Pure, immutable calculations for snapping dragged controls against
 * other controls, stage center, and stage safety margins.
 */

export const DEFAULT_SNAP_OPTIONS = {
  enabled: true,
  thresholdPct: 1.2, // ~8px magnetic lock zone
  gridStep: 2.5, // percent modular step (when grid is active)
  useGrid: false,
};

/**
 * Computes magnetic snapping for a dragging control against other controls and stage.
 * @param {Object} current - { x: number, y: number, size: number, aspect: number } in percentages (center-based)
 * @param {Array<Object>} others - Array of { id, x, y, size, aspect }
 * @param {Object} stageRect - { width: number, height: number }
 * @param {Object} opts - Snap options
 * @returns {Object} { x: number, y: number, snappedX: boolean, snappedY: boolean, guides: Array<Object> }
 */
export function computeSnap(current, others = [], stageRect = { width: 1000, height: 600 }, opts = {}) {
  const options = { ...DEFAULT_SNAP_OPTIONS, ...opts };
  if (!options.enabled) {
    return { x: current.x, y: current.y, snappedX: false, snappedY: false, guides: [] };
  }

  let finalX = current.x;
  let finalY = current.y;
  let snappedX = false;
  let snappedY = false;
  const guides = [];

  const unit = Math.min(stageRect.width, stageRect.height) / 100;
  const curW = current.size * unit;
  const curH = curW * (current.aspect || 1);
  const curHalfWPct = (curW / (2 * stageRect.width)) * 100;
  const curHalfHPct = (curH / (2 * stageRect.height)) * 100;

  // 1. Grid snapping (if modular grid is active)
  if (options.useGrid && options.gridStep > 0) {
    const step = options.gridStep;
    finalX = Math.round(finalX / step) * step;
    finalY = Math.round(finalY / step) * step;
    return {
      x: Number(finalX.toFixed(2)),
      y: Number(finalY.toFixed(2)),
      snappedX: true,
      snappedY: true,
      guides: [],
    };
  }

  // 2. Smart Magnetic Alignment (Object-to-Object & Stage Center)
  const thresh = options.thresholdPct;

  // Candidate anchor points along X (vertical guide lines)
  const xAnchors = [
    { pos: 50.0, type: "stage-center", label: "Center" },
    { pos: 5.0, type: "stage-margin", label: "Margin" },
    { pos: 95.0, type: "stage-margin", label: "Margin" },
  ];

  // Candidate anchor points along Y (horizontal guide lines)
  const yAnchors = [
    { pos: 50.0, type: "stage-center", label: "Center" },
    { pos: 8.0, type: "stage-margin", label: "Margin" },
    { pos: 92.0, type: "stage-margin", label: "Margin" },
  ];

  for (const o of others) {
    if (!o || o.x == null || o.y == null) continue;
    const oW = (o.size || 10) * unit;
    const oH = oW * (o.aspect || 1);
    const oHalfWPct = (oW / (2 * stageRect.width)) * 100;
    const oHalfHPct = (oH / (2 * stageRect.height)) * 100;

    // Center to center
    xAnchors.push({ pos: o.x, type: "object-center" });
    yAnchors.push({ pos: o.y, type: "object-center" });

    // Edge to edge
    xAnchors.push({ pos: o.x - oHalfWPct + curHalfWPct, type: "edge-left" });
    xAnchors.push({ pos: o.x + oHalfWPct - curHalfWPct, type: "edge-right" });
    yAnchors.push({ pos: o.y - oHalfHPct + curHalfHPct, type: "edge-top" });
    yAnchors.push({ pos: o.y + oHalfHPct - curHalfHPct, type: "edge-bottom" });
  }

  // Find closest X anchor
  let bestDistX = thresh;
  let bestAnchorX = null;
  for (const a of xAnchors) {
    const dist = Math.abs(current.x - a.pos);
    if (dist < bestDistX) {
      bestDistX = dist;
      bestAnchorX = a;
    }
  }

  if (bestAnchorX) {
    finalX = bestAnchorX.pos;
    snappedX = true;
    guides.push({
      orientation: "vertical",
      pct: bestAnchorX.pos,
      type: bestAnchorX.type,
    });
  }

  // Find closest Y anchor
  let bestDistY = thresh;
  let bestAnchorY = null;
  for (const a of yAnchors) {
    const dist = Math.abs(current.y - a.pos);
    if (dist < bestDistY) {
      bestDistY = dist;
      bestAnchorY = a;
    }
  }

  if (bestAnchorY) {
    finalY = bestAnchorY.pos;
    snappedY = true;
    guides.push({
      orientation: "horizontal",
      pct: bestAnchorY.pos,
      type: bestAnchorY.type,
    });
  }

  return {
    x: Number(finalX.toFixed(2)),
    y: Number(finalY.toFixed(2)),
    snappedX,
    snappedY,
    guides,
  };
}

/**
 * Renders active guide lines into the overlay layer.
 */
export function renderGuides(layerEl, guides = []) {
  if (!layerEl) return;
  layerEl.innerHTML = "";
  if (!guides.length) return;

  for (const g of guides) {
    const line = document.createElement("div");
    line.className = `snap-guide snap-guide-${g.orientation}`;
    if (g.orientation === "vertical") {
      line.style.left = `${g.pct}%`;
    } else {
      line.style.top = `${g.pct}%`;
    }
    layerEl.appendChild(line);
  }
}

/**
 * Clears the guide lines overlay.
 */
export function clearGuides(layerEl) {
  if (layerEl) layerEl.innerHTML = "";
}
