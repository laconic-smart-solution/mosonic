package com.mosonic.payment.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.mosonic.payment.dto.CreateRedirectPaymentRequest;
import com.mosonic.payment.dto.RedirectPaymentResponse;
import com.mosonic.payment.integration.payni.PayniClient;
import java.math.BigDecimal;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class PaymentRedirectServiceTest {

    @Mock
    private PayniClient payniClient;

    private PaymentRedirectService service;

    @BeforeEach
    void setUp() {
        service = new PaymentRedirectService(payniClient);
    }

    @Test
    void createRedirectDelegatesToPayniClient() {
        UUID tx = UUID.randomUUID();
        when(payniClient.createRedirectPayment(any(), eq("THB")))
                .thenReturn(new RedirectPaymentResponse(tx, "https://payni.example/checkout"));

        CreateRedirectPaymentRequest request = new CreateRedirectPaymentRequest();
        request.setAmount(new BigDecimal("350.00"));
        request.setCurrencyCode("THB");

        RedirectPaymentResponse response = service.createRedirect(request);

        assertThat(response.transactionId()).isEqualTo(tx);
        assertThat(response.redirectUrl()).isEqualTo("https://payni.example/checkout");
        verify(payniClient).createRedirectPayment(new BigDecimal("350.00"), "THB");
    }

    @Test
    void createRedirectRejectsNonPositiveAmount() {
        CreateRedirectPaymentRequest request = new CreateRedirectPaymentRequest();
        request.setAmount(BigDecimal.ZERO);

        assertThatThrownBy(() -> service.createRedirect(request))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("positive");
    }

    @Test
    void createRedirectPassesNullCurrencyWhenOmitted() {
        UUID tx = UUID.randomUUID();
        when(payniClient.createRedirectPayment(any(), isNull()))
                .thenReturn(new RedirectPaymentResponse(tx, "https://payni.example/checkout"));

        CreateRedirectPaymentRequest request = new CreateRedirectPaymentRequest();
        request.setAmount(new BigDecimal("10.00"));

        service.createRedirect(request);

        verify(payniClient).createRedirectPayment(new BigDecimal("10.00"), null);
    }
}
