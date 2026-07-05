import React, { useState, useEffect } from 'react';

interface PaginationProps {
  page: number;
  pageSize: number;
  totalItems: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}

export function Pagination({ page, pageSize, totalItems, onPageChange, onPageSizeChange }: PaginationProps) {
  const totalPages = Math.ceil(totalItems / pageSize) || 1;
  const [jumpValue, setJumpValue] = useState(page.toString());

  useEffect(() => {
    setJumpValue(page.toString());
  }, [page]);

  const handleJump = () => {
    const p = parseInt(jumpValue, 10);
    if (!isNaN(p) && p >= 1 && p <= totalPages) {
      onPageChange(p);
    } else {
      setJumpValue(page.toString());
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleJump();
    }
  };

  return (
    <div className="mt-4 flex items-center justify-between text-sm text-gray-600 bg-gray-50 p-2 rounded border border-gray-100 flex-wrap gap-2">
      <div className="flex items-center space-x-4">
        <span>共 {totalItems} 条记录</span>
        <div className="flex items-center space-x-1">
          <span>每页</span>
          <select 
            value={pageSize} 
            onChange={(e) => {
              onPageSizeChange(Number(e.target.value));
              onPageChange(1); // Reset to page 1 on page size change
            }}
            className="border-gray-200 rounded-md py-1 px-2 text-sm focus:ring-indigo-500 focus:border-indigo-500 outline-none bg-white"
          >
            <option value={10}>10</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
            <option value={200}>200</option>
            <option value={500}>500</option>
            <option value={1000}>1000</option>
          </select>
          <span>条</span>
        </div>
      </div>
      <div className="flex space-x-2 items-center">
        <button onClick={() => onPageChange(Math.max(1, page - 1))} disabled={page === 1} className="px-3 py-1 bg-white border border-gray-200 rounded hover:bg-gray-100 disabled:opacity-50 transition-colors shadow-sm">上一页</button>
        
        <div className="flex items-center space-x-1">
          <input 
            type="text" 
            value={jumpValue}
            onChange={(e) => setJumpValue(e.target.value)}
            onBlur={handleJump}
            onKeyDown={handleKeyDown}
            className="w-12 text-center border border-gray-200 rounded-md py-1 text-sm focus:ring-indigo-500 focus:border-indigo-500 outline-none bg-white"
          />
          <span className="font-mono text-gray-500">/ {totalPages}</span>
        </div>

        <button onClick={() => onPageChange(Math.min(totalPages, page + 1))} disabled={page === totalPages} className="px-3 py-1 bg-white border border-gray-200 rounded hover:bg-gray-100 disabled:opacity-50 transition-colors shadow-sm">下一页</button>
      </div>
    </div>
  );
}
