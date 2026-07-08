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
    <div className="mt-4 flex items-center justify-between text-sm text-slate-400 bg-slate-900/50 p-2 rounded border border-slate-800 flex-wrap gap-2">
      <div className="flex items-center space-x-4 font-mono">
        <span>共 {totalItems} 项</span>
        <div className="flex items-center space-x-1">
          <span>每页</span>
          <select 
            value={pageSize} 
            onChange={(e) => {
              onPageSizeChange(Number(e.target.value));
              onPageChange(1); // Reset to page 1 on page size change
            }}
            className="border-slate-700 rounded-md py-1 px-2 text-sm focus:ring-cyan-500 focus:border-cyan-500 outline-none bg-slate-950 text-slate-300"
          >
            <option value={10}>10</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
            <option value={200}>200</option>
            <option value={500}>500</option>
            <option value={1000}>1000</option>
          </select>
        </div>
      </div>
      <div className="flex space-x-2 items-center font-mono text-xs">
        <button onClick={() => onPageChange(Math.max(1, page - 1))} disabled={page === 1} className="px-3 py-1 bg-slate-800 border border-slate-700 text-slate-300 rounded hover:bg-slate-700 hover:text-white disabled:opacity-30 transition-colors tracking-wider">上一页</button>
        
        <div className="flex items-center space-x-2 px-2">
          <input 
            type="text" 
            value={jumpValue}
            onChange={(e) => setJumpValue(e.target.value)}
            onBlur={handleJump}
            onKeyDown={handleKeyDown}
            className="w-10 text-center border border-slate-700 rounded-md py-1 text-sm focus:ring-cyan-500 focus:border-cyan-500 outline-none bg-slate-950 text-slate-200"
          />
          <span className="text-slate-600">/ {totalPages}</span>
        </div>

        <button onClick={() => onPageChange(Math.min(totalPages, page + 1))} disabled={page === totalPages} className="px-3 py-1 bg-slate-800 border border-slate-700 text-slate-300 rounded hover:bg-slate-700 hover:text-white disabled:opacity-30 transition-colors tracking-wider">下一页</button>
      </div>
    </div>
  );
}
