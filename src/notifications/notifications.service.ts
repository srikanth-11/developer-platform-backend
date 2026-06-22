import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Queue } from 'bullmq';
import { Repository } from 'typeorm';
import { QUEUES } from '../queue/queue.constants';
import { Notification } from './entities/notification.entity';
import { ChannelType } from './enums/channel-type.enum';
import { NotificationStatus } from './enums/notification-status.enum';

export interface NotifyInput {
  organizationId: string | null;
  userId?: string | null;
  type: string;
  title: string;
  message: string;
  channels: ChannelType[];
  metadata?: Record<string, unknown>;
}

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepo: Repository<Notification>,
    @InjectQueue(QUEUES.NOTIFICATIONS) private readonly queue: Queue,
  ) {}

  /**
   * Fan a notification out to the requested channels: one persisted row per
   * channel, each dispatched via the queue (so a slow/failing channel retries
   * without blocking the trigger).
   */
  async notify(input: NotifyInput): Promise<{ created: number; ids: string[] }> {
    const ids: string[] = [];
    for (const channel of input.channels) {
      const notification = await this.notificationRepo.save(
        this.notificationRepo.create({
          organizationId: input.organizationId,
          userId: input.userId ?? null,
          type: input.type,
          channel,
          title: input.title,
          message: input.message,
          metadata: input.metadata ?? null,
          status: NotificationStatus.PENDING,
        }),
      );
      await this.queue.add(
        'dispatch',
        { notificationId: notification.id },
        {
          attempts: 3,
          backoff: { type: 'exponential', delay: 1000 },
          removeOnComplete: 1000,
          removeOnFail: false,
        },
      );
      ids.push(notification.id);
    }
    return { created: ids.length, ids };
  }

  findForOrg(organizationId: string, limit = 50): Promise<Notification[]> {
    return this.notificationRepo.find({
      where: { organizationId },
      order: { createdAt: 'DESC' },
      take: Math.min(limit, 200),
    });
  }
}
