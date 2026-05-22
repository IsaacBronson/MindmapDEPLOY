import { useState, useRef, useEffect } from 'react';
import { Trash2, Link2, ArrowRight, ArrowLeftRight, Minus } from 'lucide-react';
import { Button } from './ui/button';

export interface MindMapNodeData {
  id: string;
  text: string;
  x: number;
  y: number;
  color: string;
  width?: number;
  height?: number;
}

interface Connection {
  from: string;
  to: string;
  arrowDirection?: 'none' | 'forward' | 'backward' | 'both';
}

interface MindMapNodeProps {
  node: MindMapNodeData;
  onUpdate: (id: string, updates: Partial<MindMapNodeData>) => void;
  onDelete: (id: string) => void;
  onStartConnection: (nodeId: string) => void;
  isDragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  isConnectionMode: boolean;
  isConnectionSource: boolean;
  onShiftClick?: (nodeId: string, e: React.MouseEvent) => void;
  zoom: number;
  panOffset: { x: number; y: number };
  connections: Connection[];
  onCycleArrowDirection: (from: string, to: string) => void;
}

export function MindMapNode({
  node,
  onUpdate,
  onDelete,
  onStartConnection,
  isDragging,
  onDragStart,
  onDragEnd,
  isConnectionMode,
  isConnectionSource,
  onShiftClick,
  zoom,
  panOffset,
  connections,
  onCycleArrowDirection,
}: MindMapNodeProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(node.text);
  const [preEditSize, setPreEditSize] = useState<{width?: number, height?: number}>({});
  const inputRef = useRef<HTMLInputElement>(null);
  const nodeRef = useRef<HTMLDivElement>(null);
  const dragStartPos = useRef({ x: 0, y: 0 });
  const resizeStartPos = useRef({ x: 0, y: 0, width: 0, height: 0 });

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (isEditing || isConnectionMode) return;
    
    // Prevent dragging nodes when clicking node buttons or resize handle
    if ((e.target as HTMLElement).closest('button')) return;
    if ((e.target as HTMLElement).classList.contains('resize-handle')) return;
    
    dragStartPos.current = {
      x: node.x,
      y: node.y,
    };
    
    const startMouseX = e.clientX;
    const startMouseY = e.clientY;
    
    // Stop propagation to prevent canvas panning
    e.stopPropagation();
    
    onDragStart();

    const handleMouseMove = (moveEvent: MouseEvent) => {
      // Calculate mouse delta in screen space
      const dx = (moveEvent.clientX - startMouseX) / zoom;
      const dy = (moveEvent.clientY - startMouseY) / zoom;
      
      // Apply delta to original position
      const newX = dragStartPos.current.x + dx;
      const newY = dragStartPos.current.y + dy;
      onUpdate(node.id, { x: newX, y: newY });
    };

    const handleMouseUp = () => {
      onDragEnd();
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const handleDoubleClick = () => {
    if (!isConnectionMode) {
      // Store current size before editing
      setPreEditSize({ width: node.width, height: node.height });
      
      // Temporarily make node bigger for editing if it's small
      const tempWidth = node.width && node.width < 200 ? 200 : node.width;
      const tempHeight = node.height && node.height < 60 ? 60 : node.height;
      
      if (tempWidth !== node.width || tempHeight !== node.height) {
        onUpdate(node.id, { width: tempWidth, height: tempHeight });
      }
      
      setIsEditing(true);
    }
  };

  const handleSave = () => {
    if (editText.trim()) {
      onUpdate(node.id, { text: editText.trim() });
    }
    
    // Restore original size
    if (preEditSize.width !== node.width || preEditSize.height !== node.height) {
      onUpdate(node.id, { width: preEditSize.width, height: preEditSize.height });
    }
    
    setIsEditing(false);
    setPreEditSize({});
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      setEditText(node.text);
      // Restore original size
      if (preEditSize.width !== node.width || preEditSize.height !== node.height) {
        onUpdate(node.id, { width: preEditSize.width, height: preEditSize.height });
      }
      setIsEditing(false);
      setPreEditSize({});
    }
  };

  const handleConnectionClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onStartConnection(node.id);
  };

  const handleResizeMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    const nodeWidth = node.width || 150;
    const nodeHeight = node.height || 50;
    
    resizeStartPos.current = {
      x: e.clientX,
      y: e.clientY,
      width: nodeWidth,
      height: nodeHeight,
    };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const dx = (moveEvent.clientX - resizeStartPos.current.x) / zoom;
      const dy = (moveEvent.clientY - resizeStartPos.current.y) / zoom;
      const newWidth = Math.max(100, resizeStartPos.current.width + dx);
      const newHeight = Math.max(40, resizeStartPos.current.height + dy);
      onUpdate(node.id, { width: newWidth, height: newHeight });
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  // Calculate font size based on node dimensions
  const calculateFontSize = () => {
    if (!node.width && !node.height) return 14;

    const width = node.width || 150;
    const height = node.height || 50;

    // Use area-based scaling for better proportional sizing
    const area = width * height;
    const baseArea = 150 * 50; // Default node area
    const scale = Math.sqrt(area / baseArea);

    // Scale font size proportionally, clamped between 10px and 36px
    const fontSize = Math.max(10, Math.min(36, 14 * scale));

    return fontSize;
  };

  // Find if this node has any connections and get the first one's arrow direction
  const getNodeConnection = () => {
    return connections.find(
      (c) => c.from === node.id || c.to === node.id
    );
  };

  const getArrowIcon = () => {
    const connection = getNodeConnection();
    if (!connection) return <Minus className="h-3 w-3" />;

    const direction = connection.arrowDirection || 'forward';
    const isFrom = connection.from === node.id;

    // Adjust icon based on whether this node is the 'from' or 'to' node
    switch (direction) {
      case 'none':
        return <Minus className="h-3 w-3" />;
      case 'forward':
        return isFrom ? <ArrowRight className="h-3 w-3" /> : <ArrowRight className="h-3 w-3 rotate-180" />;
      case 'backward':
        return isFrom ? <ArrowRight className="h-3 w-3 rotate-180" /> : <ArrowRight className="h-3 w-3" />;
      case 'both':
        return <ArrowLeftRight className="h-3 w-3" />;
      default:
        return <Minus className="h-3 w-3" />;
    }
  };

  const handleArrowClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    const connection = getNodeConnection();
    if (connection) {
      onCycleArrowDirection(connection.from, connection.to);
    }
  };

  return (
    <div
      ref={nodeRef}
      className="absolute group"
      style={{
        left: node.x,
        top: node.y,
        transform: 'translate(-50%, -50%)',
        cursor: isConnectionMode ? 'crosshair' : isDragging ? 'grabbing' : 'grab',
      }}
      onMouseDown={handleMouseDown}
      onDoubleClick={handleDoubleClick}
      onClick={(e) => {
        e.stopPropagation(); // Prevent creating new nodes when clicking existing ones
        if (isConnectionMode) {
          handleConnectionClick(e);
        }
        if (onShiftClick && e.shiftKey) {
          onShiftClick(node.id, e);
        }
      }}
    >
      <div
        className={`relative px-4 py-2 rounded-lg shadow-lg border-2 transition-all ${
          isConnectionMode ? 'hover:scale-110 hover:shadow-xl' : 'hover:shadow-xl'
        } ${isConnectionSource ? 'ring-4 ring-blue-400 animate-pulse' : ''}`}
        style={{
          backgroundColor: node.color,
          borderColor: node.color,
          filter: 'brightness(0.95)',
          width: node.width ? `${node.width}px` : 'auto',
          height: node.height ? `${node.height}px` : 'auto',
          minWidth: '100px',
          minHeight: '40px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {isEditing ? (
          <input
            ref={inputRef}
            type="text"
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            onBlur={handleSave}
            onKeyDown={handleKeyDown}
            className="bg-white px-2 py-1 rounded border-2 border-gray-400 w-full outline-none text-center"
            style={{
              fontSize: `${calculateFontSize()}px`,
            }}
            onMouseDown={(e) => e.stopPropagation()}
          />
        ) : (
          <div 
            className="text-white font-medium select-none text-center w-full overflow-hidden break-words px-2"
            style={{
              fontSize: `${calculateFontSize()}px`,
              lineHeight: '1.3',
            }}
          >
            {node.text}
          </div>
        )}

        {!isEditing && !isConnectionMode && (
          <div className="absolute -top-2 -right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
            <Button
              size="sm"
              variant="default"
              className="h-6 w-6 p-0 rounded-full bg-green-500 hover:bg-green-600"
              onClick={(e) => {
                e.stopPropagation();
                onStartConnection(node.id);
              }}
              onMouseDown={(e) => e.stopPropagation()}
              title="Connect to another node"
            >
              <Link2 className="h-3 w-3" />
            </Button>
            {getNodeConnection() && (
              <Button
                size="sm"
                variant="default"
                className="h-6 w-6 p-0 rounded-full bg-blue-500 hover:bg-blue-600"
                onClick={handleArrowClick}
                onMouseDown={(e) => e.stopPropagation()}
                title="Change arrow direction"
              >
                {getArrowIcon()}
              </Button>
            )}
            <Button
              size="sm"
              variant="destructive"
              className="h-6 w-6 p-0 rounded-full"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(node.id);
              }}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        )}
      </div>
      {!isEditing && !isConnectionMode && (
        <div
          className="resize-handle absolute -bottom-1 -right-1 w-4 h-4 bg-white border-2 border-gray-400 rounded-full cursor-nwse-resize opacity-0 group-hover:opacity-100 transition-opacity hover:bg-gray-200"
          onMouseDown={handleResizeMouseDown}
          title="Resize node"
        />
      )}
    </div>
  );
}