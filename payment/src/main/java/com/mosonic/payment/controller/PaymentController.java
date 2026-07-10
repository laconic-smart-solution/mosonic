package com.mosonic.payment.controller;

import com.mosonic.payment.common.ApiResponse;
import com.mosonic.payment.dto.CreateRedirectPaymentRequest;
import com.mosonic.payment.dto.RedirectPaymentResponse;
import com.mosonic.payment.service.PaymentRedirectService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/payments")
@RequiredArgsConstructor
@Tag(name = "Payments")
public class PaymentController {

    private final PaymentRedirectService paymentRedirectService;

    @PostMapping("/redirect")
    @Operation(summary = "Create a Payni hosted checkout redirect")
    public ApiResponse<RedirectPaymentResponse> createRedirect(
            @RequestBody @Valid CreateRedirectPaymentRequest request) {
        return ApiResponse.ok(paymentRedirectService.createRedirect(request));
    }
}
