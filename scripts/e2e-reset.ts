/** Cross-platform reset of the E2E test database (replaces `rm -f` shell usage). */
import { rmSync } from 'node:fs';
import { join } from 'node:path';

const base = join(process.cwd(), 'data', 'clickdown_test.db');
for (const suffix of ['', '-shm', '-wal']) {
  rmSync(base + suffix, { force: true });
}
