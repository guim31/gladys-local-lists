// -----------------------------------------------------------------------------
// Persistence of the lists under /data (the only writable path of the
// container): one JSON file, `lists.json`, and the previous version of it,
// `lists.json.bak`.
//
// A write is atomic: the new content goes to a temporary file, flushed to
// disk, then renamed over `lists.json` (a rename never leaves half a file).
// Before that, the current file is copied to `.bak`. Writes are serialized:
// one at a time, in the order they were asked for.
//
// At start, `lists.json` is read; if it is unreadable (truncated by a full
// disk, broken by a hand edit), it is kept aside as `lists.json.corrupt` and
// the backup is read instead; if both are unusable, the integration starts
// with no list and says so in the logs. Nothing is ever deleted.
// -----------------------------------------------------------------------------

import { constants, copyFile, mkdir, open, readFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { createLogger } from '@gladysassistant/integration-sdk';
import { emptyDocument, normalizeDocument, SCHEMA_VERSION } from './lists/model.js';

const logger = createLogger({ name: 'local-lists-store' });
export const FILE_NAME = 'lists.json';

// Parse and shape errors: the file is broken. Any other error (EACCES, EIO…)
// is a problem of the disk, not of the content.
const isCorrupt = (err) => err instanceof SyntaxError || err instanceof TypeError;

export class ListStore {
  constructor(directory = process.env.LOCAL_LISTS_DATA_DIR || '/data') {
    this.directory = directory;
    this.path = join(directory, FILE_NAME);
    this.backupPath = `${this.path}.bak`;
    this.corruptPath = `${this.path}.corrupt`;
    this.writing = Promise.resolve();
    // After an unreadable lists.json, the first write must not copy it over
    // the good backup.
    this.mainUnreadable = false;
  }

  async read(path) {
    const raw = JSON.parse(await readFile(path, 'utf8'));
    if (raw && typeof raw === 'object' && Number(raw.schema) > SCHEMA_VERSION) {
      logger.warn(
        `${path} was written by a newer version (schema ${raw.schema}): reading it anyway`,
      );
    }
    return normalizeDocument(raw);
  }

  /**
   * @returns {Promise<{ document: object, source: 'file'|'backup'|'new'|'reset' }>}
   */
  async load() {
    let mainProblem = null;
    try {
      return { document: await this.read(this.path), source: 'file' };
    } catch (err) {
      if (!isCorrupt(err) && err.code !== 'ENOENT') {
        // A disk or permission error is not a broken file: never replace the
        // lists with an older backup because of it. The start fails and is
        // tried again at the next connection.
        throw err;
      }
      if (err.code !== 'ENOENT') {
        mainProblem = err;
        // A first broken file is never overwritten by a second one.
        const kept = await copyFile(this.path, this.corruptPath, constants.COPYFILE_EXCL)
          .then(() => this.corruptPath)
          .catch(() => {
            const dated = `${this.corruptPath}-${Date.now()}`;
            return copyFile(this.path, dated).then(() => dated);
          });
        this.mainUnreadable = true;
        logger.error(`Cannot read ${this.path} (${err.message}): kept as ${kept}`);
      }
    }
    try {
      const document = await this.read(this.backupPath);
      if (mainProblem) {
        logger.warn(`Lists restored from ${this.backupPath}`);
      }
      return { document, source: 'backup' };
    } catch (err) {
      if (!isCorrupt(err) && err.code !== 'ENOENT') {
        throw err;
      }
      if (err.code !== 'ENOENT') {
        logger.error(`Cannot read ${this.backupPath} either (${err.message})`);
      }
    }
    if (mainProblem) {
      logger.error('Starting with no list: the unreadable file is kept for a manual repair');
      return { document: emptyDocument(), source: 'reset' };
    }
    return { document: emptyDocument(), source: 'new' };
  }

  /**
   * Write the document; resolves once it is on disk, rejects when it could
   * not be written (the caller keeps the previous state).
   */
  save(document) {
    const content = `${JSON.stringify(document, null, 1)}\n`;
    const write = this.writing.then(() => this.write(content));
    // The next write waits for this one, failed or not.
    this.writing = write.catch(() => {});
    return write;
  }

  async write(content) {
    await mkdir(this.directory, { recursive: true });
    const temporary = `${this.path}.tmp`;
    const handle = await open(temporary, 'w');
    try {
      await handle.writeFile(content, 'utf8');
      await handle.sync();
    } finally {
      await handle.close();
    }
    if (!this.mainUnreadable) {
      await copyFile(this.path, this.backupPath).catch((err) => {
        if (err.code !== 'ENOENT') {
          throw err;
        }
      });
    }
    await rename(temporary, this.path);
    this.mainUnreadable = false;
    // Make the rename itself durable (best effort: not every file system
    // lets a directory be synced).
    const directory = await open(this.directory, 'r').catch(() => null);
    await directory
      ?.sync()
      .catch(() => {})
      .finally(() => directory.close());
  }

  /** Resolves once every write asked for so far is over. */
  flush() {
    return this.writing;
  }
}
