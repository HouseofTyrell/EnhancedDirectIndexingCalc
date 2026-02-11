import { ReactNode, useState, useRef, useCallback, useEffect } from 'react';
import type { PanelLayout, AnchorPosition } from '../hooks/usePinnedElements';
import { STORAGE_KEYS } from '../constants/storageKeys';

interface PinnedElement {
  id: string;
  label: string;
  content: ReactNode;
}

interface FloatingPinnedPanelProps {
  elements: PinnedElement[];
  onUnpin: (id: string) => void;
  onUnpinAll: () => void;
  layout: PanelLayout | null;
  onLayoutChange: (layout: PanelLayout) => void;
  onLayoutReset: () => void;
}

type ResizeDir = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

const DEFAULT_WIDTH = 480;
const DEFAULT_HEIGHT = 640;
const MIN_WIDTH = 280;
const MIN_HEIGHT = 200;
const MIN_ITEM_HEIGHT = 60;
const EDGE_MARGIN = 12;
const COLLAPSED_HEIGHT = 48;
const RESIZE_DIRS: ResizeDir[] = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];
const ORDER_KEY = STORAGE_KEYS.PINNED_PANEL_ORDER;
const HEIGHTS_KEY = STORAGE_KEYS.PINNED_PANEL_HEIGHTS;

function loadItemOrder(): string[] {
  try {
    const stored = localStorage.getItem(ORDER_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.every((v: unknown) => typeof v === 'string')) return parsed;
      localStorage.removeItem(ORDER_KEY);
    }
  } catch { /* ignore */ }
  return [];
}

function loadItemHeights(): Record<string, number> {
  try {
    const stored = localStorage.getItem(HEIGHTS_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) return parsed;
      localStorage.removeItem(HEIGHTS_KEY);
    }
  } catch { /* ignore */ }
  return {};
}

const ANCHOR_CYCLE: (AnchorPosition | null)[] = [
  'bottom-right', 'bottom-left', 'top-right', 'top-left', null,
];

function getAnchoredPosition(anchor: AnchorPosition, w: number, h: number) {
  switch (anchor) {
    case 'bottom-right':
      return { x: window.innerWidth - w - EDGE_MARGIN, y: window.innerHeight - h - EDGE_MARGIN };
    case 'bottom-left':
      return { x: EDGE_MARGIN, y: window.innerHeight - h - EDGE_MARGIN };
    case 'top-right':
      return { x: window.innerWidth - w - EDGE_MARGIN, y: EDGE_MARGIN };
    case 'top-left':
      return { x: EDGE_MARGIN, y: EDGE_MARGIN };
  }
}

function getDefaultPosition() {
  const x = window.innerWidth - DEFAULT_WIDTH - EDGE_MARGIN;
  const y = window.innerHeight - DEFAULT_HEIGHT - EDGE_MARGIN;
  return { x: Math.max(0, x), y: Math.max(0, y) };
}

function clampPosition(x: number, y: number, w: number) {
  const maxX = window.innerWidth - Math.min(w, 120);
  const maxY = window.innerHeight - 40;
  return {
    x: Math.max(0, Math.min(x, maxX)),
    y: Math.max(0, Math.min(y, maxY)),
  };
}

const ANCHOR_LABELS: Record<AnchorPosition, string> = {
  'bottom-right': 'BR',
  'bottom-left': 'BL',
  'top-right': 'TR',
  'top-left': 'TL',
};

/**
 * Draggable + resizable floating panel that shows pinned UI elements.
 * Allows users to keep charts/results/inputs visible while editing elsewhere.
 */
export function FloatingPinnedPanel({
  elements,
  onUnpin,
  onUnpinAll,
  layout,
  onLayoutChange,
  onLayoutReset,
}: FloatingPinnedPanelProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [collapsedItems, setCollapsedItems] = useState<Set<string>>(new Set());
  const [isDragging, setIsDragging] = useState(false);
  const [resizeDir, setResizeDir] = useState<ResizeDir | null>(null);
  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= 768);
  const [itemHeights, setItemHeights] = useState<Record<string, number>>(loadItemHeights);
  const [itemResizing, setItemResizing] = useState<string | null>(null);
  const [itemOrder, setItemOrder] = useState<string[]>(loadItemOrder);
  const [dragItemId, setDragItemId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);

  const isResizing = resizeDir !== null;

  const panelRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const resizeStartRef = useRef<{
    dir: ResizeDir; w: number; h: number; x: number; y: number; px: number; py: number;
  } | null>(null);
  const itemResizeStartRef = useRef<{ id: string; h: number; py: number } | null>(null);
  const itemDragStartRef = useRef<{ id: string; py: number } | null>(null);
  const itemRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Resolve effective position/size
  const anchor = layout?.anchor ?? null;
  const size = {
    width: layout?.width ?? DEFAULT_WIDTH,
    height: layout?.height ?? DEFAULT_HEIGHT,
  };
  const pos = anchor
    ? getAnchoredPosition(anchor, size.width, size.height)
    : layout
      ? { x: layout.x, y: layout.y }
      : getDefaultPosition();

  // Track mobile breakpoint + recompute anchored position on window resize (throttled)
  useEffect(() => {
    let rafId = 0;
    const onResize = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        setIsMobile(window.innerWidth <= 768);
        if (layout?.anchor) {
          const newPos = getAnchoredPosition(layout.anchor, layout.width, layout.height);
          onLayoutChange({ ...layout, ...newPos });
        }
      });
    };
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      cancelAnimationFrame(rafId);
    };
  }, [layout, onLayoutChange]);

  // Sync itemOrder with elements + clean stale collapsedItems and itemHeights
  useEffect(() => {
    const elementIds = new Set(elements.map(e => e.id));
    setItemOrder(prev => {
      const kept = prev.filter(id => elementIds.has(id));
      const existing = new Set(kept);
      const added = elements.filter(e => !existing.has(e.id)).map(e => e.id);
      const merged = [...kept, ...added];
      if (merged.length === prev.length && merged.every((id, i) => prev[i] === id)) return prev;
      return merged;
    });
    setCollapsedItems(prev => {
      const stale = [...prev].filter(id => !elementIds.has(id));
      if (stale.length === 0) return prev;
      const next = new Set(prev);
      stale.forEach(id => next.delete(id));
      return next;
    });
    setItemHeights(prev => {
      const staleKeys = Object.keys(prev).filter(id => !elementIds.has(id));
      if (staleKeys.length === 0) return prev;
      const next = { ...prev };
      staleKeys.forEach(id => delete next[id]);
      return next;
    });
  }, [elements]);

  // Persist item order
  useEffect(() => {
    try {
      if (itemOrder.length > 0) {
        localStorage.setItem(ORDER_KEY, JSON.stringify(itemOrder));
      } else {
        localStorage.removeItem(ORDER_KEY);
      }
    } catch { /* ignore */ }
  }, [itemOrder]);

  // Persist item heights
  useEffect(() => {
    try {
      if (Object.keys(itemHeights).length > 0) {
        localStorage.setItem(HEIGHTS_KEY, JSON.stringify(itemHeights));
      } else {
        localStorage.removeItem(HEIGHTS_KEY);
      }
    } catch { /* ignore */ }
  }, [itemHeights]);

  // Derive ordered elements from itemOrder
  const orderedElements = itemOrder.length > 0
    ? itemOrder.map(id => elements.find(e => e.id === id)).filter((e): e is PinnedElement => !!e)
    : elements;

  // --- Panel drag ---
  const handleDragStart = useCallback(
    (e: React.PointerEvent) => {
      if (isMobile || isResizing) return;
      e.preventDefault();
      setIsDragging(true);
      dragStartRef.current = { x: pos.x, y: pos.y, px: e.clientX, py: e.clientY };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    },
    [pos.x, pos.y, isMobile, isResizing]
  );

  const handleDragMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDragging || !dragStartRef.current) return;
      const dx = e.clientX - dragStartRef.current.px;
      const dy = e.clientY - dragStartRef.current.py;
      const clamped = clampPosition(
        dragStartRef.current.x + dx,
        dragStartRef.current.y + dy,
        size.width
      );
      onLayoutChange({ ...clamped, width: size.width, height: size.height, anchor });
    },
    [isDragging, size.width, size.height, anchor, onLayoutChange]
  );

  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
    dragStartRef.current = null;
    // Dragging breaks the anchor
    if (anchor) {
      onLayoutChange({ x: pos.x, y: pos.y, width: size.width, height: size.height, anchor: null });
    }
  }, [anchor, pos.x, pos.y, size.width, size.height, onLayoutChange]);

  // --- Panel resize (multi-directional) ---
  const handleResizeStart = useCallback(
    (dir: ResizeDir, e: React.PointerEvent) => {
      if (isMobile) return;
      e.preventDefault();
      e.stopPropagation();
      setResizeDir(dir);
      resizeStartRef.current = {
        dir, w: size.width, h: size.height, x: pos.x, y: pos.y,
        px: e.clientX, py: e.clientY,
      };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    },
    [size.width, size.height, pos.x, pos.y, isMobile]
  );

  const handleResizeMove = useCallback(
    (e: React.PointerEvent) => {
      if (!resizeDir || !resizeStartRef.current) return;
      const { dir, w: startW, h: startH, x: startX, y: startY, px: startPx, py: startPy } = resizeStartRef.current;
      const dx = e.clientX - startPx;
      const dy = e.clientY - startPy;
      const maxW = Math.round(window.innerWidth * 0.9);
      const maxH = Math.round(window.innerHeight * 0.95);

      let newW = startW;
      let newH = startH;
      if (dir.includes('e')) newW = startW + dx;
      if (dir.includes('w')) newW = startW - dx;
      if (dir.includes('s')) newH = startH + dy;
      if (dir.includes('n')) newH = startH - dy;

      newW = Math.max(MIN_WIDTH, Math.min(newW, maxW));
      newH = Math.max(MIN_HEIGHT, Math.min(newH, maxH));

      // Adjust position so opposite edge stays fixed
      let newX = startX;
      let newY = startY;
      if (dir.includes('w')) newX = startX + startW - newW;
      if (dir.includes('n')) newY = startY + startH - newH;

      if (anchor) {
        const anchoredPos = getAnchoredPosition(anchor, newW, newH);
        onLayoutChange({ ...anchoredPos, width: newW, height: newH, anchor });
      } else {
        onLayoutChange({ x: newX, y: newY, width: newW, height: newH });
      }
    },
    [resizeDir, anchor, onLayoutChange]
  );

  const handleResizeEnd = useCallback(() => {
    setResizeDir(null);
    resizeStartRef.current = null;
  }, []);

  // --- Per-item vertical resize ---
  const handleItemResizeStart = useCallback(
    (id: string, e: React.PointerEvent) => {
      if (isMobile) return;
      e.preventDefault();
      e.stopPropagation();
      const el = itemRefs.current.get(id);
      const contentEl = el?.querySelector('.floating-panel__item-content') as HTMLElement | null;
      const currentH = itemHeights[id] ?? contentEl?.offsetHeight ?? 200;
      setItemResizing(id);
      itemResizeStartRef.current = { id, h: currentH, py: e.clientY };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    },
    [isMobile, itemHeights]
  );

  const handleItemResizeMove = useCallback(
    (e: React.PointerEvent) => {
      if (!itemResizing || !itemResizeStartRef.current) return;
      const dy = e.clientY - itemResizeStartRef.current.py;
      const newH = Math.max(MIN_ITEM_HEIGHT, itemResizeStartRef.current.h + dy);
      setItemHeights(prev => ({ ...prev, [itemResizeStartRef.current!.id]: newH }));
    },
    [itemResizing]
  );

  const handleItemResizeEnd = useCallback(() => {
    setItemResizing(null);
    itemResizeStartRef.current = null;
  }, []);

  // --- Item drag-to-reorder ---
  const handleItemDragStart = useCallback(
    (id: string, e: React.PointerEvent) => {
      if (isMobile) return;
      e.preventDefault();
      e.stopPropagation();
      setDragItemId(id);
      itemDragStartRef.current = { id, py: e.clientY };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    },
    [isMobile]
  );

  const handleItemDragMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragItemId || !itemDragStartRef.current) return;
      const pointerY = e.clientY;
      let targetId: string | null = null;
      let targetIdx = -1;
      for (const [id, el] of itemRefs.current.entries()) {
        if (id === dragItemId) continue;
        const rect = el.getBoundingClientRect();
        if (pointerY >= rect.top && pointerY <= rect.bottom) {
          targetId = id;
          targetIdx = itemOrder.indexOf(id);
          break;
        }
      }
      setDropTargetId(targetId);
      if (targetIdx === -1) return;
      const currentIdx = itemOrder.indexOf(dragItemId);
      if (currentIdx === targetIdx) return;
      setItemOrder(prev => {
        const next = [...prev];
        next.splice(currentIdx, 1);
        next.splice(targetIdx, 0, dragItemId);
        return next;
      });
    },
    [dragItemId, itemOrder]
  );

  const handleItemDragEnd = useCallback(() => {
    setDragItemId(null);
    setDropTargetId(null);
    itemDragStartRef.current = null;
  }, []);

  // Double-click item resize handle to reset to flex sizing
  const resetItemHeight = useCallback((id: string) => {
    setItemHeights(prev => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  // Toggle collapse on individual item
  const toggleItemCollapse = useCallback((id: string) => {
    setCollapsedItems(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const collapseAll = useCallback(() => {
    setCollapsedItems(new Set(elements.map(e => e.id)));
  }, [elements]);

  const expandAll = useCallback(() => {
    setCollapsedItems(new Set());
  }, []);

  const cycleAnchor = useCallback(() => {
    const currentIdx = ANCHOR_CYCLE.indexOf(anchor);
    const nextAnchor = ANCHOR_CYCLE[(currentIdx + 1) % ANCHOR_CYCLE.length];
    if (nextAnchor) {
      const newPos = getAnchoredPosition(nextAnchor, size.width, size.height);
      onLayoutChange({ ...newPos, width: size.width, height: size.height, anchor: nextAnchor });
    } else {
      onLayoutChange({ x: pos.x, y: pos.y, width: size.width, height: size.height, anchor: null });
    }
  }, [anchor, size.width, size.height, pos.x, pos.y, onLayoutChange]);

  // Full reset: position, size, order, heights, collapsed state
  const handleFullReset = useCallback(() => {
    setItemOrder([]);
    setItemHeights({});
    setCollapsedItems(new Set());
    onLayoutReset();
  }, [onLayoutReset]);

  if (elements.length === 0) return null;

  const allCollapsed = elements.length > 0 && elements.every(e => collapsedItems.has(e.id));

  // When collapsed, anchor Y to bottom of viewport
  const effectiveY = collapsed
    ? window.innerHeight - COLLAPSED_HEIGHT - EDGE_MARGIN
    : pos.y;

  // Mobile: bottom sheet style; Desktop: fixed with transform
  const panelStyle: React.CSSProperties = isMobile
    ? {}
    : {
        position: 'fixed',
        top: 0,
        left: 0,
        transform: `translate(${pos.x}px, ${effectiveY}px)`,
        width: size.width,
        height: collapsed ? 'auto' : size.height,
      };

  return (
    <div
      ref={panelRef}
      className={`floating-panel${collapsed ? ' floating-panel--collapsed' : ''}${isDragging ? ' floating-panel--dragging' : ''}${isResizing ? ' floating-panel--resizing' : ''}${isMobile ? ' floating-panel--mobile' : ''}`}
      style={panelStyle}
    >
      {/* Header — draggable */}
      <div
        className="floating-panel__header"
        onPointerDown={handleDragStart}
        onPointerMove={handleDragMove}
        onPointerUp={handleDragEnd}
        onPointerCancel={handleDragEnd}
      >
        {!isMobile && <span className="floating-panel__drag-dots" aria-hidden="true">⋮⋮</span>}
        <button
          className="floating-panel__toggle"
          onClick={() => setCollapsed(c => !c)}
          onPointerDown={e => e.stopPropagation()}
          aria-label={collapsed ? 'Expand pinned panel' : 'Collapse pinned panel'}
        >
          {collapsed ? '▲' : '▼'}
        </button>
        <span className="floating-panel__title">
          Pinned <span className="floating-panel__count">{elements.length}</span>
        </span>
        <div className="floating-panel__header-actions" onPointerDown={e => e.stopPropagation()}>
          {!collapsed && elements.length > 1 && (
            <button
              className="floating-panel__collapse-toggle-btn"
              onClick={allCollapsed ? expandAll : collapseAll}
              title={allCollapsed ? 'Expand all sections' : 'Collapse all sections'}
              aria-label={allCollapsed ? 'Expand all sections' : 'Collapse all sections'}
            >
              {allCollapsed ? (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="7 13 12 18 17 13" />
                  <polyline points="7 6 12 11 17 6" />
                </svg>
              ) : (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="17 11 12 6 7 11" />
                  <polyline points="17 18 12 13 7 18" />
                </svg>
              )}
            </button>
          )}
          {!isMobile && (
            <button
              className={`floating-panel__anchor-btn${anchor ? ' floating-panel__anchor-btn--active' : ''}`}
              onClick={cycleAnchor}
              title={anchor ? `Anchored ${ANCHOR_LABELS[anchor]} — click to cycle` : 'Anchor to corner'}
              aria-label={anchor ? `Anchored ${anchor}, click to change` : 'Anchor panel to screen corner'}
            >
              {anchor ? ANCHOR_LABELS[anchor] : (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 17v5" />
                  <circle cx="12" cy="12" r="4" />
                  <path d="M12 3v2" />
                  <path d="M3 12h2" />
                  <path d="M19 12h2" />
                </svg>
              )}
            </button>
          )}
          {!isMobile && (
            <button
              className="floating-panel__reset-btn"
              onClick={handleFullReset}
              title="Reset position, size & layout"
              aria-label="Reset panel position, size and layout"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
                <path d="M21 3v5h-5" />
                <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
                <path d="M3 21v-5h5" />
              </svg>
            </button>
          )}
          <button
            className="floating-panel__close-all"
            onClick={onUnpinAll}
            title="Unpin all"
            aria-label="Unpin all"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
          </button>
        </div>
      </div>

      {/* Body — items */}
      {!collapsed && (
        <div className="floating-panel__body">
          {orderedElements.map(el => {
            const itemCollapsed = collapsedItems.has(el.id);
            return (
              <div
                key={el.id}
                ref={node => { if (node) itemRefs.current.set(el.id, node); else itemRefs.current.delete(el.id); }}
                className={`floating-panel__item${itemCollapsed ? ' floating-panel__item--collapsed' : ''}${dragItemId === el.id ? ' floating-panel__item--dragging' : ''}${dropTargetId === el.id ? ' floating-panel__item--drop-target' : ''}`}
              >
                <div
                  className="floating-panel__item-header"
                  onClick={() => toggleItemCollapse(el.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleItemCollapse(el.id); } }}
                >
                  {!isMobile && elements.length > 1 && (
                    <span
                      className="floating-panel__item-drag"
                      onPointerDown={e => handleItemDragStart(el.id, e)}
                      onPointerMove={handleItemDragMove}
                      onPointerUp={handleItemDragEnd}
                      onPointerCancel={handleItemDragEnd}
                      onClick={e => e.stopPropagation()}
                      aria-hidden="true"
                      title="Drag to reorder"
                    >
                      ⋮
                    </span>
                  )}
                  <span className="floating-panel__item-chevron" aria-hidden="true">
                    {itemCollapsed ? '›' : '⌄'}
                  </span>
                  <span className="floating-panel__item-label">{el.label}</span>
                  <button
                    className="floating-panel__item-close"
                    onClick={e => { e.stopPropagation(); onUnpin(el.id); }}
                    aria-label={`Unpin ${el.label}`}
                    title="Unpin"
                  >
                    ×
                  </button>
                </div>
                {!itemCollapsed && (
                  <>
                    <div
                      className={`floating-panel__item-content${itemHeights[el.id] ? ' floating-panel__item-content--fixed' : ''}`}
                      style={itemHeights[el.id] ? { height: itemHeights[el.id] } : undefined}
                    >
                      {el.content}
                    </div>
                    {!isMobile && (
                      <div
                        className={`floating-panel__item-resize${itemResizing === el.id ? ' floating-panel__item-resize--active' : ''}`}
                        onPointerDown={e => handleItemResizeStart(el.id, e)}
                        onPointerMove={handleItemResizeMove}
                        onPointerUp={handleItemResizeEnd}
                        onPointerCancel={handleItemResizeEnd}
                        onDoubleClick={() => resetItemHeight(el.id)}
                        title="Drag to resize · Double-click to reset"
                        aria-hidden="true"
                      />
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Multi-directional resize zones (desktop, expanded only) */}
      {!collapsed && !isMobile && RESIZE_DIRS.map(dir => (
        <div
          key={dir}
          className={`floating-panel__resize-zone floating-panel__resize-zone--${dir}`}
          onPointerDown={e => handleResizeStart(dir, e)}
          onPointerMove={handleResizeMove}
          onPointerUp={handleResizeEnd}
          onPointerCancel={handleResizeEnd}
          aria-hidden="true"
        />
      ))}
    </div>
  );
}
