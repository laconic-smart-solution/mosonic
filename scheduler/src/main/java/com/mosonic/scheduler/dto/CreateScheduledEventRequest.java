package com.mosonic.scheduler.dto;

import com.mosonic.scheduler.domain.ScheduleEventType;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.time.Instant;

public record CreateScheduledEventRequest(
        @NotNull ScheduleEventType eventType,
        @NotBlank String refId,
        @NotNull Instant runAt,
        String timezone
) {}
