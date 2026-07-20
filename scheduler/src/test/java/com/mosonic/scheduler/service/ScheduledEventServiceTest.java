package com.mosonic.scheduler.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.mosonic.scheduler.config.SchedulerProperties;
import com.mosonic.scheduler.domain.ScheduleEventStatus;
import com.mosonic.scheduler.domain.ScheduleEventType;
import com.mosonic.scheduler.domain.ScheduledEventEntity;
import com.mosonic.scheduler.dto.SchedulerDispatchMessage;
import com.mosonic.scheduler.repository.ScheduledEventRepository;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class ScheduledEventServiceTest {

    @Mock
    private ScheduledEventRepository repository;

    @Mock
    private SchedulerRedisPublisher redisPublisher;

    private ScheduledEventService service;

    @BeforeEach
    void setUp() {
        SchedulerProperties properties = new SchedulerProperties();
        properties.setDefaultTimezone("UTC");
        service = new ScheduledEventService(repository, redisPublisher, properties);
    }

    @Test
    void dispatchDueClaimsAndPublishes() {
        UUID id = UUID.randomUUID();
        ScheduledEventEntity entity = new ScheduledEventEntity();
        entity.setId(id);
        entity.setEventType(ScheduleEventType.SOCIAL_PUBLISH);
        entity.setRefId("post-1");
        entity.setTimezone("UTC");
        entity.setRunAt(Instant.parse("2026-01-01T00:00:00Z"));
        entity.setStatus(ScheduleEventStatus.PENDING);

        when(repository.findByStatusAndRunAtLessThanEqualOrderByRunAtAsc(
                        eq(ScheduleEventStatus.PENDING), any(Instant.class)))
                .thenReturn(List.of(entity));
        when(repository.claimForDispatch(
                        eq(id),
                        eq(ScheduleEventStatus.PENDING),
                        eq(ScheduleEventStatus.DISPATCHED),
                        any(Instant.class)))
                .thenReturn(1);

        int count = service.dispatchDue();

        assertEquals(1, count);
        ArgumentCaptor<SchedulerDispatchMessage> captor =
                ArgumentCaptor.forClass(SchedulerDispatchMessage.class);
        verify(redisPublisher).publish(captor.capture());
        assertEquals(ScheduleEventType.SOCIAL_PUBLISH, captor.getValue().eventType());
        assertEquals("post-1", captor.getValue().refId());
        assertEquals(id, captor.getValue().jobId());
    }

    @Test
    void dispatchDueSkipsWhenClaimLosesRace() {
        UUID id = UUID.randomUUID();
        ScheduledEventEntity entity = new ScheduledEventEntity();
        entity.setId(id);
        entity.setEventType(ScheduleEventType.SOCIAL_PUBLISH);
        entity.setRefId("post-1");
        entity.setTimezone("UTC");
        entity.setRunAt(Instant.parse("2026-01-01T00:00:00Z"));
        entity.setStatus(ScheduleEventStatus.PENDING);

        when(repository.findByStatusAndRunAtLessThanEqualOrderByRunAtAsc(
                        eq(ScheduleEventStatus.PENDING), any(Instant.class)))
                .thenReturn(List.of(entity));
        when(repository.claimForDispatch(
                        eq(id),
                        eq(ScheduleEventStatus.PENDING),
                        eq(ScheduleEventStatus.DISPATCHED),
                        any(Instant.class)))
                .thenReturn(0);

        int count = service.dispatchDue();

        assertEquals(0, count);
        verify(redisPublisher, never()).publish(any());
    }
}
