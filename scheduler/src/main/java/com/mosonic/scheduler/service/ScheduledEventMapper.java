package com.mosonic.scheduler.service;

import com.mosonic.scheduler.domain.ScheduledEventEntity;
import com.mosonic.scheduler.dto.ScheduledEventResponse;

final class ScheduledEventMapper {

    private ScheduledEventMapper() {}

    static ScheduledEventResponse toResponse(ScheduledEventEntity entity) {
        return new ScheduledEventResponse(
                entity.getId(),
                entity.getEventType(),
                entity.getRefId(),
                entity.getTimezone(),
                entity.getRunAt(),
                entity.getStatus(),
                entity.getDispatchedAt(),
                entity.getCreatedAt(),
                entity.getUpdatedAt());
    }
}
