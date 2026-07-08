import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { promises as fsPromises } from 'fs';
import { createServer as createViteServer } from 'vite';
import exifParser from 'exif-parser';
import ffmpeg from 'fluent-ffmpeg';
import ffprobeStatic from 'ffprobe-static';
import os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';
import readline from 'readline';
import piexifjs from 'piexifjs';

const execAsync = promisify(exec);

import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';

// Configure fluent-ffmpeg to use static binaries
ffmpeg.setFfprobePath(ffprobeStatic.path);
ffmpeg.setFfmpegPath(ffmpegInstaller.path);


const upload = multer({ dest: 'uploads/' });

// 全局任务状态管理 (支持暂停、停止)
const tasks = new Map<string, { state: 'running' | 'paused' | 'stopped' }>();

// 全局中断控制
let globalCancelRequested = false;

/**
 * 解析图片时间 (提取 EXIF DateTimeOriginal)
 */
async function parseImageTime(filePath: string): Promise<number | null> {
    let fd = null;
    try {
        fd = await fsPromises.open(filePath, 'r');
        const buffer = Buffer.alloc(64 * 1024); // 64KB
        const { bytesRead } = await fd.read(buffer, 0, buffer.length, 0);
        
        const validBuffer = buffer.subarray(0, bytesRead);
        
        const parser = exifParser.create(validBuffer);
        const result = parser.parse();
        
        const tags = result.tags;
        if (tags && tags.DateTimeOriginal) {
            const utcTime = tags.DateTimeOriginal * 1000;
            // exif-parser treats EXIF string as UTC, causing an offset. Adjust to Local time.
            // Since the server is in UTC, new Date().getTimezoneOffset() is 0. 
            // We use -480 (UTC+8) for the 8 hours difference.
            const offset = -480 * 60 * 1000;
            return utcTime + offset;
        }
        
        return null;
    } catch (error: any) {
        // 解析异常(如非标准图片或无EXIF)
        return null;
    } finally {
        if (fd) {
            await fd.close();
        }
    }
}

/**
 * 解析视频时间 (提取 creation_time)
 */
function parseVideoTime(filePath: string): Promise<number | null> {
    return new Promise((resolve) => {
        ffmpeg.ffprobe(filePath, async (err: any, metadata: any) => {
            try {
                if (err) {
                    throw err;
                }
                
                const tags = metadata.format && metadata.format.tags;
                if (tags && tags.creation_time) {
                    const creationTimeStr = tags.creation_time;
                    const dateObj = new Date(creationTimeStr);
                    if (!isNaN(dateObj.getTime())) {
                        // creation_time is usually stored as UTC in MP4
                        return resolve(dateObj.getTime());
                    }
                }
                
                resolve(null);
            } catch (error: any) {
                resolve(null);
            }
        });
    });
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Make sure uploads directory exists
  if (!fs.existsSync('uploads')) {
      fs.mkdirSync('uploads');
  }

  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));

  // 任务控制接口
  app.post('/api/task/:id/pause', (req, res) => {
      const task = tasks.get(req.params.id);
      if (task) task.state = 'paused';
      res.json({ success: true });
  });
  app.post('/api/task/:id/resume', (req, res) => {
      const task = tasks.get(req.params.id);
      if (task) task.state = 'running';
      res.json({ success: true });
  });
  app.post('/api/task/:id/stop', (req, res) => {
      const task = tasks.get(req.params.id);
      if (task) task.state = 'stopped';
      res.json({ success: true });
  });

  app.post('/api/stop-task', (req, res) => {
      globalCancelRequested = true;
      for (const task of tasks.values()) {
          task.state = 'stopped';
      }
      res.json({ success: true, message: '任务中断请求已发送' });
  });

  app.post('/api/scan-folder', async (req, res) => {
    // 设置流式响应以避免在大量文件时请求超时
    res.setHeader('Content-Type', 'application/x-ndjson');
    res.setHeader('Transfer-Encoding', 'chunked');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const sendEvent = (data: any) => {
        res.write(JSON.stringify(data) + '\n');
    };

    let writeStream: fs.WriteStream | null = null;

    try {
        globalCancelRequested = false;
        
        const { folderPath, taskId } = req.body;

        if (!folderPath || typeof folderPath !== 'string') {
            sendEvent({ type: 'error', error: '请提供有效的文件夹路径。' });
            return res.end();
        }

        if (taskId) {
            tasks.set(taskId, { state: 'running' });
        }

        if (!fs.existsSync(folderPath)) {
            sendEvent({ type: 'error', error: `目录不存在: ${folderPath}` });
            return res.end();
        }

        const stat = fs.statSync(folderPath);
        if (!stat.isDirectory()) {
            sendEvent({ type: 'error', error: `给定的路径不是一个文件夹: ${folderPath}` });
            return res.end();
        }
        
        const cacheFilePath = path.join(os.tmpdir(), '.scan_cache.jsonl');
        writeStream = fs.createWriteStream(cacheFilePath, { flags: 'w' });

        sendEvent({ type: 'folder', path: folderPath });
        sendEvent({ type: 'log', message: `开始递归扫描: ${folderPath}` });

        let scannedCount = 0;
        let parsedCount = 0;
        let isStopped = false;

        async function scanDirectoryStream(dir: string, baseDir: string) {
            if (isStopped || globalCancelRequested) return;
            let entries;
            try {
                entries = await fsPromises.readdir(dir, { withFileTypes: true });
            } catch (err) {
                console.error(`读取目录失败 ${dir}:`, err);
                return;
            }
            
            for (const entry of entries) {
                if (globalCancelRequested) {
                    isStopped = true;
                    break;
                }
                
                if (taskId) {
                    while (tasks.get(taskId)?.state === 'paused') {
                        if (globalCancelRequested) break;
                        await new Promise(r => setTimeout(r, 500));
                    }
                    if (tasks.get(taskId)?.state === 'stopped' || globalCancelRequested) {
                        isStopped = true;
                        return;
                    }
                }

                const fullPath = path.join(dir, entry.name);
                if (entry.isDirectory()) {
                    await scanDirectoryStream(fullPath, baseDir);
                } else {
                    scannedCount++;
                    const ext = path.extname(entry.name).toLowerCase();
                    const isVideo = ['.mp4', '.mov', '.avi', '.mkv', '.webm'].includes(ext);
                    const isImage = ['.jpg', '.jpeg', '.png', '.webp', '.heic'].includes(ext);
                    
                    if (isVideo || isImage) {
                        try {
                            const relativePath = path.relative(baseDir, fullPath);
                            const startTime = Date.now();
                            
                            let stats;
                            try {
                                stats = await fsPromises.stat(fullPath);
                            } catch (e) {
                                stats = { mtimeMs: Date.now() }; // Fallback for stat error
                            }
                            const mtime = Math.round(stats.mtimeMs);
                            
                            let parsedTime;
                            
                            if (isVideo) {
                                parsedTime = await parseVideoTime(fullPath);
                            } else {
                                parsedTime = await parseImageTime(fullPath);
                            }
                            
                            const timestamp = parsedTime || mtime; // 兼容原逻辑
                            const timeSource = parsedTime ? '内部元数据' : '文件系统时间';
                            const parseDuration = Date.now() - startTime;
                            
                            parsedCount++;
                            const fileResult = {
                                originalName: entry.name,
                                relativePath,
                                timestamp,       // default best-effort time
                                exifTime: parsedTime, // nullable
                                mtime,           // original mtime
                                timeSource,
                                date: new Date(timestamp).toISOString(),
                                parseDuration,
                                type: isVideo ? 'video' : 'image'
                            };
                            
                            if (writeStream) {
                                writeStream.write(JSON.stringify(fileResult) + '\n');
                            }
                            
                            sendEvent({
                                type: 'file',
                                result: fileResult
                            });
                        } catch (err: any) {
                            sendEvent({
                                type: 'file_error',
                                result: {
                                    originalName: entry.name,
                                    relativePath: path.relative(baseDir, fullPath),
                                    error: err.message
                                }
                            });
                        }
                    }
                    
                    // 每 50 个文件释放一下事件循环，防止几十万文件直接把 Node 阻塞导致 OOM 或无响应
                    if (scannedCount % 50 === 0) {
                        await new Promise(r => setTimeout(r, 1));
                    }
                }
            }
        }

        await scanDirectoryStream(folderPath, folderPath);
        
        if (writeStream) {
            writeStream.end();
            writeStream = null;
        }
        
        if (globalCancelRequested) {
            sendEvent({ type: 'stopped', message: '扫描已手动终止，当前进度已安全落盘。' });
        } else if (taskId && tasks.get(taskId)?.state === 'stopped') {
            sendEvent({ type: 'done', total: parsedCount, scanned: scannedCount, message: '扫描已终止' });
        } else {
            sendEvent({ type: 'done', total: parsedCount, scanned: scannedCount });
        }
        
        if (taskId) tasks.delete(taskId);
        res.end();

    } catch (err: any) {
        if (writeStream) {
            writeStream.end();
        }
        sendEvent({ type: 'error', error: err.message });
        res.end();
    }
  });

  app.post('/api/export-csv', express.urlencoded({ limit: '50mb', extended: true }), async (req, res) => {
     const d = new Date();
     const localD = new Date(d.getTime() + 8 * 60 * 60 * 1000);
     const pad = (n: number) => n.toString().padStart(2, '0');
     const timestampStr = `${localD.getUTCFullYear()}${pad(localD.getUTCMonth() + 1)}${pad(localD.getUTCDate())}_${pad(localD.getUTCHours())}${pad(localD.getUTCMinutes())}${pad(localD.getUTCSeconds())}`;
     res.setHeader('Content-Disposition', `attachment; filename=timeline_export_${timestampStr}.csv`);
     res.setHeader('Content-Type', 'text/csv; charset=utf-8');
     
     let selectedFiles = new Set<string>();
     try {
         if (req.body.selectedFiles) {
             const parsed = JSON.parse(req.body.selectedFiles);
             if (Array.isArray(parsed) && parsed.length > 0) {
                 selectedFiles = new Set(parsed);
             }
         }
     } catch(e) {
         console.error('Failed to parse selectedFiles', e);
     }
     
     res.write('\uFEFF');
     res.write('原始路径,相对路径,媒体类型,13位时间戳,格式化时间,时间来源\n');
     
     const cacheFilePath = path.join(os.tmpdir(), '.scan_cache.jsonl');
     if (!fs.existsSync(cacheFilePath)) {
         return res.end();
     }

     const rl = readline.createInterface({
         input: fs.createReadStream(cacheFilePath),
         crlfDelay: Infinity
     });

     for await (const line of rl) {
         if (!line.trim()) continue;
         try {
             const f = JSON.parse(line);
             // If selectedFiles is provided and this file is not in it, skip
             if (selectedFiles.size > 0 && !selectedFiles.has(f.relativePath)) continue;

             const escapeCsv = (str: string | number) => `"${String(str).replace(/"/g, '""')}"`;
             
             const d = new Date(f.timestamp);
             const localD = new Date(d.getTime() + 8 * 60 * 60 * 1000); // Format as UTC+8
             const pad = (n: number) => n.toString().padStart(2, '0');
             const formattedTime = `${localD.getUTCFullYear()}-${pad(localD.getUTCMonth() + 1)}-${pad(localD.getUTCDate())} ${pad(localD.getUTCHours())}:${pad(localD.getUTCMinutes())}:${pad(localD.getUTCSeconds())}`;

             const csvRow = [
                 escapeCsv(f.relativePath), // Without folderPath, relativePath is best we have
                 escapeCsv(f.relativePath), 
                 escapeCsv(f.type === 'video' ? '视频' : '图片'),
                 escapeCsv(f.timestamp),
                 escapeCsv(formattedTime),
                 escapeCsv(f.timeSource || '未知')
             ].join(',');
             res.write(csvRow + '\n');
         } catch(e) {}
     }
     res.end();
  });

  // 接口1：物理时间同步 (流式进度)
  app.post('/api/sync-time', async (req: express.Request, res: express.Response): Promise<any> => {
    res.setHeader('Content-Type', 'application/x-ndjson');
    res.setHeader('Transfer-Encoding', 'chunked');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const sendEvent = (data: any) => {
        res.write(JSON.stringify(data) + '\n');
    };

    try {
      globalCancelRequested = false;
      const { folderPath, taskId, total, syncPlan } = req.body;
      const syncMap = new Map<string, number>();
      if (Array.isArray(syncPlan)) {
          syncPlan.forEach(p => syncMap.set(p.relativePath, p.targetTimestamp));
      }
      if (!folderPath) {
        sendEvent({ type: 'error', error: '无效的请求参数' });
        return res.end();
      }

      if (taskId) {
          tasks.set(taskId, { state: 'running' });
      }
      
      const cacheFilePath = path.join(os.tmpdir(), '.scan_cache.jsonl');
      if (!fs.existsSync(cacheFilePath)) {
          sendEvent({ type: 'error', error: '缓存文件不存在，请重新扫描' });
          return res.end();
      }

      let successCount = 0;
      let errorCount = 0;
      const errors = [];
      const totalCount = total || 0; // passed from frontend if available
      let currentCount = 0;
      let isStopped = false;

      const rl = readline.createInterface({
          input: fs.createReadStream(cacheFilePath),
          crlfDelay: Infinity
      });

      for await (const line of rl) {
        if (globalCancelRequested) {
            isStopped = true;
            rl.close();
            break;
        }
        
        if (taskId) {
            while (tasks.get(taskId)?.state === 'paused') {
                if (globalCancelRequested) break;
                await new Promise(r => setTimeout(r, 500));
            }
            if (tasks.get(taskId)?.state === 'stopped' || globalCancelRequested) {
                isStopped = true;
                rl.close();
                break;
            }
        }

        if (!line.trim()) continue;
        
        try {
          const item = JSON.parse(line);
          
          // 如果提供了 syncPlan，只处理在 syncPlan 中的文件，且使用 syncPlan 中指定的目标时间戳
          let targetTimestamp = item.timestamp;
          if (syncMap.size > 0) {
              if (!syncMap.has(item.relativePath)) continue;
              targetTimestamp = syncMap.get(item.relativePath)!;
          }
          
          const fullPath = path.join(folderPath, item.relativePath);
          const dateObj = new Date(targetTimestamp);
          
          await fsPromises.utimes(fullPath, dateObj, dateObj);
          successCount++;
        } catch (err: any) {
          errorCount++;
          // Only store first 50 errors to avoid memory bloat
          if (errors.length < 50) {
              errors.push({ error: err.message });
          }
        }
        
        currentCount++;
        if (currentCount % 10 === 0) {
          sendEvent({ type: 'progress', current: currentCount, total: totalCount || currentCount });
        }
      }

      sendEvent({ type: 'done', successCount, errorCount, errors, stopped: isStopped });
      if (taskId) tasks.delete(taskId);
      res.end();
    } catch (err: any) {
      sendEvent({ type: 'error', error: err.message });
      res.end();
    }
  });

  // 接口2：规则重命名 (流式进度)
  app.post('/api/rename-files', async (req: express.Request, res: express.Response): Promise<any> => {
    res.setHeader('Content-Type', 'application/x-ndjson');
    res.setHeader('Transfer-Encoding', 'chunked');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const sendEvent = (data: any) => {
        res.write(JSON.stringify(data) + '\n');
    };

    try {
      globalCancelRequested = false;
      const { folderPath, taskId, total, renamePlan } = req.body;
      const renameSet = new Set<string>();
      if (Array.isArray(renamePlan)) {
          renamePlan.forEach(p => renameSet.add(p.relativePath));
      }
      if (!folderPath) {
        sendEvent({ type: 'error', error: '无效的请求参数' });
        return res.end();
      }

      if (taskId) {
          tasks.set(taskId, { state: 'running' });
      }

      const cacheFilePath = path.join(os.tmpdir(), '.scan_cache.jsonl');
      if (!fs.existsSync(cacheFilePath)) {
          sendEvent({ type: 'error', error: '缓存文件不存在，请重新扫描' });
          return res.end();
      }

      let successCount = 0;
      let errorCount = 0;
      const errors = [];
      const totalCount = total || 0; // passed from frontend if available
      let currentCount = 0;
      let isStopped = false;

      const rl = readline.createInterface({
          input: fs.createReadStream(cacheFilePath),
          crlfDelay: Infinity
      });

      for await (const line of rl) {
        if (globalCancelRequested) {
            isStopped = true;
            rl.close();
            break;
        }
        
        if (taskId) {
            while (tasks.get(taskId)?.state === 'paused') {
                if (globalCancelRequested) break;
                await new Promise(r => setTimeout(r, 500));
            }
            if (tasks.get(taskId)?.state === 'stopped' || globalCancelRequested) {
                isStopped = true;
                rl.close();
                break;
            }
        }

        if (!line.trim()) continue;
        
        try {
          const item = JSON.parse(line);
          
          if (renameSet.size > 0 && !renameSet.has(item.relativePath)) {
              continue;
          }
          
          const oldFullPath = path.join(folderPath, item.relativePath);
          const ext = path.extname(item.originalName);
          
          const d = new Date(item.timestamp);
          const pad = (n: number) => n.toString().padStart(2, '0');
          const typeStr = item.type === 'video' ? 'VID' : 'IMG';
          const newBaseName = `${typeStr}_${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
          
          const dirName = path.dirname(oldFullPath);
          
          let newFullPath = path.join(dirName, `${newBaseName}${ext}`);
          let counter = 1;
          
          while (fs.existsSync(newFullPath)) {
             if (oldFullPath === newFullPath) break;
             
             const suffix = `_${counter.toString().padStart(3, '0')}`;
             newFullPath = path.join(dirName, `${newBaseName}${suffix}${ext}`);
             counter++;
          }
          
          if (oldFullPath !== newFullPath) {
             await fsPromises.rename(oldFullPath, newFullPath);
          }
          
          successCount++;
        } catch (err: any) {
          errorCount++;
          if (errors.length < 50) {
             errors.push({ error: err.message });
          }
        }

        currentCount++;
        if (currentCount % 10 === 0) {
          sendEvent({ type: 'progress', current: currentCount, total: totalCount || currentCount });
        }
      }

      sendEvent({ type: 'done', successCount, errorCount, errors, stopped: isStopped });
      if (taskId) tasks.delete(taskId);
      res.end();
    } catch (err: any) {
      sendEvent({ type: 'error', error: err.message });
      res.end();
    }
  });

  // 接口3：深度写入元数据 (流式进度)
  app.post('/api/inject-metadata', async (req: express.Request, res: express.Response): Promise<any> => {
    res.setHeader('Content-Type', 'application/x-ndjson');
    res.setHeader('Transfer-Encoding', 'chunked');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const sendEvent = (data: any) => {
        res.write(JSON.stringify(data) + '\n');
    };

    try {
      globalCancelRequested = false;
      const { folderPath, taskId, total, injectPlan } = req.body;
      const injectMap = new Map<string, number>();
      
      // 如果前端传递了需要注入的列表及其目标时间
      if (Array.isArray(injectPlan)) {
          injectPlan.forEach(p => {
              if (p.relativePath && p.targetTimestamp) {
                  injectMap.set(p.relativePath, p.targetTimestamp);
              }
          });
      }
      
      if (!folderPath) {
        sendEvent({ type: 'error', error: '无效的请求参数' });
        return res.end();
      }

      if (taskId) {
          tasks.set(taskId, { state: 'running' });
      }

      const cacheFilePath = path.join(os.tmpdir(), '.scan_cache.jsonl');
      if (!fs.existsSync(cacheFilePath)) {
          sendEvent({ type: 'error', error: '缓存文件不存在，请重新扫描' });
          return res.end();
      }

      let successCount = 0;
      let errorCount = 0;
      const errors = [];
      const totalCount = total || 0;
      let currentCount = 0;
      let isStopped = false;

      const rl = readline.createInterface({
          input: fs.createReadStream(cacheFilePath),
          crlfDelay: Infinity
      });

      for await (const line of rl) {
        if (globalCancelRequested) {
            isStopped = true;
            rl.close();
            break;
        }
        
        if (taskId) {
            while (tasks.get(taskId)?.state === 'paused') {
                if (globalCancelRequested) break;
                await new Promise(r => setTimeout(r, 500));
            }
            if (tasks.get(taskId)?.state === 'stopped' || globalCancelRequested) {
                isStopped = true;
                rl.close();
                break;
            }
        }

        if (!line.trim()) continue;
        
        try {
          const item = JSON.parse(line);
          
          if (injectMap.size > 0 && !injectMap.has(item.relativePath)) {
              continue;
          }
          
          const fullPath = path.join(folderPath, item.relativePath);
          
          if (!fs.existsSync(fullPath)) {
             throw new Error("文件不存在");
          }

          // 优先使用前端传递的 targetTimestamp
          const targetTimestamp = injectMap.has(item.relativePath) ? injectMap.get(item.relativePath)! : item.timestamp;
          const d = new Date(targetTimestamp);
          
          if (item.type === 'image') {
              const ext = path.extname(fullPath).toLowerCase();
              if (['.jpg', '.jpeg'].includes(ext)) {
                  // piexifjs requires binary string
                  const fileData = await fsPromises.readFile(fullPath, 'binary');
                  let exifObj;
                  try {
                      exifObj = piexifjs.load(fileData);
                  } catch (e) {
                      exifObj = { '0th': {}, 'Exif': {}, 'GPS': {}, '1st': {}, 'Interop': {} };
                  }
                  
                  // Format: YYYY:MM:DD HH:mm:ss
                  const pad = (n: number) => n.toString().padStart(2, '0');
                  const exifDateStr = `${d.getFullYear()}:${pad(d.getMonth() + 1)}:${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
                  
                  exifObj['0th'][piexifjs.ImageIFD.DateTime] = exifDateStr;
                  exifObj['Exif'][piexifjs.ExifIFD.DateTimeOriginal] = exifDateStr;
                  exifObj['Exif'][piexifjs.ExifIFD.DateTimeDigitized] = exifDateStr;
                  
                  const exifBytes = piexifjs.dump(exifObj);
                  const newData = piexifjs.insert(exifBytes, fileData);
                  
                  const buffer = Buffer.from(newData, 'binary');
                  await fsPromises.writeFile(fullPath, buffer);
              } else {
                  throw new Error(`暂不支持该图片格式的元数据注入: ${ext}`);
              }
          } else if (item.type === 'video') {
              const ext = path.extname(fullPath).toLowerCase();
              if (['.mp4', '.mov'].includes(ext)) {
                  const tempPath = fullPath + '_temp' + ext;
                  const isoString = d.toISOString();
                  
                  await new Promise((resolve, reject) => {
                      ffmpeg(fullPath)
                          .outputOptions([
                              '-c', 'copy',
                              '-map', '0:v', '-map', '0:a?', '-map', '0:s?',
                              '-metadata', `creation_time=${isoString}`
                          ])
                          .output(tempPath)
                          .on('end', () => resolve(true))
                          .on('error', (err, stdout, stderr) => reject(new Error(`${err.message} stderr: ${stderr}`)))
                          .run();
                  });
                  
                  await fsPromises.rename(tempPath, fullPath);
              } else {
                  throw new Error(`暂不支持该视频格式的元数据注入: ${ext}`);
              }
          }
          
          successCount++;
        } catch (err: any) {
          errorCount++;
          if (errors.length < 50) {
             errors.push({ error: err.message, path: JSON.parse(line).relativePath });
          }
        }

        currentCount++;
        if (currentCount % 10 === 0) {
          sendEvent({ type: 'progress', current: currentCount, total: totalCount || currentCount });
        }
      }

      sendEvent({ type: 'done', successCount, errorCount, errors, stopped: isStopped });
      if (taskId) tasks.delete(taskId);
      res.end();
    } catch (err: any) {
      sendEvent({ type: 'error', error: err.message });
      res.end();
    }
  });

  app.post('/api/parse', upload.single('file'), async (req: express.Request, res: express.Response): Promise<any> => {
    try {
      const localPath = req.body.localPath;
      
      let filePath = '';
      let originalName = '';
      let mimetype = '';
      let isUploaded = false;

      if (localPath) {
        filePath = localPath;
        originalName = path.basename(localPath);
        const ext = path.extname(localPath).toLowerCase();
        if (['.mp4', '.mov', '.avi', '.mkv', '.webm'].includes(ext)) {
            mimetype = 'video/' + ext.substring(1);
        } else {
            mimetype = 'image/' + ext.substring(1);
        }
      } else if (req.file) {
        filePath = req.file.path;
        originalName = req.file.originalname;
        mimetype = req.file.mimetype;
        isUploaded = true;
      } else {
        return res.status(400).json({ error: '请上传文件或提供本地文件路径' });
      }
      
      console.log(`收到请求处理: ${originalName} (本地直读: ${!!localPath})`);
      
      const startTime = Date.now();
      let timestamp;
      
      if (mimetype.startsWith('image/')) {
        timestamp = await parseImageTime(filePath);
      } else if (mimetype.startsWith('video/')) {
        timestamp = await parseVideoTime(filePath);
      } else {
         const ext = path.extname(originalName).toLowerCase();
         if (['.mp4', '.mov', '.avi', '.mkv', '.webm'].includes(ext)) {
             timestamp = await parseVideoTime(filePath);
         } else {
             timestamp = await parseImageTime(filePath);
         }
      }
      const parseDuration = Date.now() - startTime;
      const timeSource = timestamp ? '内部元数据' : '文件系统时间';
      
      if (isUploaded) {
          fs.unlink(filePath, (err) => {
              if (err) console.error("清理临时文件失败:", err);
          });
      }
      
      res.json({ timestamp, date: new Date(timestamp).toISOString(), originalName, parseDuration, timeSource });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
