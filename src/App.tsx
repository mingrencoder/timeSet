/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import { Clock, AlertCircle, MonitorUp } from 'lucide-react';

export default function App() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ folderPath: string; total: number; results: Array<{ originalName: string; relativePath: string; timestamp: number; date: string; parseDuration: number; type: string }> } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleNativePick = async () => {
    setLoading(true);
    setError(null);
    setResult({ folderPath: '', total: 0, results: [] });

    try {
      const response = await fetch('/api/pick-and-parse');
      if (!response.body) throw new Error('ReadableStream not supported in this browser.');

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
            
            if (data.type === 'log') {
              console.log(data.message);
            } else if (data.type === 'folder') {
              currentResult.folderPath = data.path;
              setResult({ ...currentResult });
            } else if (data.type === 'file') {
              currentResult.results.unshift(data.result);
              currentResult.total++;
              // 限制前端仅展示最新的 500 条数据，防止几十万数据直接把浏览器 DOM 撑爆 (OOM)
              if (currentResult.results.length > 500) {
                  currentResult.results.pop();
              }
              // 每 10 个文件或使用 throttle 方式更新 state 更好，但对于测试可以直接更新
              setResult({ ...currentResult });
            } else if (data.type === 'file_error') {
              // 处理单个文件解析失败的情况（可选）
            } else if (data.type === 'done') {
              console.log('扫描完成，总计:', data.total);
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
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-4xl bg-white rounded-xl shadow-lg p-8 border border-gray-100">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">极速媒体时间解析</h1>
          <p className="text-sm text-gray-500 mt-2">Node.js 系统原生对话框直读</p>
        </div>

        <button
          onClick={handleNativePick}
          disabled={loading}
          className="w-full py-4 px-4 bg-gray-900 text-white rounded-lg font-medium hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-900 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center space-x-2 shadow-sm"
        >
          <MonitorUp className="w-5 h-5" />
          <span>{loading ? '正在唤起系统窗口或深度扫描解析中...' : '呼出系统窗口选择文件夹'}</span>
        </button>

        <p className="text-xs text-gray-400 text-center mt-4 leading-relaxed">
          点击按钮将通过 Node.js 原生唤起电脑的文件夹选择窗口。<br/>选中后将自动递归扫描目录下所有图片和视频。
        </p>

        {error && (
          <div className="mt-6 p-4 bg-red-50 text-red-700 rounded-lg flex items-start space-x-3 text-sm border border-red-100">
            <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <span className="leading-relaxed">{error}</span>
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

            <div className="max-h-[400px] overflow-y-auto border border-gray-200 rounded bg-white relative shadow-inner">
              <table className="w-full text-left text-xs whitespace-nowrap">
                <thead className="bg-gray-100 sticky top-0 shadow-sm z-10">
                  <tr>
                    <th className="px-4 py-3 font-medium text-gray-600">相对路径</th>
                    <th className="px-4 py-3 font-medium text-gray-600">类型</th>
                    <th className="px-4 py-3 font-medium text-gray-600">解析时间戳</th>
                    <th className="px-4 py-3 font-medium text-gray-600">标准时间</th>
                    <th className="px-4 py-3 font-medium text-gray-600 text-right">单文件耗时</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {result.results.length === 0 && (
                    <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-500">该目录下尚未解析到媒体文件或文件不存在</td></tr>
                  )}
                  {result.results.map((item, idx) => (
                    <tr key={idx} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-2 font-mono text-gray-800 max-w-[200px] truncate" title={item.relativePath}>{item.relativePath}</td>
                      <td className="px-4 py-2 text-gray-500">{item.type === 'video' ? '🎬 视频' : '🖼️ 图片'}</td>
                      <td className="px-4 py-2 font-mono text-gray-500">{item.timestamp}</td>
                      <td className="px-4 py-2 font-mono text-gray-800">{item.date}</td>
                      <td className="px-4 py-2 text-right font-mono text-emerald-600">{item.parseDuration} ms</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-2 text-right text-xs text-gray-400">
              * 为防止浏览器内存溢出(OOM)，前端仅展示最新解析的 {Math.min(500, result.total)} 条记录。
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
