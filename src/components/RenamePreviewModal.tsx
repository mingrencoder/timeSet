import React, { useState, useMemo } from 'react';
import { X, Plus, Trash2, Download, Play, FolderTree, List as ListIcon, FileText, ChevronRight, ChevronDown } from 'lucide-react';
import { Pagination } from './Pagination';
import { TableSelectMenu } from './TableSelectMenu';

export type Rule = {
  id: string;
  conditionType: 'ALL' | 'PATH_CONTAINS' | 'NAME_STARTSWITH';
  conditionValue: string;
  template: string;
};

interface RenamePreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  files: any[];
  folderPath: string;
  onExecute: (renamePlan: any[]) => void;
  processing?: boolean;
  progress?: any;
  processResult?: any;
  taskState?: string;
  onPauseTask?: () => void;
  onResumeTask?: () => void;
  onStopTask?: () => void;
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
          className="mr-3 rounded border-slate-700 bg-slate-900 text-cyan-500 focus:ring-cyan-500/50 focus:ring-offset-slate-900 cursor-pointer"
        />
        <FileText className="w-4 h-4 text-slate-500 mr-2 flex-shrink-0" />
        <div className="flex-1 min-w-0 grid grid-cols-2 gap-4 pr-4 items-center">
          <span className="text-slate-300 font-mono truncate" title={node.name}>{node.name}</span>
          <div className="flex items-center space-x-2 truncate font-mono">
             {node.hasChanged ? (
                <span className="text-emerald-400 font-medium truncate" title={node.newName}>{node.newName}</span>
             ) : (
                <>
                  <span className="text-slate-500 truncate" title={node.newName}>{node.newName}</span>
                  <span className="bg-slate-800 text-slate-400 border border-slate-700 text-[10px] px-1.5 py-0.5 rounded flex-shrink-0">无变化</span>
                </>
             )}
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

export default function RenamePreviewModal({ isOpen, onClose, files, folderPath, onExecute, processing, progress, processResult, taskState, onPauseTask, onResumeTask, onStopTask }: RenamePreviewModalProps) {
  const [rules, setRules] = useState<Rule[]>([
    { id: '1', conditionType: 'ALL', conditionValue: '', template: '{TYPE}_{YYYY}{MM}{DD}_{HH}{mm}{ss}' }
  ]);
  const [viewMode, setViewMode] = useState<'flat' | 'tree'>('flat');
  const [page, setPage] = useState(1);
  const [onlyDifferences, setOnlyDifferences] = useState(false);
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
  const [pageSize, setPageSize] = useState(100);

  const previewData = useMemo(() => {
    return files.map(file => {
      // Find matching rule
      let matchedRule = rules.find(r => {
        if (r.conditionType === 'ALL') return true;
        if (r.conditionType === 'PATH_CONTAINS' && r.conditionValue) return file.relativePath.includes(r.conditionValue);
        if (r.conditionType === 'NAME_STARTSWITH' && r.conditionValue) return file.originalName.startsWith(r.conditionValue);
        return false;
      }) || rules[rules.length - 1] || { template: '{ORIG_NAME}' };

      const d = new Date(file.timestamp);
      const pad = (n: number) => n.toString().padStart(2, '0');
      
      const ext = file.originalName.substring(file.originalName.lastIndexOf('.'));
      const origNameNoExt = file.originalName.substring(0, file.originalName.lastIndexOf('.'));
      
      const parts = file.relativePath.split(/[/\\]/);
      const dirName = parts.length > 1 ? parts[parts.length - 2] : 'root';

      let newBaseName = matchedRule.template;
      newBaseName = newBaseName.replace(/{TYPE}/g, file.type === 'video' ? 'VID' : 'IMG');
      newBaseName = newBaseName.replace(/{YYYY}/g, d.getFullYear().toString());
      newBaseName = newBaseName.replace(/{MM}/g, pad(d.getMonth() + 1));
      newBaseName = newBaseName.replace(/{DD}/g, pad(d.getDate()));
      newBaseName = newBaseName.replace(/{HH}/g, pad(d.getHours()));
      newBaseName = newBaseName.replace(/{mm}/g, pad(d.getMinutes()));
      newBaseName = newBaseName.replace(/{ss}/g, pad(d.getSeconds()));
      newBaseName = newBaseName.replace(/{DIR_NAME}/g, dirName);
      newBaseName = newBaseName.replace(/{ORIG_NAME}/g, origNameNoExt);

      const newName = newBaseName + ext;
      return {
        ...file,
        ext,
        newBaseName,
        newName,
        hasChanged: newName !== file.originalName
      };
    });
  }, [files, rules]);

  // Initial selection of all changed items
  React.useEffect(() => {
     const initialSet = new Set<string>();
     previewData.forEach(p => {
        if (p.hasChanged) initialSet.add(p.relativePath);
     });
     setSelectedPaths(initialSet);
  }, [previewData]);

  const filteredData = useMemo(() => {
    if (onlyDifferences) {
       return previewData.filter(p => p.hasChanged);
    }
    return previewData;
  }, [previewData, onlyDifferences]);

  const sortedFilteredData = useMemo(() => {
    let sortableItems = [...filteredData];
    if (sortConfig !== null) {
      sortableItems.sort((a, b) => {
        let aValue = a[sortConfig.key as keyof typeof a];
        let bValue = b[sortConfig.key as keyof typeof b];
        
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
    const root = { name: folderPath.split(/[/\\]/).pop() || 'root', isFile: false, children: {} as any };
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
        newName: item.newName,
        hasChanged: item.hasChanged
      };
    });
    return root;
  }, [filteredData, folderPath]);

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

  const addRule = () => {
    setRules([...rules, { id: Date.now().toString(), conditionType: 'PATH_CONTAINS', conditionValue: '', template: '{TYPE}_{YYYY}{MM}{DD}_{HH}{mm}{ss}' }]);
  };

  const removeRule = (id: string) => {
    if (rules.length === 1) return;
    setRules(rules.filter(r => r.id !== id));
  };

  const updateRule = (id: string, updates: Partial<Rule>) => {
    setRules(rules.map(r => r.id === id ? { ...r, ...updates } : r));
  };

  const handleDownloadCSV = () => {
    const header = ['原始相对路径', '原始文件名', '新文件名', '规则模板'];
    const rows = previewData.map(f => [
      f.relativePath,
      f.originalName,
      f.newName,
      f.newBaseName
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
    link.setAttribute('download', `rename_preview_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const executeRename = () => {
    const renamePlan = previewData.map(p => ({
      relativePath: p.relativePath,
      originalName: p.originalName,
      newBaseName: p.newBaseName
    }));
    onExecute(renamePlan);
  };

  const totalPages = Math.ceil(filteredData.length / pageSize);
  const paginatedData = sortedFilteredData.slice((page - 1) * pageSize, page * pageSize);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 sm:p-6 font-sans">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-6xl max-h-[90vh] flex flex-col overflow-hidden">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex justify-between items-center bg-slate-950/50">
          <div>
            <h2 className="text-xl font-bold font-mono text-slate-100 tracking-wide">重命名规则预览 //</h2>
            <p className="text-sm text-slate-500 mt-1 font-mono">自定义模板匹配层级，自上而下匹配执行</p>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-full transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden flex-col lg:flex-row relative">
          {(processing || processResult) && (
            <div className="absolute inset-0 bg-slate-950/90 z-50 p-6 flex flex-col justify-center items-center backdrop-blur-sm">
              {processing && progress && (
                <div className="w-full max-w-md text-center">
                  <div className="text-xl font-mono text-cyan-400 mb-4 tracking-wider animate-pulse">执行中...</div>
                  <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden mb-2">
                     <div className="h-full bg-cyan-500 transition-all duration-300" style={{ width: `${Math.min(100, Math.max(0, (progress.current / progress.total) * 100))}%` }}></div>
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
                <div className="w-full max-w-md text-center">
                  <div className="text-xl font-mono text-emerald-400 mb-4 tracking-wider">执行完成</div>
                  <div className="text-sm font-mono text-slate-300 space-y-2 mb-6">
                    <div>成功: <span className="text-emerald-400">{processResult.data.successCount}</span></div>
                    <div>失败: <span className="text-red-400">{processResult.data.errorCount}</span></div>
                  </div>
                  {processResult.data.errors && processResult.data.errors.length > 0 && (
                    <div className="text-left bg-slate-900 p-3 rounded text-xs font-mono text-red-400 max-h-48 overflow-y-auto mb-4 border border-red-900/30">
                      {processResult.data.errors.map((e: any, i: number) => (
                         <div key={i} className="mb-1">{e.path ? `[${e.path}] ` : ''}{e.error}</div>
                      ))}
                    </div>
                  )}
                  <button onClick={onClose} className="px-6 py-2 bg-slate-800 hover:bg-slate-700 rounded font-mono text-sm tracking-wide text-slate-200">
                    关闭并刷新
                  </button>
                </div>
              )}
            </div>
          )}
          {/* Left Panel: Rules */}
          <div className="w-full lg:w-1/3 border-r border-slate-800 flex flex-col bg-slate-950/30">
            <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-900">
              <h3 className="font-semibold font-mono text-slate-300">重命名规则</h3>
              <button onClick={addRule} className="text-xs flex items-center text-cyan-400 hover:text-cyan-300 bg-cyan-950/30 border border-cyan-900/50 px-2 py-1.5 rounded-md transition-colors font-mono tracking-wide">
                <Plus className="w-3 h-3 mr-1" /> 添加规则
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
              <div className="text-xs text-slate-400 bg-slate-900 p-3 rounded-xl border border-slate-800 shadow-sm leading-relaxed font-mono">
                <p className="font-semibold mb-2 text-slate-300">可用变量：</p>
                <div className="grid grid-cols-2 gap-2">
                  <div><code className="text-indigo-400 font-bold mr-1">{'{YYYY}'}</code>年</div>
                  <div><code className="text-indigo-400 font-bold mr-1">{'{MM}'}</code>月</div>
                  <div><code className="text-indigo-400 font-bold mr-1">{'{DD}'}</code>日</div>
                  <div><code className="text-indigo-400 font-bold mr-1">{'{HH}'}</code>时</div>
                  <div><code className="text-indigo-400 font-bold mr-1">{'{mm}'}</code>分</div>
                  <div><code className="text-indigo-400 font-bold mr-1">{'{ss}'}</code>秒</div>
                  <div className="col-span-2"><code className="text-emerald-400 font-bold mr-1">{'{TYPE}'}</code>(IMG/VID)</div>
                  <div className="col-span-2"><code className="text-amber-400 font-bold mr-1">{'{DIR_NAME}'}</code>(当前所在文件夹名)</div>
                  <div className="col-span-2"><code className="text-cyan-400 font-bold mr-1">{'{ORIG_NAME}'}</code>(原文件名)</div>
                </div>
              </div>
              
              {rules.map((rule, idx) => (
                <div key={rule.id} className="bg-slate-900/80 p-4 rounded-xl border border-slate-800 shadow-sm relative group hover:border-cyan-800/50 transition-colors">
                  {rules.length > 1 && (
                    <button onClick={() => removeRule(rule.id)} className="absolute top-3 right-3 text-slate-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-900">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                  <div className="text-xs font-bold font-mono text-slate-500 mb-3 flex items-center">
                    <span className="bg-slate-800 text-slate-300 px-2 py-0.5 rounded mr-2 border border-slate-700">#{idx + 1}</span>
                    {idx === rules.length - 1 ? '兜底规则 (最后匹配)' : '条件规则'}
                  </div>
                  
                  <select 
                    value={rule.conditionType} 
                    onChange={(e) => updateRule(rule.id, { conditionType: e.target.value as any })}
                    className="w-full text-sm font-mono border border-slate-700 bg-slate-950 text-slate-300 rounded-md mb-2 p-2 focus:ring-1 focus:ring-cyan-500 focus:border-cyan-500 outline-none transition-shadow"
                  >
                    <option value="ALL">全部匹配</option>
                    <option value="PATH_CONTAINS">路径包含</option>
                    <option value="NAME_STARTSWITH">名称以...开头</option>
                  </select>

                  {rule.conditionType !== 'ALL' && (
                    <input 
                      type="text" 
                      placeholder="匹配文本 (区分大小写)"
                      value={rule.conditionValue}
                      onChange={(e) => updateRule(rule.id, { conditionValue: e.target.value })}
                      className="w-full text-sm font-mono border border-slate-700 bg-slate-950 text-slate-300 rounded-md mb-3 p-2 focus:ring-1 focus:ring-cyan-500 focus:border-cyan-500 outline-none transition-shadow placeholder-slate-600"
                    />
                  )}

                  <label className="block text-xs font-mono font-medium text-slate-400 mb-1.5 mt-3">重命名模板 (不含扩展名)</label>
                  <input 
                    type="text" 
                    value={rule.template}
                    onChange={(e) => updateRule(rule.id, { template: e.target.value })}
                    className="w-full text-sm font-mono border border-slate-700 bg-slate-950 text-cyan-400 rounded-md p-2 focus:ring-1 focus:ring-cyan-500 focus:border-cyan-500 outline-none transition-shadow"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Right Panel: Preview */}
          <div className="w-full lg:w-2/3 flex flex-col bg-slate-900">
            <div className="px-6 py-3 border-b border-slate-800 flex justify-between items-center bg-slate-900 z-10">
              <div className="flex space-x-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
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
              
              <button onClick={handleDownloadCSV} className="text-xs font-mono tracking-wide flex items-center text-slate-400 hover:text-slate-200 border border-slate-700 hover:bg-slate-800 bg-slate-900 px-3 py-1.5 rounded-lg shadow-sm transition-all">
                <Download className="w-3.5 h-3.5 mr-1.5" /> 导出CSV
              </button>
            </div>

            <div className="flex-1 overflow-y-auto bg-slate-900 custom-scrollbar">
              {viewMode === 'flat' ? (
                <table className="w-full text-left text-xs whitespace-nowrap">
                  <thead className="bg-slate-900/90 backdrop-blur-md sticky top-0 shadow-sm z-10 border-b border-slate-800 font-mono tracking-wider">
                    <tr>
                      <th className="px-6 py-3 font-semibold text-slate-400">
                         <div className="flex items-center min-w-[300px] resize-x overflow-hidden">
                           <div className="mr-3">
                             <TableSelectMenu 
                               isPageSelected={paginatedData.length > 0 && paginatedData.every(f => selectedPaths.has(f.relativePath))}
                               isAllSelected={filteredData.length > 0 && selectedPaths.size === filteredData.length}
                               onSelectPage={handleSelectPage}
                               onSelectAll={handleSelectAll}
                               onSelectNone={handleSelectNone}
                               totalItems={filteredData.length}
                             />
                           </div>
                           <span className="cursor-pointer select-none flex items-center hover:text-slate-300 transition-colors" onClick={() => requestSort('relativePath')}>
                             原路径 {getSortIcon('relativePath')}
                           </span>
                         </div>
                      </th>
                      <th className="px-6 py-3 font-semibold text-emerald-500">
                         <div className="flex items-center justify-between min-w-[300px] resize-x overflow-hidden">
                            <span className="cursor-pointer select-none flex-1 hover:text-emerald-400 transition-colors" onClick={() => requestSort('newName')}>
                              目标预览 {getSortIcon('newName')}
                            </span>
                            <label className="flex items-center space-x-2 text-slate-400 font-normal cursor-pointer bg-slate-800 hover:bg-slate-700 px-2 py-1 rounded transition-colors ml-4 border border-slate-700">
                              <input 
                                type="checkbox" 
                                checked={onlyDifferences} 
                                onChange={(e) => { setOnlyDifferences(e.target.checked); setPage(1); }} 
                                className="rounded border-slate-600 bg-slate-900 text-cyan-500 focus:ring-cyan-500/50" 
                              />
                              <span className="text-[10px]">仅看修改项</span>
                            </label>
                         </div>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/50">
                    {paginatedData.map((item, idx) => (
                      <tr key={idx} className="hover:bg-slate-800/40 transition-colors">
                        <td className="px-6 py-3 text-slate-500 break-all font-mono" title={item.relativePath}>
                          <div className="flex items-center">
                            <input 
                               type="checkbox" 
                               checked={selectedPaths.has(item.relativePath)}
                               onChange={() => toggleSelection(item.relativePath)}
                               className="mr-3 rounded border-slate-700 bg-slate-900 text-cyan-500 focus:ring-cyan-500/50 flex-shrink-0"
                             />
                             <span>{item.relativePath}</span>
                          </div>
                        </td>
                        <td className="px-6 py-3 font-mono break-all" title={item.newName}>
                          <div className="flex items-center space-x-2">
                             {item.hasChanged ? (
                                <span className="text-emerald-400 font-medium">{item.newName}</span>
                             ) : (
                                <>
                                  <span className="text-slate-500">{item.newName}</span>
                                  <span className="bg-slate-800 border border-slate-700 text-slate-400 text-[10px] px-1.5 py-0.5 rounded flex-shrink-0">无变化</span>
                                </>
                             )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="p-6">
                  <div className="mb-4 flex justify-end">
                     <label className="flex items-center space-x-2 text-xs text-slate-400 font-mono cursor-pointer bg-slate-950 hover:bg-slate-800 px-2 py-1.5 rounded-lg border border-slate-800 transition-colors">
                       <input 
                         type="checkbox" 
                         checked={onlyDifferences} 
                         onChange={(e) => { setOnlyDifferences(e.target.checked); setPage(1); }} 
                         className="rounded border-slate-700 bg-slate-900 text-cyan-500 focus:ring-cyan-500" 
                       />
                       <span>仅看修改项</span>
                     </label>
                  </div>
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
                  <div className="text-xs font-mono text-cyan-500 mt-4 bg-slate-900 p-2 rounded border border-cyan-900/50 flex items-center h-[52px]">已选择: {selectedPaths.size} / {filteredData.length}</div>
                )}
              </div>
              <div className="flex-shrink-0 mt-4">
                <button 
                  onClick={executeRename}
                  disabled={selectedPaths.size === 0}
                  className="px-6 py-2.5 bg-emerald-950/50 text-emerald-400 border border-emerald-900 rounded-lg text-sm font-mono tracking-widest hover:bg-emerald-900 disabled:opacity-30 disabled:cursor-not-allowed transition-all flex items-center"
                >
                  <Play className="w-4 h-4 mr-2" />
                  执行 [{selectedPaths.size}]
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
