package com.mosonic.payment.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import java.math.BigDecimal;
import java.time.Instant;

public record TopupPlanResponse(
        @Schema(description = "Stable business identifier") String code,
        @Schema(description = "Display label") String label,
        @Schema(description = "Credits granted on purchase") int credits,
        @Schema(description = "Informational USD price") BigDecimal priceUsd,
        @Schema(description = "THB amount charged via payment provider") BigDecimal priceThb,
        @Schema(description = "Sort order in UI lists") int sortOrder,
        @Schema(description = "Whether plan is offered to users") boolean active,
        Instant createdAt,
        Instant updatedAt) {}
