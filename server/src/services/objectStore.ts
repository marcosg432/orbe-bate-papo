import fs from 'node:fs';
import path from 'node:path';
import { isOpaqueId } from '../utils/ids.js';

export type ObjectStore = {
  begin(roomId: string, fileId: string): UploadWriter;
  open(roomId: string, fileId: string): { stream: fs.ReadStream; size: number } | null;
  location(roomId: string, fileId: string): string;
  remove(roomId: string, fileId: string): void;
};

export type UploadWriter = {
  stream: fs.WriteStream;
  discard: () => void;
  commit: () => number;
};

export class LocalObjectStore implements ObjectStore {
  constructor(private readonly root: string) {
    fs.mkdirSync(root, { recursive: true });
    sweepPartials(root);
  }

  begin(roomId: string, fileId: string): UploadWriter {
    const partial = this.partialPath(roomId, fileId);
    fs.mkdirSync(path.dirname(partial), { recursive: true });
    const stream = fs.createWriteStream(partial, { flags: 'wx' });
    return {
      stream,
      discard: () => {
        stream.destroy();
        fs.rmSync(partial, { force: true });
      },
      commit: () => {
        const finalPath = this.finalPath(roomId, fileId);
        fs.renameSync(partial, finalPath);
        return fs.statSync(finalPath).size;
      },
    };
  }

  open(roomId: string, fileId: string): { stream: fs.ReadStream; size: number } | null {
    const finalPath = this.safePath(roomId, fileId, false);
    if (!fs.existsSync(finalPath)) return null;
    const size = fs.statSync(finalPath).size;
    return { stream: fs.createReadStream(finalPath), size };
  }

  location(roomId: string, fileId: string): string {
    return this.finalPath(roomId, fileId);
  }

  remove(roomId: string, fileId: string): void {
    fs.rmSync(this.finalPath(roomId, fileId), { force: true });
    fs.rmSync(this.partialPath(roomId, fileId), { force: true });
  }

  private finalPath(roomId: string, fileId: string): string {
    return this.safePath(roomId, fileId, false);
  }

  private partialPath(roomId: string, fileId: string): string {
    return this.safePath(roomId, fileId, true);
  }

  private safePath(roomId: string, fileId: string, partial: boolean): string {
    if (!isOpaqueId(roomId) || !isOpaqueId(fileId)) {
      throw new Error('Identificador de arquivo inválido.');
    }
    const name = partial ? `${fileId}.partial` : fileId;
    const root = path.resolve(this.root);
    const target = path.resolve(root, roomId, name);
    const relative = path.relative(root, target);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new Error('Caminho de arquivo inválido.');
    }
    return target;
  }
}

export function storageKey(roomId: string, fileId: string): string {
  return `${roomId}/${fileId}`;
}

function sweepPartials(root: string): void {
  if (!fs.existsSync(root)) return;
  for (const room of fs.readdirSync(root)) {
    if (!isOpaqueId(room)) continue;
    const directory = path.join(root, room);
    let stats: fs.Stats;
    try {
      stats = fs.statSync(directory);
    } catch {
      continue;
    }
    if (!stats.isDirectory()) continue;
    for (const name of fs.readdirSync(directory)) {
      if (name.endsWith('.partial')) fs.rmSync(path.join(directory, name), { force: true });
    }
  }
}
