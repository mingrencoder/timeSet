import React, { useState, useMemo, useRef } from 'react';
import { X, Play, Clock, Upload, FileText, FolderTree, List as ListIcon, ChevronDown, ChevronRight, Filter, AlertCircle } from 'lucide-react';
import { Pagination } from './Pagination';
import { TableSelectMenu } from './TableSelectMenu';

interface SyncTimePreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  files: any[];
  onExecute: (syncPlan: any[]) => void;
  onInjectMetadata?: (injectPlan: any[], skippedCount?: number) => void;
  processing?: boolean;
  progress?: any;
  processResult?: any;
  taskState?: string;
  onPauseTask?: () => void;
  onResumeTask?: () => void;
  onStopTask?: () => void;
  onClearResult?: () => void;
}

const TreeNode: React.FC<{ node: any, level?: number, selectedPaths?: Set<string>, onToggle?: (path: string) => void }> = ({ node, level = 0, selectedPaths, onToggle }) => {
  const [isOpen, setIsOpen] = useState(true);

  if (node.isFile) {
    const isSelected = selectedPaths ? selectedPaths.has(node.original.relativePath) : false;
    return (
      <div className="flex items-center text-xs py-1.5 hover:bg-slate-800/50 border-b border-slate-800/50 transition-colors group" style={{ paddingLeft: `${level * 20 + 20}px` }}>
        <input 
          type="checkbox" 
          checked={isSelected}
          onChange={() => onToggle && onToggle(node.original.relativePath)}
          className="mr-3 rounded border-slate-700 bg-slate-900 text-indigo-500 focus:ring-indigo-500/50 cursor-pointer"
        />
        <FileText className="w-4 h-4 text-slate-500 mr-2 flex-shrink-0" />
        <div className="flex-1 min-w-0 flex justify-between gap-4 pr-4 items-center">
          <span className="text-slate-300 font-mono truncate min-w-[100px]" title={node.name}>{node.name}</span>
          <div className="flex items-center space-x-3 truncate flex-shrink-0">
             <span className="text-slate-500 w-24 text-right">
               {node.original.timeSource === '内部元数据' ? (
                 <span className="text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded text-[10px]">内部元数据</span>
               ) : (
                 <span className="text-amber-400 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded text-[10px]">文件系统时间</span>
               )}
             </span>
             {node.original.source === 'current' ? (
               <span className="bg-red-500/10 text-red-400 text-[10px] px-2 py-0.5 rounded flex-shrink-0 border border-red-500/20">未匹配</span>
             ) : (
               <span className="bg-emerald-500/10 text-emerald-400 text-[10px] px-2 py-0.5 rounded flex-shrink-0 border border-emerald-500/20" title={`匹配行: ${node.original.rowIndex}\n匹配路径: ${node.original.matchedFilePath}`}>已匹配</span>
             )}
             <span className={`font-mono text-[11px] w-[130px] text-right ${node.hasChanged ? 'text-emerald-400 font-medium' : 'text-slate-500'}`}>
                {node.targetDate}
             </span>
             <div className="w-[50px] text-right font-mono">
               {node.hasChanged ? (
                  <span className="bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-[10px] px-1.5 py-0.5 rounded flex-shrink-0">需更新</span>
               ) : (
                  <span className="bg-slate-800 border border-slate-700 text-slate-400 text-[10px] px-1.5 py-0.5 rounded flex-shrink-0">无变化</span>
               )}
             </div>
          </div>
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
            <TreeNode key={idx} node={child} level={level + 1} selectedPaths={selectedPaths} onToggle={onToggle} />
          ))}
        </div>
      )}
    </div>
  );
};

export default function SyncTimePreviewModal({ isOpen, onClose, files, onExecute, onInjectMetadata, processing, progress, processResult, taskState, onPauseTask, onResumeTask, onStopTask, onClearResult }: SyncTimePreviewModalProps) {
  const [matchStrategy, setMatchStrategy] = useState<'relativePath' | 'filename'>('relativePath');
  const [csvData, setCsvData] = useState<{relativePath: string, timestamp: number, rowIndex: number}[]>([]);
  const [csvLoaded, setCsvLoaded] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [viewMode, setViewMode] = useState<'flat' | 'tree'>('flat');
  const [page, setPage] = useState(1);
  const [onlyDifferences, setOnlyDifferences] = useState(false);
  const [onlyMatched, setOnlyMatched] = useState(false);
  const [timeSourceFilter, setTimeSourceFilter] = useState<string>('all');
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
  const [pageSize, setPageSize] = useState(100);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const parseText = (text: string) => {
      try {
        const rows = text.split('\n');
        
        if (rows.length <= 1) return;
        const parsed = [];
        
        for (let i = 1; i < rows.length; i++) {
          const rowText = rows[i].trim();
          if (!rowText) continue;
          
          // 简单正则解析 CSV 考虑双引号
          const cols = [];
          let current = '';
          let inQuotes = false;
          
          for (let j = 0; j < rowText.length; j++) {
            const char = rowText[j];
            if (char === '"') {
              if (inQuotes && rowText[j+1] === '"') {
                current += '"';
                j++;
              } else {
                inQuotes = !inQuotes;
              }
            } else if (char === ',' && !inQuotes) {
              cols.push(current);
              current = '';
            } else {
              current += char;
            }
          }
          cols.push(current);

          if (cols.length >= 4) {
            let relativePath = cols[1]?.trim() || '';
            relativePath = relativePath.replace(/^"|"$/g, '').replace(/""/g, '"');
            
            const timestampStr = cols[3]?.trim().replace(/^"|"$/g, '') || '';
            let formattedTimeStr = cols[4]?.trim().replace(/^"|"$/g, '');
            
            let originalTimestamp = parseInt(timestampStr, 10);
            let timestamp = originalTimestamp;
            
            if (formattedTimeStr) {
               formattedTimeStr = formattedTimeStr.replace(/^\t|="|"$/g, '').trim();
               
               const match = formattedTimeStr.match(/^(\d{4})[^\d](\d{1,2})[^\d](\d{1,2})[\sT]+(\d{1,2})[^\d](\d{1,2})(?:[^\d](\d{1,2}))?/);
               if (match) {
                   const year = parseInt(match[1], 10);
                   const month = parseInt(match[2], 10) - 1;
                   const day = parseInt(match[3], 10);
                   const hour = parseInt(match[4], 10);
                   const min = parseInt(match[5], 10);
                   const sec = match[6] ? parseInt(match[6], 10) : 0;
                   
                   const utcDate = new Date(Date.UTC(year, month, day, hour - 8, min, sec));
                   const parsedTimestamp = utcDate.getTime();
                   
                   if (!isNaN(originalTimestamp) && Math.abs(parsedTimestamp - originalTimestamp) < 1000) {
                       timestamp = originalTimestamp;
                   } else {
                       timestamp = parsedTimestamp;
                   }
               } else {
                   const parsedDate = new Date(formattedTimeStr);
                   if (!isNaN(parsedDate.getTime())) {
                       timestamp = parsedDate.getTime();
                   }
               }
            }
            
            if (relativePath && !isNaN(timestamp)) {
               parsed.push({ relativePath, timestamp, rowIndex: i + 1 });
            }
          }
        }
        setCsvData(parsed);
        setCsvLoaded(true);
      } catch (err) {
        console.error("解析 CSV 失败:", err);
      }
    };

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (text.includes('\uFFFD')) {
          // 如果出现乱码字符 (Replacement Character)，尝试使用 gbk 重新读取
          const reader2 = new FileReader();
          reader2.onload = (e) => {
             parseText(e.target?.result as string);
          };
          reader2.readAsText(file, 'gbk');
      } else {
          parseText(text);
      }
    };
    reader.readAsText(file);
  };

  const previewData = useMemo(() => {
    if (!csvLoaded) return [];

    // Build lookup maps
    const pathMap = new Map<string, {timestamp: number, rowIndex: number, matchedFilePath: string}>();
    const nameMap = new Map<string, {timestamp: number, rowIndex: number, matchedFilePath: string}>();
    
    csvData.forEach(item => {
       pathMap.set(item.relativePath, { timestamp: item.timestamp, rowIndex: item.rowIndex, matchedFilePath: item.relativePath });
       const fileName = item.relativePath.split(/[/\\]/).pop();
       if (fileName) nameMap.set(fileName, { timestamp: item.timestamp, rowIndex: item.rowIndex, matchedFilePath: item.relativePath });
    });

    return files.map(file => {
      let targetTimestamp = file.timestamp; // fallback to what we have
      let source = 'current';
      let rowIndex: number | undefined;
      let matchedFilePath: string | undefined;

      if (matchStrategy === 'relativePath') {
         if (pathMap.has(file.relativePath)) {
            const match = pathMap.get(file.relativePath)!;
            targetTimestamp = match.timestamp;
            rowIndex = match.rowIndex;
            matchedFilePath = match.matchedFilePath;
            source = 'csv_path';
         }
      } else {
         if (nameMap.has(file.originalName)) {
            const match = nameMap.get(file.originalName)!;
            targetTimestamp = match.timestamp;
            rowIndex = match.rowIndex;
            matchedFilePath = match.matchedFilePath;
            source = 'csv_name';
         }
      }
      
      const hasChanged = Math.abs(targetTimestamp - file.timestamp) > 1000; // allow 1s delta

      const d = new Date(targetTimestamp);
      const pad = (n: number) => n.toString().padStart(2, '0');
      const targetDate = isNaN(d.getTime()) ? '-' : `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

      const currentD = new Date(file.timestamp);
      const currentDate = isNaN(currentD.getTime()) ? '-' : `${currentD.getFullYear()}-${pad(currentD.getMonth() + 1)}-${pad(currentD.getDate())} ${pad(currentD.getHours())}:${pad(currentD.getMinutes())}:${pad(currentD.getSeconds())}`;

      return {
        ...file,
        targetTimestamp,
        targetDate,
        currentDate,
        source,
        hasChanged,
        rowIndex,
        matchedFilePath
      };
    });
  }, [files, csvData, matchStrategy, csvLoaded]);

  React.useEffect(() => {
     const initialSet = new Set<string>();
     previewData.forEach(p => {
        if (p.hasChanged) initialSet.add(p.relativePath);
     });
     setSelectedPaths(initialSet);
  }, [previewData]);

  const filteredData = useMemo(() => {
    let result = previewData;
    if (timeSourceFilter !== 'all') {
      result = result.filter(p => p.timeSource === timeSourceFilter);
    }
    if (onlyDifferences) {
      result = result.filter(p => p.hasChanged);
    }
    if (onlyMatched) {
      result = result.filter(p => p.source !== 'current');
    }
    return result;
  }, [previewData, onlyDifferences, onlyMatched, timeSourceFilter]);

  const sortedFilteredData = useMemo(() => {
    let sortableItems = [...filteredData];
    if (sortConfig !== null) {
      sortableItems.sort((a, b) => {
        let aValue = a[sortConfig.key as keyof typeof a];
        let bValue = b[sortConfig.key as keyof typeof b];
        
        if (sortConfig.key === 'targetDate') {
          aValue = a.targetTimestamp as never;
          bValue = b.targetTimestamp as never;
        } else if (sortConfig.key === 'currentDate') {
          aValue = a.timestamp as never;
          bValue = b.timestamp as never;
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
  }, [filteredData, sortConfig]);

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

  const treeData = useMemo(() => {
    const root = { name: 'root', isFile: false, children: {} as any };
    filteredData.forEach(item => {
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
        original: item,
        targetDate: item.targetDate,
        hasChanged: item.hasChanged
      };
    });
    return root;
  }, [filteredData]);

  const toggleSelection = (relativePath: string) => {
     const newSet = new Set(selectedPaths);
     if (newSet.has(relativePath)) newSet.delete(relativePath);
     else newSet.add(relativePath);
     setSelectedPaths(newSet);
  };

  const handleSelectPage = () => {
    const newSet = new Set(selectedPaths);
    const allPageChecked = paginatedData.length > 0 && paginatedData.every(f => newSet.has(f.relativePath));
    if (allPageChecked) {
      paginatedData.forEach(f => newSet.delete(f.relativePath));
    } else {
      paginatedData.forEach(f => newSet.add(f.relativePath));
    }
    setSelectedPaths(newSet);
  };

  const handleSelectAll = () => {
    const newSet = new Set(selectedPaths);
    filteredData.forEach(f => newSet.add(f.relativePath));
    setSelectedPaths(newSet);
  };

  const handleSelectNone = () => {
    setSelectedPaths(new Set());
  };

  if (!isOpen) return null;

  const [showNoChangeModal, setShowNoChangeModal] = useState(false);
  const [showUnmatchedModal, setShowUnmatchedModal] = useState(false);

  const [showInjectPreview, setShowInjectPreview] = useState(false);

  const executeSync = () => {
    const selectedItems = Array.from(selectedPaths)
      .map(path => previewData.find(p => p.relativePath === path))
      .filter(Boolean);
      
    const hasUnmatched = selectedItems.some(item => item!.source === 'current');
    if (hasUnmatched) {
      setShowUnmatchedModal(true);
      return;
    }

    const hasAnyChanges = selectedItems.some(item => item!.hasChanged);
    if (!hasAnyChanges) {
      setShowNoChangeModal(true);
      return;
    }

    const syncPlan = selectedItems.map(item => ({
      relativePath: item!.relativePath,
      targetTimestamp: item!.targetTimestamp
    }));
    onExecute(syncPlan);
  };

  const executeInject = () => {
    const selectedItems = Array.from(selectedPaths)
      .map(path => previewData.find(p => p.relativePath === path))
      .filter(Boolean);
      
    const hasUnmatched = selectedItems.some(item => item!.source === 'current');
    if (hasUnmatched) {
      setShowUnmatchedModal(true);
      return;
    }

    if (selectedItems.length === 0) {
      return;
    }

    setShowInjectPreview(true);
  };

  const totalPages = Math.ceil(filteredData.length / pageSize);
  const paginatedData = sortedFilteredData.slice((page - 1) * pageSize, page * pageSize);

  const matchedCount = previewData.filter(p => p.source !== 'current').length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 sm:p-6 font-sans">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-[95vw] 2xl:max-w-[1600px] max-h-[90vh] flex flex-col overflow-hidden">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex justify-between items-center bg-slate-950/50">
          <div>
            <h2 className="text-xl font-bold text-slate-100 font-mono tracking-wide flex items-center">
              <Clock className="w-5 h-5 mr-2 text-indigo-500" />
              物理时间恢复预览 //
            </h2>
            <p className="text-sm text-slate-500 mt-1 font-mono">上传之前导出的时间线 CSV 备份文件，精确恢复本地文件的物理时间</p>
          </div>
          <button onClick={() => {
            if (processResult && onClearResult) {
              onClearResult();
            } else {
              onClose();
            }
          }} className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-full transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden flex-col lg:flex-row relative">
          {(processing || processResult) && (
            <div className="absolute inset-0 bg-slate-950/90 z-50 p-6 flex flex-col justify-center items-center backdrop-blur-sm">
              {processing && progress && (
                <div className="w-full max-w-md text-center">
                  <div className="text-xl font-mono text-indigo-400 mb-4 tracking-wider animate-pulse">执行中...</div>
                  <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden mb-2">
                     <div className="h-full bg-indigo-500 transition-all duration-300" style={{ width: `${Math.min(100, Math.max(0, (progress.current / progress.total) * 100))}%` }}></div>
                  </div>
                  <div className="text-xs font-mono text-slate-400 mb-6">{progress.current} / {progress.total}</div>
                  
                  <div className="flex justify-center space-x-3">
                     <button onClick={taskState === 'paused' ? onResumeTask : onPauseTask} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded text-xs font-mono text-slate-300">
                       {taskState === 'paused' ? '继续' : '暂停'}
                     </button>
                     <button onClick={onStopTask} className="px-4 py-2 bg-red-950/50 hover:bg-red-900/50 text-red-400 rounded text-xs font-mono">
                       停止
                     </button>
                  </div>
                </div>
              )}
              {processResult && (
                <div className="w-full max-w-4xl text-center flex flex-col max-h-[80vh] overflow-hidden">
                  <div className="text-xl font-mono text-emerald-400 mb-4 tracking-wider flex-shrink-0">执行完成</div>
                  <div className="text-sm font-mono text-slate-300 flex justify-center space-x-6 mb-4 flex-shrink-0">
                    <div>成功: <span className="text-emerald-400">{processResult.data.successCount}</span></div>
                    {(processResult.data.skippedCount || 0) > 0 && (
                      <div>跳过: <span className="text-slate-400">{processResult.data.skippedCount}</span></div>
                    )}
                    <div>失败: <span className="text-red-400">{processResult.data.errorCount}</span></div>
                  </div>
                  
                  <div className="flex-1 overflow-auto bg-slate-900 border border-slate-800 rounded p-4 mb-4 text-left custom-scrollbar">
                    <table className="w-full text-xs font-mono text-left">
                      <thead className="bg-slate-950 sticky top-0 text-slate-400 border-b border-slate-800">
                        <tr>
                          <th className="py-2 px-3">文件路径</th>
                          <th className="py-2 px-3 w-20">状态</th>
                          <th className="py-2 px-3">详情/目标时间</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/50">
                        {/* 简单重构前端匹配逻辑以展示成功记录，后端未全量返回的话使用前端缓存数据 */}
                        {Array.from(selectedPaths).map((path, idx) => {
                           const isError = processResult.data.errors?.find((e: any) => e.path === path);
                           const item = previewData.find(p => p.relativePath === path);
                           const hasMetadata = item?.timeSource === '内部元数据';
                           const hasChanged = item?.hasChanged;
                           const isSkipped = processResult.type === 'inject' && hasMetadata && !hasChanged;
                           
                           return (
                             <tr key={idx} className="hover:bg-slate-800/40">
                               <td className="py-2 px-3 text-slate-400 break-all">{path}</td>
                               <td className="py-2 px-3">
                                 {isError ? (
                                   <span className="text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded">失败</span>
                                 ) : isSkipped ? (
                                   <span className="text-slate-400 bg-slate-500/10 px-1.5 py-0.5 rounded">跳过</span>
                                 ) : (
                                   <span className="text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">成功</span>
                                 )}
                               </td>
                               <td className="py-2 px-3">
                                 {isError ? (
                                   <span className="text-red-400">{isError.error}</span>
                                 ) : isSkipped ? (
                                   <span className="text-slate-500">已跳过，目标时间未变更</span>
                                 ) : (
                                   <span className="text-slate-500">元数据/时间已更新为: <span className="text-emerald-400">{item?.targetDate || '未知'}</span></span>
                                 )}
                               </td>
                             </tr>
                           );
                        })}
                      </tbody>
                    </table>
                  </div>
                  
                  <div className="flex-shrink-0 pb-4">
                    <button onClick={() => onClearResult ? onClearResult() : onClose()} className="px-6 py-2 bg-slate-800 hover:bg-slate-700 rounded font-mono text-sm tracking-wide text-slate-200 shadow">
                      返回匹配列表
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {showNoChangeModal && (
            <div className="absolute inset-0 bg-slate-950/80 z-50 p-6 flex flex-col justify-center items-center backdrop-blur-sm">
               <div className="bg-slate-900 border border-slate-800 p-6 rounded-xl max-w-sm w-full text-center shadow-2xl">
                  <AlertCircle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
                  <h3 className="text-lg font-mono text-slate-200 mb-2">未发现时间变更</h3>
                  <p className="text-sm font-mono text-slate-400 mb-6 leading-relaxed">
                    您选中的文件时间已经是目标时间，无需执行操作。
                  </p>
                  <button onClick={() => setShowNoChangeModal(false)} className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-mono text-sm rounded-lg transition-colors border border-slate-700">
                    知道了
                  </button>
               </div>
            </div>
          )}

          {showUnmatchedModal && (
            <div className="absolute inset-0 bg-slate-950/80 z-50 p-6 flex flex-col justify-center items-center backdrop-blur-sm">
               <div className="bg-slate-900 border border-slate-800 p-6 rounded-xl max-w-sm w-full text-center shadow-2xl">
                  <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
                  <h3 className="text-lg font-mono text-slate-200 mb-2">存在未匹配文件</h3>
                  <p className="text-sm font-mono text-slate-400 mb-6 leading-relaxed">
                    当前列表中仍存在未成功匹配到目标恢复时间的文件，请移除这些文件或调整匹配策略后再执行。
                  </p>
                  <button onClick={() => setShowUnmatchedModal(false)} className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-mono text-sm rounded-lg transition-colors border border-slate-700">
                    知道了
                  </button>
               </div>
            </div>
          )}

          {showInjectPreview && (
            <div className="absolute inset-0 bg-slate-950/95 z-50 p-6 flex flex-col justify-center items-center backdrop-blur-sm">
               <div className="bg-slate-900 border border-slate-800 p-6 rounded-xl w-full max-w-5xl shadow-2xl max-h-[85vh] flex flex-col">
                  <h3 className="text-lg font-mono text-slate-200 mb-2 flex items-center">
                    <FileText className="w-5 h-5 mr-2 text-emerald-500" />
                    写入元数据确认 (严格安全模式)
                  </h3>
                  <p className="text-sm font-mono text-slate-400 mb-4">
                    系统仅修改媒体的日期元数据，<strong className="text-emerald-400">绝对不会改变任何其他信息或降低文件画质</strong>。请核对以下将要执行的动作：
                  </p>
                  
                  <div className="flex-1 overflow-auto bg-slate-950 border border-slate-800 rounded p-2 custom-scrollbar">
                    <table className="w-full text-xs font-mono text-left whitespace-nowrap">
                       <thead className="bg-slate-900 text-slate-400 sticky top-0 border-b border-slate-800">
                         <tr>
                           <th className="p-2">原文件 (相对路径)</th>
                           <th className="p-2">现有元数据状态</th>
                           <th className="p-2">目标恢复时间</th>
                           <th className="p-2">动作预判</th>
                         </tr>
                       </thead>
                       <tbody className="divide-y divide-slate-800/50">
                         {Array.from(selectedPaths).map((path, idx) => {
                            const item = previewData.find(p => p.relativePath === path);
                            if (!item) return null;
                            const hasMetadata = item.timeSource === '内部元数据';
                            const hasChanged = item.hasChanged;
                            
                            let actionLabel = '';
                            let actionColor = '';
                            let willExecute = false;
                            let skipReason = '';

                            if (hasMetadata && !hasChanged) {
                               actionLabel = '跳过';
                               actionColor = 'text-slate-500';
                               skipReason = '目标时间与当前时间一致';
                            } else if (hasMetadata && hasChanged) {
                               actionLabel = '修改已有元数据';
                               actionColor = 'text-amber-400';
                               willExecute = true;
                            } else {
                               actionLabel = '新创建元数据';
                               actionColor = 'text-emerald-400';
                               willExecute = true;
                            }
                            
                            return (
                              <tr key={idx} className="hover:bg-slate-800/40">
                                <td className="p-2 text-slate-400 truncate max-w-[200px]" title={item.relativePath}>{item.relativePath}</td>
                                <td className="p-2">
                                  {hasMetadata ? <span className="text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">存在</span> : <span className="text-slate-500 bg-slate-800 px-1.5 py-0.5 rounded">缺失</span>}
                                </td>
                                <td className="p-2 text-cyan-400">{item.targetDate}</td>
                                <td className="p-2">
                                   <span className={`${actionColor} ${willExecute ? 'font-bold' : ''}`}>{actionLabel}</span>
                                   {!willExecute && <span className="text-slate-500 text-[10px] ml-2">({skipReason})</span>}
                                </td>
                              </tr>
                            );
                         })}
                       </tbody>
                    </table>
                  </div>

                  <div className="mt-4 flex justify-end space-x-3 flex-shrink-0">
                     <button onClick={() => setShowInjectPreview(false)} className="px-4 py-2 border border-slate-700 bg-slate-800 hover:bg-slate-700 rounded font-mono text-sm text-slate-300">
                       取消
                     </button>
                     <button onClick={() => {
                        const itemsToExecute = Array.from(selectedPaths).map(path => previewData.find(p => p.relativePath === path)).filter(Boolean);
                        const finalPlan = itemsToExecute.filter(item => {
                            const hasMetadata = item!.timeSource === '内部元数据';
                            const hasChanged = item!.hasChanged;
                            if (hasMetadata && !hasChanged) return false;
                            return true;
                        }).map(item => ({
                            relativePath: item!.relativePath,
                            targetTimestamp: item!.targetTimestamp
                        }));
                        
                        const skippedCount = itemsToExecute.length - finalPlan.length;
                        
                        setShowInjectPreview(false);
                        if (onInjectMetadata) {
                           onInjectMetadata(finalPlan, skippedCount);
                        }
                     }} className="px-6 py-2 bg-emerald-950/50 border border-emerald-900 text-emerald-400 hover:bg-emerald-900 rounded font-mono text-sm font-bold shadow-[0_0_10px_rgba(16,185,129,0.2)]">
                       确认安全写入
                     </button>
                  </div>
               </div>
            </div>
          )}
          {/* Left Panel: Settings */}
          <div className="w-full lg:w-[400px] flex-shrink-0 border-r border-slate-800 flex flex-col bg-slate-950/30">
            <div className="p-5">
              
              {!csvLoaded ? (
                 <div className="flex flex-col items-center justify-center py-12 px-4 border border-dashed border-indigo-500/30 rounded-xl bg-slate-900/50 hover:bg-slate-800/80 transition-colors cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                    <Upload className="w-8 h-8 text-indigo-400 mb-3" />
                    <span className="text-sm font-mono tracking-wide text-indigo-400">上传 CSV 备份</span>
                    <span className="text-xs font-mono text-slate-500 mt-1">需包含原始路径或相对路径以及时间戳列</span>
                    <input type="file" accept=".csv" className="hidden" ref={fileInputRef} onChange={handleFileUpload} />
                 </div>
              ) : (
                 <>
                   <div className="flex items-center justify-between mb-6">
                      <h3 className="font-semibold font-mono text-slate-300 tracking-wide">匹配策略</h3>
                      <button onClick={() => { setCsvLoaded(false); setCsvData([]); }} className="text-xs text-indigo-400 hover:text-indigo-300 font-mono tracking-wide bg-indigo-950/30 border border-indigo-900/50 px-2 py-1 rounded">重新上传</button>
                   </div>
                   
                   <div className="space-y-3">
                     <label className={`block p-3 rounded-lg border cursor-pointer transition-all ${matchStrategy === 'relativePath' ? 'border-indigo-500/50 bg-indigo-950/30 ring-1 ring-indigo-500/50' : 'border-slate-800 bg-slate-900 hover:border-indigo-500/30'}`}>
                       <div className="flex items-center">
                         <input type="radio" checked={matchStrategy === 'relativePath'} onChange={() => setMatchStrategy('relativePath')} className="text-indigo-500 focus:ring-indigo-500/50 mr-3 bg-slate-900 border-slate-700" />
                         <div>
                           <div className="font-medium font-mono tracking-wide text-slate-200 text-sm">完整相对路径 (推荐)</div>
                           <div className="text-xs font-mono text-slate-500 mt-1">通过精确的相对路径进行匹配恢复，防冲突。</div>
                         </div>
                       </div>
                     </label>
                     
                     <label className={`block p-3 rounded-lg border cursor-pointer transition-all ${matchStrategy === 'filename' ? 'border-indigo-500/50 bg-indigo-950/30 ring-1 ring-indigo-500/50' : 'border-slate-800 bg-slate-900 hover:border-indigo-500/30'}`}>
                       <div className="flex items-center">
                         <input type="radio" checked={matchStrategy === 'filename'} onChange={() => setMatchStrategy('filename')} className="text-indigo-500 focus:ring-indigo-500/50 mr-3 bg-slate-900 border-slate-700" />
                         <div>
                           <div className="font-medium font-mono tracking-wide text-slate-200 text-sm">仅文件名匹配</div>
                           <div className="text-xs font-mono text-slate-500 mt-1">适用于文件结构发生变化，但文件名未变的场景。</div>
                         </div>
                       </div>
                     </label>
                   </div>

                   <div className="mt-8 pt-6 border-t border-slate-800">
                     <h3 className="font-semibold font-mono text-slate-300 mb-3 text-sm tracking-wide">解析统计</h3>
                     <div className="space-y-2 text-xs">
                       <div className="flex justify-between items-center p-2 rounded border border-indigo-900/50 bg-indigo-950/20 font-mono">
                         <span className="text-indigo-400 font-medium">已选待恢复数</span>
                         <span className="font-bold text-indigo-400">{selectedPaths.size}</span>
                       </div>
                       <div className="flex justify-between items-center p-2 rounded border border-slate-800 bg-slate-900/50 font-mono">
                         <span className="text-slate-400">成功匹配数</span>
                         <span className="font-medium text-emerald-400">{matchedCount}</span>
                       </div>
                       <div className="flex justify-between items-center p-2 rounded border border-slate-800 bg-slate-900/50 font-mono">
                         <span className="text-slate-400">未匹配数</span>
                         <span className="font-medium text-amber-400">{files.length - matchedCount}</span>
                       </div>
                       <div className="flex justify-between items-center p-2 rounded border border-slate-800 bg-slate-900/50 font-mono">
                         <span className="text-slate-500">CSV 总行数 (供参考)</span>
                         <span className="font-medium text-slate-500">{csvData.length}</span>
                       </div>
                     </div>
                   </div>
                 </>
              )}

            </div>
          </div>

          {/* Right Panel: Preview */}
          <div className="w-full lg:flex-1 flex flex-col bg-slate-900 min-w-0">
            <div className="px-6 py-3 border-b border-slate-800 flex justify-between items-center bg-slate-900 z-10">
              <div className="flex space-x-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
                <button 
                  onClick={() => setViewMode('flat')} 
                  className={`px-3 py-1.5 text-xs font-mono tracking-wide rounded flex items-center transition-all ${viewMode === 'flat' ? 'bg-indigo-950/50 text-indigo-400 border border-indigo-900' : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800 border border-transparent'}`}
                >
                  <ListIcon className="w-3.5 h-3.5 mr-1.5" /> 列表视图
                </button>
                <button 
                  onClick={() => setViewMode('tree')} 
                  className={`px-3 py-1.5 text-xs font-mono tracking-wide rounded flex items-center transition-all ${viewMode === 'tree' ? 'bg-indigo-950/50 text-indigo-400 border border-indigo-900' : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800 border border-transparent'}`}
                >
                  <FolderTree className="w-3.5 h-3.5 mr-1.5" /> 目录视图
                </button>
              </div>

              <div className="flex items-center space-x-4">
                 <div className="flex items-center space-x-2 text-xs">
                   <Filter className="w-3.5 h-3.5 text-slate-500" />
                   <select 
                     value={timeSourceFilter}
                     onChange={(e) => { setTimeSourceFilter(e.target.value); setPage(1); }}
                     className="border-none bg-slate-950 hover:bg-slate-800 rounded-md py-1.5 px-2 cursor-pointer focus:ring-1 focus:ring-indigo-500 text-slate-300 outline-none transition-colors border border-slate-800 font-mono text-xs"
                   >
                     <option value="all">全部来源</option>
                     <option value="内部元数据">仅内部元数据</option>
                     <option value="文件系统时间">仅文件系统时间</option>
                   </select>
                 </div>
                 <div className="flex space-x-2">
                   <label className="flex items-center space-x-1.5 text-xs text-slate-400 font-mono cursor-pointer bg-slate-950 hover:bg-slate-800 px-2 py-1.5 rounded-lg border border-slate-800 transition-colors">
                     <input 
                       type="checkbox" 
                       checked={onlyMatched} 
                       onChange={(e) => { setOnlyMatched(e.target.checked); setPage(1); }} 
                       className="rounded border-slate-700 bg-slate-900 text-indigo-500 focus:ring-indigo-500/50" 
                     />
                     <span>仅显示匹配项</span>
                   </label>
                   <label className="flex items-center space-x-1.5 text-xs text-slate-400 font-mono cursor-pointer bg-slate-950 hover:bg-slate-800 px-2 py-1.5 rounded-lg border border-slate-800 transition-colors">
                     <input 
                       type="checkbox" 
                       checked={onlyDifferences} 
                       onChange={(e) => { setOnlyDifferences(e.target.checked); setPage(1); }} 
                       className="rounded border-slate-700 bg-slate-900 text-indigo-500 focus:ring-indigo-500/50" 
                     />
                     <span>仅显示差异项</span>
                   </label>
                 </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto bg-slate-900 custom-scrollbar">
              {!csvLoaded ? (
                 <div className="h-full flex items-center justify-center text-slate-500 font-mono text-sm tracking-wide">
                   请先在左侧上传 CSV 文件
                 </div>
              ) : viewMode === 'flat' ? (
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-900/90 backdrop-blur-md sticky top-0 shadow-sm z-10 border-b border-slate-800 font-mono tracking-wider">
                    <tr>
                      <th className="px-4 py-3 w-14">
                        <TableSelectMenu 
                          isPageSelected={paginatedData.length > 0 && paginatedData.every(f => selectedPaths.has(f.relativePath))}
                          isAllSelected={filteredData.length > 0 && selectedPaths.size === filteredData.length}
                          onSelectPage={handleSelectPage}
                          onSelectAll={handleSelectAll}
                          onSelectNone={handleSelectNone}
                          totalItems={filteredData.length}
                        />
                      </th>
                      <th className="px-4 py-3 font-semibold text-slate-400 cursor-pointer select-none hover:text-slate-300 transition-colors" onClick={() => requestSort('relativePath')}>
                        <div className="flex items-center min-w-[200px] resize-x overflow-hidden">原文件 (相对路径) {getSortIcon('relativePath')}</div>
                      </th>
                      <th className="px-4 py-3 font-semibold text-slate-400 cursor-pointer select-none hover:text-slate-300 transition-colors" onClick={() => requestSort('timeSource')}>
                        <div className="flex items-center min-w-[100px] resize-x overflow-hidden">时间来源 {getSortIcon('timeSource')}</div>
                      </th>
                      <th className="px-4 py-3 font-semibold text-slate-400">
                        <div className="flex items-center min-w-[100px] resize-x overflow-hidden">匹配详情</div>
                      </th>
                      <th className="px-4 py-3 font-semibold text-slate-400 cursor-pointer select-none hover:text-slate-300 transition-colors" onClick={() => requestSort('currentDate')}>
                        <div className="flex items-center min-w-[120px] resize-x overflow-hidden">当前物理时间 {getSortIcon('currentDate')}</div>
                      </th>
                      <th className="px-4 py-3 font-semibold text-emerald-500 cursor-pointer select-none hover:text-emerald-400 transition-colors" onClick={() => requestSort('targetDate')}>
                        <div className="flex items-center min-w-[120px] resize-x overflow-hidden">目标恢复时间 {getSortIcon('targetDate')}</div>
                      </th>
                      <th className="px-4 py-3 font-semibold text-slate-400">
                        <div className="flex items-center min-w-[80px] resize-x overflow-hidden">变化状态</div>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/50">
                    {paginatedData.map((item, idx) => (
                      <tr key={idx} className="hover:bg-slate-800/40 transition-colors">
                        <td className="px-4 py-3">
                          <input 
                             type="checkbox" 
                             checked={selectedPaths.has(item.relativePath)}
                             onChange={() => toggleSelection(item.relativePath)}
                             className="text-indigo-500 focus:ring-indigo-500/50 rounded border-slate-700 bg-slate-900"
                           />
                        </td>
                        <td className="px-4 py-3 text-slate-400 font-mono break-all" title={item.relativePath}>
                          {item.relativePath}
                        </td>
                        <td className="px-4 py-3">
                           {item.timeSource === '内部元数据' ? (
                             <span className="text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded text-[10px]">内部元数据</span>
                           ) : (
                             <span className="text-amber-400 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded text-[10px]">文件系统时间</span>
                           )}
                        </td>
                        <td className="px-4 py-3">
                          {item.source === 'current' ? (
                            <span className="bg-red-500/10 text-red-400 text-[10px] px-1.5 py-0.5 rounded border border-red-500/20">未匹配</span>
                          ) : (
                            <div className="flex flex-col space-y-0.5">
                              <span className="bg-emerald-500/10 text-emerald-400 text-[10px] px-1.5 py-0.5 rounded border border-emerald-500/20 w-fit">已匹配 (行: {item.rowIndex})</span>
                              {item.matchedFilePath !== item.relativePath && (
                                <span className="text-[10px] text-slate-500 truncate max-w-[200px]" title={item.matchedFilePath}>
                                  从: {item.matchedFilePath}
                                </span>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 font-mono text-slate-500">
                          {item.currentDate}
                        </td>
                        <td className="px-4 py-3 font-mono">
                          {item.hasChanged ? (
                            <span className="text-emerald-400 font-medium">{item.targetDate}</span>
                          ) : (
                            <span className="text-slate-500">{item.targetDate}</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {item.hasChanged ? (
                             <span className="bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 text-[10px] px-1.5 py-0.5 rounded">需更新</span>
                          ) : (
                             <span className="bg-slate-800 border border-slate-700 text-slate-400 text-[10px] px-1.5 py-0.5 rounded">无变化</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="p-6">
                  <TreeNode node={treeData} selectedPaths={selectedPaths} onToggle={toggleSelection} />
                </div>
              )}
            </div>

            {/* Pagination & Action */}
            <div className="px-6 py-4 border-t border-slate-800 flex justify-between items-center bg-slate-950/80 backdrop-blur">
              <div className="flex-1 mr-4">
                {viewMode === 'flat' ? (
                  <Pagination 
                    page={page} 
                    pageSize={pageSize} 
                    totalItems={filteredData.length} 
                    onPageChange={setPage} 
                    onPageSizeChange={setPageSize} 
                  />
                ) : (
                  <div className="text-xs font-mono text-indigo-400 mt-4 bg-slate-900 p-2 rounded border border-indigo-900/50 flex items-center h-[52px]">已选择: {selectedPaths.size} / {filteredData.length}</div>
                )}
              </div>
              <div className="flex-shrink-0 mt-4 flex items-center space-x-3">
                <span className="text-xs font-mono text-indigo-400 mr-2">已选中 {selectedPaths.size} 项</span>
                <button 
                  onClick={executeSync}
                  disabled={selectedPaths.size === 0 || !csvLoaded}
                  className="px-6 py-2.5 bg-indigo-950/50 text-indigo-400 border border-indigo-900 rounded-lg text-sm font-mono tracking-widest hover:bg-indigo-900 disabled:opacity-30 disabled:cursor-not-allowed transition-all flex items-center"
                >
                  <Play className="w-4 h-4 mr-2" />
                  修改时间
                </button>
                {onInjectMetadata && (
                  <button 
                    onClick={executeInject}
                    disabled={selectedPaths.size === 0 || !csvLoaded}
                    className="px-6 py-2.5 bg-emerald-950/50 text-emerald-400 border border-emerald-900 rounded-lg text-sm font-mono tracking-widest hover:bg-emerald-900 disabled:opacity-30 disabled:cursor-not-allowed transition-all flex items-center"
                    title="将时间物理写入文件元数据中"
                  >
                    <Play className="w-4 h-4 mr-2" />
                    写入元数据
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
