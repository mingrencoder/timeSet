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

const execAsync = promisify(exec);

ffmpeg.setFfprobePath(ffprobeStatic.path);

const upload = multer({ dest: 'uploads/' });

// 全局任务状态管理 (支持暂停、停止)
const tasks = new Map<string, { state: 'running' | 'paused' | 'stopped' }>();

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
            return tags.DateTimeOriginal * 1000;
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

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

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

  app.post('/api/scan-folder', async (req, res) => {
    // 设置流式响应以避免在大量文件时请求超时
    res.setHeader('Content-Type', 'application/x-ndjson');
    res.setHeader('Transfer-Encoding', 'chunked');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const sendEvent = (data: any) => {
        res.write(JSON.stringify(data) + '\n');
    };

    try {
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

        sendEvent({ type: 'folder', path: folderPath });
        sendEvent({ type: 'log', message: `开始递归扫描: ${folderPath}` });

        let scannedCount = 0;
        let parsedCount = 0;
        let isStopped = false;

        async function scanDirectoryStream(dir: string, baseDir: string) {
            if (isStopped) return;
            let entries;
            try {
                entries = await fsPromises.readdir(dir, { withFileTypes: true });
            } catch (err) {
                console.error(`读取目录失败 ${dir}:`, err);
                return;
            }
            
            for (const entry of entries) {
                if (taskId) {
                    while (tasks.get(taskId)?.state === 'paused') {
                        await new Promise(r => setTimeout(r, 500));
                    }
                    if (tasks.get(taskId)?.state === 'stopped') {
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
                            sendEvent({
                                type: 'file',
                                result: {
                                    originalName: entry.name,
                                    relativePath,
                                    timestamp,       // default best-effort time
                                    exifTime: parsedTime, // nullable
                                    mtime,           // original mtime
                                    timeSource,
                                    date: new Date(timestamp).toISOString(),
                                    parseDuration,
                                    type: isVideo ? 'video' : 'image'
                                }
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
        
        if (taskId && tasks.get(taskId)?.state === 'stopped') {
            sendEvent({ type: 'done', total: parsedCount, scanned: scannedCount, message: '扫描已终止' });
        } else {
            sendEvent({ type: 'done', total: parsedCount, scanned: scannedCount });
        }
        
        if (taskId) tasks.delete(taskId);
        res.end();

    } catch (err: any) {
        sendEvent({ type: 'error', error: err.message });
        res.end();
    }
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
      const { folderPath, syncPlan, taskId } = req.body;
      if (!folderPath || !Array.isArray(syncPlan)) {
        sendEvent({ type: 'error', error: '无效的请求参数' });
        return res.end();
      }

      if (taskId) {
          tasks.set(taskId, { state: 'running' });
      }

      let successCount = 0;
      let errorCount = 0;
      const errors = [];
      const total = syncPlan.length;
      let isStopped = false;

      for (let i = 0; i < total; i++) {
        if (taskId) {
            while (tasks.get(taskId)?.state === 'paused') {
                await new Promise(r => setTimeout(r, 500));
            }
            if (tasks.get(taskId)?.state === 'stopped') {
                isStopped = true;
                break;
            }
        }

        const item = syncPlan[i];
        try {
          const fullPath = path.join(folderPath, item.relativePath);
          const dateObj = new Date(item.targetTimestamp);
          
          await fsPromises.utimes(fullPath, dateObj, dateObj);
          successCount++;
        } catch (err: any) {
          errorCount++;
          errors.push({ path: item.relativePath, error: err.message });
        }
        
        if (i % 10 === 0 || i === total - 1) {
          sendEvent({ type: 'progress', current: i + 1, total });
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
      const { folderPath, renamePlan, taskId } = req.body;
      if (!folderPath || !Array.isArray(renamePlan)) {
        sendEvent({ type: 'error', error: '无效的请求参数' });
        return res.end();
      }

      if (taskId) {
          tasks.set(taskId, { state: 'running' });
      }

      let successCount = 0;
      let errorCount = 0;
      const errors = [];
      const total = renamePlan.length;
      let isStopped = false;

      for (let i = 0; i < total; i++) {
        if (taskId) {
            while (tasks.get(taskId)?.state === 'paused') {
                await new Promise(r => setTimeout(r, 500));
            }
            if (tasks.get(taskId)?.state === 'stopped') {
                isStopped = true;
                break;
            }
        }

        const item = renamePlan[i];
        try {
          const oldFullPath = path.join(folderPath, item.relativePath);
          const ext = path.extname(item.originalName);
          const newBaseName = item.newBaseName;
          
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
          errors.push({ path: item.relativePath, error: err.message });
        }

        if (i % 10 === 0 || i === total - 1) {
          sendEvent({ type: 'progress', current: i + 1, total });
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
