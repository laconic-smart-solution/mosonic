package com.mosonic.scheduler.config;

import com.mosonic.scheduler.security.SchedulerApiKeyFilter;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
@RequiredArgsConstructor
public class WebConfig {

    private final SchedulerApiKeyFilter schedulerApiKeyFilter;

    @Bean
    FilterRegistrationBean<SchedulerApiKeyFilter> schedulerApiKeyFilterRegistration() {
        FilterRegistrationBean<SchedulerApiKeyFilter> registration = new FilterRegistrationBean<>();
        registration.setFilter(schedulerApiKeyFilter);
        registration.addUrlPatterns("/api/*");
        registration.setOrder(1);
        return registration;
    }
}
