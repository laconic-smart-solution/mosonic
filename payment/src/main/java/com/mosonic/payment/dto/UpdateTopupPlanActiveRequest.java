package com.mosonic.payment.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotNull;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class UpdateTopupPlanActiveRequest {

    @NotNull
    @Schema(description = "Enable or disable the plan for user catalog")
    private Boolean active;
}
