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

/**
 * 解析图片时间 (提取 EXIF DateTimeOriginal)
 */
async function parseImageTime(filePath: string): Promise<number> {
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
        
        throw new Error("EXIF 中未找到 DateTimeOriginal");
    } catch (error: any) {
        console.warn(`[图片解析警告] ${filePath} - ${error.message}，将使用系统修改时间(mtime)`);
        try {
            const stats = await fsPromises.stat(filePath);
            return Math.round(stats.mtimeMs);
        } catch (statError: any) {
            console.warn(`[致命警告] 无法获取系统时间: ${statError.message}`);
            return Date.now();
        }
    } finally {
        if (fd) {
            await fd.close();
        }
    }
}

/**
 * 解析视频时间 (提取 creation_time)
 */
function parseVideoTime(filePath: string): Promise<number> {
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
                
                throw new Error("视频元数据中未找到有效的 creation_time");
            } catch (error: any) {
                console.warn(`[视频解析警告] ${filePath} - ${error.message}，将使用系统修改时间(mtime)`);
                try {
                    const stats = await fsPromises.stat(filePath);
                    resolve(Math.round(stats.mtimeMs));
                } catch (statError: any) {
                    console.warn(`[致命警告] 无法获取系统时间: ${statError.message}`);
                    resolve(Date.now());
                }
            }
        });
    });
}

async function startServer() {
  const app = express();
  // AI Studio 沙箱环境带有 DISABLE_HMR=true，强制使用 3000 端口以保证预览正常
  // 下载到本地后默认使用 3002 端口，也可以通过 PORT 环境变量指定
  const isAIStudio = process.env.DISABLE_HMR === 'true';
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : (isAIStudio ? 3000 : 3002);

  // Make sure uploads directory exists
  if (!fs.existsSync('uploads')) {
      fs.mkdirSync('uploads');
  }

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

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
        const folderPath = req.body.folderPath;

        if (!folderPath || typeof folderPath !== 'string') {
            sendEvent({ type: 'error', error: '请提供有效的文件夹路径。' });
            return res.end();
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

        async function scanDirectoryStream(dir: string, baseDir: string) {
            let entries;
            try {
                entries = await fsPromises.readdir(dir, { withFileTypes: true });
            } catch (err) {
                console.error(`读取目录失败 ${dir}:`, err);
                return;
            }
            
            for (const entry of entries) {
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
                            let timestamp;
                            
                            if (isVideo) {
                                timestamp = await parseVideoTime(fullPath);
                            } else {
                                timestamp = await parseImageTime(fullPath);
                            }
                            
                            const parseDuration = Date.now() - startTime;
                            parsedCount++;
                            sendEvent({
                                type: 'file',
                                result: {
                                    originalName: entry.name,
                                    relativePath,
                                    timestamp,
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
        sendEvent({ type: 'done', total: parsedCount, scanned: scannedCount });
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
      
      if (isUploaded) {
          fs.unlink(filePath, (err) => {
              if (err) console.error("清理临时文件失败:", err);
          });
      }
      
      res.json({ timestamp, date: new Date(timestamp).toISOString(), originalName, parseDuration });
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
