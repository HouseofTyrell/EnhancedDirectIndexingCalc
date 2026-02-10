import { ReactNode, useState, useRef, useCallback, useEffect } from 'react';
import type { PanelLayout } from '../hooks/usePinnedElements';

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

const DEFAULT_WIDTH = 420;
const DEFAULT_HEIGHT = 480;
const MIN_WIDTH = 280;
const MIN_HEIGHT = 200;
const DEFAULT_ITEM_HEIGHT = 320;
const MIN_ITEM_HEIGHT = 60;

function getDefaultPosition() {
  const x = window.innerWidth - DEFAULT_WIDTH - 16;
  const y = window.innerHeight - DEFAULT_HEIGHT - 16;
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
  const [isResizing, setIsResizing] = useState(false);
  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= 768);
  const [itemHeights, setItemHeights] = useState<Record<string, number>>({});
  const [itemResizing, setItemResizing] = useState<string | null>(null);
  const [itemOrder, setItemOrder] = useState<string[]>([]);
  const [dragItemId, setDragItemId] = useState<string | null>(null);

  const panelRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const resizeStartRef = useRef<{ w: number; h: number; px: number; py: number } | null>(null);
  const itemResizeStartRef = useRef<{ id: string; h: number; py: number } | null>(null);
  const itemDragStartRef = useRef<{ id: string; py: number } | null>(null);
  const itemRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Resolve effective position/size
  const pos = layout
    ? { x: layout.x, y: layout.y }
    : getDefaultPosition();
  const size = {
    width: layout?.width ?? DEFAULT_WIDTH,
    height: layout?.height ?? DEFAULT_HEIGHT,
  };

  // Track mobile breakpoint
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Sync itemOrder with elements (preserve existing order, append new, remove stale)
  useEffect(() => {
    const elementIds = new Set(elements.map(e => e.id));
    setItemOrder(prev => {
      const kept = prev.filter(id => elementIds.has(id));
      const existing = new Set(kept);
      const added = elements.filter(e => !existing.has(e.id)).map(e => e.id);
      const merged = [...kept, ...added];
      // Only update if actually changed
      if (merged.length === prev.length && merged.every((id, i) => prev[i] === id)) return prev;
      return merged;
    });
  }, [elements]);

  // Derive ordered elements from itemOrder
  const orderedElements = itemOrder.length > 0
    ? itemOrder.map(id => elements.find(e => e.id === id)).filter((e): e is PinnedElement => !!e)
    : elements;

  // --- Drag ---
  const handleDragStart = useCallback(
    (e: React.PointerEvent) => {
      if (isMobile || isResizing) return;
      e.preventDefault();
      setIsDragging(true);
      dragStartRef.current = { x: pos.x, y: pos.y, px: e.clientX, py: e.clientY };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
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
      onLayoutChange({ ...clamped, width: size.width, height: size.height });
    },
    [isDragging, size.width, size.height, onLayoutChange]
  );

  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
    dragStartRef.current = null;
  }, []);

  // --- Resize ---
  const handleResizeStart = useCallback(
    (e: React.PointerEvent) => {
      if (isMobile) return;
      e.preventDefault();
      e.stopPropagation();
      setIsResizing(true);
      resizeStartRef.current = { w: size.width, h: size.height, px: e.clientX, py: e.clientY };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [size.width, size.height, isMobile]
  );

  const handleResizeMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isResizing || !resizeStartRef.current) return;
      const dx = e.clientX - resizeStartRef.current.px;
      const dy = e.clientY - resizeStartRef.current.py;
      const maxW = Math.round(window.innerWidth * 0.8);
      const maxH = Math.round(window.innerHeight * 0.8);
      const newW = Math.max(MIN_WIDTH, Math.min(resizeStartRef.current.w + dx, maxW));
      const newH = Math.max(MIN_HEIGHT, Math.min(resizeStartRef.current.h + dy, maxH));
      onLayoutChange({ x: pos.x, y: pos.y, width: newW, height: newH });
    },
    [isResizing, pos.x, pos.y, onLayoutChange]
  );

  const handleResizeEnd = useCallback(() => {
    setIsResizing(false);
    resizeStartRef.current = null;
  }, []);

  // --- Per-item vertical resize ---
  const handleItemResizeStart = useCallback(
    (id: string, e: React.PointerEvent) => {
      if (isMobile) return;
      e.preventDefault();
      e.stopPropagation();
      const currentH = itemHeights[id] ?? DEFAULT_ITEM_HEIGHT;
      setItemResizing(id);
      itemResizeStartRef.current = { id, h: currentH, py: e.clientY };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
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
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [isMobile]
  );

  const handleItemDragMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragItemId || !itemDragStartRef.current) return;
      // Find which item the pointer is over by checking item element midpoints
      const pointerY = e.clientY;
      let targetIdx = -1;
      for (const [id, el] of itemRefs.current.entries()) {
        if (id === dragItemId) continue;
        const rect = el.getBoundingClientRect();
        if (pointerY >= rect.top && pointerY <= rect.bottom) {
          targetIdx = itemOrder.indexOf(id);
          break;
        }
      }
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
    itemDragStartRef.current = null;
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

  if (elements.length === 0) return null;

  const allCollapsed = elements.length > 0 && elements.every(e => collapsedItems.has(e.id));

  // Mobile: bottom sheet style
  const panelStyle: React.CSSProperties = isMobile
    ? {}
    : {
        position: 'fixed',
        top: 0,
        left: 0,
        transform: `translate(${pos.x}px, ${pos.y}px)`,
        width: size.width,
        height: collapsed ? 'auto' : size.height,
      };

  return (
    <div
      ref={panelRef}
      className={`floating-panel${collapsed ? ' floating-panel--collapsed' : ''}${isDragging ? ' floating-panel--dragging' : ''}${isMobile ? ' floating-panel--mobile' : ''}`}
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
          aria-label={collapsed ? 'Expand pinned panel' : 'Collapse pinned panel'}
        >
          {collapsed ? '▲' : '▼'}
        </button>
        <span className="floating-panel__title">
          Pinned <span className="floating-panel__count">{elements.length}</span>
        </span>
        <div className="floating-panel__header-actions">
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
              className="floating-panel__reset-btn"
              onClick={onLayoutReset}
              title="Reset position & size"
              aria-label="Reset panel position and size"
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
                className={`floating-panel__item${itemCollapsed ? ' floating-panel__item--collapsed' : ''}${dragItemId === el.id ? ' floating-panel__item--dragging' : ''}`}
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
                      className="floating-panel__item-content"
                      style={itemHeights[el.id] ? { maxHeight: itemHeights[el.id], height: itemHeights[el.id] } : undefined}
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

      {/* Resize handle (desktop only, when expanded) */}
      {!collapsed && !isMobile && (
        <div
          className="floating-panel__resize-handle"
          onPointerDown={handleResizeStart}
          onPointerMove={handleResizeMove}
          onPointerUp={handleResizeEnd}
          onPointerCancel={handleResizeEnd}
          aria-hidden="true"
        />
      )}
    </div>
  );
}
