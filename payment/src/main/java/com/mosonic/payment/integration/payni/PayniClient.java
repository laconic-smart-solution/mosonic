package com.mosonic.payment.integration.payni;

import com.mosonic.payment.common.UpstreamServiceException;
import com.mosonic.payment.config.PaymentProperties;
import com.mosonic.payment.dto.RedirectPaymentResponse;
import java.math.BigDecimal;
import java.util.Map;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

@Component
@RequiredArgsConstructor
@Slf4j
public class PayniClient {

    private final RestClient.Builder restClientBuilder;
    private final PaymentProperties paymentProperties;

    public RedirectPaymentResponse createRedirectPayment(BigDecimal amount, String currencyCode) {
        PaymentProperties.Payni payni = paymentProperties.getPayni();
        String baseUrl = payni.getBaseUrl() == null ? "" : payni.getBaseUrl().trim().replaceAll("/$", "");
        String appId = payni.getAppId() == null ? "" : payni.getAppId().trim();
        String apiSecret = payni.getApiSecret() == null ? "" : payni.getApiSecret().trim();

        if (!StringUtils.hasText(baseUrl) || !StringUtils.hasText(appId) || !StringUtils.hasText(apiSecret)) {
            throw new IllegalStateException("Payni is not configured on the payment service");
        }

        String resolvedCurrency =
                StringUtils.hasText(currencyCode) ? currencyCode.trim() : payni.getCurrencyCode();
        if (!StringUtils.hasText(resolvedCurrency)) {
            resolvedCurrency = "THB";
        }

        Map<String, Object> body = Map.of(
                "id", appId,
                "apiSecret", apiSecret,
                "amount", amount,
                "currencyCode", resolvedCurrency);

        try {
            @SuppressWarnings("unchecked")
            Map<String, Object> response = restClientBuilder
                    .build()
                    .post()
                    .uri(baseUrl + "/api/external/generate-redirect-url")
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(body)
                    .retrieve()
                    .body(Map.class);

            if (response == null || response.get("transId") == null || response.get("url") == null) {
                log.error("Payni invalid response: {}", response);
                throw new UpstreamServiceException("Invalid response from Payni");
            }

            UUID transactionId = UUID.fromString(String.valueOf(response.get("transId")));
            String redirectUrl = String.valueOf(response.get("url"));
            if (!StringUtils.hasText(redirectUrl)) {
                throw new UpstreamServiceException("Invalid response from Payni");
            }
            return new RedirectPaymentResponse(transactionId, redirectUrl);
        } catch (UpstreamServiceException | IllegalArgumentException | IllegalStateException ex) {
            throw ex;
        } catch (RestClientException ex) {
            log.error("Payni createRedirectPayment failed: {}", ex.getMessage());
            throw new UpstreamServiceException("Could not start Payni payment", ex);
        } catch (Exception ex) {
            log.error("Payni createRedirectPayment failed: {}", ex.getMessage());
            throw new UpstreamServiceException("Could not start Payni payment", ex);
        }
    }
}
