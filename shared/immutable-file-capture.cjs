'use strict';

const { createHash } = require('node:crypto');
const { constants } = require('node:fs');
const nativeFileSystem = require('node:fs/promises');

const COPY_CHUNK_BYTES = 1024 * 1024;
const NO_FOLLOW = constants.O_NOFOLLOW || 0;

function captureFailure(cause) {
  const error = new Error('immutable file capture failed');
  error.code = 'IMMUTABLE_FILE_CAPTURE_FAILED';
  error.cause = cause;
  return error;
}

function validBound(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function regularMetadata(metadata, minBytes, maxBytes) {
  return metadata && metadata.isFile() && !metadata.isSymbolicLink() &&
    Number.isSafeInteger(metadata.size) && metadata.size >= minBytes && metadata.size <= maxBytes;
}

function sameIdentity(left, right) {
  if (!left || !right || left.dev !== right.dev || left.ino !== right.ino) return false;
  if (left.dev !== 0 || left.ino !== 0) return true;
  return left.birthtimeMs === right.birthtimeMs && left.ctimeMs === right.ctimeMs;
}

async function digestHandle(handle, size) {
  const digest = createHash('sha256');
  const buffer = Buffer.allocUnsafe(Math.min(COPY_CHUNK_BYTES, Math.max(size, 1)));
  let position = 0;
  while (position < size) {
    const requested = Math.min(buffer.length, size - position);
    const { bytesRead } = await handle.read(buffer, 0, requested, position);
    if (!Number.isSafeInteger(bytesRead) || bytesRead < 1 || bytesRead > requested) {
      throw captureFailure();
    }
    digest.update(buffer.subarray(0, bytesRead));
    position += bytesRead;
  }
  return digest.digest('hex');
}

async function readHandle(handle, size, maxBufferBytes) {
  if (!validBound(maxBufferBytes) || size > maxBufferBytes) throw captureFailure();
  const bytes = Buffer.alloc(size);
  let position = 0;
  while (position < size) {
    const { bytesRead } = await handle.read(bytes, position, size - position, position);
    if (!Number.isSafeInteger(bytesRead) || bytesRead < 1 || bytesRead > size - position) {
      throw captureFailure();
    }
    position += bytesRead;
  }
  return bytes;
}

async function writeAll(handle, bytes, position) {
  let offset = 0;
  while (offset < bytes.length) {
    const { bytesWritten } = await handle.write(bytes, offset, bytes.length - offset, position + offset);
    if (!Number.isSafeInteger(bytesWritten) || bytesWritten < 1 || bytesWritten > bytes.length - offset) {
      throw captureFailure();
    }
    offset += bytesWritten;
  }
}

async function captureImmutableRegularFile(filePath, {
  fileSystem = nativeFileSystem,
  maxBytes = Number.MAX_SAFE_INTEGER,
  minBytes = 1,
} = {}) {
  if (typeof filePath !== 'string' || filePath.length < 1 ||
      !validBound(minBytes) || !validBound(maxBytes) || minBytes > maxBytes ||
      typeof fileSystem?.lstat !== 'function' || typeof fileSystem?.open !== 'function') {
    throw captureFailure();
  }

  let handle = null;
  try {
    const beforeOpen = await fileSystem.lstat(filePath);
    if (!regularMetadata(beforeOpen, minBytes, maxBytes)) throw captureFailure();

    handle = await fileSystem.open(filePath, constants.O_RDONLY | NO_FOLLOW);
    const opened = await handle.stat();
    const afterOpen = await fileSystem.lstat(filePath);
    if (!regularMetadata(opened, minBytes, maxBytes) ||
        !regularMetadata(afterOpen, minBytes, maxBytes) ||
        !sameIdentity(beforeOpen, opened) || !sameIdentity(opened, afterOpen) ||
        beforeOpen.size !== opened.size || opened.size !== afterOpen.size) {
      throw captureFailure();
    }

    const sha256 = await digestHandle(handle, opened.size);
    let closed = false;
    const identity = Object.freeze({
      birthtimeMs: opened.birthtimeMs,
      ctimeMs: opened.ctimeMs,
      dev: opened.dev,
      ino: opened.ino,
      size: opened.size,
    });

    const close = async () => {
      if (closed) return;
      await handle.close();
      closed = true;
    };

    const capture = {
      identity,
      sha256,
      size: opened.size,
      async close() {
        await close();
      },
      async materialize(targetPath) {
        if (closed || typeof targetPath !== 'string' || targetPath.length < 1) throw captureFailure();
        let targetHandle = null;
        try {
          targetHandle = await fileSystem.open(
            targetPath,
            constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | NO_FOLLOW,
            0o600,
          );
          const buffer = Buffer.allocUnsafe(Math.min(COPY_CHUNK_BYTES, Math.max(opened.size, 1)));
          let position = 0;
          while (position < opened.size) {
            const requested = Math.min(buffer.length, opened.size - position);
            const { bytesRead } = await handle.read(buffer, 0, requested, position);
            if (!Number.isSafeInteger(bytesRead) || bytesRead < 1 || bytesRead > requested) {
              throw captureFailure();
            }
            await writeAll(targetHandle, buffer.subarray(0, bytesRead), position);
            position += bytesRead;
          }
          await targetHandle.sync();
          const targetMetadata = await targetHandle.stat();
          if (!regularMetadata(targetMetadata, minBytes, maxBytes) || targetMetadata.size !== opened.size) {
            throw captureFailure();
          }
          await targetHandle.close();
          targetHandle = null;
        } catch (error) {
          throw error?.code === 'IMMUTABLE_FILE_CAPTURE_FAILED' ? error : captureFailure(error);
        } finally {
          await targetHandle?.close().catch(() => {});
        }

        const staged = await captureImmutableRegularFile(targetPath, {
          fileSystem,
          maxBytes,
          minBytes,
        });
        if (staged.size !== opened.size || staged.sha256 !== sha256) {
          await staged.close().catch(() => {});
          throw captureFailure();
        }
        return staged;
      },
      async readBytes(maxBufferBytes = maxBytes) {
        if (closed) throw captureFailure();
        return readHandle(handle, opened.size, maxBufferBytes);
      },
      async revalidate() {
        if (closed) throw captureFailure();
        const observed = await captureImmutableRegularFile(filePath, {
          fileSystem,
          maxBytes,
          minBytes,
        });
        try {
          if (!sameIdentity(identity, observed.identity) ||
              identity.size !== observed.identity.size || observed.sha256 !== sha256) {
            throw captureFailure();
          }
        } finally {
          await observed.close().catch(() => {});
        }
      },
    };
    return Object.freeze(capture);
  } catch (error) {
    await handle?.close().catch(() => {});
    throw error?.code === 'IMMUTABLE_FILE_CAPTURE_FAILED' ? error : captureFailure(error);
  }
}

module.exports = Object.freeze({ captureImmutableRegularFile });
