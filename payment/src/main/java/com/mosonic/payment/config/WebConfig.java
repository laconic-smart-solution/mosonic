package com.mosonic.payment.config;

import com.mosonic.payment.security.PaymentApiKeyFilter;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
@EnableConfigurationProperties(PaymentProperties.class)
@RequiredArgsConstructor
public class WebConfig {

  private final PaymentApiKeyFilter paymentApiKeyFilter;

  @Bean
  FilterRegistrationBean<PaymentApiKeyFilter> paymentApiKeyFilterRegistration() {
    FilterRegistrationBean<PaymentApiKeyFilter> registration = new FilterRegistrationBean<>();
    registration.setFilter(paymentApiKeyFilter);
    registration.addUrlPatterns("/api/*");
    registration.setOrder(1);
    return registration;
  }
}
