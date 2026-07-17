package com.mosonic.scheduler.service;

import com.mosonic.scheduler.common.BusinessRuleException;
import com.mosonic.scheduler.common.ResourceNotFoundException;
import com.mosonic.scheduler.common.aspect.Loggable;
import com.mosonic.scheduler.config.SchedulerProperties;
import com.mosonic.scheduler.domain.ScheduleEventStatus;
import com.mosonic.scheduler.domain.ScheduleEventType;
import com.mosonic.scheduler.domain.ScheduledEventEntity;
import com.mosonic.scheduler.dto.CreateScheduledEventRequest;
import com.mosonic.scheduler.dto.RescheduleEventRequest;
import com.mosonic.scheduler.dto.ScheduledEventResponse;
import com.mosonic.scheduler.dto.SchedulerDispatchMessage;
import com.mosonic.scheduler.repository.ScheduledEventRepository;
import java.time.Instant;
import java.util.List;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

@Service
@RequiredArgsConstructor
@Slf4j
public class ScheduledEventService {

    private final ScheduledEventRepository repository;
    private final SchedulerRedisPublisher redisPublisher;
    private final SchedulerProperties properties;

    @Loggable
    @Transactional
    public ScheduledEventResponse create(CreateScheduledEventRequest request) {
        String refId = request.refId().trim();
        if (!StringUtils.hasText(refId)) {
            throw new IllegalArgumentException("refId is required");
        }
        if (request.runAt().isBefore(Instant.now())) {
            throw new BusinessRuleException("runAt must be in the future");
        }

        repository.cancelPending(
                request.eventType(),
                refId,
                ScheduleEventStatus.PENDING,
                ScheduleEventStatus.CANCELLED,
                Instant.now());

        ScheduledEventEntity entity = new ScheduledEventEntity();
        entity.setEventType(request.eventType());
        entity.setRefId(refId);
        entity.setRunAt(request.runAt());
        entity.setTimezone(resolveTimezone(request.timezone()));
        entity.setStatus(ScheduleEventStatus.PENDING);
        return ScheduledEventMapper.toResponse(repository.save(entity));
    }

    @Loggable
    @Transactional
    public ScheduledEventResponse reschedule(
            ScheduleEventType eventType, String refId, RescheduleEventRequest request) {
        String id = refId.trim();
        ScheduledEventEntity entity = repository
                .findByEventTypeAndRefIdAndStatus(eventType, id, ScheduleEventStatus.PENDING)
                .orElseThrow(() -> new ResourceNotFoundException(
                        "No PENDING scheduled event for " + eventType + "/" + id));

        if (request.runAt().isBefore(Instant.now())) {
            throw new BusinessRuleException("runAt must be in the future");
        }

        entity.setRunAt(request.runAt());
        if (StringUtils.hasText(request.timezone())) {
            entity.setTimezone(request.timezone().trim());
        }
        return ScheduledEventMapper.toResponse(repository.save(entity));
    }

    @Loggable
    @Transactional
    public void cancel(ScheduleEventType eventType, String refId) {
        int updated = repository.cancelPending(
                eventType,
                refId.trim(),
                ScheduleEventStatus.PENDING,
                ScheduleEventStatus.CANCELLED,
                Instant.now());
        if (updated == 0) {
            throw new ResourceNotFoundException(
                    "No PENDING scheduled event for " + eventType + "/" + refId.trim());
        }
    }

    @Transactional
    public int dispatchDue() {
        Instant now = Instant.now();
        List<ScheduledEventEntity> due = repository.findByStatusAndRunAtLessThanEqualOrderByRunAtAsc(
                ScheduleEventStatus.PENDING, now);
        int dispatched = 0;
        for (ScheduledEventEntity entity : due) {
            int claimed = repository.claimForDispatch(
                    entity.getId(),
                    ScheduleEventStatus.PENDING,
                    ScheduleEventStatus.DISPATCHED,
                    now);
            if (claimed != 1) {
                continue;
            }
            try {
                redisPublisher.publish(new SchedulerDispatchMessage(
                        entity.getId(),
                        entity.getEventType(),
                        entity.getRefId(),
                        entity.getTimezone(),
                        entity.getRunAt()));
                dispatched += 1;
            } catch (RuntimeException ex) {
                log.error(
                        "Failed to publish Redis event for jobId={}: {}",
                        entity.getId(),
                        ex.getMessage());
                repository.findById(entity.getId()).ifPresent(failed -> {
                    failed.setStatus(ScheduleEventStatus.FAILED);
                    failed.setDispatchedAt(null);
                    repository.save(failed);
                });
            }
        }
        return dispatched;
    }

    private String resolveTimezone(String timezone) {
        if (StringUtils.hasText(timezone)) {
            return timezone.trim();
        }
        String fallback = properties.getDefaultTimezone();
        return StringUtils.hasText(fallback) ? fallback.trim() : "UTC";
    }
}
