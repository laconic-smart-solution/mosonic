package com.mosonic.payment.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class CreateTopupPlanRequest {

    @NotBlank
    @Size(max = 64)
    @Pattern(regexp = "^[a-z0-9]([a-z0-9-]*[a-z0-9])?$", message = "code must be a lowercase slug")
    @Schema(description = "Stable business identifier")
    private String code;

    @NotBlank
    @Size(max = 128)
    private String label;

    @Min(1)
    private int credits;

    @DecimalMin(value = "0.0", inclusive = true)
    private BigDecimal priceUsd;

    @DecimalMin(value = "0.01", inclusive = true)
    private BigDecimal priceThb;

    @Min(0)
    private int sortOrder = 0;

    private boolean active = true;
}
