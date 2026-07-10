package com.mosonic.payment.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import java.util.UUID;

@Schema(description = "Payni redirect checkout result")
public record RedirectPaymentResponse(
        @Schema(description = "Payni transaction id") UUID transactionId,
        @Schema(description = "Hosted checkout URL") String redirectUrl) {}
