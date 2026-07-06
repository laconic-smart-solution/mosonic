package com.mosonic.payment.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class UpdateTopupPlanRequest {

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
    private int sortOrder;

    private boolean active;
}
