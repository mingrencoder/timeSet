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
        <div className="flex-1 min-w-0 grid grid-cols-2 gap-4 pr-4 items-center">
          <span className="text-gray-600 truncate" title={node.name}>{node.name}</span>
          <div className="flex items-center space-x-2 truncate">
             {node.hasChanged ? (
                <span className="text-emerald-600 font-medium truncate" title={node.newName}>{node.newName}</span>
             ) : (
                <>
                  <span className="text-gray-400 truncate" title={node.newName}>{node.newName}</span>
                  <span className="bg-gray-100 text-gray-500 text-[10px] px-1.5 py-0.5 rounded flex-shrink-0">无变化</span>
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

export default function RenamePreviewModal({ isOpen, onClose, files, folderPath, onExecute }: RenamePreviewModalProps) {
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 sm:p-6">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col overflow-hidden">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
          <div>
            <h2 className="text-xl font-bold text-gray-900">高级重命名规则与预览</h2>
            <p className="text-sm text-gray-500 mt-1">定制您的重命名规则，支持条件匹配和多种变量（从上到下优先级递减）</p>
          </div>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden flex-col lg:flex-row">
          {/* Left Panel: Rules */}
          <div className="w-full lg:w-1/3 border-r border-gray-100 flex flex-col bg-gray-50/30">
            <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-white">
              <h3 className="font-semibold text-gray-800">重命名规则</h3>
              <button onClick={addRule} className="text-xs flex items-center text-indigo-600 hover:text-indigo-700 bg-indigo-50 px-2 py-1.5 rounded-md transition-colors font-medium">
                <Plus className="w-3 h-3 mr-1" /> 新增规则
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <div className="text-xs text-gray-500 bg-white p-3 rounded-xl border border-gray-200 shadow-sm leading-relaxed">
                <p className="font-semibold mb-2 text-gray-700">可用变量：</p>
                <div className="grid grid-cols-2 gap-2">
                  <div><code className="text-indigo-600 font-bold mr-1">{'{YYYY}'}</code>年</div>
                  <div><code className="text-indigo-600 font-bold mr-1">{'{MM}'}</code>月</div>
                  <div><code className="text-indigo-600 font-bold mr-1">{'{DD}'}</code>日</div>
                  <div><code className="text-indigo-600 font-bold mr-1">{'{HH}'}</code>时</div>
                  <div><code className="text-indigo-600 font-bold mr-1">{'{mm}'}</code>分</div>
                  <div><code className="text-indigo-600 font-bold mr-1">{'{ss}'}</code>秒</div>
                  <div className="col-span-2"><code className="text-emerald-600 font-bold mr-1">{'{TYPE}'}</code>(IMG/VID)</div>
                  <div className="col-span-2"><code className="text-orange-600 font-bold mr-1">{'{DIR_NAME}'}</code>(父文件夹名)</div>
                  <div className="col-span-2"><code className="text-blue-600 font-bold mr-1">{'{ORIG_NAME}'}</code>(原文件名)</div>
                </div>
              </div>
              
              {rules.map((rule, idx) => (
                <div key={rule.id} className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm relative group hover:border-indigo-200 transition-colors">
                  {rules.length > 1 && (
                    <button onClick={() => removeRule(rule.id)} className="absolute top-3 right-3 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity bg-white">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                  <div className="text-xs font-bold text-gray-400 uppercase mb-3 flex items-center">
                    <span className="bg-gray-100 text-gray-500 px-2 py-0.5 rounded mr-2">#{idx + 1}</span>
                    {idx === rules.length - 1 ? '默认回退规则' : '条件规则'}
                  </div>
                  
                  <select 
                    value={rule.conditionType} 
                    onChange={(e) => updateRule(rule.id, { conditionType: e.target.value as any })}
                    className="w-full text-sm border border-gray-200 rounded-md mb-2 p-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-shadow"
                  >
                    <option value="ALL">无条件 (匹配所有)</option>
                    <option value="PATH_CONTAINS">路径包含文本</option>
                    <option value="NAME_STARTSWITH">文件名以...开头</option>
                  </select>

                  {rule.conditionType !== 'ALL' && (
                    <input 
                      type="text" 
                      placeholder="输入匹配文本 (区分大小写)"
                      value={rule.conditionValue}
                      onChange={(e) => updateRule(rule.id, { conditionValue: e.target.value })}
                      className="w-full text-sm border border-gray-200 rounded-md mb-3 p-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-shadow"
                    />
                  )}

                  <label className="block text-xs font-medium text-gray-600 mb-1.5 mt-3">命名模板 (不含后缀)</label>
                  <input 
                    type="text" 
                    value={rule.template}
                    onChange={(e) => updateRule(rule.id, { template: e.target.value })}
                    className="w-full text-sm font-mono border border-gray-200 rounded-md p-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-shadow text-gray-800"
                  />
                </div>
              ))}
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
              
              <button onClick={handleDownloadCSV} className="text-xs font-medium flex items-center text-gray-600 hover:text-gray-900 border border-gray-200 hover:bg-gray-50 bg-white px-3 py-1.5 rounded-lg shadow-sm transition-all">
                <Download className="w-4 h-4 mr-1.5" /> 导出预览 CSV
              </button>
            </div>

            <div className="flex-1 overflow-y-auto bg-white">
              {viewMode === 'flat' ? (
                <table className="w-full text-left text-xs whitespace-nowrap">
                  <thead className="bg-gray-50 sticky top-0 shadow-sm z-10 border-b border-gray-100">
                    <tr>
                      <th className="px-6 py-3 font-semibold text-gray-600">
                         <div className="resize-x overflow-hidden flex items-center min-w-[300px]">
                           <div className="mr-3">
                             <TableSelectMenu 
                               isPageSelected={paginatedData.length > 0 && paginatedData.every(f => selectedPaths.has(f.relativePath))}
                               onSelectPage={handleSelectPage}
                               onSelectAll={handleSelectAll}
                               onSelectNone={handleSelectNone}
                               totalItems={filteredData.length}
                             />
                           </div>
                           <span className="cursor-pointer select-none flex items-center" onClick={() => requestSort('relativePath')}>
                             原文件 (相对路径) {getSortIcon('relativePath')}
                           </span>
                         </div>
                      </th>
                      <th className="px-6 py-3 font-semibold text-emerald-600">
                         <div className="resize-x overflow-hidden flex items-center justify-between min-w-[300px]">
                            <span className="cursor-pointer select-none flex-1" onClick={() => requestSort('newName')}>
                              新文件名预览 {getSortIcon('newName')}
                            </span>
                            <label className="flex items-center space-x-2 text-gray-500 font-normal cursor-pointer bg-gray-100 hover:bg-gray-200 px-2 py-1 rounded transition-colors ml-4">
                              <input 
                                type="checkbox" 
                                checked={onlyDifferences} 
                                onChange={(e) => { setOnlyDifferences(e.target.checked); setPage(1); }} 
                                className="rounded text-indigo-600 focus:ring-indigo-500" 
                              />
                              <span>仅显示差异项</span>
                            </label>
                         </div>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {paginatedData.map((item, idx) => (
                      <tr key={idx} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-3 text-gray-500 break-all" title={item.relativePath}>
                          <div className="flex items-center">
                            <input 
                               type="checkbox" 
                               checked={selectedPaths.has(item.relativePath)}
                               onChange={() => toggleSelection(item.relativePath)}
                               className="mr-3 text-indigo-600 focus:ring-indigo-500 rounded border-gray-300 flex-shrink-0"
                             />
                             <span>{item.relativePath}</span>
                          </div>
                        </td>
                        <td className="px-6 py-3 font-mono break-all" title={item.newName}>
                          <div className="flex items-center space-x-2">
                             {item.hasChanged ? (
                                <span className="text-emerald-600 font-medium">{item.newName}</span>
                             ) : (
                                <>
                                  <span className="text-gray-400">{item.newName}</span>
                                  <span className="bg-gray-100 text-gray-500 text-[10px] px-1.5 py-0.5 rounded flex-shrink-0">无变化</span>
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
                     <label className="flex items-center space-x-2 text-xs text-gray-500 font-medium cursor-pointer bg-gray-50 hover:bg-gray-100 px-2 py-1.5 rounded-lg border border-gray-200 transition-colors">
                       <input 
                         type="checkbox" 
                         checked={onlyDifferences} 
                         onChange={(e) => { setOnlyDifferences(e.target.checked); setPage(1); }} 
                         className="rounded text-indigo-600 focus:ring-indigo-500" 
                       />
                       <span>仅显示差异项</span>
                     </label>
                  </div>
                  <TreeNode node={treeData} selectedPaths={selectedPaths} onToggle={toggleSelection} />
                </div>
              )}
            </div>

            {/* Pagination & Action */}
            <div className="px-6 py-4 border-t border-gray-100 flex justify-between items-center bg-gray-50/80 backdrop-blur">
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
                  <div className="text-xs font-medium text-gray-600 mt-4 bg-gray-50 p-2 rounded border border-gray-100 flex items-center h-[52px]">已选 {selectedPaths.size} / {filteredData.length} 项</div>
                )}
              </div>
              <div className="flex-shrink-0 mt-4">
                <button 
                  onClick={executeRename}
                  disabled={selectedPaths.size === 0}
                  className="px-6 py-2.5 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-900 transition-all flex items-center shadow-md"
                >
                  <Play className="w-4 h-4 mr-2" />
                  执行选中的 {selectedPaths.size} 项重命名
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
