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
    <div className="flex flex-col items-center justify-center space-y-1.5 font-normal">
      <button
        onClick={onSelectPage}
        className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors w-10 ${
          isPageSelected 
            ? 'bg-indigo-50 border-indigo-200 text-indigo-700' 
            : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
        }`}
        title="本页全选/取消"
      >
        本页
      </button>
      <button
        onClick={isAllSelected ? onSelectNone : onSelectAll}
        className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors w-10 whitespace-nowrap ${
          isAllSelected
            ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
            : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
        }`}
        title={`所有全选 (${totalItems})`}
      >
        所有
      </button>
    </div>
  );
}
