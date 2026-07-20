package com.mosonic.payment.service;

import com.mosonic.payment.dto.CreateRedirectPaymentRequest;
import com.mosonic.payment.dto.RedirectPaymentResponse;
import com.mosonic.payment.integration.payni.PayniClient;
import java.math.BigDecimal;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

@Service
@RequiredArgsConstructor
public class PaymentRedirectService {

    private final PayniClient payniClient;

    public RedirectPaymentResponse createRedirect(CreateRedirectPaymentRequest request) {
        BigDecimal amount = request.getAmount();
        if (amount == null || amount.compareTo(BigDecimal.ZERO) <= 0) {
            throw new IllegalArgumentException("Payment amount must be positive");
        }
        String currency =
                StringUtils.hasText(request.getCurrencyCode()) ? request.getCurrencyCode().trim() : null;
        return payniClient.createRedirectPayment(amount, currency);
    }
}
