package com.mosonic.scheduler.dto;

import com.mosonic.scheduler.domain.ScheduleEventStatus;
import com.mosonic.scheduler.domain.ScheduleEventType;
import java.time.Instant;
import java.util.UUID;

public record ScheduledEventResponse(
        UUID id,
        ScheduleEventType eventType,
        String refId,
        String timezone,
        Instant runAt,
        ScheduleEventStatus status,
        Instant dispatchedAt,
        Instant createdAt,
        Instant updatedAt
) {}
