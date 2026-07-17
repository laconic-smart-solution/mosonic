package com.mosonic.scheduler.dto;

import jakarta.validation.constraints.NotNull;
import java.time.Instant;

public record RescheduleEventRequest(
        @NotNull Instant runAt,
        String timezone
) {}
