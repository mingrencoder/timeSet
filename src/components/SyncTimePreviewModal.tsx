import React, { useState, useMemo, useRef } from 'react';
import { X, Play, Clock, Upload, FileText, FolderTree, List as ListIcon, ChevronDown, ChevronRight, Filter } from 'lucide-react';

interface SyncTimePreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  files: any[];
  onExecute: (syncPlan: any[]) => void;
}

const TreeNode: React.FC<{ node: any, level?: number, selectedPaths?: Set<string>, onToggle?: (path: string) => void }> = ({ node, level = 0, selectedPaths, onToggle }) => {
  const [isOpen, setIsOpen] = useState(true);

  if (node.isFile) {
    const isSelected = selectedPaths ? selectedPaths.has(node.original.relativePath) : false;
    return (
      <div className="flex items-center text-xs py-1.5 hover:bg-gray-50 border-b border-gray-50 transition-colors group" style={{ paddingLeft: `${level * 20 + 20}px` }}>
        <input 
          type="checkbox" 
          checked={isSelected}
          onChange={() => onToggle && onToggle(node.original.relativePath)}
          className="mr-3 text-indigo-600 focus:ring-indigo-500 rounded border-gray-300"
        />
        <FileText className="w-4 h-4 text-gray-400 mr-2 flex-shrink-0" />
        <div className="flex-1 min-w-0 flex justify-between gap-4 pr-4 items-center">
          <span className="text-gray-600 truncate min-w-[100px]" title={node.name}>{node.name}</span>
          <div className="flex items-center space-x-3 truncate flex-shrink-0">
             <span className="text-gray-500 w-24 text-right">
               {node.original.timeSource === '内部元数据' ? (
                 <span className="text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded text-[10px]">内部元数据</span>
               ) : (
                 <span className="text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded text-[10px]">文件系统时间</span>
               )}
             </span>
             {node.original.source === 'current' ? (
               <span className="bg-red-50 text-red-500 text-[10px] px-2 py-0.5 rounded flex-shrink-0 border border-red-100">未匹配</span>
             ) : (
               <span className="bg-emerald-50 text-emerald-600 text-[10px] px-2 py-0.5 rounded flex-shrink-0 border border-emerald-100" title={`匹配行: ${node.original.rowIndex}\n匹配路径: ${node.original.matchedFilePath}`}>已匹配</span>
             )}
             <span className={`font-mono text-[11px] w-[130px] text-right ${node.hasChanged ? 'text-emerald-600 font-medium' : 'text-gray-400'}`}>
                {node.targetDate}
             </span>
             <div className="w-[50px] text-right">
               {node.hasChanged ? (
                  <span className="bg-indigo-50 text-indigo-600 text-[10px] px-1.5 py-0.5 rounded flex-shrink-0">需更新</span>
               ) : (
                  <span className="bg-gray-100 text-gray-500 text-[10px] px-1.5 py-0.5 rounded flex-shrink-0">无变化</span>
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
            <TreeNode key={idx} node={child} level={level + 1} selectedPaths={selectedPaths} onToggle={onToggle} />
          ))}
        </div>
      )}
    </div>
  );
};

export default function SyncTimePreviewModal({ isOpen, onClose, files, onExecute }: SyncTimePreviewModalProps) {
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
  const pageSize = 50;

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
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
            const relativePath = cols[1].trim();
            const timestamp = parseInt(cols[3], 10);
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
      const targetDate = isNaN(d.getTime()) ? '-' : d.toISOString().replace('T', ' ').replace('Z', '').split('.')[0];

      return {
        ...file,
        targetTimestamp,
        targetDate,
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

  const toggleAll = () => {
     if (selectedPaths.size === filteredData.length) {
         setSelectedPaths(new Set());
     } else {
         setSelectedPaths(new Set(filteredData.map(f => f.relativePath)));
     }
  };

  if (!isOpen) return null;

  const executeSync = () => {
    const syncPlan = Array.from(selectedPaths).map(path => {
      const item = previewData.find(p => p.relativePath === path);
      return {
        relativePath: path,
        targetTimestamp: item?.targetTimestamp
      };
    });
    onExecute(syncPlan);
  };

  const totalPages = Math.ceil(filteredData.length / pageSize);
  const paginatedData = sortedFilteredData.slice((page - 1) * pageSize, page * pageSize);

  const matchedCount = previewData.filter(p => p.source !== 'current').length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 sm:p-6">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[90vw] lg:max-w-[95vw] xl:max-w-7xl max-h-[90vh] flex flex-col overflow-hidden">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
          <div>
            <h2 className="text-xl font-bold text-gray-900 flex items-center">
              <Clock className="w-5 h-5 mr-2 text-indigo-500" />
              恢复物理时间 (通过备份 CSV)
            </h2>
            <p className="text-sm text-gray-500 mt-1">上传之前导出的时间线 CSV 备份文件，精确恢复本地文件的物理时间</p>
          </div>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden flex-col lg:flex-row">
          {/* Left Panel: Settings */}
          <div className="w-full lg:w-1/3 border-r border-gray-100 flex flex-col bg-gray-50/30">
            <div className="p-5">
              
              {!csvLoaded ? (
                 <div className="flex flex-col items-center justify-center py-12 px-4 border-2 border-dashed border-gray-300 rounded-xl bg-white hover:bg-gray-50 transition-colors cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                    <Upload className="w-8 h-8 text-indigo-400 mb-3" />
                    <span className="text-sm font-medium text-gray-700">点击上传 CSV 备份文件</span>
                    <span className="text-xs text-gray-400 mt-1">需包含原始路径或相对路径以及时间戳列</span>
                    <input type="file" accept=".csv" className="hidden" ref={fileInputRef} onChange={handleFileUpload} />
                 </div>
              ) : (
                 <>
                   <div className="flex items-center justify-between mb-6">
                      <h3 className="font-semibold text-gray-800">匹配策略</h3>
                      <button onClick={() => { setCsvLoaded(false); setCsvData([]); }} className="text-xs text-indigo-600 hover:text-indigo-700 font-medium">重新上传</button>
                   </div>
                   
                   <div className="space-y-3">
                     <label className={`block p-3 rounded-lg border cursor-pointer transition-all ${matchStrategy === 'relativePath' ? 'border-indigo-500 bg-indigo-50/50 shadow-sm ring-1 ring-indigo-500' : 'border-gray-200 bg-white hover:border-indigo-300'}`}>
                       <div className="flex items-center">
                         <input type="radio" checked={matchStrategy === 'relativePath'} onChange={() => setMatchStrategy('relativePath')} className="text-indigo-600 focus:ring-indigo-500 mr-3" />
                         <div>
                           <div className="font-medium text-gray-900 text-sm">按相对路径匹配 (推荐)</div>
                           <div className="text-xs text-gray-500 mt-1">通过精确的相对路径进行匹配恢复，防冲突。</div>
                         </div>
                       </div>
                     </label>
                     
                     <label className={`block p-3 rounded-lg border cursor-pointer transition-all ${matchStrategy === 'filename' ? 'border-indigo-500 bg-indigo-50/50 shadow-sm ring-1 ring-indigo-500' : 'border-gray-200 bg-white hover:border-indigo-300'}`}>
                       <div className="flex items-center">
                         <input type="radio" checked={matchStrategy === 'filename'} onChange={() => setMatchStrategy('filename')} className="text-indigo-600 focus:ring-indigo-500 mr-3" />
                         <div>
                           <div className="font-medium text-gray-900 text-sm">仅按文件名匹配</div>
                           <div className="text-xs text-gray-500 mt-1">适用于文件结构发生变化，但文件名未变的场景。</div>
                         </div>
                       </div>
                     </label>
                   </div>

                   <div className="mt-8 pt-6 border-t border-gray-200">
                     <h3 className="font-semibold text-gray-800 mb-3 text-sm">解析统计</h3>
                     <div className="space-y-2 text-xs">
                       <div className="flex justify-between items-center bg-white p-2 rounded border border-gray-100">
                         <span className="text-gray-600">文件读取条目</span>
                         <span className="font-medium">{csvData.length}</span>
                       </div>
                       <div className="flex justify-between items-center bg-white p-2 rounded border border-gray-100">
                         <span className="text-gray-600">当前成功匹配</span>
                         <span className="font-medium text-emerald-600">{matchedCount}</span>
                       </div>
                       <div className="flex justify-between items-center bg-white p-2 rounded border border-gray-100">
                         <span className="text-gray-600">未匹配项</span>
                         <span className="font-medium text-orange-600">{files.length - matchedCount}</span>
                       </div>
                     </div>
                   </div>
                 </>
              )}

            </div>
          </div>

          {/* Right Panel: Preview */}
          <div className="w-full lg:w-2/3 flex flex-col bg-white">
            <div className="px-6 py-3 border-b border-gray-100 flex justify-between items-center bg-white z-10">
              <div className="flex space-x-1 bg-gray-100 p-1 rounded-lg">
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

              <div className="flex items-center space-x-4">
                 <div className="flex items-center space-x-2 text-xs">
                   <Filter className="w-3.5 h-3.5 text-gray-400" />
                   <select 
                     value={timeSourceFilter}
                     onChange={(e) => { setTimeSourceFilter(e.target.value); setPage(1); }}
                     className="border-none bg-gray-50 hover:bg-gray-100 rounded-md py-1.5 px-2 cursor-pointer focus:ring-1 focus:ring-indigo-500 text-gray-700 outline-none transition-colors border border-gray-200 font-medium"
                   >
                     <option value="all">全部来源</option>
                     <option value="内部元数据">仅内部元数据</option>
                     <option value="文件系统时间">仅文件系统时间</option>
                   </select>
                 </div>
                 <div className="flex space-x-2">
                   <label className="flex items-center space-x-1.5 text-xs text-gray-500 font-medium cursor-pointer bg-gray-50 hover:bg-gray-100 px-2 py-1.5 rounded-lg border border-gray-200 transition-colors">
                     <input 
                       type="checkbox" 
                       checked={onlyMatched} 
                       onChange={(e) => setOnlyMatched(e.target.checked)} 
                       className="rounded text-indigo-600 focus:ring-indigo-500" 
                     />
                     <span>仅显示匹配项</span>
                   </label>
                   <label className="flex items-center space-x-1.5 text-xs text-gray-500 font-medium cursor-pointer bg-gray-50 hover:bg-gray-100 px-2 py-1.5 rounded-lg border border-gray-200 transition-colors">
                     <input 
                       type="checkbox" 
                       checked={onlyDifferences} 
                       onChange={(e) => setOnlyDifferences(e.target.checked)} 
                       className="rounded text-indigo-600 focus:ring-indigo-500" 
                     />
                     <span>仅显示差异项</span>
                   </label>
                 </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto bg-white">
              {!csvLoaded ? (
                 <div className="h-full flex items-center justify-center text-gray-400 text-sm">
                   请先在左侧上传 CSV 文件
                 </div>
              ) : viewMode === 'flat' ? (
                <table className="w-full text-left text-xs whitespace-nowrap">
                  <thead className="bg-gray-50 sticky top-0 shadow-sm z-10 border-b border-gray-100">
                    <tr>
                      <th className="px-4 py-3 w-10">
                        <input 
                          type="checkbox" 
                          checked={selectedPaths.size > 0 && selectedPaths.size === filteredData.length}
                          onChange={(e) => {
                            e.stopPropagation();
                            toggleAll();
                          }}
                          className="text-indigo-600 focus:ring-indigo-500 rounded border-gray-300"
                        />
                      </th>
                      <th className="px-4 py-3 font-semibold text-gray-600 cursor-pointer select-none" onClick={() => requestSort('relativePath')}>
                        原文件 (相对路径) {getSortIcon('relativePath')}
                      </th>
                      <th className="px-4 py-3 font-semibold text-gray-600 cursor-pointer select-none" onClick={() => requestSort('timeSource')}>
                        时间来源 {getSortIcon('timeSource')}
                      </th>
                      <th className="px-4 py-3 font-semibold text-gray-600">匹配详情</th>
                      <th className="px-4 py-3 font-semibold text-emerald-600 cursor-pointer select-none" onClick={() => requestSort('targetDate')}>
                        目标恢复时间 {getSortIcon('targetDate')}
                      </th>
                      <th className="px-4 py-3 font-semibold text-gray-600">变化状态</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {paginatedData.map((item, idx) => (
                      <tr key={idx} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3">
                          <input 
                             type="checkbox" 
                             checked={selectedPaths.has(item.relativePath)}
                             onChange={() => toggleSelection(item.relativePath)}
                             className="text-indigo-600 focus:ring-indigo-500 rounded border-gray-300"
                           />
                        </td>
                        <td className="px-4 py-3 text-gray-700 truncate max-w-[200px]" title={item.relativePath}>
                          {item.relativePath}
                        </td>
                        <td className="px-4 py-3">
                           {item.timeSource === '内部元数据' ? (
                             <span className="text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded text-[10px]">内部元数据</span>
                           ) : (
                             <span className="text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded text-[10px]">文件系统时间</span>
                           )}
                        </td>
                        <td className="px-4 py-3">
                          {item.source === 'current' ? (
                            <span className="bg-red-50 text-red-500 text-[10px] px-1.5 py-0.5 rounded border border-red-100">未匹配</span>
                          ) : (
                            <div className="flex flex-col space-y-0.5">
                              <span className="bg-emerald-50 text-emerald-600 text-[10px] px-1.5 py-0.5 rounded border border-emerald-100 w-fit">已匹配 (行: {item.rowIndex})</span>
                              {item.matchedFilePath !== item.relativePath && (
                                <span className="text-[10px] text-gray-400 truncate max-w-[200px]" title={item.matchedFilePath}>
                                  从: {item.matchedFilePath}
                                </span>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 font-mono">
                          {item.hasChanged ? (
                            <span className="text-emerald-600 font-medium">{item.targetDate}</span>
                          ) : (
                            <span className="text-gray-400">{item.targetDate}</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {item.hasChanged ? (
                             <span className="bg-indigo-50 text-indigo-600 text-[10px] px-1.5 py-0.5 rounded">需更新</span>
                          ) : (
                             <span className="bg-gray-100 text-gray-500 text-[10px] px-1.5 py-0.5 rounded">无变化</span>
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
            <div className="px-6 py-4 border-t border-gray-100 flex justify-between items-center bg-gray-50/80 backdrop-blur">
              {viewMode === 'flat' ? (
                <div className="flex items-center space-x-4 text-xs text-gray-600 font-medium">
                  <button 
                    disabled={page === 1} 
                    onClick={() => setPage(page - 1)}
                    className="px-3 py-1.5 border border-gray-200 bg-white rounded-md hover:bg-gray-50 disabled:opacity-50 transition-colors shadow-sm"
                  >
                    上一页
                  </button>
                  <span>{page} / {totalPages || 1} (已选 {selectedPaths.size}/{filteredData.length} 项)</span>
                  <button 
                    disabled={page === totalPages || totalPages === 0} 
                    onClick={() => setPage(page + 1)}
                    className="px-3 py-1.5 border border-gray-200 bg-white rounded-md hover:bg-gray-50 disabled:opacity-50 transition-colors shadow-sm"
                  >
                    下一页
                  </button>
                </div>
              ) : (
                <div className="text-xs font-medium text-gray-600">已选 {selectedPaths.size} / {filteredData.length} 项</div>
              )}

              <button 
                onClick={executeSync}
                disabled={selectedPaths.size === 0 || !csvLoaded}
                className="px-6 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-all flex items-center shadow-md"
              >
                <Play className="w-4 h-4 mr-2" />
                执行选中的 {selectedPaths.size} 项时间恢复
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
