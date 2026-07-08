import React from 'react';

interface TableSelectMenuProps {
  isPageSelected: boolean;
  isAllSelected: boolean;
  onSelectPage: () => void;
  onSelectAll: () => void;
  onSelectNone: () => void;
  totalItems: number;
}

export function TableSelectMenu({ 
  isPageSelected, 
  isAllSelected,
  onSelectPage, 
  onSelectAll, 
  onSelectNone, 
  totalItems 
}: TableSelectMenuProps) {
  return (
    <div className="flex flex-row items-center justify-center space-x-1.5 font-normal">
      <button
        onClick={onSelectPage}
        className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors w-10 font-mono ${
          isPageSelected 
            ? 'bg-cyan-950/50 border-cyan-800 text-cyan-400' 
            : 'bg-slate-900 border-slate-700 text-slate-400 hover:bg-slate-800 hover:text-slate-300'
        }`}
        title="本页全选/取消"
      >
        本页
      </button>
      <button
        onClick={isAllSelected ? onSelectNone : onSelectAll}
        className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors w-10 whitespace-nowrap font-mono ${
          isAllSelected
            ? 'bg-cyan-950/50 border-cyan-800 text-cyan-400'
            : 'bg-slate-900 border-slate-700 text-slate-400 hover:bg-slate-800 hover:text-slate-300'
        }`}
        title={`所有全选 (${totalItems})`}
      >
        全部
      </button>
    </div>
  );
}
