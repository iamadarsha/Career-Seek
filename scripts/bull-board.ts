import dotenv from 'dotenv';
import express from 'express';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { aiQueue, documentQueue, emailQueue, scrapeQueue } from '../src/lib/queue/queues';
import { logger } from '../src/lib/logger';

dotenv.config({ path: '.env.local' });
dotenv.config();

const port = Number(process.env.BULL_BOARD_PORT || 3002);
const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/admin/queues');

createBullBoard({
  queues: [
    new BullMQAdapter(scrapeQueue),
    new BullMQAdapter(documentQueue),
    new BullMQAdapter(emailQueue),
    new BullMQAdapter(aiQueue),
  ],
  serverAdapter,
});

const app = express();
app.use('/admin/queues', serverAdapter.getRouter());
app.listen(port, '127.0.0.1', () => {
  logger.info({ port }, 'Bull Board listening at http://127.0.0.1:%s/admin/queues', port);
});
