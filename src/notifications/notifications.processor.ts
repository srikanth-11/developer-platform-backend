import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Job } from 'bullmq';
import { Repository } from 'typeorm';
import { QUEUES } from '../queue/queue.constants';
import { Notification } from './entities/notification.entity';
import { NotificationStatus } from './enums/notification-status.enum';
import { NotificationDispatcher } from './notification-dispatcher.service';

/**
 * NotificationsProcessor — the worker that actually delivers each notification
 * via its channel adapter. On failure it throws so BullMQ retries; persistent
 * failures end up in the queue's failed set (same pattern as webhooks).
 */
@Processor(QUEUES.NOTIFICATIONS)
export class NotificationsProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationsProcessor.name);

  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepo: Repository<Notification>,
    private readonly dispatcher: NotificationDispatcher,
  ) {
    super();
  }

  async process(job: Job<{ notificationId: string }>): Promise<void> {
    const notification = await this.notificationRepo.findOne({
      where: { id: job.data.notificationId },
    });
    if (!notification || notification.status === NotificationStatus.SENT) return;

    try {
      await this.dispatcher.dispatch(notification);
      notification.status = NotificationStatus.SENT;
      notification.sentAt = new Date();
      notification.lastError = null;
      await this.notificationRepo.save(notification);
    } catch (err) {
      notification.status = NotificationStatus.FAILED;
      notification.lastError = (err as Error).message;
      await this.notificationRepo.save(notification);
      throw err; // retry
    }
  }
}
