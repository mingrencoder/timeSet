/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { Clock, AlertCircle, MonitorUp, Download, RefreshCcw, FileEdit, CheckCircle, FolderTree, List as ListIcon, ChevronDown, ChevronRight, FileText, Filter, Pause, Play, Square } from 'lucide-react';
import RenamePreviewModal from './components/RenamePreviewModal';
import SyncTimePreviewModal from './components/SyncTimePreviewModal';

const formatTime = (isoString: string) => {
  return isoString.replace('T', ' ').replace('Z', '').split('.')[0];
};

const TreeNode: React.FC<{ node: any, level?: number }> = ({ node, level = 0 }) => {
  const [isOpen, setIsOpen] = useState(true);

  if (node.isFile) {
    return (
      <div className="flex items-center justify-between text-xs py-2 hover:bg-gray-50 border-b border-gray-50 transition-colors group" style={{ paddingLeft: `${level * 20 + 20}px` }}>
        <div className="flex items-center min-w-0 pr-4">
          <FileText className="w-4 h-4 text-gray-400 mr-2 flex-shrink-0" />
          <span className="text-gray-700 truncate font-medium" title={node.name}>{node.name}</span>
        </div>
        <div className="flex items-center flex-shrink-0 pr-4 space-x-6">
           <span className="text-gray-500 w-16 text-right">{node.original.type === 'video' ? '视频' : '图片'}</span>
           <span className="text-gray-500 w-24 text-right">
             {node.original.timeSource === '内部元数据' ? (
               <span className="text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded text-[10px]">内部元数据</span>
             ) : (
               <span className="text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded text-[10px]">文件系统时间</span>
             )}
           </span>
           <span className="text-gray-800 font-mono w-40 text-right flex items-center justify-end">
             {formatTime(node.original.date)}
             {(!node.original.exifTime && node.original.mtime && node.original.timestamp === node.original.mtime) && (
               <span className="ml-2 text-[10px] bg-orange-100 text-orange-600 px-1 py-0.5 rounded" title="无拍摄时间(EXIF/元数据)，当前显示为系统文件修改时间">系统时间</span>
             )}
           </span>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div 
        className="flex items-center text-xs py-2 hover:bg-gray-100 cursor-pointer font-medium text-gray-700 transition-colors rounded-md" 
        style={{ paddingLeft: `${level * 20}px` }}
        onClick={() => setIsOpen(!isOpen)}
      >
        {isOpen ? <ChevronDown className="w-4 h-4 text-gray-500 mr-1 flex-shrink-0" /> : <ChevronRight className="w-4 h-4 text-gray-500 mr-1 flex-shrink-0" />}
        <FolderTree className="w-4 h-4 text-indigo-500 mr-2 flex-shrink-0" />
        {node.name}
      </div>
      {isOpen && (
        <div className="mt-1">
          {Object.values(node.children).map((child: any, idx) => (
            <TreeNode key={idx} node={child} level={level + 1} />
          ))}
        </div>
      )}
    </div>
  );
};

export default function App() {
  const [loading, setLoading] = useState(false);
  const [inputPath, setInputPath] = useState('');
  const [result, setResult] = useState<{ folderPath: string; total: number; results: Array<any> } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'flat' | 'tree'>('flat');
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
  const [timeSourceFilter, setTimeSourceFilter] = useState<string>('all');
  
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

  const requestSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
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
    if (!taskId) return;
    try {
      await fetch(`/api/task/${taskId}/${action}`, { method: 'POST' });
      setTaskState(action === 'stop' ? 'stopped' : action === 'pause' ? 'paused' : 'running');
    } catch (e) {
      console.error(e);
    }
  };

  // 1. 纯前端导出 CSV
  const handleExportCSV = () => {
    if (!result || result.results.length === 0) return;
    const header = ['原始路径', '相对路径', '媒体类型', '13位时间戳', '格式化时间', '时间来源'];
    
    const dataToExport = timeSourceFilter === 'all' 
      ? result.results 
      : result.results.filter(f => f.timeSource === timeSourceFilter);
      
    const rows = dataToExport.map(f => [
        `${result.folderPath}/${f.relativePath}`, 
        f.relativePath, 
        f.type === 'video' ? '视频' : '图片',
        f.timestamp, 
        formatTime(f.date),
        f.timeSource || '未知'
    ]);

    const escapeCsv = (str: string | number) => `"${String(str).replace(/"/g, '""')}"`;
    const csvContent = [
      header.map(escapeCsv).join(','),
      ...rows.map(row => row.map(escapeCsv).join(','))
    ].join('\n');
    
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `timeline_export_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleOpenSyncModal = () => {
    if (!result || result.results.length === 0) return;
    setIsSyncModalOpen(true);
  };

  const executeStreamOp = async (url: string, body: any, type: string) => {
    setProcessing(true);
    setProcessResult(null);
    setProgress({ type, current: 0, total: body.renamePlan ? body.renamePlan.length : body.syncPlan.length });
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

  const handleExecuteSyncFromModal = (syncPlan: any[]) => {
    setIsSyncModalOpen(false);
    executeStreamOp('/api/sync-time', { folderPath: result?.folderPath, syncPlan }, 'sync');
  };

  const handleOpenRenameModal = () => {
    if (!result || result.results.length === 0) return;
    setIsRenameModalOpen(true);
  };

  const handleExecuteRenameFromModal = (renamePlan: any[]) => {
    setIsRenameModalOpen(false);
    executeStreamOp('/api/rename-files', { folderPath: result?.folderPath, renamePlan }, 'rename');
  };

  const handleScan = async () => {
    if (!inputPath.trim()) {
      setError('请输入有效的绝对路径');
      return;
    }
    
    setLoading(true);
    setError(null);
    setResult({ folderPath: '', total: 0, results: [] });

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
              if (currentResult.results.length > 500) {
                  currentResult.results.pop();
              }
              setResult({ ...currentResult });
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

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-4xl bg-white rounded-xl shadow-lg p-8 border border-gray-100">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">极速媒体时间解析</h1>
          <p className="text-sm text-gray-500 mt-2">输入本地文件夹绝对路径，自动递归扫描解析</p>
        </div>

        <div className="space-y-4">
          <input
            type="text"
            value={inputPath}
            onChange={(e) => setInputPath(e.target.value)}
            disabled={loading}
            placeholder="请输入文件夹绝对路径 (例如: /Users/xxx/Movies 或 D:\Media)"
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent outline-none disabled:opacity-50"
          />
          <button
            onClick={handleScan}
            disabled={loading || !inputPath.trim()}
            className="w-full py-3 px-4 bg-gray-900 text-white rounded-lg font-medium hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-900 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center space-x-2 shadow-sm"
          >
            <MonitorUp className="w-5 h-5" />
            <span>{loading ? '正在深度扫描解析中...' : '开始扫描本地文件夹'}</span>
          </button>
        </div>

        {error && (
          <div className="mt-6 p-4 bg-red-50 text-red-700 rounded-lg flex items-start space-x-3 text-sm border border-red-100">
            <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <span className="leading-relaxed">{error}</span>
          </div>
        )}

        {/* Task Controls for Scan, Sync, Rename */}
        {(loading || processing) && taskId && (
          <div className="mt-6 flex flex-col sm:flex-row items-center justify-between bg-indigo-50 p-4 rounded-lg border border-indigo-100 shadow-inner">
            <div className="flex items-center space-x-2 mb-2 sm:mb-0">
               <span className="relative flex h-3 w-3">
                 {taskState === 'running' && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>}
                 <span className={`relative inline-flex rounded-full h-3 w-3 ${taskState === 'running' ? 'bg-indigo-500' : taskState === 'paused' ? 'bg-yellow-500' : 'bg-gray-400'}`}></span>
               </span>
               <span className="text-sm font-medium text-indigo-900">
                  任务状态: {taskState === 'running' ? '运行中' : taskState === 'paused' ? '已暂停' : '已停止'}
               </span>
            </div>
            
            <div className="flex space-x-2">
              {taskState === 'running' && (
                <button onClick={() => handleTaskAction('pause')} className="px-3 py-1.5 bg-white border border-indigo-200 text-indigo-700 rounded text-xs font-medium hover:bg-indigo-50 transition-colors flex items-center space-x-1 shadow-sm">
                  <Pause className="w-3.5 h-3.5" />
                  <span>暂停</span>
                </button>
              )}
              {taskState === 'paused' && (
                <button onClick={() => handleTaskAction('resume')} className="px-3 py-1.5 bg-indigo-600 border border-indigo-600 text-white rounded text-xs font-medium hover:bg-indigo-700 transition-colors flex items-center space-x-1 shadow-sm">
                  <Play className="w-3.5 h-3.5" />
                  <span>继续</span>
                </button>
              )}
              {taskState !== 'stopped' && (
                <button onClick={() => handleTaskAction('stop')} className="px-3 py-1.5 bg-white border border-red-200 text-red-600 rounded text-xs font-medium hover:bg-red-50 transition-colors flex items-center space-x-1 shadow-sm">
                  <Square className="w-3.5 h-3.5" />
                  <span>停止</span>
                </button>
              )}
            </div>
          </div>
        )}

        {result && result.folderPath && (
          <div className="mt-6 p-5 bg-gray-50 rounded-lg border border-gray-200 overflow-hidden">
            <h3 className="text-sm font-semibold text-gray-900 mb-4 flex items-center">
              <Clock className="w-4 h-4 mr-2" />
              解析中 / 完成 (已处理 {result.total} 个文件)
            </h3>
            
            <div className="mb-4 flex flex-col space-y-1">
              <span className="text-gray-500 text-xs">扫描根目录:</span>
              <span className="text-gray-900 font-mono text-xs break-all">{result.folderPath}</span>
            </div>
            
            {/* 核心操作按钮组 */}
            {result.results.length > 0 && !loading && (
              <div className="mb-4 pt-4 border-t border-gray-200">
                <div className="flex flex-col sm:flex-row gap-3">
                  <button
                    onClick={handleExportCSV}
                    disabled={processing}
                    className="flex-1 py-2 px-3 bg-white border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-900 disabled:opacity-50 transition-all flex items-center justify-center space-x-2 shadow-sm"
                  >
                    <Download className="w-4 h-4" />
                    <span>1. 导出时间线备份 (CSV)</span>
                  </button>
                  <button
                    onClick={handleOpenSyncModal}
                    disabled={processing}
                    className="flex-1 py-2 px-3 bg-indigo-50 border border-indigo-200 text-indigo-700 rounded-lg text-sm font-medium hover:bg-indigo-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 transition-all flex items-center justify-center space-x-2 shadow-sm"
                  >
                    <RefreshCcw className="w-4 h-4" />
                    <span>2. 恢复物理时间预览...</span>
                  </button>
                  <button
                    onClick={handleOpenRenameModal}
                    disabled={processing}
                    className="flex-1 py-2 px-3 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-lg text-sm font-medium hover:bg-emerald-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 disabled:opacity-50 transition-all flex items-center justify-center space-x-2 shadow-sm"
                  >
                    <FileEdit className="w-4 h-4" />
                    <span>3. 规则重命名预览...</span>
                  </button>
                </div>

                {/* 进度条 */}
                {progress && (
                  <div className="mt-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm font-medium text-gray-700">
                        正在执行 {progress.type === 'sync' ? '时间恢复' : '重命名'}...
                      </span>
                      <span className="text-sm text-gray-500">{progress.current} / {progress.total}</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2.5 overflow-hidden">
                      <div className="bg-indigo-600 h-2.5 rounded-full transition-all duration-300" style={{ width: `${Math.max(5, (progress.current / progress.total) * 100)}%` }}></div>
                    </div>
                  </div>
                )}
                
                {/* 操作结果提示 */}
                {processResult && (
                  <div className="mt-4 p-4 bg-green-50 text-green-800 text-sm rounded-lg border border-green-200 flex items-start space-x-3">
                    <CheckCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-green-900">
                        {processResult.type === 'sync' ? '时间同步完成' : '重命名完成'}
                        {processResult.data.stopped ? ' (已终止)' : ''}
                      </p>
                      <p className="mt-1">成功: {processResult.data.successCount} 个文件</p>
                      {processResult.data.errorCount > 0 && (
                        <p className="text-red-600 mt-1 font-medium">失败: {processResult.data.errorCount} 个文件 (详见控制台)</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="mb-3 flex justify-between items-center bg-gray-100 p-1.5 rounded-lg w-full flex-wrap gap-2">
                <div className="flex space-x-1">
                  <button 
                    onClick={() => setViewMode('flat')} 
                    className={`px-3 py-1.5 text-xs font-medium rounded-md flex items-center transition-shadow ${viewMode === 'flat' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                  >
                    <ListIcon className="w-4 h-4 mr-1.5" /> 列表视图
                  </button>
                  <button 
                    onClick={() => setViewMode('tree')} 
                    className={`px-3 py-1.5 text-xs font-medium rounded-md flex items-center transition-shadow ${viewMode === 'tree' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                  >
                    <FolderTree className="w-4 h-4 mr-1.5" /> 目录视图
                  </button>
                </div>
                
                <div className="flex items-center space-x-2 text-xs">
                  <Filter className="w-3.5 h-3.5 text-gray-400" />
                  <span className="text-gray-600 font-medium">时间来源:</span>
                  <select 
                    value={timeSourceFilter}
                    onChange={(e) => setTimeSourceFilter(e.target.value)}
                    className="border-none bg-white rounded-md py-1 px-2 shadow-sm focus:ring-1 focus:ring-indigo-500 text-gray-700 outline-none"
                  >
                    <option value="all">全部来源</option>
                    <option value="内部元数据">仅内部元数据</option>
                    <option value="文件系统时间">仅文件系统时间</option>
                  </select>
                </div>
            </div>

            <div className="max-h-[400px] overflow-y-auto border border-gray-200 rounded bg-white relative shadow-inner">
              {viewMode === 'flat' ? (
                <table className="w-full text-left text-xs whitespace-nowrap">
                  <thead className="bg-gray-100 sticky top-0 shadow-sm z-10">
                    <tr>
                      <th className="px-4 py-3 font-medium text-gray-600 cursor-pointer select-none hover:bg-gray-200" onClick={() => requestSort('relativePath')}>
                        相对路径 {getSortIcon('relativePath')}
                      </th>
                      <th className="px-4 py-3 font-medium text-gray-600 cursor-pointer select-none hover:bg-gray-200" onClick={() => requestSort('type')}>
                        类型 {getSortIcon('type')}
                      </th>
                      <th className="px-4 py-3 font-medium text-gray-600 cursor-pointer select-none hover:bg-gray-200" onClick={() => requestSort('timeSource')}>
                        时间来源 {getSortIcon('timeSource')}
                      </th>
                      <th className="px-4 py-3 font-medium text-gray-600 cursor-pointer select-none hover:bg-gray-200" onClick={() => requestSort('timestamp')}>
                        解析时间戳 {getSortIcon('timestamp')}
                      </th>
                      <th className="px-4 py-3 font-medium text-gray-600 cursor-pointer select-none hover:bg-gray-200" onClick={() => requestSort('date')}>
                        标准时间 {getSortIcon('date')}
                      </th>
                      <th className="px-4 py-3 font-medium text-gray-600 text-right cursor-pointer select-none hover:bg-gray-200" onClick={() => requestSort('parseDuration')}>
                        单文件耗时 {getSortIcon('parseDuration')}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {sortedResults.length === 0 && (
                      <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-500">该目录下尚未解析到媒体文件或符合条件的文件</td></tr>
                    )}
                    {sortedResults.map((item, idx) => (
                      <tr key={idx} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-2 font-mono text-gray-800 max-w-[200px] truncate" title={item.relativePath}>{item.relativePath}</td>
                        <td className="px-4 py-2 text-gray-500">{item.type === 'video' ? '视频' : '图片'}</td>
                        <td className="px-4 py-2">
                           {item.timeSource === '内部元数据' ? (
                             <span className="text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded text-[10px]">内部元数据</span>
                           ) : (
                             <span className="text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded text-[10px]">文件系统时间</span>
                           )}
                        </td>
                        <td className="px-4 py-2 font-mono text-gray-500">{item.timestamp}</td>
                        <td className="px-4 py-2 font-mono text-gray-800">
                          {formatTime(item.date)}
                          {(!item.exifTime && item.mtime && item.timestamp === item.mtime) && (
                             <span className="ml-2 text-[10px] bg-orange-100 text-orange-600 px-1 py-0.5 rounded" title="无拍摄时间(EXIF/元数据)，当前显示为系统文件修改时间">系统时间</span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-right font-mono text-emerald-600">{item.parseDuration} ms</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="p-4">
                  {treeData && <TreeNode node={treeData} />}
                </div>
              )}
            </div>
            <div className="mt-2 text-right text-xs text-gray-400">
              * 为防止浏览器内存溢出(OOM)，前端仅展示最新解析的 {Math.min(500, result.total)} 条记录。
            </div>
          </div>
        )}

        {isRenameModalOpen && result && (
          <RenamePreviewModal 
            isOpen={isRenameModalOpen}
            onClose={() => setIsRenameModalOpen(false)}
            files={result.results}
            folderPath={result.folderPath}
            onExecute={handleExecuteRenameFromModal}
          />
        )}

        {isSyncModalOpen && result && (
          <SyncTimePreviewModal 
            isOpen={isSyncModalOpen}
            onClose={() => setIsSyncModalOpen(false)}
            files={result.results}
            onExecute={handleExecuteSyncFromModal}
          />
        )}
      </div>
    </div>
  );
}
