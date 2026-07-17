package com.mosonic.scheduler.config;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "scheduler")
@Getter
@Setter
public class SchedulerProperties {

    private String apiKey = "";

    private String redisChannel = "mosonic:scheduler:events";

    private long pollIntervalMs = 5000;

    private String defaultTimezone = "UTC";
}
