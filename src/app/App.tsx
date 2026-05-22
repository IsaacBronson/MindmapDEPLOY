import { useState, useRef, useEffect } from 'react';
import { MindMapNode, MindMapNodeData } from './components/MindMapNode';
import { Button } from './components/ui/button';
import { RotateCcw, Download, Plus, X, Save, FolderOpen, ZoomIn, Trash2, Bug } from 'lucide-react';
import { Input } from './components/ui/input';
import { Checkbox } from './components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from './components/ui/alert-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './components/ui/dropdown-menu';

const COLORS = [
  '#8B5CF6', // purple
  '#EC4899', // pink
  '#F59E0B', // amber
  '#10B981', // emerald
  '#3B82F6', // blue
  '#EF4444', // red
  '#14B8A6', // teal
  '#F97316', // orange
];

function generateId() {
  return Math.random().toString(36).substr(2, 9);
}

interface Connection {
  from: string;
  to: string;
  arrowDirection?: 'none' | 'forward' | 'backward' | 'both'; // forward: from -> to, backward: to -> from
}

interface SavedMindMap {
  name: string;
  timestamp: number;
  data: {
    nodes: MindMapNodeData[];
    connections: Connection[];
  };
}

interface MindMapTab {
  id: string;
  name: string;
  nodes: MindMapNodeData[];
  connections: Connection[];
}

export default function App() {
  const [tabs, setTabs] = useState<MindMapTab[]>([
    { id: generateId(), name: 'Untitled Map', nodes: [], connections: [] }
  ]);
  const [activeTabId, setActiveTabId] = useState(tabs[0].id);
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const [connectionSource, setConnectionSource] = useState<string | null>(null);
  const [savedMaps, setSavedMaps] = useState<SavedMindMap[]>([]);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [loadDialogOpen, setLoadDialogOpen] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [exportName, setExportName] = useState('mindmap');
  const [chooseLocation, setChooseLocation] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [hasPanned, setHasPanned] = useState(false);
  const [showInstructions, setShowInstructions] = useState(true);
  const [shiftPressed, setShiftPressed] = useState(false);
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [editingTabName, setEditingTabName] = useState('');
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [lastSavedState, setLastSavedState] = useState<string>('');
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [closeTabConfirmOpen, setCloseTabConfirmOpen] = useState(false);
  const [tabToClose, setTabToClose] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasWrapperRef = useRef<HTMLDivElement>(null);

  // Canvas size - much larger than viewport to allow panning
  const CANVAS_SIZE = 10000;
  const MAX_PAN = 3000; // Maximum pan distance from center

  const activeTab = tabs.find(t => t.id === activeTabId) || tabs[0];
  const nodes = activeTab.nodes;
  const connections = activeTab.connections;

  const setNodes = (updater: React.SetStateAction<MindMapNodeData[]>) => {
    setTabs(prev => prev.map(tab => 
      tab.id === activeTabId 
        ? { ...tab, nodes: typeof updater === 'function' ? updater(tab.nodes) : updater }
        : tab
    ));
  };

  const setConnections = (updater: React.SetStateAction<Connection[]>) => {
    setTabs(prev => prev.map(tab => 
      tab.id === activeTabId 
        ? { ...tab, connections: typeof updater === 'function' ? updater(tab.connections) : updater }
        : tab
    ));
  };

  // Load saved maps from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('mindmaps');
    if (saved) {
      setSavedMaps(JSON.parse(saved));
    }
    
    // Load instructions visibility preference
    const instructionsHidden = localStorage.getItem('hideInstructions');
    if (instructionsHidden === 'true') {
      setShowInstructions(false);
    }

    // Load tabs from localStorage
    const savedTabs = localStorage.getItem('mindmap_tabs');
    if (savedTabs) {
      const parsedTabs = JSON.parse(savedTabs);
      if (parsedTabs.length > 0) {
        setTabs(parsedTabs);
        setActiveTabId(parsedTabs[0].id);
      }
    }

    // Keyboard listeners for shift key
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Shift') {
        setShiftPressed(true);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift') {
        setShiftPressed(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // Auto-save tabs to localStorage
  useEffect(() => {
    localStorage.setItem('mindmap_tabs', JSON.stringify(tabs));
  }, [tabs]);

  // Track unsaved changes and warn before leaving
  useEffect(() => {
    const currentState = JSON.stringify({ nodes, connections });
    if (lastSavedState && lastSavedState !== currentState) {
      setHasUnsavedChanges(true);
    } else if (!lastSavedState) {
      setLastSavedState(currentState);
    }
  }, [nodes, connections, lastSavedState]);

  // Warn before closing tab with unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges && (nodes.length > 0 || connections.length > 0)) {
        e.preventDefault();
        e.returnValue = '';
        return '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges, nodes.length, connections.length]);

  const updateNode = (id: string, updates: Partial<MindMapNodeData>) => {
    setNodes((prev) =>
      prev.map((node) => (node.id === id ? { ...node, ...updates } : node))
    );
  };

  const deleteNode = (id: string) => {
    setNodes((prev) => prev.filter((node) => node.id !== id));
    // Remove all connections involving this node
    setConnections((prev) => 
      prev.filter((conn) => conn.from !== id && conn.to !== id)
    );
  };

  const addNewNode = (e: React.MouseEvent, shiftClickSourceId?: string) => {
    if (connectionSource && !shiftClickSourceId) return; // Don't add nodes in connection mode
    if (isPanning && !shiftClickSourceId) return; // Don't add nodes when panning
    if (hasPanned && !shiftClickSourceId) return; // Don't add nodes if user just finished panning
    
    let x, y;
    
    if (shiftClickSourceId) {
      // Shift-click: create connected node near source
      const sourceNode = nodes.find(n => n.id === shiftClickSourceId);
      if (!sourceNode) return;
      
      // Random angle and distance
      const angle = Math.random() * 2 * Math.PI;
      const distance = 150 + Math.random() * 50;
      x = sourceNode.x + Math.cos(angle) * distance;
      y = sourceNode.y + Math.sin(angle) * distance;
    } else {
      // Get the viewport container (overflow-hidden parent)
      const viewportContainer = containerRef.current?.parentElement?.parentElement;
      if (!viewportContainer) return;
      
      const viewportRect = viewportContainer.getBoundingClientRect();
      
      // Get click position relative to viewport
      const viewportX = e.clientX - viewportRect.left;
      const viewportY = e.clientY - viewportRect.top;
      
      // Convert viewport coordinates to canvas coordinates
      // Account for: pan offset, zoom, and canvas center offset
      x = (viewportX - viewportRect.width / 2 - panOffset.x) / zoom + CANVAS_SIZE / 2;
      y = (viewportY - viewportRect.height / 2 - panOffset.y) / zoom + CANVAS_SIZE / 2;
    }

    const newNode: MindMapNodeData = {
      id: generateId(),
      text: 'New Idea',
      x,
      y,
      color: COLORS[nodes.length % COLORS.length],
    };

    setNodes((prev) => [...prev, newNode]);

    // Auto-connect if shift-clicked
    if (shiftClickSourceId) {
      setConnections((prev) => [
        ...prev,
        { from: shiftClickSourceId, to: newNode.id, arrowDirection: 'forward' },
      ]);
    }
  };

  const handleStartConnection = (nodeId: string) => {
    if (connectionSource === null) {
      setConnectionSource(nodeId);
    } else {
      // Complete or toggle the connection
      if (connectionSource !== nodeId) {
        // Check if connection already exists
        const existingIndex = connections.findIndex(
          (c) =>
            (c.from === connectionSource && c.to === nodeId) ||
            (c.from === nodeId && c.to === connectionSource)
        );

        if (existingIndex !== -1) {
          // Connection exists, remove it
          setConnections((prev) => prev.filter((_, idx) => idx !== existingIndex));
        } else {
          // Connection doesn't exist, add it with default arrow direction
          setConnections((prev) => [
            ...prev,
            { from: connectionSource, to: nodeId, arrowDirection: 'forward' },
          ]);
        }
      }
      setConnectionSource(null);
    }
  };

  const cycleArrowDirection = (from: string, to: string) => {
    setConnections((prev) => prev.map((conn) => {
      // Match the connection in either direction
      if ((conn.from === from && conn.to === to) || (conn.from === to && conn.to === from)) {
        const currentDirection = conn.arrowDirection || 'forward';
        const directions: Array<'none' | 'forward' | 'backward' | 'both'> = ['none', 'forward', 'backward', 'both'];
        const currentIndex = directions.indexOf(currentDirection);
        const nextIndex = (currentIndex + 1) % directions.length;
        return { ...conn, arrowDirection: directions[nextIndex] };
      }
      return conn;
    }));
  };

  const handleNodeClick = (nodeId: string, e: React.MouseEvent) => {
    if (shiftPressed && !connectionSource) {
      e.stopPropagation();
      addNewNode(e, nodeId);
    }
  };

  const cancelConnection = () => {
    setConnectionSource(null);
  };

  const handleReset = () => {
    // Check if there's meaningful content
    if (tabHasMeaningfulContent(activeTab)) {
      setResetConfirmOpen(true);
    } else {
      confirmReset();
    }
  };

  const confirmReset = () => {
    setNodes([]);
    setConnections([]);
    setConnectionSource(null);
    setZoom(1);
    setPanOffset({ x: 0, y: 0 });
    setHasUnsavedChanges(false);
    const currentState = JSON.stringify({ nodes: [], connections: [] });
    setLastSavedState(currentState);
    setResetConfirmOpen(false);
  };

  const clearBlankNodes = () => {
    setNodes((prev) => prev.filter((node) => node.text.trim() !== 'New Idea'));
    // Also remove connections that reference deleted nodes
    const remainingNodeIds = new Set(
      nodes.filter((node) => node.text.trim() !== 'New Idea').map((node) => node.id)
    );
    setConnections((prev) =>
      prev.filter((conn) => remainingNodeIds.has(conn.from) && remainingNodeIds.has(conn.to))
    );
  };

  const exportAsJSON = () => {
    const data = { nodes, connections };
    const dataStr = JSON.stringify(data, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${exportName}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setExportDialogOpen(false);
    setExportName('mindmap');
    setChooseLocation(false);
  };

  const loadFromJSON = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target?.result as string);
        if (data.nodes && Array.isArray(data.nodes)) {
          const fileName = file.name.replace('.json', '');
          
          // Add to library
          const newLibraryMap: SavedMindMap = {
            name: fileName,
            timestamp: Date.now(),
            data: { nodes: data.nodes, connections: data.connections || [] },
          };
          setSavedMaps(prev => {
            const updated = [...prev, newLibraryMap];
            localStorage.setItem('mindmaps', JSON.stringify(updated));
            return updated;
          });

          // Create new tab with loaded data
          const newTab: MindMapTab = {
            id: generateId(),
            name: fileName,
            nodes: data.nodes,
            connections: data.connections || [],
          };
          setTabs(prev => [...prev, newTab]);
          setActiveTabId(newTab.id);
        }
      } catch (error) {
        console.error('Failed to load mind map:', error);
        alert('Failed to load mind map. Please check the file format.');
      }
    };
    reader.readAsText(file);
  };

  const handleMultipleFileLoad = (files: FileList) => {
    Array.from(files).forEach(file => {
      loadFromJSON(file);
    });
  };

  // Draw connections between nodes
  const renderConnections = () => {
    return connections.map((connection, index) => {
      const fromNode = nodes.find((n) => n.id === connection.from);
      const toNode = nodes.find((n) => n.id === connection.to);

      if (!fromNode || !toNode) return null;

      const dx = toNode.x - fromNode.x;
      const dy = toNode.y - fromNode.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance === 0) return null;

      // Calculate angle and alignment factor
      const angle = Math.atan2(Math.abs(dy), Math.abs(dx));
      // angle: 0 = horizontal, PI/2 = vertical
      // alignment: 1 = perfectly aligned (0° or 90°), 0 = diagonal (45°)
      const alignmentH = 1 - Math.min(1, Math.abs(angle) / (Math.PI / 4));
      const alignmentV = 1 - Math.min(1, Math.abs(angle - Math.PI / 2) / (Math.PI / 4));
      const alignment = Math.max(alignmentH, alignmentV);

      // Check if any nodes are near the direct path
      const midX = (fromNode.x + toNode.x) / 2;
      const midY = (fromNode.y + toNode.y) / 2;

      let maxAvoidance = 0;
      const avoidanceRadius = 80; // How close a node needs to be to cause avoidance

      nodes.forEach((node) => {
        if (node.id === fromNode.id || node.id === toNode.id) return;

        // Calculate distance from node to line midpoint
        const distToMid = Math.sqrt(
          Math.pow(node.x - midX, 2) + Math.pow(node.y - midY, 2)
        );

        // Check if node is roughly between the two connected nodes
        const dotProduct = (node.x - fromNode.x) * dx + (node.y - fromNode.y) * dy;
        const isInBetween = dotProduct > 0 && dotProduct < distance * distance;

        if (isInBetween && distToMid < avoidanceRadius) {
          const avoidanceFactor = 1 - (distToMid / avoidanceRadius);
          maxAvoidance = Math.max(maxAvoidance, avoidanceFactor);
        }
      });

      // Calculate curve amount: reduce based on alignment, increase to avoid nodes
      const baselineCurve = distance * 0.15;
      const alignmentReduction = alignment * 0.9; // Up to 90% reduction when aligned
      const avoidanceIncrease = maxAvoidance * 1.5; // Up to 150% increase to avoid nodes

      const curveFactor = Math.max(0, (1 - alignmentReduction) + avoidanceIncrease);
      const curve = baselineCurve * curveFactor;

      // Perpendicular offset for curve
      const offsetX = (-dy / distance) * curve;
      const offsetY = (dx / distance) * curve;

      const controlX = midX + offsetX;
      const controlY = midY + offsetY;

      const arrowDirection = connection.arrowDirection || 'forward';
      const markerId = `arrow-${fromNode.color.replace('#', '')}-${index}`;
      const markerIdReverse = `arrow-reverse-${fromNode.color.replace('#', '')}-${index}`;

      // Calculate proper start/end points that account for node size and curve
      const nodeRadius = 50; // Approximate node radius
      const arrowSize = 10; // Arrow head size in pixels

      // For start point: calculate direction from fromNode to control point
      const startAngle = Math.atan2(controlY - fromNode.y, controlX - fromNode.x);
      const startX = fromNode.x + Math.cos(startAngle) * nodeRadius;
      const startY = fromNode.y + Math.sin(startAngle) * nodeRadius;

      // For end point: calculate direction from control point to toNode
      const endAngle = Math.atan2(toNode.y - controlY, toNode.x - controlX);
      const endX = toNode.x - Math.cos(endAngle) * nodeRadius;
      const endY = toNode.y - Math.sin(endAngle) * nodeRadius;

      return (
        <g key={`${connection.from}-${connection.to}-${index}`}>
          {/* Arrow marker definitions */}
          <defs>
            <marker
              id={markerId}
              markerWidth={arrowSize}
              markerHeight={arrowSize}
              refX={arrowSize - 1}
              refY={arrowSize / 2}
              orient="auto"
              markerUnits="userSpaceOnUse"
            >
              <path
                d={`M0,0 L0,${arrowSize} L${arrowSize},${arrowSize / 2} z`}
                fill={fromNode.color}
              />
            </marker>
            <marker
              id={markerIdReverse}
              markerWidth={arrowSize}
              markerHeight={arrowSize}
              refX={1}
              refY={arrowSize / 2}
              orient="auto"
              markerUnits="userSpaceOnUse"
            >
              <path
                d={`M${arrowSize},0 L${arrowSize},${arrowSize} L0,${arrowSize / 2} z`}
                fill={fromNode.color}
              />
            </marker>
          </defs>
          <path
            d={`M ${startX} ${startY} Q ${controlX} ${controlY} ${endX} ${endY}`}
            stroke={fromNode.color}
            strokeWidth="3"
            fill="none"
            opacity="0.8"
            markerEnd={arrowDirection === 'forward' || arrowDirection === 'both' ? `url(#${markerId})` : undefined}
            markerStart={arrowDirection === 'backward' || arrowDirection === 'both' ? `url(#${markerIdReverse})` : undefined}
          />
        </g>
      );
    });
  };

  const getVersionedName = (baseName: string): string => {
    // Check if a map with this name already exists
    const existingNames = savedMaps.map(m => m.name);
    
    if (!existingNames.includes(baseName)) {
      return baseName;
    }
    
    // Find the highest version number
    let version = 1;
    while (existingNames.includes(`${baseName} v${version}`)) {
      version++;
    }
    
    return `${baseName} v${version}`;
  };

  const saveMindMap = () => {
    const nameToSave = saveName.trim() || activeTab.name;
    const versionedName = getVersionedName(nameToSave);

    // Create new saved map
    const newMap: SavedMindMap = {
      name: versionedName,
      timestamp: Date.now(),
      data: { nodes, connections },
    };

    const updatedMaps = [...savedMaps, newMap];
    setSavedMaps(updatedMaps);
    localStorage.setItem('mindmaps', JSON.stringify(updatedMaps));

    // Update tab name to the versioned name
    setTabs(prev => prev.map(tab =>
      tab.id === activeTabId
        ? { ...tab, name: versionedName }
        : tab
    ));

    // Mark as saved
    setHasUnsavedChanges(false);
    const currentState = JSON.stringify({ nodes, connections });
    setLastSavedState(currentState);

    setSaveDialogOpen(false);
    setSaveName('');
  };

  const loadMindMap = (map: SavedMindMap) => {
    // Check if active tab is empty
    const isActiveTabEmpty = activeTab.nodes.length === 0 && activeTab.connections.length === 0;
    
    if (isActiveTabEmpty && tabs.length > 1) {
      // Remove the empty tab and replace with loaded map
      const newTab: MindMapTab = {
        id: generateId(),
        name: map.name,
        nodes: map.data.nodes,
        connections: map.data.connections,
      };
      setTabs(prev => prev.filter(t => t.id !== activeTabId).concat([newTab]));
      setActiveTabId(newTab.id);
    } else if (isActiveTabEmpty && tabs.length === 1) {
      // Replace the only tab with loaded map
      setTabs([{
        id: activeTabId,
        name: map.name,
        nodes: map.data.nodes,
        connections: map.data.connections,
      }]);
    } else {
      // Create new tab with loaded map
      const newTab: MindMapTab = {
        id: generateId(),
        name: map.name,
        nodes: map.data.nodes,
        connections: map.data.connections,
      };
      setTabs(prev => [...prev, newTab]);
      setActiveTabId(newTab.id);
    }
    setLoadDialogOpen(false);
  };

  const deleteFromLibrary = (timestamp: number) => {
    const updatedMaps = savedMaps.filter(map => map.timestamp !== timestamp);
    setSavedMaps(updatedMaps);
    localStorage.setItem('mindmaps', JSON.stringify(updatedMaps));
  };

  const handlePanStart = (e: React.MouseEvent) => {
    setIsPanning(true);
    setPanStart({ x: e.clientX, y: e.clientY });
  };

  const handlePanMove = (e: React.MouseEvent) => {
    if (!isPanning) return;
    const dx = e.clientX - panStart.x;
    const dy = e.clientY - panStart.y;
    
    // Apply pan with boundaries that scale with zoom
    // When zoomed in, allow more panning
    const effectiveMaxPan = MAX_PAN * zoom;
    
    setPanOffset((prev) => {
      const newX = Math.max(-effectiveMaxPan, Math.min(effectiveMaxPan, prev.x + dx));
      const newY = Math.max(-effectiveMaxPan, Math.min(effectiveMaxPan, prev.y + dy));
      return { x: newX, y: newY };
    });
    
    setPanStart({ x: e.clientX, y: e.clientY });
    setHasPanned(true);
  };

  const handlePanEnd = () => {
    setIsPanning(false);
    // Reset hasPanned after a short delay to allow onClick to check it
    setTimeout(() => setHasPanned(false), 50);
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    
    // Get viewport container
    const viewportContainer = containerRef.current?.parentElement?.parentElement;
    if (!viewportContainer) return;
    
    const viewportRect = viewportContainer.getBoundingClientRect();
    
    // Mouse position relative to viewport center
    const mouseX = e.clientX - viewportRect.left - viewportRect.width / 2;
    const mouseY = e.clientY - viewportRect.top - viewportRect.height / 2;
    
    // Calculate new zoom
    const delta = e.deltaY > 0 ? -0.05 : 0.05;
    const newZoom = Math.max(0.25, Math.min(3, zoom + delta));
    
    // Calculate zoom factor
    const zoomFactor = newZoom / zoom - 1;
    
    // Adjust pan offset to keep mouse position stable
    const newPanX = panOffset.x - mouseX * zoomFactor;
    const newPanY = panOffset.y - mouseY * zoomFactor;
    
    // Apply boundaries
    const effectiveMaxPan = MAX_PAN * newZoom;
    const clampedPanX = Math.max(-effectiveMaxPan, Math.min(effectiveMaxPan, newPanX));
    const clampedPanY = Math.max(-effectiveMaxPan, Math.min(effectiveMaxPan, newPanY));
    
    setZoom(newZoom);
    setPanOffset({ x: clampedPanX, y: clampedPanY });
  };

  const hideInstructions = () => {
    setShowInstructions(false);
    localStorage.setItem('hideInstructions', 'true');
  };

  const createNewTab = () => {
    const newTab: MindMapTab = {
      id: generateId(),
      name: 'Untitled Map',
      nodes: [],
      connections: [],
    };
    setTabs(prev => [...prev, newTab]);
    setActiveTabId(newTab.id);
  };

  const tabHasMeaningfulContent = (tab: MindMapTab) => {
    if (tab.nodes.length === 0) return false;
    // Check if all nodes are just "New Idea"
    const hasRealContent = tab.nodes.some(node => node.text.trim() !== 'New Idea');
    return hasRealContent;
  };

  const closeTab = (tabId: string) => {
    if (tabs.length === 1) return; // Keep at least one tab

    const tab = tabs.find(t => t.id === tabId);
    if (tab && tabHasMeaningfulContent(tab)) {
      // Show confirmation dialog
      setTabToClose(tabId);
      setCloseTabConfirmOpen(true);
    } else {
      confirmCloseTab(tabId);
    }
  };

  const confirmCloseTab = (tabId: string) => {
    const tabIndex = tabs.findIndex(t => t.id === tabId);
    const newTabs = tabs.filter(t => t.id !== tabId);
    setTabs(newTabs);

    if (activeTabId === tabId) {
      // Switch to adjacent tab
      const newActiveIndex = Math.max(0, tabIndex - 1);
      setActiveTabId(newTabs[newActiveIndex].id);
    }

    setCloseTabConfirmOpen(false);
    setTabToClose(null);
  };

  const handleTabDoubleClick = (tabId: string, currentName: string) => {
    setEditingTabId(tabId);
    setEditingTabName(currentName);
  };

  const saveTabName = (tabId: string) => {
    if (editingTabName.trim()) {
      setTabs(prev => prev.map(tab =>
        tab.id === tabId ? { ...tab, name: editingTabName.trim() } : tab
      ));
    }
    setEditingTabId(null);
    setEditingTabName('');
  };

  return (
    <div 
      className="w-screen h-screen overflow-hidden bg-gradient-to-br from-slate-50 to-slate-100 relative flex flex-col"
      onWheel={handleWheel}
    >
      {/* Tab Bar */}
      <div 
        className="bg-white border-b border-gray-200 px-4 py-2 flex items-center gap-2 overflow-x-auto relative z-50"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        {tabs.map(tab => (
          <div
            key={tab.id}
            className={`flex items-center gap-2 px-3 py-1 rounded cursor-pointer ${
              tab.id === activeTabId ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 hover:bg-gray-200'
            }`}
            onClick={() => setActiveTabId(tab.id)}
            onDoubleClick={() => tab.id === activeTabId && handleTabDoubleClick(tab.id, tab.name)}
          >
            {editingTabId === tab.id ? (
              <input
                type="text"
                value={editingTabName}
                onChange={(e) => setEditingTabName(e.target.value)}
                onBlur={() => saveTabName(tab.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveTabName(tab.id);
                  if (e.key === 'Escape') {
                    setEditingTabId(null);
                    setEditingTabName('');
                  }
                }}
                onClick={(e) => e.stopPropagation()}
                className="text-sm font-medium bg-white px-1 rounded border border-blue-400 outline-none"
                autoFocus
              />
            ) : (
              <span className="text-sm font-medium">{tab.name}</span>
            )}
            {tabs.length > 1 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(tab.id);
                }}
                className="hover:bg-gray-300 rounded-full p-0.5"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        ))}
        <Button
          size="sm"
          variant="outline"
          onClick={createNewTab}
          className="h-7"
        >
          <Plus className="h-3 w-3" />
        </Button>
      </div>

      {/* Controls */}
      <div className="absolute top-14 left-4 flex gap-2 z-50">
        <Button
          onClick={handleReset}
          variant="outline"
          className="bg-white shadow-md"
        >
          <RotateCcw className="h-4 w-4" />
        </Button>
        <Button
          onClick={() => setExportDialogOpen(true)}
          variant="outline"
          className="bg-white shadow-md"
        >
          <Download className="h-4 w-4 mr-2" />
          Save
        </Button>
        <div>
          <Input
            type="file"
            accept=".json"
            multiple
            onChange={(e) => {
              const files = e.target.files;
              if (files && files.length > 0) {
                handleMultipleFileLoad(files);
              }
            }}
            className="hidden"
            id="load-files"
          />
          <Button
            onClick={() => document.getElementById('load-files')?.click()}
            variant="outline"
            className="bg-white shadow-md"
          >
            <FolderOpen className="h-4 w-4 mr-2" />
            Load
          </Button>
        </div>
        <Button
          onClick={() => {
            setSaveName(activeTab.name);
            setSaveDialogOpen(true);
          }}
          variant="outline"
          className="bg-white shadow-md"
        >
          <Save className="h-4 w-4 mr-2" />
          Save to Library
        </Button>
        <Button
          onClick={() => setLoadDialogOpen(true)}
          variant="outline"
          className="bg-white shadow-md"
        >
          <FolderOpen className="h-4 w-4 mr-2" />
          Library
        </Button>
        <Button
          variant="outline"
          className="bg-white shadow-md cursor-default"
          disabled
        >
          <ZoomIn className="h-4 w-4 mr-2" />
          {Math.round(zoom * 100)}%
        </Button>
        <Button
          onClick={clearBlankNodes}
          variant="outline"
          className="bg-white shadow-md"
        >
          <Trash2 className="h-4 w-4 mr-2" />
          Clear Blank
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              className="bg-white shadow-md"
            >
              <Bug className="h-4 w-4 mr-2" />
              Debug
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onClick={clearBlankNodes}>
              <Trash2 className="h-4 w-4 mr-2" />
              Delete all "New Idea" nodes
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Connection Mode Banner */}
      {connectionSource && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 bg-blue-500 text-white px-6 py-3 rounded-lg shadow-lg z-50 flex items-center gap-3">
          <span className="font-medium">Click another node to connect</span>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 w-6 p-0 rounded-full hover:bg-blue-600 text-white"
            onClick={cancelConnection}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Instructions */}
      {showInstructions && (
        <div className="absolute top-14 right-4 bg-white p-4 rounded-lg shadow-md max-w-xs z-50">
          <div className="flex items-start justify-between mb-2">
            <h3 className="font-semibold">How to use:</h3>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 w-6 p-0 rounded-full hover:bg-gray-200 text-gray-500 -mt-1 -mr-1"
              onClick={hideInstructions}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <ul className="text-sm space-y-1 text-gray-700">
            <li>• <strong>Click anywhere</strong> to add nodes</li>
            <li>• <strong>Shift+Click node</strong> to add connected node</li>
            <li>• <strong>Drag</strong> nodes to reposition</li>
            <li>• <strong>Drag resize handle</strong> to resize</li>
            <li>• <strong>Double-click tab</strong> to rename</li>
            <li>• <strong>Double-click node</strong> to edit text</li>
            <li>• <strong>Click link icon</strong> to connect nodes</li>
            <li>• <strong>Mouse wheel</strong> to zoom</li>
          </ul>
        </div>
      )}

      {/* Zoom and pan wrapper containing both SVG and nodes */}
      <div className="flex-1 relative overflow-hidden">
        <div 
          ref={canvasWrapperRef}
          className="absolute"
          style={{ 
            left: '50%',
            top: '50%',
            width: `${CANVAS_SIZE}px`,
            height: `${CANVAS_SIZE}px`,
            marginLeft: `-${CANVAS_SIZE / 2}px`,
            marginTop: `-${CANVAS_SIZE / 2}px`,
            transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoom})`,
            transformOrigin: `${CANVAS_SIZE / 2}px ${CANVAS_SIZE / 2}px`,
            transition: isPanning ? 'none' : 'transform 0.2s ease-out'
          }}
        >
          {/* SVG for connections - covers entire canvas */}
          <svg
            ref={svgRef}
            className="absolute pointer-events-none"
            width={CANVAS_SIZE}
            height={CANVAS_SIZE}
            style={{ zIndex: 0 }}
          >
            {renderConnections()}
          </svg>

          {/* Canvas - click to add nodes */}
          <div 
            ref={containerRef}
            className="absolute cursor-crosshair"
            style={{ 
              width: `${CANVAS_SIZE}px`,
              height: `${CANVAS_SIZE}px`,
              zIndex: 1 
            }}
            onClick={addNewNode}
            onMouseDown={handlePanStart}
            onMouseMove={handlePanMove}
            onMouseUp={handlePanEnd}
            onMouseLeave={handlePanEnd}
            tabIndex={0}
          >
            {nodes.length === 0 && !connectionSource && (
              <div 
                className="absolute flex items-center justify-center pointer-events-none"
                style={{
                  left: `${CANVAS_SIZE / 2 - 200}px`,
                  top: `${CANVAS_SIZE / 2 - 100}px`,
                  width: '400px',
                  height: '200px'
                }}
              >
                <div className="text-center text-gray-400">
                  <Plus className="h-16 w-16 mx-auto mb-4 opacity-50" />
                  <p className="text-xl font-medium">Click anywhere to add your first idea</p>
                </div>
              </div>
            )}

            {nodes.map((node) => (
              <MindMapNode
                key={node.id}
                node={node}
                onUpdate={updateNode}
                onDelete={deleteNode}
                onStartConnection={handleStartConnection}
                isDragging={draggingNodeId === node.id}
                onDragStart={() => setDraggingNodeId(node.id)}
                onDragEnd={() => setDraggingNodeId(null)}
                isConnectionMode={connectionSource !== null}
                isConnectionSource={connectionSource === node.id}
                onShiftClick={handleNodeClick}
                zoom={zoom}
                panOffset={panOffset}
                connections={connections}
                onCycleArrowDirection={cycleArrowDirection}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Export Dialog */}
      <Dialog open={exportDialogOpen} onOpenChange={setExportDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save Mind Map</DialogTitle>
            <DialogDescription>
              Enter a name for your mind map file.
            </DialogDescription>
          </DialogHeader>
          <Input
            type="text"
            value={exportName}
            onChange={(e) => setExportName(e.target.value)}
            placeholder="File name"
          />
          <div className="flex items-center space-x-2">
            <Checkbox
              id="choose-location"
              checked={chooseLocation}
              onCheckedChange={(checked) => setChooseLocation(checked as boolean)}
            />
            <label
              htmlFor="choose-location"
              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
            >
              Choose file location
            </label>
          </div>
          <Button
            onClick={exportAsJSON}
            variant="outline"
            className="bg-white shadow-md mt-4"
          >
            Save
          </Button>
        </DialogContent>
      </Dialog>

      {/* Save to Library Dialog */}
      <Dialog open={saveDialogOpen} onOpenChange={(open) => {
        setSaveDialogOpen(open);
        if (!open) setSaveName('');
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save to Library</DialogTitle>
            <DialogDescription>
              Save your mind map to the library for quick access. If a map with the same name exists, it will be versioned automatically.
            </DialogDescription>
          </DialogHeader>
          <Input
            type="text"
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
            placeholder="Enter name"
          />
          <Button
            onClick={saveMindMap}
            variant="outline"
            className="bg-white shadow-md mt-4"
          >
            Save
          </Button>
        </DialogContent>
      </Dialog>

      {/* Load from Library Dialog */}
      <Dialog open={loadDialogOpen} onOpenChange={setLoadDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Load from Library</DialogTitle>
            <DialogDescription>
              Select a saved mind map to load in a new tab.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {savedMaps.length === 0 ? (
              <p className="text-sm text-gray-500">No saved mind maps yet.</p>
            ) : (
              savedMaps.map((map) => (
                <div key={map.timestamp} className="flex items-center gap-2">
                  <Button
                    onClick={() => loadMindMap(map)}
                    variant="outline"
                    className="flex-1 justify-start bg-white shadow-sm hover:shadow-md"
                  >
                    <div className="flex flex-col items-start">
                      <span>{map.name}</span>
                      <span className="text-xs text-gray-500">
                        {new Date(map.timestamp).toLocaleString()}
                      </span>
                    </div>
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => deleteFromLibrary(map.timestamp)}
                    className="h-auto px-2 py-2"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Reset Confirmation Dialog */}
      <AlertDialog open={resetConfirmOpen} onOpenChange={setResetConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset Mind Map</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to reset the mind map? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmReset}
            >
              Reset
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Close Tab Confirmation Dialog */}
      <AlertDialog open={closeTabConfirmOpen} onOpenChange={setCloseTabConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Close Tab</AlertDialogTitle>
            <AlertDialogDescription>
              This tab contains a mind map. Are you sure you want to close it? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setTabToClose(null)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => tabToClose && confirmCloseTab(tabToClose)}
            >
              Close Tab
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}