package com.mosonic.scheduler.repository;

import com.mosonic.scheduler.domain.ScheduleEventStatus;
import com.mosonic.scheduler.domain.ScheduleEventType;
import com.mosonic.scheduler.domain.ScheduledEventEntity;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ScheduledEventRepository extends JpaRepository<ScheduledEventEntity, UUID> {

    Optional<ScheduledEventEntity> findByEventTypeAndRefIdAndStatus(
            ScheduleEventType eventType, String refId, ScheduleEventStatus status);

    List<ScheduledEventEntity> findByStatusAndRunAtLessThanEqualOrderByRunAtAsc(
            ScheduleEventStatus status, Instant runAt);

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("""
            UPDATE ScheduledEventEntity e
               SET e.status = :dispatched,
                   e.dispatchedAt = :now,
                   e.updatedAt = :now
             WHERE e.id = :id
               AND e.status = :pending
            """)
    int claimForDispatch(
            @Param("id") UUID id,
            @Param("pending") ScheduleEventStatus pending,
            @Param("dispatched") ScheduleEventStatus dispatched,
            @Param("now") Instant now);

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("""
            UPDATE ScheduledEventEntity e
               SET e.status = :cancelled,
                   e.updatedAt = :now
             WHERE e.eventType = :eventType
               AND e.refId = :refId
               AND e.status = :pending
            """)
    int cancelPending(
            @Param("eventType") ScheduleEventType eventType,
            @Param("refId") String refId,
            @Param("pending") ScheduleEventStatus pending,
            @Param("cancelled") ScheduleEventStatus cancelled,
            @Param("now") Instant now);
}
