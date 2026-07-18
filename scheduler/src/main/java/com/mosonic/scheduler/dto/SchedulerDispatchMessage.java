package com.mosonic.scheduler.dto;

import com.mosonic.scheduler.domain.ScheduleEventType;
import java.time.Instant;
import java.util.UUID;

public record SchedulerDispatchMessage(
        UUID jobId,
        ScheduleEventType eventType,
        String refId,
        String timezone,
        Instant runAt
) {}
