import fs from 'fs/promises';

/**
 * 极速提取 JPEG 照片的 EXIF DateTimeOriginal
 * 仅读取文件头部（默认最多 64KB），避免将整张照片加载到内存中，防止 OOM。
 * 针对数十万张照片的场景进行了极致优化，支持流式异步读取。
 */
export async function parseJpegExifTime(filePath: string): Promise<Date | null> {
  let filehandle: fs.FileHandle | null = null;
  try {
    filehandle = await fs.open(filePath, 'r');
    const buffer = Buffer.alloc(65536); // 读取前 64KB，通常 EXIF 信息在这个范围内
    const { bytesRead } = await filehandle.read(buffer, 0, 65536, 0);

    if (bytesRead < 2 || buffer[0] !== 0xFF || buffer[1] !== 0xD8) {
      return null; // 不是有效的 JPEG
    }

    let offset = 2;
    while (offset < bytesRead) {
      if (buffer[offset] !== 0xFF) break;
      
      const marker = buffer[offset + 1];
      const length = buffer.readUInt16BE(offset + 2);

      if (marker === 0xE1) { // APP1 Marker (EXIF)
        const exifHeader = buffer.toString('ascii', offset + 4, offset + 8);
        if (exifHeader === 'Exif') {
          return extractExifDate(buffer, offset + 10, length - 8);
        }
      }
      
      offset += length + 2;
    }
    return null;
  } catch (error) {
    // 忽略读取错误，针对大批量处理必须容错
    return null;
  } finally {
    if (filehandle) {
      await filehandle.close();
    }
  }
}

function extractExifDate(buffer: Buffer, tiffOffset: number, maxLen: number): Date | null {
  // 解析 TIFF Header (II or MM)
  const byteOrder = buffer.toString('ascii', tiffOffset, tiffOffset + 2);
  const isLittleEndian = byteOrder === 'II';
  
  const readUInt16 = (offset: number) => isLittleEndian ? buffer.readUInt16LE(offset) : buffer.readUInt16BE(offset);
  const readUInt32 = (offset: number) => isLittleEndian ? buffer.readUInt32LE(offset) : buffer.readUInt32BE(offset);

  const ifd0Offset = readUInt32(tiffOffset + 4);
  const exifIfdOffset = findExifIfdOffset(buffer, tiffOffset, tiffOffset + ifd0Offset, readUInt16, readUInt32);
  
  if (!exifIfdOffset) return null;

  // 0x9003 是 DateTimeOriginal 标签
  return parseIfdForDate(buffer, tiffOffset, tiffOffset + exifIfdOffset, 0x9003, readUInt16, readUInt32);
}

function findExifIfdOffset(buffer: Buffer, tiffOffset: number, ifdOffset: number, readUInt16: (o: number) => number, readUInt32: (o: number) => number): number | null {
  const numEntries = readUInt16(ifdOffset);
  for (let i = 0; i < numEntries; i++) {
    const entryOffset = ifdOffset + 2 + i * 12;
    const tag = readUInt16(entryOffset);
    if (tag === 0x8769) { // ExifOffset 标签
      return readUInt32(entryOffset + 8);
    }
  }
  return null;
}

function parseIfdForDate(buffer: Buffer, tiffOffset: number, ifdOffset: number, targetTag: number, readUInt16: (o: number) => number, readUInt32: (o: number) => number): Date | null {
  const numEntries = readUInt16(ifdOffset);
  for (let i = 0; i < numEntries; i++) {
    const entryOffset = ifdOffset + 2 + i * 12;
    const tag = readUInt16(entryOffset);
    if (tag === targetTag) {
      const valueOffset = readUInt32(entryOffset + 8);
      const dateStr = buffer.toString('ascii', tiffOffset + valueOffset, tiffOffset + valueOffset + 19);
      // 格式: "YYYY:MM:DD HH:mm:ss"
      const parts = dateStr.match(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})$/);
      if (parts) {
        return new Date(`${parts[1]}-${parts[2]}-${parts[3]}T${parts[4]}:${parts[5]}:${parts[6]}`);
      }
    }
  }
  return null;
}

/**
 * 极速提取 MP4/MOV 视频的 moov/mvhd 创建时间
 * 通过跳过不相关的 box（特别是 mdat 音视频数据区），实现毫秒级解析，极低内存占用。
 * 完美解决处理 GB 级别视频时的 OOM 问题。
 */
export async function parseMp4CreationTime(filePath: string): Promise<Date | null> {
  let filehandle: fs.FileHandle | null = null;
  try {
    filehandle = await fs.open(filePath, 'r');
    const stat = await filehandle.stat();
    const fileSize = stat.size;
    
    let offset = 0;
    const headerBuffer = Buffer.alloc(8);

    while (offset < fileSize) {
      const { bytesRead } = await filehandle.read(headerBuffer, 0, 8, offset);
      if (bytesRead < 8) break;

      let boxSize = headerBuffer.readUInt32BE(0);
      const boxType = headerBuffer.toString('ascii', 4, 8);

      if (boxSize === 1) { // 64-bit large box 支持
        const largeSizeBuffer = Buffer.alloc(8);
        await filehandle.read(largeSizeBuffer, 0, 8, offset + 8);
        boxSize = Number(largeSizeBuffer.readBigUInt64BE(0));
        
        if (boxType === 'moov') {
          offset += 16;
          continue;
        }
      }

      if (boxType === 'moov') {
        offset += 8; // 进入 moov 内部，继续寻找 mvhd
        continue;
      }

      if (boxType === 'mvhd') {
        // 读取 mvhd 内容，包含版本和时间戳
        const mvhdBuffer = Buffer.alloc(Math.min(boxSize - 8, 100)); // 只读关键头部，防止 box 过大
        await filehandle.read(mvhdBuffer, 0, mvhdBuffer.length, offset + 8);
        const version = mvhdBuffer[0];
        
        let creationTimeSec: number;
        if (version === 1) {
          // Version 1 采用 64 位时间戳
          creationTimeSec = Number(mvhdBuffer.readBigUInt64BE(4));
        } else {
          // Version 0 采用 32 位时间戳
          creationTimeSec = mvhdBuffer.readUInt32BE(4);
        }

        // Mac OS (MP4/MOV) epoch time 从 1904-01-01T00:00:00Z 开始计算
        const macEpoch = new Date('1904-01-01T00:00:00Z').getTime();
        const date = new Date(macEpoch + creationTimeSec * 1000);
        return date;
      }

      // 如果不是目标 box，直接跳过整个 box 的大小，避免读取内容
      offset += boxSize;
    }
    
    return null;
  } catch (error) {
    return null;
  } finally {
    if (filehandle) {
      await filehandle.close();
    }
  }
}

// ==============
// 使用测试用例
// ==============
/*
async function test() {
  const photoDate = await parseJpegExifTime('./test.jpg');
  console.log('Photo Date:', photoDate);

  const videoDate = await parseMp4CreationTime('./test.mp4');
  console.log('Video Date:', videoDate);
}
test();
*/
