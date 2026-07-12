/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { Clock, AlertCircle, MonitorUp, Download, RefreshCcw, FileEdit, CheckCircle, FolderTree, List as ListIcon, ChevronDown, ChevronRight, FileText, Filter, Pause, Play, Square } from 'lucide-react';
import RenamePreviewModal from './components/RenamePreviewModal';
import SyncTimePreviewModal from './components/SyncTimePreviewModal';
import { Pagination } from './components/Pagination';
import { TableSelectMenu } from './components/TableSelectMenu';

const formatTime = (isoString: string) => {
  const d = new Date(isoString);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

const TreeNode: React.FC<{ node: any, level?: number, selectedFiles?: Set<string>, onToggleSelect?: (path: string) => void, onFileClick?: (file: any) => void, activeFile?: any }> = ({ node, level = 0, selectedFiles, onToggleSelect, onFileClick, activeFile }) => {
  const [isOpen, setIsOpen] = useState(true);

  if (node.isFile) {
    const isSelected = selectedFiles?.has(node.original.relativePath);
    const isActive = activeFile?.relativePath === node.original.relativePath;
    return (
      <div 
        className={`flex items-center justify-between text-xs py-2 hover:bg-slate-800/50 border-b border-slate-800/50 transition-colors group cursor-pointer ${isActive ? 'bg-slate-800/80 border-cyan-800' : ''}`} 
        style={{ paddingLeft: `${level * 20 + 20}px` }}
        onClick={(e) => {
          // If clicked on the checkbox, don't trigger file click
          if ((e.target as HTMLElement).tagName === 'INPUT') return;
          onFileClick && onFileClick(node.original);
        }}
      >
        <div className="flex items-center min-w-0 pr-4">
          <input 
            type="checkbox" 
            checked={isSelected}
            onChange={() => onToggleSelect && onToggleSelect(node.original.relativePath)}
            className="mr-3 rounded border-slate-700 bg-slate-900 text-cyan-500 focus:ring-cyan-500/50 focus:ring-offset-slate-900 cursor-pointer"
          />
          <FileText className="w-4 h-4 text-slate-500 mr-2 flex-shrink-0" />
          <span className="text-slate-300 truncate font-mono" title={node.name}>{node.name}</span>
        </div>
        <div className="flex items-center flex-shrink-0 pr-4 space-x-6">
           <span className="text-slate-500 w-16 text-right font-mono">{node.original.type === 'video' ? '视频' : '图片'}</span>
           <span className="w-24 text-right flex justify-end">
             {node.original.timeSource === '内部元数据' ? (
               <span className="text-emerald-400 bg-emerald-950/50 border border-emerald-900/50 px-1.5 py-0.5 rounded text-[10px] font-mono">内部元数据</span>
             ) : (
               <span className="text-amber-400 bg-amber-950/50 border border-amber-900/50 px-1.5 py-0.5 rounded text-[10px] font-mono shadow-[0_0_5px_rgba(251,191,36,0.15)]">文件系统时间</span>
             )}
           </span>
           <span className="text-slate-300 font-mono w-40 text-right flex items-center justify-end">
             {formatTime(node.original.date)}
           </span>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div 
        className="flex items-center text-xs py-2 hover:bg-slate-800/50 cursor-pointer font-medium text-slate-300 transition-colors rounded-md" 
        style={{ paddingLeft: `${level * 20}px` }}
        onClick={() => setIsOpen(!isOpen)}
      >
        {isOpen ? <ChevronDown className="w-4 h-4 text-slate-500 mr-1 flex-shrink-0" /> : <ChevronRight className="w-4 h-4 text-slate-500 mr-1 flex-shrink-0" />}
        <FolderTree className="w-4 h-4 text-indigo-400 mr-2 flex-shrink-0" />
        <span className="font-mono">{node.name}</span>
      </div>
      {isOpen && (
        <div className="mt-1">
          {Object.values(node.children).map((child: any, idx) => (
            <TreeNode key={idx} node={child} level={level + 1} selectedFiles={selectedFiles} onToggleSelect={onToggleSelect} onFileClick={onFileClick} activeFile={activeFile} />
          ))}
        </div>
      )}
    </div>
  );
};

const METADATA_GROUPS = [
  {
    name: '基础信息',
    keys: {
      FileSize: '文件大小',
      FileType: '文件类型',
      MIMEType: 'MIME类型',
      ImageWidth: '图片宽度',
      ImageHeight: '图片高度',
      ImageSize: '尺寸',
      Duration: '视频时长',
      Megapixels: '像素(百万)',
      VideoFrameRate: '帧率',
    }
  },
  {
    name: '设备信息',
    keys: {
      Make: '制造商',
      Model: '设备型号',
      Software: '软件版本',
      Orientation: '方向',
      LensMake: '镜头制造商',
      LensModel: '镜头型号',
    }
  },
  {
    name: '拍摄参数',
    keys: {
      ExposureTime: '曝光时间',
      FNumber: '光圈值',
      ISO: 'ISO',
      FocalLength: '焦距',
      ShutterSpeed: '快门速度',
      Aperture: '光圈',
      Flash: '闪光灯',
      WhiteBalance: '白平衡',
      ExposureMode: '曝光模式',
    }
  },
  {
    name: '定位信息',
    keys: {
      GPSLatitude: '纬度',
      GPSLongitude: '经度',
      GPSAltitude: '海拔',
      GPSPosition: 'GPS位置',
    }
  },
  {
    name: '日期时间',
    keys: {
      CreateDate: '创建时间',
      ModifyDate: '修改时间',
      DateTimeOriginal: '原始拍摄时间',
      FileModifyDate: '文件修改时间',
      FileAccessDate: '文件访问时间',
    }
  }
];

function formatMetadataValue(value: any): string {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'object') return String(value);
  if (value.rawValue !== undefined) return String(value.rawValue);
  if (value.year !== undefined) {
    return `${value.year}-${String(value.month).padStart(2, '0')}-${String(value.day).padStart(2, '0')} ${String(value.hour).padStart(2, '0')}:${String(value.minute).padStart(2, '0')}:${String(value.second).padStart(2, '0')}`;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function getGroupedMetadata(metadata: any) {
  if (!metadata) return [];
  
  const resultGroups: { name: string, items: { label: string, value: string, originalKey: string }[] }[] = [];
  const usedKeys = new Set<string>();

  METADATA_GROUPS.forEach(g => {
    const items: { label: string, value: string, originalKey: string }[] = [];
    Object.entries(g.keys).forEach(([key, label]) => {
      if (metadata[key] !== undefined && metadata[key] !== null) {
        items.push({ label, value: formatMetadataValue(metadata[key]), originalKey: key });
        usedKeys.add(key);
      }
    });
    if (items.length > 0) {
      resultGroups.push({ name: g.name, items });
    }
  });

  const otherItems: { label: string, value: string, originalKey: string }[] = [];
  const ignorePrefixes = ['Directory', 'FilePermissions', 'FileName', 'ExifTool', 'SourceFile', 'Error', 'Warning'];
  
  Object.keys(metadata).forEach(key => {
    if (!usedKeys.has(key) && !ignorePrefixes.some(prefix => key.startsWith(prefix))) {
      const val = metadata[key];
      if (val !== undefined && val !== null) {
         if (typeof val === 'object' && !val.rawValue && !val.year) return; // Skip complex unparseable nested objects
         otherItems.push({ label: key, value: formatMetadataValue(val), originalKey: key });
      }
    }
  });

  if (otherItems.length > 0) {
    resultGroups.push({ name: '其他信息', items: otherItems });
  }

  return resultGroups;
}

export default function App() {
  const [loading, setLoading] = useState(false);
  const [inputPath, setInputPath] = useState('');
  const [result, setResult] = useState<{ folderPath: string; total: number; results: Array<any> } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'flat' | 'tree'>('flat');
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
  const [timeSourceFilter, setTimeSourceFilter] = useState<string>('all');
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);
  
  // 新增元数据查看状态
  const [activeFile, setActiveFile] = useState<any | null>(null);
  const [activeMetadata, setActiveMetadata] = useState<any | null>(null);
  const [loadingMetadata, setLoadingMetadata] = useState(false);
  const [metadataError, setMetadataError] = useState<string | null>(null);
  
  const sortedResults = useMemo(() => {
    if (!result?.results) return [];
    let sortableItems = [...result.results];
    
    if (timeSourceFilter !== 'all') {
      sortableItems = sortableItems.filter(item => item.timeSource === timeSourceFilter);
    }
    
    if (sortConfig !== null) {
      sortableItems.sort((a, b) => {
        let aValue = a[sortConfig.key];
        let bValue = b[sortConfig.key];
        
        if (sortConfig.key === 'date') {
          aValue = a.timestamp;
          bValue = b.timestamp;
        }

        if (aValue < bValue) {
          return sortConfig.direction === 'asc' ? -1 : 1;
        }
        if (aValue > bValue) {
          return sortConfig.direction === 'asc' ? 1 : -1;
        }
        return 0;
      });
    }
    return sortableItems;
  }, [result, sortConfig, timeSourceFilter]);

  const totalPages = Math.ceil(sortedResults.length / pageSize);
  const paginatedResults = sortedResults.slice((page - 1) * pageSize, page * pageSize);

  const requestSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
    setPage(1);
  };

  const getSortIcon = (key: string) => {
    if (!sortConfig || sortConfig.key !== key) return <span className="w-3 inline-block"></span>;
    return sortConfig.direction === 'asc' ? <span className="ml-1 inline-block">↑</span> : <span className="ml-1 inline-block">↓</span>;
  };

  // 新增操作状态
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState<{ type: string, current: number, total: number } | null>(null);
  const [processResult, setProcessResult] = useState<{type: string, data: any} | null>(null);
  const [isRenameModalOpen, setIsRenameModalOpen] = useState(false);
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [taskState, setTaskState] = useState<'running' | 'paused' | 'stopped'>('stopped');

  const generateTaskId = () => Math.random().toString(36).substring(2, 15);

  const handleTaskAction = async (action: 'pause' | 'resume' | 'stop') => {
    if (action === 'stop') {
      try {
        await fetch('/api/stop-task', { method: 'POST' });
        setTaskState('stopped');
      } catch (e) {
        console.error(e);
      }
      return;
    }
    
    if (!taskId) return;
    try {
      await fetch(`/api/task/${taskId}/${action}`, { method: 'POST' });
      setTaskState(action === 'pause' ? 'paused' : 'running');
    } catch (e) {
      console.error(e);
    }
  };

  const handleFileClick = async (file: any) => {
    setActiveFile(file);
    setLoadingMetadata(true);
    setMetadataError(null);
    setActiveMetadata(null);
    
    try {
      const fullPath = result ? `${result.folderPath}/${file.relativePath}`.replace(/\/\//g, '/') : file.relativePath;
      const res = await fetch('/api/metadata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullPath })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '获取元数据失败');
      setActiveMetadata(data.metadata);
    } catch (err: any) {
      setMetadataError(err.message);
    } finally {
      setLoadingMetadata(false);
    }
  };

  const handleExportCSV = () => {
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = '/api/export-csv';
    form.target = '_blank';
    
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = 'selectedFiles';
    input.value = JSON.stringify(Array.from(selectedFiles));
    
    form.appendChild(input);
    document.body.appendChild(form);
    form.submit();
    document.body.removeChild(form);
  };

  const [showSelectWarning, setShowSelectWarning] = useState(false);

  const handleOpenSyncModal = () => {
    if (!result || result.results.length === 0) return;
    if (selectedFiles.size === 0) {
      setShowSelectWarning(true);
      return;
    }
    setIsSyncModalOpen(true);
  };

  const executeStreamOp = async (url: string, body: any, type: string) => {
    setProcessing(true);
    setProcessResult(null);
    setProgress({ type, current: 0, total: body.total || 0 });
    setError(null);
    
    const newTaskId = generateTaskId();
    setTaskId(newTaskId);
    setTaskState('running');
    
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, taskId: newTaskId }),
      });
      if (!response.body) throw new Error('ReadableStream not supported');
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const data = JSON.parse(line);
            if (data.type === 'progress') {
              setProgress({ type, current: data.current, total: data.total });
            } else if (data.type === 'done') {
              setProcessResult({ type, data });
            } else if (data.type === 'error') {
              setError(data.error);
            } else if (data.type === 'stopped') {
              setProcessResult({ type, data: { stopped: true, successCount: data.successCount || 0, errorCount: data.errorCount || 0 } });
              setError('任务已手动停止');
            }
          } catch (e) {
            console.error('Failed to parse NDJSON line:', line, e);
          }
        }
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setProcessing(false);
      setProgress(null);
      setTaskId(null);
      setTaskState('stopped');
    }
  };

  const [lastExecutedPlan, setLastExecutedPlan] = useState<any[] | null>(null);

  const handleExecuteSyncFromModal = (syncPlan: any[]) => {
    setLastExecutedPlan(syncPlan);
    executeStreamOp('/api/sync-time', { folderPath: result?.folderPath, syncPlan, total: syncPlan.length || result?.total }, 'sync');
  };

  const handleOpenRenameModal = () => {
    if (!result || result.results.length === 0) return;
    if (selectedFiles.size === 0) {
      setShowSelectWarning(true);
      return;
    }
    setIsRenameModalOpen(true);
  };

  const handleExecuteRenameFromModal = (renamePlan: any[]) => {
    setLastExecutedPlan(renamePlan);
    executeStreamOp('/api/rename-files', { folderPath: result?.folderPath, renamePlan, total: renamePlan.length || result?.total }, 'rename');
  };

  const handleExecuteInjectFromModal = (injectPlan: any[], skippedCount: number = 0) => {
    setLastExecutedPlan(injectPlan);
    executeStreamOp('/api/inject-metadata', { 
      folderPath: result?.folderPath, 
      injectPlan: injectPlan,
      total: injectPlan.length,
      skippedCount: skippedCount
    }, 'inject');
  };


  const handleClearResult = () => {
    if (processResult && lastExecutedPlan && result) {
      const errors = processResult.data?.errors || [];
      const errorPaths = new Set(errors.map((e: any) => e.path));
      
      const newResults = result.results.map(file => {
        const planItem = lastExecutedPlan.find(p => p.relativePath === file.relativePath);
        if (planItem && !errorPaths.has(file.relativePath)) {
           const d = new Date(planItem.targetTimestamp || planItem.targetTime); // depending on plan type
           const pad = (n: number) => n.toString().padStart(2, '0');
           const dateStr = isNaN(d.getTime()) ? '-' : `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
           return {
             ...file,
             timestamp: planItem.targetTimestamp || file.timestamp,
             date: dateStr
           };
        }
        return file;
      });
      setResult({ ...result, results: newResults });
    }
    setProcessResult(null);
    setLastExecutedPlan(null);
  };

  const handleScan = async () => {
    if (!inputPath.trim()) {
      setError('请输入有效的绝对路径');
      return;
    }
    
    setLoading(true);
    setError(null);
    setResult({ folderPath: '', total: 0, results: [] });
    setSelectedFiles(new Set());

    const newTaskId = generateTaskId();
    setTaskId(newTaskId);
    setTaskState('running');

    try {
      const response = await fetch('/api/scan-folder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderPath: inputPath.trim(), taskId: newTaskId }),
      });
      if (!response.body) throw new Error('ReadableStream not supported');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let currentResult = { folderPath: '', total: 0, results: [] as any[] };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const data = JSON.parse(line);
            if (data.type === 'folder') {
              currentResult.folderPath = data.path;
              setResult({ ...currentResult });
            } else if (data.type === 'file') {
              currentResult.results.unshift(data.result);
              currentResult.total++;
              setResult({ ...currentResult });
            } else if (data.type === 'stopped') {
              setError('任务已手动停止');
            } else if (data.type === 'error') {
              setError(data.error);
            }
          } catch (e) {
            console.error('Failed to parse NDJSON line:', line, e);
          }
        }
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
      setTaskId(null);
      setTaskState('stopped');
    }
  };

  const handleSelectPage = () => {
    const newSet = new Set(selectedFiles);
    const allPageChecked = paginatedResults.length > 0 && paginatedResults.every(f => newSet.has(f.relativePath));
    
    if (allPageChecked) {
      paginatedResults.forEach(f => newSet.delete(f.relativePath));
    } else {
      paginatedResults.forEach(f => newSet.add(f.relativePath));
    }
    setSelectedFiles(newSet);
  };

  const handleSelectAll = () => {
    const newSet = new Set(selectedFiles);
    sortedResults.forEach(f => newSet.add(f.relativePath));
    setSelectedFiles(newSet);
  };

  const handleSelectNone = () => {
    setSelectedFiles(new Set());
  };

  const handleToggleSelect = (relativePath: string) => {
    const next = new Set(selectedFiles);
    if (next.has(relativePath)) next.delete(relativePath);
    else next.add(relativePath);
    setSelectedFiles(next);
  };

  const treeData = useMemo(() => {
    if (!result || !result.results) return null;
    const root = { name: result.folderPath.split(/[/\\]/).pop() || 'root', isFile: false, children: {} as any };
    const filteredResults = timeSourceFilter === 'all' 
      ? result.results 
      : result.results.filter(item => item.timeSource === timeSourceFilter);
      
    filteredResults.forEach(item => {
      const parts = item.relativePath.split(/[/\\]/);
      let current = root;
      for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i];
        if (!current.children[part]) {
          current.children[part] = { name: part, isFile: false, children: {} };
        }
        current = current.children[part];
      }
      const fileName = parts[parts.length - 1];
      current.children[fileName] = {
        name: fileName,
        isFile: true,
        original: item
      };
    });
    return root;
  }, [result, timeSourceFilter]);

  const modalFiles = useMemo(() => {
    if (!result) return [];
    return result.results.filter(f => selectedFiles.has(f.relativePath));
  }, [result, selectedFiles]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-300 flex justify-center p-4 sm:p-8 font-sans overflow-x-hidden">
      <div className={`flex flex-col xl:flex-row w-full transition-all duration-300 items-start gap-6 ${activeFile ? 'max-w-[1500px]' : 'max-w-6xl'}`}>
        <div className="w-full flex-1 space-y-6 min-w-0">
          
          {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-baseline space-x-3 mb-4 sm:mb-0">
            <h1 className="text-2xl font-mono font-bold text-slate-100 tracking-tight">媒体时间管理 <span className="text-cyan-500 animate-pulse">//</span></h1>
          </div>
          {(loading || processing) && (
            <div className="flex items-center space-x-2 bg-slate-900 border border-slate-800 px-3 py-1.5 rounded text-xs font-mono">
              <span className="w-2 h-2 rounded-full bg-cyan-500 animate-pulse"></span>
              <span className="text-cyan-400 tracking-widest">工作进行中...</span>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="flex items-center bg-slate-900 border border-slate-800 rounded-lg p-1 focus-within:border-cyan-800 focus-within:ring-1 focus-within:ring-cyan-800 transition-all">
            <span className="text-cyan-500 font-mono pl-4 pr-2 font-bold">{'>'}</span>
            <input
              type="text"
              value={inputPath}
              onChange={(e) => setInputPath(e.target.value)}
              disabled={loading}
              placeholder="请输入文件夹绝对路径 (例如: /Users/xxx/Movies 或 D:\Media)"
              className="flex-1 bg-transparent border-none text-slate-200 font-mono py-3 outline-none placeholder-slate-500 disabled:opacity-50 w-full"
            />
          </div>
          
          {loading ? (
             <button onClick={() => handleTaskAction('stop')} className="w-full py-3 bg-red-950/40 text-red-400 border border-red-900/50 rounded-lg font-mono tracking-widest hover:bg-red-900/50 transition-all flex justify-center items-center">
               <Square className="w-4 h-4 mr-2" />
               停止任务
             </button>
          ) : (
             <button
               onClick={handleScan}
               disabled={!inputPath.trim()}
               className="w-full py-3 bg-cyan-400 text-slate-950 border border-cyan-400 rounded-lg font-mono tracking-widest hover:bg-cyan-300 hover:shadow-[0_0_15px_rgba(6,182,212,0.6)] focus:outline-none focus:ring-2 focus:ring-cyan-500/50 disabled:opacity-70 disabled:bg-slate-800 disabled:text-slate-300 disabled:border-slate-700 disabled:cursor-not-allowed transition-all flex justify-center items-center font-bold"
             >
               <MonitorUp className="w-4 h-4 mr-2" />
               开始扫描本地文件夹
             </button>
          )}
        </div>

        {error && (
          <div className="p-4 bg-red-950/30 text-red-400 rounded-lg flex items-start space-x-3 text-sm border border-red-900/50 font-mono">
            <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5 text-red-500" />
            <span className="leading-relaxed">{error}</span>
          </div>
        )}

        {/* Task Controls */}
        {(loading || processing) && taskId && (
          <div className="flex flex-col sm:flex-row items-center justify-between bg-indigo-950/30 p-4 rounded-lg border border-indigo-900/50">
            <div className="flex items-center space-x-3 mb-4 sm:mb-0">
               <span className="relative flex h-3 w-3">
                 {taskState === 'running' && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>}
                 <span className={`relative inline-flex rounded-full h-3 w-3 ${taskState === 'running' ? 'bg-cyan-500' : taskState === 'paused' ? 'bg-amber-500' : 'bg-slate-600'}`}></span>
               </span>
               <span className="text-sm font-mono text-indigo-300 tracking-wider">
                  任务状态: {taskState === 'running' ? '运行中' : taskState === 'paused' ? '已暂停' : '已停止'}
               </span>
            </div>
            
            <div className="flex space-x-3">
              {taskState === 'running' && (
                <button onClick={() => handleTaskAction('pause')} className="px-4 py-1.5 bg-slate-900 border border-slate-700 text-slate-300 hover:text-white rounded text-xs font-mono hover:bg-slate-800 transition-colors flex items-center">
                  <Pause className="w-3.5 h-3.5 mr-1.5" />
                  暂停
                </button>
              )}
              {taskState === 'paused' && (
                <button onClick={() => handleTaskAction('resume')} className="px-4 py-1.5 bg-cyan-950 border border-cyan-800 text-cyan-400 rounded text-xs font-mono hover:bg-cyan-900 transition-colors flex items-center">
                  <Play className="w-3.5 h-3.5 mr-1.5" />
                  继续
                </button>
              )}
              {taskState !== 'stopped' && (
                <button onClick={() => handleTaskAction('stop')} className="px-4 py-1.5 bg-slate-900 border border-red-900/50 text-red-400 rounded text-xs font-mono hover:bg-red-950/50 transition-colors flex items-center hover:border-red-500">
                  <Square className="w-3.5 h-3.5 mr-1.5" />
                  停止/取消当前任务
                </button>
              )}
            </div>
          </div>
        )}

        {result && result.folderPath && (
          <div className="p-1 pb-8 space-y-6">
            
            <div className="flex flex-col space-y-1">
              <span className="text-slate-500 text-xs font-mono uppercase tracking-wider text-opacity-80">扫描根目录 (已处理 {result.total} 个文件):</span>
              <span className="text-slate-200 font-mono text-sm break-all">{result.folderPath}</span>
            </div>
            
            {/* Action Dashboard - 3 Column Grid */}
            {result.results.length > 0 && (!loading || taskState === 'paused') && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <button
                  onClick={handleExportCSV}
                  disabled={processing || (loading && taskState !== 'paused')}
                  className="py-4 px-4 bg-slate-900 border border-slate-700 text-slate-300 rounded-lg text-sm font-mono tracking-wide hover:border-slate-500 hover:text-slate-100 disabled:opacity-50 transition-all flex flex-col items-center justify-center space-y-2 group"
                >
                  <Download className="w-6 h-6 text-slate-500 group-hover:text-slate-300 transition-colors" />
                  <span>导出 CSV</span>
                </button>
                <button
                  onClick={handleOpenSyncModal}
                  disabled={processing || (loading && taskState !== 'paused')}
                  className="py-4 px-4 bg-slate-900 border border-indigo-900 text-indigo-400 rounded-lg text-sm font-mono tracking-wide hover:border-indigo-600 hover:text-indigo-300 hover:bg-indigo-950/30 disabled:opacity-50 transition-all flex flex-col items-center justify-center space-y-2 group"
                >
                  <RefreshCcw className="w-6 h-6 text-indigo-500 group-hover:text-indigo-400 transition-colors" />
                  <span>物理时间恢复</span>
                </button>
                <button
                  onClick={handleOpenRenameModal}
                  disabled={processing || (loading && taskState !== 'paused')}
                  className="py-4 px-4 bg-slate-900 border border-emerald-900 text-emerald-400 rounded-lg text-sm font-mono tracking-wide hover:border-emerald-600 hover:text-emerald-300 hover:bg-emerald-950/30 disabled:opacity-50 transition-all flex flex-col items-center justify-center space-y-2 group"
                >
                  <FileEdit className="w-6 h-6 text-emerald-500 group-hover:text-emerald-400 transition-colors" />
                  <span>规则重命名</span>
                </button>
              </div>
            )}

            {/* Progress */}
            {progress && (
              <div className="p-4 bg-slate-900 rounded-lg border border-slate-800">
                <div className="flex justify-between items-center mb-2 font-mono">
                  <span className="text-xs text-slate-400 tracking-wider">
                    正在执行 {progress.type === 'sync' ? '时间恢复' : progress.type === 'rename' ? '重命名' : '深度写入元数据'}...
                  </span>
                  <span className="text-xs text-cyan-500">{progress.current} / {progress.total}</span>
                </div>
                <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                  <div className="bg-cyan-500 h-1.5 rounded-full transition-all duration-300" style={{ width: `${Math.max(5, (progress.current / progress.total) * 100)}%` }}></div>
                </div>
              </div>
            )}
            
            {/* Process Result */}
            {processResult && (
              <div className="p-4 bg-emerald-950/20 text-emerald-400 text-sm rounded-lg border border-emerald-900/50 flex items-start space-x-3 font-mono">
                <CheckCircle className="w-5 h-5 flex-shrink-0 mt-0.5 text-emerald-500" />
                <div>
                  <p className="font-bold tracking-wide">
                    {processResult.type === 'sync' ? '时间同步完成' : processResult.type === 'rename' ? '重命名完成' : '深度写入元数据完成'}
                    {processResult.data.stopped ? ' (已终止)' : ''}
                  </p>
                  <div className="mt-1 flex space-x-4 text-xs">
                    <span className="text-emerald-500/80">成功: {processResult.data.successCount}</span>
                    {(processResult.data.skippedCount || 0) > 0 && (
                      <span className="text-slate-400">跳过: {processResult.data.skippedCount}</span>
                    )}
                  </div>
                  {processResult.data.errorCount > 0 && (
                    <p className="text-red-400 mt-1 text-xs">失败: {processResult.data.errorCount} (详见控制台)</p>
                  )}
                </div>
              </div>
            )}

            {/* Table Filters */}
            <div className="flex justify-between items-center bg-slate-900 p-2 rounded-lg w-full flex-wrap gap-2 border border-slate-800">
                <div className="flex space-x-2">
                  <button 
                    onClick={() => setViewMode('flat')} 
                    className={`px-3 py-1.5 text-xs font-mono tracking-wide rounded flex items-center transition-all ${viewMode === 'flat' ? 'bg-cyan-950/50 text-cyan-400 border border-cyan-900' : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800 border border-transparent'}`}
                  >
                    <ListIcon className="w-3.5 h-3.5 mr-1.5" /> 列表视图
                  </button>
                  <button 
                    onClick={() => setViewMode('tree')} 
                    className={`px-3 py-1.5 text-xs font-mono tracking-wide rounded flex items-center transition-all ${viewMode === 'tree' ? 'bg-cyan-950/50 text-cyan-400 border border-cyan-900' : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800 border border-transparent'}`}
                  >
                    <FolderTree className="w-3.5 h-3.5 mr-1.5" /> 目录视图
                  </button>
                </div>
                
                <div className="flex items-center space-x-3 text-xs font-mono">
                  <Filter className="w-3.5 h-3.5 text-slate-500" />
                  <span className="text-slate-400">时间来源:</span>
                  <select 
                    value={timeSourceFilter}
                    onChange={(e) => { setTimeSourceFilter(e.target.value); setPage(1); }}
                    className="border-slate-700 bg-slate-950 rounded py-1 px-2 focus:ring-1 focus:ring-cyan-500 text-slate-300 outline-none"
                  >
                    <option value="all">全部来源</option>
                    <option value="内部元数据">仅内部元数据</option>
                    <option value="文件系统时间">仅文件系统时间</option>
                  </select>
                </div>
            </div>

            {/* Data Table */}
            <div className="border border-slate-800 rounded-lg bg-slate-900/50 relative overflow-hidden">
              {viewMode === 'flat' ? (
                <div className="max-h-[500px] overflow-y-auto custom-scrollbar">
                  <table className="w-full text-left text-xs whitespace-nowrap border-collapse">
                    <thead className="bg-slate-900/90 backdrop-blur-md sticky top-0 z-10 font-mono tracking-wider">
                      <tr>
                        <th className="px-4 py-3 font-semibold text-slate-400 w-14 text-center border-b border-slate-800">
                          <TableSelectMenu 
                            isPageSelected={paginatedResults.length > 0 && paginatedResults.every(f => selectedFiles.has(f.relativePath))}
                            isAllSelected={sortedResults.length > 0 && sortedResults.every(f => selectedFiles.has(f.relativePath))}
                            onSelectPage={handleSelectPage}
                            onSelectAll={handleSelectAll}
                            onSelectNone={handleSelectNone}
                            totalItems={sortedResults.length}
                          />
                        </th>
                        <th className="px-4 py-3 font-semibold text-slate-400 cursor-pointer select-none hover:bg-slate-800 border-b border-slate-800 transition-colors" onClick={() => requestSort('relativePath')}>
                          <div className="flex items-center min-w-[300px] resize-x overflow-hidden">相对路径 {getSortIcon('relativePath')}</div>
                        </th>
                        <th className="px-4 py-3 font-semibold text-slate-400 cursor-pointer select-none hover:bg-slate-800 border-b border-slate-800 transition-colors" onClick={() => requestSort('type')}>
                          <div className="flex items-center min-w-[80px] resize-x overflow-hidden">类型 {getSortIcon('type')}</div>
                        </th>
                        <th className="px-4 py-3 font-semibold text-slate-400 cursor-pointer select-none hover:bg-slate-800 border-b border-slate-800 transition-colors" onClick={() => requestSort('timeSource')}>
                          <div className="flex items-center min-w-[100px] resize-x overflow-hidden">时间来源 {getSortIcon('timeSource')}</div>
                        </th>
                        <th className="px-4 py-3 font-semibold text-slate-400 cursor-pointer select-none hover:bg-slate-800 border-b border-slate-800 transition-colors" onClick={() => requestSort('timestamp')}>
                          <div className="flex items-center min-w-[120px] resize-x overflow-hidden">解析时间戳 {getSortIcon('timestamp')}</div>
                        </th>
                        <th className="px-4 py-3 font-semibold text-slate-400 cursor-pointer select-none hover:bg-slate-800 border-b border-slate-800 transition-colors" onClick={() => requestSort('date')}>
                          <div className="flex items-center min-w-[160px] resize-x overflow-hidden">标准时间 {getSortIcon('date')}</div>
                        </th>
                        <th className="px-4 py-3 font-semibold text-slate-400 text-right cursor-pointer select-none hover:bg-slate-800 border-b border-slate-800 transition-colors" onClick={() => requestSort('parseDuration')}>
                          <div className="flex items-center justify-end min-w-[100px] resize-x overflow-hidden">单文件耗时 {getSortIcon('parseDuration')}</div>
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/50">
                      {sortedResults.length === 0 && (
                        <tr><td colSpan={7} className="px-4 py-12 text-center text-slate-500 font-mono tracking-widest">该目录下尚未解析到媒体文件或符合条件的文件</td></tr>
                      )}
                      {paginatedResults.map((item, idx) => (
                        <tr 
                          key={idx} 
                          className={`hover:bg-slate-800/60 transition-colors group cursor-pointer ${activeFile?.relativePath === item.relativePath ? 'bg-slate-800/80' : ''}`}
                          onClick={(e) => {
                            if ((e.target as HTMLElement).tagName === 'INPUT') return;
                            handleFileClick(item);
                          }}
                        >
                          <td className="px-4 py-2.5 text-center">
                            <input 
                              type="checkbox" 
                              className="rounded border-slate-700 bg-slate-900 text-cyan-500 focus:ring-cyan-500/50 focus:ring-offset-slate-900 cursor-pointer"
                              checked={selectedFiles.has(item.relativePath)}
                              onChange={() => handleToggleSelect(item.relativePath)}
                            />
                          </td>
                          <td className="px-4 py-2.5 font-mono text-slate-300 break-all" title={item.relativePath}>{item.relativePath}</td>
                          <td className="px-4 py-2.5 font-mono">
                            {item.type === 'video' ? (
                               <span className="text-indigo-400 bg-indigo-950/40 border border-indigo-900/50 px-2 py-0.5 rounded-full text-[10px]">视频</span>
                            ) : (
                               <span className="text-emerald-400 bg-emerald-950/40 border border-emerald-900/50 px-2 py-0.5 rounded-full text-[10px]">图片</span>
                            )}
                          </td>
                          <td className="px-4 py-2.5 font-mono">
                             {item.timeSource === '内部元数据' ? (
                               <span className="text-emerald-400 bg-emerald-950/50 border border-emerald-900/50 px-1.5 py-0.5 rounded text-[10px]">内部元数据</span>
                             ) : (
                               <span className="text-amber-400 bg-amber-950/50 border border-amber-900/50 px-1.5 py-0.5 rounded text-[10px]">文件系统时间</span>
                             )}
                          </td>
                          <td className="px-4 py-2.5 font-mono text-slate-500">{item.timestamp}</td>
                          <td className="px-4 py-2.5 font-mono text-cyan-100 flex items-center">
                            {formatTime(item.date)}
                            {item.timeSource !== '内部元数据' && (
                              <AlertCircle className="w-3 h-3 text-amber-500 ml-2 opacity-0 group-hover:opacity-100 transition-opacity" title="Warning: Meta absent" />
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono text-slate-500">{item.parseDuration}ms</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="p-4 max-h-[500px] overflow-y-auto custom-scrollbar">
                  {treeData && <TreeNode node={treeData} selectedFiles={selectedFiles} onToggleSelect={handleToggleSelect} onFileClick={handleFileClick} activeFile={activeFile} />}
                </div>
              )}
            </div>
            {viewMode === 'flat' && (
              <Pagination 
                page={page} 
                pageSize={pageSize} 
                totalItems={sortedResults.length} 
                onPageChange={setPage} 
                onPageSizeChange={setPageSize} 
              />
            )}
          </div>
        )}

        {showSelectWarning && (
          <div className="absolute inset-0 bg-slate-950/80 z-50 p-6 flex flex-col justify-center items-center backdrop-blur-sm">
             <div className="bg-slate-900 border border-slate-800 p-6 rounded-xl max-w-sm w-full text-center shadow-2xl">
                <AlertCircle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
                <h3 className="text-lg font-mono text-slate-200 mb-2">未选择文件</h3>
                <p className="text-sm font-mono text-slate-400 mb-6 leading-relaxed">
                  请先在文件列表中勾选需要操作的文件。
                </p>
                <button onClick={() => setShowSelectWarning(false)} className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-mono text-sm rounded-lg transition-colors border border-slate-700">
                  知道了
                </button>
             </div>
          </div>
        )}

        {isRenameModalOpen && result && (
          <RenamePreviewModal 
            isOpen={isRenameModalOpen}
            onClose={() => {
              setIsRenameModalOpen(false);
              if (processResult) {
                setProcessResult(null);
                handleScan();
              }
            }}
            files={result.results.filter(f => selectedFiles.has(f.relativePath))}
            folderPath={result.folderPath}
            onExecute={handleExecuteRenameFromModal}
            processing={processing}
            progress={progress}
            processResult={processResult}
            taskState={taskState}
            onPauseTask={() => handleTaskAction('pause')}
            onResumeTask={() => handleTaskAction('resume')}
            onStopTask={() => handleTaskAction('stop')}
          />
        )}

        {isSyncModalOpen && result && (
          <SyncTimePreviewModal 
            isOpen={isSyncModalOpen}
            onClose={() => {
              setIsSyncModalOpen(false);
              if (processResult && !processResult.data.stopped) {
                setProcessResult(null);
                handleScan();
              }
            }}
            files={modalFiles}
            onExecute={handleExecuteSyncFromModal}
            onInjectMetadata={handleExecuteInjectFromModal}
            processing={processing}
            progress={progress}
            processResult={processResult}
            taskState={taskState}
            onPauseTask={() => handleTaskAction('pause')}
            onResumeTask={() => handleTaskAction('resume')}
            onStopTask={() => handleTaskAction('stop')}
            onClearResult={handleClearResult}
          />
        )}
      </div>

      {activeFile && (
        <div className="w-full xl:w-80 flex-shrink-0 bg-slate-900 border border-slate-800 rounded-xl p-4 sticky top-8 max-h-[calc(100vh-4rem)] flex flex-col shadow-2xl transition-all duration-300 transform translate-x-0 z-20">
          <div className="flex justify-between items-center border-b border-slate-800 pb-3 mb-3">
            <h2 className="text-sm font-mono font-bold text-slate-200 truncate pr-2" title={activeFile.originalName}>
              {activeFile.originalName}
            </h2>
            <button onClick={() => setActiveFile(null)} className="text-slate-500 hover:text-slate-300 transition-colors">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
          
          <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-4 text-xs font-mono">
            {loadingMetadata ? (
              <div className="flex flex-col items-center justify-center h-40 space-y-3 text-cyan-500">
                <span className="w-6 h-6 rounded-full border-2 border-cyan-500 border-t-transparent animate-spin"></span>
                <span className="tracking-widest opacity-80">加载元数据...</span>
              </div>
            ) : metadataError ? (
              <div className="text-red-400 bg-red-950/30 p-3 rounded border border-red-900/50 leading-relaxed">
                {metadataError}
              </div>
            ) : activeMetadata ? (
              getGroupedMetadata(activeMetadata).map((group, gIdx) => (
                <div key={gIdx} className="mb-4 last:mb-0">
                  <h3 className="text-cyan-400 font-bold mb-2 pb-1 border-b border-slate-700/50 sticky top-0 bg-slate-900 z-10">{group.name}</h3>
                  <div className="space-y-2">
                    {group.items.map((item, iIdx) => (
                      <div key={iIdx} className="flex flex-col border-b border-slate-800/50 pb-1.5 last:border-0">
                        <span className="text-slate-500 mb-0.5 break-all">{item.label} <span className="text-slate-600 text-[10px]">({item.originalKey})</span></span>
                        <span className="text-slate-300 break-all">{item.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            ) : (
              <div className="text-slate-500 text-center mt-10">暂无数据</div>
            )}
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
