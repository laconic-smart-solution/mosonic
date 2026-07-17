export type SchedulerApiResponse<T> = {
  success: boolean;
  data: T;
  message: string | null;
  timestamp: string;
};

export type ScheduleEventType = 'SOCIAL_PUBLISH';

export type ScheduledEventRecord = {
  id: string;
  eventType: ScheduleEventType;
  refId: string;
  timezone: string;
  runAt: string;
  status: 'PENDING' | 'DISPATCHED' | 'CANCELLED' | 'FAILED';
  dispatchedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export const SCHEDULER_EVENTS_CHANNEL = 'mosonic:scheduler:events';

export type SchedulerDispatchMessage = {
  jobId: string;
  eventType: ScheduleEventType;
  refId: string;
  timezone: string;
  runAt: string;
};
