package com.mosonic.payment.config;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Configuration;

@Configuration
@ConfigurationProperties(prefix = "payment")
@Getter
@Setter
public class PaymentProperties {

    private String apiKey = "";

    private Payni payni = new Payni();

    @Getter
    @Setter
    public static class Payni {
        /** Payni API base URL, e.g. https://api-payni.laconic.co.th */
        private String baseUrl = "";
        /** Payni application id (sent as `id`). */
        private String appId = "";
        /** Payni API secret. */
        private String apiSecret = "";
        /** Default currency when Nest omits currencyCode. */
        private String currencyCode = "THB";
    }
}
