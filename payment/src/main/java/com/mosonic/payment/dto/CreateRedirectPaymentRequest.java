package com.mosonic.payment.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class CreateRedirectPaymentRequest {

    @NotNull
    @DecimalMin(value = "0.01", inclusive = true, message = "amount must be positive")
    @Schema(description = "Payment amount", example = "350.00")
    private BigDecimal amount;

    @Size(max = 8)
    @Schema(description = "ISO currency code; defaults to payment.payni.currency-code", example = "THB")
    private String currencyCode;
}
