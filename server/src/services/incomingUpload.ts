import type { IncomingMessage } from 'node:http';
import type { WriteStream } from 'node:fs';
import Busboy from 'busboy';
import { createOpaqueId } from '../utils/ids.js';
import type { ObjectStore, UploadWriter } from './objectStore.js';

export type ReceivedUpload = {
  fields: Record<string, string>;
  file: { id: string; size: number; originalName: string } | null;
  tooLarge: boolean;
  aborted: boolean;
};

export function receiveUpload(req: IncomingMessage, store: ObjectStore, roomId: string, maxBytes: number): Promise<ReceivedUpload> {
  return new Promise((resolve, reject) => {
    const fields: Record<string, string> = {};
    let writer: UploadWriter | null = null;
    let fileId = '';
    let originalName = 'arquivo';
    let sawFile = false;
    let tooLarge = false;
    let aborted = false;
    let settled = false;

    const finish = (result: ReceivedUpload) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      writer?.discard();
      reject(error);
    };

    req.on('aborted', () => {
      aborted = true;
      writer?.discard();
      writer = null;
    });

    let busboy: ReturnType<typeof Busboy>;
    try {
      busboy = Busboy({
        headers: req.headers,
        limits: { files: 1, fields: 6, fileSize: maxBytes, fieldSize: 2000 },
      });
    } catch (error) {
      reject(error);
      return;
    }

    busboy.on('field', (name: string, value: string) => {
      if (fields[name] === undefined) fields[name] = value;
    });

    busboy.on('file', (_name: string, stream: NodeJS.ReadableStream, info: { filename: string }) => {
      sawFile = true;
      fileId = createOpaqueId();
      originalName = info.filename || 'arquivo';
      try {
        writer = store.begin(roomId, fileId);
      } catch (error) {
        stream.resume();
        fail(error);
        return;
      }
      const target = writer;
      stream.on('limit', () => {
        tooLarge = true;
      });
      stream.on('error', () => target.discard());
      stream.pipe(target.stream);
    });

    busboy.on('error', (error: unknown) => {
      if (aborted || req.aborted) {
        writer?.discard();
        finish({ fields, file: null, tooLarge, aborted: true });
        return;
      }
      fail(error);
    });

    busboy.on('finish', () => {
      void (async () => {
        if (aborted || req.aborted) {
          writer?.discard();
          finish({ fields, file: null, tooLarge, aborted: true });
          return;
        }
        if (!sawFile || !writer) {
          finish({ fields, file: null, tooLarge, aborted: false });
          return;
        }
        try {
          await waitForClose(writer.stream);
        } catch (error) {
          fail(error);
          return;
        }
        if (tooLarge) {
          writer.discard();
          finish({ fields, file: null, tooLarge: true, aborted: false });
          return;
        }
        try {
          const size = writer.commit();
          finish({ fields, file: { id: fileId, size, originalName }, tooLarge: false, aborted: false });
        } catch (error) {
          fail(error);
        }
      })();
    });

    req.pipe(busboy);
  });
}

function waitForClose(stream: WriteStream): Promise<void> {
  if (stream.closed) return Promise.resolve();
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      stream.removeListener('close', onClose);
      stream.removeListener('error', onError);
      if (error) reject(error);
      else resolve();
    };
    const onClose = () => finish();
    const onError = (error: Error) => finish(error);
    stream.on('close', onClose);
    stream.on('error', onError);
  });
}
