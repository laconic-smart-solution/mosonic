package com.mosonic.payment.config;

import com.mosonic.payment.security.PaymentApiKeyFilter;
import java.time.Duration;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

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

  @Bean
  RestClient.Builder restClientBuilder() {
    SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
    requestFactory.setConnectTimeout(Duration.ofSeconds(10));
    requestFactory.setReadTimeout(Duration.ofSeconds(30));
    return RestClient.builder().requestFactory(requestFactory);
  }
}
